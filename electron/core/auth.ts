import {createServer} from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import type {SafeStorage} from 'electron';
import type {Store} from './store';
import {json,ServiceError} from './network';
const sessionSchema=z.object({refreshToken:z.string().min(1),accessToken:z.string().min(1),expiresAt:z.number().positive(),uuid:z.string().regex(/^[a-f0-9]{32}$/),name:z.string().regex(/^[A-Za-z0-9_]{1,16}$/)});
type Session=z.infer<typeof sessionSchema>;
const authority='https://login.microsoftonline.com/consumers/oauth2/v2.0';
const scope='XboxLive.signin offline_access';
export function authError(error:unknown,stage:string){
 if(!(error instanceof ServiceError))return new Error(stage+': '+(error instanceof Error?error.message:'Falha inesperada.'));
 const codes:Record<number,string>={
  700016:'O Client ID não foi encontrado. Confira o registro Vsync no Microsoft Entra.',
  50011:'O retorno desktop não está autorizado. Registre http://localhost em Aplicativos móveis e de desktop.',
  7000218:'O registro exige um segredo. Configure o Vsync como aplicativo desktop público, sem client secret.',
  50194:'O registro não aceita o tipo de conta escolhido. Habilite contas pessoais Microsoft.',
  65001:'A entrada exige consentimento para as permissões solicitadas no navegador oficial.',
  2148916233:'Crie primeiro seu perfil Xbox no site oficial Xbox e tente novamente.',
  2148916235:'O Xbox Live não está disponível para o país ou a região desta conta.',
  2148916238:'A conta exige configuração de família e autorização do responsável no Xbox.'
 };
 const known=error.providerCode&&codes[error.providerCode];
 const detail=known??(error.code==='invalid_grant'?'A sessão expirou ou foi revogada. Entre novamente com Microsoft.':stage==='Minecraft'&&error.status===403?'O serviço Minecraft recusou o aplicativo ou a conta. Confira a autorização do Client ID para a API e o acesso ao Java Edition.':stage==='Perfil Minecraft'&&error.status===404?'Esta conta ainda não tem um perfil Java Edition. Conclua a criação do perfil no site oficial Minecraft.':error.message);
 return new Error(stage+': '+detail);
}
async function at<T>(stage:string,run:()=>Promise<T>){try{return await run();}catch(e){throw authError(e,stage);}}
export class Auth {
 private busy=false;
 constructor(private store:Store,private vault:SafeStorage,private open:(url:string)=>Promise<void>){}
 private clientId(){return z.string().uuid().parse(this.store.state.settings.clientId||process.env.VSYNC_MICROSOFT_CLIENT_ID);}
 private checkVault(){if(!this.vault.isEncryptionAvailable() || process.platform==='linux'&&this.vault.getSelectedStorageBackend()==='basic_text')throw new Error('Armazenamento seguro indisponível. Configure o cofre de credenciais do sistema antes de entrar.');}
 private file(id:string){if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Conta inválida.');return path.join(this.store.root,'sessions',id+'.bin');}
 private async save(s:Session){this.checkVault();await mkdir(path.join(this.store.root,'sessions'),{recursive:true});await writeFile(this.file(s.uuid),this.vault.encryptString(JSON.stringify(s)),{mode:0o600});}
 private async load(id:string):Promise<Session>{this.checkVault();return sessionSchema.parse(JSON.parse(this.vault.decryptString(await readFile(this.file(id)))));}
 private async gameProfile(accessToken:string){
  const headers={Authorization:'Bearer '+accessToken};
  const ent=await at('Licença Minecraft',()=>json<any>('https://api.minecraftservices.com/entitlements/mcstore',{headers}));
  if(!ent.items?.some((i:any)=>['game_minecraft','product_minecraft'].includes(i.name)))throw new Error('Não foi encontrado acesso ao Minecraft Java Edition nesta conta.');
  const profile=await at('Perfil Minecraft',()=>json<any>('https://api.minecraftservices.com/minecraft/profile',{headers}));
  return z.object({id:z.string().regex(/^[a-f0-9]{32}$/),name:z.string().regex(/^[A-Za-z0-9_]{1,16}$/)}).parse(profile);
 }
 private async exchange(ms:{access_token:string;refresh_token:string}):Promise<Session>{
  const post=(url:string,body:unknown)=>json<any>(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
  const xbox=await at('Xbox',()=>post('https://user.auth.xboxlive.com/user/authenticate',{Properties:{AuthMethod:'RPS',SiteName:'user.auth.xboxlive.com',RpsTicket:'d='+ms.access_token},RelyingParty:'http://auth.xboxlive.com',TokenType:'JWT'}));
  if(typeof xbox.Token!=='string')throw new Error('Xbox não retornou uma sessão válida.');
  const xsts=await at('XSTS',()=>post('https://xsts.auth.xboxlive.com/xsts/authorize',{Properties:{SandboxId:'RETAIL',UserTokens:[xbox.Token]},RelyingParty:'rp://api.minecraftservices.com/',TokenType:'JWT'}));
  const uhs=xsts.DisplayClaims?.xui?.[0]?.uhs;if(!uhs||typeof xsts.Token!=='string')throw new Error('A conta não possui um perfil Xbox válido. Verifique sua conta no site Xbox.');
  const mc=await at('Minecraft',()=>post('https://api.minecraftservices.com/authentication/login_with_xbox',{identityToken:`XBL3.0 x=${uhs};${xsts.Token}`}));
  if(typeof mc.access_token!=='string'||!Number.isFinite(mc.expires_in)||mc.expires_in<=0)throw new Error('Minecraft não retornou uma sessão válida.');
  const profile=await this.gameProfile(mc.access_token);
  return sessionSchema.parse({uuid:profile.id,name:profile.name,accessToken:mc.access_token,refreshToken:ms.refresh_token,expiresAt:Date.now()+mc.expires_in*1000});
 }
 async login(){
  if(this.busy)throw new Error('Uma entrada já está em andamento no navegador.');
  if(!this.store.state.settings.clientId&&!process.env.VSYNC_MICROSOFT_CLIENT_ID)throw new Error('Configure o Microsoft Client ID do Vsync em Configurações > Contas.');
  const clientId=this.clientId();this.checkVault();this.busy=true;
  try{
   const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
   const server=createServer();await new Promise<void>((res,rej)=>{server.once('error',rej);server.listen(0,'127.0.0.1',res)});
   const address=server.address();if(!address||typeof address==='string')throw new Error('Não foi possível abrir o retorno local.');
   const redirect='http://localhost:'+address.port;
   const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirect,scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',prompt:'select_account'});
   let code:string;
   try{code=await new Promise<string>((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('A entrada expirou. Tente novamente.')),300000);let used=false;
    server.on('request',(req,res)=>{
     const u=new URL(req.url??'/',redirect),returned=u.searchParams.get('state')??'';
     if(req.method!=='GET'||u.pathname!=='/'||Buffer.byteLength(returned)!==Buffer.byteLength(state)||!timingSafeEqual(Buffer.from(returned),Buffer.from(state))||used){res.writeHead(400);res.end('Retorno invalido.');return;}
     used=true;const c=u.searchParams.get('code');clearTimeout(timeout);
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'"});
     res.end('<body style="background:#09090d;color:#f5f3ff;font:20px system-ui;padding:60px"><h1>Vsync Client</h1><p>Retorno recebido. Volte ao aplicativo para conferir o resultado da entrada.</p></body>');
     if(c&&c.length<16000)resolve(c);else reject(new Error('A entrada Microsoft foi cancelada ou negada.'));
    });
    void this.open(authority+'/authorize?'+params).catch(e=>{clearTimeout(timeout);reject(e)});
   });}finally{server.closeAllConnections();server.close();}
   const ms=await at('Microsoft',()=>json<any>(authority+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirect,code_verifier:verifier}).toString()}));
   const session=await this.exchange(ms);await this.save(session);
   const account={id:session.uuid,uuid:session.uuid,name:session.name,expiresAt:session.expiresAt};
   this.store.state.accounts=this.store.state.accounts.filter(a=>a.id!==account.id).concat(account);this.store.state.activeAccountId=account.id;await this.store.save();
  }finally{this.busy=false;}
 }
 async active():Promise<Session>{
  const id=this.store.state.activeAccountId;if(!id)throw new Error('Entre com uma conta Microsoft que tenha Minecraft Java Edition.');
  let s=await this.load(id);
  if(s.expiresAt<Date.now()+120000){
   const ms=await at('Microsoft',()=>json<any>(authority+'/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.clientId(),grant_type:'refresh_token',refresh_token:s.refreshToken,scope}).toString()}));
   s=await this.exchange({...ms,refresh_token:ms.refresh_token??s.refreshToken});await this.save(s);
   const a=this.store.state.accounts.find(a=>a.id===id);if(a){a.expiresAt=s.expiresAt;a.name=s.name;await this.store.save();}
  }return s;
 }
 async validate(){const session=await this.active();const profile=await this.gameProfile(session.accessToken);if(profile.id!==session.uuid)throw new Error('O perfil retornado não corresponde à conta ativa. Entre novamente.');return{name:profile.name,uuid:profile.id,checkedAt:new Date().toISOString(),license:true};}
 async remove(id:string){await rm(this.file(id),{force:true});this.store.state.accounts=this.store.state.accounts.filter(a=>a.id!==id);if(this.store.state.activeAccountId===id)this.store.state.activeAccountId=this.store.state.accounts[0]?.id??'';await this.store.save();}
}
