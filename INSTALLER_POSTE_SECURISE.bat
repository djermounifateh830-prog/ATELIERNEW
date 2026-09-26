@echo off
setlocal enabledelayedexpansion
title 3M ATELIER - INSTALLATION DU POSTE SECURISE (PRODUCTION)
color 0A

echo =====================================================================
echo       3M ATELIER - INSTALLATION DU POSTE SECURISE SUR CE PC
echo              Protection Integree & Droits Concepteur
echo =====================================================================
echo.

cd /d "%~dp0"

:: 1. Verification de Node.js
echo [1/5] Verification de l'environnement Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] Node.js n'est pas detecte. Telechargement et installation en cours...
    where winget >nul 2>nul
    if %errorlevel% equ 0 (
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile '%TEMP%\nodejs_installer.msi'"
        msiexec /i "%TEMP%\nodejs_installer.msi" /quiet /norestart
        del "%TEMP%\nodejs_installer.msi" >nul 2>nul
    )
    set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [+] Node.js detecte : %NODE_VER%

:: 2. Installation des dependances
echo.
echo [2/5] Verification et installation des paquets applicatifs...
if not exist "node_modules\vite" (
    call npm install
) else (
    echo [+] Dependances deja installees.
)

:: 3. Compilation de Production (Obfuscation & Minification du Code Source)
echo.
echo [3/5] Compilation de production et protection du code source (Build)...
echo     (Cette etape securise vos algorithmes, formules et metadonnees)
call npm run build
if %errorlevel% neq 0 (
    echo [X] Erreur lors de la compilation du projet.
    pause
    exit /b 1
)
echo [+] Build de production genere avec succes dans le dossier dist\ !

:: 4. Creation du Raccourci Bureau
echo.
echo [4/5] Creation du raccourci officiel sur le Bureau...
if exist "create_shortcut.js" (
    node create_shortcut.js
)

:: 5. Resume & Instructions d'Activation
echo.
echo =====================================================================
echo   [OK] INSTALLATION DU POSTE TERMINEE AVEC SUCCES !
echo =====================================================================
echo.
echo  INSTRUCTIONS DE PROTECTION POUR LE PROPRIETAIRE (Fateh D.) :
echo.
echo   1. Lancez l'application via le raccourci sur le Bureau ou LANCER_3M_ATELIER.bat.
echo   2. L'application s'ouvrira et affichera l'Empreinte Machine (Hardware ID) de ce PC.
echo   3. En tant que Proprietaire :
echo      - Saisissez le mot de passe Maitre pour debloquer directement ce PC, OU
echo      - Generez une cle d'activation depuis votre panneau Administrateur.
echo   4. Si ce PC est deplace, clone ou copie sans votre accord, le logiciel
echo      se reverrouillera automatiquement pour proteger votre travail.
echo.
echo =====================================================================
echo.
pause
