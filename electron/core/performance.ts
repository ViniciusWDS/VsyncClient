import path from 'node:path';
import {mkdir,lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import type {Store} from './store';
import {FPS_KEYS,fpsOptions,type FpsValues} from '../../src/performance';

export const fpsSchema=z.object({preset:z.enum(['Leve','Equilibrado','Qualidade']),ram:z.number().int().min(1024).max(65536),renderDistance:z.number().int().min(2).max(32),simulationDistance:z.number().int().min(5).max(32),maxFps:z.number().int().min(30).max(260),vsync:z.boolean()});
const digest=(value:string|null)=>createHash('sha256').update(value===null?'absent':value).digest('hex');
export function patchOptions(text:string,values:Record<string,string|null>){
 const remaining=new Map(Object.entries(values));const newline=text.includes('\r\n')?'\r\n':'\n';const result:string[]=[];
 for(const line of text.split(/\r?\n/)){const split=line.indexOf(':');const key=split<0?'':line.slice(0,split);if(!Object.hasOwn(values,key)){result.push(line);continue;}if(remaining.has(key)){const value=remaining.get(key);if(value!==null)result.push(key+':'+value);remaining.delete(key);}}
 while(result.at(-1)==='')result.pop();for(const [key,value]of remaining)if(value!==null)result.push(key+':'+value);
 return result.join(newline)+newline;
}
function previousOptions(text:string){const values:Record<string,string|null>=Object.fromEntries(FPS_KEYS.map(k=>[k,null]));for(const line of text.split(/\r?\n/)){const split=line.indexOf(':');const key=line.slice(0,split);if(split>0&&FPS_KEYS.includes(key))values[key]=line.slice(split+1);}return values;}
async function plain(file:string){try{const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw new Error('O arquivo de opções deve ser um arquivo regular de até 2 MB.');return await readFile(file,'utf8');}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
export class Performance {
 constructor(private store:Store,private changed:()=>void){}
 private async root(id:string){const root=this.store.dir(id);await mkdir(root,{recursive:true});for(const dir of [this.store.state.settings.installRoot,root])if((await lstat(dir)).isSymbolicLink())throw new Error('Escolha uma pasta de perfil sem atalhos simbólicos.');return root;}
 async apply(id:string,input:FpsValues){
  const value=fpsSchema.parse(input);if(value.ram>this.store.state.system.memory-1024)throw new Error('Reserve pelo menos 1 GB de RAM para o sistema.');
  const p=this.store.profile(id);if(p.gameVersion!=='1.21.1')throw new Error('Os ajustes FPS desta versão foram definidos para Minecraft 1.21.1. Use um perfil 1.21.1.');
  const root=await this.root(id);const file=path.join(root,'options.txt');const original=await plain(file);const result=patchOptions(original??'',fpsOptions(value));
  const backupId=randomUUID();const backupRoot=path.join(root,'.vsync-fps');await mkdir(backupRoot,{recursive:true});if((await lstat(backupRoot)).isSymbolicLink())throw new Error('A pasta de backup FPS não pode ser um atalho.');
  const backup=path.join(backupRoot,backupId);await mkdir(backup);const previous={ram:p.ram,preset:p.preset,performance:p.performance};
  await writeFile(path.join(backup,'backup.json'),JSON.stringify({schema:1,profileId:id,previous,options:previousOptions(original??''),createdAt:new Date().toISOString()},null,2),{mode:0o600});
  if(original!==null)await writeFile(path.join(backup,'options.txt'),original,{mode:0o600});
  if(digest(await plain(file))!==digest(original))throw new Error('O Minecraft alterou as opções durante a operação. Feche o jogo e tente novamente.');
  await this.write(file,result);p.ram=value.ram;p.preset=value.preset;p.performance={...value,appliedAt:new Date().toISOString(),backupId};
  try{await this.store.save();}catch(e){Object.assign(p,previous);if(digest(await plain(file))===digest(result)){if(original===null)await rm(file,{force:true});else await this.write(file,original);}throw e;}
  this.changed();return p.performance;
 }
 async restore(id:string){
  const p=this.store.profile(id);const backupId=z.string().uuid().parse(p.performance?.backupId);const root=await this.root(id);const dir=path.join(root,'.vsync-fps');if((await lstat(dir)).isSymbolicLink())throw new Error('A pasta de backup FPS não pode ser um atalho.');const backup=path.join(dir,backupId);if((await lstat(backup)).isSymbolicLink())throw new Error('Backup FPS inválido.');
  const raw=await plain(path.join(backup,'backup.json'));if(!raw)throw new Error('O backup dos ajustes não foi encontrado.');
  const saved=z.object({schema:z.literal(1),profileId:z.literal(id),previous:z.object({ram:z.number().int().min(1024).max(65536),preset:z.enum(['Leve','Equilibrado','Qualidade']),performance:fpsSchema.extend({appliedAt:z.string(),backupId:z.string().uuid()}).optional()}),options:z.record(z.string(),z.string().max(1000).nullable())}).parse(JSON.parse(raw));
  if(Object.keys(saved.options).length!==FPS_KEYS.length||FPS_KEYS.some(k=>!Object.hasOwn(saved.options,k))||Object.values(saved.options).some(v=>v!==null&&/[\r\n]/.test(v)))throw new Error('O backup contém opções não reconhecidas.');
  const file=path.join(root,'options.txt');const original=await plain(file);const result=patchOptions(original??'',saved.options);const before={ram:p.ram,preset:p.preset,performance:p.performance};
  if(digest(await plain(file))!==digest(original))throw new Error('As opções foram alteradas. Feche o jogo e tente novamente.');
  await this.write(file,result);Object.assign(p,saved.previous);p.performance=saved.previous.performance;
  try{await this.store.save();}catch(e){Object.assign(p,before);if(digest(await plain(file))===digest(result)){if(original===null)await rm(file,{force:true});else await this.write(file,original);}throw e;}
  this.changed();return true;
 }
 private async write(file:string,text:string){const temp=file+'.vsync-'+randomUUID();try{await writeFile(temp,text,{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await rm(temp,{force:true});}}
}
