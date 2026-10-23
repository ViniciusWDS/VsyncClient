import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';

test('Canal GitHub usa URL estável, chave Ed25519 e lista exata de hosts de assets',async()=>{
  // @ts-expect-error Build helper is intentionally plain Node.js.
  const {configureUpdates}=await import('../scripts/configure-updates.mjs');
  const key=generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'}).toString();
  const config=configureUpdates({microsoftClientId:'public-client-id',updates:{publicKey:key}},'owner/vsync-client');
  assert.equal(config.microsoftClientId,'public-client-id');
  assert.equal(config.updates.manifestUrl,'https://github.com/owner/vsync-client/releases/latest/download/windows-x64.json');
  assert.equal(config.updates.publicKey,key);
  assert.deepEqual(config.updates.allowedHosts,['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']);
  for(const repo of ['https://github.com/owner/name','owner/name/other','owner/name?token=x','','../name'])assert.throws(()=>configureUpdates({},repo,key));
  assert.throws(()=>configureUpdates({},'owner/name','invalid key'));
  assert.throws(()=>configureUpdates({},'owner/name',generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({type:'spki',format:'pem'}).toString()),/Ed25519/);
});
