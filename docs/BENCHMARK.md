# FPS e desempenho — 0.1.2

A aba FPS aplica ajustes reais ao options.txt e à memória do perfil Minecraft 1.21.1. O resultado depende do hardware, do mundo e dos componentes. Nenhuma medição de FPS foi executada nesta sessão.

| Preset | RAM sugerida | Renderização / simulação | Efeitos | Limite / VSync |
|---|---:|---|---|---|
| Máximo desempenho (Leve) | 3 GB | 6 / 5 chunks | Rápido, partículas mínimas, nuvens/sombras/AO desligados, mipmap 0 | Sem limite / desligado |
| Equilibrado | 4 GB | 10 / 6 chunks | Detalhado, partículas reduzidas, nuvens rápidas, sombras/AO ligados, mipmap 2 | Sem limite / desligado |
| Qualidade | 6 GB | 16 / 8 chunks | Detalhado, partículas completas, nuvens detalhadas, sombras/AO ligados, mipmap 4 | 120 / ligado |

RAM sugerida respeita a memória detectada, com reserva para o sistema. O usuário pode ajustar memória, distâncias, limite de FPS e VSync. O Minecraft usa 260 no options.txt para o extremo sem limite. Servidores podem impor sua própria distância. Mods de gráficos podem ter opções adicionais próprias.

Antes de aplicar, o Vsync salva os valores anteriores das chaves controladas e da RAM em .vsync-fps/UUID. Restaurar preserva preferências não controladas que tenham sido alteradas depois. Não remove mods. Feche o jogo primeiro; as opções são lidas no próximo início. Abra novamente pelo Vsync para atualizar a RAM na instalação oficial.

## Mods opcionais

Para Fabric 1.21.1 / Loader 0.16.14 ou superior, a aba consulta Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling e Dynamic FPS no Modrinth. Instala apenas a seleção explícita e as dependências obrigatórias. Arquivos são verificados por SHA-512 e preparados antes de confirmar o lote. Incompatibilidades declaradas pelos autores são consideradas; conflitos desconhecidos ainda podem exigir outro perfil.

Dynamic FPS reduz consumo quando o jogo está fora de foco; não promete ganho de FPS no primeiro plano. Não redistribuímos os arquivos desses autores dentro do launcher ou no site. O próprio cliente baixa da fonte original.

## Verificação desta sessão

As seis otimizações mais Fabric API foram baixadas em diretório temporário com hashes conferidos. Os metadados consultados correspondem a Fabric 1.21.1. Foram inspecionados os requisitos fabric.mod.json dos arquivos. O resultado e as versões exatas estão em test-results/performance-network.json. Não houve execução do Minecraft ou teste de convivência dentro de uma partida.

## Medição reproduzível pendente

1. Registrar CPU, GPU, RAM, disco, Windows, driver, Java, Minecraft, loader e versões exatas dos mods.
2. Usar cópias do mesmo mundo, posição, horário, clima e percurso.
3. Para medir apenas mods, manter resolução, distâncias, efeitos, VSync, limite e shaders idênticos. Para comparar presets, registrar cada opção diferente.
4. Aquecer por dois minutos. Medir três percursos de três minutos, alternando a ordem dos perfis.
5. Registrar FPS médio, percentis de frametime, CPU/GPU, RAM e inicialização. F3/HUD permitem observar FPS; percentis precisam de ferramenta de captura apropriada.
6. Comparar launcher em primeiro plano, minimizado e com animações reduzidas.

| Comparação | FPS médio | P99 frametime | RAM | Condições |
|---|---|---|---|---|
| A preencher no Windows | Não medido | Não medido | Não medido | Partida ainda não executada |

Não publicar ganho percentual antes das medições e de suas repetições.
