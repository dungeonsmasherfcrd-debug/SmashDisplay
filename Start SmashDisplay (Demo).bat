@echo off
setlocal
rem -- SmashDisplay DEMO launcher -- fake rosters, no CRG needed --
rem Served over http for parity with the live launcher (same local server).
set "DIR=%~dp0"
set "PORT=8077"
set "URL=http://127.0.0.1:%PORT%/index.html?demo=1"

rem Prefer the bundled Python, then any system Python.
set "PY="
if exist "%DIR%python\python.exe" set "PY=%DIR%python\python.exe"
if not defined PY ( where py >nul 2>nul && set "PY=py" )
if not defined PY ( where python >nul 2>nul && set "PY=python" )

if defined PY (
  start "SmashDisplay server" /min "%PY%" -m http.server %PORT% --bind 127.0.0.1 --directory "%DIR%."
  >nul ping -n 2 127.0.0.1
) else (
  set "URL=file:///%DIR%index.html?demo=1"
  set "URL=%URL:\=/%"
)

set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"

set "EDGE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if defined CHROME (
  start "" "%CHROME%" --app="%URL%" --start-fullscreen
) else if defined EDGE (
  start "" "%EDGE%" --app="%URL%" --start-fullscreen
) else (
  start "" "%URL%"
)
endlocal
