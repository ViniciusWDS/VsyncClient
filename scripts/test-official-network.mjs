import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {Store} from '../electron/core/store.ts';
import {Downloads} from '../electron/core/network.ts';
import {OfficialLauncher} from '../electron/core/official.ts';
// Consulta APIs reais e verifica downloads em pasta temporária. Não abre software nem autentica.
const root=await mkdtemp(path.join(os.tmpdir(),'vsync-official-network-'));
const result={version:'0.1.2',platform:process.platform,checkedAt:new Date().toISOString(),network:'real',nativeHost:'simulated',officialLauncherExecuted:false,loginTested:false,gameTested:false,passed:false};
try{
 const store=new Store(path.join(root,'vsync'),true);await store.load();const p=store.state.profiles[0];p.loader='fabric';p.loaderVersion='0.16.14';
 const mc=path.join(root,'Roaming','.minecraft');await mkdir(mc,{recursive:true});
 for(const name of ['launcher_profiles.json','launcher_profiles_microsoft_store.json'])await writeFile(path.join(mc,name),JSON.stringify({profiles:{untouched:{name:'Network test fixture'}}}));
 const host={platform:'win32',env:{APPDATA:path.dirname(mc)},storeApp:async()=>undefined,running:async()=>false,launch:async()=>{throw new Error('O teste de rede não executa o launcher.');}};
 const downloads=new Downloads(()=>{},()=>{}),official=new OfficialLauncher(store,downloads,()=>{},host),controller=new AbortController();let verified=0,downloaded=0;
 const job={signal:AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]),task:{id:'network-fixture',name:'network-fixture',status:'running',received:0,total:0,speed:0,detail:'network-fixture',canRetry:false,canPause:false},progress:()=>{},file:async(url,file,hash,size)=>{await downloads.file(url,file,controller.signal,hash,size);verified++;downloaded+=(await stat(file)).size;}};
 const prepared=await official.prepare(p.id,job);const meta=JSON.parse(await readFile(path.join(mc,'versions',prepared.versionId,prepared.versionId+'.json'),'utf8'));
 assert.equal(meta.inheritsFrom,'1.21.1');assert.equal(verified,meta.libraries.length);assert.ok(verified>0);assert.equal(store.state.accounts.length,0);
 Object.assign(result,{passed:true,minecraft:'1.21.1',loader:'Fabric 0.16.14',verifiedLibraries:verified,downloadedBytes:downloaded,profileFilesPrepared:2});
}catch(e){result.error=e.message;process.exitCode=1;}
finally{await mkdir('test-results',{recursive:true});await writeFile('test-results/official-network.json',JSON.stringify(result,null,2)+'\n');await rm(root,{recursive:true,force:true});}
console.log(JSON.stringify(result,null,2));
