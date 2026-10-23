import {readFile, writeFile, stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash, createPrivateKey, createPublicKey, sign} from 'node:crypto';
import path from 'node:path';
import {verifyRelease} from '../electron/core/updates.ts';

const config = JSON.parse(await readFile('config/distribution.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const [installer, url, output] = process.argv.slice(2);
const privatePem = process.env.VSYNC_UPDATE_PRIVATE_KEY;
delete process.env.VSYNC_UPDATE_PRIVATE_KEY;
if (!privatePem && !process.env.VSYNC_UPDATE_PRIVATE_KEY_FILE) {
  throw new Error('Configure VSYNC_UPDATE_PRIVATE_KEY no secret do GitHub ou VSYNC_UPDATE_PRIVATE_KEY_FILE fora do projeto.');
}
let key;
try {
  key = createPrivateKey(privatePem || await readFile(process.env.VSYNC_UPDATE_PRIVATE_KEY_FILE));
} catch {
  throw new Error('A chave privada de atualizações deve ser um PEM Ed25519 válido.');
}
if (key.asymmetricKeyType !== 'ed25519') throw new Error('Use uma chave Ed25519.');
if (createPublicKey(key).export({type:'spki', format:'pem'}).toString().trim() !== config.updates.publicKey.trim()) {
  throw new Error('A chave privada não corresponde à chave pública incluída no aplicativo.');
}
if (installer === '--check') {
  console.log('Chave de assinatura corresponde à chave pública do aplicativo.');
} else {
  if (!installer || !url) throw new Error('Informe instalador e URL pública. Consulte docs/ATUALIZACOES.md.');
  const info = await stat(installer);
  if (!info.isFile() || info.size < 1 || info.size > 1_500_000_000) throw new Error('Tamanho de instalador inválido.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  const payload = Buffer.from(JSON.stringify({
    schema:1, version:pkg.version, platform:'win32', arch:'x64', url,
    sha256:hash.digest('hex'), bytes:info.size,
    notes:process.env.VSYNC_RELEASE_NOTES_FILE ? await readFile(process.env.VSYNC_RELEASE_NOTES_FILE, 'utf8') : 'Vsync Client ' + pkg.version
  }));
  const envelope = {payload:payload.toString('base64'), signature:sign(null, payload, key).toString('base64')};
  verifyRelease(envelope, config.updates);
  const destination = output || path.join(path.dirname(installer), 'windows-x64.json');
  await writeFile(destination, JSON.stringify(envelope, null, 2) + '\n');
  console.log('Manifesto assinado criado: ' + destination);
}
