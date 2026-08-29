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

## Ödeme sağlayıcısı hazırlığı

Şimdilik güvenli varsayılan:

- `Payments__Provider=disabled`

Gerçek sağlayıcı bağlandığında:

- `Payments__Provider=...`
- `Payments__BaseUrl=...`
- `Payments__ApiKey=...`
- `Payments__SecretKey=...`
- `Payments__CallbackBaseUrl=https://SENIN-DOMAININ`

Anahtarlar tamamlanana kadar gerçek ödeme başlatma özelliği açılmamalıdır.

## Veritabanı

Varsayılan test kurulumu SQLite kullanır:

`ConnectionStrings__Default=Data Source=App_Data/kotakas.db`

Hosting hesabının `App_Data` klasörüne yazma izni olmalıdır.
