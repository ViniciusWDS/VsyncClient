# Vsync Client — 0.1.3 alpha

Launcher desktop independente para Minecraft Java Edition, com perfis isolados, catálogo Modrinth, ajustes de FPS e módulo Fabric separado. Inclui o site do aplicativo e um serviço Node para hospedá-lo na Discloud.

## Começar no Windows

1. Baixe o instalador da versão mais recente em [GitHub Releases](https://github.com/ViniciusWDS/VsyncClient/releases). O instalador alpha ainda não possui assinatura Authenticode do Windows.
2. Instale o **Minecraft Launcher original** pelo site oficial ou pela Microsoft Store. Abra-o, entre com uma conta que tenha acesso ao Java Edition e depois feche-o.
3. No Vsync, acesse **Configurações > Contas**, deixe **Minecraft Launcher oficial** selecionado e verifique a detecção. Há seleção manual do executável instalado e da pasta .minecraft já inicializada.
4. Escolha um perfil em **Meus perfis**. O alvo inicial é **Minecraft 1.21.1 / Fabric**.
5. Clique **Abrir launcher**. O Vsync prepara uma instalação **Vsync • nome do perfil** com uma pasta independente. No launcher original, selecione essa instalação e clique **Jogar**.

O login e a licença permanecem no launcher original. O Vsync não importa sua sessão. Localizar ou abrir o aplicativo não comprova login nem início de uma partida. Consulte [ORIGINAL.md](docs/ORIGINAL.md).

## Aba FPS

Selecione **FPS** na lateral, escolha um perfil 1.21.1 e aplique um preset. **Máximo desempenho**, **Equilibrado** e **Qualidade** alteram opções reais de gráficos, distâncias, efeitos e memória. Ajuste RAM, renderização, simulação, limite de FPS e VSync antes de aplicar.

Um backup precede cada aplicação. **Restaurar ajustes** recupera os valores anteriores das opções controladas e da memória, preservando outras preferências e os mods. Feche o Minecraft antes de alterar os arquivos. Abra o perfil novamente pelo Vsync para atualizar a memória na instalação oficial.

A seleção de otimizações usa **Fabric 1.21.1 / Loader 0.16.14 ou superior**. Sodium, Lithium, FerriteCore, ImmediatelyFast, Entity Culling e Dynamic FPS são consultados no Modrinth, com versões compatíveis, dependências e hashes. Escolha os itens e clique **Instalar otimizações**. Os arquivos são preparados juntos antes da alteração do perfil. Uma incompatibilidade declarada ou um hash incorreto interrompe a operação. A biblioteca de Mods permite ativar, desativar, atualizar e remover.

O launcher pode reduzir suas animações e ser minimizado. No modo oficial o Minecraft roda fora do Vsync, portanto o launcher não afirma acompanhar automaticamente essa execução. Mais RAM não garante mais FPS. Não houve benchmark no jogo: [BENCHMARK.md](docs/BENCHMARK.md).

## Site e Discloud

O pacote **Vsync-Client-Site-Discloud-0.1.2.zip** contém site, imagens, servidor, configuração e instalador. Extraia-o para conferir localmente:

```bash
npm start
```

Abra **http://localhost:8080**. O servidor escuta **0.0.0.0:8080**, conforme a Discloud. Não depende de pacotes externos. A página inclui recursos, demonstração interativa dos presets, instruções de login, novidades, perguntas frequentes, privacidade e download real com tamanho e SHA-256.

O pacote do site usa Node 24 e 512 MB. Antes de implantar na Discloud, confira a disponibilidade do endereço e dos recursos no seu plano. O canal de atualizações do aplicativo usa GitHub Releases.

Após aprovar/reservar o endereço, confira `ID=vsync-client` em **discloud.config** e envie o ZIP pelo painel. O launcher e o Minecraft rodam no computador do jogador; a Discloud hospeda site e arquivos de distribuição. Veja [DISCLOUD.md](docs/DISCLOUD.md).

## Desenvolvimento

Requisitos: **Node 24 LTS**, npm e **JDK 21** para compilar o HUD. As dependências estão fixadas no package-lock.json.

```bash
npm ci
npm run dev
```

Comandos úteis:

```bash
npm run dev:web
npm run check
npm test
npx playwright install chromium
npm run test:ui
npm run test:site
npm run test:site:ui
npm run test:official-network
npm run test:performance-network
npm run build
npm start
```

A prévia de interface no navegador identifica as operações que exigem desktop. Os preflights de rede baixam arquivos oficiais em pastas temporárias; não autenticam nem executam o Minecraft. Em ambientes Node com proxy, pode ser necessário `NODE_USE_ENV_PROXY=1`.

Para executar apenas o site a partir do código-fonte:

```bash
npm run site
```

Sem instalador em `services/web/releases`, a página informa que o download está em preparação. O pacote de hospedagem já inclui esse arquivo. O código-fonte não distribui binários do Minecraft.

## Vsync HUD

```bash
npm run compile:module
```

O Gradle Wrapper acompanha o projeto. Configure JAVA_HOME para JDK 21. O resultado é **module-artifacts/vsync-hud-0.1.0.jar**.

Compatibilidade inicial: **Fabric / Minecraft 1.21.1 + Fabric API**. Instale Fabric API pelo catálogo; depois use **Configurações > Avançado > Vsync HUD** para copiar o módulo ao perfil. O instalador já inclui o JAR compilado.

No jogo, **Right Shift** abre o menu, **C** segura zoom e **R** alterna sprint. O editor oferece arraste, escala, cor, transparência, alinhamento e presets. FPS, CPS, teclas, coordenadas, armadura, poções, mira e sessão fazem parte do módulo separado. A validação visual no jogo continua pendente. Instalar apenas o launcher não ativa o HUD.

## Compilar e testar o instalador

```bash
npm run compile:module
npm run dist:win
```

O resultado fica em **release/Vsync-Client-Setup-0.1.2.exe**. O build pode ser feito em Linux; sua inspeção não substitui execução em Windows. O desinstalador preserva perfis e mundos em AppData.

Em uma VM ou runner Windows descartável:

```powershell
./scripts/test-windows.ps1 -DisposableWindowsEnvironment
```

A rotina instala, abre o Electron, verifica preload e cofre, cria um perfil, reinicia, desinstala e confere a preservação de um mundo de teste. Não acessa conta real nem executa Minecraft. O aplicativo empacotado passou por abertura e reinício com dados isolados no Windows. O teste completo de instalação/desinstalação é reservado a um runner ou VM descartável.

Para preparar o pacote de hospedagem depois do build:

```bash
python3 scripts/package-discloud.py --installer release/Vsync-Client-Setup-0.1.2.exe --output release/Vsync-Client-Site-Discloud-0.1.2.zip
```

## Autenticação direta e atualizações

O modo **Vsync direto (avançado)** mantém o fluxo Microsoft próprio, PKCE e safeStorage. Seu registro Entra ainda precisa dos ajustes descritos em [MICROSOFT.md](docs/MICROSOFT.md). O Client ID próprio está incluído; isso não significa que o registro foi aprovado para todas as contas ou para a API Minecraft. Essa configuração não é necessária para o modo com launcher original.

O atualizador consulta GitHub Releases ao abrir e a cada 6 horas, baixa atualizações assinadas e instala quando o Minecraft e os downloads estiverem fechados. A primeira publicação exige configurar o secret de assinatura no GitHub. A chave privada fica fora do projeto. Veja [ATUALIZACOES.md](docs/ATUALIZACOES.md).

A aba Mods inclui catálogo paginado e 22 mods recomendados com compatibilidade consultada no Modrinth. A aba FPS oferece 9 otimizações. A presença do Discord desktop está configurada e pode ser controlada em **Configurações > Integrações**. Veja [DISCORD.md](docs/DISCORD.md).

## Organização e limites

| Pasta | Conteúdo |
|---|---|
| src | Interface React, design e aba FPS |
| electron/core | Perfis, autenticação, jogo, integração oficial, desempenho e downloads |
| module / module-artifacts | HUD Java/Fabric e JAR incluído |
| services/web | Site, servidor de arquivos e pacote Discloud |
| services/social | Plano do backend social futuro |
| docs | Estado, configuração, design system e validação |
| tests / scripts | Verificações, desenvolvimento e empacotamento |

Perfis usam Vanilla, Fabric ou Quilt conforme compatibilidade. Forge e NeoForge ainda não têm instalador. Duplicar copia componentes e configurações, sem mundos; exportar pode incluir mundos mediante escolha explícita. Remover perfis explica o conteúdo e pede confirmação antes de enviar à Lixeira. Backups gerais de componentes ficam em .vsync-backups; somente os ajustes FPS possuem restauração pela interface nesta versão.

**Amigos e cosméticos permanecem em desenvolvimento.** Discord Rich Presence está implementado por IPC local, com opção de privacidade. Não há compras ou serviço social funcional nesta alpha. Linux e macOS têm alvos preparados, sem homologação. Consulte [STATUS.md](docs/STATUS.md) e [VALIDACAO.md](docs/VALIDACAO.md).

Código próprio MIT. Marca panda fornecida pelo usuário, moldura própria e assets do projeto. Nenhum asset do Lunar ou CurseForge foi incorporado. Minecraft pertence aos respectivos titulares. As licenças de terceiros acompanham a distribuição.
