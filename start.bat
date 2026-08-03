@echo off
title Fighting Game
cd /d "C:\Users\wesll\jogo-de-luta"

echo Starting WebSocket server...
start "WebSocket Server" cmd /k "cd /d server && node src/main.js"

timeout /t 2 /nobreak > nul

echo Starting Vite dev server...
start "Vite Dev Server" cmd /k "cd /d client && npx vite --port 3001 --strictPort"

echo.
echo Both servers are starting...
echo - WebSocket Server: port 3002
echo - Vite Dev Server: port 3001
echo.
echo Open http://localhost:3001 in your browser
echo.
echo Controls:
echo P1: A/D (move), W (jump), S (crouch), U/I (light/heavy punch), J/K (light/heavy kick), L (block)
echo P2: Arrows (move/jump/crouch), Numpad 1/2 (punches), Numpad 3/4 (kicks), Numpad 0 (block)
echo.
pause
