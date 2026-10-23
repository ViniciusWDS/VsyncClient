import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {Socket} from 'node:net';
import {DiscordPresence,discordFrame} from '../electron/core/discord';
import {DEFAULT_SETTINGS,type Snapshot} from '../src/shared';

class TestSocket extends EventEmitter {
 destroyed=false;written:Buffer[]=[];
 write(bytes:Buffer){this.written.push(Buffer.from(bytes));return true;}
 destroy(){if(!this.destroyed){this.destroyed=true;queueMicrotask(()=>this.emit('close'));}return this;}
 end(){return this.destroy();}
}
function fixture(){
 const snapshot={settings:{...DEFAULT_SETTINGS,discord:true,discordClientId:'123456789012345678'},game:{state:'idle'},profiles:[],selectedProfileId:''} as unknown as Snapshot;
 const sockets:TestSocket[]=[];
 const presence=new DiscordPresence(()=>snapshot,()=>{},['test-discord-ipc'],()=>{const socket=new TestSocket();sockets.push(socket);return socket as unknown as Socket;});
 return{snapshot,sockets,presence};
}
function ready(socket:TestSocket){socket.emit('connect');socket.emit('data',discordFrame(1,{cmd:'DISPATCH',evt:'READY',data:{v:1}}));}

test('Discord reconecta mesmo quando a conexão anterior termina no meio de um frame',async t=>{
 let now=1_000_000;t.mock.method(Date,'now',()=>now);
 const f=fixture();
 try{
  const first=f.presence.sync();ready(f.sockets[0]);await first;assert.equal(f.presence.state.status,'connected');
  f.sockets[0].emit('data',discordFrame(1,{evt:null}).subarray(0,4));
  f.sockets[0].destroy();await Promise.resolve();now+=30001;
  const reconnect=f.presence.sync();assert.equal(f.sockets.length,2);ready(f.sockets[1]);await reconnect;
  assert.equal(f.presence.state.status,'connected','Um frame incompleto de outro socket não pode contaminar o novo READY.');
 }finally{f.presence.stop();}
});

test('Discord PONG devolve exatamente os bytes recebidos no PING',async()=>{
 const f=fixture();
 try{
  const connected=f.presence.sync();ready(f.sockets[0]);await connected;
  const ping=Buffer.from('{ "nonce" : "keep whitespace" }'),header=Buffer.alloc(8);header.writeUInt32LE(3);header.writeUInt32LE(ping.length,4);
  f.sockets[0].emit('data',Buffer.concat([header,ping]));
  const pong=f.sockets[0].written.find(frame=>frame.readUInt32LE(0)===4);
  assert.ok(pong,'O cliente precisa responder ao PING.');assert.deepEqual(pong.subarray(8),ping);
 }finally{f.presence.stop();}
});

test('Ocultar presença cancela handshake antes de publicar qualquer atividade',async()=>{
 const f=fixture();
 try{
  const connecting=f.presence.sync();f.snapshot.settings.hidePresence=true;await f.presence.sync();
  ready(f.sockets[0]);await connecting;
  assert.equal(f.sockets[0].written.some(frame=>frame.readUInt32LE(0)===1&&JSON.parse(frame.subarray(8).toString()).cmd==='SET_ACTIVITY'),false);
  assert.equal(f.presence.state.status,'hidden');
 }finally{f.presence.stop();}
});

test('Remover Application ID durante handshake preserva o estado sem configuração',async()=>{
 const f=fixture();
 try{
  const connecting=f.presence.sync();f.snapshot.settings.discordClientId='';await f.presence.sync();
  ready(f.sockets[0]);await connecting;
  assert.equal(f.presence.state.status,'unconfigured');
 }finally{f.presence.stop();}
});

test('Ocultar presença conectada limpa a atividade imediatamente mesmo durante o intervalo de envio',async()=>{
 const f=fixture();
 try{
  const connected=f.presence.sync();ready(f.sockets[0]);await connected;
  f.snapshot.settings.hidePresence=true;await f.presence.sync();
  const frame=f.sockets[0].written.at(-1)!;const payload=JSON.parse(frame.subarray(8).toString());
  assert.equal(payload.cmd,'SET_ACTIVITY');assert.equal(payload.args.activity,null);assert.equal(f.presence.state.status,'hidden');
 }finally{f.presence.stop();}
});
