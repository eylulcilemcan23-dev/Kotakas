@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KOTAKAS - Tam Test

cd /d "%~dp0.."

echo.
echo ======================================================
echo            KOTAKAS - TEK TIK TAM TEST
echo ======================================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo HATA: Git kurulu degil.
  pause
  exit /b 1
)
where dotnet >nul 2>nul
if errorlevel 1 (
  echo HATA: .NET 8 SDK kurulu degil.
  pause
  exit /b 1
)

echo En son csharp-rebuild surumu aliniyor...
git fetch origin csharp-rebuild
if errorlevel 1 goto :giterror
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /I not "%CURRENT_BRANCH%"=="csharp-rebuild" (
  git checkout csharp-rebuild
  if errorlevel 1 goto :giterror
)
git pull --ff-only origin csharp-rebuild
if errorlevel 1 goto :giterror

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0KOTAKAS_TAM_TEST_WINDOWS.ps1" -SkipUpdate
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
  echo TEST TAMAMLANDI: Kritik akislarda hata bulunmadi.
) else (
  echo TEST BASARISIZ: Yukaridaki ilk HATA satirini bana gonder.
)
echo.
pause
exit /b %RESULT%

:giterror
echo.
echo HATA: csharp-rebuild guncellenemedi. Internet veya yerel Git durumunu kontrol et.
pause
exit /b 1
