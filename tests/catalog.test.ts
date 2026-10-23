import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Catalog} from '../electron/core/catalog';
import {Downloads,setFetch} from '../electron/core/network';
import {Store} from '../electron/core/store';
import type {Profile,ProjectVersion,SearchQuery} from '../src/shared';
import {FPS_MODS} from '../src/performance';
import {RECOMMENDED_MODS,recommendedProject} from '../src/mods';

const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const version=(project:string,changes:Partial<ProjectVersion>={}):ProjectVersion&{project_id:string;version_type:string}=>({id:project+'-v1',project_id:project,version_type:'release',name:'Stable',version_number:'1.0',changelog:'',game_versions:['1.21.1'],loaders:['fabric'],date_published:'2026-10-23T00:00:00Z',dependencies:[],files:[],...changes});
const profile={id:'fixture',gameVersion:'1.21.1',loader:'fabric',components:[]} as unknown as Profile;
const wait=async(downloads:Downloads,id:string)=>{const start=Date.now();for(;;){const task=downloads.tasks.find(task=>task.id===id)!;if(!['queued','running'].includes(task.status))return task;if(Date.now()-start>5000)throw new Error('A instalação de teste excedeu o tempo.');await new Promise(resolve=>setTimeout(resolve,10));}};

test('Catálogo encaminha paginação e mantém filtros e normalização de IDs',async()=>{
 const urls:URL[]=[];
 setFetch(async(input)=>{const url=new URL(String(input));urls.push(url);const offset=Number(url.searchParams.get('offset'));return response({hits:[{project_id:'project-'+offset,title:'Página '+offset}],total_hits:73});});
 try{
  const catalog=new Catalog({} as Store,{} as Downloads,()=>{});
  const query:SearchQuery={query:'map',type:'mod',version:'1.21.1',loader:'fabric',sort:'downloads',category:'utility'};
  const first=await catalog.search(query),next=await catalog.search({...query,offset:24});
  assert.equal(first.hits[0].id,'project-0');assert.equal(next.hits[0].id,'project-24');assert.equal(next.total_hits,73);
  assert.equal(urls[1].searchParams.get('limit'),'24');assert.equal(urls[1].searchParams.get('offset'),'24');
  assert.deepEqual(JSON.parse(urls[1].searchParams.get('facets')!),[['project_type:mod'],['versions:1.21.1'],['categories:fabric'],['categories:utility']]);
  for(const offset of [-1,1.5,Number.NaN,Number.MAX_SAFE_INTEGER+1])await assert.rejects(catalog.search({...query,offset}),/Página/);
  assert.equal(urls.length,2,'Offsets inválidos não devem consultar a rede.');
 }finally{setFetch(globalThis.fetch);}
});

test('Coleção inclui nove otimizações e treze sugestões opcionais sem IDs duplicados',()=>{
 assert.equal(FPS_MODS.length,9);assert.equal(RECOMMENDED_MODS.length,22);
 assert.equal(new Set(RECOMMENDED_MODS.map(mod=>mod.id)).size,22);
 assert.ok(FPS_MODS.every(mod=>RECOMMENDED_MODS.some(item=>item.id===mod.id)));
 assert.equal(recommendedProject(RECOMMENDED_MODS[0]).project_type,'mod');
});

test('Compatibilidade da coleção considera versão estável, loader, Minecraft e falha de consulta por mod',async()=>{
 const ids=['AANobbMI','EsAfCjCV','YL57xq9U','nmDcB62a'];
 setFetch(async(input)=>{const url=new URL(String(input));assert.deepEqual(JSON.parse(url.searchParams.get('game_versions')!),['1.21.1']);const id=url.pathname.split('/')[3];
  if(id===ids[3])return response({},404);
  if(id===ids[0])return response([version(id)]);
  if(id===ids[1])return response([{...version(id),version_type:'beta'},version(id,{loaders:['neoforge']})]);
  return response([version(id,{game_versions:['1.20.1']})]);
 });
 try{
  const catalog=new Catalog({} as Store,{} as Downloads,()=>{}),result=await catalog.collectionCompatibility(profile,ids);
  assert.deepEqual(result.map(item=>item.id),ids);assert.deepEqual(result.map(item=>item.compatible),[true,false,false,false]);
  assert.equal(result[0].version,'1.0');assert.match(result[3].reason!,/consultar/);
  setFetch(async()=>{throw new Error('Vanilla não deve consultar versões de mods.');});
  const vanilla=await catalog.collectionCompatibility({...profile,loader:'vanilla'},ids);assert.ok(vanilla.every(item=>!item.compatible));
  await assert.rejects(catalog.collectionCompatibility(profile,['unknown']),/inválida/);
  await assert.rejects(catalog.collectionCompatibility(profile,[ids[0],ids[0]]),/inválida/);
 }finally{setFetch(globalThis.fetch);}
});

test('Instalação em lote resolve dependência compartilhada uma vez e verifica todos os arquivos',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-collection-'));const store=new Store(root,false);await store.load();const p=store.state.profiles[0];
 const roots=['AANobbMI','EsAfCjCV'],dependency='fixture-api',downloaded:string[]=[];
 const payload=(id:string)=>Buffer.from('fixture-mod-'+id);
 setFetch(async(input)=>{const url=new URL(String(input));
  if(url.hostname==='cdn.modrinth.com'){const id=path.posix.basename(url.pathname,'.jar');downloaded.push(id);return new Response(payload(id));}
  const id=url.pathname.split('/')[3];
  if(url.pathname.endsWith('/version'))return response([version(id,{dependencies:roots.includes(id)?[{project_id:dependency,version_id:null,dependency_type:'required'}]:[],files:[{filename:id+'.jar',url:'https://cdn.modrinth.com/data/'+id+'.jar',size:payload(id).length,primary:true,hashes:{sha512:createHash('sha512').update(payload(id)).digest('hex'),sha1:''}}]})]);
  return response({id,title:id,project_type:'mod'});
 });
 try{
  const downloads=new Downloads(()=>{},()=>{}),catalog=new Catalog(store,downloads,()=>{});
  const result=await wait(downloads,catalog.installCollection(p.id,roots));assert.equal(result.status,'completed',result.error);
  assert.equal(downloaded.filter(id=>id===dependency).length,1);assert.equal(p.components.length,3);
  for(const id of [...roots,dependency])assert.deepEqual(await readFile(path.join(store.dir(p.id),'mods',id+'.jar')),payload(id));
  assert.throws(()=>catalog.installCollection(p.id,[roots[0],roots[0]]),/inválida/);
 }finally{setFetch(globalThis.fetch);await rm(root,{recursive:true,force:true});}
});

test('Conflito declarado entre selecionados interrompe o lote antes de baixar ou alterar o perfil',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-collection-conflict-'));const store=new Store(root,false);await store.load();const p=store.state.profiles[0],roots=['AANobbMI','YL57xq9U'];let downloaded=false;
 setFetch(async(input)=>{const url=new URL(String(input));if(url.hostname==='cdn.modrinth.com'){downloaded=true;throw new Error('Não deve baixar.');}const id=url.pathname.split('/')[3];return url.pathname.endsWith('/version')?response([version(id,{dependencies:id===roots[0]?[{project_id:roots[1],version_id:null,dependency_type:'incompatible'}]:[]})]):response({id,title:id,project_type:'mod'});});
 try{
  const downloads=new Downloads(()=>{},()=>{}),catalog=new Catalog(store,downloads,()=>{}),result=await wait(downloads,catalog.installCollection(p.id,roots));
  assert.equal(result.status,'error');assert.match(result.error!,/incompatibilidade/);assert.equal(downloaded,false);assert.deepEqual(p.components,[]);
 }finally{setFetch(globalThis.fetch);await rm(root,{recursive:true,force:true});}
});
