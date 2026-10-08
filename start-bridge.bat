@echo off
:loop
node "%~dp0tools\companion\server.js"
if %errorlevel% equ 42 (
    echo.
    echo [*] Restarting Aalaapi Sky Bridge companion service...
    timeout /t 1 /nobreak >nul
    goto loop
)
pause
