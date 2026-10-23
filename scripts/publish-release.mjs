import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {releaseContext, releaseDecision, listReleases, assertTagMatches, githubRequest} from './release-check.mjs';
import {verifyRelease} from '../electron/core/updates.ts';

export async function publishRelease(request = githubRequest) {
  const context = await releaseContext();
  const decision = releaseDecision(context.version, await listReleases(context.repository, request));
  if (!decision.publish) throw new Error('A versão foi publicada durante o build. Nada será sobrescrito.');
  const config = JSON.parse(await readFile('config/distribution.json', 'utf8'));
  const manifestBytes = await readFile('release/windows-x64.json');
  const manifest = verifyRelease(JSON.parse(manifestBytes.toString('utf8')), config.updates);
  const installer = await readFile('release/' + context.installer);
  const expectedUrl = 'https://github.com/' + context.repository + '/releases/download/' + context.tag + '/' + context.installer;
  if (manifest.version !== context.version || manifest.url !== expectedUrl || manifest.bytes !== installer.length || manifest.sha256 !== createHash('sha256').update(installer).digest('hex')) throw new Error('O manifesto não corresponde ao instalador/tag desta release.');
  if (!await assertTagMatches(context, request)) {
    await request('/repos/' + context.repository + '/git/refs', {method:'POST', body:JSON.stringify({ref:'refs/tags/' + context.tag, sha:context.sha}), headers:{'content-type':'application/json'}});
  }
  const base = '/repos/' + context.repository + '/releases';
  const release = await request(base, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({tag_name:context.tag, target_commitish:context.sha, name:'Vsync Client ' + context.version, body:manifest.notes, draft:true, prerelease:false})});
  if (!Number.isSafeInteger(release.id)) throw new Error('Identificador da release inválido.');
  // Publique somente depois dos dois uploads. Nunca substitua assets existentes.
  const upload = 'https://uploads.github.com/repos/' + context.repository + '/releases/' + release.id + '/assets?name=';
  for (const [name, bytes, contentType] of [[context.installer, installer, 'application/octet-stream'], ['windows-x64.json', manifestBytes, 'application/json']]) {
    const asset = await request(upload + encodeURIComponent(name), {method:'POST', headers:{'content-type':contentType}, body:bytes});
    if (asset.state !== 'uploaded' || asset.size !== bytes.length || asset.name !== name) throw new Error('Upload incompleto. O rascunho será preservado para revisão.');
  }
  // Evita promover uma versão antiga se outro publicador tiver agido durante os uploads.
  const otherReleases = (await listReleases(context.repository, request)).filter(item => item.id !== release.id);
  if (!releaseDecision(context.version, otherReleases).publish) throw new Error('Publicação concorrente detectada; rascunho preservado.');
  if (!await assertTagMatches(context, request)) throw new Error('A tag desapareceu durante a publicação; rascunho preservado.');
  const published = await request(base + '/' + release.id, {method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({draft:false, make_latest:'true'})});
  if (published.draft || published.tag_name !== context.tag) throw new Error('Não foi possível confirmar a publicação da release.');
  console.log('Release publicada: https://github.com/' + context.repository + '/releases/tag/' + context.tag);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await publishRelease(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
