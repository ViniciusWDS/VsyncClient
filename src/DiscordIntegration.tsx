import {useState,useEffect} from 'react';
import type {Snapshot,Settings} from './shared';
import {Button,Field,Toggle,Badge} from './components';

export function DiscordIntegration({snapshot,save,open}:{snapshot:Snapshot;save:(changes:Partial<Settings>)=>void;open:()=>void}){
 const [id,setId]=useState(snapshot.settings.discordClientId??'');
 useEffect(()=>setId(snapshot.settings.discordClientId??''),[snapshot.settings.discordClientId]);
 const valid=/^\d{17,20}$/.test(id);
 return <section aria-label="Conexão com Discord">
  <Toggle checked={snapshot.settings.discord} onChange={discord=>save({discord})} label="Discord Rich Presence" description="Mostre o Vsync e suas partidas no Discord desktop. Você pode ocultar a presença em Privacidade."/>
  <Field label="Application ID público do Discord" hint="No portal Discord Developers, crie o aplicativo Vsync Client e copie o Application ID em General Information.">
   <input value={id} onChange={e=>setId(e.target.value.trim())} inputMode="numeric" maxLength={20} placeholder="Application ID do Vsync"/>
  </Field>
  <div className="release-actions"><Button disabled={!valid||id===snapshot.settings.discordClientId} onClick={()=>save({discordClientId:id})}>Salvar Application ID</Button><Button onClick={open}>Abrir portal do Discord</Button>{id&&<Button onClick={()=>{setId('');save({discordClientId:'',discord:false});}}>Desconectar</Button>}</div>
  <p role="status">{snapshot.system.native?snapshot.discord?.message??'Ative a presença para conectar.':'Configure a presença no aplicativo desktop.'}</p>
  {snapshot.discord?.status==='connected'&&<Badge tone="green">Discord conectado</Badge>}
  <p className="footnote">No modo Vsync direto, a presença acompanha o jogo. No modo oficial, mostra o launcher: a partida é iniciada fora do Vsync. Endereço do servidor e dados da conta não são compartilhados.</p>
 </section>;
}
