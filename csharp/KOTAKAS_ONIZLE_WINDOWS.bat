@echo off
setlocal EnableExtensions
chcp 65001 >nul
title KOTAKAS - Yerel Onizleme

cd /d "%~dp0.."

echo.
echo ======================================================
echo           KOTAKAS C# - YEREL ONIZLEME
echo ======================================================
echo.

where git >nul 2>nul
if errorlevel 1 goto :nogit

where dotnet >nul 2>nul
if errorlevel 1 goto :nodotnet

rem Masaustunde kolay acma kisayolu yoksa olustur.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $link=Join-Path $desktop 'KOTAKAS Onizleme.lnk'; if(-not (Test-Path $link)){ $ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut($link); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0..'; $s.Description='KOTAKAS csharp-rebuild yerel onizleme'; $s.Save() }" >nul 2>nul

echo [1/3] csharp-rebuild guncelleniyor...
git fetch origin csharp-rebuild
if errorlevel 1 goto :giterror

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /I not "%CURRENT_BRANCH%"=="csharp-rebuild" (
  git checkout csharp-rebuild
  if errorlevel 1 goto :giterror
)

git pull --ff-only origin csharp-rebuild
if errorlevel 1 goto :pullerror

echo [2/3] Yerel SQLite veritabani hazirlaniyor...
set "ASPNETCORE_ENVIRONMENT=Development"
set "ASPNETCORE_URLS=http://127.0.0.1:5097"
set "Database__Provider=sqlite"
set "ConnectionStrings__Default=Data Source=App_Data/kotakas-preview.db"
set "KOTAKAS_ADMIN_EMAIL=admin@kotakas.local"
set "KOTAKAS_ADMIN_PASSWORD=Kotakas12345"

pushd "csharp\Kotakas.Web"

echo [3/3] KOTAKAS baslatiliyor...
echo.
echo Adres: http://127.0.0.1:5097
echo Admin: admin@kotakas.local
echo Sifre: Kotakas12345
echo.
echo ONEMLI: Bu siyah pencere acik kaldigi surece site calisir.
echo Kapatirsan yerel KOTAKAS da kapanir.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "$u='http://127.0.0.1:5097'; for($i=0;$i -lt 80;$i++){ try { Invoke-WebRequest ($u+'/api/health') -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $u; exit } catch { Start-Sleep -Milliseconds 500 } }"

dotnet run --project Kotakas.Web.csproj
set "EXIT_CODE=%ERRORLEVEL%"
popd

echo.
if not "%EXIT_CODE%"=="0" (
  echo KOTAKAS kapanirken hata kodu: %EXIT_CODE%
  pause
)
exit /b %EXIT_CODE%

:nogit
echo HATA: Git kurulu degil.
echo Git for Windows kurup bu dosyayi yeniden ac.
pause
exit /b 1

:nodotnet
echo HATA: .NET 8 SDK kurulu degil.
echo .NET 8 SDK kurup bu dosyayi yeniden ac.
pause
exit /b 1

:giterror
echo.
echo HATA: GitHub'dan csharp-rebuild guncellemesi alinamadi.
echo Internet baglantisini kontrol et.
pause
exit /b 1

:pullerror
echo.
echo HATA: Guncelleme uygulanamadi.
echo Yerel dosyalarda elle degisiklik varsa git pull durmus olabilir.
pause
exit /b 1
