import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {Store} from '../electron/core/store';
import {validateProfile} from '../electron/core/validation';
test('Validação confere o JAR distribuído e não declara o HUD renderizado pela simples presença do arquivo',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'vsync-validation-'));const store=new Store(root,true);await store.load();const p=store.state.profiles[0];
 const mod=path.resolve('module-artifacts/vsync-hud-0.1.0.jar'),dir=store.dir(p.id),api=Buffer.from('fabric-api-validation-fixture');
 try{
  await mkdir(path.join(dir,'mods'),{recursive:true});await mkdir(path.join(dir,'.vsync-runtime'),{recursive:true});
  await writeFile(path.join(dir,'mods','fabric-api.jar'),api);await copyFile(mod,path.join(dir,'mods',path.basename(mod)));
  const client=path.join(root,'client-fixture.jar');await writeFile(client,'classpath-fixture');await writeFile(path.join(dir,'.vsync-runtime','runtime.json'),JSON.stringify({gameVersion:'1.21.1',loader:'fabric',javaMajor:21,libraries:[client]}));
  p.installed=true;p.components=[{id:'fixture',name:'Fabric API',projectId:'P7dR8mSH',versionId:'fixture',version:'fixture',filename:'fabric-api.jar',type:'mod',enabled:true,sha512:createHash('sha512').update(api).digest('hex'),dependencies:[]}];
  const checked=await validateProfile(store,p.id,mod);
  assert.equal(checked.checks.find(c=>c.name==='Vsync HUD instalado')?.status,'passed');assert.equal(checked.checks.find(c=>c.name==='Fabric API')?.status,'passed');assert.equal(checked.checks.find(c=>c.name==='HUD dentro do jogo')?.status,'pending');assert.equal(checked.checks.find(c=>c.name==='Execução do Minecraft')?.status,'pending');
  await writeFile(path.join(dir,'mods','fabric-api.jar'),'changed');await writeFile(path.join(dir,'mods',path.basename(mod)),'changed');
  const bad=await validateProfile(store,p.id,mod);assert.equal(bad.checks.find(c=>c.name==='Fabric API')?.status,'failed');assert.equal(bad.checks.find(c=>c.name==='Vsync HUD instalado')?.status,'failed');
 }finally{await rm(root,{recursive:true,force:true});}
});
