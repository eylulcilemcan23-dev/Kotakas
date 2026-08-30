param([switch]$SkipUpdate)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$repoRoot=Split-Path -Parent $PSScriptRoot
$webRoot=Join-Path $repoRoot 'csharp\Kotakas.Web'
$baseUrl='http://127.0.0.1:5100'
$dbPath=Join-Path $webRoot 'App_Data\kotakas-urgent-selftest.db'
$app=$null

function Invoke-Kotakas($Path,$Method='GET',$Body=$null,$Session=$null){
  $a=@{Uri=$baseUrl+$Path;Method=$Method;ErrorAction='Stop';TimeoutSec=20}
  if($Session){$a.WebSession=$Session}
  if($Method-ne'GET'){$a.Headers=@{'X-KOTAKAS-CSRF'='1';'Idempotency-Key'=[guid]::NewGuid().ToString('N')}}
  if($null-ne$Body){$a.ContentType='application/json; charset=utf-8';$a.Body=($Body|ConvertTo-Json -Depth 10 -Compress)}
  Invoke-RestMethod @a
}
function Login($Email,$Password){
  $s=New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-Kotakas '/api/login' 'POST' @{email=$Email;password=$Password} $s|Out-Null
  return $s
}
function Assert($Cond,$Msg){if(-not$Cond){throw $Msg}}

try{
  if(-not$SkipUpdate){
    Push-Location $repoRoot
    try{git fetch origin csharp-rebuild|Out-Host;git checkout csharp-rebuild|Out-Host;git pull --ff-only origin csharp-rebuild|Out-Host}
    finally{Pop-Location}
  }

  Remove-Item $dbPath,($dbPath+'-shm'),($dbPath+'-wal') -Force -ErrorAction SilentlyContinue
  $env:ASPNETCORE_ENVIRONMENT='Development'
  $env:ASPNETCORE_URLS=$baseUrl
  $env:Database__Provider='sqlite'
  $env:ConnectionStrings__Default='Data Source=App_Data/kotakas-urgent-selftest.db'
  $env:KOTAKAS_ADMIN_EMAIL='urgent-admin@kotakas.local'
  $env:KOTAKAS_ADMIN_PASSWORD='UrgentAdmin123'

  $app=Start-Process dotnet -ArgumentList @('run','--project','Kotakas.Web.csproj','--no-launch-profile') -WorkingDirectory $webRoot -PassThru -WindowStyle Hidden
  $ready=$false
  for($i=0;$i-lt120;$i++){
    try{Invoke-RestMethod ($baseUrl+'/api/health') -TimeoutSec 2|Out-Null;$ready=$true;break}catch{Start-Sleep -Milliseconds 500}
  }
  Assert $ready 'Sunucu açılmadı.'

  $admin=Login 'urgent-admin@kotakas.local' 'UrgentAdmin123'
  $registered=Invoke-Kotakas '/api/register' 'POST' @{displayName='Acil Satıcı';email='urgent-user@kotakas.local';password='UrgentUser123'}
  Assert ([string]$registered.user.id).Length -gt 5 'Acil satış test kullanıcısı oluşmadı.'
  $user=Login 'urgent-user@kotakas.local' 'UrgentUser123'

  $created=Invoke-Kotakas '/api/urgent-sales' 'POST' @{itemName='Iron Bow +8';serverCode='ZERO';quantity=1;askGb=7;note='Hızlı satış testi'} $user
  $saleId=[long]$created.sale.id
  Assert ($saleId-gt0) 'Acil satış talebi oluşmadı.'

  $queue=Invoke-Kotakas '/api/admin/urgent-sales/' 'GET' $null $admin
  $adminRow=$queue.sales|Where-Object {[long]$_.sale.id-eq$saleId}|Select-Object -First 1
  Assert ($null-ne$adminRow) 'Acil satış admin kuyruğuna düşmedi.'
  Assert ([decimal]$adminRow.sale.askGb-eq7) 'Kullanıcı beklenti GB değeri admin kuyruğunda yanlış.'

  Invoke-Kotakas ('/api/admin/urgent-sales/'+$saleId+'/offer') 'POST' @{priceGb=6.5} $admin|Out-Null
  $mine=Invoke-Kotakas '/api/urgent-sales/mine' 'GET' $null $user
  $userRow=$mine.sales|Where-Object {[long]$_.id-eq$saleId}|Select-Object -First 1
  Assert ([decimal]$userRow.latestOfferGb-eq6.5) 'Admin GB teklifi kullanıcıya ulaşmadı.'

  Invoke-Kotakas ('/api/urgent-sales/'+$saleId+'/decision') 'POST' @{action='accept'} $user|Out-Null
  Invoke-Kotakas ('/api/urgent-sales/'+$saleId+'/message') 'POST' @{code='HAZIRIM'} $user|Out-Null
  Invoke-Kotakas ('/api/admin/urgent-sales/'+$saleId+'/message') 'POST' @{code='SERVER1_GEL'} $admin|Out-Null

  $afterMessages=Invoke-Kotakas '/api/admin/urgent-sales/' 'GET' $null $admin
  $messageRow=$afterMessages.sales|Where-Object {[long]$_.sale.id-eq$saleId}|Select-Object -First 1
  $texts=@($messageRow.sale.replies|ForEach-Object {$_.message}) -join ' | '
  Assert ($texts -match '6.5 GB') 'Teklif mesajı işlem geçmişinde yok.'
  Assert ($texts -match 'Hazırım') 'Kullanıcının hazır mesajı işlem geçmişinde yok.'
  Assert ($texts -match 'ZERO 1\. sunucuya gel') 'Admin server hazır mesajı doğru üretilmedi.'

  Invoke-Kotakas ('/api/admin/urgent-sales/'+$saleId+'/complete') 'POST' $null $admin|Out-Null
  $final=Invoke-Kotakas '/api/urgent-sales/mine' 'GET' $null $user
  $finalRow=$final.sales|Where-Object {[long]$_.id-eq$saleId}|Select-Object -First 1
  Assert ($finalRow.status-eq'closed') 'Acil item alımı tamamlanınca kapanmadı.'

  $support=Invoke-Kotakas '/api/support/mine' 'GET' $null $user
  Assert (@($support.tickets).Count-eq0) 'Acil satış kaydı normal destek kuyruğuna karıştı.'

  Write-Host '[OK] Kullanıcı acil item talebi oluşturuyor' -ForegroundColor Green
  Write-Host '[OK] Talep yalnız admin acil alım kuyruğuna düşüyor' -ForegroundColor Green
  Write-Host '[OK] Admin GB fiyatı veriyor, kullanıcı kabul ediyor' -ForegroundColor Green
  Write-Host '[OK] Hazır mesajlar iki yönlü çalışıyor' -ForegroundColor Green
  Write-Host '[OK] Admin işlemi tamamlayıp kaydı kapatıyor' -ForegroundColor Green
  Write-Host '[OK] Acil kayıt normal destek kuyruğuna karışmıyor' -ForegroundColor Green
  Write-Host 'TEST SONUCU: BASARILI' -ForegroundColor Green
}
finally{
  if($app -and -not$app.HasExited){Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue}
}
