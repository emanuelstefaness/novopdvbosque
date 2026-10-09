@echo off
chcp 65001 >nul
title PDV Bosque
cd /d "%~dp0"

echo.
echo ========================================
echo   PDV BOSQUE - Sistema local
echo ========================================
echo.

rem --- Compila o frontend na primeira vez (ou se a pasta dist foi apagada) ---
if not exist "frontend\dist\index.html" (
  echo [1/3] Preparando o sistema pela primeira vez - aguarde...
  pushd frontend
  call npm run build
  popd
  if not exist "frontend\dist\index.html" (
    echo.
    echo ERRO: nao foi possivel preparar o sistema. Veja a mensagem acima.
    pause
    exit /b 1
  )
) else (
  echo [1/3] Sistema ja preparado.
)

rem --- Libera as portas se um PDV antigo ficou aberto ---
for %%P in (3001 5173) do (
  for /f "tokens=5" %%I in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%I /F >nul 2>&1
  )
)

echo [2/3] Iniciando o PDV...
start "PDV Bosque - NAO FECHE" cmd /k "cd /d "%~dp0backend" && npm run start:web"

rem --- Espera o sistema responder de verdade, em vez de um tempo fixo ---
set /a TENTATIVAS=0
:espera
set /a TENTATIVAS+=1
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 2).StatusCode}catch{0}" | findstr /C:"200" >nul
if not errorlevel 1 goto pronto
if %TENTATIVAS% GEQ 40 goto falhou
timeout /t 1 /nobreak >nul
goto espera

:falhou
echo.
echo O sistema nao respondeu a tempo. Veja a janela "PDV Bosque - NAO FECHE".
pause
exit /b 1

:pronto
echo [3/3] Abrindo o sistema...
start "" "http://localhost:5173"

echo.
echo Pronto!
echo - Neste computador:    http://localhost:5173
echo - Garcons (celular):   http://IP-DESTE-PC:5173   (o mesmo endereco de antes)
echo.
echo NAO feche a janela "PDV Bosque - NAO FECHE" enquanto o restaurante estiver aberto.
echo Se algo ficar lento, a janela mostra linhas [LENTO] com o horario e a rota.
echo.
pause
