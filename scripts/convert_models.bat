@echo off
chcp 65001 >nul
set "INPUT=%~1"
set "OUTPUT=%~2"
if "%INPUT%"=="" set "INPUT=models_raw.json"
if "%OUTPUT%"=="" set "OUTPUT=chatLanguageModels.json"
if not exist "%INPUT%" (echo ERROR: %INPUT% not found. Run fetch script first. & pause & exit /b 1)
echo Converting %INPUT% to %OUTPUT% ...
set "PYTEMP=_9r_convert_tmp.py"
> "%PYTEMP%" echo import json, sys
>> "%PYTEMP%" echo INPUT, OUTPUT = sys.argv[1], sys.argv[2]
>> "%PYTEMP%" echo BASE = "http://localhost:20128/v1"
>> "%PYTEMP%" echo raw = json.load(open(INPUT,"r",encoding="utf-8"))
>> "%PYTEMP%" echo models = []; seen = set()
>> "%PYTEMP%" echo for m in raw.get("data",[]):
>> "%PYTEMP%" echo     mid = m.get("id","")
>> "%PYTEMP%" echo     if mid in seen: continue
>> "%PYTEMP%" echo     seen.add(mid)
>> "%PYTEMP%" echo     cap = m.get("capabilities") or {}
>> "%PYTEMP%" echo     models.append({"id":mid,"name":mid,"url":BASE,"toolCalling":bool(cap.get("tools")),"vision":bool(cap.get("vision")),"maxInputTokens":cap.get("contextWindow",128000),"maxOutputTokens":cap.get("maxOutput",64000)})
>> "%PYTEMP%" echo R = [{"name":"9Router","vendor":"customendpoint","apiKey":"${input:chat.lm.secret.-65d90303}","apiType":"chat-completions","models":models}]
>> "%PYTEMP%" echo json.dump(R, open(OUTPUT,"w",encoding="utf-8"), indent="\t", ensure_ascii=False)
>> "%PYTEMP%" echo print(f"Done! Total: {len(models)} models")
python "%PYTEMP%" "%INPUT%" "%OUTPUT%"
del "%PYTEMP%" 2>nul
if errorlevel 1 (echo. & echo ERROR: Conversion failed. Make sure Python is installed. & pause)
