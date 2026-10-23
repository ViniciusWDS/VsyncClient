import {Socket} from 'node:net';
import {resolveSrv} from 'node:dns/promises';
export function parseServer(address:string){const m=address.trim().match(/^([a-zA-Z0-9_.-]+)(?::(\d{1,5}))?$/);if(!m||m[2]&&(Number(m[2])<1||Number(m[2])>65535))throw new Error('Use endereço ou endereço:porta (1 a 65535).');return{host:m[1],port:Number(m[2]??25565),explicit:!!m[2]};}
function vint(n:number){const bytes=[];do{let b=n&127;n>>>=7;if(n)b|=128;bytes.push(b);}while(n);return Buffer.from(bytes);}
function readVar(b:Buffer,offset=0){let n=0,shift=0;for(let i=offset;i<b.length&&i<offset+5;i++){n|=(b[i]&127)<<shift;if(!(b[i]&128))return{value:n,length:i-offset+1};shift+=7;}return null;}
export async function pingServer(address:string):Promise<{online:boolean;latency?:number;players?:number;max?:number;version?:string;message?:string}>{
 const parsed=parseServer(address);let {host,port}=parsed;
 if(!parsed.explicit){try{const entries=await resolveSrv('_minecraft._tcp.'+host);entries.sort((a,b)=>a.priority-b.priority);if(entries[0]){host=entries[0].name;port=entries[0].port;}}catch{}}
 return new Promise(resolve=>{const socket=new Socket();const start=Date.now();let buffer=Buffer.alloc(0),done=false;
  const finish=(value:any)=>{if(done)return;done=true;socket.destroy();resolve(value);};
  socket.setTimeout(4000);socket.on('timeout',()=>finish({online:false,message:'Tempo de resposta esgotado'}));socket.on('error',()=>finish({online:false,message:'Servidor indisponível'}));
  socket.connect(port,host,()=>{const hostname=Buffer.from(parsed.host);const portBuffer=Buffer.alloc(2);portBuffer.writeUInt16BE(port);const handshake=Buffer.concat([vint(0),vint(767),vint(hostname.length),hostname,portBuffer,vint(1)]);socket.write(Buffer.concat([vint(handshake.length),handshake,Buffer.from([1,0])]));});
  socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>1_000_000){finish({online:false,message:'Resposta excessiva'});return;}const size=readVar(buffer);if(!size||buffer.length<size.length+size.value)return;try{const packet=readVar(buffer,size.length);if(!packet||packet.value!==0)throw Error();const length=readVar(buffer,size.length+packet.length);if(!length)throw Error();const data=JSON.parse(buffer.subarray(size.length+packet.length+length.length).toString());finish({online:true,latency:Date.now()-start,players:data.players?.online,max:data.players?.max,version:data.version?.name});}catch{finish({online:false,message:'Resposta de status não reconhecida'});}});
 });
}
