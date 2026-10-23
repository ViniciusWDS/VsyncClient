import path from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {open,readFile,writeFile,rename,rm,mkdir,lstat} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import type {Store} from './store';
import {json,request,type Downloads,type Job} from './network';
import {mavenPath,safeChild} from './safety';
import type {OfficialState,Profile} from '../../src/shared';

export const PROFILE_FILES=['launcher_profiles.json','launcher_profiles_microsoft_store.json'] as const;
export type OfficialTarget={kind:'exe';path:string}|{kind:'store';appId:string};
export interface OfficialHost {platform:string;env:NodeJS.ProcessEnv;storeApp:()=>Promise<string|undefined>;running:()=>Promise<boolean>;launch:(target:OfficialTarget)=>Promise<void>;}
const execute=promisify(execFile);
export function officialRoot(env:NodeJS.ProcessEnv=process.env){return env.APPDATA?path.join(env.APPDATA,'.minecraft'):'';}
export function officialProfileId(id:string){if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Perfil inválido.');return 'vsync-'+id.replaceAll('-','');}
export function validStoreApp(id:string){return /^Microsoft\.4297127D64EC6_[A-Za-z0-9]+![A-Za-z0-9._-]+$/.test(id);}
export function nativeOfficialHost():OfficialHost {
 const windows=process.env.SystemRoot||'C:\\Windows';
 const ps=async(script:string)=>{const r=await execute(path.join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:12000,maxBuffer:262144,encoding:'utf8'});return r.stdout.trim();};
 return{platform:process.platform,env:process.env,
  storeApp:async()=>{
   const raw=await ps("$ErrorActionPreference='Stop'; @(Get-StartApps | Where-Object { $_.AppID -match '^Microsoft\\.4297127D64EC6_[A-Za-z0-9]+![A-Za-z0-9._-]+$' } | Select-Object -ExpandProperty AppID -Unique) | ConvertTo-Json -Compress");
   if(!raw)return;const result=JSON.parse(raw),ids=(Array.isArray(result)?result:[result]).filter((v:unknown)=>typeof v==='string'&&validStoreApp(v));if(ids.length===1)return ids[0];if(ids.length>1)throw new Error('Mais de um aplicativo Minecraft Launcher foi encontrado. Selecione o executável nas configurações.');
  },
  running:async()=>Number(await ps("@(Get-Process -Name MinecraftLauncher -ErrorAction SilentlyContinue).Count"))>0,
  launch:async target=>{
   if(target.kind==='store'&&!validStoreApp(target.appId))throw new Error('Aplicativo Windows não autorizado.');
   const executable=target.kind==='store'?path.join(windows,'explorer.exe'):target.path;
   const args=target.kind==='store'?['shell:AppsFolder\\'+target.appId]:[];
   await new Promise<void>((resolve,reject)=>{const child=spawn(executable,args,{shell:false,windowsHide:true,detached:true,stdio:'ignore'});child.once('error',()=>reject(new Error('Não foi possível abrir o Minecraft Launcher. Confira a instalação ou selecione o executável.')));child.once('spawn',()=>{child.unref();resolve();});});
  }
 };
}
export async function checkLauncherExecutable(file:string){
 if(!path.isAbsolute(file)||path.basename(file).toLowerCase()!=='minecraftlauncher.exe')throw new Error('Selecione MinecraftLauncher.exe da instalação oficial. O instalador MinecraftInstaller.exe não é o launcher.');
 const info=await lstat(file);if(!info.isFile()||info.isSymbolicLink())throw new Error('Selecione um executável instalado, sem link simbólico.');
 const f=await open(file,'r');try{const header=Buffer.alloc(2);await f.read(header,0,2,0);if(header.toString()!=='MZ')throw new Error('O arquivo selecionado não é um executável Windows.');}finally{await f.close();}
}
export async function discoverOfficial(settings:{officialLauncherPath:string},host:OfficialHost):Promise<OfficialTarget|undefined>{
 if(host.platform!=='win32')return;
 if(settings.officialLauncherPath){await checkLauncherExecutable(settings.officialLauncherPath);return{kind:'exe',path:settings.officialLauncherPath};}
 try{const appId=await host.storeApp();if(appId){if(!validStoreApp(appId))throw new Error('Identificador de launcher inválido.');return{kind:'store',appId};}}catch{}
 const roots=[host.env['ProgramFiles(x86)'],host.env.ProgramFiles,host.env.LOCALAPPDATA&&path.join(host.env.LOCALAPPDATA,'Programs')].filter(Boolean) as string[];
 for(const root of roots){const file=path.join(root,'Minecraft Launcher','MinecraftLauncher.exe');try{await checkLauncherExecutable(file);return{kind:'exe',path:file};}catch{}}
}
type DocumentFile={file:string;bytes:Buffer;value:Record<string,any>};
function object(value:unknown):value is Record<string,any>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
async function readDocument(file:string):Promise<DocumentFile>{
 const info=await lstat(file);if(info.isSymbolicLink()||!info.isFile()||info.size>8_000_000)throw new Error('Arquivo de instalações inválido ou maior que 8 MB.');
 const bytes=await readFile(file);let value:unknown;try{value=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw new Error('O arquivo de instalações do Minecraft não pôde ser lido. Ele foi preservado.');}
 if(!object(value)||value.profiles!==undefined&&!object(value.profiles))throw new Error('Formato de instalações desconhecido. O arquivo original foi preservado.');
 return{file,bytes,value};
}
export async function profileDocuments(root:string){
 if(!root||!path.isAbsolute(root))throw new Error('Selecione a pasta .minecraft do launcher oficial em Configurações > Contas.');
 const documents:DocumentFile[]=[];
 for(const name of PROFILE_FILES){const file=path.join(root,name);try{documents.push(await readDocument(file));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
 if(!documents.length)throw new Error('Abra o Minecraft Launcher, entre na sua conta e feche-o antes de preparar o perfil. Se usa uma pasta personalizada, selecione a pasta correta em Configurações > Contas.');
 return documents;
}
function sameDirectory(a:string,b:string){return path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();}
export function mergeOfficialProfile(value:Record<string,any>,p:Profile,gameDir:string,versionId:string){
 const result=structuredClone(value),id=officialProfileId(p.id);result.profiles??={};
 const existing=result.profiles[id];
 if(existing&&(!object(existing)||typeof existing.gameDir!=='string'||!sameDirectory(existing.gameDir,gameDir)))throw new Error('Já existe uma entrada Vsync apontando para outra pasta. A configuração oficial foi preservada.');
 if(p.jvmArgs.some(a=>/[\r\n\0"']/.test(a)||/\s/.test(a)))throw new Error('Neste modo, use argumentos Java sem espaços ou aspas; ajuste os demais diretamente na instalação do Minecraft Launcher.');
 const now=new Date().toISOString();
 result.profiles[id]={...existing,name:'Vsync • '+p.name,type:'custom',created:existing?.created??now,lastUsed:existing?.lastUsed??now,lastVersionId:versionId,gameDir,javaArgs:[`-Xms${Math.min(1024,p.ram)}M`,`-Xmx${p.ram}M`,...p.jvmArgs].join(' '),resolution:{width:p.width,height:p.height},icon:p.image||'Grass'};
 if(p.javaPath)result.profiles[id].javaDir=p.javaPath;else delete result.profiles[id].javaDir;
 return result;
}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
type Edit={file:string;before?:Buffer;after:Buffer;};
async function current(file:string){try{return await readFile(file);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}}
async function commit(root:string,edits:Edit[]){
 const changed=edits.filter(e=>!e.before||!e.before.equals(e.after));
 if(!changed.length)return[];
 for(const e of edits){const now=await current(e.file);if((now&&digest(now))!==(e.before&&digest(e.before)))throw new Error('O Minecraft Launcher alterou as instalações durante a preparação. Feche-o e tente novamente.');}
 const backupDir=path.join(root,'vsync-profile-backups',Date.now()+'-'+randomUUID().slice(0,8));const backups:string[]=[];
 for(const e of changed){await mkdir(path.dirname(e.file),{recursive:true});if(e.before){await mkdir(backupDir,{recursive:true});const b=path.join(backupDir,path.basename(e.file));await writeFile(b,e.before,{flag:'wx',mode:0o600});backups.push(b);}}
 const completed:Edit[]=[];
 try{
  for(const e of changed){const now=await current(e.file);if((now&&digest(now))!==(e.before&&digest(e.before)))throw new Error('As instalações foram alteradas por outro processo. Feche o launcher oficial e tente novamente.');const temp=e.file+'.vsync-'+randomUUID()+'.tmp';try{await writeFile(temp,e.after,{flag:'wx',mode:0o600});await rename(temp,e.file);completed.push(e);}finally{await rm(temp,{force:true});}}
 }catch(e){
  for(const old of completed.reverse()){try{const now=await current(old.file);if(now&&digest(now)===digest(old.after)){if(old.before){const temp=old.file+'.restore-'+randomUUID();await writeFile(temp,old.before,{mode:0o600});await rename(temp,old.file);}else await rm(old.file,{force:true});}}catch{}}
  throw new Error((e as Error).message+' As cópias anteriores ficam em vsync-profile-backups.');
 }
 return backups;
}
export class OfficialLauncher {
 private busy=false;
 constructor(private store:Store,private downloads:Downloads,private changed:()=>void,private host:OfficialHost=nativeOfficialHost()){}
 private root(){return this.store.state.settings.officialGameRoot||officialRoot(this.host.env);}
 private patch(value:Partial<OfficialState>){Object.assign(this.store.state.official,{gameRoot:this.root(),...value});this.changed();}
 async detect(){
  if(this.host.platform!=='win32'){this.patch({status:'unsupported',supported:false,message:'A conexão com o Minecraft Launcher está disponível inicialmente no Windows.'});return this.store.state.official;}
  try{const target=await discoverOfficial(this.store.state.settings,this.host);this.patch({status:target?'ready':'missing',supported:true,source:target?.kind,message:target?'Minecraft Launcher localizado. A conta e a licença são gerenciadas nele.':'Minecraft Launcher não encontrado. Instale o original ou selecione MinecraftLauncher.exe.'});}catch(e){this.patch({status:'error',supported:true,message:(e as Error).message});}
  return this.store.state.official;
 }
 private async target(){if(this.host.platform!=='win32')throw new Error('Esta integração está disponível inicialmente no Windows.');const target=await discoverOfficial(this.store.state.settings,this.host);if(!target)throw new Error('Minecraft Launcher não encontrado. Instale o original ou selecione MinecraftLauncher.exe em Configurações > Contas.');return target;}
 async open(){if(this.busy)throw new Error('Aguarde a preparação do perfil.');try{const target=await this.target();await this.host.launch(target);this.patch({status:'handoff',source:target.kind,openedAt:new Date().toISOString(),message:'Continue no Minecraft Launcher para entrar ou trocar a conta. A confirmação de login aparece nele.'});return true;}catch(e){this.patch({status:'error',message:(e as Error).message});throw e;}}
 enqueue(id:string,openAfter:boolean){
  if(this.busy)throw new Error('Uma preparação já está em andamento.');
  const p=this.store.profile(id);
  return this.downloads.enqueue('Preparar para Minecraft Launcher: '+p.name,async job=>{
   this.busy=true;this.patch({status:'preparing',profileName:'Vsync • '+p.name,message:'Preparando a instalação para o Minecraft Launcher…'});
   try{const target=await this.target();await this.prepare(id,job);job.signal.throwIfAborted();if(openAfter)await this.host.launch(target);this.patch({status:openAfter?'handoff':'ready',source:target.kind,profileName:'Vsync • '+p.name,preparedAt:new Date().toISOString(),...(openAfter?{openedAt:new Date().toISOString()}:{}),message:'No Minecraft Launcher, selecione “Vsync • '+p.name+'” em Java Edition > Instalações e clique em Jogar.'});}
   catch(e){this.patch({status:'error',message:job.signal.aborted?'Preparação cancelada.':(e as Error).message});throw e;}finally{this.busy=false;}
  });
 }
 async prepare(id:string,job:Job){
  if(this.host.platform!=='win32')throw new Error('Esta integração está disponível inicialmente no Windows.');
  if(await this.host.running())throw new Error('Feche o Minecraft e o Minecraft Launcher antes de sincronizar a instalação. Depois, o Vsync pode abrir o launcher novamente.');
  const p=this.store.profile(id),root=this.root(),gameDir=this.store.dir(id),documents=await profileDocuments(root);
  if(sameDirectory(root,gameDir))throw new Error('A pasta do perfil precisa ser independente da pasta principal do Minecraft.');
  let versionId=p.gameVersion;const edits:Edit[]=[];let loaderVersion=p.loaderVersion;
  const manifest=await json<any>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',{signal:job.signal});
  if(!manifest.versions?.some((v:any)=>v.id===p.gameVersion))throw new Error('Esta versão não está no manifesto oficial do Minecraft.');
  if(p.loader!=='vanilla'){
   if(!['fabric','quilt'].includes(p.loader))throw new Error('A integração inicial suporta Vanilla, Fabric e Quilt. Este loader ainda não foi integrado.');
   const base=p.loader==='fabric'?'https://meta.fabricmc.net/v2':'https://meta.quiltmc.org/v3';
   const versions=await json<any[]>(base+'/versions/loader/'+encodeURIComponent(p.gameVersion),{signal:job.signal});
   const supported=versions.map(v=>v.loader?.version).filter((v:unknown)=>typeof v==='string');
   // An explicit compatible version stays pinned even when the API's recommended stable version changes.
   const recommended=p.loader==='fabric'?versions.find(v=>v.loader?.stable)?.loader.version:supported[0];
   loaderVersion=loaderVersion||recommended;if(!loaderVersion||!supported.includes(loaderVersion)||!/^[a-zA-Z0-9._+-]{1,60}$/.test(loaderVersion))throw new Error('Não há uma versão compatível desse loader para o perfil.');
   const meta=await json<any>(base+'/versions/loader/'+encodeURIComponent(p.gameVersion)+'/'+encodeURIComponent(loaderVersion)+'/profile/json',{signal:job.signal});
   if(meta.inheritsFrom!==p.gameVersion||typeof meta.mainClass!=='string'||!meta.mainClass.startsWith(p.loader==='fabric'?'net.fabricmc.':'org.quiltmc.')||!Array.isArray(meta.libraries)||meta.libraries.length>200)throw new Error('O loader retornou um perfil incompatível.');
   for(const lib of meta.libraries){
    const relative=lib.downloads?.artifact?.path??mavenPath(lib.name),url=lib.downloads?.artifact?.url??new URL(relative,lib.url??'https://libraries.minecraft.net/').href;
    const strong=typeof lib.sha512==='string'&&/^[a-f0-9]{128}$/i.test(lib.sha512);
    let hash=lib.downloads?.artifact?.sha1??lib.sha1;
    if(!strong&&!hash){hash=(await(await request(url+'.sha1',{signal:job.signal})).text()).trim().split(/\s/)[0];}
    if(!strong&&(typeof hash!=='string'||!/^[a-f0-9]{40}$/i.test(hash)))throw new Error('Não foi possível verificar uma biblioteca do loader. Tente novamente.');
    await job.file(url,safeChild(path.join(root,'libraries'),relative),{algorithm:strong?'sha512':'sha1',value:strong?lib.sha512:hash},lib.downloads?.artifact?.size??lib.size);
   }
   versionId='vsync-'+p.loader+'-'+loaderVersion+'-'+p.gameVersion;
   const file=safeChild(root,'versions/'+versionId+'/'+versionId+'.json');
   edits.push({file,before:await current(file),after:Buffer.from(JSON.stringify({...meta,id:versionId},null,2)+'\n')});
  }
  for(const doc of documents)edits.push({file:doc.file,before:doc.bytes,after:Buffer.from(JSON.stringify(mergeOfficialProfile(doc.value,p,gameDir,versionId),null,2)+'\n')});
  job.signal.throwIfAborted();if(await this.host.running())throw new Error('O Minecraft Launcher foi aberto durante a preparação. Feche-o e tente novamente.');
  await mkdir(path.join(gameDir,'mods'),{recursive:true});const backups=await commit(root,edits);
  if(p.loader!=='vanilla'&&!p.loaderVersion){p.loaderVersion=loaderVersion;await this.store.save();}
  return{profileId:officialProfileId(id),name:'Vsync • '+p.name,versionId,backups};
 }
}
