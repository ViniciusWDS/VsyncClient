import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateVersion, compareVersions, releaseDecision, listReleases, assertTagMatches, githubRequest} from '../scripts/release-check.mjs';
import {publishRelease} from '../scripts/publish-release.mjs';
import {verifyRelease} from '../electron/core/updates.ts';

test('release exige versão estável e compara números sem downgrade', () => {
  assert.equal(compareVersions('0.1.10', '0.1.9'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(releaseDecision('0.1.3', []).publish, true);
  assert.equal(releaseDecision('0.1.3', [{tag_name:'v0.1.3', draft:false}]).publish, false);
  assert.throws(() => releaseDecision('0.1.3', [{tag_name:'v0.1.3', draft:true}]), /rascunho/);
  assert.throws(() => releaseDecision('0.1.3', [{tag_name:'v0.1.4', draft:false}]), /downgrade/);
  for (const version of ['1.2.3-beta', '01.2.3', '1.2', '1.2.3\ninjected=true', '1000000000.0.0']) assert.throws(() => validateVersion(version));
});

test('consulta todas as páginas antes de decidir qual versão pode virar latest', async () => {
  let calls = 0;
  const releases = await listReleases('example/repo', async () => ++calls === 1 ? Array.from({length:100}, () => ({tag_name:'v0.1.1'})) : [{tag_name:'v9.0.0'}]);
  assert.equal(calls, 2);
  assert.throws(() => releaseDecision('1.0.0', releases), /downgrade/);
});

test('tag existente só é aceita no mesmo commit, inclusive tag anotada', async () => {
  const context = {repository:'example/repo', tag:'v1.2.3', sha:'a'.repeat(40)};
  assert.equal(await assertTagMatches(context, async () => null), false);
  assert.equal(await assertTagMatches(context, async endpoint => endpoint.includes('/git/tags/') ? {object:{type:'commit', sha:context.sha}} : {object:{type:'tag', sha:'b'.repeat(40)}}), true);
  await assert.rejects(assertTagMatches(context, async () => ({object:{type:'commit', sha:'c'.repeat(40)}})), /outro commit/);
});

test('API nunca encaminha credencial para outra origem ou redirecionamento', async () => {
  const previous = process.env.GH_TOKEN;
  process.env.GH_TOKEN = 'test-token';
  try {
    await assert.rejects(githubRequest('https://example.com', {}, () => assert.fail('não deve consultar')), /Origem/);
    assert.equal(await githubRequest('/missing', {allow404:true}, async (url, options) => {
      assert.equal(url.origin, 'https://api.github.com');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.authorization, 'Bearer test-token');
      return new Response('', {status:404});
    }), null);
    await assert.rejects(githubRequest('/bad', {}, async () => new Response('', {status:403})), /HTTP 403/);
  } finally { if (previous === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previous; }
});

const projectRoot = path.resolve(import.meta.dirname, '..');
async function fixture(run) {
  const previousCwd = process.cwd(), envKeys = ['GITHUB_REPOSITORY', 'GITHUB_REF', 'GITHUB_SERVER_URL'];
  const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const root = await mkdtemp(path.join(tmpdir(), 'vsync-release-test-'));
  try {
    await mkdir(path.join(root, 'config'));
    await mkdir(path.join(root, 'release'));
    const keys = generateKeyPairSync('ed25519');
    const publicKey = keys.publicKey.export({format:'pem', type:'spki'}).toString();
    const version = '1.2.3', installerName = 'Vsync-Client-Setup-' + version + '.exe';
    const installer = Buffer.from('fixture-installer-not-executable');
    const manifest = {schema:1, version, platform:'win32', arch:'x64', url:'https://github.com/example/repo/releases/download/v' + version + '/' + installerName, sha256:createHash('sha256').update(installer).digest('hex'), bytes:installer.length, notes:'Fixture release'};
    const payload = Buffer.from(JSON.stringify(manifest));
    await writeFile(path.join(root, 'config/distribution.json'), JSON.stringify({updates:{publicKey, manifestUrl:'https://github.com/example/repo/releases/latest/download/windows-x64.json', allowedHosts:['github.com']}}));
    await writeFile(path.join(root, 'package.json'), JSON.stringify({version}));
    await writeFile(path.join(root, 'package-lock.json'), JSON.stringify({version, packages:{'':{version}}}));
    await writeFile(path.join(root, 'release', installerName), installer);
    await writeFile(path.join(root, 'release/windows-x64.json'), JSON.stringify({payload:payload.toString('base64'), signature:sign(null, payload, keys.privateKey).toString('base64')}));
    const git = (...args) => execFileSync('git', args, {cwd:root, stdio:'pipe', encoding:'utf8'}).trim();
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release test');
    git('config', 'user.email', 'release-test@example.invalid');
    git('add', '.');
    git('commit', '-m', 'Fixture');
    const sha = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', sha);
    process.chdir(root);
    Object.assign(process.env, {GITHUB_REPOSITORY:'example/repo', GITHUB_REF:'refs/heads/main', GITHUB_SERVER_URL:'https://github.com'});
    await run({root, keys, sha, installer, installerName, manifest});
  } finally {
    process.chdir(previousCwd);
    for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    await rm(root, {recursive:true, force:true});
  }
}

function fakeGitHub(sha, options = {}) {
  const state = {tag:false, draft:false, published:false, uploads:[], calls:[], releaseQueries:0};
  const request = async (endpoint, operation = {}) => {
    state.calls.push({endpoint, method:operation.method || 'GET'});
    if (endpoint.includes('/releases?')) {
      state.releaseQueries++;
      return options.newerDuringUpload && state.releaseQueries > 1 ? [{id:2, tag_name:'v2.0.0', draft:false}] : [];
    }
    if (endpoint.includes('/git/ref/tags/')) return state.tag ? {object:{type:'commit', sha}} : null;
    if (endpoint.endsWith('/git/refs')) { state.tag = true; return {}; }
    if (endpoint.endsWith('/releases') && operation.method === 'POST') {
      assert.equal(JSON.parse(operation.body).draft, true);
      state.draft = true;
      return {id:1};
    }
    if (endpoint.startsWith('https://uploads.github.com/')) {
      const name = new URL(endpoint).searchParams.get('name');
      state.uploads.push(name);
      return {name, state:options.failUpload ? 'new' : 'uploaded', size:operation.body.length};
    }
    if (endpoint.endsWith('/releases/1') && operation.method === 'PATCH') {
      assert.equal(state.uploads.length, 2);
      assert.deepEqual(JSON.parse(operation.body), {draft:false, make_latest:'true'});
      state.published = true;
      state.draft = false;
      return {draft:false, tag_name:'v1.2.3'};
    }
    assert.fail('Chamada inesperada: ' + endpoint);
  };
  return {state, request};
}

test('publica somente depois de manifesto verificado e uploads completos', async () => fixture(async ({sha, installerName}) => {
  const {state, request} = fakeGitHub(sha);
  await publishRelease(request);
  assert.equal(state.published, true);
  assert.deepEqual(state.uploads, [installerName, 'windows-x64.json']);
}));

test('arquivo alterado é rejeitado antes de escrever no GitHub', async () => fixture(async ({sha, installerName}) => {
  await writeFile(path.join('release', installerName), 'tampered');
  const {state, request} = fakeGitHub(sha);
  await assert.rejects(publishRelease(request), /manifesto não corresponde/);
  assert.equal(state.calls.some(call => call.method !== 'GET'), false);
}));

test('upload incompleto ou release mais nova preserva rascunho sem alterar latest', async () => fixture(async ({sha}) => {
  for (const options of [{failUpload:true}, {newerDuringUpload:true}]) {
    const {state, request} = fakeGitHub(sha, options);
    await assert.rejects(publishRelease(request), /Upload incompleto|downgrade/);
    assert.equal(state.published, false);
    assert.equal(state.draft, true);
  }
}));

test('assinatura usa secret em memória e rejeita outra chave pública', async () => fixture(async ({keys, installerName, manifest}) => {
  const command = [
    '--import', pathToFileURL(path.join(projectRoot, 'node_modules/tsx/dist/loader.mjs')).href,
    path.join(projectRoot, 'scripts/release-manifest.mjs'), path.join('release', installerName), manifest.url
  ];
  const privatePem = keys.privateKey.export({format:'pem', type:'pkcs8'}).toString();
  const check = spawnSync(process.execPath, [...command.slice(0, 3), '--check'], {encoding:'utf8', env:{...process.env, VSYNC_UPDATE_PRIVATE_KEY:privatePem}});
  assert.equal(check.status, 0, check.stderr);
  const success = spawnSync(process.execPath, command, {encoding:'utf8', env:{...process.env, VSYNC_UPDATE_PRIVATE_KEY:privatePem}});
  assert.equal(success.status, 0, success.stderr);
  const result = JSON.parse(await readFile('release/windows-x64.json', 'utf8'));
  const config = JSON.parse(await readFile('config/distribution.json', 'utf8'));
  assert.equal(verifyRelease(result, config.updates).version, '1.2.3');
  assert.throws(() => verifyRelease({...result, payload:Buffer.from('{}').toString('base64')}, config.updates), /Assinatura/);
  const otherKey = generateKeyPairSync('ed25519').privateKey.export({format:'pem', type:'pkcs8'}).toString();
  const failure = spawnSync(process.execPath, command, {encoding:'utf8', env:{...process.env, VSYNC_UPDATE_PRIVATE_KEY:otherKey}});
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /não corresponde/);
  assert.equal(check.stdout.includes('PRIVATE KEY'), false);
  assert.equal(success.stdout.includes('PRIVATE KEY'), false);
  assert.equal(failure.stderr.includes(otherKey), false);
}));
