@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  PROJET TITAN - Simulateur de parties
REM ============================================================
REM  Demande combien de parties simuler, lance la campagne, et
REM  ecrit un rapport JSON complet a cote.
REM
REM  Ce fichier est fait pour evoluer : de nouvelles options
REM  peuvent etre ajoutees au menu sans rien casser.
REM ============================================================

cd /d "%~dp0"
title Projet Titan - Simulateur

:debut
cls
echo.
echo   =========================================================
echo      PROJET TITAN - SIMULATEUR DE PARTIES
echo   =========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERREUR] Node.js est introuvable sur cette machine.
  echo   Installe-le depuis https://nodejs.org  ^(version LTS^)
  echo   puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   Premiere utilisation : installation des dependances.
  echo   Une a deux minutes, une seule fois.
  echo.
  call npm install
  if errorlevel 1 (
    echo   [ERREUR] L'installation a echoue.
    pause
    exit /b 1
  )
  cls
)

echo   Que veux-tu faire ?
echo.
echo     1 - Simuler des parties  ^(statistiques d'equilibrage^)
echo     2 - Diagnostiquer le moteur  ^(chercher des bugs^)
echo.
set "ACTION="
set /p ACTION=  Ton choix [1] :
if "!ACTION!"=="" set "ACTION=1"
if not "!ACTION!"=="1" if not "!ACTION!"=="2" (
  echo.
  echo   Choix non reconnu.
  echo.
  pause
  goto debut
)

echo.
echo   ---------------------------------------------------------
echo.

REM --- Nombre de parties -------------------------------------
set "PARTIES="
set /p PARTIES=  Combien de parties ? [100] :
if "!PARTIES!"=="" set "PARTIES=100"

REM Validation : uniquement des chiffres, et au moins 1.
echo !PARTIES!| findstr /r "^[1-9][0-9]*$" >nul
if errorlevel 1 (
  echo.
  echo   "!PARTIES!" n'est pas un nombre valide. Entre un entier positif.
  echo.
  pause
  goto debut
)

REM --- Nombre de Titans --------------------------------------
set "JOUEURS="
set /p JOUEURS=  Combien de Titans ? 3 ou 4 [4] :
if "!JOUEURS!"=="" set "JOUEURS=4"
if not "!JOUEURS!"=="3" if not "!JOUEURS!"=="4" (
  echo.
  echo   Le jeu se joue a 3 ou 4 Titans. Valeur "!JOUEURS!" refusee.
  echo.
  pause
  goto debut
)

REM --- Graine ------------------------------------------------
REM  Meme graine = memes parties, au point pres. C'est ce qui
REM  permet de comparer deux campagnes en ne changeant qu'une
REM  seule variable.
set "GRAINE="
set /p GRAINE=  Graine ^(entree = 1, memes parties a chaque fois^) :
if "!GRAINE!"=="" set "GRAINE=1"

echo.
echo   ---------------------------------------------------------
echo.

if "!ACTION!"=="2" (
  echo   Diagnostic de !PARTIES! partie^(s^) a !JOUEURS! Titans...
  echo.
  call npm run diagnose -- --parties !PARTIES! --joueurs !JOUEURS! --seed !GRAINE!
  goto fin
)

REM --- Nom du rapport JSON -----------------------------------
REM  Horodate, pour ne jamais ecraser une campagne precedente et
REM  pouvoir comparer les resultats dans le temps.
for /f "tokens=1-6 delims=/-: " %%a in ("%date% %time%") do set "STAMP=%%c%%b%%a-%%d%%e"
set "STAMP=!STAMP: =0!"
set "RAPPORT=simulations\campagne-!STAMP!.json"
if not exist "simulations" mkdir "simulations"

echo   Simulation de !PARTIES! partie^(s^) a !JOUEURS! Titans...
echo   Compte environ une demi-seconde par partie.
echo.
call npm run simulate -- --parties !PARTIES! --joueurs !JOUEURS! --seed !GRAINE! --json "!RAPPORT!"

:fin
echo.
echo   =========================================================
echo.
set "ENCORE="
set /p ENCORE=  Relancer ? [o/N] :
if /i "!ENCORE!"=="o" goto debut

echo.
echo   Termine.
pause
