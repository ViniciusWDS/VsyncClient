import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import AdmZip from 'adm-zip';
import {findJava} from './java';
import type {Store} from './store';
import type {ValidationCheck,ValidationReport} from '../../src/shared';
import {officialRoot,officialProfileId,profileDocuments} from './official';

export async function validateProfile(store:Store,id:string,bundledModule:string):Promise<ValidationReport>{
 const p=store.profile(id),root=store.dir(id),checks:ValidationCheck[]=[];
 const add=(name:string,status:ValidationCheck['status'],detail:string)=>checks.push({name,status,detail});
 let runtime:any;
 if(store.state.settings.launchMode==='official'){
  try{const docs=await profileDocuments(store.state.settings.officialGameRoot||officialRoot());const key=officialProfileId(id);const found=docs.some(d=>d.value.profiles?.[key]?.gameDir===root);add('Instalação no launcher oficial',found?'passed':'failed',found?'Entrada Vsync encontrada no arquivo de instalações. A conta é gerenciada pelo Minecraft Launcher.':'Prepare o perfil para o launcher oficial antes de jogar.');}catch{add('Instalação no launcher oficial','failed','Abra o launcher oficial uma vez, entre, feche-o e prepare o perfil pelo Vsync.');}
  add('Arquivos do jogo e Java','pending','O Minecraft Launcher baixa e valida seus arquivos e runtime ao iniciar a instalação. Confirme o resultado nele.');
 }else{
 try{if(!p.installed)throw Error();runtime=JSON.parse(await readFile(path.join(root,'.vsync-runtime','runtime.json'),'utf8'));if(runtime.gameVersion!==p.gameVersion||runtime.loader!==p.loader||p.loaderVersion&&runtime.loaderVersion!==p.loaderVersion)throw Error();if(!Array.isArray(runtime.libraries)||!runtime.libraries.length||!Number.isInteger(runtime.javaMajor))throw Error();await Promise.all(runtime.libraries.map((file:string)=>access(file)));add('Arquivos do jogo','passed','Metadados e arquivos do classpath presentes. Use Reparar para conferir novamente os hashes oficiais.');}
 catch{add('Arquivos do jogo','failed','Instalação ausente, incompleta ou diferente do perfil. Instale ou repare o perfil.');runtime=undefined;}
 const major=runtime?.javaMajor??21;
 try{const java=await findJava(p.javaPath||store.state.settings.javaPath,major,path.join(store.root,'cache','runtime'));add('Java '+major,java?'passed':'failed',java?'Executável compatível encontrado.':'Java compatível não encontrado. Repare o perfil ou selecione o executável.');}catch{add('Java '+major,'failed','Não foi possível validar o executável Java.');}
 }
 if(p.gameVersion==='1.21.1'&&p.loader==='fabric'){
  try{const api=p.components.find(c=>c.projectId==='P7dR8mSH'&&c.enabled);if(!api)throw Error();const bytes=await readFile(path.join(root,'mods',api.filename));if(createHash('sha512').update(bytes).digest('hex')!==api.sha512)throw Error();add('Fabric API','passed','Arquivo ativo encontrado e conferido pelo hash do catálogo.');}catch{add('Fabric API','failed','Instale e ative Fabric API neste perfil; o arquivo precisa corresponder ao catálogo.');}
  try{const expected=await readFile(bundledModule),installed=await readFile(path.join(root,'mods',path.basename(bundledModule)));if(!createHash('sha256').update(expected).digest().equals(createHash('sha256').update(installed).digest()))throw Error();const jar=new AdmZip(installed),meta=JSON.parse(jar.readAsText('fabric.mod.json'));if(meta.id!=='vsync-hud'||!jar.getEntry('com/vsync/hud/VsyncClient.class'))throw Error();add('Vsync HUD instalado','passed','O JAR do perfil corresponde ao módulo incluído nesta distribuição.');}catch{add('Vsync HUD instalado','failed','Instale o módulo Vsync HUD neste perfil após instalar Fabric API.');}
 }else add('Compatibilidade do HUD','failed','A primeira versão do Vsync HUD exige Fabric e Minecraft 1.21.1.');
 const running=store.state.game.state==='running'&&store.state.game.profileId===id;
 add('Execução do Minecraft',running?'passed':'pending',running?'O processo está em execução; isso não comprova a abertura de um mundo.':store.state.settings.launchMode==='official'?'A execução externa não é monitorada pelo Vsync. Confirme uma partida no launcher oficial.':'Inicie o jogo e abra um mundo para homologar a execução.');
 add('HUD dentro do jogo','pending','Confirme FPS/teclas, Right Shift, editor e persistência após reiniciar. A presença do JAR não comprova renderização.');
 return{checkedAt:new Date().toISOString(),checks};
}
