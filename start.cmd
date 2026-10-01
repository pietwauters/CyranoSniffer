@echo off
rem Receives the Cyrano the CMS forwards (ports: udpPorts in config.json) and
rem feeds the results site. Stop with Ctrl+C.
cd /d "%~dp0"
node src\index.js --listen
pause
