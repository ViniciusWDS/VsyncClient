import path from 'node:path';
import {mkdir,copyFile,rename,rm,readFile,writeFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import AdmZip from 'adm-zip';
import type {Profile,ProjectVersion,SearchQuery,ComponentFile} from '../../src/shared';
import type {Store} from './store';
import {json,type Job,type Downloads} from './network';
import {safeChild,safeFilename} from './safety';
import {extractArchive} from './archive';
import {FPS_MODS} from '../../src/performance';
import {RECOMMENDED_MODS,type ModCompatibility} from '../../src/mods';
const API='https://api.modrinth.com/v2';
function fpsSupport(p:Profile){if(p.loader!=='fabric'||p.gameVersion!=='1.21.1')return 'A seleção inicial usa Fabric / Minecraft 1.21.1.';if(p.loaderVersion){const v=/^(\d+)\.(\d+)\.(\d+)$/.exec(p.loaderVersion)?.slice(1).map(Number);if(!v||v[0]===0&&(v[1]<16||v[1]===16&&v[2]<14))return 'Use Fabric Loader 0.16.14 ou mais recente. Crie um perfil atualizado.';}return '';}
export function versionMatches(v:ProjectVersion,p:Profile,type='mod'){return v.game_versions.includes(p.gameVersion)&&(type!=='mod'||v.loaders.includes(p.loader));}
export async function dependencyPlan(first:ProjectVersion|ProjectVersion[],p:Profile,fetchVersion:(id:string)=>Promise<ProjectVersion>,fetchProject:(id:string)=>Promise<ProjectVersion[]>):Promise<ProjectVersion[]>{
 const plan=new Map<string,ProjectVersion>();const visiting=new Set<string>();
 async function visit(v:ProjectVersion){
  const projectId=(v as any).project_id as string;if(!projectId)throw new Error('A API retornou uma versão sem projeto.');
  const previous=plan.get(projectId);if(previous&&previous.id!==v.id)throw new Error('Duas dependências exigem versões diferentes do mesmo mod. Use outro perfil.');
  if(previous||visiting.has(v.id))return;
  if(!versionMatches(v,p,(v as any)._type??'mod'))throw new Error(`A versão ${v.version_number} não é compatível com ${p.gameVersion} / ${p.loader}.`);
  plan.set(projectId,v);visiting.add(v.id);
  for(const d of v.dependencies){
   if(d.dependency_type!=='required')continue;
   const resolved=d.version_id?await fetchVersion(d.version_id):d.project_id?(await fetchProject(d.project_id)).find(x=>versionMatches(x,p)):undefined;
   if(!resolved)throw new Error('Não foi encontrada uma dependência obrigatória compatível. A instalação foi interrompida.');
   await visit(resolved);
  }visiting.delete(v.id);
 }
 for(const root of Array.isArray(first)?first:[first])await visit(root);
 for(const v of plan.values())for(const d of v.dependencies){
  if(d.dependency_type!=='incompatible')continue;
  const all=[...plan.values()].filter(x=>x.id!==v.id);
  const conflict=all.some(x=>d.version_id?x.id===d.version_id:(x as any).project_id===d.project_id)||p.components.some(c=>c.enabled&&!plan.has(c.projectId)&&(d.version_id?c.versionId===d.version_id:c.projectId===d.project_id));
  if(conflict)throw new Error('Uma incompatibilidade declarada pelo autor foi encontrada. Desative ou remova o componente conflitante.');
 }
 for(const existing of p.components.filter(c=>c.enabled&&!plan.has(c.projectId))){
  const v=await fetchVersion(existing.versionId);
  for(const d of v.dependencies){
   const target=d.project_id?plan.get(d.project_id):[...plan.values()].find(x=>x.id===d.version_id);
   if(!target)continue;
   if(d.dependency_type==='incompatible'&&(!d.version_id||d.version_id===target.id))throw new Error('O componente ativo '+existing.name+' declara incompatibilidade com esta instalação.');
   if(d.dependency_type==='required'&&d.version_id&&d.version_id!==target.id)throw new Error('O componente ativo '+existing.name+' exige outra versão de uma dependência. Use um perfil separado.');
  }
 }
 return [...plan.values()].reverse();
}
export class Catalog {
 constructor(private store:Store,private downloads:Downloads,private changed:()=>void){}
 async search(q:SearchQuery){
  const offset=q.offset??0;if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Página de catálogo inválida.');
  const facets=[[ 'project_type:'+q.type ]];if(q.version)facets.push(['versions:'+q.version]);if(q.loader&&q.type==='mod')facets.push(['categories:'+q.loader]);if(q.category)facets.push(['categories:'+q.category]);
  const result=await json<any>(API+'/search?'+new URLSearchParams({query:q.query,facets:JSON.stringify(facets),index:q.sort||'downloads',limit:'24',offset:String(offset)}));
  return {...result,hits:result.hits.map((hit:any)=>({...hit,id:hit.project_id??hit.id}))};
 }
 async versions(project:string,p:Profile){return json<ProjectVersion[]>(API+'/project/'+encodeURIComponent(project)+'/version?'+new URLSearchParams({game_versions:JSON.stringify([p.gameVersion])}));}
 async detail(project:string,p:Profile){const [info,versions]=await Promise.all([json<any>(API+'/project/'+encodeURIComponent(project)),this.versions(project,p)]);return{project:{...info,title:info.title,id:info.id,author:'Comunidade Modrinth',project_type:info.project_type},versions};}
 async backup(p:Profile){
  const dir=this.store.dir(p.id);const dest=path.join(dir,'.vsync-backups',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,6));await mkdir(dest,{recursive:true});
  await writeFile(path.join(dest,'profile.json'),JSON.stringify(p,null,2));
  for(const folder of ['mods','resourcepacks','shaderpacks','config']){try{const {cp,lstat}=await import('node:fs/promises');await cp(path.join(dir,folder),path.join(dest,folder),{recursive:true,dereference:false,filter:async(src)=>!(await lstat(src)).isSymbolicLink()});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  return dest;
 }
 install(profileId:string,project:string,versionId?:string):string{
  const p=this.store.profile(profileId);
  return this.downloads.enqueue('Instalar componente',async(job)=>{
   const detail=await this.detail(project,p);const type=detail.project.project_type;
   const version=detail.versions.find(v=>versionId?v.id===versionId:versionMatches(v,p,type));
   if(!version)throw new Error('Não existe um arquivo compatível com este perfil. Troque a versão ou o loader.');
   if(type==='modpack'){await this.installPack(p,detail.project.title,version,job);return;}
   if(type==='mod'&&p.loader==='vanilla')throw new Error('Este perfil é Vanilla. Crie um perfil Fabric para instalar mods.');
   (version as any)._type=type;
   const plan=await dependencyPlan(version,p,id=>json<ProjectVersion>(API+'/version/'+encodeURIComponent(id)),id=>this.versions(id,p));
   await this.installPlan(p,plan,job);
  });
 }
 async performanceCompatibility(p:Profile){
  return Promise.all(FPS_MODS.map(async mod=>{if(fpsSupport(p))return{id:mod.id,compatible:false,reason:fpsSupport(p)};try{const versions=await this.versions(mod.id,p);const v=versions.find(v=>versionMatches(v,p)&&(v as any).version_type==='release');return{id:mod.id,compatible:!!v,version:v?.version_number,reason:v?undefined:'Nenhuma versão estável compatível na fonte.'};}catch{return{id:mod.id,compatible:false,reason:'Não foi possível consultar o Modrinth. Tente novamente.'};}}));
 }
 async collectionCompatibility(p:Profile,projects:readonly string[]=RECOMMENDED_MODS.map(m=>m.id)):Promise<ModCompatibility[]>{
  this.checkCollection(projects);
  const results:ModCompatibility[]=new Array(projects.length);let next=0;
  // Keep metadata requests bounded when the recommended collection is opened.
  await Promise.all(Array.from({length:Math.min(4,projects.length)},async()=>{
   for(;;){const index=next++;if(index>=projects.length)return;const id=projects[index];
    if(p.loader==='vanilla'){results[index]={id,compatible:false,reason:'Crie ou selecione um perfil com loader de mods.'};continue;}
    try{const versions=await this.versions(id,p);const version=versions.find(v=>versionMatches(v,p)&&(v as any).version_type==='release');results[index]={id,compatible:!!version,version:version?.version_number,reason:version?undefined:'Nenhuma versão estável para '+p.gameVersion+' / '+p.loader+'.'};}
    catch{results[index]={id,compatible:false,reason:'Não foi possível consultar o Modrinth. Tente novamente.'};}
   }
  }));
  return results;
 }
 private checkCollection(projects:readonly string[]){if(!projects.length||projects.length>RECOMMENDED_MODS.length||new Set(projects).size!==projects.length||projects.some(id=>!RECOMMENDED_MODS.some(mod=>mod.id===id)))throw new Error('Seleção de mods recomendados inválida.');}
 installCollection(profileId:string,projects:string[]){
  this.checkCollection(projects);const p=this.store.profile(profileId);
  if(p.loader==='vanilla')throw new Error('Selecione um perfil com loader de mods para instalar a coleção.');
  return this.installSelection(p,projects,'Mods recomendados');
 }
 installPerformance(profileId:string,projects:string[]){
  const p=this.store.profile(profileId);
  if(fpsSupport(p))throw new Error(fpsSupport(p));
  if(!projects.length||new Set(projects).size!==projects.length||projects.some(id=>!FPS_MODS.some(mod=>mod.id===id)))throw new Error('Seleção de otimizações inválida.');
  return this.installSelection(p,projects,'Mods de desempenho');
 }
 private installSelection(p:Profile,projects:readonly string[],title:string){
  return this.downloads.enqueue(title,async job=>{
   const roots:ProjectVersion[]=[];
   for(const project of projects){
    job.signal.throwIfAborted();const detail=await this.detail(project,p);
    const version=detail.versions.find(v=>versionMatches(v,p)&&(v as any).version_type==='release');
    if(!version||detail.project.project_type!=='mod')throw new Error('Não foi encontrada uma versão estável compatível de '+detail.project.title+'. Nenhum arquivo foi alterado.');
    roots.push(version);
   }
   const plan=await dependencyPlan(roots,p,id=>json<ProjectVersion>(API+'/version/'+encodeURIComponent(id)),id=>this.versions(id,p));
   await this.installPlan(p,plan,job);
  });
 }
 private async installPlan(p:Profile,plan:ProjectVersion[],job:Job){
   const root=this.store.dir(p.id);const stage=path.join(root,'.vsync-staging-'+randomUUID());await mkdir(stage,{recursive:true});const components:ComponentFile[]=[];
   try{
    for(const v of plan){
     job.signal.throwIfAborted();const file=v.files.find(f=>f.primary)??v.files[0];if(!file?.hashes.sha512)throw new Error('O arquivo não tem hash verificável. Abra a página original para baixar manualmente.');
     safeFilename(file.filename);const projectId=(v as any).project_id;
     const info=await json<any>(API+'/project/'+projectId);
     const fileType=info.project_type==='resourcepack'?'resourcepack':info.project_type==='shader'?'shader':'mod';
     if(fileType==='mod'&&!file.filename.endsWith('.jar')||fileType!=='mod'&&!file.filename.endsWith('.zip'))throw new Error('O projeto usa um formato não suportado. Abra sua página original.');
     await job.file(file.url,path.join(stage,file.filename),{algorithm:'sha512',value:file.hashes.sha512},file.size);
     components.push({id:randomUUID(),projectId,versionId:v.id,name:info.title,version:v.version_number,filename:file.filename,type:fileType,enabled:true,sha512:file.hashes.sha512,dependencies:v.dependencies.filter(d=>d.dependency_type==='required').map(d=>d.project_id??'').filter(Boolean)});
    }
    job.signal.throwIfAborted();const backup=await this.backup(p);const before=structuredClone(p.components);const moved:string[]=[];
    try{
     for(const c of components){
      const folder=c.type==='mod'?'mods':c.type==='shader'?'shaderpacks':'resourcepacks';await mkdir(path.join(root,folder),{recursive:true});
      const collision=p.components.find(x=>x.filename===c.filename&&x.projectId!==c.projectId);if(collision)throw new Error('Dois projetos usam o mesmo nome de arquivo.');
      const old=p.components.find(x=>x.projectId===c.projectId);if(old){const oldFolder=old.type==='mod'?'mods':old.type==='shader'?'shaderpacks':'resourcepacks';await rm(path.join(root,oldFolder,old.filename+(old.enabled?'':'.disabled')),{force:true});}
      const dest=path.join(root,folder,c.filename);await rename(path.join(stage,c.filename),dest);moved.push(dest);p.components=p.components.filter(x=>x.projectId!==c.projectId).concat(c);
     }await this.store.save();
    }catch(e){for(const f of moved)await rm(f,{force:true});for(const folder of ['mods','resourcepacks','shaderpacks']){try{const {cp}=await import('node:fs/promises');await cp(path.join(backup,folder),path.join(root,folder),{recursive:true});}catch{}}p.components=before;await this.store.save();throw e;}
   }finally{await rm(stage,{recursive:true,force:true});this.changed();}
 }
 private async installPack(target:Profile,title:string,v:ProjectVersion,job:Job){
  const file=v.files.find(f=>f.primary)??v.files[0];if(!file?.filename.endsWith('.mrpack'))throw new Error('Este modpack exige importação manual. Abra a página original e escolha um arquivo .mrpack.');
  const temp=path.join(this.store.root,'cache','packs',randomUUID()+'.mrpack');await job.file(file.url,temp,{algorithm:'sha512',value:file.hashes.sha512},file.size);
  try{await this.importMrpack(temp,title,job);}finally{await rm(temp,{force:true});}
 }
 async importMrpack(file:string,name:string,job:Job){
  const zip=new AdmZip(file);const entry=zip.getEntry('modrinth.index.json');if(!entry)throw new Error('O pacote não contém modrinth.index.json.');if(entry.header.size>10_000_000)throw new Error('O manifesto do modpack excede o limite permitido.');
  const index=JSON.parse(entry.getData().toString());if(index.formatVersion!==1||index.game!=='minecraft')throw new Error('Formato de modpack não suportado.');
  if(index.dependencies?.forge||index.dependencies?.neoforge)throw new Error('Este modpack exige Forge/NeoForge. A instalação desses loaders está planejada; use um pack Fabric ou Quilt nesta versão.');
  const p=this.store.create(name);p.gameVersion=index.dependencies?.minecraft;p.loader=index.dependencies?.['fabric-loader']?'fabric':index.dependencies?.['quilt-loader']?'quilt':'vanilla';p.loaderVersion=index.dependencies?.['fabric-loader']??index.dependencies?.['quilt-loader']??'';p.description=index.summary??'Importado do Modrinth';
  if(!p.gameVersion||!Array.isArray(index.files)||index.files.length>30000)throw new Error('O manifesto do modpack é inválido.');
  const dir=path.join(this.store.state.settings.installRoot,p.id);await mkdir(dir,{recursive:true});
  try{
   const seen=new Set<string>();
   for(const f of index.files){if(f.env?.client==='unsupported')continue;const dest=safeChild(dir,f.path);if(seen.has(dest))throw new Error('Caminho repetido no modpack.');seen.add(dest);if(!f.hashes?.sha512||!f.downloads?.length)throw new Error('Um arquivo exige download manual. Consulte a página original.');await job.file(f.downloads[0],dest,{algorithm:'sha512',value:f.hashes.sha512},f.fileSize);}
   // Stage overrides separately, then place only files beneath their prefix.
   const staging=path.join(this.store.root,'cache','overrides-'+randomUUID());try{await extractArchive(file,staging,n=>n.startsWith('overrides/')||n.startsWith('client-overrides/'));const {cp}=await import('node:fs/promises');for(const d of ['overrides','client-overrides'])try{await cp(path.join(staging,d),dir,{recursive:true});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}finally{await rm(staging,{recursive:true,force:true});}
   job.signal.throwIfAborted();this.store.state.profiles.push(p);this.store.state.selectedProfileId=p.id;await this.store.save();this.changed();
  }catch(e){await rm(dir,{recursive:true,force:true});throw e;}
 }
 async toggle(profileId:string,id:string){const p=this.store.profile(profileId);const c=p.components.find(c=>c.id===id);if(!c)throw new Error('Componente não encontrado.');const folder=c.type==='mod'?'mods':c.type==='shader'?'shaderpacks':'resourcepacks';const dir=path.join(this.store.dir(p.id),folder);const enabledDependents=p.components.filter(x=>x.enabled&&x.dependencies.includes(c.projectId));if(c.enabled&&enabledDependents.length)throw new Error('Desative primeiro: '+enabledDependents.map(x=>x.name).join(', '));if(!c.enabled&&c.dependencies.some(dep=>!p.components.some(x=>x.projectId===dep&&x.enabled)))throw new Error('Ative primeiro as dependências deste componente.');await rename(path.join(dir,c.filename+(c.enabled?'':'.disabled')),path.join(dir,c.filename+(c.enabled?'.disabled':'')));c.enabled=!c.enabled;await this.store.save();this.changed();}
 async remove(profileId:string,id:string){const p=this.store.profile(profileId);const c=p.components.find(c=>c.id===id);if(!c)throw new Error('Componente não encontrado.');if(p.components.some(x=>x.enabled&&x.dependencies.includes(c.projectId)))throw new Error('Existem mods ativos que dependem deste componente.');await this.backup(p);await rm(path.join(this.store.dir(p.id),c.type==='mod'?'mods':c.type==='shader'?'shaderpacks':'resourcepacks',c.filename+(c.enabled?'':'.disabled')),{force:true});p.components=p.components.filter(x=>x.id!==id);await this.store.save();this.changed();}
}
