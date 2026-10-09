@echo off
title PDV Bosque - Iniciando
cd /d "%~dp0"

echo.
echo ========================================
echo   PDV BOSQUE - Sistema local
echo ========================================
echo.

echo [1/4] Iniciando o backend...
start "PDV Backend" cmd /k "cd /d "%~dp0backend" && npm start"
timeout /t 3 /nobreak >nul

echo [2/4] Iniciando o frontend (PDV)...
start "PDV Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 12 /nobreak >nul

echo [3/4] Abrindo o sistema local no navegador...
start "" "http://localhost:5173"

echo [4/4] Abrindo o cardapio web (pedidos online)...
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/pedir"

echo.
echo Pronto!
echo - Sistema local (caixa, cozinha, etc.): http://localhost:5173
echo - Cardapio web (pedidos online):       http://localhost:5173/pedir
echo.
echo Deixe as duas janelas do terminal abertas (Backend e Frontend).
echo Feche este terminal quando quiser.
pause
