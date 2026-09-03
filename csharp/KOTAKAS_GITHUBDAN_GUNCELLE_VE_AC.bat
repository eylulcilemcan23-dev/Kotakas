@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KOTAKAS - GitHub'dan Guncelle ve Ac

set "BRANCH=csharp-rebuild"
set "REPO_URL=https://github.com/eylulcilemcan23-dev/Kotakas.git"
set "BASE_DIR=%~dp0"
set "INSTALL_DIR=%BASE_DIR%KOTAKAS_LOCALHOST"

 echo.
echo ======================================================
echo       KOTAKAS - GITHUB'DAN GUNCELLE VE LOCALHOST
echo ======================================================
echo.

where git >nul 2>nul
if errorlevel 1 goto :nogit

where dotnet >nul 2>nul
if errorlevel 1 goto :nodotnet

if not exist "%INSTALL_DIR%\.git" (
  echo [1/3] Ilk kurulum: GitHub'dan KOTAKAS indiriliyor...
  if exist "%INSTALL_DIR%" rmdir /s /q "%INSTALL_DIR%"
  git clone --branch %BRANCH% --single-branch "%REPO_URL%" "%INSTALL_DIR%"
  if errorlevel 1 goto :giterror
) else (
  echo [1/3] GitHub'daki son degisiklikler aliniyor...
  cd /d "%INSTALL_DIR%"
  git fetch origin %BRANCH%
  if errorlevel 1 goto :giterror
  git checkout %BRANCH% >nul 2>nul
  if errorlevel 1 goto :giterror
  git reset --hard origin/%BRANCH%
  if errorlevel 1 goto :giterror
  git clean -fd
)

echo [2/3] KOTAKAS dosyalari guncel.
cd /d "%INSTALL_DIR%"

echo [3/3] Localhost baslatiliyor...
echo.
echo Adres: http://127.0.0.1:5097
echo.
echo NOT: Bu pencere acik kaldigi surece site calisir.
echo Her yeni duzenlemeden sonra bu BAT dosyasina tekrar tikla;
echo GitHub'daki en son surumu otomatik indirip acacaktir.
echo.

call "%INSTALL_DIR%\csharp\KOTAKAS_ONIZLE_WINDOWS.bat"
exit /b %ERRORLEVEL%

:nogit
echo HATA: Git kurulu degil.
echo Git for Windows kurup tekrar dene.
pause
exit /b 1

:nodotnet
echo HATA: .NET 8 SDK kurulu degil.
echo .NET 8 SDK kurup tekrar dene.
pause
exit /b 1

:giterror
echo.
echo HATA: GitHub'dan KOTAKAS dosyalari alinamadi.
echo Internet baglantisini kontrol edip tekrar dene.
pause
exit /b 1
