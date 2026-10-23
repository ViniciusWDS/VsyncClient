import {readFile, appendFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const stableVersion = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
export function validateVersion(version) {
  if (typeof version !== 'string' || !stableVersion.test(version) || version.length > 32) throw new Error('Use versão estável major.minor.patch em package.json.');
  return version;
}
export function compareVersions(a, b) {
  const left = validateVersion(a).split('.').map(Number), right = validateVersion(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
export function releaseDecision(version, releases) {
  validateVersion(version);
  const existing = releases.find(release => release.tag_name === 'v' + version);
  if (existing?.draft) throw new Error('Já existe um rascunho desta versão. Revise/remova o rascunho incompleto antes de tentar novamente.');
  if (existing) return {publish:false, reason:'Versão já publicada. Aumente package.json para lançar outra atualização.'};
  for (const release of releases) {
    const released = release.tag_name?.replace(/^v/, '');
    if (!release.draft && !release.prerelease && stableVersion.test(released || '') && compareVersions(version, released) <= 0) {
      throw new Error('A versão deve ser maior que todas as releases estáveis publicadas; downgrade de latest bloqueado.');
    }
  }
  return {publish:true, reason:'Nova versão validada para publicação.'};
}
export async function githubRequest(endpoint, options = {}, fetcher = fetch) {
  const url = new URL(endpoint, 'https://api.github.com');
  if (url.origin !== 'https://api.github.com' && url.origin !== 'https://uploads.github.com') throw new Error('Origem da API GitHub inválida.');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN ou GH_TOKEN ausente.');
  const response = await fetcher(url, {
    ...options, redirect:'error', signal:AbortSignal.timeout(120000),
    headers:{accept:'application/vnd.github+json', authorization:'Bearer ' + token, 'X-GitHub-Api-Version':'2022-11-28', ...options.headers}
  });
  if (response.status === 404 && options.allow404) return null;
  if (!response.ok) throw new Error('A API GitHub recusou a operação (HTTP ' + response.status + ').');
  return response.status === 204 ? null : response.json();
}
export async function listReleases(repository, request = githubRequest) {
  const result = [];
  for (let page = 1; page <= 100; page++) {
    const releases = await request('/repos/' + repository + '/releases?per_page=100&page=' + page);
    if (!Array.isArray(releases)) throw new Error('Resposta de releases inválida.');
    result.push(...releases);
    if (releases.length < 100) return result;
  }
  throw new Error('Limite de consulta de releases excedido; publicação cancelada.');
}
export function git(...args) {
  return execFileSync('git', args, {encoding:'utf8', stdio:['ignore', 'pipe', 'pipe']}).trim();
}
export async function releaseContext(env = process.env) {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const version = validateVersion(pkg.version), tag = 'v' + version;
  if (lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('package.json e package-lock.json devem ter a mesma versão.');
  const repository = env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error('GITHUB_REPOSITORY deve ser owner/repo.');
  if (env.GITHUB_SERVER_URL && env.GITHUB_SERVER_URL !== 'https://github.com') throw new Error('Este canal de releases usa github.com.');
  const ref = env.GITHUB_REF;
  if (ref !== 'refs/heads/main' && ref !== 'refs/tags/' + tag) throw new Error('Publique a partir de main ou da tag que coincide com package.json: ' + tag);
  const sha = git('rev-parse', 'HEAD');
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Commit de release inválido.');
  git('merge-base', '--is-ancestor', sha, 'origin/main');
  return {version, tag, repository, sha, installer:'Vsync-Client-Setup-' + version + '.exe'};
}
export async function assertTagMatches(context, request = githubRequest) {
  const ref = await request('/repos/' + context.repository + '/git/ref/tags/' + context.tag, {allow404:true});
  if (!ref) return false;
  let object = ref.object;
  for (let i = 0; object?.type === 'tag' && i < 5; i++) object = (await request('/repos/' + context.repository + '/git/tags/' + object.sha)).object;
  if (object?.type !== 'commit' || object.sha !== context.sha) throw new Error('A tag desta versão aponta para outro commit; não será movida ou sobrescrita.');
  return true;
}
export async function checkRelease() {
  const context = await releaseContext();
  const decision = releaseDecision(context.version, await listReleases(context.repository));
  // Um push em main sem aumentar a versão é apenas ignorado. Tags sempre precisam coincidir.
  if (decision.publish || process.env.GITHUB_REF?.startsWith('refs/tags/')) await assertTagMatches(context);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, Object.entries({...context, publish:String(decision.publish)}).map(([k, v]) => k + '=' + v).join('\n') + '\n');
  console.log(decision.reason);
  return {...context, ...decision};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await checkRelease(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
