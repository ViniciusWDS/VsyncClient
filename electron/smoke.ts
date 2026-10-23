import type {BrowserWindow,SafeStorage} from 'electron';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import type {Store} from './core/store';

// Explicit test mode, isolated from the user's normal state. No provider login or game launch.
export async function runNativeSmoke(window:BrowserWindow,store:Store,moduleFile:string,vault:SafeStorage,phase:string){
 const checks:Record<string,boolean>={};
 const view=await window.webContents.executeJavaScript(`(async()=>{
  const end=Date.now()+10000;while(!document.querySelector('.nav-item')&&Date.now()<end)await new Promise(r=>setTimeout(r,50));
  const snapshot=await window.vsync.call('snapshot');
  const official=await window.vsync.call('official.detect');
  return{launchMode:snapshot.settings.launchMode,officialStatus:official.status,officialSupported:official.supported,title:document.title,nav:document.querySelectorAll('.nav-item').length,bridge:!!window.vsync,nodeAbsent:typeof require==='undefined'&&typeof process==='undefined',native:snapshot.system.native,clientId:snapshot.settings.clientId};
 })()`);
 checks.renderer=view.title==='Vsync Client'&&view.nav===11;
 checks.preload=view.bridge&&view.native;
 checks.rendererNodeAccessBlocked=view.nodeAbsent;
 checks.officialMode=view.launchMode==='official';
 checks.officialBridge=typeof view.officialStatus==='string'&&view.officialSupported===(process.platform==='win32');
 checks.clientId=/^[a-f0-9-]{36}$/i.test(view.clientId);
 checks.safeStorage=vault.isEncryptionAvailable()&&vault.decryptString(vault.encryptString('vsync-smoke-fixture'))==='vsync-smoke-fixture';
 const jar=new AdmZip(await readFile(moduleFile)),meta=JSON.parse(jar.readAsText('fabric.mod.json'));
 checks.hudPackaged=meta.id==='vsync-hud'&&!!jar.getEntry('com/vsync/hud/VsyncClient.class');
 if(phase==='restart')checks.profilePersistence=store.state.profiles.some(p=>p.name==='Vsync Windows QA');
 else{
  const profile=await window.webContents.executeJavaScript(`window.vsync.call('profile.create',{name:'Vsync Windows QA'})`);
  checks.profileCreate=store.state.profiles.some(p=>p.id===profile.id&&p.name==='Vsync Windows QA');
  const saved=JSON.parse(await readFile(path.join(store.root,'state.json'),'utf8'));checks.stateSaved=saved.profiles.some((p:any)=>p.id===profile.id);
 }
 const result={platform:process.platform,arch:process.arch,version:store.state.system.appVersion,phase,checkedAt:new Date().toISOString(),checks,passed:Object.values(checks).every(Boolean),limitations:['Não testa login Microsoft real.','Não executa Minecraft ou valida renderização do HUD.']};
 await mkdir(process.env.VSYNC_TEST_ROOT!,{recursive:true});await writeFile(path.join(process.env.VSYNC_TEST_ROOT!,'native-smoke-'+(phase==='restart'?'restart':'first')+'.json'),JSON.stringify(result,null,2));
 assert.ok(result.passed,'A inicialização nativa falhou. Consulte native-smoke-*.json.');
}
