@echo off
title Warlords RTS
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies, one moment...
  call npm install
)
echo.
echo  Launching Warlords - a browser tab will open shortly.
echo  Keep this window open while you play; close it to stop the game.
echo.
call npx vite --open
