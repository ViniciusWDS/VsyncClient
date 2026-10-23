import AdmZip from 'adm-zip';
import {mkdir,writeFile,lstat,readdir} from 'node:fs/promises';
import path from 'node:path';
import {safeChild} from './safety';
export async function extractArchive(file:string,root:string,filter:(p:string)=>boolean=()=>true){
 const zip=new AdmZip(file);const entries=zip.getEntries();let size=0;
 if(entries.length>30000)throw new Error('O pacote tem arquivos demais.');
 for(const entry of entries){
  size+=entry.header.size;if(size>8_000_000_000||entry.header.size>2_000_000_000)throw new Error('O pacote excede o limite de extração.');
  const name=entry.entryName.replace(/\/$/,'');if(!name)continue;const dest=safeChild(root,name);
  const mode=(entry.attr>>>16)&0o170000;if(mode===0o120000)throw new Error('Links simbólicos não são aceitos em pacotes.');
  if(!filter(name))continue;
  // Directories already present must never redirect writes through a symlink.
  let cursor=path.dirname(dest);while(cursor!==path.resolve(root)&&cursor.startsWith(path.resolve(root)+path.sep)){try{if((await lstat(cursor)).isSymbolicLink())throw new Error('Link simbólico bloqueado na pasta de destino.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}cursor=path.dirname(cursor);}
  try{if((await lstat(dest)).isSymbolicLink())throw new Error('Link simbólico bloqueado.');}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  if(entry.isDirectory)await mkdir(dest,{recursive:true});else{await mkdir(path.dirname(dest),{recursive:true});await writeFile(dest,entry.getData());}
 }
}
export async function addDirectory(zip:AdmZip,root:string,base='',includeWorlds=false){
 for(const e of await readdir(path.join(root,base),{withFileTypes:true})){
  if(e.isSymbolicLink()||['runtime','natives','.vsync-runtime','.vsync-backups','.vsync-fps','logs','crash-reports'].includes(e.name)||!includeWorlds&&e.name==='saves')continue;
  const relative=base?base+'/'+e.name:e.name;
  if(e.isDirectory())await addDirectory(zip,root,relative,includeWorlds);else zip.addLocalFile(path.join(root,relative),path.posix.dirname(relative)==='.'?'':path.posix.dirname(relative));
 }
}
