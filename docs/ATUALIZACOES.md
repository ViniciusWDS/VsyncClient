# Atualizações automáticas e GitHub Releases

O canal público é `https://github.com/ViniciusWDS/VsyncClient/releases/latest/download/windows-x64.json`. O aplicativo Windows x64 consulta ao abrir e a cada 6 horas, baixa o instalador automaticamente e verifica assinatura Ed25519, tamanho e SHA-256. Falhas têm nova tentativa após 15 minutos. Cancelar pausa o download durante a sessão; uma consulta explícita permite retomá-lo.

Quando o arquivo estiver pronto, a instalação aguarda o Minecraft, o launcher oficial, os downloads e as operações do Vsync terminarem. A inspeção de processos do Windows considera falha de detecção como ocupado. O NSIS recebe `/S /UPDATE /PID=... /D=...`, aguarda o processo principal fechar, preserva a pasta instalada e reinicia o Vsync. Perfis e mundos em AppData são preservados. A instalação automática não roda no modo de desenvolvimento.

## Primeira publicação

O endereço e a chave pública estão em `config/distribution.json`. A chave privada correspondente foi criada em `%LOCALAPPDATA%\VsyncClient\release-secrets\ViniciusWDS--VsyncClient-ed25519.pem`, fora do projeto, com acesso restrito ao usuário Windows. Faça backup protegido: trocar essa chave interrompe a confiança dos aplicativos já distribuídos.

O repositório deve ser público para permitir consultas e downloads sem credenciais embutidas no aplicativo. A automação usa o `GITHUB_TOKEN` temporário do Actions, com `contents: write` somente no job de publicação. Não é necessário guardar um PAT no código.

Em um terminal com GitHub CLI autenticado na conta que administra o repositório:

```powershell
gh auth login
npm run updates:setup -- ViniciusWDS/VsyncClient --upload
```

Esse comando reutiliza a chave existente, configura o canal e envia a chave privada diretamente ao secret **VSYNC_UPDATE_PRIVATE_KEY**. Não imprime o conteúdo da chave. Se executar em outro computador, restaure a chave original no caminho protegido antes de rodar. O comando recusa substituir uma chave pública existente por outra diferente.

No GitHub, confira **Settings > Actions > General** para permitir GitHub Actions. O workflow mantém os assets em rascunho até concluir os uploads do instalador e do manifesto.

## Lançar atualizações

O primeiro push de `package.json` com a versão 0.1.3 em `main` dispara o pipeline. Para as versões seguintes, salve e envie as alterações do código e aumente a versão:

```powershell
npm run check
npm test
git add .
npm run check:publication
git commit -m "Atualiza o aplicativo"
npm version patch -m "Release %s"
git push origin main --follow-tags
```

Cada versão deve avançar em `major.minor.patch`. O Actions testa o código e a interface, compila o HUD e o instalador, executa a homologação Windows, assina `windows-x64.json` e publica o EXE e o manifesto no GitHub Releases. `workflow_dispatch` e tags `v*` também são aceitos. Um push sem aumento de versão não republica um instalador já lançado.

O pipeline recusa downgrade de `latest`, tag divergente e substituição de assets da mesma versão. Um rascunho incompleto é preservado para revisão; corrija/remova o rascunho antes de repetir. A assinatura é verificada novamente antes de executar o instalador. Hosts e redirecionamentos são restritos a GitHub e seus hosts de assets exatos.

## Arquivos privados

`.gitignore` exclui ambientes reais, chaves privadas, certificados, sessões, perfis, bancos locais, logs e builds. `npm run check:publication` examina os blobs efetivamente indexados pelo Git e bloqueia padrões de credenciais e caminhos privados, mesmo adicionados com `git add -f`. A mesma auditoria roda no Actions antes de configurar o build. Ela complementa a revisão dos arquivos; não prova a ausência de todo tipo possível de dado confidencial.

O Microsoft Client ID, o Discord Application ID e a chave pública são identificadores públicos. A chave privada nunca deve entrar no Git, no ZIP da source, no instalador ou nos logs.

## Limites e validação

A assinatura Ed25519 autentica o canal de atualização; não é Authenticode e não remove avisos de editor desconhecido do Windows. O alvo inicial é Windows x64. Aplicativos antigos distribuídos sem canal precisam receber este instalador configurado uma vez.

Os testes cobrem assinatura adulterada, hash/tamanho, hosts, redirecionamentos, downgrade, cancelamento, concorrência, ociosidade e nova verificação antes de instalar. `npm run test:update-installer` verifica os argumentos NSIS com um instalador inofensivo e caminhos com espaços. A publicação online depende de acesso de escrita ao repositório e do secret; não confunda testes com uma release efetivamente publicada.

Contratos: [GitHub Actions token](https://docs.github.com/en/actions/concepts/security/github_token), [argumentos NSIS](https://nsis.sourceforge.io/Docs/Chapter3.html).
