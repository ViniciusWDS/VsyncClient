import {useEffect,useMemo,useState} from 'react';
import {Check,Download,ExternalLink,Info,Package,RefreshCw,Search,X} from 'lucide-react';
import type {Bridge,Profile,Project,Snapshot} from './shared';
import {MOD_CATEGORIES,RECOMMENDED_MODS,recommendedProject,type ModCompatibility} from './mods';
import {Badge,Button,Empty,IconButton} from './components';

type Run=<T=unknown>(method:string,args?:unknown,success?:string)=>Promise<T|undefined>;
export function ModCollection({state,profile,bridge,run,busy,onOpen}:{state:Snapshot;profile:Profile;bridge:Bridge;run:Run;busy:boolean;onOpen:(project:Project)=>void}){
 const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[selected,setSelected]=useState<string[]>([]),[compatibility,setCompatibility]=useState<ModCompatibility[]>([]),[checking,setChecking]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;setChecking(true);setCompatibility([]);setError('');
  bridge.call<ModCompatibility[]>('catalog.compatibility',{profileId:profile.id}).then(result=>{if(live)setCompatibility(Array.isArray(result)?result:[]);}).catch(error=>{if(live)setError(error.message??'Não foi possível consultar o Modrinth.');}).finally(()=>{if(live)setChecking(false);});
  return()=>{live=false;};
 },[profile.id,profile.gameVersion,profile.loader,bridge,reload]);
 const filtered=useMemo(()=>{const term=query.trim().toLocaleLowerCase('pt-BR');return RECOMMENDED_MODS.filter(mod=>(!category||mod.category===category)&&(!term||[mod.name,mod.description,mod.category].some(text=>text.toLocaleLowerCase('pt-BR').includes(term))));},[query,category]);
 const installed=(id:string)=>profile.components.some(component=>component.projectId===id&&component.enabled);
 const pending=selected.filter(id=>compatibility.some(status=>status.id===id&&status.compatible)&&!installed(id));
 const blocked=busy||state.game.state==='running'||state.game.state==='preparing'||state.tasks.some(task=>['queued','running'].includes(task.status));
 const install=async()=>{const result=await run<string>('catalog.installCollection',{profileId:profile.id,projects:pending},'Mods selecionados adicionados à fila. Dependências serão verificadas antes da instalação.');if(result)setSelected([]);};
 return <section aria-label="Mods recomendados">
  <div className="section-head"><div><h2>Monte sua coleção.</h2><p>{RECOMMENDED_MODS.length} sugestões para desempenho, interface e exploração. Escolha o que combina com você.</p></div><Button onClick={()=>setReload(value=>value+1)} disabled={checking}><RefreshCw size={14} className={checking?'spin':''}/>Verificar versões</Button></div>
  <div className="fps-inline-info"><Info size={17}/><p>{state.system.native?'As versões estáveis são consultadas no Modrinth para '+profile.gameVersion+' / '+profile.loader+'. Dependências e conflitos declarados são conferidos ao instalar.':'Abra o Vsync desktop para verificar as versões e instalar os mods.'} A disponibilidade de uma versão não garante compatibilidade entre todos os mods ou com as regras do servidor.</p></div>
  <div className="catalog-tools"><div className="search-input"><Search size={18}/><input aria-label="Buscar mods recomendados" placeholder="Busque entre os recomendados…" value={query} onChange={event=>setQuery(event.target.value)}/>{query&&<IconButton label="Limpar busca dos recomendados" onClick={()=>setQuery('')}><X size={14}/></IconButton>}</div></div>
  <div className="filter-row" aria-label="Categorias dos recomendados"><button className={'filter-chip '+(!category?'active':'')} onClick={()=>setCategory('')}>Todos ({RECOMMENDED_MODS.length})</button>{MOD_CATEGORIES.map(item=><button key={item} className={'filter-chip '+(category===item?'active':'')} onClick={()=>setCategory(item)}>{item}</button>)}</div>
  {error&&<div className="form-error" role="alert"><Info size={16}/>{error}</div>}
  <div className="fps-install-row"><p>{pending.length?pending.length+' mod(s) selecionado(s), incluindo itens de outras categorias.':'Nenhum mod selecionado. Use as caixas para montar sua seleção.'} As dependências obrigatórias serão incluídas automaticamente.</p><Button variant="primary" disabled={!state.system.native||checking||blocked||!pending.length} onClick={()=>void install()}><Download size={16}/>Instalar seleção ({pending.length})</Button></div>
  {filtered.length?<div className="fps-mods">{filtered.map((mod,index)=>{
   const status=compatibility.find(item=>item.id===mod.id),active=installed(mod.id);
   return <article className="fps-mod recommended-mod" key={mod.id}>
    <label className="fps-mod-check"><input type="checkbox" aria-label={'Selecionar recomendado '+mod.name} checked={selected.includes(mod.id)} disabled={!state.system.native||checking||!status?.compatible||active||blocked} onChange={event=>setSelected(values=>event.target.checked?[...values,mod.id]:values.filter(id=>id!==mod.id))}/><span className={'fps-mod-icon mod-icon-'+index%5}>{mod.name[0]}</span></label>
    <div className="fps-mod-copy"><div><h3>{mod.name}</h3><Badge tone="muted">{mod.category}</Badge></div><p>{mod.description}</p>{mod.note&&<p><Info size={12}/> {mod.note}</p>}<div className="fps-mod-state">{active?<Badge tone="green"><Check size={11}/>Instalado</Badge>:checking?<span>Consultando versão estável…</span>:status?.compatible?<Badge tone="green">Versão {status.version}</Badge>:<span>{status?.reason??'Não foi possível verificar a versão.'}</span>}</div><div className="profile-operations"><Button onClick={()=>onOpen(recommendedProject(mod))}><Package size={14}/>Ver versões e instalar</Button><IconButton label={'Abrir '+mod.name+' no Modrinth'} onClick={()=>void run('external',{url:'https://modrinth.com/mod/'+mod.slug})}><ExternalLink size={14}/></IconButton></div></div>
   </article>;
  })}</div>:<Empty icon={<Search/>} title="Nenhum recomendado encontrado" description="Ajuste a busca ou escolha outra categoria."><Button onClick={()=>{setQuery('');setCategory('');}}>Limpar filtros</Button></Empty>}
 </section>;
}
