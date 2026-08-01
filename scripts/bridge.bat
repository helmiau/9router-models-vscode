@echo off
rem 9Router Bridge - localhost relay + auto-install chatLanguageModels.json
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found in PATH.
    pause
    exit /b 1
)

python scripts\bridge.py %*
if errorlevel 1 pause
endlocal
