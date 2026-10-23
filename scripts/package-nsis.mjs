import {readdir,writeFile,copyFile,readFile,chmod} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {getMakeNsisPath} from 'app-builder-lib/out/toolsets/windows.js';
// Mesma definição NSIS para o build alpha e o teste Windows. Nunca inclui credenciais.
const root=process.cwd(),dir=path.join(root,'release/win-unpacked'),build=path.join(root,'build');
const {version}=JSON.parse(await readFile('package.json','utf8'));
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))throw new Error('Versão inválida para o instalador.');
const name='Vsync-Client-Setup-'+version+'.exe',files=[],dirs=[];
async function walk(base=''){for(const e of await readdir(path.join(dir,base),{withFileTypes:true})){if(e.name.startsWith('.'))continue;const rel=base?base+'/'+e.name:e.name;if(e.isDirectory()){dirs.push(rel);await walk(rel);}else if(e.isSymbolicLink())throw new Error('Link simbólico na distribuição.');else files.push(rel);}}
await walk();
const quote=s=>s.replaceAll('/','\\').replaceAll('$','$$').replaceAll('"','$\\"');
await writeFile(path.join(build,'uninstall-files.nsh'),files.map(f=>'Delete "$INSTDIR\\'+quote(f)+'"').concat(dirs.reverse().map(d=>'RMDir "$INSTDIR\\'+quote(d)+'"')).join('\n')+'\n');
const tool=process.env.VSYNC_MAKENSIS?{path:process.env.VSYNC_MAKENSIS}:await getMakeNsisPath();
if(process.platform!=='win32')await chmod(tool.path,0o755);
const args=['-V3','-DAPP_VERSION='+version,'-DAPP_DIR='+dir,'-DOUTPUT_FILE='+name,'installer.nsi'];
await new Promise((resolve,reject)=>{const child=spawn(tool.path,args,{cwd:build,stdio:'inherit',env:{...process.env,...tool.env}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('NSIS encerrou com código '+code)));});
await copyFile(path.join(build,name),path.join(root,'release',name));console.log('Instalador Windows alpha compilado: '+name);
