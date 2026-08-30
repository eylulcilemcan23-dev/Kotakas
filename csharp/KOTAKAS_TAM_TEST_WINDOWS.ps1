param(
    [switch]$SkipUpdate
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repoRoot 'csharp\Kotakas.Web'
$project = Join-Path $webRoot 'Kotakas.Web.csproj'
$baseUrl = 'http://127.0.0.1:5098'
$dbPath = Join-Path $webRoot 'App_Data\kotakas-selftest.db'
$logPath = Join-Path $env:TEMP 'kotakas-selftest.log'
$errPath = Join-Path $env:TEMP 'kotakas-selftest-error.log'
$app = $null
$passed = 0
$startedAt = Get-Date

function Write-Title([string]$text) {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor Cyan
    Write-Host ('  ' + $text) -ForegroundColor Cyan
    Write-Host '============================================================' -ForegroundColor Cyan
}

function Ok([string]$text) {
    $script:passed++
    Write-Host ('[OK]   ' + $text) -ForegroundColor Green
}

function Assert-True($condition, [string]$message) {
    if (-not $condition) { throw $message }
}

function Invoke-Kotakas {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [ValidateSet('GET','POST','PUT','PATCH','DELETE')][string]$Method = 'GET',
        $Body = $null,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session = $null
    )

    $args = @{
        Uri = $baseUrl + $Path
        Method = $Method
        ErrorAction = 'Stop'
        TimeoutSec = 20
    }
    if ($null -ne $Session) { $args.WebSession = $Session }
    if ($Method -ne 'GET') {
        $args.Headers = @{
            'X-KOTAKAS-CSRF' = '1'
            'Idempotency-Key' = [guid]::NewGuid().ToString('N')
        }
    }
    if ($null -ne $Body) {
        $args.ContentType = 'application/json; charset=utf-8'
        $args.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }
    Invoke-RestMethod @args
}

function Login([string]$email, [string]$password) {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $result = Invoke-Kotakas -Path '/api/login' -Method POST -Body @{ email=$email; password=$password } -Session $session
    Assert-True ($result.ok -eq $true) ('Giriş başarısız: ' + $email)
    return $session
}

Write-Title 'KOTAKAS TAM KRITIK AKIS TESTI'
Write-Host 'Bu test App_Data\kotakas-selftest.db kullanır; önizleme verilerine dokunmaz.'
Write-Host ('Test adresi: ' + $baseUrl)

try {
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw '.NET 8 SDK bulunamadı.' }
    if (-not $SkipUpdate) {
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git bulunamadı.' }
        Push-Location $repoRoot
        try {
            Write-Host '[1/4] csharp-rebuild güncelleniyor...'
            git fetch origin csharp-rebuild | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'git fetch başarısız.' }
            $branch = (git branch --show-current).Trim()
            if ($branch -ne 'csharp-rebuild') {
                git checkout csharp-rebuild | Out-Host
                if ($LASTEXITCODE -ne 0) { throw 'csharp-rebuild dalına geçilemedi.' }
            }
            git pull --ff-only origin csharp-rebuild | Out-Host
            if ($LASTEXITCODE -ne 0) { throw 'git pull başarısız.' }
        }
        finally { Pop-Location }
    }

    Write-Host '[2/4] Test veritabanı hazırlanıyor...'
    if (Test-Path $dbPath) { Remove-Item $dbPath -Force }
    if (Test-Path ($dbPath + '-shm')) { Remove-Item ($dbPath + '-shm') -Force }
    if (Test-Path ($dbPath + '-wal')) { Remove-Item ($dbPath + '-wal') -Force }
    New-Item -ItemType Directory -Path (Split-Path $dbPath -Parent) -Force | Out-Null
    Remove-Item $logPath,$errPath -Force -ErrorAction SilentlyContinue

    $oldEnv = @{
        ASPNETCORE_ENVIRONMENT = $env:ASPNETCORE_ENVIRONMENT
        ASPNETCORE_URLS = $env:ASPNETCORE_URLS
        Database__Provider = $env:Database__Provider
        ConnectionStrings__Default = $env:ConnectionStrings__Default
        KOTAKAS_ADMIN_EMAIL = $env:KOTAKAS_ADMIN_EMAIL
        KOTAKAS_ADMIN_PASSWORD = $env:KOTAKAS_ADMIN_PASSWORD
    }

    $env:ASPNETCORE_ENVIRONMENT = 'Development'
    $env:ASPNETCORE_URLS = $baseUrl
    $env:Database__Provider = 'sqlite'
    $env:ConnectionStrings__Default = 'Data Source=App_Data/kotakas-selftest.db'
    $env:KOTAKAS_ADMIN_EMAIL = 'selftest-admin@kotakas.local'
    $env:KOTAKAS_ADMIN_PASSWORD = 'SelfTestAdmin123'

    Write-Host '[3/4] Ayrı KOTAKAS test sunucusu başlatılıyor...'
    $app = Start-Process -FilePath 'dotnet' -ArgumentList @('run','--project','Kotakas.Web.csproj','--no-launch-profile') -WorkingDirectory $webRoot -PassThru -RedirectStandardOutput $logPath -RedirectStandardError $errPath

    $ready = $false
    for ($i=0; $i -lt 120; $i++) {
        try {
            $health = Invoke-RestMethod -Uri ($baseUrl + '/api/health') -TimeoutSec 2 -ErrorAction Stop
            $ready = $true
            break
        } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $ready) { throw 'Test sunucusu başlatılamadı. Log: ' + $errPath }
    Ok 'Sunucu ve SQLite başlangıcı'

    Write-Host '[4/4] Gerçek kullanıcı/pazarcı/admin senaryoları çalıştırılıyor...'

    $adminSession = Login 'selftest-admin@kotakas.local' 'SelfTestAdmin123'
    Ok 'Admin girişi'

    $userReg = Invoke-Kotakas -Path '/api/register' -Method POST -Body @{ displayName='SelfTest Kullanıcı'; email='selftest-user@kotakas.local'; password='SelfTestUser123' }
    $userId = $userReg.user.id
    Assert-True (-not [string]::IsNullOrWhiteSpace($userId)) 'Kullanıcı ID oluşmadı.'
    $userSession = Login 'selftest-user@kotakas.local' 'SelfTestUser123'
    Ok 'Normal kullanıcı kayıt + giriş'

    $traderReg = Invoke-Kotakas -Path '/api/register' -Method POST -Body @{ displayName='SelfTest Pazarcı'; email='selftest-trader@kotakas.local'; password='SelfTestTrader123' }
    $traderId = $traderReg.user.id
    Assert-True (-not [string]::IsNullOrWhiteSpace($traderId)) 'Pazarcı ID oluşmadı.'
    Invoke-Kotakas -Path ('/api/admin/users/' + $traderId + '/role') -Method PATCH -Body @{ role='trader' } -Session $adminSession | Out-Null
    $traderSession = Login 'selftest-trader@kotakas.local' 'SelfTestTrader123'
    $meTrader = Invoke-Kotakas -Path '/api/me' -Session $traderSession
    Assert-True ($meTrader.user.role -eq 'trader') 'Pazarcı rolü uygulanmadı.'
    Ok 'Admin rol yönetimi + pazarcı girişi'

    Invoke-Kotakas -Path '/api/admin/settings' -Method PUT -Body @{ normalCommissionPercent=4; traderCommissionPercent=3; paidListingTry=25; gbTryRate=100 } -Session $adminSession | Out-Null
    Invoke-Kotakas -Path ('/api/admin/wallets/' + $userId + '/adjust') -Method POST -Body @{ amountTry=5000; reason='SelfTest kullanıcı bakiyesi' } -Session $adminSession | Out-Null
    Invoke-Kotakas -Path ('/api/admin/wallets/' + $traderId + '/adjust') -Method POST -Body @{ amountTry=5000; reason='SelfTest pazarcı bakiyesi' } -Session $adminSession | Out-Null
    $userWallet = Invoke-Kotakas -Path '/api/wallet' -Session $userSession
    Assert-True ([decimal]$userWallet.balanceTry -eq 5000) 'Kullanıcı bakiyesi beklenen değerde değil.'
    Ok 'Komisyon/GB kuru + admin bakiye yönetimi'

    $listingCreate = Invoke-Kotakas -Path '/api/listings' -Method POST -Body @{ itemName='SelfTest Raptor +7'; serverCode='ZERO'; priceGb=10; stock=3 } -Session $traderSession
    $listingId = [long]$listingCreate.listing.id
    Assert-True ($listingId -gt 0) 'SELL ilanı oluşmadı.'
    $publicListings = Invoke-Kotakas -Path '/api/listings'
    Assert-True (($publicListings.listings | Where-Object { $_.id -eq $listingId }).Count -eq 1) 'SELL ilanı canlı pazarda görünmüyor.'
    Ok 'Pazarcı SELL ilanı oluşturma + canlı pazar'

    Invoke-Kotakas -Path ('/api/favorites/listing/' + $listingId) -Method POST -Session $userSession | Out-Null
    $favorites = Invoke-Kotakas -Path '/api/favorites/' -Session $userSession
    Assert-True ($favorites.listingIds -contains $listingId) 'Favori ilan kaydedilmedi.'
    $watchCreate = Invoke-Kotakas -Path '/api/item-watches/' -Method POST -Body @{ serverCode='ZERO'; query='Raptor'; maxPriceGb=12 } -Session $userSession
    $watchId = [long]$watchCreate.watch.id
    $watches = Invoke-Kotakas -Path '/api/item-watches/' -Session $userSession
    Assert-True (($watches.watches | Where-Object { $_.id -eq $watchId }).matchCount -ge 1) 'Item alarmı ilanı eşleştirmedi.'
    Ok 'Favoriler + item fiyat alarmı'

    $detailsBefore = Invoke-Kotakas -Path ('/api/listings/' + $listingId + '/details') -Session $userSession
    Assert-True ($detailsBefore.listing.id -eq $listingId) 'İlan detayı alınamadı.'
    Invoke-Kotakas -Path ('/api/listings/' + $listingId) -Method PATCH -Body @{ priceGb=11; stock=4; status='active' } -Session $traderSession | Out-Null
    $detailsAfter = Invoke-Kotakas -Path ('/api/listings/' + $listingId + '/details') -Session $userSession
    Assert-True ([decimal]$detailsAfter.listing.priceGb -eq 11) 'İlan fiyat güncellemesi uygulanmadı.'
    Assert-True ($detailsAfter.priceHistory.Count -ge 1) 'Fiyat geçmişi oluşmadı.'
    Ok 'Pazarcı fiyat/stok güncelleme + fiyat geçmişi'

    $priceOffer = Invoke-Kotakas -Path ('/api/listings/' + $listingId + '/price-offers') -Method POST -Body @{ offerGbPerUnit=9; quantity=1 } -Session $userSession
    $priceOfferId = [long]$priceOffer.offer.id
    $sellerOffers = Invoke-Kotakas -Path '/api/listing-price-offers/mine' -Session $traderSession
    Assert-True (($sellerOffers.offers | Where-Object { $_.id -eq $priceOfferId -and $_.role -eq 'seller' }).Count -eq 1) 'Fiyat teklifi pazarcıya ulaşmadı.'
    Invoke-Kotakas -Path ('/api/listing-price-offers/' + $priceOfferId + '/decision') -Method POST -Body @{ action='accept' } -Session $traderSession | Out-Null
    $purchase = Invoke-Kotakas -Path ('/api/listing-price-offers/' + $priceOfferId + '/purchase') -Method POST -Session $userSession
    $listingDealId = [long]$purchase.deal.id
    Assert-True ($listingDealId -gt 0) 'Teklif fiyatından güvenli işlem oluşmadı.'
    Ok 'SELL fiyat pazarlığı + kabul + emanet ödeme'

    Invoke-Kotakas -Path ('/api/deals/' + $listingDealId + '/messages') -Method POST -Body @{ code='ITEM_HAZIR' } -Session $traderSession | Out-Null
    $dealMessages = Invoke-Kotakas -Path ('/api/deals/' + $listingDealId + '/messages') -Session $userSession
    Assert-True ($dealMessages.messages.Count -ge 1) 'Hazır işlem mesajı karşı tarafa ulaşmadı.'
    Invoke-Kotakas -Path ('/api/deals/' + $listingDealId + '/delivered') -Method POST -Session $traderSession | Out-Null
    Invoke-Kotakas -Path ('/api/deals/' + $listingDealId + '/confirm') -Method POST -Session $userSession | Out-Null
    $dealsUser = Invoke-Kotakas -Path '/api/deals' -Session $userSession
    $completedListingDeal = $dealsUser.deals | Where-Object { $_.id -eq $listingDealId }
    Assert-True ($completedListingDeal.status -eq 'completed') 'SELL güvenli işlem tamamlanmadı.'
    Ok 'Hazır mesajlar + teslim + alıcı onayı + komisyon kapanışı'

    Invoke-Kotakas -Path ('/api/deals/' + $listingDealId + '/review') -Method POST -Body @{ stars=5; comment='Hızlı ve sorunsuz işlem.' } -Session $userSession | Out-Null
    $trust = Invoke-Kotakas -Path '/api/trust/traders'
    $traderTrust = $trust.traders | Where-Object { $_.id -eq $traderId }
    Assert-True ($traderTrust.reviewCount -ge 1) 'Pazarcı değerlendirmesi güven profiline yansımadı.'
    Ok 'İşlem değerlendirmesi + pazarcı güven profili'

    $saleRequest = Invoke-Kotakas -Path '/api/sale-requests' -Method POST -Body @{ itemName='SelfTest Iron Bow +8'; serverCode='ZERO'; quantity=1; minimumGb=5; note='SelfTest satış talebi' } -Session $userSession
    $requestId = [long]$saleRequest.request.id
    $offer = Invoke-Kotakas -Path ('/api/sale-requests/' + $requestId + '/offers') -Method POST -Body @{ priceGb=6; expiryMinutes=10 } -Session $traderSession
    $offerId = [long]$offer.offer.id
    $accept = Invoke-Kotakas -Path ('/api/offers/' + $offerId + '/accept') -Method POST -Session $userSession
    $requestDealId = [long]$accept.deal.id
    Assert-True ($requestDealId -gt 0) 'Satış talebi teklifinden güvenli işlem oluşmadı.'
    Invoke-Kotakas -Path ('/api/deals/' + $requestDealId + '/delivered') -Method POST -Session $userSession | Out-Null
    Invoke-Kotakas -Path ('/api/deals/' + $requestDealId + '/confirm') -Method POST -Session $traderSession | Out-Null
    Ok 'Kullanıcı satış talebi + pazarcı BUY teklifi + ters yön güvenli işlem'

    $notificationsUser = Invoke-Kotakas -Path '/api/notifications' -Session $userSession
    $notificationsTrader = Invoke-Kotakas -Path '/api/notifications' -Session $traderSession
    Assert-True ($notificationsUser.notifications.Count -ge 1) 'Kullanıcı bildirimleri oluşmadı.'
    Assert-True ($notificationsTrader.notifications.Count -ge 1) 'Pazarcı bildirimleri oluşmadı.'
    Invoke-Kotakas -Path '/api/notifications/read-all' -Method POST -Session $userSession | Out-Null
    Ok 'Bildirim merkezi + tümünü okundu yap'

    Invoke-Kotakas -Path '/api/support' -Method POST -Body @{ subject='SelfTest destek'; message='Otomatik test destek kaydı.'; priority='high' } -Session $userSession | Out-Null
    $adminSupport = Invoke-Kotakas -Path '/api/admin/support' -Session $adminSession
    Assert-True (($adminSupport.tickets | Where-Object { $_.subject -eq 'SelfTest destek' }).Count -eq 1) 'Destek talebi admin paneline düşmedi.'
    Ok 'Destek merkezi + admin kuyruğu'

    $userInsights = Invoke-Kotakas -Path '/api/panel/user-insights' -Session $userSession
    $traderInsights = Invoke-Kotakas -Path '/api/panel/trader-insights' -Session $traderSession
    $adminOverview = Invoke-Kotakas -Path '/api/admin/overview' -Session $adminSession
    $adminPerformance = Invoke-Kotakas -Path '/api/admin/performance' -Session $adminSession
    Assert-True ($userInsights.completedDeals -ge 2) 'Kullanıcı işlem istatistiği güncellenmedi.'
    Assert-True ($traderInsights.allTime.deals -ge 2) 'Pazarcı satış istatistiği güncellenmedi.'
    Assert-True ($adminOverview.overview.users -ge 3) 'Admin kullanıcı sayısı hatalı.'
    Assert-True ($null -ne $adminPerformance.last30) 'Admin performans verisi alınamadı.'
    Ok 'Kullanıcı + Pazarcı + Admin canlı panel istatistikleri'

    $risk = Invoke-Kotakas -Path '/api/admin/risk/summary' -Session $adminSession
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$risk.provider)) 'Risk merkezi özet vermedi.'
    Ok 'Admin risk merkezi'

    Invoke-Kotakas -Path ('/api/favorites/listing/' + $listingId) -Method DELETE -Session $userSession | Out-Null
    Invoke-Kotakas -Path ('/api/item-watches/' + $watchId) -Method DELETE -Session $userSession | Out-Null
    Ok 'Favori ve item alarmı kaldırma'

    $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds,1)
    Write-Title 'TEST SONUCU: BASARILI'
    Write-Host ("$passed kritik kontrol geçti. Süre: $elapsed saniye") -ForegroundColor Green
    Write-Host 'Not: Google giriş, e-posta gönderimi ve gerçek ödeme sağlayıcısı harici servis anahtarı gerektirdiği için bu yerel teste dahil değildir.' -ForegroundColor Yellow
    exit 0
}
catch {
    Write-Host ''
    Write-Host ('[HATA] ' + $_.Exception.Message) -ForegroundColor Red
    if (Test-Path $errPath) {
        Write-Host ''
        Write-Host 'Sunucu hata logunun son satırları:' -ForegroundColor Yellow
        Get-Content $errPath -Tail 30 -ErrorAction SilentlyContinue | Out-Host
    }
    Write-Host ''
    Write-Host ('Başarılı kontrol sayısı: ' + $passed) -ForegroundColor Yellow
    exit 1
}
finally {
    if ($null -ne $app) {
        try { if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue } } catch {}
    }
    if ($null -ne $oldEnv) {
        $env:ASPNETCORE_ENVIRONMENT = $oldEnv.ASPNETCORE_ENVIRONMENT
        $env:ASPNETCORE_URLS = $oldEnv.ASPNETCORE_URLS
        $env:Database__Provider = $oldEnv.Database__Provider
        $env:ConnectionStrings__Default = $oldEnv.ConnectionStrings__Default
        $env:KOTAKAS_ADMIN_EMAIL = $oldEnv.KOTAKAS_ADMIN_EMAIL
        $env:KOTAKAS_ADMIN_PASSWORD = $oldEnv.KOTAKAS_ADMIN_PASSWORD
    }
}
