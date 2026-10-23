import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_BYTES=16*1024*1024;
const exampleEnvironment=/^\.env(?:\.[\w-]+)*\.(?:example|sample|template)$/i;
const privateDirectories=new Set(['node_modules','dist','dist-electron','release','out','artifacts','coverage','.cache','.tools','.gradle','test-results','playwright-report','.aws','.azure','.ssh','secrets','credentials','private','sessions','instances','userdata','user-data','logs','crash-reports','local storage','session storage','.idea','.vscode']);
const privateNames=new Set(['.npmrc','.yarnrc','.netrc','_netrc','.pypirc','secrets.json','credentials.json','tokens.json','auth.json','state.json','state.tmp','cookies','cookies-journal']);
const localExtension=/\.(?:env|secret|secrets|key(?:\..*)?|pfx|p12|jks|keystore|crt|cer|db(?:-.*)?|sqlite3?(?:-.*)?|log|dump|dmp|zip|7z|rar|tar|gz|tgz|exe|msi|dmg|appimage|blockmap|part|tsbuildinfo)$/i;
const knownBinary=/\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf|otf|jar)$/i;

export function publicationPathProblem(filename){
 const normalized=filename.replaceAll('\\','/');
 const parts=normalized.toLowerCase().split('/');
 const name=parts.at(-1);
 if(parts.some(p=>privateDirectories.has(p))||privateNames.has(name))return 'arquivo local, credencial ou dado pessoal';
 if(parts.includes('module')&&parts.includes('build')||/^module-artifacts\/.*\.jar$/i.test(normalized))return 'artefato gerado';
 if(parts.some(p=>p==='.env'||p.startsWith('.env.')&&!exampleEnvironment.test(p)))return 'ambiente local';
 if(localExtension.test(name)||/\.pem$/i.test(name)&&!/\.pub\.pem$/i.test(name))return 'arquivo privado ou pacote gerado';
 if(/^services\/web\/releases\//i.test(normalized)&&!/^services\/web\/releases\/(?:release\.json|README\.md)$/i.test(normalized))return 'artefato de hospedagem gerado';
 return undefined;
}

function placeholder(value){
 const text=value.trim();
 return !text||/^(?:\$\{[^}]+\}|\$\{\{[^}]+\}\}|<[^>]+>)$/.test(text)||/^(?:fixture|example|sample|dummy|fake|test|placeholder)(?:[-_:]|$)/i.test(text)||/^(?:your[-_]|replace[-_]|change[-_]|insert[-_]|seu[-_]|sua[-_])/i.test(text)||/^(?:x{3,}|\*{3,}|changeme|replace_me|not[-_]set|undefined|null|true|false)$/i.test(text);
}

const secretPatterns=[
 ['chave privada',/-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/g],
 ['token GitHub',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
 ['token de serviço',/\b(?:xox[baprs]-[A-Za-z0-9-]{16,}|AIza[0-9A-Za-z_-]{30,}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,})\b/g],
 ['credencial AWS',/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
 ['token JWT',/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
 ['senha em URL',/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:'"`]+:([^\s/@'"`]+)@/gi],
 ['cabeçalho de autenticação',/\b(?:Bearer|Basic)\s+([A-Za-z0-9+/_=.-]{16,})/g]
];

// Match literal assignments only. References such as process.env.TOKEN stay public.
const assignment=/(?:["']?\b(?:[a-z0-9]+[_-])*(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|accessToken|refreshToken|clientSecret)(?:[_-][a-z0-9]+)*\b["']?)[ \t]*[:=][ \t]*(?:["'`]([^"'`\r\n]*)["'`]|([^\s,;#}\r\n]+))/gi;

export function inspectPublicationFile(filename,bytes){
 const findings=[];
 const problem=publicationPathProblem(filename);
 if(problem)findings.push({file:filename,reason:problem});
 if(bytes.length>MAX_BYTES){findings.push({file:filename,reason:'arquivo excede o limite de auditoria (16 MiB)'});return findings;}
 if(bytes.includes(0)){
  if(!knownBinary.test(filename))findings.push({file:filename,reason:'arquivo binário não reconhecido para publicação'});
  return findings;
 }
 const text=bytes.toString('utf8');
 function report(reason,index){const line=text.slice(0,index).split('\n').length;if(!findings.some(f=>f.reason===reason&&f.line===line))findings.push({file:filename,line,reason});}
 for(const [reason,pattern]of secretPatterns){
  pattern.lastIndex=0;
  for(const match of text.matchAll(pattern)){
   if(match[1]&&placeholder(match[1]))continue;
   report(reason,match.index);
  }
 }
 assignment.lastIndex=0;
 for(const match of text.matchAll(assignment)){
  const value=match[1]??match[2];
  const quoted=match[1]!==undefined;
  if(placeholder(value)||!quoted&&/\.(?:[cm]?[jt]sx?)$/i.test(filename)&&/^(?:process\.|[a-z_][\w.]*\(|[a-z_][\w.]*\??(?:\[|\.|$))/i.test(value))continue;
  if(quoted||/^[A-Za-z0-9+/=_-]{12,}$/.test(value))report('segredo literal em configuração',match.index);
 }
 return findings;
}

function git(root,args,options={}){
 const result=spawnSync('git',['-C',root,...args],{encoding:null,maxBuffer:MAX_BYTES+1024*1024,...options});
 if(result.error||result.status!==0)throw new Error('Não foi possível ler o índice Git. Inicialize o repositório e adicione os arquivos antes da auditoria.');
 return result.stdout;
}

export function checkPublication(root=process.cwd()){
 const entries=git(root,['ls-files','--stage','-z']).toString('utf8').split('\0').filter(Boolean);
 if(!entries.length)throw new Error('O índice Git está vazio; nenhum arquivo foi auditado.');
 const findings=[];
 for(const entry of entries){
  const match=/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(entry);
  if(!match)throw new Error('Entrada inesperada no índice Git.');
  const [,mode,oid,stage,filename]=match;
  if(stage!=='0'){findings.push({file:filename,reason:'conflito Git pendente'});continue;}
  if(!['100644','100755'].includes(mode)){findings.push({file:filename,reason:'links simbólicos e submódulos exigem revisão manual'});continue;}
  const size=Number(git(root,['cat-file','-s',oid]).toString('utf8').trim());
  if(!Number.isSafeInteger(size)||size>MAX_BYTES){findings.push({file:filename,reason:'arquivo excede o limite de auditoria (16 MiB)'});continue;}
  findings.push(...inspectPublicationFile(filename,git(root,['cat-file','blob',oid])));
 }
 return{files:entries.length,findings};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=checkPublication();
  if(result.findings.length){
   console.error('Publicação bloqueada. Remova os arquivos/valores privados do índice Git:');
   for(const finding of result.findings)console.error(`${JSON.stringify(finding.file)}${finding.line?':'+finding.line:''}: ${finding.reason}`);
   process.exitCode=1;
  }else console.log(`Auditoria aprovada: ${result.files} arquivos do índice Git; nenhum segredo detectado.`);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
