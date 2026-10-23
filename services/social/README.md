# Serviço Vsync — plano

Este diretório documenta o backend futuro. Nenhum serviço fictício é iniciado e não há credenciais incluídas.

## Responsabilidades

Identidade Vsync separada das sessões Minecraft; amizade bilateral; presença optativa com TTL; mensagens autorizadas; convites com expiração; bloqueio; denúncia com moderação; catálogo e posse de cosméticos; manifests de assets assinados; notícias.

O launcher não deve enviar refresh tokens Microsoft ao serviço.

| Contrato previsto | Uso | Regra |
|---|---|---|
| POST /v1/session | Sessão Vsync | OAuth próprio com PKCE; não confiar apenas em nome de jogador |
| GET /v1/me | Conta e preferências | Dados mínimos, sessão obrigatória |
| GET /v1/friends | Relações aceitas | Apenas usuário ativo |
| POST /v1/friend-requests | Solicitar | Rate limit, deduplicação e bloqueios |
| POST /v1/friend-requests/:id/accept | Aceitar | Somente destinatário |
| POST /v1/blocks | Bloquear | Interromper mensagens, convites e presença |
| POST /v1/reports | Denunciar | Evidência mínima e acesso restrito |
| POST /v1/invites | Convite | Entre amigos, validade curta |
| POST /v1/messages | Mensagem | Amizade aceita e ausência de bloqueio |
| GET /v1/cosmetics | Catálogo | Licenças e assets versionados |
| GET /v1/me/entitlements | Posse | Nunca confiar no estado local |
| GET /v1/news | Notícias | Conteúdo sanitizado e links permitidos |
| WS /v1/events | Presença | Sessão curta, limites e ocultação |

PostgreSQL guarda relações, preferências, denúncias e posse; Redis guarda presença e limites. Assets têm hashes e manifesto assinado.

hidePresence impede publicação identificável de presença. hideServer exclui endereço e nome do servidor de eventos e Rich Presence.

O módulo futuro recebe apenas tokens Vsync curtos e de escopo limitado por canal local autenticado. Capas são visíveis a usuários com módulo compatível.

Antes de habilitar a interface: testar acesso cruzado entre usuários, bloqueio nos dois sentidos, limites, abuso e preferências de privacidade. Esses serviços ainda não foram implementados.
