import {createPublicKey} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function configureUpdates(config,repository,publicKey=config.updates?.publicKey){
  if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository??''))throw new Error('Informe o repositório GitHub como dono/nome.');
  const key=createPublicKey(publicKey??'');
  if(key.asymmetricKeyType!=='ed25519')throw new Error('A chave pública de atualização deve ser Ed25519.');
  return {...config,updates:{
    manifestUrl:`https://github.com/${repository}/releases/latest/download/windows-x64.json`,
    publicKey:key.export({type:'spki',format:'pem'}).toString(),
    allowedHosts:['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']
  }};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const file='config/distribution.json';
  const config=JSON.parse(await readFile(file,'utf8'));
  const configured=configureUpdates(config,process.argv[2]||process.env.GITHUB_REPOSITORY,process.env.VSYNC_UPDATE_PUBLIC_KEY||config.updates?.publicKey);
  await writeFile(file,JSON.stringify(configured,null,2)+'\n');
  console.log('Canal de atualização configurado: '+configured.updates.manifestUrl);
}
