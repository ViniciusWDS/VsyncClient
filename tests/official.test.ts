import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Store} from '../electron/core/store';
import {Downloads,setFetch,type Job} from '../electron/core/network';
import {OfficialLauncher,mergeOfficialProfile,officialProfileId,profileDocuments,discoverOfficial,validStoreApp,type OfficialHost,type OfficialTarget} from '../electron/core/official';
const storeApp='Microsoft.4297127D64EC6_8wekyb3d8bbwe!Minecraft';
const bytes=Buffer.from('loader-library-fixture');
const json=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
async function setup(loader:'vanilla'|'fabric'='vanilla'){
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-official-')),store=new Store(path.join(root,'vsync'),true);await store.load();const p=store.state.profiles[0];p.loader=loader;
 const mc=path.join(root,'Roaming','.minecraft');await mkdir(mc,{recursive:true});
 const old={profiles:{existing:{name:'Outro mundo',gameDir:'D:/OtherWorld',lastVersionId:'1.20.1'}},selectedProfile:'existing',settings:{keepLauncherOpen:true}};
 for(const name of ['launcher_profiles.json','launcher_profiles_microsoft_store.json'])await writeFile(path.join(mc,name),JSON.stringify(old));
 await writeFile(path.join(mc,'launcher_accounts.json'),'account-fixture-do-not-use');
 const launched:OfficialTarget[]=[];let running=false;
 const host:OfficialHost={platform:'win32',env:{APPDATA:path.dirname(mc)},storeApp:async()=>storeApp,running:async()=>running,launch:async target=>{launched.push(target);}};
 const downloads=new Downloads(()=>{store.state.tasks=downloads.tasks;},()=>{}),official=new OfficialLauncher(store,downloads,()=>{},host);
 const controller=new AbortController();const job:Job={signal:controller.signal,file:(url:string,destination:string,hash:any,size?:number)=>downloads.file(url,destination,controller.signal,hash,size),progress:()=>{},task:{id:'fixture',name:'fixture',status:'running',received:0,total:0,speed:0,detail:'fixture',canRetry:true,canPause:false}};
 const network:typeof fetch=async input=>{
  const u=new URL(String(input));
  if(u.hostname==='piston-meta.mojang.com')return json({versions:[{id:'1.21.1',type:'release'}]});
  if(u.pathname.endsWith('/profile/json'))return json({id:'fabric-loader-0.16.14-1.21.1',inheritsFrom:'1.21.1',mainClass:'net.fabricmc.loader.impl.launch.knot.KnotClient',libraries:[{name:'net.fabricmc:fixture:1.0',url:'https://maven.fabricmc.net/',sha1:createHash('sha1').update(bytes).digest('hex'),size:bytes.length}],arguments:{game:[],jvm:[]}});
  if(u.hostname==='meta.fabricmc.net')return json([{loader:{version:'0.16.14',stable:true}}]);
  if(u.hostname==='maven.fabricmc.net')return new Response(new Uint8Array(bytes));
  throw new Error('Endpoint inesperado no teste.');
 };
 return{root,store,p,mc,old,host,official,downloads,job,controller,network,launched,setRunning:(value:boolean)=>{running=value;},cleanup:async()=>{setFetch(globalThis.fetch);await rm(root,{recursive:true,force:true});}};
}
test('Vanilla cria uma entrada isolada nas duas variantes e preserva instalações, preferências e arquivo de contas',async()=>{
 const f=await setup();setFetch(f.network);
 try{const result=await f.official.prepare(f.p.id,f.job);assert.equal(result.versionId,'1.21.1');assert.equal(result.backups.length,2);
  for(const name of ['launcher_profiles.json','launcher_profiles_microsoft_store.json']){const value=JSON.parse(await readFile(path.join(f.mc,name),'utf8'));assert.deepEqual(value.profiles.existing,f.old.profiles.existing);assert.equal(value.selectedProfile,'existing');assert.deepEqual(value.settings,f.old.settings);const p=value.profiles[officialProfileId(f.p.id)];assert.equal(p.gameDir,f.store.dir(f.p.id));assert.equal(p.lastVersionId,'1.21.1');assert.equal(p.name,'Vsync • Vsync Survival');assert.match(p.javaArgs,/-Xmx4096M/);}
  assert.equal(await readFile(path.join(f.mc,'launcher_accounts.json'),'utf8'),'account-fixture-do-not-use');assert.deepEqual(f.store.state.accounts,[]);assert.equal(f.store.state.game.state,'idle');assert.equal(f.p.installed,false);assert.equal(f.p.lastPlayed,undefined);
  const backup=JSON.parse(await readFile(result.backups[0],'utf8'));assert.deepEqual(backup,f.old);
  const again=await f.official.prepare(f.p.id,f.job);assert.equal(again.backups.length,0);
 }finally{await f.cleanup();}
});
test('Fabric baixa biblioteca com hash e cria a versão herdada usada pela instalação oficial',async()=>{
 const f=await setup('fabric');f.p.loaderVersion='0.16.14';setFetch(async(input,init)=>String(input).endsWith('/versions/loader/1.21.1')?json([{loader:{version:'0.16.14',stable:false}},{loader:{version:'0.20.1',stable:true}}]):f.network(input,init));
 try{const result=await f.official.prepare(f.p.id,f.job);const file=path.join(f.mc,'versions',result.versionId,result.versionId+'.json');const meta=JSON.parse(await readFile(file,'utf8'));assert.equal(meta.inheritsFrom,'1.21.1');assert.equal(meta.id,result.versionId);assert.equal(meta.mainClass,'net.fabricmc.loader.impl.launch.knot.KnotClient');assert.deepEqual(await readFile(path.join(f.mc,'libraries/net/fabricmc/fixture/1.0/fixture-1.0.jar')),bytes);assert.equal(f.p.loaderVersion,'0.16.14');}
 finally{await f.cleanup();}
});
test('Handoff abre o alvo descoberto e mantém login e execução sem confirmação inventada',async()=>{
 const f=await setup();setFetch(f.network);
 try{await f.official.detect();const id=f.official.enqueue(f.p.id,true);const end=Date.now()+5000;while(['running','queued'].includes(f.downloads.tasks.find(t=>t.id===id)!.status)){if(Date.now()>end)throw new Error('Timeout');await new Promise(r=>setTimeout(r,10));}
  assert.equal(f.downloads.tasks.find(t=>t.id===id)!.status,'completed');assert.deepEqual(f.launched,[{kind:'store',appId:storeApp}]);assert.equal(f.store.state.official.status,'handoff');assert.equal(f.store.state.game.state,'idle');assert.equal(f.store.state.accounts.length,0);assert.equal(f.p.lastPlayed,undefined);
 }finally{await f.cleanup();}
});
test('Launcher aberto e mudança concorrente no arquivo impedem sobrescrita das instalações',async()=>{
 const f=await setup();setFetch(f.network);const file=path.join(f.mc,'launcher_profiles.json');
 try{f.setRunning(true);await assert.rejects(f.official.prepare(f.p.id,f.job),/Feche o Minecraft/);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),f.old);f.setRunning(false);
  const changed={...f.old,profiles:{...f.old.profiles,external:{name:'Criado fora do Vsync'}}};setFetch(async(input,init)=>{if(String(input).includes('piston-meta'))await writeFile(file,JSON.stringify(changed));return f.network(input,init);});
  await assert.rejects(f.official.prepare(f.p.id,f.job),/alterou as instalações/);assert.deepEqual(JSON.parse(await readFile(file,'utf8')),changed);
 }finally{await f.cleanup();}
});
test('Cancelamento e hash incorreto preservam arquivos de instalações anteriores',async()=>{
 const f=await setup('fabric');setFetch(async(input,init)=>String(input).includes('maven.fabricmc.net')?new Response('corrupt'):f.network(input,init));
 try{await assert.rejects(f.official.prepare(f.p.id,f.job),/tamanho|integridade/);assert.deepEqual(JSON.parse(await readFile(path.join(f.mc,'launcher_profiles.json'),'utf8')),f.old);await assert.rejects(readFile(path.join(f.mc,'libraries/net/fabricmc/fixture/1.0/fixture-1.0.jar.part')));f.controller.abort();await assert.rejects(f.official.prepare(f.p.id,f.job));assert.deepEqual(JSON.parse(await readFile(path.join(f.mc,'launcher_profiles.json'),'utf8')),f.old);}
 finally{await f.cleanup();}
});
test('Arquivo inválido ou pasta ainda não inicializada gera instrução sem criar configuração fictícia',async()=>{
 const f=await setup();
 try{await assert.rejects(profileDocuments(path.join(f.root,'not-initialized')),/entre na sua conta/);await writeFile(path.join(f.mc,'launcher_profiles.json'),'broken');await assert.rejects(profileDocuments(f.mc),/preservado/);assert.equal(await readFile(path.join(f.mc,'launcher_profiles.json'),'utf8'),'broken');assert.throws(()=>mergeOfficialProfile({profiles:{[officialProfileId(f.p.id)]:{gameDir:'other'}}},f.p,f.store.dir(f.p.id),'1.21.1'),/outra pasta/);}
 finally{await f.cleanup();}
});
test('Detecção aceita o AppID esperado ou executável instalado e recusa instalador ou dados de shell',async()=>{
 const f=await setup();try{assert.equal(validStoreApp(storeApp),true);for(const invalid of ['minecraft://','OtherPackage!Minecraft',storeApp+' & calc.exe'])assert.equal(validStoreApp(invalid),false);assert.deepEqual(await discoverOfficial({officialLauncherPath:''},f.host),{kind:'store',appId:storeApp});
  const exe=path.join(f.root,'MinecraftLauncher.exe');await writeFile(exe,'MZ-fixture-not-executed');assert.deepEqual(await discoverOfficial({officialLauncherPath:exe},f.host),{kind:'exe',path:exe});await assert.rejects(discoverOfficial({officialLauncherPath:path.join(f.root,'MinecraftInstaller.exe')},f.host),/não é o launcher/);assert.equal(await discoverOfficial({officialLauncherPath:''},{...f.host,platform:'linux'}),undefined);
 }finally{await f.cleanup();}
});
test('Migração mantém contas Vsync existentes e usa modo oficial quando não havia conta conectada',async()=>{
 const f=await setup();try{const file=path.join(f.store.root,'state.json'),saved=JSON.parse(await readFile(file,'utf8'));delete saved.settings.launchMode;delete saved.settings.officialLauncherPath;delete saved.settings.officialGameRoot;await writeFile(file,JSON.stringify(saved));const migrated=new Store(f.store.root,true);await migrated.load();assert.equal(migrated.state.settings.launchMode,'official');saved.accounts=[{id:'1'.repeat(32),uuid:'1'.repeat(32),name:'Fixture',expiresAt:1}];await writeFile(file,JSON.stringify(saved));const withAccount=new Store(f.store.root,true);await withAccount.load();assert.equal(withAccount.state.settings.launchMode,'vsync');assert.equal(withAccount.state.accounts[0].name,'Fixture');}
 finally{await f.cleanup();}
});
