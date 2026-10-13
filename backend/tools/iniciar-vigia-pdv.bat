@echo off
rem Inicia o PDV sob o vigia (reinicia sozinho se cair). Janela oculta; log em backend\pdv-server.log
cd /d "%~dp0"
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0vigia-pdv.ps1"
echo PDV iniciado sob o vigia. Acesse http://localhost:3001
timeout /t 3 >nul
