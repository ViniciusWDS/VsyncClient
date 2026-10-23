param(
  [string]$Installer,
  [string]$ReportDirectory = (Join-Path (Get-Location) 'test-results/windows'),
  [switch]$DisposableWindowsEnvironment,
  [switch]$RequireSignature
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Este teste precisa de Windows real.' }
if (-not $DisposableWindowsEnvironment) { throw 'Use uma VM/runner Windows descartável e informe -DisposableWindowsEnvironment. O teste instala e desinstala o Vsync no usuário atual.' }
if (Test-Path 'HKCU:\Software\VsyncClient') { throw 'Há uma instalação existente. Use uma VM limpa para preservar os registros e atalhos reais.' }
if (-not $Installer) {
  $version = (Get-Content 'package.json' -Raw | ConvertFrom-Json).version
  $Installer = Join-Path (Get-Location) "release/Vsync-Client-Setup-$version.exe"
}
$Installer = (Resolve-Path $Installer).Path
$ReportDirectory = [IO.Path]::GetFullPath($ReportDirectory)
New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('Vsync QA ' + [guid]::NewGuid().ToString('N'))
$installRoot = Join-Path $taskRoot 'app'
$nativeRoot = Join-Path $taskRoot 'native'
$fixtureId = 'vsync-qa-' + [guid]::NewGuid().ToString('N')
$worldRoot = Join-Path ([Environment]::GetFolderPath('ApplicationData')) "Vsync Client/instances/$fixtureId"
$world = Join-Path $worldRoot 'saves/QA/level.dat'
$checks = [ordered]@{}
$result = [ordered]@{ platform = 'win32'; checkedAt = [DateTime]::UtcNow.ToString('o'); checks = $checks; passed = $false; limitations = @('Não autentica uma conta Microsoft real.', 'Não executa Minecraft nem homologa a renderização do HUD.') }
function Invoke-CheckedProcess([string]$File, [string]$Arguments, [int]$Seconds = 180) {
  $process = Start-Process -FilePath $File -ArgumentList $Arguments -PassThru
  if (-not $process.WaitForExit($Seconds * 1000)) { $process.Kill(); throw "Tempo excedido: $([IO.Path]::GetFileName($File))" }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw "Processo encerrou com código $($process.ExitCode): $([IO.Path]::GetFileName($File))" }
}
try {
  New-Item -ItemType Directory -Path $nativeRoot -Force | Out-Null
  $signature = Get-AuthenticodeSignature -FilePath $Installer
  $result.signature = $signature.Status.ToString()
  $result.installerSha256 = (Get-FileHash $Installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($RequireSignature -and $signature.Status -ne 'Valid') { throw 'Assinatura Authenticode ausente ou inválida.' }
  # NSIS exige /D como último argumento, sem aspas, mesmo com espaços.
  Invoke-CheckedProcess $Installer "/S /D=$installRoot"
  $exe = Join-Path $installRoot 'Vsync Client.exe'
  if (-not (Test-Path $exe)) { throw 'Executável instalado não encontrado.' }
  $checks.install = $true
  $shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Vsync Client.lnk'
  if (-not (Test-Path $shortcut)) { throw 'Atalho da área de trabalho não encontrado.' }
  $checks.desktopShortcut = $true
  $startShortcut = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs/Vsync Client/Vsync Client.lnk'
  if (-not (Test-Path $startShortcut)) { throw 'Atalho do menu Iniciar não encontrado.' }
  $checks.startMenuShortcut = $true
  $registration = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\VsyncClient'
  $checks.uninstallRegistration = $registration.DisplayName -eq 'Vsync Client'
  if (-not $checks.uninstallRegistration) { throw 'Registro de desinstalação incorreto.' }
  $env:VSYNC_TEST_MODE = '1'
  $env:VSYNC_TEST_ROOT = $nativeRoot
  Invoke-CheckedProcess $exe '--vsync-smoke-test=first'
  $first = Get-Content (Join-Path $nativeRoot 'native-smoke-first.json') -Raw | ConvertFrom-Json
  if (-not $first.passed) { throw 'Falha na primeira inicialização nativa.' }
  $checks.nativeFirstStart = $true
  Invoke-CheckedProcess $exe '--vsync-smoke-test=restart'
  $restart = Get-Content (Join-Path $nativeRoot 'native-smoke-restart.json') -Raw | ConvertFrom-Json
  if (-not $restart.passed) { throw 'Falha na persistência após reiniciar.' }
  $checks.nativeRestart = $true
  Copy-Item (Join-Path $nativeRoot 'native-smoke-*.json') $ReportDirectory
  # Fixture sem dados reais, no mesmo local usado pelas instalações do usuário.
  New-Item -ItemType Directory -Path (Split-Path $world) -Force | Out-Null
  [IO.File]::WriteAllText($world, 'vsync-world-preservation-fixture')
  $before = (Get-FileHash $world -Algorithm SHA256).Hash
  $uninstaller = Join-Path $installRoot 'Uninstall.exe'
  if (-not (Test-Path $uninstaller)) { throw 'Desinstalador não encontrado.' }
  $testUninstaller = Join-Path $taskRoot 'uninstall-qa.exe'
  Copy-Item $uninstaller $testUninstaller
  Invoke-CheckedProcess $testUninstaller "/S _?=$installRoot"
  if (Test-Path $exe) { throw 'O executável permaneceu após desinstalar.' }
  if (Test-Path $uninstaller) { throw 'O desinstalador permaneceu após remover o aplicativo.' }
  if (Test-Path $startShortcut) { throw 'O atalho do menu Iniciar permaneceu após desinstalar.' }
  if (Test-Path 'HKCU:\Software\VsyncClient') { throw 'O registro permaneceu após desinstalar.' }
  if (Test-Path $shortcut) { throw 'O atalho permaneceu após desinstalar.' }
  if ((Get-FileHash $world -Algorithm SHA256).Hash -ne $before) { throw 'A fixture do mundo não foi preservada.' }
  $checks.uninstall = $true
  $checks.worldFixturePreserved = $true
  $result.passed = -not ($checks.Values -contains $false)
} catch {
  $result.error = $_.Exception.Message
  if (Test-Path $nativeRoot) { Copy-Item (Join-Path $nativeRoot '*.txt') $ReportDirectory -ErrorAction SilentlyContinue }
  throw
} finally {
  $result | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $ReportDirectory 'installer-result.json') -Encoding UTF8
  Remove-Item Env:VSYNC_TEST_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:VSYNC_TEST_ROOT -ErrorAction SilentlyContinue
  # Remova apenas a fixture criada por esta execução. Preserve evidências e instalação em caso de falha.
  if (Test-Path $worldRoot) { Remove-Item $worldRoot -Recurse -Force }
  if ($result.passed) { Remove-Item $taskRoot -Recurse -Force }
}
Write-Output 'Instalação, inicialização, persistência e desinstalação verificadas no Windows.'
