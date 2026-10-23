import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {totalmem} from 'node:os';
import {DEFAULT_SETTINGS,INITIAL_VERSION,type Snapshot,type Profile,type Settings} from '../../src/shared';
export class Store {
 state:Snapshot;
 private writeChain=Promise.resolve();
 constructor(readonly root:string,readonly moduleAvailable:boolean,version='0.1.2'){
  const first=this.create('Vsync Survival','fabric','Equilibrado');
  this.state={profiles:[first],selectedProfileId:first.id,accounts:[],activeAccountId:'',settings:{...DEFAULT_SETTINGS,installRoot:path.join(root,'instances')},servers:[],tasks:[],logs:[],updates:{state:'unconfigured',received:0,total:0,message:'Canal de atualização em configuração.'},official:{status:'unchecked',supported:process.platform==='win32',gameRoot:'',message:'Verifique a instalação do Minecraft Launcher oficial.'},game:{state:'idle'},system:{memory:Math.round(totalmem()/1048576),platform:process.platform,appVersion:version,moduleAvailable,native:true}};
 }
 create(name:string,loader:Profile['loader']='fabric',preset:Profile['preset']='Equilibrado'):Profile{return{id:randomUUID(),name,description:'Seu mundo, do seu jeito.',gameVersion:INITIAL_VERSION,loader,loaderVersion:'',ram:4096,width:1280,height:720,javaPath:'',jvmArgs:[],preset,accent:'#8B5CF6',createdAt:new Date().toISOString(),installed:false,components:[]};}
 async load(){
  try{const saved=JSON.parse(await readFile(path.join(this.root,'state.json'),'utf8'));if(saved.schema===1){this.state.profiles=saved.profiles;this.state.selectedProfileId=saved.selectedProfileId;this.state.settings={...this.state.settings,...saved.settings};this.state.accounts=saved.accounts??[];if(!saved.settings?.launchMode&&this.state.accounts.length)this.state.settings.launchMode='vsync';this.state.activeAccountId=saved.activeAccountId??'';this.state.servers=saved.servers??[];}}
  catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw new Error('O arquivo de configurações não pôde ser lido. Faça uma cópia antes de restaurar.');}
  await mkdir(this.state.settings.installRoot,{recursive:true});await this.save();
 }
 save(){this.writeChain=this.writeChain.catch(()=>{}).then(async()=>{await mkdir(this.root,{recursive:true});const {profiles,selectedProfileId,settings,accounts,activeAccountId,servers}=this.state;const temp=path.join(this.root,'state.tmp');await writeFile(temp,JSON.stringify({schema:1,profiles,selectedProfileId,settings,accounts,activeAccountId,servers},null,2),{mode:0o600});await rename(temp,path.join(this.root,'state.json'));});return this.writeChain;}
 profile(id:string){const p=this.state.profiles.find(p=>p.id===id);if(!p)throw new Error('Perfil não encontrado.');return p;}
 dir(id:string){this.profile(id);if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Identificador inválido.');return path.join(this.state.settings.installRoot,id);}
}
