import {createHash, createPublicKey, verify} from 'node:crypto';
import {mkdir, open, readFile, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {UpdateState} from '../../src/shared';

export interface UpdateConfig {manifestUrl:string; publicKey:string; allowedHosts:string[];}
const version=z.string().max(32).regex(/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/);
const manifestSchema=z.object({schema:z.literal(1),version,platform:z.literal('win32'),arch:z.literal('x64'),url:z.string().url(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().min(1).max(1_500_000_000),notes:z.string().max(12000)}).strict();
export type ReleaseManifest=z.infer<typeof manifestSchema>;
export function newerVersion(candidate:string,current:string){
 const a=version.parse(candidate).split('.').map(Number),b=version.parse(current).split('.').map(Number);
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;
}
export function updateUrl(raw:string,config:UpdateConfig){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!config.allowedHosts.includes(u.hostname))throw new Error('Origem da atualização não autorizada.');
 return u;
}
export function verifyRelease(raw:unknown,config:UpdateConfig):ReleaseManifest{
 const envelope=z.object({payload:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(40000),signature:z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(100)}).strict().parse(raw);
 const key=createPublicKey(config.publicKey);if(key.asymmetricKeyType!=='ed25519')throw new Error('Chave de atualização inválida.');
 const bytes=Buffer.from(envelope.payload,'base64');
 if(!verify(null,bytes,key,Buffer.from(envelope.signature,'base64')))throw new Error('Assinatura da atualização inválida.');
 const release=manifestSchema.parse(JSON.parse(bytes.toString('utf8')));updateUrl(release.url,config);
 return release;
}
async function limitedBody(response:Response,limit:number){
 if(!response.body)throw new Error('Resposta de atualização vazia.');
 const chunks:Buffer[]=[];let bytes=0;
 for await(const chunk of response.body as any){const b=Buffer.from(chunk);bytes+=b.length;if(bytes>limit)throw new Error('Resposta de atualização maior que o limite.');chunks.push(b);}
 return Buffer.concat(chunks);
}
export class Updates {
 state:UpdateState; private release?:ReleaseManifest; private destination?:string; private controller?:AbortController; private busy=false;
 constructor(private config:UpdateConfig,private current:string,private root:string,private changed:(s:UpdateState)=>void,private fetcher:typeof fetch=globalThis.fetch,private platform=process.platform,private arch=process.arch){
  const configured=!!config.manifestUrl&&!!config.publicKey&&config.allowedHosts.length>0;
  this.state={state:configured&&platform==='win32'&&arch==='x64'?'idle':'unconfigured',received:0,total:0,message:!configured?'O canal oficial de atualizações ainda não foi publicado.':platform!=='win32'||arch!=='x64'?'Atualizações integradas disponíveis inicialmente no Windows x64.':'Consulte novas versões do Vsync.'};
 }
 private patch(fields:Partial<UpdateState>){Object.assign(this.state,fields);this.changed({...this.state});}
 private async request(raw:string,signal:AbortSignal){
  let current=updateUrl(raw,this.config).href;
  for(let i=0;i<6;i++){
   const response=await this.fetcher(current,{redirect:'manual',signal,headers:{'User-Agent':'VsyncClient/'+this.current,'Cache-Control':'no-cache'}});
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw new Error('Redirecionamento de atualização sem destino.');current=updateUrl(new URL(location,current).href,this.config).href;continue;}
   if(!response.ok)throw new Error('Não foi possível consultar a atualização (HTTP '+response.status+').');return response;
  }throw new Error('Muitos redirecionamentos de atualização.');
 }
 async check(){
  if(this.state.state==='unconfigured')return {...this.state};
  if(this.busy||this.state.state==='ready'||this.state.state==='installing')return {...this.state};
  this.busy=true;this.patch({state:'checking',message:'Consultando a versão mais recente…',error:undefined});
  try{
   const response=await this.request(this.config.manifestUrl,AbortSignal.timeout(30000));
   const release=verifyRelease(JSON.parse((await limitedBody(response,64000)).toString('utf8')),this.config);
   this.release=undefined;this.destination=undefined;
   const available=newerVersion(release.version,this.current);if(available)this.release=release;
   this.patch({state:available?'available':'current',version:available?release.version:undefined,notes:available?release.notes:undefined,checkedAt:new Date().toISOString(),received:0,total:available?release.bytes:0,message:available?'Vsync '+release.version+' está disponível.':'Você está usando a versão mais recente.'});
  }catch(e){this.patch({state:'error',error:(e as Error).message,message:'Não foi possível verificar as atualizações.'});}
  finally{this.busy=false;}return {...this.state};
 }
 async download(){
  if(this.busy)throw new Error('Uma atualização já está em andamento.');
  const release=this.release;if(!release||!newerVersion(release.version,this.current))throw new Error('Consulte uma atualização antes de baixar.');
  this.busy=true;this.controller=new AbortController();
  const destination=path.join(this.root,'updates','Vsync-Client-Setup-'+release.version+'.exe'),temp=destination+'.part';
  this.patch({state:'downloading',received:0,total:release.bytes,error:undefined,message:'Baixando Vsync '+release.version+'…'});
  try{
   await mkdir(path.dirname(destination),{recursive:true});
   const response=await this.request(release.url,AbortSignal.any([this.controller.signal,AbortSignal.timeout(900000)]));
   if(!response.body)throw new Error('Download da atualização sem conteúdo.');
   const declared=response.headers.get('content-length');if(declared&&Number(declared)!==release.bytes)throw new Error('O tamanho da atualização não confere.');
   const file=await open(temp,'w'),digest=createHash('sha256');let received=0,last=0;
   try{for await(const chunk of response.body as any){this.controller.signal.throwIfAborted();const b=Buffer.from(chunk);received+=b.length;if(received>release.bytes)throw new Error('Atualização maior que o tamanho assinado.');digest.update(b);await file.write(b);if(Date.now()-last>150){last=Date.now();this.patch({received});}}}finally{await file.close();}
   this.controller.signal.throwIfAborted();
   if(received!==release.bytes||digest.digest('hex')!==release.sha256)throw new Error('A integridade da atualização falhou. O arquivo foi descartado.');
   await rename(temp,destination);this.destination=destination;
   this.patch({state:'ready',received,total:received,message:'Atualização verificada. Será instalada automaticamente quando o Minecraft e os downloads estiverem fechados.'});
  }catch(e){await rm(temp,{force:true});this.destination=undefined;this.patch({state:this.controller.signal.aborted?'available':'error',error:this.controller.signal.aborted?undefined:(e as Error).message,message:this.controller.signal.aborted?'Download cancelado.':'Não foi possível baixar a atualização.'});}
  finally{this.busy=false;this.controller=undefined;}return {...this.state};
 }
 cancel(){this.controller?.abort();}
 installationStarted(){this.patch({state:'installing',error:undefined,message:'Instalando a atualização. O Vsync será reiniciado automaticamente…'});}
 installationFailed(error:string){this.patch({state:'ready',error,message:'A atualização está pronta. A instalação automática foi adiada; você também pode tentar novamente pelo botão abaixo.'});}
 async installer(){
  if(this.platform!=='win32'||this.arch!=='x64'||this.state.state!=='ready'||!this.destination||!this.release)throw new Error('Nenhuma atualização está pronta para instalar.');
  const bytes=await readFile(this.destination);
  if(bytes.length!==this.release.bytes||createHash('sha256').update(bytes).digest('hex')!==this.release.sha256){this.patch({state:'error',error:'O instalador foi alterado. Baixe novamente.',message:'Verificação do instalador falhou.'});throw new Error(this.state.error);}
  return this.destination;
 }
}
