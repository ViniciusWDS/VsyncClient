import {execFile,spawn} from 'node:child_process';
import path from 'node:path';
import {promisify} from 'node:util';

const execute=promisify(execFile);
// The official launcher starts Minecraft outside our child-process tracking.
// Missing command lines and failed process inspection must not imply idle.
export async function windowsMinecraftRunning(){
 if(process.platform!=='win32')throw new Error('A instalação automática está disponível no Windows.');
 const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const script="$ErrorActionPreference='Stop'; $processes=@(Get-CimInstance Win32_Process -Filter \"Name='MinecraftLauncher.exe' OR Name='java.exe' OR Name='javaw.exe'\"); @($processes | Where-Object { $_.Name -ieq 'MinecraftLauncher.exe' -or -not $_.CommandLine -or $_.CommandLine -match '--gameDir|net\\.minecraft\\.client\\.main\\.Main|KnotClient|cpw\\.mods\\.(bootstraplauncher|modlauncher)' }).Count";
 const result=await execute(powershell,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:12000,maxBuffer:16384,encoding:'utf8'});
 const count=result.stdout.trim();
 if(!/^\d+$/.test(count))throw new Error('Não foi possível confirmar que o Minecraft está fechado. A atualização foi adiada.');
 return Number(count)>0;
}

export async function launchUpdateInstaller(file:string,executable=process.execPath,pid=process.pid){
 if(process.platform!=='win32')throw new Error('A instalação automática está disponível no Windows.');
 // NSIS consumes /D as the final argument, without embedded quotation marks.
 // /PID lets the installer wait for the actual launcher process to exit.
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(file,['/S','/UPDATE','/PID='+pid,'/D='+path.dirname(executable)],{shell:false,windowsHide:true,windowsVerbatimArguments:true,argv0:'"'+file+'"',detached:true,stdio:'ignore'});
  child.once('error',()=>reject(new Error('Não foi possível iniciar o instalador da atualização. Tente novamente.')));
  child.once('spawn',()=>{child.unref();resolve();});
 });
}
