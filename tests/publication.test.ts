import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

// The publication scanner is also executable directly by Node in release CI.
let scanner:{publicationPathProblem:(file:string)=>string|undefined;inspectPublicationFile:(file:string,bytes:Buffer)=>unknown[];checkPublication:(root:string)=>{files:number;findings:{file:string;reason:string}[]}};
before(async()=>{scanner=await import('../scripts/check-publication.mjs' as string);});
const inspect=(file:string,text:string)=>scanner.inspectPublicationFile(file,Buffer.from(text));
const environmentLine=(name:string,value:string)=>[name,'=',value].join('');
const productionCredential=['production','credential','value'].join('-');

test('Auditoria rejeita ambientes privados, sessões, bancos e instaladores, preservando recursos e exemplos',()=>{
 for(const file of ['.env','.env.production','services/web/.env.local','signing/private.pem','signing/private.key.bak','signing/cert.pfx','sessions/player.bin','instances/profile/options.txt','userdata/config.json','state.json','test-results/report.json','accounts.sqlite3','module-artifacts/vsync.jar','services/web/releases/update.json','installer.exe'])assert.ok(scanner.publicationPathProblem(file),file);
 for(const file of ['.env.example','.env.production.example','config/distribution.json','build/icon.ico','build/installer.nsi','module/gradle/wrapper/gradle-wrapper.jar','docs/ATUALIZACOES.md','config/updates.pub.pem','services/web/releases/release.json'])assert.equal(scanner.publicationPathProblem(file),undefined,file);
});

test('Auditoria detecta chaves privadas e credenciais literais sem devolver seus valores',()=>{
 const privateKey=generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}).toString();
 const githubCredential=['ghp','_','aB29'.repeat(10)].join('');
 const samples=[privateKey,`const value='${githubCredential}';`,JSON.stringify({accessToken:productionCredential}),environmentLine('VSYNC_UPDATE_PRIVATE_KEY',productionCredential),new URL('https://host.invalid').protocol+'//owner:'+productionCredential+'@host.invalid'];
 for(const content of samples){const findings=inspect('config/example.txt',content);assert.ok(findings.length,content.slice(0,10));assert.ok(findings.every(f=>!JSON.stringify(f).includes(productionCredential)&&!JSON.stringify(f).includes(githubCredential)));}
 // An example filename never bypasses the content check.
 assert.ok(inspect('.env.example',environmentLine('API_KEY',productionCredential)).length);
});

test('Auditoria aceita placeholders, chaves públicas e referências a variáveis de ambiente',()=>{
 const publicKey=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
 const content=[environmentLine('API_KEY',''),environmentLine('TOKEN','your-token-here'),environmentLine('API_KEY','<your-key>'),environmentLine('CLIENT_SECRET','${CLIENT_SECRET}'),"const accessToken='fixture-microsoft-token';",'const token=process.env.GITHUB_TOKEN;',"const key='${{ secrets.RELEASE_KEY }}';",publicKey].join('\n');
 assert.deepEqual(inspect('.env.example',content),[]);
});

test('Auditoria lê o conteúdo indexado e falha com índice vazio ou segredo adicionado à força',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-publication-'));
 const git=(...args:string[])=>{const result=spawnSync('git',['-C',root,...args],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);};
 try{
  git('init','--quiet');assert.throws(()=>scanner.checkPublication(root),/vazio/);
  await writeFile(path.join(root,'config.txt'),environmentLine('API_KEY',productionCredential)+'\n');git('add','config.txt');
  await writeFile(path.join(root,'config.txt'),environmentLine('API_KEY','')+'\n');
  assert.ok(scanner.checkPublication(root).findings.some((f:{file:string})=>f.file==='config.txt'));
  git('add','config.txt');assert.deepEqual(scanner.checkPublication(root).findings,[]);
  await writeFile(path.join(root,'.env'),'CLIENT_ID=public-id\n');git('add','--force','.env');
  assert.ok(scanner.checkPublication(root).findings.some((f:{file:string})=>f.file==='.env'));
 }finally{await rm(root,{recursive:true,force:true});}
});
