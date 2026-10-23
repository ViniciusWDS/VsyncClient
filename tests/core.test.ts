import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import {safeChild,redact,rulesAllow} from '../electron/core/safety';
import {checkUrl,Downloads,setFetch} from '../electron/core/network';
import {dependencyPlan,Catalog} from '../electron/core/catalog';
import {extractArchive} from '../electron/core/archive';
import {Store} from '../electron/core/store';
import {parseServer} from '../electron/core/servers';
import type {Profile,ProjectVersion} from '../src/shared';
const profile={gameVersion:'1.21.1',loader:'fabric',components:[]} as unknown as Profile;
const version=(id:string,project:string,deps:any[]=[])=>({id,project_id:project,version_number:id,game_versions:['1.21.1'],loaders:['fabric'],dependencies:deps,files:[]} as unknown as ProjectVersion);
test('Arquivos importados não escapam da pasta do perfil, incluindo caminhos Windows',()=>{
 const root=path.resolve(os.tmpdir(),'vsync-profile-path-test');
 for(const entry of ['../sessions/tokens','/etc/passwd','C:/Users/file','..\\file','mods/../../state.json','mods/CON.jar','mods/a:stream.jar'])assert.throws(()=>safeChild(root,entry));
 assert.equal(safeChild(root,'mods/example.jar'),path.join(root,'mods','example.jar'));
});
test('Regras oficiais selecionam bibliotecas do Windows, com resolução personalizada',()=>{
 assert.equal(rulesAllow([{action:'allow',os:{name:'windows'}}],'windows','x64'),true);
 assert.equal(rulesAllow([{action:'allow',os:{name:'windows'}},{action:'disallow',os:{name:'windows',arch:'x86_64'}}],'windows','x64'),false);
 assert.equal(rulesAllow([{action:'allow',features:{is_demo_user:true}}],'windows','x64'),false);
 assert.equal(rulesAllow([{action:'allow',features:{has_custom_resolution:true}}],'windows','x64'),true);
});
test('Logs não exportam tokens, emails, IPs ou nomes de usuário em caminhos conhecidos',()=>{
 const cleaned=redact('Authorization: Bearer abc123 access_token=tokVALUE123 refreshToken=secretVALUE456 me@example.com C:\\Users\\Chuvim\\file /home/chuvim/data --accessToken hidden --username Chuvim 192.168.1.12');
 for(const secret of ['abc123','tokVALUE123','secretVALUE456','me@example.com','Chuvim','chuvim','hidden','192.168.1.12'])assert.ok(!cleaned.includes(secret),cleaned);
});
test('Downloads recusam origens arbitrárias e protocolos locais',()=>{
 for(const url of ['http://cdn.modrinth.com/a.jar','file:///etc/passwd','https://cdn.modrinth.com.evil.com/a','https://localhost/a','https://evil@cdn.modrinth.com/a'])assert.throws(()=>checkUrl(url));
 assert.equal(checkUrl('https://cdn.modrinth.com/data/id/file.jar').hostname,'cdn.modrinth.com');
});
test('Resolução inclui dependências transitivas e recusa versões conflitantes',async()=>{
 const api=version('api1','api');const util=version('util1','util',[{dependency_type:'required',project_id:'api',version_id:'api1'}]);const mod=version('mod1','mod',[{dependency_type:'required',project_id:'util',version_id:'util1'}]);const all:any={api1:api,util1:util};
 const plan=await dependencyPlan(mod,profile,async id=>all[id],async()=>[]);
 assert.deepEqual(plan.map(v=>v.id),['api1','util1','mod1']);
 const conflict=version('bad','bad',[{dependency_type:'required',version_id:'api2',project_id:'api'},{dependency_type:'required',version_id:'api1',project_id:'api'}]);
 await assert.rejects(dependencyPlan(conflict,profile,async id=>id==='api2'?version('api2','api'):api,async()=>[]),/versões diferentes/);
});
test('Instalação recusa mod incompatível com componente ativo',async()=>{
 const p={...profile,components:[{enabled:true,projectId:'other',versionId:'v1'}]} as Profile;
 await assert.rejects(dependencyPlan(version('v2','new',[{dependency_type:'incompatible',project_id:'other'}]),p,async()=>version('x','x'),async()=>[]),/incompatibilidade/);
});
test('ZIP não escreve através de link simbólico preexistente',async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-archive-'));
 try{
  const dest=path.join(root,'dest'),outside=path.join(root,'outside');await mkdir(dest);await mkdir(outside);
  try{await symlink(outside,path.join(dest,'mods'),'dir');}catch(e){if(process.platform==='win32'&&(e as NodeJS.ErrnoException).code==='EPERM'){t.skip('Windows sem privilégio para criar links simbólicos; execute com Modo de Desenvolvedor ou no CI Linux.');return;}throw e;}
  const zip=new AdmZip();zip.addFile('mods/evil.jar',Buffer.from('test'));const file=path.join(root,'test.zip');zip.writeZip(file);
  await assert.rejects(extractArchive(file,dest),/simbólico/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Arquivo com hash incorreto é descartado; cancelamento não deixa parcial',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-file-'));setFetch(async()=>new Response(new Uint8Array([1,2,3]),{status:200}) as any);
 const d=new Downloads(()=>{},()=>{});const dest=path.join(root,'file.jar');
 await assert.rejects(d.file('https://cdn.modrinth.com/data/test.jar',dest,new AbortController().signal,{algorithm:'sha512',value:'0'.repeat(128)}),/integridade/);
 await assert.rejects(readFile(dest));await assert.rejects(readFile(dest+'.part'));
 const controller=new AbortController();controller.abort();await assert.rejects(d.file('https://cdn.modrinth.com/data/test.jar',dest,controller.signal));await rm(root,{recursive:true,force:true});setFetch(globalThis.fetch);
});
test('Perfis e seleção persistem sem armazenar credenciais em state.json',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-store-'));const s=new Store(root,false);await s.load();s.state.profiles.push(s.create('Mundo dois'));s.state.selectedProfileId=s.state.profiles[1].id;await s.save();const next=new Store(root,false);await next.load();assert.equal(next.state.profiles.length,2);assert.equal(next.state.selectedProfileId,s.state.selectedProfileId);assert.ok(!(await readFile(path.join(root,'state.json'),'utf8')).includes('accessToken'));await rm(root,{recursive:true,force:true});
});
test('Endereços de servidores validam domínio e porta',()=>{
 assert.deepEqual(parseServer('play.example.org:25566'),{host:'play.example.org',port:25566,explicit:true});
 for(const invalid of ['https://a.com','a.com:0','a.com:99999','a.com/thing'])assert.throws(()=>parseServer(invalid));
});
test('O catálogo normaliza project_id retornado pela API oficial',async()=>{
 setFetch((async()=>new Response(JSON.stringify({hits:[{project_id:'abc123',title:'Exemplo'}],total_hits:1}),{headers:{'Content-Type':'application/json'}})) as typeof fetch);
 try{const catalog=new Catalog({} as Store,{} as Downloads,()=>{});const result=await catalog.search({query:'',type:'mod',version:'1.21.1',loader:'fabric',sort:'downloads',category:''});assert.equal(result.hits[0].id,'abc123');}finally{setFetch(globalThis.fetch);}
});
test('Atualização de componente preserva backup real e falha de hash mantém a versão anterior',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-component-'));const store=new Store(root,false);await store.load();const p=store.state.profiles[0];let release=1;const payload=()=>Buffer.from('jar-fixture-version-'+release);
 setFetch((async(input:any)=>{const u=new URL(String(input));if(u.hostname==='cdn.modrinth.com')return new Response(payload().toString());if(u.pathname.endsWith('/version'))return new Response(JSON.stringify([{...version('version'+release,'project'),files:[{filename:'example-'+release+'.jar',url:'https://cdn.modrinth.com/data/fixture.jar',size:payload().length,primary:true,hashes:{sha512:release===3?'0'.repeat(128):createHash('sha512').update(payload()).digest('hex')}}]}]));return new Response(JSON.stringify({id:'project',title:'Example',project_type:'mod'}));}) as typeof fetch);
 const downloads=new Downloads(()=>{},()=>{}),catalog=new Catalog(store,downloads,()=>{});
 const wait=async(id:string)=>{const start=Date.now();while(['queued','running'].includes(downloads.tasks.find(t=>t.id===id)!.status)){if(Date.now()-start>5000)throw new Error('Instalação de teste excedeu o tempo.');await new Promise(r=>setTimeout(r,10));}return downloads.tasks.find(t=>t.id===id)!;};
 try{
  const first=await wait(catalog.install(p.id,'project'));assert.equal(first.status,'completed',first.error);
  release=2;const second=await wait(catalog.install(p.id,'project'));assert.equal(second.status,'completed',second.error);assert.equal(p.components[0].versionId,'version2');
  const backups=await (await import('node:fs/promises')).readdir(path.join(store.dir(p.id),'.vsync-backups'));let found=false;for(const b of backups){try{const bytes=await readFile(path.join(store.dir(p.id),'.vsync-backups',b,'mods/example-1.jar'));if(bytes.toString()==='jar-fixture-version-1')found=true;}catch{}}assert.ok(found,'O backup deve conter o arquivo anterior, não só os metadados.');
  release=3;const bad=await wait(catalog.install(p.id,'project'));assert.equal(bad.status,'error');assert.equal(p.components[0].versionId,'version2');assert.equal((await readFile(path.join(store.dir(p.id),'mods/example-2.jar'))).toString(),'jar-fixture-version-2');
 }finally{setFetch(globalThis.fetch);await rm(root,{recursive:true,force:true});}
});
test('Uma dependência nova não invalida silenciosamente um mod ativo existente',async()=>{
 const p={...profile,components:[{enabled:true,projectId:'old',versionId:'old-version',name:'Old'}]} as Profile;
 const incoming=version('lib2','library'),old=version('old-version','old',[{dependency_type:'required',project_id:'library',version_id:'lib1'}]);
 await assert.rejects(dependencyPlan(incoming,p,async()=>old,async()=>[]),/exige outra versão/);
});
