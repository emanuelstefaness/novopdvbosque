# Liga o PDV completo neste computador: servidor (sob o vigia, que o reinicia se cair) + tunel da Cloudflare.
# Pode ser executado varias vezes: so inicia o que ainda nao estiver rodando.
# Usado pelo ATUALIZAR-PDV.bat e pelo atalho de inicializacao do Windows.
$ErrorActionPreference = 'Continue'
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Backend = Join-Path $Repo 'backend'
$Vigia = Join-Path $Backend 'tools\vigia-pdv.ps1'

function Procura-Processo([string]$trecho) {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -like "*$trecho*" -and $_.ProcessId -ne $PID }
}

# 1) Servidor sob o vigia
if (Procura-Processo 'vigia-pdv.ps1') {
  Write-Host '[ok] O vigia do PDV ja esta rodando.'
} else {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $Vigia) | Out-Null
  Write-Host '[ok] Vigia do PDV iniciado.'
}

# 2) Tunel da Cloudflare (so se estiver instalado e configurado)
$cf = $null
foreach ($p in @('C:\cloudflared\cloudflared.exe', (Join-Path $env:ProgramFiles 'Cloudflare\cloudflared.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Cloudflare\cloudflared.exe'))) {
  if ($p -and (Test-Path -LiteralPath $p)) { $cf = $p; break }
}
if (-not $cf) { $c = Get-Command cloudflared -ErrorAction SilentlyContinue; if ($c) { $cf = $c.Source } }
$cfg = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

if (Get-Process cloudflared -ErrorAction SilentlyContinue) {
  Write-Host '[ok] O tunel da Cloudflare ja esta rodando.'
} elseif ($cf -and (Test-Path -LiteralPath $cfg)) {
  $nome = 'pdv-bosque'
  foreach ($l in Get-Content -LiteralPath $cfg) { if ($l -match '^\s*tunnel:\s*(.+)\s*$') { $nome = $Matches[1].Trim() } }
  Start-Process -FilePath $cf -ArgumentList @('tunnel', 'run', $nome) -WindowStyle Hidden | Out-Null
  Write-Host "[ok] Tunel '$nome' iniciado."
} else {
  Write-Host '[aviso] Tunel da Cloudflare nao encontrado neste computador (cloudflared.exe ou %USERPROFILE%\.cloudflared\config.yml).'
  Write-Host '        Sem ele, o /pedir da Vercel nao alcanca este PDV.'
}
