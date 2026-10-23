import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';

const root=path.dirname(fileURLToPath(import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.ico':'image/x-icon','.exe':'application/octet-stream'};
const baseHeaders={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"};
const json=(res,status,value,headers={})=>{const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(body);};
async function regular(file){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink())throw new Error('Arquivo inválido.');return s;}
export async function readRelease(releases){
 try{const metaFile=path.join(releases,'release.json');const stat=await regular(metaFile);if(stat.size>64000)throw new Error();const meta=JSON.parse(await readFile(metaFile,'utf8'));
  if(!/^\d+\.\d+\.\d+$/.test(meta.version))throw new Error();
  const data={version:meta.version,available:false,notes:Array.isArray(meta.notes)?meta.notes.filter(s=>typeof s==='string').slice(0,20):[],signed:meta.signed===true,windowsValidated:meta.windowsValidated===true};
  if(!/^Vsync-Client-Setup-\d+\.\d+\.\d+\.exe$/.test(meta.filename)||meta.filename!==`Vsync-Client-Setup-${meta.version}.exe`||!/^[a-f0-9]{64}$/.test(meta.sha256))return data;
  const file=path.join(releases,meta.filename),s=await regular(file);if(s.size!==meta.bytes||s.size>1_500_000_000)throw new Error();const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);if(hash.digest('hex')!==meta.sha256)throw new Error();
  return{...data,available:true,filename:meta.filename,bytes:s.size,sha256:meta.sha256,url:'/downloads/windows'};
 }catch{return{version:'0.1.2',available:false,notes:[],signed:false,windowsValidated:false};}
}
export function byteRange(raw,size){
 if(!raw)return null;const match=/^bytes=(\d*)-(\d*)$/.exec(raw);if(!match||!match[1]&&!match[2])throw new Error('range');
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));let end=match[1]&&match[2]?Number(match[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||!match[1]&&Number(match[2])===0)throw new Error('range');return{start,end:Math.min(end,size-1)};
}
async function sendFile(req,res,file,{download=false,etag}={}){
 const s=await regular(file);const tag=etag??`"${s.size.toString(16)}-${Math.floor(s.mtimeMs).toString(16)}"`;
 if(req.headers['if-none-match']===tag){res.writeHead(304,{ETag:tag});res.end();return;}
 let range;try{range=byteRange(req.headers['if-range']&&req.headers['if-range']!==tag?undefined:req.headers.range,s.size);}catch{res.writeHead(416,{'Content-Range':`bytes */${s.size}`});res.end();return;}
 const headers={'Content-Type':mime[path.extname(file)]??'application/octet-stream','Content-Length':range?range.end-range.start+1:s.size,ETag:tag,'Accept-Ranges':'bytes','Cache-Control':download?'public, max-age=3600':'public, max-age=300'};
 if(download)headers['Content-Disposition']=`attachment; filename="${path.basename(file)}"`;
 if(range)headers['Content-Range']=`bytes ${range.start}-${range.end}/${s.size}`;
 res.writeHead(range?206:200,headers);if(req.method==='HEAD'){res.end();return;}
 try{await pipeline(createReadStream(file,range??undefined),res);}catch(e){if(!res.destroyed)res.destroy();}
}
export async function createApp({publicDir=path.join(root,'public'),releasesDir=path.join(root,'releases')}={}){
 const release=await readRelease(releasesDir);
 const server=http.createServer(async(req,res)=>{
  for(const[k,v]of Object.entries(baseHeaders))res.setHeader(k,v);
  try{
   if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Método não permitido.'},{Allow:'GET, HEAD'});return;}
   const u=new URL(req.url,'http://localhost');const name=decodeURIComponent(u.pathname);if(/[\\\0]/.test(name))throw new Error();
   if(name==='/api/health'){json(res,200,{status:'ok',service:'vsync-website',version:'0.1.2'});return;}
   if(name==='/api/release'){json(res,200,release);return;}
   if(name==='/downloads/windows'){if(!release.available){json(res,503,{error:'O download ainda está sendo preparado.'});return;}res.writeHead(302,{Location:'/releases/'+release.filename,'Cache-Control':'no-store'});res.end();return;}
   if(name.startsWith('/releases/')){if(!release.available||name!=='/releases/'+release.filename){json(res,404,{error:'Arquivo não encontrado.'});return;}await sendFile(req,res,path.join(releasesDir,release.filename),{download:true,etag:'"'+release.sha256+'"'});return;}
   if(name==='/updates/windows-x64.json'){
    try{const file=path.join(releasesDir,'update.json');const s=await regular(file);if(s.size>64000)throw new Error();const envelope=JSON.parse(await readFile(file,'utf8'));if(!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.payload)||!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature))throw new Error();json(res,200,envelope);}catch{json(res,503,{error:'O canal assinado de atualizações ainda não foi configurado.'});}return;
   }
   const allowed=name==='/'?'index.html':/^\/(?:style\.css|app\.js)$/.test(name)?name.slice(1):/^\/assets\/[a-z0-9_.-]+\.(?:png|webp|svg|woff2|ico)$/.test(name)?name.slice(1):null;
   if(!allowed){json(res,404,{error:'Página não encontrada.'});return;}
   const file=path.join(publicDir,allowed);if(allowed.startsWith('assets/')&&(await lstat(path.join(publicDir,'assets'))).isSymbolicLink())throw new Error();await sendFile(req,res,file);
  }catch{if(!res.headersSent)json(res,404,{error:'Página não encontrada.'});else res.destroy();}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=await createApp();const port=Number(process.env.PORT??8080);server.listen(port,'0.0.0.0',()=>console.log('Vsync site pronto na porta '+port+'.'));for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
