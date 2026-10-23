import {createPrivateKey,createPublicKey,generateKeyPairSync} from 'node:crypto';
import {mkdir,readFile,writeFile,realpath} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {configureUpdates} from './configure-updates.mjs';

const repository=process.argv[2];
if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository??''))throw new Error('Uso: npm run updates:setup -- dono/repositorio [--upload].');
const root=await realpath(process.cwd());
const directory=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'VsyncClient','release-secrets');
await mkdir(directory,{recursive:true,mode:0o700});
const relative=path.relative(root,await realpath(directory));
if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('A chave privada deve ficar fora do projeto.');
if(process.platform==='win32'){
  const identity=spawnSync('whoami',[],{encoding:'utf8',windowsHide:true});
  if(identity.status!==0)throw new Error('Não foi possível identificar o usuário para proteger a pasta de chaves.');
  const acl=spawnSync('icacls',[directory,'/inheritance:r','/grant:r',identity.stdout.trim()+':(OI)(CI)F'],{encoding:'utf8',windowsHide:true});
  if(acl.status!==0)throw new Error('Não foi possível restringir o acesso à pasta de chaves.');
}
const file=path.join(directory,repository.replace('/','--')+'-ed25519.pem');
let pem;
try{pem=await readFile(file,'utf8');}catch(error){
  if(error.code!=='ENOENT')throw error;
  pem=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
  try{await writeFile(file,pem,{flag:'wx',mode:0o600});}catch(error){throw new Error('Não foi possível guardar a chave privada com exclusividade.',{cause:error});}
}
const privateKey=createPrivateKey(pem);
if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('A chave existente não é Ed25519.');
const publicKey=createPublicKey(privateKey).export({type:'spki',format:'pem'}).toString();
const config=JSON.parse(await readFile('config/distribution.json','utf8'));
if(config.updates.publicKey&&config.updates.publicKey.trim()!==publicKey.trim())throw new Error('A chave existente difere da chave pública do aplicativo. Preserve a chave original para não interromper atualizações.');
await writeFile('config/distribution.json',JSON.stringify(configureUpdates(config,repository,publicKey),null,2)+'\n');
console.log('Chave privada protegida fora do projeto: '+file);
console.log('Chave pública e canal configurados em config/distribution.json.');
if(process.argv.includes('--upload')){
  const result=spawnSync('gh',['secret','set','VSYNC_UPDATE_PRIVATE_KEY','--repo',repository],{input:pem,encoding:'utf8',windowsHide:true});
  if(result.error?.code==='ENOENT')throw new Error('Instale o GitHub CLI e execute gh auth login; depois repita com --upload. A chave foi preservada.');
  if(result.status!==0)throw new Error('O GitHub não aceitou o secret. Confira gh auth status e seu acesso ao repositório. A chave foi preservada.');
  console.log('Secret VSYNC_UPDATE_PRIVATE_KEY configurado no GitHub.');
}
