# KOTAKAS C# Hosting Environment Ayarları

Bu değerleri koda veya GitHub'a gerçek secret olarak yazmayın. Hosting panelindeki Environment Variables / Application Settings alanına girin.

## Google ile giriş

- `Authentication__Google__ClientId`
- `Authentication__Google__ClientSecret`

Google Cloud Console'da Authorized redirect URI:

`https://SENIN-DOMAININ/signin-google`

Örnek: `https://kotakas.com/signin-google`

Client ID/Secret boşsa Google butonu otomatik gizlenir.

## Otomatik 1 GB = TL kuru

- `MarketRateFeed__Enabled=true`
- `MarketRateFeed__Url=https://...`
- `MarketRateFeed__JsonProperty=tryPerGb`
- `MarketRateFeed__IntervalMinutes=15`

JSON örneği:

```json
{ "tryPerGb": 123.45 }
```

İç içe JSON için `MarketRateFeed__JsonProperty=data.tryPerGb` gibi noktalı yol kullanılabilir.

Kaynak API key istiyorsa:

- `MarketRateFeed__ApiKeyHeader=X-Api-Key`
- `MarketRateFeed__ApiKey=SECRET`

Otomatik kaynak hata verirse son başarılı `gb_try_rate` korunur; admin manuel kur girmeye devam edebilir.

## iyzico ile ücretli ilan hakkı

Ödeme sistemi genel KOTAKAS bakiyesi yüklemek için değil, aylık ücretsiz satış talebi hakkı bittikten sonra **ücretli ilan hakkı satın almak** için hazırlanmıştır.

Önce sandbox ile test edin:

- `Payments__Provider=iyzico`
- `Payments__BaseUrl=https://sandbox-api.iyzipay.com`
- `Payments__ApiKey=SANDBOX_API_KEY`
- `Payments__SecretKey=SANDBOX_SECRET_KEY`
- `Payments__CallbackBaseUrl=https://SENIN-DOMAININ`

Canlı iyzico hesabı açılıp sandbox testi tamamlandıktan sonra yalnız BaseUrl ve canlı anahtarlar değiştirilir:

- `Payments__BaseUrl=https://api.iyzipay.com`
- `Payments__ApiKey=LIVE_API_KEY`
- `Payments__SecretKey=LIVE_SECRET_KEY`

Callback yolu uygulama tarafından otomatik olarak şu şekilde oluşturulur:

`https://SENIN-DOMAININ/api/payments/iyzico/callback`

Ödeme sağlayıcısı kapalı tutulacaksa:

- `Payments__Provider=disabled`

API key/secret, BaseUrl veya CallbackBaseUrl eksikse kartla ödeme butonu kullanıcıya aktif edilmez.

## Veritabanı

Varsayılan test kurulumu SQLite kullanır:

`ConnectionStrings__Default=Data Source=App_Data/kotakas.db`

Hosting hesabının `App_Data` klasörüne yazma izni olmalıdır.
