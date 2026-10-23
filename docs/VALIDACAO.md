# Validação — Vsync Client 0.1.3

## Revisão atual em Windows — 23/10/2026

| Verificação | Resultado observado |
|---|---|
| TypeScript e build React/Electron | Aprovados |
| Testes do núcleo, catálogo, Discord, releases e atualizações | 67 aprovados; 2 subcasos de symlink ignorados por falta de privilégio Windows; 0 falhas |
| Interface do launcher | 26 verificações aprovadas; sem erros JavaScript; paginação, coleção de mods e configuração Discord incluídas |
| Site | 3 testes aprovados; 1 subcaso symlink ignorado; 6 verificações de interface aprovadas |
| Catálogo real Modrinth | 22 de 22 recomendados com versão estável Fabric 1.21.1 na consulta desta revisão |
| Download real de otimizações | 9 projetos e dependências baixados, tamanhos e SHA-512 conferidos; sem execução de partida |
| HUD Java/Fabric | Recompilado em Windows com Temurin 21 e Gradle 8.14.3; classe e metadados conferidos |
| Instalador 0.1.3 | Compilado com NSIS no Windows; sem Authenticode |
| Executável empacotado | Primeira abertura e reinício aprovados com dados isolados: preload, renderização, safeStorage, HUD empacotado e persistência de perfil |
| Argumentos da atualização silenciosa | Fixture NSIS nativa aprovou instalador e diretório com espaços |
| Discord IPC | Handshake, frames fragmentados, ping/pong, reconexão, troca de ID e privacidade aprovados com servidor local isolado |
| Auditoria de publicação | Source indexada examinada; padrões de segredos e arquivos privados bloqueados; chave privada fora do projeto |
| GitHub online | Publicação ainda depende de acesso de escrita a ViniciusWDS/VsyncClient e do secret VSYNC_UPDATE_PRIVATE_KEY |

Os relatórios locais ficam em `test-results/interface.json`, `test-results/mods-network.json`, `test-results/performance-network.json` e `test-results/windows-native-current`. Esses relatórios e os dados de teste são excluídos do Git. Não foi executado instalador real sobre a instalação do usuário, nem uma partida Minecraft. A publicação real e uma atualização entre releases online ainda precisam ser observadas após liberar o acesso GitHub. A presença na conta Discord real também precisa ser conferida com o cliente desktop aberto.

## Histórico da entrega original 0.1.2

As evidências abaixo descrevem a entrega anterior e não substituem os resultados da revisão 0.1.3 acima.

## Evidências desta entrega

| Verificação | Observado |
|---|---|
| TypeScript, React e bundles Electron | Compilaram |
| Núcleo, autenticação, integração oficial e FPS | 37 testes passaram |
| Interface do launcher | 23 verificações em Chromium, sem erros JavaScript |
| Janela 1440 × 900 e 960 × 640 | Navegação/FPS inspecionados; sem overflow horizontal |
| Preflight do launcher oficial | APIs Fabric reais, 8 bibliotecas / 3.955.016 bytes, hashes conferidos; host Windows simulado |
| Preflight de otimizações | 6 mods + Fabric API, downloads reais e SHA-512; requisitos Fabric inspecionados |
| Servidor do site | 4 testes de rotas, integridade, ranges, cache, métodos e isolamento |
| Interface do site | 6 verificações, incluindo 1440/768/390 px, sem erros JavaScript |
| Download do site | UI com fixture; download completo do instalador real a partir do ZIP extraído com SHA-256 conferido |
| Prévia HTML autônoma | Imagens/fontes incorporadas, presets funcionando, sem requisições externas |
| Hospedagem Discloud | Sem implantação confirmada |
| Site hospedado | Não implantado; nenhum subdomínio Vsync reservado por esta sessão |
| Instalador 0.1.2 | Compilado em Linux; cabeçalho/NSIS/CRC inspecionados conforme relatório de entrega |
| Assinatura Windows | Ausente; não há certificado Authenticode configurado |
| Execução nativa Windows | Não executada; não havia Windows ou Wine acessível |
| Login de jogador, Minecraft e HUD em uma partida | Não executados |
| Medição de FPS | Não executada; nenhum ganho percentual publicado |

## Integração oficial

Testes de arquivos cobrem as duas variantes de configuração, preservação de outras instalações, seleção e preferências, backup, gameDir isolado, bibliotecas com hash, conflito de propriedade, arquivo inválido, cancelamento e alteração concorrente. O arquivo de contas da fixture é preservado.

A descoberta Store/executável e sua abertura são testadas com host injetado. O preflight real de rede não abre software. Os estados permanecem sem conta conectada e sem jogo em execução depois do handoff. A presença do launcher não é tratada como autenticação.

No Windows ainda é necessário testar a edição Microsoft Store e a edição instalada por executável, iniciar/fechar o launcher, preparar o perfil, entrar na Microsoft e abrir uma partida Java licenciada.

## FPS e mods

Aplicação e restauração preservam preferências não controladas, perfil vizinho e mods. São testados RAM inválida, versão não suportada, links simbólicos, backup adulterado e falha de persistência com reversão. A seleção de otimizações recusa Fabric Loader abaixo de 0.16.14, resolve dependência comum e conflitos entre itens do lote. Um arquivo corrompido não deixa instalação parcial.

O preflight real baixou Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling, Dynamic FPS e Fabric API compatíveis com Fabric 1.21.1. Versões, tamanhos, hashes e requisitos estão em test-results/performance-network.json. Isso não homologa todos juntos em uma partida.

## Site e hospedagem

O servidor verifica tamanho e SHA-256 do arquivo antes de disponibilizá-lo. Os testes cobrem HTML/API, bloqueio de arquivos de código/configuração, symlink, HEAD, range parcial/sufixo, range inválido, ETag e arquivo adulterado/ausente. A falta de manifesto assinado retorna indisponibilidade.

A interface foi exercitada em 1440, 768 e 390 px, com clique/teclado nos presets, FAQ, diálogo de privacidade, navegação móvel e download por uma fixture. Imagens/fontes carregaram e não houve overflow horizontal.

O endereço proposto não foi reservado. O ZIP foi preparado anteriormente; não há implantação ou teste através do proxy Discloud confirmado neste projeto.

## Autenticação direta, HUD e atualizações

O fluxo Microsoft próprio permanece coberto com respostas controladas, loopback real, PKCE, estados inválidos, licença ausente e cofre de teste. Entrar no portal Entra em uma etapa anterior não comprova licença Minecraft. Ajustes pendentes do registro estão em MICROSOFT.md e não impedem o modo oficial.

O JAR do HUD foi compilado/remapeado anteriormente para Fabric 1.21.1. Nesta revisão o módulo Java não mudou. A validação confere integridade de arquivo sem declarar que o HUD foi renderizado. Right Shift, editor, controles, presets e persistência precisam de observação no jogo.

O atualizador é testado com assinatura Ed25519, envelope adulterado, hosts exatos, redirecionamentos, arquitetura, downgrade, hash, cancelamento e alteração depois do download. O canal não foi configurado/publicado e nenhum instalador de atualização foi executado em Windows.

## Homologação Windows preparada

scripts/test-windows.ps1 exige ambiente descartável, instala, verifica atalhos/registro, abre o Electron isolado, confere preload/Node ausente/cofre, cria um perfil, reinicia, desinstala e preserva um mundo de teste. O script não autentica nem executa Minecraft.

O workflow inclui build, testes do launcher/site, compilação do módulo e smoke do instalador. Não houve execução remota Windows. A inspeção do NSIS em Linux e o parser PowerShell não substituem essa etapa.

## Reproduzir

```bash
npm ci
npm test
npm run test:site
npx playwright install chromium
npm run test:ui
npm run test:site:ui
npm run test:official-network
npm run test:performance-network
npm run compile:module
npm run dist:win
```

```powershell
./scripts/test-windows.ps1 -DisposableWindowsEnvironment
```

Ambiente observado: Node 24.19.0, Electron 45.0.0, React 19.3.1, Vite 8.3.5, TypeScript 7.0.2, Chromium headless 138, Linux. Os scripts de UI aceitam VSYNC_TEST_BROWSER e VSYNC_TEST_SCREENSHOTS. Os relatórios JSON estão em test-results. Documentos de uso: ORIGINAL.md, BENCHMARK.md e DISCLOUD.md.
