param([switch]$SkipUpdate)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$repoRoot=Split-Path -Parent $PSScriptRoot
$webRoot=Join-Path $repoRoot 'csharp\Kotakas.Web'
$baseUrl='http://127.0.0.1:5099'
$dbPath=Join-Path $webRoot 'App_Data\kotakas-wallet-selftest.db'
$app=$null
function Invoke-Kotakas($Path,$Method='GET',$Body=$null,$Session=$null){
  $a=@{Uri=$baseUrl+$Path;Method=$Method;ErrorAction='Stop';TimeoutSec=20}
  if($Session){$a.WebSession=$Session}
  if($Method-ne'GET'){$a.Headers=@{'X-KOTAKAS-CSRF'='1';'Idempotency-Key'=[guid]::NewGuid().ToString('N')}}
  if($null-ne$Body){$a.ContentType='application/json; charset=utf-8';$a.Body=($Body|ConvertTo-Json -Depth 8 -Compress)}
  Invoke-RestMethod @a
}
function Login($Email,$Password){$s=New-Object Microsoft.PowerShell.Commands.WebRequestSession;Invoke-Kotakas '/api/login' 'POST' @{email=$Email;password=$Password} $s|Out-Null;return $s}
function Assert($Cond,$Msg){if(-not$Cond){throw $Msg}}
try{
  if(-not$SkipUpdate){Push-Location $repoRoot;try{git fetch origin csharp-rebuild|Out-Host;git checkout csharp-rebuild|Out-Host;git pull --ff-only origin csharp-rebuild|Out-Host}finally{Pop-Location}}
  Remove-Item $dbPath,($dbPath+'-shm'),($dbPath+'-wal') -Force -ErrorAction SilentlyContinue
  $env:ASPNETCORE_ENVIRONMENT='Development';$env:ASPNETCORE_URLS=$baseUrl;$env:Database__Provider='sqlite';$env:ConnectionStrings__Default='Data Source=App_Data/kotakas-wallet-selftest.db';$env:KOTAKAS_ADMIN_EMAIL='wallet-admin@kotakas.local';$env:KOTAKAS_ADMIN_PASSWORD='WalletAdmin123'
  $app=Start-Process dotnet -ArgumentList @('run','--project','Kotakas.Web.csproj','--no-launch-profile') -WorkingDirectory $webRoot -PassThru -WindowStyle Hidden
  $ready=$false;for($i=0;$i-lt120;$i++){try{Invoke-RestMethod ($baseUrl+'/api/health') -TimeoutSec 2|Out-Null;$ready=$true;break}catch{Start-Sleep -Milliseconds 500}}
  Assert $ready 'Sunucu açılmadı.'
  $admin=Login 'wallet-admin@kotakas.local' 'WalletAdmin123'
  $u=Invoke-Kotakas '/api/register' 'POST' @{displayName='Bakiye Alıcı';email='wallet-user@kotakas.local';password='WalletUser123'}
  $t=Invoke-Kotakas '/api/register' 'POST' @{displayName='Bakiye Pazarcı';email='wallet-trader@kotakas.local';password='WalletTrader123'}
  Invoke-Kotakas ('/api/admin/users/'+$t.user.id+'/role') 'PATCH' @{role='trader'} $admin|Out-Null
  $user=Login 'wallet-user@kotakas.local' 'WalletUser123';$trader=Login 'wallet-trader@kotakas.local' 'WalletTrader123'
  Invoke-Kotakas '/api/admin/settings' 'PUT' @{normalCommissionPercent=4;traderCommissionPercent=3;paidListingTry=25;gbTryRate=100} $admin|Out-Null
  $topup=Invoke-Kotakas '/api/account/test-wallet-topup' 'POST' @{amountTry=5000} $user
  Assert ($topup.testMode-eq$true) 'Yerel sanal bakiye endpointi test modunda dönmedi.'
  $before=Invoke-Kotakas '/api/wallet' 'GET' $null $user;Assert ([decimal]$before.balanceTry-eq5000) 'Alıcı başlangıç bakiyesi 5000 değil.'
  $listing=Invoke-Kotakas '/api/listings' 'POST' @{itemName='Wallet Test Raptor +7';serverCode='ZERO';priceGb=10;stock=1} $trader
  $buy=Invoke-Kotakas ('/api/listings/'+$listing.listing.id+'/buy') 'POST' @{quantity=1} $user
  Assert ([long]$buy.deal.id-gt0) 'Direkt satın alma deal oluşturmadı.'
  $afterBuy=Invoke-Kotakas '/api/wallet' 'GET' $null $user;Assert ([decimal]$afterBuy.balanceTry-eq4000) ('Alıcı bakiye 4000 olmalı, mevcut: '+$afterBuy.balanceTry)
  $traderBefore=Invoke-Kotakas '/api/wallet' 'GET' $null $trader;Assert ([decimal]$traderBefore.balanceTry-eq0) 'Pazarcı para teslim onayından önce almamalı.'
  Invoke-Kotakas ('/api/deals/'+$buy.deal.id+'/delivered') 'POST' $null $trader|Out-Null
  Invoke-Kotakas ('/api/deals/'+$buy.deal.id+'/confirm') 'POST' $null $user|Out-Null
  $traderAfter=Invoke-Kotakas '/api/wallet' 'GET' $null $trader;Assert ([decimal]$traderAfter.balanceTry-eq970) ('Pazarcı net 970 olmalı, mevcut: '+$traderAfter.balanceTry)

  $withdraw=Invoke-Kotakas '/api/account/test-wallet-withdraw' 'POST' @{amountTry=500} $user
  Assert ($withdraw.testMode-eq$true) 'Yerel sanal çekim endpointi test modunda dönmedi.'
  Assert ([decimal]$withdraw.balanceTry-eq3500) ('Sanal çekim sonrası alıcı bakiye 3500 olmalı, mevcut: '+$withdraw.balanceTry)
  $history=Invoke-Kotakas '/api/wallet/history?take=20' 'GET' $null $user
  $withdrawEntry=@($history.entries|Where-Object{$_.type-eq'local_test_withdrawal'})|Select-Object -First 1
  Assert ($null-ne$withdrawEntry) 'Sanal çekim ledger kaydı bulunamadı.'
  Assert ([decimal]$withdrawEntry.amountTry-eq-500) 'Sanal çekim ledger tutarı -500 değil.'

  Write-Host '[OK] Bakiye Ekle yerel test modu çalışıyor' -ForegroundColor Green
  Write-Host '[OK] Direkt ilan satın alma çalışıyor' -ForegroundColor Green
  Write-Host '[OK] Kullanıcı 5000 -> 4000 TL' -ForegroundColor Green
  Write-Host '[OK] Emanet öncesi pazarcı: 0 TL' -ForegroundColor Green
  Write-Host '[OK] Teslim+onay sonrası pazarcı: 970 TL (%3 komisyon)' -ForegroundColor Green
  Write-Host '[OK] Sanal bakiye çekim 4000 -> 3500 TL ve ledger kaydı oluştu' -ForegroundColor Green
  Write-Host 'TEST SONUCU: BASARILI' -ForegroundColor Green
}finally{if($app -and -not$app.HasExited){Stop-Process -Id $app.Id -Force -ErrorAction SilentlyContinue}}
