# Mantém o Windows acordado enquanto este script estiver rodando (não altera nenhuma configuração do sistema).
# Para encerrar: feche o processo "powershell" oculto ou execute:  Stop-Process -Name powershell -Id <PID>
Add-Type -Namespace Win32 -Name Power -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll")]
public static extern uint SetThreadExecutionState(uint esFlags);
'@
$ES_CONTINUOUS = 0x80000000
$ES_SYSTEM_REQUIRED = 0x00000001
while ($true) {
  [void][Win32.Power]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED)
  Start-Sleep -Seconds 30
}
