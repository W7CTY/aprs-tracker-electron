@echo off
setlocal enabledelayedexpansion

echo.
echo --------------------------------------------
echo   APRSaR Tracker Windows Build
echo   W7CTY / 914 Communications
echo --------------------------------------------
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
for /f "tokens=*" %%v in ('npm --version') do set NPM_VER=%%v
echo Node: %NODE_VER%
echo npm:  %NPM_VER%
echo.

:: Install dependencies
echo Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)
echo Dependencies: OK
echo.

:: Build Windows installer
echo Building Windows installer...
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed. Check output above.
    pause
    exit /b 1
)

:: Find the installer
set INSTALLER=
for /f "delims=" %%f in ('dir /b /s "dist\*.exe" 2^>nul') do set INSTALLER=%%f

if "%INSTALLER%"=="" (
    echo ERROR: No .exe found in dist\
    pause
    exit /b 1
)

echo.
echo --------------------------------------------
echo   Build complete:
echo   %INSTALLER%
echo --------------------------------------------
echo.
pause
