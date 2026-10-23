# Presença no Discord

A integração usa o IPC local documentado pelo Discord para publicar a atividade do Vsync no aplicativo Discord desktop. Não solicita token de usuário, bot token ou client secret. Mensagens, lista de amigos e servidores do Discord não são sincronizados.

O Application ID informado, `1275158550552903790`, está em `config/distribution.json`. A consulta pública ao Discord identificou o aplicativo como **carolzinha ZzZ**. Esse é o nome associado ao ID que o Discord poderá mostrar na atividade; para exibir a marca Vsync Client, use o ID de um aplicativo com esse nome ou altere o nome no portal que você administra. Nenhuma configuração remota do aplicativo Discord foi alterada.

Em **Configurações > Integrações**, ative ou desative Discord Rich Presence e, se necessário, troque o Application ID. Instalações novas vêm com a integração habilitada. Uma preferência de desativação já salva é preservada. O Discord deve estar aberto no computador e permitir a exibição de atividade nas próprias configurações de privacidade.

No modo Vsync direto, a atividade acompanha o jogo iniciado pelo launcher, com versão do Minecraft, perfil e tempo. No modo oficial, a integração mostra o Vsync: abrir o Minecraft Launcher não comprova que uma partida começou. O endereço do servidor e as credenciais da conta não são enviados.

**Configurações > Privacidade > Ocultar minha presença** limpa a atividade imediatamente e impede novas publicações. Desativar a integração também limpa a atividade. A conexão tenta novamente quando o Discord estiver indisponível; isso não bloqueia o launcher.

Os testes usam um servidor IPC local isolado, com handshake, frames fragmentados, ping/pong, reconexão, remoção do ID durante conexão e ocultação de presença. A exibição na conta real do Discord precisa ser conferida com o aplicativo desktop aberto.

Documentação: [Discord RPC e SET_ACTIVITY](https://docs.discord.com/developers/topics/rpc).
