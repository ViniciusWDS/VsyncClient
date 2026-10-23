import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {getMakeNsisPath} from 'app-builder-lib/out/toolsets/windows.js';
import {launchUpdateInstaller} from '../electron/core/update-install.ts';

// A harmless NSIS fixture records its parsed destination. It never installs,
// registers, launches or removes the real application.
if(process.platform!=='win32')throw new Error('Execute este teste no Windows.');
const root=await mkdtemp(path.join(os.tmpdir(),'Vsync update native '));
const installer=path.join(root,'fixture setup.exe'),record=path.join(root,'destination.txt'),script=path.join(root,'fixture.nsi');
const nsisQuote=value=>value.replaceAll('$','$$').replaceAll('"','$\\"');
try{
 await writeFile(script,[
  'Unicode true','RequestExecutionLevel user','Name "Vsync updater regression fixture"',
  'OutFile "'+nsisQuote(installer)+'"','InstallDir "$TEMP\\Vsync fallback directory"',
  'Section','FileOpen $0 "'+nsisQuote(record)+'" w','FileWrite $0 "$INSTDIR"','FileClose $0','SectionEnd',''
 ].join('\n'));
 const tool=await getMakeNsisPath();
 await new Promise((resolve,reject)=>{
  const child=spawn(tool.path,['-V2',script],{windowsHide:true,stdio:'inherit',env:{...process.env,...tool.env}});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('NSIS encerrou com código '+code)));
 });
 const executable=path.join(root,'app with spaces','Vsync Client.exe');
 await launchUpdateInstaller(installer,executable);
 let recorded;
 for(let i=0;i<100;i++){
  try{recorded=await readFile(record,'utf8');if(recorded)break;}catch(e){if(e.code!=='ENOENT')throw e;}
  await delay(100);
 }
 assert.equal(recorded,path.dirname(executable),'NSIS precisa interpretar /D sem aspas e preservar espaços no destino.');
 console.log('NSIS nativo: instalador e destino com espaços preservados pelo fluxo automático.');
}finally{
 assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
 await rm(root,{recursive:true,force:true});
}
