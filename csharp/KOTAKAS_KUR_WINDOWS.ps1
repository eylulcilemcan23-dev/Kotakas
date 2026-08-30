$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
    $user = [Environment]::GetEnvironmentVariable('Path','User')
    $env:Path = ($machine + ';' + $user)
}

function Ensure-Package([string]$command, [string]$wingetId, [string]$label) {
    if (Get-Command $command -ErrorAction SilentlyContinue) {
        Write-Host ('[OK] ' + $label + ' zaten kurulu.') -ForegroundColor Green
        return
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "$label bulunamadı ve winget de yok. Windows App Installer/winget kurulmalı."
    }
    Write-Host ($label + ' kuruluyor...') -ForegroundColor Cyan
    winget install --id $wingetId -e --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "$label kurulamadı." }
    Refresh-Path
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$label kuruldu ancak bu PowerShell oturumunda görünmedi. Bilgisayarı/PowerShell'i yeniden açıp kurucuyu tekrar çalıştır."
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host '             KOTAKAS C# WINDOWS KURULUMU' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

Ensure-Package 'git' 'Git.Git' 'Git for Windows'
Ensure-Package 'dotnet' 'Microsoft.DotNet.SDK.8' '.NET 8 SDK'

$desktop = [Environment]::GetFolderPath('Desktop')
$target = Join-Path $desktop 'KOTAKAS'
$repo = 'https://github.com/eylulcilemcan23-dev/Kotakas.git'

if (Test-Path (Join-Path $target '.git')) {
    Write-Host '[OK] KOTAKAS klasörü mevcut; güncelleniyor.' -ForegroundColor Green
    Push-Location $target
    try {
        git fetch origin csharp-rebuild
        if ($LASTEXITCODE -ne 0) { throw 'GitHub güncellemesi alınamadı.' }
        git checkout csharp-rebuild
        if ($LASTEXITCODE -ne 0) { throw 'csharp-rebuild dalına geçilemedi.' }
        git pull --ff-only origin csharp-rebuild
        if ($LASTEXITCODE -ne 0) { throw 'csharp-rebuild güncellenemedi.' }
    }
    finally { Pop-Location }
}
elseif (Test-Path $target) {
    throw "Masaüstünde KOTAKAS adlı klasör var ama Git projesi değil. Klasörü yeniden adlandırıp kurucuyu tekrar çalıştır."
}
else {
    Write-Host 'KOTAKAS csharp-rebuild indiriliyor...' -ForegroundColor Cyan
    git clone -b csharp-rebuild --single-branch $repo $target
    if ($LASTEXITCODE -ne 0) { throw 'KOTAKAS GitHub deposu indirilemedi.' }
}

$preview = Join-Path $target 'csharp\KOTAKAS_ONIZLE_WINDOWS.bat'
if (-not (Test-Path $preview)) { throw 'Önizleme dosyası bulunamadı.' }

Write-Host ''
Write-Host 'KURULUM TAMAMLANDI.' -ForegroundColor Green
Write-Host 'Masaüstünde KOTAKAS Onizleme ve KOTAKAS Tam Test kısayolları oluşturulacak.' -ForegroundColor Green
Write-Host ''
Start-Process $preview
