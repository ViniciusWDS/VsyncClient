import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import type {SafeStorage} from 'electron';
import {Auth,authError} from '../electron/core/auth';
import {Store} from '../electron/core/store';
import {setFetch,ServiceError} from '../electron/core/network';
const id='f7b6c5c1-faef-4332-82d9-82c13e9d8446',uuid='1'.repeat(32);
// Cofre de teste isolado: testa o contrato do Auth, não substitui DPAPI do Windows.
function testVault(){const key=randomBytes(32);return {isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:(text:string)=>{const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(text),c.final(),c.getAuthTag()]);},decryptString:(b:Buffer)=>{const c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}} as unknown as SafeStorage;}
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('Login percorre PKCE, retorno local, Xbox e licença com respostas de teste; só metadados chegam ao estado',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-auth-'));const store=new Store(root,true);await store.load();store.state.settings.clientId=id;
 let challenge='',tokenExchanges=0,owned=true;const calls:string[]=[];
 setFetch((async(input:any,init:any)=>{
  const u=new URL(String(input));calls.push(u.hostname+u.pathname);
  if(u.pathname.endsWith('/token')){tokenExchanges++;const form=new URLSearchParams(init.body);assert.equal(form.get('client_id'),id);assert.equal(form.get('client_secret'),null);assert.equal(form.get('grant_type'),'authorization_code');assert.equal(createHash('sha256').update(form.get('code_verifier')!).digest('base64url'),challenge);return response({access_token:'fixture-microsoft-token',refresh_token:'fixture-refresh-token'});}
  if(u.hostname==='user.auth.xboxlive.com')return response({Token:'fixture-xbox-token'});
  if(u.hostname==='xsts.auth.xboxlive.com')return response({Token:'fixture-xsts-token',DisplayClaims:{xui:[{uhs:'fixture-userhash'}]}});
  if(u.pathname.endsWith('login_with_xbox'))return response({access_token:'fixture-minecraft-token',expires_in:3600});
  if(u.pathname.endsWith('mcstore'))return response({items:owned?[{name:'game_minecraft'}]:[]});
  if(u.pathname==='/minecraft/profile')return response({id:uuid,name:'VsyncQA'});
  throw new Error('Endpoint inesperado.');
 }) as typeof fetch);
 let auth:Auth;const vault=testVault();
 auth=new Auth(store,vault,async(raw)=>{
  const u=new URL(raw);assert.equal(u.origin,'https://login.microsoftonline.com');assert.equal(u.searchParams.get('scope'),'XboxLive.signin offline_access');assert.equal(u.searchParams.get('code_challenge_method'),'S256');challenge=u.searchParams.get('code_challenge')!;
  await assert.rejects(auth.login(),/andamento/);
  const callback=new URL(u.searchParams.get('redirect_uri')!);callback.hostname='127.0.0.1';callback.search=new URLSearchParams({state:'incorrect-fixture-state',code:'fixture-code'}).toString();assert.equal((await fetch(callback)).status,400);
  callback.searchParams.set('state',u.searchParams.get('state')!);callback.pathname='/unexpected';assert.equal((await fetch(callback)).status,400);
  callback.pathname='/';const returned=await fetch(callback);assert.equal(returned.status,200);assert.match(await returned.text(),/conferir o resultado/);
 });
 try{
  await auth.login();assert.equal(tokenExchanges,1);assert.equal(store.state.activeAccountId,uuid);assert.equal(store.state.accounts[0].name,'VsyncQA');assert.ok(calls.some(c=>c.endsWith('/entitlements/mcstore')));
  const state=await readFile(path.join(root,'state.json'),'utf8');for(const secret of ['fixture-minecraft-token','fixture-refresh-token'])assert.ok(!state.includes(secret));
  const encrypted=await readFile(path.join(root,'sessions',uuid+'.bin'));assert.ok(!encrypted.includes(Buffer.from('fixture-minecraft-token')));
  assert.equal((await auth.validate()).license,true);
  owned=false;await assert.rejects(auth.validate(),/Java Edition/);
  await auth.remove(uuid);assert.equal(store.state.accounts.length,0);await assert.rejects(readFile(path.join(root,'sessions',uuid+'.bin')));
 }finally{setFetch(globalThis.fetch);await rm(root,{recursive:true,force:true});}
});
test('Sem cofre seguro o navegador não é aberto',async()=>{
 const store=new Store('unused',false);store.state.settings.clientId=id;
 const vault={isEncryptionAvailable:()=>false} as SafeStorage;let opened=false;
 await assert.rejects(new Auth(store,vault,async()=>{opened=true;}).login(),/Armazenamento seguro/);assert.equal(opened,false);
});
test('Erros de registro, família Xbox e autorização Minecraft explicam a etapa sem expor o corpo do provedor',()=>{
 assert.match(authError(new ServiceError(400,'login.microsoftonline.com','invalid_request',50011),'Microsoft').message,/http:\/\/localhost/);
 assert.match(authError(new ServiceError(401,'xsts.auth.xboxlive.com',undefined,2148916238),'XSTS').message,/responsável/);
 assert.match(authError(new ServiceError(403,'api.minecraftservices.com'),'Minecraft').message,/Client ID/);
});
