@echo off
chcp 65001 >nul
title Atualizar PDV Bosque
cd /d "%~dp0"
echo.
echo ========================================
echo   PDV BOSQUE - Atualizar e ligar
echo ========================================
echo   Nao feche esta janela ate aparecer "PRONTO".
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\atualizar-pdv.ps1" %*
echo.
pause
