import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import type {DownloadTask} from '../../src/shared';
import {redact} from './safety';
let fetcher:typeof fetch=globalThis.fetch;
export function setFetch(fn:typeof fetch){fetcher=fn;}
export class ServiceError extends Error {
 constructor(readonly status:number,readonly host:string,readonly code?:string,readonly providerCode?:number){super(status===429?'O serviço limitou as consultas. Tente novamente em alguns minutos.':`O serviço ${host} retornou HTTP ${status}.`);this.name='ServiceError';}
}
export function checkUrl(raw:string,kind:'metadata'|'file'='file'):URL {
 const u=new URL(raw);
 const allowed=['mojang.com','minecraft.net','microsoftonline.com','live.com','xboxlive.com','minecraftservices.com','fabricmc.net','quiltmc.org','modrinth.com','adoptium.net','github.com','githubusercontent.com','objects.githubusercontent.com','release-assets.githubusercontent.com','piston-data.mojang.com','resources.download.minecraft.net','libraries.minecraft.net','maven.neoforged.net','files.minecraftforge.net'];
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!allowed.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))throw new Error('Origem de download não permitida: '+u.hostname);
 return u;
}
export async function request(url:string,init:RequestInit={}):Promise<Response>{
 checkUrl(url); let current=url;
 for(let i=0;i<6;i++){
  const response=await fetcher(current,{...init,redirect:'manual',signal:init.signal??AbortSignal.timeout(45000),headers:{'User-Agent':'VsyncClient/0.1.0 (independent Minecraft launcher)',...init.headers}});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw new Error('Redirecionamento sem destino.');current=new URL(location,current).href;checkUrl(current); if(new URL(url).origin!==new URL(current).origin&&init.headers&&Object.keys(init.headers).some(k=>k.toLowerCase()==='authorization'))throw new Error('Redirecionamento autenticado bloqueado.');continue;}
  if(!response.ok){
   // Keep error identifiers only, never response bodies or provider tokens.
   let detail:any={};try{if(response.body){const reader=response.body.getReader();const bytes:Uint8Array[]=[];let size=0;try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8192)break;bytes.push(next.value);}if(size<=8192)detail=JSON.parse(Buffer.concat(bytes).toString('utf8'));}finally{await reader.cancel();}}}catch{}
   const code=typeof detail.error==='string'&&/^[a-z_]{1,80}$/i.test(detail.error)?detail.error:undefined;
   const numeric=Number.isSafeInteger(detail.XErr)?detail.XErr:Number.isSafeInteger(detail.error_codes?.[0])?detail.error_codes[0]:undefined;
   throw new ServiceError(response.status,new URL(current).hostname,code,numeric);
  }
  return response;
 } throw new Error('Muitos redirecionamentos no download.');
}
export async function json<T=any>(url:string,init:RequestInit={}):Promise<T>{const r=await request(url,init);const text=await r.text();if(text.length>30_000_000)throw new Error('Resposta maior que o limite permitido.');return JSON.parse(text);}
export interface Job {task:DownloadTask;signal:AbortSignal;progress:(received:number,total:number,detail:string)=>void;file:(url:string,destination:string,hash?:{algorithm:string;value:string},size?:number)=>Promise<void>;}
export class Downloads {
 tasks:DownloadTask[]=[]; private jobs=new Map<string,{run:(j:Job)=>Promise<void>;controller:AbortController}>();private active=false;
 constructor(private changed:()=>void,private logger:(s:string)=>void){}
 enqueue(name:string,run:(j:Job)=>Promise<void>):string {
  const id=randomUUID();this.tasks.unshift({id,name,status:'queued',received:0,total:0,speed:0,detail:'Na fila',canRetry:true,canPause:false});this.jobs.set(id,{run,controller:new AbortController()});this.changed();void this.pump();return id;
 }
 cancel(id:string){const task=this.tasks.find(t=>t.id===id);if(!task||!['queued','running'].includes(task.status))return;this.jobs.get(id)?.controller.abort();task.status='cancelled';task.detail='Cancelado';this.changed();}
 retry(id:string){const task=this.tasks.find(t=>t.id===id);const job=this.jobs.get(id);if(!task||!job||!['cancelled','error'].includes(task.status))throw new Error('Esta tarefa não pode ser repetida.');job.controller=new AbortController();task.status='queued';task.error=undefined;task.received=0;this.changed();void this.pump();}
 private async pump(){
  if(this.active)return;this.active=true;
  try {for(;;){const task=[...this.tasks].reverse().find(t=>t.status==='queued');if(!task)break;const job=this.jobs.get(task.id)!;task.status='running';let last=Date.now(),lastReceived=0;this.changed();
   const progress=(received:number,total:number,detail:string)=>{task.received=received;task.total=total;task.detail=detail;const now=Date.now();if(now-last>300){task.speed=Math.max(0,(received-lastReceived)*1000/(now-last));last=now;lastReceived=received;this.changed();}};
   try {await job.run({task,signal:job.controller.signal,progress,file:(url,dest,hash,size)=>this.file(url,dest,job.controller.signal,hash,size,progress)});job.controller.signal.throwIfAborted();task.status='completed';task.received=task.total;task.detail='Concluído';task.speed=0;this.logger(task.name+': concluído.');}
   catch(e){task.status=job.controller.signal.aborted?'cancelled':'error';task.error=job.controller.signal.aborted?undefined:redact(e instanceof Error?e.message:String(e));task.detail=task.error??'Cancelado';this.logger(task.name+': '+task.detail);}
   this.changed();
  }}finally{this.active=false;}
 }
 async file(url:string,dest:string,signal:AbortSignal,hash?:{algorithm:string;value:string},size?:number,progress?:(r:number,t:number,d:string)=>void){
  checkUrl(url);signal.throwIfAborted();
  try{if(hash){const old=await readFile(dest);if(createHash(hash.algorithm).update(old).digest('hex')===hash.value.toLowerCase())return;}}catch{}
  await mkdir(path.dirname(dest),{recursive:true});const temp=dest+'.part';
  const {open}=await import('node:fs/promises');
  try {
   const res=await request(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(600_000)])});const total=Number(res.headers.get('content-length'))||size||0;
   if(total>4_000_000_000)throw new Error('O arquivo excede o limite de 4 GB.');
   const file=await open(temp,'w');let received=0;const digest=createHash(hash?.algorithm??'sha512');
   try {if(!res.body)throw new Error('Download sem conteúdo.');for await (const chunk of res.body as any){signal.throwIfAborted();const b=Buffer.from(chunk);received+=b.length;if(received>4_000_000_000)throw new Error('Arquivo muito grande.');digest.update(b);await file.write(b);progress?.(received,total,path.basename(dest));}}
   finally{await file.close();}
   if(size&&received!==size)throw new Error('O tamanho do arquivo não confere. Repita o download.');
   if(hash&&digest.digest('hex')!==hash.value.toLowerCase())throw new Error('A verificação de integridade falhou. O arquivo foi descartado.');
   await rename(temp,dest);
  }catch(e){await rm(temp,{force:true});throw e;}
 }
}
