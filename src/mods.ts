import type {Project} from './shared';
import {FPS_MODS} from './performance';

export interface RecommendedMod {id:string;slug:string;name:string;category:string;description:string;note?:string;}
export interface ModCompatibility {id:string;compatible:boolean;version?:string;reason?:string;}
export const RECOMMENDED_MODS:readonly RecommendedMod[]=[
 ...FPS_MODS.map(mod=>({...mod,category:'Desempenho'})),
 {id:'PtjYWJkn',slug:'sodium-extra',name:'Sodium Extra',category:'Visuais',description:'Opções extras de gráficos, partículas e animações para Sodium.',note:'Exige Sodium e dependências compatíveis.'},
 {id:'Bh37bMuy',slug:'reeses-sodium-options',name:"Reese's Sodium Options",category:'Interface',description:'Organiza a tela de opções gráficas do Sodium.',note:'Exige Sodium. Confira a versão antes de instalar.'},
 {id:'YL57xq9U',slug:'iris',name:'Iris Shaders',category:'Visuais',description:'Adiciona suporte a shader packs em perfis compatíveis.',note:'Shaders são opcionais e podem reduzir os FPS. Confira a compatibilidade com Sodium.'},
 {id:'yBW8D80W',slug:'lambdynamiclights',name:'LambDynamicLights',category:'Visuais',description:'Adiciona luz dinâmica a itens e entidades que emitem luz.',note:'Efeitos adicionais podem aumentar o uso da GPU.'},
 {id:'EsAfCjCV',slug:'appleskin',name:'AppleSkin',category:'Interface',description:'Mostra informações de fome e saturação na interface.'},
 {id:'nvQzSEkH',slug:'jade',name:'Jade',category:'Interface',description:'Identifica blocos e entidades apontados pela mira.',note:'Algumas informações exigem suporte do servidor.'},
 {id:'aC3cM3Vq',slug:'mouse-tweaks',name:'Mouse Tweaks',category:'Inventário',description:'Adiciona atalhos do mouse para organizar e mover itens.'},
 {id:'O7RBXm3n',slug:'inventory-profiles-next',name:'Inventory Profiles Next',category:'Inventário',description:'Organiza inventários e oferece atalhos configuráveis para itens.',note:'Revise os atalhos e as regras do servidor antes de usar automações.'},
 {id:'w7ThoJFB',slug:'zoomify',name:'Zoomify',category:'Ferramentas',description:'Oferece zoom com atalhos e transições configuráveis.'},
 {id:'8shC1gFX',slug:'betterf3',name:'BetterF3',category:'Interface',description:'Organiza as informações técnicas da tela F3.'},
 {id:'2M01OLQq',slug:'shulkerboxtooltip',name:'Shulker Box Tooltip',category:'Inventário',description:'Mostra uma prévia do conteúdo de caixas de shulker.'},
 {id:'1bokaNcj',slug:'xaeros-minimap',name:"Xaero's Minimap",category:'Exploração',description:'Adiciona minimapa e pontos de referência configuráveis.',note:'Verifique as regras do servidor para minimapas e recursos de radar.'},
 {id:'NcUtCpym',slug:'xaeros-world-map',name:"Xaero's World Map",category:'Exploração',description:'Mantém um mapa dos lugares que você explorou.',note:'Verifique as regras do servidor para mapas e pontos de referência.'}
];
export const MOD_CATEGORIES=[...new Set(RECOMMENDED_MODS.map(mod=>mod.category))];
export function recommendedProject(mod:RecommendedMod):Project{return{id:mod.id,slug:mod.slug,title:mod.name,description:mod.description,author:'Comunidade Modrinth',categories:[mod.category],downloads:0,project_type:'mod'};}
