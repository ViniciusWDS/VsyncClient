import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const moduleDirectory=fileURLToPath(new URL('../module/',import.meta.url));
const custom=process.env.VSYNC_GRADLE_BIN;
const gradle=custom||(process.platform==='win32'?path.join(moduleDirectory,'gradlew.bat'):'bash');
const args=[...(!custom&&process.platform!=='win32'?[path.join(moduleDirectory,'gradlew')]:[]),'--no-daemon','clean','build','copyModule'];
// cmd.exe precisa de aspas internas e externas para executar .bat em caminhos com espaços.
// Os argumentos do Gradle são fixos; a variável de configuração representa apenas um executável.
if(process.platform==='win32'&&/["%\r\n]/.test(gradle))throw new Error('VSYNC_GRADLE_BIN deve indicar somente um caminho de executável válido.');
const child=process.platform==='win32'
 ?spawn(process.env.ComSpec||'cmd.exe',['/d','/q','/s','/c','""'+gradle+'" '+args.join(' ')+'"'],{cwd:moduleDirectory,stdio:'inherit',windowsVerbatimArguments:true,windowsHide:true})
 :spawn(gradle,args,{cwd:moduleDirectory,stdio:'inherit'});
child.on('error',()=>{console.error('Instale JDK 21 para usar o Gradle Wrapper incluído, ou execute o workflow GitHub Actions.');process.exitCode=1;});
child.on('exit',code=>process.exitCode=code??1);
