@echo off
cd /d "%~dp0"
set PORT=8765
set URL=http://127.0.0.1:%PORT%/?build=2026-05-28-start-menu-v15

echo Starting OtterKart server on %URL%
echo Leave this window open while you play. Close it to stop the server.
echo.

call :launchChrome "%URL%"

where python >nul 2>&1
if %errorlevel%==0 (
  python -m http.server %PORT%
  goto :eof
)

where py >nul 2>&1
if %errorlevel%==0 (
  py -m http.server %PORT%
  goto :eof
)

echo Python was not found. Install Python from https://www.python.org/downloads/
echo Then run this file again.
echo.
echo Or start a server yourself, then open in Chrome:
echo   %URL%
pause
goto :eof

:launchChrome
set "GAME_URL=%~1"
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%GAME_URL%"
  goto :eof
)
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%GAME_URL%"
  goto :eof
)
if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  start "" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" "%GAME_URL%"
  goto :eof
)
echo Chrome not found — opening your default browser instead.
start "" "%GAME_URL%"
goto :eof
