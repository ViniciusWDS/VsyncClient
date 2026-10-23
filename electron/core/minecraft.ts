import path from 'node:path';
import {mkdir,writeFile,readFile,access,rm,copyFile} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash} from 'node:crypto';
import type {Profile} from '../../src/shared';
import type {Store} from './store';
import type {Auth} from './auth';
import {json,type Downloads,type Job} from './network';
import {safeChild,mavenPath,platformName,rulesAllow} from './safety';
import {extractArchive} from './archive';
import {findJava,installJava} from './java';
interface Runtime {mainClass:string;libraries:string[];args:any[];jvm:any[];assetIndex:string;javaMajor:number;gameVersion:string;loader:string;loaderVersion:string;}
export class Minecraft {
 process?:ChildProcess; private installing=new Map<string,string>();
 constructor(private store:Store,private downloads:Downloads,private auth:Auth,private changed:()=>void,private log:(s:string)=>void,private gameWindow:(running:boolean)=>void){}
 async versions(){const m=await json<any>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');return m.versions.filter((v:any)=>v.type==='release'&&(/^1\.(2[0-9])([.]|$)/.test(v.id)||/^2[6-9][.]/.test(v.id))).map((v:any)=>v.id);}
 async loaders(version:string){
  const [fabric,quilt]=await Promise.allSettled([json<any[]>('https://meta.fabricmc.net/v2/versions/loader/'+encodeURIComponent(version)),json<any[]>('https://meta.quiltmc.org/v3/versions/loader/'+encodeURIComponent(version))]);
  return{vanilla:[],fabric:fabric.status==='fulfilled'?fabric.value.filter(v=>v.loader.stable).map(v=>v.loader.version):[],quilt:quilt.status==='fulfilled'?quilt.value.map(v=>v.loader.version):[],forge:[],neoforge:[],notes:{forge:'Instalador ainda não implementado.',neoforge:'Instalador ainda não implementado.'}};
 }
 install(id:string,repair=false){
  const p=this.store.profile(id);const previous=this.installing.get(id);if(previous&&this.downloads.tasks.some(t=>t.id===previous&&['running','queued'].includes(t.status)))throw new Error('Este perfil já está na fila de instalação.');
  const task=this.downloads.enqueue((repair?'Reparar ':'Instalar ')+p.name,async(job)=>{await this.prepare(p,job);p.installed=true;await this.store.save();this.changed();});
  this.installing.set(id,task);
  return task;
 }
 private async prepare(p:Profile,job:Job){
  if(!['vanilla','fabric','quilt'].includes(p.loader))throw new Error('Este loader ainda não tem instalador no Vsync. Use Vanilla, Fabric ou Quilt.');
  const root=this.store.dir(p.id),cache=path.join(this.store.root,'cache'),libs=path.join(cache,'libraries'),assets=path.join(cache,'assets'),natives=path.join(root,'.vsync-runtime','natives');
  await mkdir(natives,{recursive:true});await mkdir(path.join(root,'mods'),{recursive:true});
  const manifest=await json<any>('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',{signal:job.signal});const entry=manifest.versions.find((v:any)=>v.id===p.gameVersion);if(!entry)throw new Error('Esta versão não está no manifesto oficial.');
  const versionFile=path.join(cache,'versions',p.gameVersion,p.gameVersion+'.json');await job.file(entry.url,versionFile,{algorithm:'sha1',value:entry.sha1});
  const meta=JSON.parse(await readFile(versionFile,'utf8'));let extension:any;let loaderVersion=p.loaderVersion;
  if(p.loader!=='vanilla'){
   const compatible=await this.loaders(p.gameVersion);const supported=compatible[p.loader as 'fabric'|'quilt'];if(!supported.length)throw new Error('Não há loader compatível disponível para esta versão.');
   loaderVersion=loaderVersion||supported[0];if(!supported.includes(loaderVersion))throw new Error('A versão do loader não foi encontrada para este Minecraft.');
   const base=p.loader==='fabric'?'https://meta.fabricmc.net/v2':'https://meta.quiltmc.org/v3';
   extension=await json<any>(base+'/versions/loader/'+encodeURIComponent(p.gameVersion)+'/'+encodeURIComponent(loaderVersion)+'/profile/json',{signal:job.signal});
  }
  const clientPath=path.join(cache,'versions',p.gameVersion,p.gameVersion+'.jar');await job.file(meta.downloads.client.url,clientPath,{algorithm:'sha1',value:meta.downloads.client.sha1},meta.downloads.client.size);
  const merged=new Map<string,any>();for(const l of [...meta.libraries,...(extension?.libraries??[])]){const [g,a]=l.name.split(':');merged.set(g+':'+a+(l.name.split(':')[3]??''),l);}
  const classpath:string[]=[];const nativeArchives:string[]=[];
  for(const l of merged.values()){
   job.signal.throwIfAborted();if(!rulesAllow(l.rules))continue;const artifact=l.downloads?.artifact;
   if(artifact || !l.downloads){
    const relative=artifact?.path??mavenPath(l.name);const dest=safeChild(libs,relative);const url=artifact?.url??(l.url??'https://libraries.minecraft.net/')+relative;
    let hash=artifact?.sha1;if(!hash){try{const {request}=await import('./network');hash=(await (await request(url+'.sha1',{signal:job.signal})).text()).trim().split(/\s/)[0];if(!/^[0-9a-f]{40}$/i.test(hash))hash=undefined;}catch{}}
    await job.file(url,dest,hash?{algorithm:'sha1',value:hash}:undefined,artifact?.size);classpath.push(dest);
   }
   const classifier=l.natives?.[platformName()]?.replace('${arch}',process.arch==='x64'?'64':'32');const native=classifier?l.downloads?.classifiers?.[classifier]:undefined;
   if(native){const dest=safeChild(libs,native.path);await job.file(native.url,dest,{algorithm:'sha1',value:native.sha1},native.size);nativeArchives.push(dest);}
  }
  for(const file of nativeArchives)await extractArchive(file,natives,n=>!n.startsWith('META-INF/')&&!n.startsWith('META-INF'));
  classpath.push(clientPath);
  const indexPath=path.join(assets,'indexes',meta.assetIndex.id+'.json');await job.file(meta.assetIndex.url,indexPath,{algorithm:'sha1',value:meta.assetIndex.sha1},meta.assetIndex.size);const index=JSON.parse(await readFile(indexPath,'utf8'));
  const objects=Object.values(index.objects) as {hash:string;size:number}[];let cursor=0;
  await Promise.all(Array.from({length:this.store.state.settings.downloadConcurrency},async()=>{while(cursor<objects.length){const o=objects[cursor++];job.signal.throwIfAborted();const key=o.hash.slice(0,2)+'/'+o.hash;await job.file('https://resources.download.minecraft.net/'+key,path.join(assets,'objects',key),{algorithm:'sha1',value:o.hash},o.size);}}));
  const javaMajor=meta.javaVersion?.majorVersion??21;let java=await findJava(p.javaPath||this.store.state.settings.javaPath,javaMajor,path.join(cache,'runtime'));
  if(!java)java=await installJava(javaMajor,path.join(cache,'runtime'),job);p.javaPath=java;
  const runtime:Runtime={mainClass:extension?.mainClass??meta.mainClass,libraries:classpath,args:[...(meta.arguments?.game??[]),...(extension?.arguments?.game??[])],jvm:meta.arguments?.jvm??[],assetIndex:meta.assetIndex.id,javaMajor,gameVersion:p.gameVersion,loader:p.loader,loaderVersion};
  await writeFile(path.join(root,'.vsync-runtime','runtime.json'),JSON.stringify(runtime,null,2));this.log('Arquivos verificados para '+p.name+'.');
 }
 async launch(id:string,address?:string){
  if(this.process||this.store.state.game.state==='preparing')throw new Error('Já existe uma sessão iniciando ou em execução.');
  const p=this.store.profile(id);if(!p.installed)throw new Error('Instale o perfil antes de jogar.');
  const root=this.store.dir(id);let runtime:Runtime;
  try{runtime=JSON.parse(await readFile(path.join(root,'.vsync-runtime','runtime.json'),'utf8'));}catch{throw new Error('A instalação está incompleta. Use Reparar perfil.');}
  if(runtime.gameVersion!==p.gameVersion||runtime.loader!==p.loader||p.loaderVersion&&runtime.loaderVersion!==p.loaderVersion)throw new Error('A configuração mudou. Repare a instalação antes de iniciar.');
  this.store.state.game={state:'preparing',profileId:id,message:'Verificando conta e Java'};this.changed();
  try{
   const account=await this.auth.active();const java=await findJava(p.javaPath||this.store.state.settings.javaPath,runtime.javaMajor,path.join(this.store.root,'cache','runtime'));if(!java)throw new Error('Java compatível não encontrado. Repare o perfil.');
   const natives=path.join(root,'.vsync-runtime','natives');const replacements:Record<string,string>={auth_player_name:account.name,version_name:p.gameVersion,game_directory:root,assets_root:path.join(this.store.root,'cache','assets'),assets_index_name:runtime.assetIndex,auth_uuid:account.uuid,auth_access_token:account.accessToken,clientid:this.store.state.settings.clientId,auth_xuid:'',user_type:'msa',version_type:'release',resolution_width:String(p.width),resolution_height:String(p.height),natives_directory:natives,launcher_name:'Vsync Client',launcher_version:this.store.state.system.appVersion,classpath:runtime.libraries.join(path.delimiter),classpath_separator:path.delimiter,library_directory:path.join(this.store.root,'cache','libraries'),user_properties:'{}'};
   const replace=(s:string)=>s.replace(/\$\{([^}]+)\}/g,(_,k)=>{if(replacements[k]===undefined)throw new Error('Argumento do jogo não reconhecido: '+k);return replacements[k];});
   const expand=(args:any[])=>args.flatMap(a=>typeof a==='string'?[replace(a)]:rulesAllow(a.rules)?(Array.isArray(a.value)?a.value:[a.value]).map(replace):[]);
   const jvm=expand(runtime.jvm).filter(a=>!a.startsWith('-Xmx')&&!a.startsWith('-Xms'));
   if(!jvm.includes('-cp')&&!jvm.includes('-classpath'))jvm.push('-Djava.library.path='+natives,'-cp',runtime.libraries.join(path.delimiter));
   const game=expand(runtime.args);if(address)game.push('--quickPlayMultiplayer',address);
   const args=[`-Xms${Math.min(1024,p.ram)}M`,`-Xmx${p.ram}M`,...jvm,...p.jvmArgs,runtime.mainClass,...game];
   const child=spawn(java,args,{cwd:root,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});this.process=child;
   child.stdout?.on('data',b=>this.log(String(b).replaceAll(account.accessToken,'[REMOVIDO]').trim()));child.stderr?.on('data',b=>this.log(String(b).replaceAll(account.accessToken,'[REMOVIDO]').trim()));
   child.once('spawn',()=>{this.store.state.game={state:'running',profileId:id};p.lastPlayed=new Date().toISOString();void this.store.save();this.changed();this.gameWindow(true);});
   child.once('error',e=>{this.process=undefined;this.store.state.game={state:'error',profileId:id,message:e.message};this.changed();this.gameWindow(false);});
   child.once('exit',(code)=>{this.process=undefined;this.store.state.game=code?{state:'error',profileId:id,message:'O Minecraft encerrou com código '+code+'. Consulte os logs.'}:{state:'idle'};this.log('Minecraft encerrado. Código: '+code);this.changed();this.gameWindow(false);});
  }catch(e){this.store.state.game={state:'error',profileId:id,message:(e as Error).message};this.changed();throw e;}
 }
}
