import {createConnection,type Socket} from 'node:net';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Snapshot,DiscordState} from '../../src/shared';

const MAX_FRAME=65536;
export function discordFrame(op:number,payload:unknown){
 const data=Buffer.isBuffer(payload)?payload:Buffer.from(JSON.stringify(payload)),header=Buffer.alloc(8);
 header.writeUInt32LE(op);header.writeUInt32LE(data.length,4);return Buffer.concat([header,data]);
}
export function discordEndpoints(platform=process.platform,env=process.env){
 const bases=platform==='win32'?['\\\\?\\pipe']:Array.from(new Set([env.XDG_RUNTIME_DIR,env.TMPDIR,env.TMP,env.TEMP,'/tmp'].filter((s):s is string=>!!s)));
 return bases.flatMap(base=>Array.from({length:10},(_,i)=>platform==='win32'?base+'\\discord-ipc-'+i:path.join(base,'discord-ipc-'+i)));
}
export function discordActivity(snapshot:Snapshot,started:number){
 if(!snapshot.settings.discord||snapshot.settings.hidePresence)return null;
 const playing=snapshot.game.state==='running';
 const profile=snapshot.profiles.find(p=>p.id===(snapshot.game.profileId||snapshot.selectedProfileId));
 return {type:0,details:playing?'Jogando Minecraft '+(profile?.gameVersion??'Java Edition'):'No Vsync Client',
  state:playing?'Perfil '+(profile?.name??'Minecraft').slice(0,100):snapshot.game.state==='preparing'?'Preparando o Minecraft':'Explorando mods e perfis',timestamps:{start:started}};
}

/** Discord IPC only: the public application ID suffices for SET_ACTIVITY. No user token. */
export class DiscordPresence {
 private socket?:Socket;private ready=false;private connecting=false;
 private clientId='';private lastActivity='';private lastSent=0;private retryAt=0;private stopped=false;private connectingSocket?:Socket;
 private activityKey='';private started=Math.floor(Date.now()/1000);
 state:DiscordState={status:'disabled',message:'Ative a presença do Vsync no Discord.'};
 constructor(private snapshot:()=>Snapshot,private changed:(state:DiscordState)=>void,private endpoints=discordEndpoints(),private connect:(endpoint:string)=>Socket=endpoint=>createConnection(endpoint)){}
 private patch(status:DiscordState['status'],message:string){if(this.state.status===status&&this.state.message===message)return;this.state={status,message};this.changed({...this.state});}
 private disconnect(){this.ready=false;this.lastActivity='';this.socket?.destroy();this.socket=undefined;this.connectingSocket?.destroy();this.connectingSocket=undefined;}
 async sync(){
  if(this.stopped)return;
  const snapshot=this.snapshot(),id=snapshot.settings.discordClientId;
  if(!snapshot.settings.discord||snapshot.settings.hidePresence){
   if(this.ready)this.send(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity:null},nonce:randomUUID()});
   const socket=this.socket;this.socket=undefined;this.ready=false;this.lastActivity='';socket?.end();this.connectingSocket?.destroy();
   this.patch(snapshot.settings.hidePresence?'hidden':'disabled',snapshot.settings.hidePresence?'Sua presença está oculta.':'Presença do Discord desativada.');return;
  }
  if(!/^\d{17,20}$/.test(id)){this.disconnect();this.patch('unconfigured','Informe o Application ID público do Vsync no Discord.');return;}
  if(id!==this.clientId){this.disconnect();this.retryAt=0;this.clientId=id;}
  const key=snapshot.game.state+'|'+snapshot.game.profileId;
  if(key!==this.activityKey){this.activityKey=key;this.started=Math.floor(Date.now()/1000);}
  if(this.ready){this.publish();return;}
  if(this.connecting||Date.now()<this.retryAt)return;
  this.connecting=true;this.patch('connecting','Conectando ao Discord desktop…');
  try{
   for(const endpoint of this.endpoints){
    if(this.stopped||!this.snapshot().settings.discord||this.snapshot().settings.hidePresence||this.snapshot().settings.discordClientId!==id)return;
    try{await this.open(endpoint,id);return;}catch{this.disconnect();}
   }
   if(this.stopped||!this.snapshot().settings.discord||this.snapshot().settings.hidePresence||this.snapshot().settings.discordClientId!==id)return;
   this.retryAt=Date.now()+30000;this.patch('disconnected','Abra o Discord desktop. A conexão será tentada novamente.');
  }finally{this.connecting=false;}
 }
 private open(endpoint:string,id:string){return new Promise<void>((resolve,reject)=>{
  const socket=this.connect(endpoint);this.connectingSocket=socket;let complete=false;let timer:ReturnType<typeof setTimeout>;let buffer:Buffer=Buffer.alloc(0);
  const fail=()=>{if(!complete){complete=true;clearTimeout(timer);reject(new Error('Discord IPC indisponível.'));}else if(this.socket===socket){this.ready=false;this.socket=undefined;this.retryAt=Date.now()+30000;this.patch('disconnected','Discord desconectado. A conexão será tentada novamente.');}};
  timer=setTimeout(()=>{socket.destroy();fail();},2000);timer.unref();
  socket.on('error',fail);socket.on('close',fail);
  socket.once('connect',()=>socket.write(discordFrame(0,{v:1,client_id:id})));
  socket.on('data',chunk=>{
   try{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=8){
     const op=buffer.readUInt32LE(0),size=buffer.readUInt32LE(4);
     if(size>MAX_FRAME)throw new Error('Frame Discord excede o limite.');
     if(buffer.length<8+size)break;
     const bytes=buffer.subarray(8,8+size);buffer=buffer.subarray(8+size);
     if(op===3){socket.write(discordFrame(4,bytes));continue;}
     if(op===2)throw new Error('Discord encerrou a conexão.');
     if(op!==1)continue;
     const payload=JSON.parse(bytes.toString('utf8'));
     if(payload.evt==='ERROR')throw new Error('Discord recusou a presença.');
     if(payload.evt==='READY'&&!complete){
      if(this.stopped||!this.snapshot().settings.discord||this.snapshot().settings.hidePresence||this.snapshot().settings.discordClientId!==id)throw new Error('Conexão cancelada.');
      complete=true;clearTimeout(timer);this.socket=socket;this.connectingSocket=undefined;this.ready=true;this.lastActivity='';this.lastSent=0;
      this.patch('connected','Presença sincronizada com o Discord desktop.');this.publish();resolve();
     }
    }
   }catch{socket.destroy();fail();}
  });
 });}
 private send(op:number,payload:unknown){if(this.socket&&!this.socket.destroyed)this.socket.write(discordFrame(op,payload));}
 private publish(){
  const activity=discordActivity(this.snapshot(),this.started),serialized=JSON.stringify(activity);
  if(serialized===this.lastActivity||Date.now()-this.lastSent<15000)return;
  this.send(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity},nonce:randomUUID()});this.lastActivity=serialized;this.lastSent=Date.now();
 }
 stop(){this.stopped=true;this.disconnect();}
}
