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

rem Masaustunde onizleme ve tam test kisayollarini olustur.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $ws=New-Object -ComObject WScript.Shell; $preview=Join-Path $desktop 'KOTAKAS Onizleme.lnk'; if(-not (Test-Path $preview)){ $s=$ws.CreateShortcut($preview); $s.TargetPath='%~f0'; $s.WorkingDirectory='%~dp0..'; $s.Description='KOTAKAS csharp-rebuild yerel onizleme'; $s.Save() }; $test=Join-Path $desktop 'KOTAKAS Tam Test.lnk'; if(-not (Test-Path $test)){ $t=$ws.CreateShortcut($test); $t.TargetPath='%~dp0KOTAKAS_TAM_TEST_WINDOWS.bat'; $t.WorkingDirectory='%~dp0..'; $t.Description='KOTAKAS kritik akislari tek tik test et'; $t.Save() }" >nul 2>nul

echo [1/4] csharp-rebuild guncelleniyor...
git fetch origin csharp-rebuild
if errorlevel 1 goto :giterror

for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if /I not "%CURRENT_BRANCH%"=="csharp-rebuild" (
  git checkout csharp-rebuild
  if errorlevel 1 goto :giterror
)

git pull --ff-only origin csharp-rebuild
if errorlevel 1 goto :pullerror

echo [2/4] Oyun, slider ve populer oyun gorselleri kontrol ediliyor...
set "GAME_ASSET_DIR=%CD%\csharp\Kotakas.Web\wwwroot\assets\images\games"
if not exist "%GAME_ASSET_DIR%" mkdir "%GAME_ASSET_DIR%"

rem Takip edilen oyun kapaklari yerelde silinmis/bozulmussa Git'ten geri getir.
git checkout -- "csharp/Kotakas.Web/wwwroot/assets/images/games/knight-online.jpg" "csharp/Kotakas.Web/wwwroot/assets/images/games/rise-online.jpg" "csharp/Kotakas.Web/wwwroot/assets/images/games/valorant.jpg" "csharp/Kotakas.Web/wwwroot/assets/images/games/mobile-legends.webp" >nul 2>nul

rem Slider ve kullanicinin verdigi premium populer oyun gorsellerini Masaustu/Indirilenler/Belgeler icinden bulup gercek wwwroot'a kopyala.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target='%GAME_ASSET_DIR%'; $names=@('slider-1-genel-pazaryeri.png','slider-2-hizli-teslimat.png','slider-3-30-agustos.png','slider-4-bize-sat.png','popular-knight-online.webp','popular-mobile-legends.webp'); $roots=@([Environment]::GetFolderPath('Desktop'),(Join-Path $env:USERPROFILE 'Downloads'),[Environment]::GetFolderPath('MyDocuments')); foreach($n in $names){ $dest=Join-Path $target $n; if(Test-Path $dest){ Write-Host ('[OK] '+$n); continue }; $found=$null; foreach($r in $roots){ if($r -and (Test-Path $r)){ $found=Get-ChildItem -LiteralPath $r -Filter $n -File -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -ne $dest } | Select-Object -First 1; if($found){ break } } }; if($found){ Copy-Item -LiteralPath $found.FullName -Destination $dest -Force; Write-Host ('[OK] '+$n+' otomatik kopyalandi') } else { Write-Host ('[UYARI] '+$n+' bulunamadi') -ForegroundColor Yellow } }"

echo [3/4] Yerel SQLite veritabani hazirlaniyor...
set "ASPNETCORE_ENVIRONMENT=Development"
rem 0.0.0.0 sayesinde KOTAKAS ayni Wi-Fi/LAN'daki telefon ve tabletlerden de acilir.
set "ASPNETCORE_URLS=http://0.0.0.0:5097"
set "Database__Provider=sqlite"
set "ConnectionStrings__Default=Data Source=App_Data/kotakas-preview.db"
set "KOTAKAS_ADMIN_EMAIL=admin@kotakas.local"
set "KOTAKAS_ADMIN_PASSWORD=Kotakas12345"
set "MarketRateFeed__Enabled=true"

rem Aktif ag baglantisinin IPv4 adresini otomatik bul. DHCP ile IP degisse bile telefon adresi dogru gosterilir.
set "LAN_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$cfg=Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1; if($cfg -and $cfg.IPv4Address){ $cfg.IPv4Address.IPAddress }"`) do set "LAN_IP=%%I"

pushd "csharp\Kotakas.Web"

echo [4/4] KOTAKAS baslatiliyor...
echo.
echo PC: http://127.0.0.1:5097
if defined LAN_IP (
  echo Telefon: http://%LAN_IP%:5097
) else (
  echo Telefon: Yerel IPv4 adresi otomatik bulunamadi.
)
echo Admin: admin@kotakas.local
echo Sifre: Kotakas12345
echo Canli GB kuru: Kopazar ZERO (5 dakikada bir)
echo.
echo Mobil kontrol icin telefon ve bilgisayar ayni Wi-Fi aginda olmali.
echo Windows Guvenlik Duvari sorarsa Ozel aglar icin erisime izin ver.
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
