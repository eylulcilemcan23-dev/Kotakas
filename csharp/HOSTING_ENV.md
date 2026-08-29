# KOTAKAS C# Hosting Environment Ayarları

Bu değerleri koda veya GitHub'a gerçek secret olarak yazmayın. Hosting panelindeki Environment Variables / Application Settings alanına girin.

## Ana domain

- `PublicBaseUrl=https://SENIN-DOMAININ`

E-posta doğrulama ve şifre yenileme bağlantıları bu domain ile oluşturulur.

## Google ile giriş

- `Authentication__Google__ClientId`
- `Authentication__Google__ClientSecret`

Google Cloud Console'da Authorized redirect URI:

`https://SENIN-DOMAININ/signin-google`

Client ID/Secret boşsa Google butonu otomatik gizlenir.

## E-posta doğrulama ve şifre yenileme

SMTP yapılandırıldığında yeni normal üyeler e-posta doğrulaması yapmadan giriş yapamaz. Google ile gelen doğrulanmış e-posta ayrıca bekletilmez.

- `Email__SmtpHost=smtp...`
- `Email__SmtpPort=587`
- `Email__SmtpUsername=...`
- `Email__SmtpPassword=SECRET`
- `Email__From=noreply@SENIN-DOMAININ`
- `Email__FromName=KOTAKAS`
- `Email__UseSsl=true`

SMTP boşsa geliştirme/test kurulumu kilitlenmez ve e-posta doğrulama zorunlu tutulmaz.

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

Canlı iyzico hesabı açılıp sandbox testi tamamlandıktan sonra canlı anahtarlar kullanılır:

- `Payments__BaseUrl=https://api.iyzipay.com`
- `Payments__ApiKey=LIVE_API_KEY`
- `Payments__SecretKey=LIVE_SECRET_KEY`

Callback yolu:

`https://SENIN-DOMAININ/api/payments/iyzico/callback`

Ödeme sağlayıcısı kapalı tutulacaksa:

- `Payments__Provider=disabled`

## Veritabanı ve yedek

Şu anki doğrulanmış sürüm SQLite kullanır:

`ConnectionStrings__Default=Data Source=App_Data/kotakas.db`

Hosting hesabının `App_Data` klasörüne yazma izni olmalıdır.

Uygulama SQLite kullanırken her 24 saatte otomatik backup alır. Veritabanı ve `wwwroot/uploads/requests` item görselleri tek ZIP içinde `App_Data/backups` altında tutulur. Son 14 otomatik yedek korunur. Bu klasör web root değildir ve internetten doğrudan servis edilmez.

Admin Owner/Tam Admin panelinden manuel yedek de oluşturabilir.

Harici PostgreSQL/SQL Server gibi üretim veritabanına geçildiğinde uygulama içi SQLite backup yerine hosting/veritabanı sağlayıcısının point-in-time/managed backup özelliği kullanılmalıdır.

## V11 güvenlik varsayımları

- Production ortamında auth cookie yalnız HTTPS üzerinden gönderilir.
- HSTS + HTTPS redirect aktiftir.
- CSRF/origin kontrolü vardır.
- API rate-limit aktiftir.
- Kritik finans/işlem endpointleri idempotency anahtarı ister.
- Kullanıcı cihaz oturumları ayrı takip edilir ve kullanıcı diğer cihazları kapatabilir.
- Admin yazma işlemleri audit log'a kaydedilir.
