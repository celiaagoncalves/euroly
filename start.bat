@echo off
setlocal

REM ----- Euroly launcher -----
cd /d "%~dp0"

REM 1) Backend: ensure venv + deps
if not exist "backend\.venv\Scripts\python.exe" (
  echo [Euroly] Criando ambiente virtual Python...
  python -m venv backend\.venv
  if errorlevel 1 (
    echo [Euroly] ERRO: Python 3.11+ tem de estar no PATH.
    pause
    exit /b 1
  )
  "backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
  "backend\.venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
)

REM 2) Frontend: ensure node_modules
if not exist "frontend\node_modules" (
  echo [Euroly] Instalando dependencias do frontend...
  pushd frontend
  call npm install
  popd
)

REM 3) Start backend (uvicorn) in a new window
start "Euroly API" cmd /k ""%cd%\backend\.venv\Scripts\python.exe" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --app-dir "%cd%\backend""

REM 4) Start frontend (vite) in a new window
start "Euroly UI" cmd /k "cd /d "%cd%\frontend" && npm run dev"

REM 5) Wait briefly and open browser
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

endlocal
