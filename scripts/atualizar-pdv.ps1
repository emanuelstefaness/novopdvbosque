# Atualiza o PDV neste computador para a versao mais nova do GitHub e deixa tudo rodando.
# Seguro para rodar mais de uma vez. NAO apaga o banco de dados (faz copia de seguranca antes).
# Uso:  ATUALIZAR-PDV.bat      (ou)   powershell -File scripts\atualizar-pdv.ps1 [-Branch main] [-SemAutoIniciar]
param(
  [string]$Branch = 'novo-sistema',
  [switch]$SemAutoIniciar
)
$ErrorActionPreference = 'Stop'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Backend = Join-Path $Repo 'backend'
$Frontend = Join-Path $Repo 'frontend'
$Stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
Set-Location $Repo

function Passo([string]$t) { Write-Host ''; Write-Host "== $t" -ForegroundColor Cyan }
function Ok([string]$t) { Write-Host "   [ok] $t" -ForegroundColor Green }
function Aviso([string]$t) { Write-Host "   [atencao] $t" -ForegroundColor Yellow }
function Falha([string]$t) { Write-Host "   [ERRO] $t" -ForegroundColor Red; throw $t }
function Roda([string]$exe, [string[]]$argv, [string]$dir) {
  Push-Location $dir
  $antes = $ErrorActionPreference; $ErrorActionPreference = 'Continue'  # git/npm escrevem progresso em stderr
  try { & $exe @argv; if ($LASTEXITCODE -ne 0) { Falha "$exe $($argv -join ' ') falhou (codigo $LASTEXITCODE)" } } finally { $ErrorActionPreference = $antes; Pop-Location }
}

Passo '1/7 Conferindo o computador'
foreach ($c in 'git', 'node', 'npm') {
  if (-not (Get-Command $c -ErrorAction SilentlyContinue)) { Falha "$c nao esta instalado. Instale (Node 22 em nodejs.org, Git em git-scm.com) e rode de novo." }
}
$nodeMajor = [int]((node -v) -replace '^v(\d+)\..*$', '$1')
if ($nodeMajor -lt 22) { Falha "Node $(node -v) e antigo. Instale o Node 22 ou mais novo (nodejs.org) e rode de novo." }
Ok "Node $(node -v), npm $(npm -v), git $((git --version) -replace 'git version ','')"
if (-not (Test-Path (Join-Path $Repo '.git'))) { Falha 'Esta pasta nao e um repositorio git. Veja o passo a passo no ATUALIZACAO.md.' }

Passo '2/7 Parando o PDV (se estiver rodando)'
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -like '*vigia-pdv.ps1*' -and $_.ProcessId -ne $PID } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($porta in 3001, 5173) {
  Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2
Ok 'PDV parado.'

Passo '3/7 Copia de seguranca do banco'
$db = Join-Path $Backend 'pdv_bosque.db'
if (Test-Path $db) {
  foreach ($suf in '', '-wal', '-shm') {
    $orig = "$db$suf"
    if (Test-Path $orig) { Copy-Item $orig (Join-Path $Backend "pdv_bosque.backup-antes-atualizar-$Stamp.db$suf") }
  }
  Ok "Copia salva em backend\pdv_bosque.backup-antes-atualizar-$Stamp.db"
} else {
  Aviso 'Nao ha banco de dados aqui ainda (primeira instalacao): sera criado vazio ao iniciar.'
}

Passo "4/7 Baixando a versao nova ($Branch)"
$sujo = (git status --porcelain --untracked-files=no)
if ($sujo) {
  $ErrorActionPreference = 'Continue'; git stash push -m "antes-de-atualizar-$Stamp" 2>&1 | Out-Null; $ErrorActionPreference = 'Stop'
  Aviso "Havia alteracoes locais em arquivos; guardei com 'git stash' (nada foi perdido)."
}
Roda 'git' @('fetch', 'origin') $Repo
Roda 'git' @('checkout', $Branch) $Repo
Roda 'git' @('pull', '--ff-only', 'origin', $Branch) $Repo
Ok "Codigo atualizado: $(git log -1 --format='%h %s')"

Passo '5/7 Instalando dependencias e compilando as telas (pode levar alguns minutos)'
Roda 'npm' @('install', '--no-audit', '--no-fund') $Backend
Roda 'npm' @('install', '--no-audit', '--no-fund') $Frontend
Roda 'npm' @('run', 'build') $Frontend
Ok 'Telas compiladas.'

Passo '6/7 Conferindo as configuracoes (.env)'
$envFile = Join-Path $Backend '.env'
if (-not (Test-Path $envFile)) {
  Aviso 'backend\.env NAO existe neste computador. Copie o .env do PC principal (nao fica no GitHub por seguranca).'
} else {
  $chaves = @{}
  foreach ($l in Get-Content $envFile) { if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { $chaves[$Matches[1]] = $Matches[2].Trim() } }
  foreach ($k in 'PDV_CAIXA_PASSWORD', 'IFOOD_CLIENT_ID', 'IFOOD_CLIENT_SECRET') {
    if ($chaves[$k]) { Ok "$k preenchido" } else { Aviso "$k vazio ou ausente" }
  }
  $modo = if ($chaves['IFOOD_MODO']) { $chaves['IFOOD_MODO'] } else { 'portal (padrao)' }
  Ok "IFOOD_MODO = $modo"
}

Passo '7/7 Ligando o PDV'
& (Join-Path $PSScriptRoot 'iniciar-pdv-completo.ps1')
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3001/api/health' -TimeoutSec 2).StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 1
}
if ($ok) { Ok 'PDV respondendo em http://localhost:3001' } else { Falha 'O PDV nao respondeu em 60 s. Veja backend\pdv-server.err.log' }

try {
  $r = Invoke-WebRequest -UseBasicParsing 'https://pdv.bosquecarne.work/api/health' -TimeoutSec 15
  if ($r.StatusCode -eq 200) { Ok 'Endereco publico (tunel) respondendo: o /pedir da Vercel alcanca este PDV.' }
} catch {
  Aviso 'O endereco publico https://pdv.bosquecarne.work ainda nao respondeu. Aguarde ~30 s e abra no navegador; se persistir, o tunel nao esta ativo neste PC.'
}

if (-not $SemAutoIniciar) {
  $startup = [Environment]::GetFolderPath('Startup')
  $atalho = Join-Path $startup 'PDV Bosque.lnk'
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($atalho)
  $s.TargetPath = 'powershell.exe'
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'iniciar-pdv-completo.ps1')`""
  $s.WorkingDirectory = $Repo
  $s.WindowStyle = 7
  $s.Save()
  Ok 'Atalho de inicializacao criado: o PDV sobe sozinho quando o Windows ligar (apague "PDV Bosque" da pasta Inicializar para desfazer).'
}

Write-Host ''
Write-Host 'PRONTO. Abra http://localhost:3001 neste computador.' -ForegroundColor Green
Write-Host 'IMPORTANTE: so UM computador pode ficar com as credenciais do iFood ativas. Deixe o outro PC com o PDV desligado ou sem IFOOD_CLIENT_ID/SECRET.' -ForegroundColor Yellow
