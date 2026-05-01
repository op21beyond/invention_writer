@echo off
setlocal EnableExtensions
cd /d "%~dp0..\frontend" || exit /b 1
call npm run dev
