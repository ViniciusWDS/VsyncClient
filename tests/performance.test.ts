import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../electron/core/store';
import {Performance,patchOptions} from '../electron/core/performance';
import {FPS_PRESETS,FPS_MODS,recommendedRam} from '../src/performance';
import {Catalog,dependencyPlan} from '../electron/core/catalog';
import {Downloads,setFetch} from '../electron/core/network';
async function setup(){const root=await mkdtemp(path.join(os.tmpdir(),'vsync-fps-'));const store=new Store(root,true);await store.load();store.state.system.memory=8192;const p=store.state.profiles[0];await mkdir(store.dir(p.id),{recursive:true});const file=path.join(store.dir(p.id),'options.txt');return{root,store,p,file,performance:new Performance(store,()=>{}),cleanup:()=>rm(root,{recursive:true,force:true})};}
test('FPS altera apenas opções controladas, preserva perfil vizinho e mantém backup anterior',async()=>{
 const f=await setup();try{const original='version:3955\r\nlang:pt_br\r\nkey_key.attack:key.mouse.left\r\nrenderDistance:18\r\nmaxFps:120\r\n';await writeFile(f.file,original);const neighbor=f.store.create('Outro mundo');f.store.state.profiles.push(neighbor);await mkdir(f.store.dir(neighbor.id),{recursive:true});await writeFile(path.join(f.store.dir(neighbor.id),'options.txt'),'renderDistance:24\n');
 const result=await f.performance.apply(f.p.id,FPS_PRESETS.Leve.values);const actual=await readFile(f.file,'utf8');assert.match(actual,/renderDistance:6\r\n/);assert.match(actual,/enableVsync:false/);assert.match(actual,/key_key.attack:key.mouse.left/);assert.match(actual,/lang:pt_br/);assert.equal(f.p.ram,3072);assert.equal(await readFile(path.join(f.store.dir(neighbor.id),'options.txt'),'utf8'),'renderDistance:24\n');assert.equal(await readFile(path.join(f.store.dir(f.p.id),'.vsync-fps',result.backupId,'options.txt'),'utf8'),original);
 const reload=new Store(f.root,true);await reload.load();assert.equal(reload.profile(f.p.id).performance?.preset,'Leve');
 }finally{await f.cleanup();}
});
test('Restaurar FPS recupera opções e RAM anteriores sem apagar novas preferências ou mods',async()=>{
 const f=await setup();try{await writeFile(f.file,'renderDistance:19\nmaxFps:60\nlang:pt_br\n');await f.performance.apply(f.p.id,FPS_PRESETS.Leve.values);await writeFile(f.file,(await readFile(f.file,'utf8'))+'soundCategory_music:0.4\n');const mod=path.join(f.store.dir(f.p.id),'mods');await mkdir(mod);await writeFile(path.join(mod,'my-mod.jar'),'fixture');await f.performance.restore(f.p.id);const actual=await readFile(f.file,'utf8');assert.match(actual,/renderDistance:19/);assert.match(actual,/maxFps:60/);assert.match(actual,/soundCategory_music:0.4/);assert.doesNotMatch(actual,/enableVsync:/);assert.equal(f.p.ram,4096);assert.equal(f.p.performance,undefined);assert.equal(await readFile(path.join(mod,'my-mod.jar'),'utf8'),'fixture');
 }finally{await f.cleanup();}
});
test('RAM inválida e versão não suportada não alteram o arquivo original',async()=>{
 const f=await setup();try{await writeFile(f.file,'renderDistance:16\n');await assert.rejects(f.performance.apply(f.p.id,{...FPS_PRESETS.Leve.values,ram:8192}),/Reserve/);f.p.gameVersion='1.20.1';await assert.rejects(f.performance.apply(f.p.id,FPS_PRESETS.Leve.values),/1.21.1/);assert.equal(await readFile(f.file,'utf8'),'renderDistance:16\n');
 }finally{await f.cleanup();}
});

test('FPS não escreve através de link simbólico para arquivo externo',async t=>{
 const f=await setup();try{
  const outside=path.join(f.root,'outside.txt');await writeFile(outside,'untouched');
  try{await symlink(outside,f.file);}catch(e){if(process.platform==='win32'&&(e as NodeJS.ErrnoException).code==='EPERM'){t.skip('Windows sem privilégio para criar links simbólicos; execute com Modo de Desenvolvedor ou no CI Linux.');return;}throw e;}
  await assert.rejects(f.performance.apply(f.p.id,FPS_PRESETS.Leve.values),/arquivo regular/);assert.equal(await readFile(outside,'utf8'),'untouched');
 }finally{await f.cleanup();}
});
test('Erro ao salvar o perfil reverte opções e memória; backup adulterado é recusado',async()=>{
 const f=await setup();try{const original='renderDistance:20\n';await writeFile(f.file,original);const save=f.store.save.bind(f.store);f.store.save=async()=>{throw new Error('Falha de disco fixture');};await assert.rejects(f.performance.apply(f.p.id,FPS_PRESETS.Leve.values),/disco/);assert.equal(await readFile(f.file,'utf8'),original);assert.equal(f.p.ram,4096);assert.equal(f.p.performance,undefined);f.store.save=save;const applied=await f.performance.apply(f.p.id,FPS_PRESETS.Leve.values);const backup=path.join(f.store.dir(f.p.id),'.vsync-fps',applied.backupId,'backup.json');const raw=JSON.parse(await readFile(backup,'utf8'));raw.options.hacked='x\nmalicious:true';await writeFile(backup,JSON.stringify(raw));await assert.rejects(f.performance.restore(f.p.id),/não reconhecidas/);assert.match(await readFile(f.file,'utf8'),/renderDistance:6/);
 }finally{await f.cleanup();}
});
test('Opções duplicadas são normalizadas e recomendações preservam memória do sistema',()=>{assert.equal(patchOptions('lang:pt_br\nrenderDistance:8\nrenderDistance:32\n',{renderDistance:'6'}),'lang:pt_br\nrenderDistance:6\n');assert.equal(recommendedRam(4096,'Qualidade'),2048);assert.equal(recommendedRam(16384,'Leve'),3072);});
test('Lote de otimizações resolve dependência comum e impede conflitos entre dois itens selecionados',async()=>{
 const f=await setup();try{const version=(id:string,project_id:string,deps:any[]=[])=>({id,project_id,name:id,version_number:'1',changelog:'',game_versions:['1.21.1'],loaders:['fabric'],date_published:'',dependencies:deps,files:[]});const shared=version('shared-v','shared');const a=version('a-v','a',[{project_id:'shared',version_id:'shared-v',dependency_type:'required'}]);const b=version('b-v','b',[{project_id:'shared',version_id:'shared-v',dependency_type:'required'}]);const plan=await dependencyPlan([a,b],f.p,async()=>shared,async()=>[shared]);assert.equal(plan.length,3);assert.equal(plan.filter(v=>v.id==='shared-v').length,1);b.dependencies.push({project_id:'a',version_id:null,dependency_type:'incompatible'});await assert.rejects(dependencyPlan([a,b],f.p,async()=>shared,async()=>[shared]),/incompatibilidade/);
 }finally{await f.cleanup();}
});
test('Otimizações são preparadas juntas; hash incorreto não instala parcialmente',async()=>{
 const f=await setup();const bytes=Buffer.from('fixture-verified-mod'),hash=createHash('sha512').update(bytes).digest('hex');let corrupt=true;const projects=FPS_MODS.slice(0,2).map(x=>x.id);const versions=projects.map((project_id,i)=>({id:'fixture-v'+i,project_id,name:'mod',version_number:'1',version_type:'release',changelog:'',game_versions:['1.21.1'],loaders:['fabric'],date_published:'',dependencies:[],files:[{url:'https://cdn.modrinth.com/data/'+project_id+'.jar',filename:project_id+'.jar',primary:true,size:bytes.length,hashes:{sha512:hash,sha1:''}}]}));const downloads=new Downloads(()=>{},()=>{});const catalog=new Catalog(f.store,downloads,()=>{});
 setFetch(async input=>{const u=new URL(String(input));if(u.hostname==='cdn.modrinth.com')return new Response(new Uint8Array(corrupt&&u.pathname.includes(projects[1])?Buffer.alloc(bytes.length):bytes));const index=projects.findIndex(id=>u.pathname.includes(id));if(index<0)throw new Error('Unexpected fixture URL');return new Response(JSON.stringify(u.pathname.includes('/version')?[versions[index]]:{id:projects[index],title:'Fixture '+index,project_type:'mod'}));});
 const wait=async(id:string)=>{const until=Date.now()+5000;while(['queued','running'].includes(downloads.tasks.find(t=>t.id===id)!.status)){if(Date.now()>until)throw new Error('Timeout');await new Promise(r=>setTimeout(r,10));}return downloads.tasks.find(t=>t.id===id)!;};
 try{f.p.loaderVersion='0.14.21';assert.throws(()=>catalog.installPerformance(f.p.id,projects),/0.16.14/);f.p.loaderVersion='0.16.14';const failed=await wait(catalog.installPerformance(f.p.id,projects));assert.equal(failed.status,'error');assert.match(failed.error!,/integridade/);assert.equal(f.p.components.length,0);assert.equal((await readdir(f.store.dir(f.p.id))).some(x=>x.startsWith('.vsync-staging')),false);corrupt=false;const success=await wait(catalog.installPerformance(f.p.id,projects));assert.equal(success.status,'completed');assert.equal(f.p.components.length,2);assert.equal(await readFile(path.join(f.store.dir(f.p.id),'mods',projects[0]+'.jar'),'utf8'),bytes.toString());
 }finally{setFetch(globalThis.fetch);await f.cleanup();}
});
