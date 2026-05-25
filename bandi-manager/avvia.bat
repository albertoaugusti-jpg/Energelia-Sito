@echo off
REM ============================================================
REM   BANDI MANAGER - avvio app locale
REM   Doppio click su questo file per aprire l'interfaccia
REM ============================================================

cd /d "%~dp0"

REM --- Trova Python (prima 'py', poi 'python', poi 'python3') ---
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if "%PYCMD%"=="" where python >nul 2>nul && set "PYCMD=python"
if "%PYCMD%"=="" where python3 >nul 2>nul && set "PYCMD=python3"

if "%PYCMD%"=="" (
  echo.
  echo [ERRORE] Python non trovato sul tuo PC.
  echo.
  echo Scaricalo gratis da: https://www.python.org/downloads/
  echo Durante l'installazione spunta "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

REM --- Crea virtual environment alla prima esecuzione ---
if not exist ".venv\Scripts\python.exe" (
  echo.
  echo Prima esecuzione: preparo l'ambiente Python ^(richiede 1 minuto^)...
  echo.
  %PYCMD% -m venv .venv
  if errorlevel 1 (
    echo [ERRORE] Impossibile creare il virtual environment.
    pause
    exit /b 1
  )
)

REM --- Installa dipendenze se manca il file .installed ---
if not exist ".installed" (
  echo Installo Flask e BeautifulSoup...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip --quiet
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt --quiet
  if errorlevel 1 (
    echo [ERRORE] Installazione dipendenze fallita.
    pause
    exit /b 1
  )
  echo. > .installed
  echo Setup completato.
)

REM --- Avvia l'app ---
echo.
echo Avvio Bandi Manager...
echo Il browser si aprira' su http://127.0.0.1:5005
echo Per chiudere l'app: chiudi questa finestra o premi Ctrl+C
echo.

".venv\Scripts\python.exe" app.py

pause
