# Integração com o Minecraft Launcher original

O modo padrão da versão 0.1.2 prepara instalações no launcher oficial e abre o aplicativo instalado. A Microsoft autentica o jogador no próprio Minecraft Launcher. O Vsync não lê caches de contas, importa tokens ou reutiliza identificadores OAuth de outro produto.

## Uso

1. Instale o Minecraft Launcher pela Microsoft Store ou https://www.minecraft.net/download .
2. Abra-o, entre com sua conta, confirme o acesso ao Minecraft Java e feche o launcher e o jogo.
3. No Vsync, abra Configurações > Contas e selecione Minecraft Launcher oficial. A detecção procura o pacote Store conhecido e locais usuais do executável instalado.
4. Se preciso, selecione MinecraftLauncher.exe pelo diálogo. MinecraftInstaller.exe não é o aplicativo instalado. A pasta .minecraft selecionada precisa ser a pasta já usada pelo launcher original e conter um arquivo de instalações válido.
5. Escolha um perfil e clique Abrir launcher. Aguarde a preparação na central de downloads.
6. No aplicativo original, escolha “Vsync • nome do perfil” e clique Jogar. Para servidores, use Multijogador com o endereço salvo no Vsync.

No primeiro uso, se os arquivos oficiais ainda não existem, o Vsync orienta abrir/entrar/fechar o launcher original. Não cria uma configuração fictícia. Alterar a pasta no Vsync não muda automaticamente a pasta usada pelo aplicativo original.

## Alterações de arquivos

As variantes launcher_profiles.json e launcher_profiles_microsoft_store.json são consideradas quando existentes. O Vsync preserva instalações vizinhas, preferências e a seleção atual. Usa identificador próprio derivado do UUID, gameDir do perfil, versão, memória, Java opcional e resolução.

Antes de editar um documento existente, grava backup em .minecraft/vsync-profile-backups. Arquivos inválidos, colisão com outra pasta, launcher aberto ou alteração concorrente interrompem a operação. A gravação usa temporários e reversão quando possível. Os backups devem ser tratados como dados locais privados; não publique sua pasta .minecraft.

Vanilla usa o identificador oficial da versão. Fabric e Quilt consultam os metadados oficiais, criam uma versão herdada e baixam bibliotecas com verificação de integridade. A base do Minecraft, os assets, o runtime e a sessão são administrados pelo launcher original. Forge/NeoForge não são instalados nesta alpha.

## Como interpretar o estado

“Localizado” significa que um destino de abertura foi encontrado. “Perfil preparado” confirma os arquivos de instalação. “Continue no launcher oficial” representa a transferência de controle. Esses estados não significam licença validada, jogo iniciado ou HUD funcionando. O processo do jogo externo não é monitorado pelo Vsync.

No modo oficial, encerre a partida antes de aplicar FPS ou modificar componentes. O diálogo pede essa confirmação. Depois dos ajustes de memória, abra novamente pelo Vsync para sincronizar a instalação oficial.

## Validação observada

Os testes cobrem preservação, backup, metadados, seleção, conflitos, cancelamento, hash, descoberta e abertura simulada. Um preflight real consultou Fabric para 1.21.1 / Loader 0.16.14 e verificou oito bibliotecas. Isso ocorreu em Linux, com descoberta Windows simulada. Não houve abertura real do Minecraft Launcher no Windows, login de jogador, execução do jogo ou observação do HUD nesta sessão.
