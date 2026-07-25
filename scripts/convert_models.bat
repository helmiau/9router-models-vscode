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
>> "%PYTEMP%" echo DEFAULT_API_KEY = "\${input:chat.lm.secret.-65d90303}"
>> "%PYTEMP%" echo raw = json.load(open(INPUT,"r",encoding="utf-8"))
>> "%PYTEMP%" echo models=[]; seen=set(); mx_i=128000; mx_o=64000
>> "%PYTEMP%" echo for m in raw.get("data",[]):
>> "%PYTEMP%" echo     if m.get("owned_by")=="combo": continue
>> "%PYTEMP%" echo     c=m.get("capabilities") or {}
>> "%PYTEMP%" echo     if c.get("contextWindow",0)>mx_i: mx_i=c["contextWindow"]
>> "%PYTEMP%" echo     if c.get("maxOutput",0)>mx_o: mx_o=c["maxOutput"]
>> "%PYTEMP%" echo for m in raw.get("data",[]):
>> "%PYTEMP%" echo     mid=m.get("id","")
>> "%PYTEMP%" echo     if mid in seen: continue
>> "%PYTEMP%" echo     seen.add(mid)
>> "%PYTEMP%" echo     ic=m.get("owned_by")=="combo"
>> "%PYTEMP%" echo     c=m.get("capabilities") or {}
>> "%PYTEMP%" echo     models.append({"id":mid,"name":mid,"url":BASE,"toolCalling":True if ic else bool(c.get("tools")),"vision":True if ic else bool(c.get("vision")),"maxInputTokens":mx_i if ic else c.get("contextWindow",128000),"maxOutputTokens":mx_o if ic else c.get("maxOutput",64000)})
>> "%PYTEMP%" echo R = [{"name":"9Router","vendor":"customendpoint","apiKey":DEFAULT_API_KEY,"apiType":"chat-completions","models":models}]
>> "%PYTEMP%" echo json.dump(R, open(OUTPUT,"w",encoding="utf-8"), indent="\t", ensure_ascii=False)
>> "%PYTEMP%" echo print(f"Done! Total: {len(models)} models")
python "%PYTEMP%" "%INPUT%" "%OUTPUT%"
del "%PYTEMP%" 2>nul
if errorlevel 1 (echo. & echo ERROR: Conversion failed. Make sure Python is installed. & pause)
