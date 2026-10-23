import type {Preset} from './shared';

export interface FpsValues {preset:Preset;ram:number;renderDistance:number;simulationDistance:number;maxFps:number;vsync:boolean;}
export interface FpsProfile extends FpsValues {appliedAt:string;backupId:string;}
export const FPS_PRESETS:Record<Preset,{label:string;description:string;values:FpsValues;options:Record<string,string>}>= {
 Leve:{label:'Máximo desempenho',description:'Menos distância e efeitos. Prioriza fluidez em PCs mais modestos.',values:{preset:'Leve',ram:3072,renderDistance:6,simulationDistance:5,maxFps:260,vsync:false},options:{graphicsMode:'0',particles:'2',renderClouds:'false',entityShadows:'false',ao:'false',mipmapLevels:'0',biomeBlendRadius:'0',entityDistanceScaling:'0.6'}},
 Equilibrado:{label:'Equilibrado',description:'Mais alcance e alguns efeitos, com custo visual moderado.',values:{preset:'Equilibrado',ram:4096,renderDistance:10,simulationDistance:6,maxFps:260,vsync:false},options:{graphicsMode:'1',particles:'1',renderClouds:'fast',entityShadows:'true',ao:'true',mipmapLevels:'2',biomeBlendRadius:'2',entityDistanceScaling:'1.0'}},
 Qualidade:{label:'Qualidade',description:'Mais distância, iluminação suave e partículas. Exige mais do computador.',values:{preset:'Qualidade',ram:6144,renderDistance:16,simulationDistance:8,maxFps:120,vsync:true},options:{graphicsMode:'1',particles:'0',renderClouds:'true',entityShadows:'true',ao:'true',mipmapLevels:'4',biomeBlendRadius:'4',entityDistanceScaling:'1.0'}}
};
export const FPS_MODS=[
 {id:'AANobbMI',slug:'sodium',name:'Sodium',area:'Renderização',description:'Otimiza a renderização dos blocos e a construção de chunks.'},
 {id:'gvQqBUqZ',slug:'lithium',name:'Lithium',area:'Simulação',description:'Otimiza lógica do jogo, física e ticks do mundo.'},
 {id:'uXXizFIs',slug:'ferrite-core',name:'FerriteCore',area:'Memória',description:'Reduz o uso de memória por estruturas internas do jogo.'},
 {id:'5ZwdcRci',slug:'immediatelyfast',name:'ImmediatelyFast',area:'HUD e entidades',description:'Agrupa chamadas de renderização da interface e de entidades.'},
 {id:'NNAgCjsB',slug:'entityculling',name:'Entity Culling',area:'Visibilidade',description:'Evita renderizar entidades escondidas atrás de blocos.'},
 {id:'LQ3K71Q1',slug:'dynamic-fps',name:'Dynamic FPS',area:'Segundo plano',description:'Reduz consumo com o jogo fora de foco; não aumenta FPS em primeiro plano.'},
 {id:'nmDcB62a',slug:'modernfix',name:'ModernFix',area:'Memória e carregamento',description:'Otimiza memória e carregamento de recursos; os ganhos dependem do perfil.'},
 {id:'51shyZVL',slug:'moreculling',name:'More Culling',area:'Visibilidade de blocos',description:'Evita desenhar partes de blocos que não podem ser vistas.'},
 {id:'fQEb0iXm',slug:'krypton',name:'Krypton',area:'Rede',description:'Otimiza o processamento de rede do cliente; a conexão e o servidor continuam influenciando a latência.'}
] as const;
export const FPS_KEYS=[...new Set([...Object.keys(FPS_PRESETS.Leve.options),'renderDistance','simulationDistance','maxFps','enableVsync'])];
export function fpsOptions(value:FpsValues):Record<string,string>{return{...FPS_PRESETS[value.preset].options,renderDistance:String(value.renderDistance),simulationDistance:String(value.simulationDistance),maxFps:String(value.maxFps),enableVsync:String(value.vsync)};}
export function recommendedRam(memory:number,preset:Preset){return Math.max(1024,Math.min(FPS_PRESETS[preset].values.ram,Math.floor(Math.max(1024,memory-2048)/512)*512));}
