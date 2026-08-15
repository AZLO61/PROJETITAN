@echo off
REM ============================================================
REM  PROJET TITAN - Lancer le jeu en local
REM ============================================================
REM  Double-clique sur ce fichier : il demarre le serveur local
REM  et ouvre le jeu dans ton navigateur.
REM
REM  Laisse la fenetre noire OUVERTE pendant que tu joues.
REM  La fermer arrete le serveur et la page ne repondra plus.
REM  Pour arreter proprement : Ctrl+C dans la fenetre, ou la fermer
REM  une fois la partie terminee.
REM ============================================================

cd /d "%~dp0"
title Projet Titan - serveur local (garder ouvert)

echo.
echo   ============================================
echo     PROJET TITAN - demarrage du serveur local
echo   ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   [ERREUR] Node.js est introuvable sur cette machine.
  echo.
  echo   Le jeu a besoin de Node.js pour demarrer son serveur local.
  echo   Installe-le depuis https://nodejs.org  ^(version LTS^)
  echo   puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo   Premiere utilisation : installation des dependances.
  echo   Cela peut prendre une a deux minutes, une seule fois.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   [ERREUR] L'installation a echoue.
    echo   Verifie ta connexion internet et relance ce fichier.
    echo.
    pause
    exit /b 1
  )
  echo.
)

echo   Le navigateur va s'ouvrir tout seul dans quelques secondes.
echo   GARDE CETTE FENETRE OUVERTE pendant la partie.
echo.

REM --open demande a Vite d'ouvrir le navigateur lui-meme : pas besoin
REM de deviner l'URL ni le port, Vite en choisit un autre tout seul si
REM 5173 est deja pris, et ouvre le bon.
call npm run dev -- --open

echo.
echo   Le serveur s'est arrete.
pause
