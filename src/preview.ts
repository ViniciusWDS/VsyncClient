import {version as appVersion} from '../package.json';
import {RECOMMENDED_MODS,recommendedProject} from './mods';
import distribution from '../config/distribution.json';
import {FPS_MODS} from './performance';
import {DEFAULT_SETTINGS,type Snapshot,type Bridge,type Profile} from './shared';
const profile:Profile={id:'c461c8aa-d47e-4c72-95ee-d966fd193813',name:'Vsync Survival',description:'Um novo mundo de possibilidades.',gameVersion:'1.21.1',loader:'fabric',loaderVersion:'',ram:4096,width:1280,height:720,javaPath:'',jvmArgs:[],preset:'Equilibrado',accent:'#8B5CF6',createdAt:new Date().toISOString(),installed:false,components:[]};
const initial:Snapshot={profiles:[profile],selectedProfileId:profile.id,accounts:[],activeAccountId:'',settings:{...DEFAULT_SETTINGS,installRoot:'Pasta gerenciada pelo aplicativo desktop'},servers:[],tasks:[],logs:['Vsync Client • Prévia da interface. Operações nativas disponíveis no desktop.'],updates:{state:'unconfigured',received:0,total:0,message:'O canal oficial de atualizações ainda não foi publicado.'},official:{status:'unchecked',supported:false,message:'Abra o Vsync desktop no Windows para detectar o Minecraft Launcher.',gameRoot:''},game:{state:'idle'},system:{memory:16384,platform:'win32',appVersion,moduleAvailable:false,native:false}};
let state:Snapshot;try{state=JSON.parse(localStorage.getItem('vsync-preview')??'null')??initial;}catch{state=initial;}
state.system.native=false;state.settings.discordClientId||=distribution.discordClientId;state.settings={...DEFAULT_SETTINGS,...state.settings};state.official??=structuredClone(initial.official);state.system.appVersion=appVersion;state.updates??=structuredClone(initial.updates);
const listeners=new Set<(s:Snapshot)=>void>();
function update(){localStorage.setItem('vsync-preview',JSON.stringify(state));for(const l of listeners)l(structuredClone(state));}
const features=[
 {id:'sodium',slug:'sodium',title:'Sodium',author:'CaffeineMC',description:'Renderização otimizada para seus mundos.',project_type:'mod',categories:['optimization'],downloads:0},
 {id:'iris',slug:'iris',title:'Iris Shaders',author:'IrisShaders',description:'Um novo olhar para o Minecraft com shaders.',project_type:'mod',categories:['decoration'],downloads:0},
 {id:'fabric-api',slug:'fabric-api',title:'Fabric API',author:'FabricMC',description:'Biblioteca de recursos para mods Fabric.',project_type:'mod',categories:['library'],downloads:0},
 {id:'fabulously-optimized',slug:'fabulously-optimized',title:'Fabulously Optimized',author:'Comunidade Modrinth',description:'Uma seleção de otimizações para aproveitar cada frame.',project_type:'modpack',categories:['optimization'],downloads:0},
 {id:'additive',slug:'additive',title:'Additive',author:'Comunidade Modrinth',description:'O seu Minecraft com desempenho em primeiro lugar.',project_type:'modpack',categories:['optimization'],downloads:0},
 {id:'simply-optimized',slug:'simply-optimized',title:'Simply Optimized',author:'Comunidade Modrinth',description:'O essencial para uma experiência mais fluida.',project_type:'modpack',categories:['optimization'],downloads:0}
];
export const previewBridge:Bridge={
 subscribe(l){listeners.add(l);return()=>listeners.delete(l);},
 async call<T>(method:string,args:any={}):Promise<T>{
  let result:unknown;
  switch(method){
   case 'performance.compatibility':result=FPS_MODS.map(m=>({id:m.id,compatible:false,reason:'Verifique no aplicativo desktop.'}));break;
   case 'performance.apply':case 'performance.restore':case 'performance.mods':throw new Error('Os ajustes FPS e a instalação de mods funcionam no aplicativo desktop.');
   case 'snapshot':result=structuredClone(state);break;
   case 'profile.create':{const p={...profile,...args,id:crypto.randomUUID()};state.profiles.push(p);state.selectedProfileId=p.id;update();result=p;break;}
   case 'profile.select':state.selectedProfileId=args.id;update();break;
   case 'profile.update':state.profiles=state.profiles.map(p=>p.id===args.id?{...p,...args}:p);update();break;
   case 'profile.duplicate':{const p=state.profiles.find(p=>p.id===args.id);if(p){const copy={...p,name:p.name+' (cópia)',id:crypto.randomUUID()};state.profiles.push(copy);state.selectedProfileId=copy.id;update();}break;}
   case 'official.detect':result=state.official;break;
   case 'official.open':case 'official.prepare':case 'official.chooseLauncher':case 'official.chooseRoot':case 'official.reset':throw new Error('A conexão com o Minecraft Launcher exige o aplicativo desktop no Windows.');
   case 'updates.check':result=state.updates;break;
   case 'validation.profile':result={checkedAt:new Date().toISOString(),checks:[{name:'Ambiente desktop',status:'pending',detail:'Abra o Vsync desktop para validar arquivos, Java e o módulo.'},{name:'HUD dentro do jogo',status:'pending',detail:'Confirme Right Shift, elementos e persistência no Minecraft.'}]};break;
   case 'accounts.validate':throw new Error('A validação de licença exige o aplicativo desktop e uma conta Microsoft conectada.');
   case 'settings.save':state.settings={...state.settings,...args};update();break;
   case 'versions':result=['1.21.1','1.21.4','1.20.1','1.20.4'];break;
   case 'loaders':result={vanilla:[],fabric:['0.16.14'],quilt:['0.27.1'],forge:[],neoforge:[]};break;
   case 'catalog.compatibility':result=RECOMMENDED_MODS.map(m=>({id:m.id,compatible:false,reason:'Verifique a compatibilidade no aplicativo desktop.'}));break;
   case 'catalog.installCollection':throw new Error('Instalação de mods disponível no aplicativo desktop.');
   case 'catalog.search':result={hits:features.filter(p=>p.project_type===args.type&&(!args.query||p.title.toLowerCase().includes(args.query.toLowerCase()))),total_hits:features.filter(p=>p.project_type===args.type).length};break;
   case 'catalog.detail':{const p=features.find(p=>p.id===args.project)??RECOMMENDED_MODS.filter(m=>m.id===args.project).map(recommendedProject)[0];result={project:p,versions:[]};break;}
   case 'server.save':state.servers=state.servers.filter(s=>s.id!==args.id).concat({...args,id:args.id??crypto.randomUUID()});update();result=true;break;
   case 'server.delete':state.servers=state.servers.filter(s=>s.id!==args.id);update();break;
   case 'external':window.open(args.url,'_blank','noopener,noreferrer');break;
   case 'window.minimize':case 'window.maximize':case 'window.close':throw new Error('Os controles da janela funcionam no aplicativo desktop.');
   default:throw new Error('Esta operação usa recursos do aplicativo desktop. Abra o Vsync instalado para continuar.');
  }return result as T;
 }
};
