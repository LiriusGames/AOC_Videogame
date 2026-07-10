@echo off
cd /d "%~dp0"
start "" http://localhost:8477/
python -m http.server 8477
