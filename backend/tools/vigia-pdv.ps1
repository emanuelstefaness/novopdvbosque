# Vigia do PDV: mantém o servidor rodando e o reinicia em poucos segundos se ele cair.
# Também evita que o Windows suspenda enquanto estiver ativo (não altera nenhuma configuração do sistema).
# Log: backend\pdv-server.log   |   Para parar o PDV: encerre este processo e o "node" do servidor.
$ErrorActionPreference = 'Continue'
$backend = Split-Path -Parent $PSScriptRoot
Set-Location $backend
$log = Join-Path $backend 'pdv-server.log'

Add-Type -Namespace Win32 -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES = [uint32]2147483649  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
[void][Win32.Power]::SetThreadExecutionState($ES)

$node = (Get-Command node.exe -ErrorAction Stop).Source
while ($true) {
  $inicio = Get-Date
  Add-Content -Path $log -Value ("[vigia] iniciando servidor em {0:yyyy-MM-dd HH:mm:ss}" -f $inicio)
  $p = Start-Process -FilePath $node -ArgumentList '--env-file-if-exists=.env', 'server.js', '--web' `
        -WorkingDirectory $backend -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $backend 'pdv-server.out.log') -RedirectStandardError (Join-Path $backend 'pdv-server.err.log')
  # Verifica a cada 2 s (reinício rápido) e renova o pedido de "não suspender".
  while (-not $p.WaitForExit(2000)) {
    [void][Win32.Power]::SetThreadExecutionState($ES)
  }
  Add-Content -Path $log -Value ("[vigia] servidor encerrou (codigo {0}) em {1:yyyy-MM-dd HH:mm:ss}; reiniciando em 2 s" -f $p.ExitCode, (Get-Date))
  Start-Sleep -Seconds 2
}
