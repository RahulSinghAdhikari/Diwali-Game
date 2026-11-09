@echo off
rem Diwali Dhamaka - one-click launcher for Windows.
rem Double-click this file. It serves the folder and opens your browser.

cd /d "%~dp0"
set PORT=8080
set URL=http://localhost:%PORT%

echo.
echo   Diwali Dhamaka - The Festival Quest
echo   %URL%
echo   (close this window to stop the game)
echo.

where py >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    py tools\dev-server.py %PORT%
    goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    python tools\dev-server.py %PORT%
    goto :end
)

where npx >nul 2>nul
if %errorlevel%==0 (
    start "" "%URL%"
    npx --yes serve --listen %PORT% .
    goto :end
)

echo   Could not find Python or Node.js on this PC.
echo.
echo   Easiest alternative: just double-click play-offline.html
echo   It is the whole game in one file and needs nothing installed.
echo.
pause

:end
