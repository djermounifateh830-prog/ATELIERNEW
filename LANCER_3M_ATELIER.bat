@echo off
setlocal enabledelayedexpansion
title 3M ATELIER - OPTIMISATION DE DECOUPE ET GESTION
color 0B

echo =====================================================================
echo          3M ATELIER - OPTIMISATION DE DECOUPE ET GESTION
echo =====================================================================
echo.

cd /d "%~dp0"

:: 1. Verification de Node.js
echo [1/4] Verification de l'environnement Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js n'est pas installe sur cet ordinateur.
    echo [*] Installation automatique de Node.js LTS en cours, veuillez patienter...
    
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    ) else (
        echo [*] Telechargement de l'installateur Node.js...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi'"
        echo [*] Installation en cours...
        msiexec /i "%TEMP%\nodejs_installer.msi" /quiet /norestart
        del "%TEMP%\nodejs_installer.msi" >nul 2>nul
    )
    
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo [X] Erreur : Veuillez redemarrer l'ordinateur apres l'installation de Node.js.
        pause
        exit /b 1
    )
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [+] Node.js detecte : %NODE_VER%

:: 2. Verification des modules et dependances
echo [2/4] Verification des modules de l'application...
if not exist "node_modules\vite" (
    echo [*] Modules manquants ou incomplets. Installation en cours (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [X] Erreur lors de l'installation des dependances npm.
        echo [*] Conseil : Verifiez votre connexion Internet.
        pause
        exit /b 1
    )
)
echo [+] Modules verifies et operationnels.

:: 3. Nettoyage et liberation du port 3000
echo [3/4] Verification et liberation du port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r ":3000[ ]" 2^>nul') do (
    if not "%%a"=="0" taskkill /F /PID %%a >nul 2>nul
)
echo [+] Port 3000 pret.

:: 4. Demarrage du serveur local
echo [4/4] Demarrage du serveur 3M Atelier et de la base SQLite...
echo.

del /q "%TEMP%\3m_server.log" >nul 2>nul
start /b cmd /c "npm run dev > "%TEMP%\3m_server.log" 2>&1"

set APP_URL=http://localhost:3000
set COUNT=0

:WAIT_LOOP
set /a COUNT+=1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 (
    set APP_URL=http://localhost:3000
    goto SERVER_READY
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { (Invoke-WebRequest -Uri 'http://localhost:3001' -UseBasicParsing -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 (
    set APP_URL=http://localhost:3001
    goto SERVER_READY
)

if %COUNT% geq 15 goto SERVER_NOT_RESPONDING
timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:SERVER_READY
echo =====================================================================
echo   [OK] APPLICATION OPERATIONNELLE ET CONNECTEE !
echo   [+] URL dans votre navigateur  : %APP_URL%
echo   [+] Base de donnees SQLite     : 3m_atelier.db
echo   [+] Lien Cloud de secours      : https://ais-dev-zy7ecc2vjz5ddienffswoc-496354068372.europe-west2.run.app
echo =====================================================================
echo.
start %APP_URL%
goto END

:SERVER_NOT_RESPONDING
echo.
echo =====================================================================
echo   [!] ATTENTION : LE SERVEUR LOCAL N'A PAS REPONDU SUR LE PORT 3000
echo =====================================================================
echo.
echo Dernieres lignes du journal d'erreur (3m_server.log) :
echo ---------------------------------------------------------------------
if exist "%TEMP%\3m_server.log" (
    type "%TEMP%\3m_server.log"
) else (
    echo Aucune trace d'erreur enregistree.
)
echo ---------------------------------------------------------------------
echo.
echo Solutions rapides disponibles :
echo   [1] Lancer l'application en mode direct (fenetre visible pour debug)
echo   [2] Ouvrir la version Cloud sur Google AI Studio
echo   [3] Reinstaller completement les modules (npm install)
echo   [4] Reessayer de demarrer
echo.
set /p CHOIX="Choisissez une option (1-4) puis appuyez sur Entree : "
if "%CHOIX%"=="1" (
    echo.
    echo Lancement direct du serveur...
    npm run dev
    pause
    exit /b 0
)
if "%CHOIX%"=="2" (
    start https://ais-dev-zy7ecc2vjz5ddienffswoc-496354068372.europe-west2.run.app
    goto END
)
if "%CHOIX%"=="3" (
    echo Nettoyage de node_modules et reinstallation...
    call npm install
    goto WAIT_LOOP
)
goto END

:END
echo.
echo [i] Laissez cette fenetre ouverte pendant l'utilisation de l'application.
echo     (Pour arreter le serveur, fermez simplement cette fenetre)
echo.
pause
