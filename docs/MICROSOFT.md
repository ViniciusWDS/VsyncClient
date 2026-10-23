> **0.1.2:** este documento é para o modo Vsync direto (avançado). O modo padrão usa o Minecraft Launcher original e não depende desses ajustes. Veja ORIGINAL.md.

# Microsoft — configuração verificada nesta revisão

## Registro encontrado

- Nome no Microsoft Entra: **Vsync Client**.
- Application (client) ID público: **f7b6c5c1-faef-4332-82d9-82c13e9d8446**.
- Esse identificador está incluído em `config/distribution.json` e é preenchido automaticamente em instalações novas. Configurações existentes com outro ID são preservadas.
- Nenhum client secret é necessário ou incluído no launcher.

## Estado observado no portal

A conta conseguiu entrar no Microsoft Entra. O registro existente foi aberto e conferido, sem criação de outro aplicativo.

| Configuração | Estado observado | Ajuste necessário |
|---|---|---|
| Tipos de conta | Somente minha organização | Somente contas pessoais Microsoft, para Xbox/Minecraft |
| URI desktop | Nenhum URI configurado | Plataforma de aplicativos móveis/desktop com `http://localhost` |
| Segredo | Nenhum segredo criado nesta sessão | Continuar sem segredo no launcher |
| API Minecraft | Não validada | Conferir acesso do aplicativo quando o fluxo oficial puder ser executado |

A revisão automática bloqueou a seleção de “Somente contas pessoais”, por alterar o escopo de contas do aplicativo. Nenhuma alteração desse tipo foi salva. O retorno desktop também não foi alterado enquanto essa aprovação está pendente.

A próxima alteração a aprovar é específica: permitir contas pessoais Microsoft no registro Vsync existente e cadastrar `http://localhost` como retorno da plataforma desktop. Não adicionar permissões administrativas nem criar client secrets.

## Fluxo implementado

Navegador oficial → código com PKCE/S256 e estado aleatório → retorno loopback → token Microsoft → Xbox → XSTS → Minecraft → licença Java Edition → perfil.

O retorno local recusa método, caminho e estado incorretos. A página de retorno confirma apenas o recebimento, e orienta consultar o resultado no launcher. A interface só informa sucesso após Xbox, licença e perfil válidos. Tokens ficam no processo principal, cifrados por `safeStorage`; o estado da interface recebe apenas metadados públicos da conta.

Em **Configurações > Contas > Validar login e licença**, o launcher renova a sessão quando necessário e consulta novamente a licença e o perfil no serviço Minecraft. Isso exige login real bem-sucedido; a conta usada no portal Entra, por si só, não comprova posse de Minecraft.

## Testes desta revisão

O fluxo completo foi exercitado com respostas controladas, código de autorização de teste e cofre isolado de teste. Foram conferidos PKCE, proteção do retorno, bloqueio de login simultâneo, recusa sem cofre, rejeição de conta sem licença e ausência de tokens no estado público.

Esse teste não usa credenciais reais e não equivale a login Microsoft/Xbox/Minecraft ponta a ponta. DPAPI, consentimento real, renovação real e licença do jogador ainda precisam ser homologados no Windows.

Referências oficiais: [Registro de aplicativo](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app), [retornos locais e portas variáveis](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url), [código de autorização e PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).
