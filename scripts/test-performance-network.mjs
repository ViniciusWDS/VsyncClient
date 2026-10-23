import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import {Store} from '../electron/core/store.ts';
import {Downloads} from '../electron/core/network.ts';
import {Catalog} from '../electron/core/catalog.ts';
import {FPS_MODS} from '../src/performance.ts';
const {version}=JSON.parse(await readFile('package.json','utf8'));
const root=await mkdtemp(path.join(os.tmpdir(),'vsync-fps-network-'));
const result={version,checkedAt:new Date().toISOString(),network:'real',gameVersion:'1.21.1',loader:'fabric',gameExecuted:false,fpsMeasured:false,passed:false};
try{
 const store=new Store(root,true);await store.load();const p=store.state.profiles[0];const downloads=new Downloads(()=>{},()=>{});const catalog=new Catalog(store,downloads,()=>{});
 const availability=await catalog.performanceCompatibility(p);assert.equal(availability.filter(x=>x.compatible).length,FPS_MODS.length);
 const id=catalog.installPerformance(p.id,FPS_MODS.map(m=>m.id));const until=Date.now()+240000;let task;
 do{task=downloads.tasks.find(t=>t.id===id);if(Date.now()>until)throw new Error('Timeout');if(['running','queued'].includes(task.status))await new Promise(r=>setTimeout(r,100));}while(['running','queued'].includes(task.status));
 assert.equal(task.status,'completed',task.error);assert.ok(FPS_MODS.every(m=>p.components.some(c=>c.projectId===m.id&&c.enabled)));
 result.components=[];
 for(const c of p.components){const bytes=await readFile(path.join(store.dir(p.id),'mods',c.filename));const zip=new AdmZip(bytes);const entry=zip.getEntry('fabric.mod.json');const meta=entry?JSON.parse(entry.getData().toString('utf8')):{};result.components.push({name:c.name,version:c.version,bytes:bytes.length,sha512:c.sha512,fabricLoaderRequired:meta.depends?.fabricloader??null,minecraftRequired:meta.depends?.minecraft??null});}
 result.passed=true;
}catch(e){result.error=e.message;process.exitCode=1;}finally{await rm(root,{recursive:true,force:true});await mkdir('test-results',{recursive:true});await writeFile('test-results/performance-network.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));}
