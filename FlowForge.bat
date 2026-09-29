@echo off
rem Double-click to start FlowForge on Windows.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :no_node
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 20 ? 0 : 1)"
if errorlevel 1 goto :old_node

node src\server.js %*
if errorlevel 1 pause
exit /b %errorlevel%

:no_node
echo FlowForge needs Node.js 20 or newer, and it isn't installed.
echo Opening https://nodejs.org so you can install the LTS version...
start "" https://nodejs.org
pause
exit /b 1

:old_node
echo FlowForge needs Node.js 20 or newer. Please update it from https://nodejs.org
start "" https://nodejs.org
pause
exit /b 1
