import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {access,readdir,mkdir,rename,rm} from 'node:fs/promises';
import type {Job} from './network';
import {json} from './network';
import {extractArchive} from './archive';
const run=promisify(execFile);
export async function javaInfo(binary:string):Promise<{path:string;major:number;version:string}>{
 const {stderr,stdout}=await run(binary,['-version'],{timeout:15000,windowsHide:true,maxBuffer:100000});
 const text=stderr+stdout;const m=text.match(/version\s+"([^"]+)"/);if(!m)throw new Error('O programa selecionado não retornou uma versão Java reconhecida.');
 const v=m[1].split('.');return{path:binary,major:Number(v[0]==='1'?v[1]:v[0]),version:m[1]};
}
export async function findJava(explicit:string,major:number,root:string):Promise<string>{
 const candidates=explicit?[explicit]:[path.join(root,'java-'+major,'bin',process.platform==='win32'?'java.exe':'java'),...(process.env.JAVA_HOME?[path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java')]:[]),'java'];
 for(const p of candidates){try{const info=await javaInfo(p);if(info.major===major)return p;}catch{}}
 if(explicit)throw new Error(`O perfil exige Java ${major}. Escolha um executável compatível em Configurações > Minecraft e Java.`);
 return '';
}
export async function installJava(major:number,root:string,job:Job):Promise<string>{
 if(process.platform!=='win32')throw new Error(`Instale Java ${major} e escolha seu executável nas configurações. O download automático inicial atende Windows x64.`);
 if(process.arch!=='x64')throw new Error('O runtime automático está disponível para Windows x64.');
 const assets=await json<any[]>(`https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`,{signal:job.signal});
 const pkg=assets[0]?.binary?.package;if(!pkg?.checksum||!pkg.link)throw new Error('Não foi encontrado um Java compatível para download.');
 const archive=path.join(root,'java-'+major+'.zip');await job.file(pkg.link,archive,{algorithm:'sha256',value:pkg.checksum},pkg.size);
 const stage=path.join(root,'java-staging-'+major);await rm(stage,{recursive:true,force:true});await extractArchive(archive,stage);
 const dirs=await readdir(stage);const folder=dirs.find(x=>x.toLowerCase().includes('jre')||x.toLowerCase().includes('jdk'));if(!folder)throw new Error('O pacote Java tem uma estrutura inesperada.');
 const dest=path.join(root,'java-'+major);await rm(dest,{recursive:true,force:true});await rename(path.join(stage,folder),dest);await rm(stage,{recursive:true,force:true});await rm(archive,{force:true});
 const binary=path.join(dest,'bin','java.exe');await javaInfo(binary);return binary;
}
