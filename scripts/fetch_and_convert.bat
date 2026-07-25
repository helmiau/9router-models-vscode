@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
set "API_URL=http://localhost:20128/v1/models"
set "OUTPUT_FILE=chatLanguageModels.json"
set "TEMP_FILE=models_raw.json"
set "PY_TEMP=_9r_converter.py"
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
curl -s -H "Authorization: Bearer !TOKEN!" "%API_URL%" -o "%TEMP_FILE%"
if errorlevel 1 (echo ERROR: Fetch failed. & del "%TEMP_FILE%" 2>nul & pause & exit /b 1)
findstr /C:""""object""" "%TEMP_FILE%" >nul
if errorlevel 1 (echo ERROR: Invalid response. & type "%TEMP_FILE%" & del "%TEMP_FILE%" 2>nul & pause & exit /b 1)
echo Fetch OK. Converting...
> "%PY_TEMP%" echo import json, sys
>> "%PY_TEMP%" echo raw = json.load(open(sys.argv[1],"r",encoding="utf-8"))
>> "%PY_TEMP%" echo models = []; seen = set()
>> "%PY_TEMP%" echo for m in raw.get("data",[]):
>> "%PY_TEMP%" echo     mid = m.get("id","")
>> "%PY_TEMP%" echo     if mid in seen: continue
>> "%PY_TEMP%" echo     seen.add(mid)
>> "%PY_TEMP%" echo     cap = m.get("capabilities") or {}
>> "%PY_TEMP%" echo     models.append({"id":mid,"name":mid,"url":"http://localhost:20128/v1","toolCalling":bool(cap.get("tools")),"vision":bool(cap.get("vision")),"maxInputTokens":cap.get("contextWindow",128000),"maxOutputTokens":cap.get("maxOutput",64000)})
>> "%PY_TEMP%" echo R = [{"name":"9Router","vendor":"customendpoint","apiKey":"${input:chat.lm.secret.-65d90303}","apiType":"chat-completions","models":models}]
>> "%PY_TEMP%" echo json.dump(R, open(sys.argv[2],"w",encoding="utf-8"), indent="\t", ensure_ascii=False)
>> "%PY_TEMP%" echo print(f"Done! Total: {len(models)} models")
python "%PY_TEMP%" "%TEMP_FILE%" "%OUTPUT_FILE%"
set "ERR=%ERRORLEVEL%"
del "%PY_TEMP%" 2>nul
if %ERR% neq 0 (echo ERROR: Conversion failed. & pause & exit /b 1)
echo Output: %OUTPUT_FILE%
pause
