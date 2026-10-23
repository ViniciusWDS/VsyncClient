import path from 'node:path';
import {createHash} from 'node:crypto';
export function safeChild(root:string,entry:string):string {
 if(!entry || entry.includes('\\') || entry.includes('\0') || /^[a-z]:/i.test(entry) || entry.startsWith('/')) throw new Error('Caminho inválido no pacote.');
 const resolved=path.resolve(root,entry); const rel=path.relative(path.resolve(root),resolved);
 if(rel.startsWith('..') || path.isAbsolute(rel) || !rel) throw new Error('O pacote tenta gravar fora da pasta permitida.');
 if(entry.split('/').some(x=>/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])([.]|$)/i.test(x) || /[:<>"|?*]/.test(x) || /[. ]$/.test(x))) throw new Error('Nome de arquivo incompatível com Windows.');
 return resolved;
}
export function safeFilename(name:string):string {if(!name||name!==path.basename(name)||name.includes('\\')||name.startsWith('.')||/[<>:"|?*\x00-\x1f]/.test(name))throw new Error('Nome de arquivo não permitido.');return name;}
export function verifyHash(bytes:Buffer,algorithm:string,expected:string):boolean {return createHash(algorithm).update(bytes).digest('hex')===expected.toLowerCase();}
export function redact(text:string):string {
 return text.replace(/Bearer\s+[^\s"',}]+/gi,'Bearer [REMOVIDO]')
 .replace(/((?:access[_-]?token|refresh[_-]?token|identityToken|RpsTicket|client[_-]?secret|authorization|password|senha|code_verifier)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1[REMOVIDO]')
 .replace(/(--(?:accessToken|uuid|username|userProperties|xuid)\s+)\S+/gi,'$1[REMOVIDO]')
 .replace(/[A-Z]:\\Users\\[^\\\s]+/gi,'[USUÁRIO]').replace(/\/(home|Users)\/[^/\s]+/g,'/[USUÁRIO]')
 .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi,'[EMAIL]')
 .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g,'[IP]');
}
export const platformName=(platform=process.platform)=>platform==='win32'?'windows':platform==='darwin'?'osx':'linux';
export interface Rule {action:'allow'|'disallow';os?:{name?:string;arch?:string;version?:string};features?:Record<string,boolean>;}
export function rulesAllow(rules:Rule[]|undefined,platform=platformName(),arch=process.arch):boolean {
 if(!rules)return true; let allow=false;
 for(const r of rules) {
  if(r.os?.name&&r.os.name!==platform)continue;
  if(r.os?.arch&& !new RegExp(r.os.arch).test(arch==='x64'?'x86_64':arch))continue;
  if(r.os?.version&&!new RegExp(r.os.version).test(process.getSystemVersion?.()??''))continue;
  if(r.features&&Object.entries(r.features).some(([k,v])=>v!==({has_custom_resolution:true,is_demo_user:false,has_quick_plays_support:false} as Record<string,boolean>)[k]))continue;
  allow=r.action==='allow';
 }return allow;
}
export function mavenPath(coordinate:string):string {
 const [id,ext='jar']=coordinate.split('@');const [group,name,version,classifier]=id.split(':');
 if(!group||!name||!version)throw new Error('Coordenada Maven inválida.');
 return `${group.replaceAll('.','/')}/${name}/${version}/${name}-${version}${classifier?'-'+classifier:''}.${ext}`;
}
