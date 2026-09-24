@echo off
setlocal enabledelayedexpansion
title 3M ATELIER - UTILITAIRE DE DIAGNOSTIC ET DEPANNAGE
color 0E

echo =====================================================================
echo          3M ATELIER - DIAGNOSTIC ET DEPANNAGE RAPIDE
echo =====================================================================
echo.

cd /d "%~dp0"

echo [1] Verification de Node.js...
where node >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('node -v') do set NV=%%i
    echo     [OK] Node.js est installe : !NV!
) else (
    echo     [ERREUR] Node.js n'est pas installe.
)

echo [2] Verification de npm...
where npm >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%i in ('npm -v') do set NPMV=%%i
    echo     [OK] npm est disponible : !NPMV!
) else (
    echo     [ERREUR] npm introuvable.
)

echo [3] Verification du dossier node_modules...
if exist "node_modules\" (
    echo     [OK] Le dossier node_modules est present.
) else (
    echo     [ATTENTION] node_modules est absent. Une installation (npm install) est requise.
)

echo [4] Verification de la base SQLite physique...
if exist "3m_atelier.db" (
    echo     [OK] 3m_atelier.db est present.
) else (
    echo     [INFO] 3m_atelier.db sera cree automatiquement lors du premier lancement.
)

echo [5] Verification de l'occupation du port 3000...
set PORT_BUSY=0
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":3000[ ]" 2^>nul') do (
    set PORT_BUSY=%%a
)
if "!PORT_BUSY!"=="0" (
    echo     [OK] Port 3000 libre.
) else (
    echo     [INFO] Le port 3000 est occupe par le PID : !PORT_BUSY!
)

echo.
echo =====================================================================
echo Options de reparation :
echo   [1] Forcer la liberation du port 3000
echo   [2] Reinstaller les modules (npm install)
echo   [3] Lancer le serveur en mode DEBUG direct
echo   [4] Ouvrir la version Cloud sur Google AI Studio
echo   [5] Quitter
echo =====================================================================
echo.

set /p ACTION="Votre choix (1-5) : "
if "%ACTION%"=="1" (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":3000[ ]" 2^>nul') do (
        taskkill /F /PID %%a >nul 2>nul
    )
    echo Port 3000 libere.
    pause
    exit /b 0
)
if "%ACTION%"=="2" (
    echo Installation npm...
    call npm install
    pause
    exit /b 0
)
if "%ACTION%"=="3" (
    echo Demarrage en direct...
    npm run dev
    pause
    exit /b 0
)
if "%ACTION%"=="4" (
    start https://ais-dev-zy7ecc2vjz5ddienffswoc-496354068372.europe-west2.run.app
    exit /b 0
)
pause
