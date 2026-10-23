import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Updates,newerVersion,verifyRelease,updateUrl,type ReleaseManifest} from '../electron/core/updates';
import {AutomaticUpdates} from '../electron/core/automatic-updates';
const keys=generateKeyPairSync('ed25519');
const config={manifestUrl:'https://updates.example.com/update.json',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString(),allowedHosts:['updates.example.com']};
const content=Buffer.from('installer-test-fixture-not-executable');
const release:ReleaseManifest={schema:1,version:'0.1.2',platform:'win32',arch:'x64',url:'https://updates.example.com/installer.exe',bytes:content.length,sha256:createHash('sha256').update(content).digest('hex'),notes:'Atualização de teste.'};
const envelope=(value:unknown)=>{const b=Buffer.from(JSON.stringify(value));return{payload:b.toString('base64'),signature:sign(null,b,keys.privateKey).toString('base64')};};
test('Atualização exige manifesto assinado e origem exata, sem aceitar adulteração ou arquitetura diferente',()=>{
 assert.equal(verifyRelease(envelope(release),config).version,'0.1.2');
 const edited=envelope(release);edited.payload=Buffer.from(JSON.stringify({...release,url:'https://evil.com/setup.exe'})).toString('base64');assert.throws(()=>verifyRelease(edited,config),/Assinatura/);
 assert.throws(()=>verifyRelease(envelope({...release,url:'https://evil.com/setup.exe'}),config),/Origem/);
 assert.throws(()=>verifyRelease(envelope({...release,arch:'arm64'}),config));
 for(const url of ['http://updates.example.com/a','https://updates.example.com.evil.com/a','https://user@updates.example.com/a','https://updates.example.com:8443/a'])assert.throws(()=>updateUrl(url,config));
});
test('Comparação de versões impede downgrade e não trata 0.1.10 como menor que 0.1.9',()=>{
 assert.equal(newerVersion('0.1.10','0.1.9'),true);assert.equal(newerVersion('0.1.1','0.1.1'),false);assert.equal(newerVersion('0.1.0','0.1.1'),false);assert.throws(()=>newerVersion('0.1.2-beta','0.1.1'));
});
test('Atualizador baixa e verifica o instalador novamente antes de entregá-lo à instalação',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-update-'));
 const fetcher:typeof fetch=async(input)=>new Response(String(input).endsWith('.json')?JSON.stringify(envelope(release)):new Uint8Array(content));
 try{
  const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');assert.equal((await u.check()).state,'available');assert.equal((await u.download()).state,'ready');
  const installer=await u.installer();assert.deepEqual(await readFile(installer),content);
  await writeFile(installer,'changed');await assert.rejects(u.installer(),/alterado/);assert.equal(u.state.state,'error');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Hash inválido e redirecionamento não autorizado não deixam instalador executável',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-update-fail-'));let redirect=false;
 const fetcher:typeof fetch=async(input)=>String(input).endsWith('.json')?new Response(JSON.stringify(envelope(release))):redirect?new Response(null,{status:302,headers:{location:'https://evil.com/a.exe'}}):new Response('corrupt');
 try{const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');await u.check();assert.equal((await u.download()).state,'error');await assert.rejects(u.installer());await assert.rejects(readFile(path.join(root,'updates','Vsync-Client-Setup-0.1.2.exe.part')));redirect=true;assert.equal((await u.download()).state,'error');assert.match(u.state.error!,/Origem/);}finally{await rm(root,{recursive:true,force:true});}
});
test('Canal sem configuração não consulta rede nem afirma que está atualizado',async()=>{
 const u=new Updates({manifestUrl:'',publicKey:'',allowedHosts:[]},'0.1.1','unused',()=>{},async()=>{throw Error('não deve consultar');},'win32','x64');assert.equal((await u.check()).state,'unconfigured');await assert.rejects(u.download());
});

test('Atualização automática verifica, baixa e aguarda o jogo e as tarefas antes de instalar uma única vez',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-auto-idle-'));let idle=false,requests=0,installed=0;
 const fetcher:typeof fetch=async input=>{requests++;return new Response(String(input).endsWith('.json')?JSON.stringify(envelope(release)):new Uint8Array(content));};
 try{
  const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');
  const automatic=new AutomaticUpdates(u,{canInstall:()=>idle,install:async()=>{assert.deepEqual(await readFile(await u.installer()),content);installed++;u.installationStarted();},error:message=>assert.fail(message)});
  assert.equal((await automatic.poll()).state,'ready');assert.equal(requests,2);assert.equal(installed,0);
  await automatic.poll();assert.equal(installed,0);assert.equal(requests,2);
  idle=true;assert.equal((await automatic.poll()).state,'installing');assert.equal(installed,1);
  await automatic.poll();assert.equal(installed,1);assert.equal(requests,2);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Consulta automática repete a cada seis horas e não duplica consultas simultâneas',async()=>{
 let now=0,requests=0,releaseRequest!:()=>void;
 const requestGate=new Promise<void>(resolve=>{releaseRequest=resolve;});
 const fetcher:typeof fetch=async()=>{requests++;await requestGate;return new Response(JSON.stringify(envelope(release)));};
 const u=new Updates(config,release.version,'unused',()=>{},fetcher,'win32','x64');
 const automatic=new AutomaticUpdates(u,{canInstall:()=>assert.fail('Versão atual não deve instalar.'),install:async()=>assert.fail('Não deve instalar.'),error:message=>assert.fail(message)},()=>now);
 const first=automatic.poll();assert.equal((await automatic.poll()).state,'checking');assert.equal(requests,1);releaseRequest();
 assert.equal((await first).state,'current');now=6*60*60*1000-1;await automatic.poll();assert.equal(requests,1);
 now++;await automatic.poll();assert.equal(requests,2);
});

test('Cancelar download automático impede repetição na sessão até uma nova consulta explícita',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-auto-cancel-'));let downloads=0,installed=0,startDownload!:()=>void,finishDownload!:()=>void;
 const started=new Promise<void>(resolve=>{startDownload=resolve;}),gate=new Promise<void>(resolve=>{finishDownload=resolve;});
 const fetcher:typeof fetch=async input=>{if(String(input).endsWith('.json'))return new Response(JSON.stringify(envelope(release)));downloads++;startDownload();await gate;return new Response(new Uint8Array(content));};
 try{
  const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');
  const automatic=new AutomaticUpdates(u,{canInstall:()=>true,install:async()=>{await u.installer();installed++;u.installationStarted();},error:message=>assert.fail(message)});
  const first=automatic.poll();await started;automatic.pause();finishDownload();
  assert.equal((await first).state,'available');await automatic.poll();assert.equal(downloads,1);assert.equal(installed,0);
  assert.equal((await automatic.poll(true)).state,'installing');assert.equal(downloads,2);assert.equal(installed,1);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Falha de integridade bloqueia instalação automática e permite nova tentativa após quinze minutos',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-auto-integrity-'));let now=0,corrupt=true,installed=0,requests=0;
 const fetcher:typeof fetch=async input=>{requests++;return new Response(String(input).endsWith('.json')?JSON.stringify(envelope(release)):corrupt?'corrupt':new Uint8Array(content));};
 try{
  const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');
  const automatic=new AutomaticUpdates(u,{canInstall:()=>true,install:async()=>{await u.installer();installed++;u.installationStarted();},error:message=>assert.fail(message)},()=>now);
  assert.equal((await automatic.poll()).state,'error');assert.equal(installed,0);assert.equal(requests,2);
  corrupt=false;now=15*60*1000-1;await automatic.poll();assert.equal(requests,2);
  now++;assert.equal((await automatic.poll()).state,'installing');assert.equal(installed,1);assert.equal(requests,4);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Falha de inspeção do jogo impede instalação e é repetida sem reiniciar o download',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-auto-process-'));let now=0,inspectionFails=true,installed=0,requests=0;const errors:string[]=[];
 const fetcher:typeof fetch=async input=>{requests++;return new Response(String(input).endsWith('.json')?JSON.stringify(envelope(release)):new Uint8Array(content));};
 try{
  const u=new Updates(config,'0.1.1',root,()=>{},fetcher,'win32','x64');
  const automatic=new AutomaticUpdates(u,{canInstall:()=>{if(inspectionFails)throw new Error('Processos indisponíveis.');return true;},install:async()=>{await u.installer();installed++;u.installationStarted();},error:message=>errors.push(message)},()=>now);
  assert.equal((await automatic.poll()).state,'ready');assert.equal(installed,0);assert.deepEqual(errors,['Processos indisponíveis.']);assert.match(u.state.error!,/Processos/);
  inspectionFails=false;now=15*60*1000-1;await automatic.poll();assert.equal(installed,0);
  now++;assert.equal((await automatic.poll()).state,'installing');assert.equal(installed,1);assert.equal(requests,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
