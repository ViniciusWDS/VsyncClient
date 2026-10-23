import {app,BrowserWindow,ipcMain,dialog,shell,safeStorage,net,nativeImage} from 'electron';
import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {mkdir,cp,readFile,writeFile,readdir,rm,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import AdmZip from 'adm-zip';
import {Store} from './core/store';
import {Auth} from './core/auth';
import {Minecraft} from './core/minecraft';
import {Catalog} from './core/catalog';
import {DiscordPresence} from './core/discord';
import {Performance,fpsSchema} from './core/performance';
import {FPS_MODS} from '../src/performance';
import {Downloads,setFetch} from './core/network';
import {redact,safeFilename} from './core/safety';
import {addDirectory,extractArchive} from './core/archive';
import {parseServer,pingServer} from './core/servers';
import {javaInfo} from './core/java';
import {Updates} from './core/updates';
import {AutomaticUpdates} from './core/automatic-updates';
import {launchUpdateInstaller,windowsMinecraftRunning} from './core/update-install';
import {validateProfile} from './core/validation';
import {OfficialLauncher,checkLauncherExecutable,profileDocuments} from './core/official';
import {runNativeSmoke} from './smoke';
import distribution from '../config/distribution.json';
import type {Profile} from '../src/shared';
app.setName('Vsync Client');
let window:BrowserWindow;let store:Store;let downloads:Downloads;let auth:Auth;let minecraft:Minecraft;let catalog:Catalog;let updates:Updates;let official:OfficialLauncher;let performance:Performance;
let automaticUpdates:AutomaticUpdates|undefined;let installationInProgress=false;let activeCommands=0;
let discordPresence:DiscordPresence|undefined;
const smoke=process.env.VSYNC_TEST_MODE==='1'&&app.commandLine.hasSwitch('vsync-smoke-test');
if(smoke){if(!process.env.VSYNC_TEST_ROOT||!path.isAbsolute(process.env.VSYNC_TEST_ROOT))throw new Error('Informe uma pasta absoluta e isolada para o teste.');const isolated=path.join(process.env.VSYNC_TEST_ROOT,'user-data');mkdirSync(isolated,{recursive:true});app.setPath('userData',isolated);}
const profileFields=z.object({name:z.string().trim().min(1).max(60),description:z.string().max(500),image:z.union([z.literal(''),z.string().regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).max(800000)]).optional(),gameVersion:z.string().regex(/^[a-zA-Z0-9._+-]{1,60}$/),loader:z.enum(['vanilla','fabric','quilt','forge','neoforge']),loaderVersion:z.string().regex(/^[a-zA-Z0-9._+-]{0,60}$/),ram:z.number().int().min(1024).max(65536),width:z.number().int().min(640).max(7680),height:z.number().int().min(360).max(4320),javaPath:z.string().max(500),jvmArgs:z.array(z.string().min(1).max(500)).max(30),preset:z.enum(['Leve','Equilibrado','Qualidade']),accent:z.string().regex(/^#[0-9a-f]{6}$/i)});
const idSchema=z.string().uuid();
const argId=(a:any)=>idSchema.parse(a?.id);
const moduleDir=()=>app.isPackaged?path.join(process.resourcesPath,'module-artifacts'):path.join(app.getAppPath(),'module-artifacts');
const moduleFile=()=>path.join(moduleDir(),'vsync-hud-0.1.0.jar');
function emit(){if(window&&!window.isDestroyed())window.webContents.send('vsync:state',store.state);void discordPresence?.sync();}
function log(s:string){if(!s)return;store.state.logs.push(new Date().toLocaleTimeString('pt-BR')+' '+redact(s).slice(0,5000));store.state.logs=store.state.logs.slice(-400);emit();}
function assertIdle(){if(store.state.game.state==='running'||store.state.game.state==='preparing')throw new Error('Feche o Minecraft antes de alterar arquivos do perfil.');if(downloads.tasks.some(t=>['queued','running'].includes(t.status)))throw new Error('Aguarde ou cancele os downloads antes de alterar os arquivos.');}
async function installUpdate(manual=false){
 if(!app.isPackaged||process.platform!=='win32'||process.arch!=='x64')throw new Error('Instale a versão Windows x64 do Vsync para receber atualizações automáticas.');
 if(installationInProgress)throw new Error('A instalação da atualização já foi iniciada.');
 if(activeCommands>(manual?1:0))throw new Error('Aguarde a operação atual antes de instalar a atualização.');
 assertIdle();installationInProgress=true;
 try{
  const file=await updates.installer();
  if(await windowsMinecraftRunning())throw new Error('Feche o Minecraft e o Minecraft Launcher para instalar a atualização.');
  assertIdle();await store.save();
  updates.installationStarted();await launchUpdateInstaller(file);app.quit();
 }catch(e){installationInProgress=false;if(updates.state.state==='installing')updates.installationFailed((e as Error).message);throw e;}
}
async function external(raw:string){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||!['modrinth.com','docs.modrinth.com','learn.microsoft.com','www.minecraft.net','minecraft.net','aka.ms','login.microsoftonline.com','discord.com','docs.fabricmc.net','adoptium.net'].some(h=>u.hostname===h))throw new Error('Este link externo não está autorizado.');await shell.openExternal(u.href);}
async function confirmFpsChange(){if(store.state.settings.launchMode!=='official')return true;const result=await dialog.showMessageBox(window,{type:'question',title:'Aplicar ajustes FPS',message:'Feche o Minecraft antes de continuar.',detail:'O jogo iniciado pelo launcher oficial roda fora do Vsync. Confirme que encerrou a partida para evitar que ela sobrescreva os ajustes. Um backup será criado antes da alteração.',buttons:['Cancelar','O jogo está fechado, continuar'],defaultId:0,cancelId:0,noLink:true});return result.response===1;}
async function command(method:string,a:any){
 switch(method){
  case 'snapshot':return store.state;
  case 'official.detect':return official.detect();
  case 'official.open':return official.open();
  case 'official.prepare':assertIdle();return official.enqueue(argId(a),false);
  case 'official.chooseLauncher':{if(process.platform!=='win32')throw new Error('Seleção disponível no Windows.');const selected=await dialog.showOpenDialog(window,{title:'Selecione MinecraftLauncher.exe da instalação oficial',properties:['openFile'],filters:[{name:'Launcher instalado',extensions:['exe']}]});if(selected.canceled)return;await checkLauncherExecutable(selected.filePaths[0]);store.state.settings.officialLauncherPath=selected.filePaths[0];await store.save();return official.detect();}
  case 'official.chooseRoot':{assertIdle();const selected=await dialog.showOpenDialog(window,{title:'Pasta .minecraft do launcher oficial',properties:['openDirectory']});if(selected.canceled)return;await profileDocuments(selected.filePaths[0]);store.state.settings.officialGameRoot=selected.filePaths[0];await store.save();return official.detect();}
  case 'official.reset':store.state.settings.officialLauncherPath='';store.state.settings.officialGameRoot='';await store.save();return official.detect();
  case 'updates.check':return automaticUpdates?automaticUpdates.poll(true):updates.check();
  case 'updates.download':{automaticUpdates?.resume();return updates.download();}
  case 'updates.cancel':if(automaticUpdates)automaticUpdates.pause();else updates.cancel();return;
  case 'updates.install':return installUpdate(true);
  case 'validation.profile':return validateProfile(store,argId(a),moduleFile());
  case 'window.minimize':window.minimize();return;
  case 'window.maximize':window.isMaximized()?window.unmaximize():window.maximize();return;
  case 'window.close':window.close();return;
  case 'performance.apply':{assertIdle();const id=argId(a);const values=fpsSchema.parse(a);if(!await confirmFpsChange())return false;return performance.apply(id,values);}
  case 'performance.restore':{assertIdle();const id=argId(a);if(!await confirmFpsChange())return false;return performance.restore(id);}
  case 'performance.mods':{assertIdle();const id=argId(a);const projects=z.array(z.string()).min(1).max(FPS_MODS.length).parse(a.projects);if(new Set(projects).size!==projects.length||projects.some(x=>!FPS_MODS.some(m=>m.id===x)))throw new Error('Seleção de otimizações inválida.');if(!await confirmFpsChange())return false;return catalog.installPerformance(id,projects);}
  case 'performance.compatibility':return catalog.performanceCompatibility(store.profile(argId(a)));
  case 'versions':return minecraft.versions();
  case 'loaders':return minecraft.loaders(z.string().regex(/^[a-zA-Z0-9._+-]{1,60}$/).parse(a?.version));
  case 'profile.create':{
   const fields=profileFields.parse({...store.create(a?.name??'Novo perfil'),...a});const p={...store.create(fields.name),...fields,javaPath:store.state.settings.javaPath};if(['forge','neoforge'].includes(p.loader))throw new Error('Este instalador de loader ainda não está disponível.');store.state.profiles.push(p);store.state.selectedProfileId=p.id;await store.save();emit();return p;
  }
  case 'profile.update':{
   assertIdle();const p=store.profile(argId(a));const data=profileFields.parse({...p,...a});
   if(data.javaPath!==p.javaPath&&data.javaPath!==store.state.settings.javaPath)throw new Error('Selecione o Java pelo botão de procurar arquivo.');
   if(data.jvmArgs.some(x=>/^(@|-jar$|--?class-?path|--?module-?path|--?accessToken)/i.test(x)))throw new Error('Argumentos reservados de execução não podem ser substituídos.');
   if(data.ram>store.state.system.memory-1024)throw new Error('Reserve pelo menos 1 GB de RAM para o sistema.');
   if(p.gameVersion!==data.gameVersion||p.loader!==data.loader||p.loaderVersion!==data.loaderVersion){if(p.components.length)throw new Error('Crie ou duplique um perfil limpo para mudar versão/loader com componentes instalados.');p.installed=false;}
   Object.assign(p,data);await store.save();emit();return p;
  }
  case 'profile.select':store.profile(argId(a));store.state.selectedProfileId=a.id;await store.save();emit();return;
  case 'profile.duplicate':{
   assertIdle();const p=store.profile(argId(a));const copy={...structuredClone(p),id:randomUUID(),name:p.name+' (cópia)',createdAt:new Date().toISOString(),lastPlayed:undefined,installed:false,performance:undefined};const dir=path.join(store.state.settings.installRoot,copy.id);await mkdir(dir,{recursive:true});const source=store.dir(p.id);
   for(const folder of ['mods','config','resourcepacks','shaderpacks','options.txt'])try{await cp(path.join(source,folder),path.join(dir,folder),{recursive:true,dereference:false,filter:async(src)=>!(await lstat(src)).isSymbolicLink()});}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   store.state.profiles.push(copy);store.state.selectedProfileId=copy.id;await store.save();emit();return copy;
  }
  case 'profile.delete':{
   assertIdle();const p=store.profile(argId(a));const answer=await dialog.showMessageBox(window,{type:'warning',title:'Excluir perfil',message:'Excluir “'+p.name+'”?',detail:'A pasta deste perfil, incluindo mods, configurações, screenshots e TODOS OS MUNDOS, será enviada para a Lixeira. Os outros perfis serão preservados. Faça uma exportação com mundos antes de continuar.',buttons:['Cancelar','Excluir perfil e mundos'],defaultId:0,cancelId:0,noLink:true});
   if(answer.response!==1)return false;const dir=store.dir(p.id);if(existsSync(dir))await shell.trashItem(dir);store.state.profiles=store.state.profiles.filter(x=>x.id!==p.id);store.state.selectedProfileId=store.state.profiles[0]?.id??'';await store.save();emit();return true;
  }
  case 'profile.folder':{const dir=store.dir(argId(a));await mkdir(dir,{recursive:true});const error=await shell.openPath(dir);if(error)throw new Error(error);return;}
  case 'profile.image':{const p=store.profile(argId(a));const selected=await dialog.showOpenDialog(window,{title:'Imagem do perfil',properties:['openFile'],filters:[{name:'Imagens',extensions:['png','jpg','jpeg','webp']}]});if(selected.canceled)return;const file=selected.filePaths[0];if((await lstat(file)).size>5_000_000)throw new Error('Selecione uma imagem de até 5 MB.');const image=nativeImage.createFromPath(file);if(image.isEmpty())throw new Error('Não foi possível ler a imagem.');p.image=image.resize({width:256,height:256,quality:'best'}).toDataURL();await store.save();emit();return p.image;}
  case 'profile.export':{
   assertIdle();const p=store.profile(argId(a));const save=await dialog.showSaveDialog(window,{title:'Exportar perfil'+(a?.worlds?' com mundos':''),defaultPath:p.name.replace(/[^\p{L}\p{N} -]/gu,'')+'.vsync.zip',filters:[{name:'Perfil Vsync',extensions:['zip']}]});if(save.canceled||!save.filePath)return;
   const zip=new AdmZip();zip.addFile('profile.json',Buffer.from(JSON.stringify({...p,javaPath:'',installed:false},null,2)));await mkdir(store.dir(p.id),{recursive:true});await addDirectory(zip,store.dir(p.id),'',a?.worlds===true);zip.writeZip(save.filePath);return true;
  }
  case 'profile.import':{
   assertIdle();const selected=await dialog.showOpenDialog(window,{title:'Importar perfil ou modpack',properties:['openFile'],filters:[{name:'Perfil Vsync / Modrinth',extensions:['zip','mrpack']}]});if(selected.canceled)return;
   const file=selected.filePaths[0];if(file.endsWith('.mrpack'))return downloads.enqueue('Importar modpack',job=>catalog.importMrpack(file,path.basename(file,'.mrpack'),job));
   const zip=new AdmZip(file);const meta=zip.getEntry('profile.json');if(!meta)throw new Error('Este arquivo não é uma exportação Vsync. Para Modrinth, use .mrpack.');
   const raw=JSON.parse(meta.getData().toString());const fields=profileFields.parse(raw);
   const components=z.array(z.object({id:z.string().uuid(),projectId:z.string().regex(/^[A-Za-z0-9_-]+$/),versionId:z.string().regex(/^[A-Za-z0-9_-]+$/),name:z.string().max(200),version:z.string().max(100),filename:z.string().max(250).transform(safeFilename),type:z.enum(['mod','resourcepack','shader']),enabled:z.boolean(),sha512:z.string().regex(/^[0-9a-f]{128}$/i),dependencies:z.array(z.string().regex(/^[A-Za-z0-9_-]+$/))})).max(5000).parse(raw.components??[]);
   const p={...store.create(fields.name),...fields,id:randomUUID(),javaPath:'',installed:false,components};const dir=path.join(store.state.settings.installRoot,p.id);
   try{await extractArchive(file,dir,n=>n!=='profile.json'&&!n.startsWith('.vsync')&&!n.includes('sessions'));store.state.profiles.push(p);store.state.selectedProfileId=p.id;await store.save();emit();return p;}catch(e){await rm(dir,{recursive:true,force:true});throw e;}
  }
  case 'profile.install':return minecraft.install(argId(a));
  case 'profile.repair':assertIdle();return minecraft.install(argId(a),true);
  case 'profile.launch':if(downloads.tasks.some(t=>t.status==='running'||t.status==='queued'))throw new Error('Aguarde a instalação antes de iniciar.');if(store.state.settings.launchMode==='official'){assertIdle();return official.enqueue(argId(a),true);}return minecraft.launch(argId(a));
  case 'profile.module':{
   assertIdle();const p=store.profile(argId(a));if(p.loader!=='fabric'||p.gameVersion!=='1.21.1')throw new Error('O módulo inicial é exclusivo para Fabric / Minecraft 1.21.1.');
   if(!existsSync(moduleFile()))throw new Error('Compile primeiro o módulo Java. O JAR ainda não foi incluído neste build.');
   if(!p.components.some(c=>c.projectId==='P7dR8mSH'&&c.enabled))throw new Error('Instale e ative Fabric API pelo catálogo antes do módulo.');
   await catalog.backup(p);const dest=path.join(store.dir(p.id),'mods');await mkdir(dest,{recursive:true});await cp(moduleFile(),path.join(dest,'vsync-hud-0.1.0.jar'));log('Módulo Vsync instalado. Right Shift abre o editor no jogo.');emit();return true;
  }
  case 'catalog.search':return catalog.search(z.object({query:z.string().max(120),type:z.enum(['mod','modpack','resourcepack','shader']),version:z.string().max(60),loader:z.string().max(20),sort:z.enum(['relevance','downloads','follows','newest','updated']),category:z.string().max(80),offset:z.number().int().min(0).max(1000000).optional()}).parse(a));
  case 'catalog.compatibility':return catalog.collectionCompatibility(store.profile(idSchema.parse(a.profileId)),a.projects?z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)).max(50).parse(a.projects):undefined);
  case 'catalog.installCollection':{assertIdle();const profileId=idSchema.parse(a.profileId);const projects=z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)).min(1).max(50).parse(a.projects);if(!await confirmFpsChange())return false;return catalog.installCollection(profileId,projects);}
  case 'catalog.detail':return catalog.detail(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).parse(a.project),store.profile(idSchema.parse(a.profileId)));
  case 'catalog.install':if(store.state.game.state==='running')throw new Error('Feche o jogo antes de instalar componentes.');return catalog.install(idSchema.parse(a.profileId),z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).parse(a.project),a.versionId?z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).parse(a.versionId):undefined);
  case 'component.toggle':assertIdle();return catalog.toggle(idSchema.parse(a.profileId),argId(a));
  case 'component.remove':assertIdle();return catalog.remove(idSchema.parse(a.profileId),argId(a));
  case 'component.update':{assertIdle();const p=store.profile(idSchema.parse(a.profileId));const c=p.components.find(c=>c.id===argId(a));if(!c)throw new Error('Componente não encontrado.');return catalog.install(p.id,c.projectId);}
  case 'settings.save':{
   const fields=z.object({scale:z.number().min(.8).max(1.3),accent:z.string().regex(/^#[0-9a-f]{6}$/i),animations:z.boolean(),reduceInGame:z.boolean(),behavior:z.enum(['keep','minimize']),ram:z.number().int().min(1024).max(65536),clientId:z.union([z.literal(''),z.string().uuid()]),hidePresence:z.boolean(),hideServer:z.boolean(),discord:z.boolean(),discordClientId:z.union([z.literal(''),z.string().regex(/^\d{17,20}$/)]),launchMode:z.enum(['official','vsync']),downloadConcurrency:z.number().int().min(1).max(8)}).partial().parse(a);if(fields.launchMode&&fields.launchMode!==store.state.settings.launchMode)assertIdle();Object.assign(store.state.settings,fields);await store.save();emit();return;
  }
  case 'settings.java':{const selected=await dialog.showOpenDialog(window,{title:'Selecionar executável Java',properties:['openFile'],filters:process.platform==='win32'?[{name:'Java',extensions:['exe']}]:undefined});if(selected.canceled)return;const info=await javaInfo(selected.filePaths[0]);store.state.settings.javaPath=selected.filePaths[0];await store.save();emit();return info;}
  case 'settings.root':{
   assertIdle();const selected=await dialog.showOpenDialog(window,{title:'Pasta para os perfis',properties:['openDirectory','createDirectory']});if(selected.canceled)return;const dest=selected.filePaths[0];const source=store.state.settings.installRoot;if(dest===source)return;
   if(dest.startsWith(source+path.sep)||source.startsWith(dest+path.sep))throw new Error('Escolha uma pasta independente da instalação atual.');
   const answer=await dialog.showMessageBox(window,{type:'question',message:'Copiar os perfis para a nova pasta?',detail:'Os arquivos atuais serão preservados como cópia. A nova pasta será usada após a cópia completa.',buttons:['Cancelar','Copiar e usar pasta'],defaultId:0,cancelId:0});if(answer.response!==1)return;
   for(const p of store.state.profiles){const target=path.join(dest,p.id);if(existsSync(target))throw new Error('A pasta de destino já contém um desses perfis.');if(existsSync(store.dir(p.id)))await cp(store.dir(p.id),target,{recursive:true,filter:async(src)=>!(await lstat(src)).isSymbolicLink()});p.installed=false;}
   store.state.settings.installRoot=dest;await store.save();emit();return;
  }
  case 'accounts.login':await auth.login();emit();return;
  case 'accounts.validate':{const result=await auth.validate();emit();return result;}
  case 'accounts.select':{const id=z.string().regex(/^[a-f0-9]{32}$/).parse(a.id);if(!store.state.accounts.some(x=>x.id===id))throw new Error('Conta não encontrada.');store.state.activeAccountId=id;await store.save();emit();return;}
  case 'accounts.remove':await auth.remove(z.string().regex(/^[a-f0-9]{32}$/).parse(a.id));emit();return;
  case 'server.save':{const data=z.object({name:z.string().trim().min(1).max(60),address:z.string().max(255),profileId:idSchema,favorite:z.boolean(),id:idSchema.optional()}).parse(a);parseServer(data.address);store.profile(data.profileId);const server={...data,id:data.id??randomUUID()};store.state.servers=store.state.servers.filter(s=>s.id!==server.id).concat(server);await store.save();emit();return true;}
  case 'server.delete':store.state.servers=store.state.servers.filter(s=>s.id!==argId(a));await store.save();emit();return;
  case 'server.ping':{const s=store.state.servers.find(s=>s.id===argId(a));if(!s)throw new Error('Servidor não encontrado.');return pingServer(s.address);}
  case 'server.connect':{const s=store.state.servers.find(s=>s.id===argId(a));if(!s)throw new Error('Servidor não encontrado.');if(downloads.tasks.some(t=>['queued','running'].includes(t.status)))throw new Error('Aguarde os downloads antes de conectar.');if(store.state.settings.launchMode==='official'){assertIdle();return official.enqueue(s.profileId,true);}return minecraft.launch(s.profileId,s.address);}
  case 'download.cancel':downloads.cancel(argId(a));return;
  case 'download.retry':downloads.retry(argId(a));return;
  case 'diagnostic.export':{const save=await dialog.showSaveDialog(window,{title:'Exportar diagnóstico',defaultPath:'Vsync-diagnostico.txt',filters:[{name:'Texto',extensions:['txt']}]});if(save.canceled||!save.filePath)return;const s=store.state;await writeFile(save.filePath,redact(JSON.stringify({version:s.system.appVersion,platform:s.system.platform,memory:s.system.memory,profiles:s.profiles.map(p=>({gameVersion:p.gameVersion,loader:p.loader,ram:p.ram,components:p.components.map(c=>({name:c.name,version:c.version}))})),game:{state:s.game.state},logs:s.logs},null,2)));return true;}
  case 'external':return external(z.string().url().max(1000).parse(a.url));
  default:throw new Error('Operação não permitida.');
 }
}
async function boot(){
 setFetch((input:any,init:any)=>net.fetch(input,init) as any);
 store=new Store(app.getPath('userData'),existsSync(moduleFile()),app.getVersion());await store.load();
 if(!store.state.settings.clientId){store.state.settings.clientId=z.string().uuid().parse(process.env.VSYNC_MICROSOFT_CLIENT_ID||distribution.microsoftClientId);await store.save();}
 updates=new Updates(distribution.updates,app.getVersion(),store.root,value=>{store.state.updates=value;emit();},(input:any,init:any)=>net.fetch(input,init) as any);store.state.updates=updates.state;
 downloads=new Downloads(()=>{store.state.tasks=downloads.tasks;emit();},log);auth=new Auth(store,safeStorage,external);catalog=new Catalog(store,downloads,emit);performance=new Performance(store,emit);minecraft=new Minecraft(store,downloads,auth,emit,log,running=>{if(running&&store.state.settings.behavior==='minimize')window.minimize();if(!running){window.restore();window.show();}});
 official=new OfficialLauncher(store,downloads,emit);
 window=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:640,frame:false,backgroundColor:'#09090D',title:'Vsync Client',icon:path.join(app.getAppPath(),'public/assets/icon.png'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event)=>event.preventDefault());window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
 ipcMain.handle('vsync:command',async(event,payload)=>{try{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('Origem não autorizada.');const {method,args}=z.object({method:z.string().max(80),args:z.unknown().optional()}).parse(payload);if(installationInProgress&&method!=='snapshot')throw new Error('O Vsync está instalando uma atualização e será reiniciado.');activeCommands++;try{return{ok:true,data:await command(method,args)};}finally{activeCommands--;}}catch(e){const error=e instanceof z.ZodError?'Verifique os campos informados.':redact((e as Error).message);log(error);return{ok:false,error};}});
 window.on('close',e=>{if(minecraft.process){e.preventDefault();window.minimize();log('O launcher permanece aberto enquanto o Minecraft está em execução.');}});
 const dev=process.env.VSYNC_DEV_URL;if(dev==='http://localhost:5173')await window.loadURL(dev);else await window.loadFile(path.join(__dirname,'../dist/index.html'));window.show();
 if(smoke){try{await runNativeSmoke(window,store,moduleFile(),safeStorage,app.commandLine.getSwitchValue('vsync-smoke-test'));app.exit(0);}catch(e){await writeFile(path.join(process.env.VSYNC_TEST_ROOT!,'native-smoke-error.txt'),redact((e as Error).message));app.exit(1);}return;}
 if(!store.state.settings.discordClientId){store.state.settings.discordClientId=distribution.discordClientId;await store.save();}
 discordPresence=new DiscordPresence(()=>store.state,state=>{store.state.discord=state;if(window&&!window.isDestroyed())window.webContents.send('vsync:state',store.state);});
 const presenceTimer=setInterval(()=>void discordPresence?.sync(),15000);presenceTimer.unref();
 app.once('before-quit',()=>{clearInterval(presenceTimer);discordPresence?.stop();});
 void discordPresence.sync();
 void official.detect();
 if(app.isPackaged&&updates.state.state!=='unconfigured'){
  automaticUpdates=new AutomaticUpdates(updates,{canInstall:async()=>{if(installationInProgress||activeCommands!==0||['running','preparing'].includes(store.state.game.state)||downloads.tasks.some(t=>['queued','running'].includes(t.status)))return false;return !await windowsMinecraftRunning();},install:()=>installUpdate(),error:message=>log('Atualização automática: '+message)});
  const first=setTimeout(()=>void automaticUpdates?.poll(),8000);first.unref();
  const timer=setInterval(()=>void automaticUpdates?.poll(),30000);timer.unref();
  app.once('before-quit',()=>{clearTimeout(first);clearInterval(timer);});
 }
}
const lock=app.requestSingleInstanceLock();if(!lock)app.quit();else{app.on('second-instance',()=>{window?.restore();window?.focus();});app.whenReady().then(boot).catch(e=>{dialog.showErrorBox('Vsync Client',redact(e.message));app.quit();});app.on('window-all-closed',()=>{if(!minecraft?.process)app.quit();});}
