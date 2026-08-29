# KOTAKAS C# V12 Hosting / Production Ayarları

Gerçek secret değerlerini koda veya GitHub'a yazmayın. Hosting panelindeki Environment Variables / Application Settings alanına girin.

## Ana domain

- `PublicBaseUrl=https://SENIN-DOMAININ`

E-posta doğrulama ve şifre yenileme bağlantıları bu domain ile oluşturulur.

## Veritabanı

### Geliştirme / küçük test: SQLite

- `Database__Provider=sqlite`
- `ConnectionStrings__Default=Data Source=App_Data/kotakas.db`

SQLite modunda App_Data klasörünün yazılabilir olması gerekir. Uygulama günlük yerel ZIP yedeği alabilir.

### Üretim: PostgreSQL

- `Database__Provider=postgres`
- `ConnectionStrings__Postgres=Host=...;Port=5432;Database=kotakas;Username=...;Password=...;SSL Mode=Require`

Gerçek bağlantı dizesi sağlayıcının verdiği değere göre kullanılmalıdır. KOTAKAS PostgreSQL modunda Npgsql connection pooling ve geçici bağlantı hataları için retry kullanır.

`/api/health` canlıda şu bilgileri göstermelidir:

- `database: PostgreSQL`
- `schemaVersion: 12`

PostgreSQL modunda kritik satın alma/escrow işlemleri DB seviyesinde advisory lock kullanır; birden fazla uygulama instance'ı aynı kaynağı eşzamanlı değiştirmeye çalışsa da işlemler sıraya alınır.

## SQLite → PostgreSQL veri taşıma

V12 artifact'lerinde ayrı `KOTAKAS_CSHARP_V12_MIGRATOR` aracı bulunur. Bu araç kullanıcı/rol/Identity password hash/Google login, bakiye, ledger, ilan, teklif, anlaşma, ödeme kaydı, yorum, favori, item alarmı, destek, şikâyet ve audit kayıtlarını taşır.

Önce dry-run:

```bash
dotnet Kotakas.Migrator.dll \
  --sqlite "Data Source=/ESKI/App_Data/kotakas.db" \
  --postgres "Host=...;Database=kotakas;Username=...;Password=..."
```

Gerçek taşıma yalnız boş PostgreSQL hedefe yapılır:

```bash
dotnet Kotakas.Migrator.dll \
  --sqlite "Data Source=/ESKI/App_Data/kotakas.db" \
  --postgres "Host=...;Database=kotakas;Username=...;Password=..." \
  --execute
```

Item görselleri de aynı anda taşınacaksa:

```bash
--uploads-source "/ESKI/wwwroot/uploads/requests" \
--uploads-target "/YENI/wwwroot/uploads/requests"
```

Migrator hedef PostgreSQL boş değilse işlemi reddeder. Taşıma sonunda kullanıcı/ilan/anlaşma kayıt adetleri ile toplam kullanıcı bakiyesi, aktif escrow ve tamamlanan işlem hacmi karşılaştırılır. Eşleşmezse DB transaction geri alınır. Aktif cihaz oturumları ve idempotency kayıtları bilerek taşınmaz; canlı geçişten sonra kullanıcıların yeniden oturum açması daha güvenlidir.

## PostgreSQL yedekleme

PostgreSQL modunda KOTAKAS yerel SQLite `.db` yedeği üretmez. Üretimde sağlayıcının şu özelliklerinden en az biri açılmalıdır:

- günlük managed snapshot,
- point-in-time recovery,
- düzenli `pg_dump` + ayrı güvenli storage.

`wwwroot/uploads/requests` görselleri de ayrıca yedeklenmelidir. Admin > Yedekler ekranı kullanılan provider'ı gösterir ve PostgreSQL'de yerel yedek butonunu kapatır.

## Google ile giriş

- `Authentication__Google__ClientId`
- `Authentication__Google__ClientSecret`

Google Cloud Console Authorized redirect URI:

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

SMTP boşsa geliştirme/test kurulumu kilitlenmez.

## Otomatik 1 GB = TL kuru

- `MarketRateFeed__Enabled=true`
- `MarketRateFeed__Url=https://...`
- `MarketRateFeed__JsonProperty=tryPerGb`
- `MarketRateFeed__IntervalMinutes=15`

JSON örneği:

```json
{ "tryPerGb": 123.45 }
```

Kaynak API key istiyorsa:

- `MarketRateFeed__ApiKeyHeader=X-Api-Key`
- `MarketRateFeed__ApiKey=SECRET`

Kaynak hata verirse son başarılı `gb_try_rate` korunur ve admin manuel kur girebilir.

## iyzico ücretli ilan hakkı

Ödeme genel kullanıcı bakiyesi yüklemek için değil, aylık ücretsiz satış talebi bittikten sonraki ücretli ilan hakkı içindir.

Sandbox:

- `Payments__Provider=iyzico`
- `Payments__BaseUrl=https://sandbox-api.iyzipay.com`
- `Payments__ApiKey=SANDBOX_API_KEY`
- `Payments__SecretKey=SANDBOX_SECRET_KEY`
- `Payments__CallbackBaseUrl=https://SENIN-DOMAININ`

Canlı:

- `Payments__BaseUrl=https://api.iyzipay.com`
- canlı API key / secret

Callback:

`https://SENIN-DOMAININ/api/payments/iyzico/callback`

## V12 güvenlik varsayımları

- Production auth cookie yalnız HTTPS.
- HSTS + HTTPS redirect.
- CSRF/origin kontrolü.
- API rate-limit.
- Kritik işlemlerde idempotency.
- SQLite tek instance için local işlem kilidi; PostgreSQL için DB-wide advisory lock.
- Kullanıcı cihaz oturum yönetimi.
- Admin audit log.
- PostgreSQL için managed backup zorunluluğu açıkça gösterilir.
