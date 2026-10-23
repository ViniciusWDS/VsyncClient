# Site, downloads e Discloud

## Entrega

services/web contém um site responsivo com a identidade Vsync, apresentação dos recursos, captura do launcher, demonstração interativa dos três presets, guia de login no aplicativo original, novidades, perguntas frequentes e privacidade. O botão de download só habilita após o servidor verificar a presença, tamanho e SHA-256 do instalador.

O serviço Node não depende de pacotes de produção. Escuta 0.0.0.0:8080 e distribui o instalador por streaming, com GET/HEAD, ETag e Range de um intervalo. Não recebe credenciais de jogadores, comandos administrativos ou uploads públicos. Somente rotas explicitamente permitidas são servidas.

## Estado de publicação

O site não possui implantação confirmada neste projeto. O endereço em discloud.config é uma proposta; confira sua disponibilidade e os recursos necessários no painel antes de publicar. O pacote usa Node 24 e 512 MB.

## Publicar o pacote preparado

1. Aprove e reserve o subdomínio proposto no painel de Domínios. Se indisponível, escolha outro e ajuste o ID.
2. Extraia Vsync-Client-Site-Discloud-0.1.2.zip para conferir o conteúdo. discloud.config, package.json e server.mjs ficam na raiz, com public e releases ao lado; não adicione outra pasta externa ao recomprimir.
3. Confira TYPE=site, ID do subdomínio sem o sufixo, MAIN=server.mjs, RAM=512, VERSION=24 e START=npm run start.
4. Em Aplicações > Upload, envie o ZIP. Confirme capacidade livre e os limites de upload do plano. Se houver custo adicional, pare antes de contratar.
5. Espere a implantação, confira o log de inicialização e abra a URL efetivamente retornada pelo painel.
6. Verifique /api/health, /api/release e um download completo. Compare o SHA-256 ao arquivo do release. Teste HEAD e Range após passar pelo proxy da hospedagem.

O pacote contém o instalador Windows; o launcher e o jogo continuam rodando no PC. O Node apenas serve site e arquivos. Não execute Electron/Java desktop no contêiner do site.

## Executar e testar

No pacote extraído:

```bash
npm start
```

Abra http://localhost:8080. Não há build necessário ou pasta dist no serviço. O site usa public, evitando o nome reservado pela Discloud para builds internos.

No projeto completo:

```bash
npm run test:site
npm run test:site:ui
npm run site
```

O código-fonte sem arquivo em releases mostra download em preparação. O empacotador recebe o instalador, calcula tamanho/SHA-256 e injeta ambos no ZIP:

```bash
python3 scripts/package-discloud.py --installer release/Vsync-Client-Setup-0.1.2.exe --output release/Vsync-Client-Site-Discloud-0.1.2.zip
```

## Rotas

| Rota | Uso |
|---|---|
| / | Site público |
| /api/health | Estado do serviço |
| /api/release | Metadados do instalador verificado |
| /downloads/windows | Redirecionamento para o arquivo versionado |
| /releases/Vsync-Client-Setup-VERSAO.exe | Streaming do único instalador registrado |
| /updates/windows-x64.json | Envelope de atualização, se fornecido pelo operador |

Ausência de manifesto assinado retorna HTTP 503, e não uma atualização fictícia. O servidor publica um envelope fornecido; o launcher confere sua assinatura com a chave pública confiável incluída no aplicativo. As chaves privadas nunca pertencem ao pacote/site/servidor.

## Próximas atualizações

Depois de definir uma URL HTTPS sob seu controle, configure manifestUrl/publicKey/allowedHosts no launcher e compile um build com essa confiança. A versão entregue ainda mostra Canal em configuração. Veja ATUALIZACOES.md para gerar o envelope Ed25519 no ambiente de release. Publique o instalador antes do manifesto, mantenha nomes versionados e reinicie o serviço após trocar os metadados. Não substitua bytes de um instalador já publicado.

Um endereço apenas proposto não deve ser considerado confiável para atualizações antes da reserva e implantação confirmadas. A assinatura do canal não é Authenticode. Amigos, cosméticos, Discord e autenticação social não são implementados por este servidor.

## Fontes oficiais consultadas

- https://docs.discloud.com/en/how-to-host/websites-and-apis
- https://docs.discloud.com/en/configurations/discloud.config
- https://docs.discloud.com/en/how-to-host-using/dashboard

Verificação local passou para servidor e interface, inclusive tablet/celular. A implantação na Discloud permanece bloqueada para aprovação do endereço e não foi testada pelo proxy real.
