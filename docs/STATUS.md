# Estado da entrega — 0.1.3 alpha

Implementação, validação local e homologação são etapas diferentes. Consulte VALIDACAO.md.

| Área | Funciona no código entregue | Limite ou dependência |
|---|---|---|
| Identidade | Panda com broto, moldura própria, versões completa e monocromática, SVG/PNG/ICO | Direitos da imagem fornecida pelo usuário |
| Interface | Onze abas, FPS, amigos recolhíveis, jogar persistente, estados e janela mínima 960 × 640 | Smoke nativo isolado Windows aprovado; partida real pendente |
| Perfis | Criar, editar, escolher imagem, duplicar, importar/exportar, Java, RAM e resolução | Duplicação exclui mundos; mudanças de loader com componentes exigem perfil limpo |
| Exclusão | Explicação dos arquivos/mundos, confirmação nativa e Lixeira | Depende do sistema operacional |
| Minecraft Launcher original | Detecção Store/executável, perfil isolado, metadados oficiais, backup, verificação de concorrência e abertura | Testes de abertura usam host simulado em Linux; Windows e login real pendentes |
| Conta no modo oficial | Login e licença no aplicativo original, sem importar a sessão | Vsync não confirma autenticação ou execução externas |
| Modo Vsync direto | PKCE, Xbox/XSTS, licença, perfil, múltiplas contas e safeStorage | Registro Entra ainda depende de ajuste/aprovação; não validado com jogador real |
| Instalação própria | Manifestos, bibliotecas, assets, natives, hashes, Java e execução de processo | Não houve partida real nesta sessão |
| Loaders | Vanilla, Fabric e Quilt consultados nas fontes oficiais | Fabric 1.21.1 é o alvo inicial; Forge/NeoForge pendentes |
| Catálogo | API Modrinth, paginação, pesquisa, filtros, 22 recomendados e instalação em lote | Sem API CurseForge |
| Componentes | Dependências, conflitos declarados, SHA-512, ativar/desativar/atualizar/remover e backups | Conflitos desconhecidos não são deduzidos |
| Modpacks | .mrpack em perfil próprio com overrides | Packs Forge/NeoForge indisponíveis; gestão individual de arquivos importados é limitada |
| FPS | Presets de gráficos/RAM, ajustes finos, backup e restauração de opções controladas | Minecraft 1.21.1; fechar jogo; ganho real de FPS não medido |
| Otimizações | Seleção de nove projetos com instalação em lote, dependências e hashes | Fabric 1.21.1 / Loader 0.16.14+; teste conjunto dentro do jogo pendente |
| Downloads | Fila, progresso, velocidade, cancelamento e repetição | Sem pausa/retomada no launcher; servidor do site aceita Range |
| HUD | JAR 0.1.0 compilado: FPS/CPS/teclas/coords/armadura/poções/sprint/zoom/mira/sessão/editor | Instalação separada, Fabric API e validação visual no jogo |
| Servidores | Cadastro, favoritos, perfil, status e latência quando disponíveis | Modo oficial abre o perfil; conexão por Multijogador no aplicativo original |
| Amigos e cosméticos | Telas identificadas e plano de serviço | Backend/presença/chat/convites/visibilidade no jogo pendentes |
| Discord | Rich Presence por IPC local, app ID configurado, privacidade e reconexão | Nome associado ao ID: carolzinha ZzZ; exibição real no Discord pendente |
| Diagnóstico | Exportação com remoção de padrões sensíveis | Revisar logs de terceiros antes de compartilhar |
| Instalador Windows | NSIS, versão, atalhos, preservação de dados e rotina de smoke/CI | Compilado em Windows; aplicativo empacotado aprovado em smoke isolado; sem Authenticode |
| Atualização do app | Consulta e download automáticos, instalação silenciosa ociosa, notas, cancelamento e Ed25519/SHA-256 | Canal e chave pública configurados; falta publicar no GitHub e configurar secret |
| Site | Página responsiva, presets interativos, instruções, novidades, FAQ, privacidade e downloads | Disponível em pacote local; não publicado |
| Servidor Discloud | Node, 0.0.0.0:8080, streaming, Range, HEAD, ETag, saúde e metadados | Endereço proposto; envio/implantação pendentes |

Nenhum custo foi contratado nem aplicativo existente da Discloud alterado. O endereço é uma proposta até reserva confirmada. O launcher/Minecraft não são executados na hospedagem do site.
