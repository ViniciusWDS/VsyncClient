# Vsync Client — Design system

## Direção

Um espaço escuro, organizado e silencioso para entrar no Minecraft. A hierarquia prioriza perfil, versão e ação principal. Roxo identifica ação e seleção; panda e broto verde assinam a marca.

Lunar orienta a composição e o destaque do lançamento. CurseForge orienta organização e descoberta. Moldura, floresta vetorial, ícone e composição são próprios do Vsync.

## Paleta

| Token | HEX | Uso |
|---|---|---|
| Fundo | #09090D | Conteúdo principal |
| Lateral | #101017 | Navegação |
| Superfície | #181820 | Cards |
| Elevado | #22222E | Controles elevados |
| Roxo | #8B5CF6 | Seleção, foco e halo |
| Roxo intenso | #7C3AED | Ação com texto branco |
| Lilás | #C4B5FD | Detalhes e texto destacado |
| Texto | #F5F3FF | Títulos e conteúdo |
| Secundário | #A5A1B5 | Descrições e metadados |
| Borda | #30303D | Contornos e divisões |
| Sucesso | #4ADE80 | Conclusão e componente ativo |
| Erro | #F87171 | Falha e ação destrutiva |
| Aviso | #FBBF24 | Incompatibilidade e desenvolvimento |

O botão principal usa degradê de #7C3AED a #6D28D9 para texto claro. O verde do broto fica na imagem completa.

## Tipografia

Inter variável, distribuída localmente, com fallback Segoe UI.

| Elemento | Tamanho | Peso | Regra |
|---|---:|---:|---|
| Banner | 48–64 px | 750 | Duas linhas, entrelinha 1,05 |
| Título da página | 23–26 px | 650 | Espaçamento negativo discreto |
| Seção | 16–18 px | 650 | Ação à direita |
| Navegação | 12 px | 400/600 | Ativo com peso maior |
| Projeto | 13 px | 650 | Elipse no card |
| Descrição | 11–12 px | 400 | Entrelinha 1,55–1,75 |
| Botão principal | 11–13 px | 550–700 | Maiúsculas no lançamento |
| Metadado | 8–10 px | 400/500 | Sem informação essencial exclusiva |

Escala ajustável de conteúdo: 80% a 130%. Ícones: navegação 18 px; ações 15–18 px.

## Tokens CSS

~~~css
:root {
  --bg: #09090D;
  --sidebar: #101017;
  --surface: #181820;
  --elevated: #22222E;
  --accent: #8B5CF6;
  --purple: #7C3AED;
  --lilac: #C4B5FD;
  --text: #F5F3FF;
  --muted: #A5A1B5;
  --border: #30303D;
  --success: #4ADE80;
  --error: #F87171;
  --warning: #FBBF24;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --radius-control: 8px;
  --radius-card: 12px;
  --radius-dialog: 16px;
  --shadow-dialog: 0 30px 100px #000a;
}
~~~

Cores estão implementadas em src/styles.css; a escala de espaço e raios documenta os valores usados pelos componentes.

## Marca e imagens

- panda.png: referência original com broto, mantida separadamente.
- logo-vsync.svg: aplicação completa com imagem embutida, escudo próprio e nome abaixo.
- icon.svg, icon.png e build/icon.ico: símbolo vetorial simplificado.
- mark-mono.svg: aplicação branca com recortes transparentes.
- bamboo.svg: cenário vetorial original em blocos, névoa roxa, lua e rio.

Respiro mínimo: 12% da largura do símbolo. Para 16–48 px, preferir o ícone. Não adotar a lua ou a moldura do Lunar. Não redistribuir texturas do Minecraft para preencher o cenário.

## Layout

Referência 1440 × 900; mínimo 960 × 640.

| Região | Referência | Comportamento |
|---|---|---|
| Superior | 46 px | Marca, conta, notificações e janela |
| Lateral | 205 px | Fixa, rola em janela baixa |
| Amigos | 224 px | Recolhe para 46 px |
| Conteúdo | Flexível | Rolagem interna; máximo 1450 px |
| Lançamento | 94 px | Persistente |
| Padding | 29 px | Reduz em janelas menores |

Até 1250 px, amigos usa faixa compacta. Até 1000 px, a faixa desaparece; Amigos continua no menu. Presets passam de quatro para duas colunas. Esta interface é desktop.

## Componentes e estados

| Componente | Padrão | Estados |
|---|---|---|
| Navegação | Ícone e nome | Hover, ativo, foco |
| Botão | Primário, secundário, fantasma, perigo | Hover, foco, desabilitado, progresso |
| Perfil | Arte, nome, versão e loader | Selecionado, instalado, não instalado |
| Projeto | Arte, nome, descrição e origem | Skeleton, resultado, vazio, erro e repetir |
| Campo | Label e ajuda | Foco, somente leitura, validação |
| Badge | Rótulo compacto | Roxo, verde, neutro, aviso |
| Diálogo | Cabeçalho e rodapé | Escape, ciclo de foco e foco restaurado |
| Download | Arquivo e progresso | Fila, executando, concluído, cancelado, erro |
| Aviso | Ícone e mensagem | role=status/alert e fechar |
| Integração pendente | Descrição explícita | Badge e controle indisponível |

O botão de lançamento usa estado real: Instalar, Baixando, Preparando, Jogar e Em execução. O desktop não simula conclusão de download.

## Acessibilidade e movimento

Foco de 2 px com respiro; labels associados; diálogos aria-modal; toggles role=switch; erros comunicados por texto e ícone; respeito a prefers-reduced-motion. A ação principal tem 40–44 px de altura. Controles compactos são de desktop e devem ser ampliados para uma eventual versão de toque.

Amigos, cosméticos e Discord têm indisponibilidade explícita. Nenhuma presença, posse de item ou estatística de desempenho deve ser inventada para preencher a interface.
