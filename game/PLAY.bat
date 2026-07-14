@echo off
cd /d "%~dp0"
set URL=http://localhost:8477/

rem find a server: python, py launcher, or node (tools\serve.js needs no packages)
set SRV=
where python >nul 2>nul && set "SRV=python -m http.server 8477"
if not defined SRV where py >nul 2>nul && set "SRV=py -m http.server 8477"
if not defined SRV where node >nul 2>nul && set "SRV=node tools\serve.js 8477"
if not defined SRV (
  echo Could not find Python or Node.js to serve the game.
  echo Install one of them, or run any static file server in this
  echo folder and open %URL% in your browser.
  pause
  exit /b 1
)

rem open the browser once the server has had a moment to come up
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start "" %URL%"
%SRV%
