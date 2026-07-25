@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "API_URL=http://localhost:20128/v1/models"
set "OUTPUT=models_raw.json"
set "API_FILE=api.txt"
set "DEFAULT_TOKEN="
if not "%DEFAULT_TOKEN%"=="" (set "TOKEN=%DEFAULT_TOKEN%" & goto :go)
if not "%~1"=="" (set "TOKEN=%~1" & goto :go)
if exist "%API_FILE%" (set /p TOKEN=<"%API_FILE%")
if "!TOKEN!"=="" (
    set /p TOKEN="Enter API Key: "
    if "!TOKEN!"=="" (echo ERROR: API key required. & pause & exit /b 1)
)
:go
echo Fetching from %API_URL% ...
curl -s -H "Authorization: Bearer !TOKEN!" "%API_URL%" -o "%OUTPUT%"
if errorlevel 1 (
    echo ERROR: Fetch failed. Make sure 9Router is running.
    del "%OUTPUT%" 2>nul
    pause
    exit /b 1
)
echo Saved to %OUTPUT%
pause
