import type {FpsProfile} from './performance';
export type Loader='vanilla'|'fabric'|'quilt'|'forge'|'neoforge';
export type Page='home'|'profiles'|'modpacks'|'mods'|'textures'|'servers'|'cosmetics'|'friends'|'downloads'|'settings'|'fps';
export type Preset='Leve'|'Equilibrado'|'Qualidade';
export interface ComponentFile { id:string; projectId:string; versionId:string; name:string; version:string; filename:string; type:'mod'|'resourcepack'|'shader'; enabled:boolean; sha512:string; dependencies:string[]; }
export interface Profile { id:string; name:string; description:string; image?:string; gameVersion:string; loader:Loader; loaderVersion:string; ram:number; width:number; height:number; javaPath:string; jvmArgs:string[]; preset:Preset; accent:string; createdAt:string; lastPlayed?:string; installed:boolean; components:ComponentFile[]; performance?:FpsProfile; }
export interface Account {id:string;name:string;uuid:string;expiresAt:number;}
export interface Server {id:string;name:string;address:string;profileId:string;favorite:boolean;}
export interface Settings {language:'pt-BR';scale:number;accent:string;animations:boolean;reduceInGame:boolean;behavior:'keep'|'minimize';ram:number;javaPath:string;clientId:string;hidePresence:boolean;hideServer:boolean;discord:boolean;discordClientId:string;downloadConcurrency:number;installRoot:string;launchMode:'official'|'vsync';officialLauncherPath:string;officialGameRoot:string;}
export interface DiscordState {status:'disabled'|'hidden'|'unconfigured'|'connecting'|'connected'|'disconnected';message:string;}
export interface OfficialState {status:'unchecked'|'ready'|'missing'|'unsupported'|'preparing'|'handoff'|'error';supported:boolean;message:string;gameRoot:string;source?:'store'|'exe';profileName?:string;preparedAt?:string;openedAt?:string;}
export type TaskStatus='queued'|'running'|'completed'|'error'|'cancelled';
export interface DownloadTask {id:string;name:string;status:TaskStatus;received:number;total:number;speed:number;detail:string;error?:string;canRetry:boolean;canPause:false;}
export interface UpdateState {state:'unconfigured'|'idle'|'checking'|'current'|'available'|'downloading'|'ready'|'installing'|'error';received:number;total:number;message:string;version?:string;notes?:string;error?:string;checkedAt?:string;}
export interface ValidationCheck {name:string;status:'passed'|'failed'|'pending';detail:string;}
export interface ValidationReport {checkedAt:string;checks:ValidationCheck[];}
export interface Snapshot {profiles:Profile[];selectedProfileId:string;accounts:Account[];activeAccountId:string;settings:Settings;servers:Server[];tasks:DownloadTask[];logs:string[];updates:UpdateState;official:OfficialState;discord?:DiscordState;game:{state:'idle'|'preparing'|'running'|'error';profileId?:string;message?:string};system:{memory:number;platform:string;appVersion:string;moduleAvailable:boolean;native:boolean};}
export interface Project {id:string;slug:string;title:string;description:string;author:string;icon_url?:string;downloads:number;categories:string[];project_type:string;versions?:string[];gallery?:string[];}
export interface ProjectVersion {id:string;name:string;version_number:string;changelog:string;game_versions:string[];loaders:string[];date_published:string;dependencies:{project_id:string|null;version_id:string|null;dependency_type:string}[];files:{url:string;filename:string;primary:boolean;size:number;hashes:{sha512:string;sha1:string}}[];}
export interface ProjectDetail {project:Project & {body?:string;source_url?:string;license?:{id:string;name:string}};versions:ProjectVersion[];}
export interface SearchQuery {query:string;type:'mod'|'modpack'|'resourcepack'|'shader';version:string;loader:string;sort:string;category:string;offset?:number;}
export interface Bridge {call<T=unknown>(method:string,args?:unknown):Promise<T>;subscribe(listener:(s:Snapshot)=>void):()=>void;}
declare global {interface Window {vsync?:Bridge;}}
export const INITIAL_VERSION='1.21.1';
export const PRESETS=[
 {name:'Vsync Performance',description:'Uma base limpa para configurar otimizações compatíveis.',loader:'fabric',preset:'Leve',ram:3072,components:'Fabric + aba FPS para ajustes e instalação opcional de otimizações.'},
 {name:'Vsync Survival',description:'Seu próximo mundo começa aqui.',loader:'fabric',preset:'Equilibrado',ram:4096,components:'Fabric. HUD Vsync pode ser instalado separadamente com Fabric API.'},
 {name:'Vsync PvP',description:'Interface leve para suas partidas.',loader:'fabric',preset:'Leve',ram:3072,components:'Fabric. HUD PvP disponível no módulo separado, sem alterações no combate.'},
 {name:'Vsync Modded',description:'Um espaço só para seus mods favoritos.',loader:'fabric',preset:'Qualidade',ram:6144,components:'Fabric. Escolha os mods no catálogo; nenhum pack é instalado silenciosamente.'}
] as const;
export const DEFAULT_SETTINGS:Settings={language:'pt-BR',scale:1,accent:'#8B5CF6',animations:true,reduceInGame:true,behavior:'minimize',ram:4096,javaPath:'',clientId:'',hidePresence:false,hideServer:true,discord:true,discordClientId:'',downloadConcurrency:4,installRoot:'',launchMode:'official',officialLauncherPath:'',officialGameRoot:''};
