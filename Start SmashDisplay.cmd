@echo off
setlocal
rem -- SmashDisplay launcher --------------------------------------------------
rem Serves the board over http://127.0.0.1 so it can reach a CRG running on
rem ANOTHER computer. Uses the bundled Python in .\python (no install needed);
rem falls back to a system Python, then to file:// (which only reaches a CRG on
rem THIS same PC).
rem --------------------------------------------------------------------------
set "DIR=%~dp0"
set "PORT=8077"
set "URL=http://127.0.0.1:%PORT%/index.html"

rem Prefer the bundled Python, then any system Python.
set "PY="
if exist "%DIR%python\python.exe" set "PY=%DIR%python\python.exe"
if not defined PY ( where py >nul 2>nul && set "PY=py" )
if not defined PY ( where python >nul 2>nul && set "PY=python" )

if defined PY (
  rem Tiny static server bound to loopback, serving this folder. If the port is
  rem already in use from a previous launch, this window just exits and the
  rem browser connects to the server that is already running.
  start "SmashDisplay server" /min "%PY%" "%DIR%serve.py" %PORT% "%DIR%."
  rem Give the server a moment to come up before opening the browser.
  >nul ping -n 2 127.0.0.1
) else (
  rem No Python at all -- fall back to file:// (works only when CRG is on THIS PC).
  echo Python not found -- opening from file:// ^(only works if CRG runs on this PC^).
  set "URL=file:///%DIR%index.html"
  set "URL=%URL:\=/%"
)

rem Open a chromeless full-screen window: Chrome, then Edge, else default browser.
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
