import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Socket} from 'node:net';
import {randomUUID} from 'node:crypto';
import {DiscordPresence,discordActivity,discordFrame,discordEndpoints} from '../electron/core/discord';
import {Store} from '../electron/core/store';

async function until(check:()=>boolean){const end=Date.now()+3000;while(!check()){if(Date.now()>end)throw new Error('Timeout no IPC de teste.');await new Promise(r=>setTimeout(r,10));}}
function fixture(){const snapshot=new Store('unused',false).state;snapshot.settings.discord=true;snapshot.settings.discordClientId='123456789012345678';return snapshot;}

test('Presença usa somente dados públicos do jogo e respeita privacidade e modo oficial',()=>{
 const s=fixture();s.game={state:'running',profileId:s.profiles[0].id};
 const playing=discordActivity(s,123)!;assert.match(playing.details,/Jogando Minecraft/);assert.deepEqual(playing.timestamps,{start:123});
 s.settings.hidePresence=true;assert.equal(discordActivity(s,123),null);s.settings.hidePresence=false;s.settings.discord=false;assert.equal(discordActivity(s,123),null);
 s.settings.discord=true;s.settings.launchMode='official';s.game.state='idle';s.official.status='handoff';assert.equal(discordActivity(s,123)?.details,'No Vsync Client');
 s.accounts=[{id:'private-id',name:'private-name',uuid:'private-uuid',expiresAt:0}];s.servers=[{id:'private-server',address:'private.example.com',name:'private',profileId:s.profiles[0].id,favorite:false}];
 assert.doesNotMatch(JSON.stringify(discordActivity(s,123)),/private-id|private-name|private-uuid|private.example.com/);
 assert.equal(discordEndpoints('win32')[0],'\\\\?\\pipe\\discord-ipc-0');
});

test('Discord IPC faz handshake, processa frames fragmentados/ping e limpa presença imediatamente',async()=>{
 const endpoint=process.platform==='win32'?'\\\\?\\pipe\\vsync-test-'+randomUUID():'/tmp/vsync-test-'+randomUUID();
 const connections:Socket[]=[],messages:any[]=[];
 const server=createServer(socket=>{connections.push(socket);let buffer=Buffer.alloc(0);socket.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=8){const op=buffer.readUInt32LE(),size=buffer.readUInt32LE(4);if(buffer.length<8+size)return;const payload=JSON.parse(buffer.subarray(8,8+size).toString());buffer=buffer.subarray(8+size);messages.push({op,payload});
   if(op===0){const frame=discordFrame(1,{evt:'READY',data:{v:1}});socket.write(frame.subarray(0,3));socket.write(frame.subarray(3));socket.write(discordFrame(3,{ping:'fixture'}));}
  }
 });});
 await new Promise<void>(r=>server.listen(endpoint,r));
 const s=fixture(),presence=new DiscordPresence(()=>s,()=>{},[endpoint]);
 try{
  await presence.sync();await until(()=>messages.some(m=>m.payload.cmd==='SET_ACTIVITY')&&messages.some(m=>m.op===4));
  assert.equal(messages[0].op,0);assert.equal(messages[0].payload.client_id,s.settings.discordClientId);assert.equal(presence.state.status,'connected');
  assert.equal(messages.filter(m=>m.payload.cmd==='SET_ACTIVITY').length,1);await presence.sync();assert.equal(messages.filter(m=>m.payload.cmd==='SET_ACTIVITY').length,1);
  s.settings.hidePresence=true;await presence.sync();await until(()=>messages.some(m=>m.payload.cmd==='SET_ACTIVITY'&&m.payload.args.activity===null));assert.equal(presence.state.status,'hidden');
 }finally{presence.stop();connections.forEach(s=>s.destroy());await new Promise<void>(r=>server.close(()=>r()));}
});

test('Discord desativado ou sem Application ID não conecta nem solicita token',async()=>{
 const s=fixture();let calls=0;const p=new DiscordPresence(()=>s,()=>{},[],()=>{calls++;throw new Error('Não deveria conectar');});
 s.settings.discord=false;await p.sync();assert.equal(p.state.status,'disabled');s.settings.discord=true;s.settings.discordClientId='';await p.sync();assert.equal(p.state.status,'unconfigured');assert.equal(calls,0);p.stop();
});
