# KOTAKAS Production Cutover / Rollback Planı

Bu belge `source-migration` dalının production'a alınması için zorunlu son kontrol sırasıdır. Canlı Railway ve production PostgreSQL üzerinde işlemler yalnız açık onayla yapılır.

## 1. Yayın öncesi blokajlar

Aşağıdakiler çözülmeden production deploy yapılmaz:

- PR CI tamamen yeşil olmalı.
- `node scripts/release-readiness.js` PASS olmalı.
- Gerçek production credential kontrolü `KOTAKAS_RELEASE_MODE=production` ile PASS olmalı.
- Production DB yedeği alınmış ve geri yükleme yolu doğrulanmış olmalı.
- Son çalışan Railway deployment ID kayıt altına alınmalı.
- Pazarcı komisyon oranı açıkça seçilip `TRADER_COMMISSION_RATE` olarak tanımlanmalı.
- Google, e-posta ve PayTR credential setleri kullanılacaksa eksiksiz ve yalnız Railway Variables içinde tutulmalı.
- `WITHDRAWAL_WRITES_ENABLED=false` kalmalı; doğrulanmış payout / Platform Transfer adapteri olmadan para çekme açılmaz.

## 2. Mevcut Railway gerçeği

29 Ağustos 2026 kontrolünde `kotakas-live` servisinin son denenen deployları FAILED durumundaydı; daha eski çalışan deployment `53727e2f-acd0-48ce-9f53-4a0152e27bf8` SUCCESS olarak kayıtlıydı. Bu ID sadece mevcut rollback referansıdır; cutover gününde Railway tekrar kontrol edilmeden körlemesine kullanılmaz.

Production servisi eski `node:20-alpine`/hot-patch düzeninden geliyor. Kaynak dalı hazır olmadan mevcut çalışan deployment yeniden başlatılmaz veya değiştirilmeye çalışılmaz.

## 3. Yedek

Cutover başlamadan önce production veritabanının dışarı alınmış bir PostgreSQL yedeği bulunmalı. Secret hiçbir zaman GitHub'a yazılmaz.

Önerilen iki çıktı:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file="kotakas-pre-cutover.dump"
pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl --file="kotakas-pre-cutover-schema.sql"
```

Yedek alındıktan sonra dosyanın boş olmadığı doğrulanır ve mümkünse ayrı/geçici PostgreSQL üzerinde `pg_restore --list` ve test restore yapılır.

## 4. Migration sırası

Kaynak dalındaki migration dizisi `002`–`013` arası kesintisizdir. Production migration sırasında ilk SQL hatasında süreç durmalıdır:

```bash
for file in migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file" || exit 1
done
```

Bu komut production üzerinde yalnız yedek doğrulandıktan sonra ve açık cutover onayıyla çalıştırılır. Migration sonrası uygulama açılmadan önce tablo/constraint uyumluluğu ve `/api/health` kontrol edilir.

## 5. Feature flag açılış sırası

Her şeyi tek seferde açmak yerine kontrollü ilerlenir:

1. Kaynak uygulama deploy edilir; yeni write flagleri önce kapalı tutulur.
2. `/api/health`, login sayfası, market, support, admin route smoke kontrol edilir.
3. Session/login ve hesap yazımları açılır.
4. Marketplace + finance + escrow birlikte doğrulanır; Pazarcı komisyonu seçilmiş olmalıdır.
5. Teklif ve takas akışları doğrulanır.
6. PayTR credentialları doğrulandıktan sonra ödeme yazımları açılır; `PAYTR_TEST_MODE=false` yalnız canlı PayTR hesabında kullanılır.
7. Google OAuth / Resend ayrı ayrı doğrulanır.
8. Para çekme kapalı kalır.

## 6. Zorunlu production readiness komutu

Production Railway Variables ile, secretları ekrana dökmeden:

```bash
KOTAKAS_RELEASE_MODE=production \
KOTAKAS_BACKUP_CONFIRMED=1 \
KOTAKAS_ROLLBACK_DEPLOYMENT_ID="<son-calisan-deployment-id>" \
node scripts/release-readiness.js
```

Komut FAIL verirse deploy durdurulur.

## 7. Yayın sonrası smoke

- `/api/health` 200 ve DB `ok` olmalı.
- Ana sayfa, market, item detay, login/register, dashboard, trader ve admin sayfaları 200 olmalı.
- Yetkisiz wallet/admin API çağrıları 401/403 vermeli.
- Kullanıcı kayıt + login + logout denenmeli.
- Test ilanı oluşturma/iptal etme denenmeli.
- Test satın alma yalnız kontrollü küçük bakiye ile denenmeli.
- Teklif kabulü escrow'a blokelenmeli; satıcıya doğrudan geçmemeli.
- Takasta iki ilan reserved olmalı; çift teslim onayı olmadan completed olmamalı.
- PayTR success dönüş sayfası tek başına bakiye yazmamalı; callback doğrulanmalı.

## 8. Rollback tetikleyicileri

Aşağıdakilerden biri olursa yeni write flagleri derhal kapatılır ve rollback değerlendirilir:

- Login/session genelinde hata artışı.
- Wallet bakiyesi veya held/available toplamında tutarsızlık.
- Aynı ödeme callbackinin birden fazla kredi üretmesi.
- Aynı listingin birden fazla buyer/swap tarafından kullanılması.
- Migration sonrası DB constraint / query hataları.
- Admin yetki sızıntısı.
- PayTR imza doğrulama veya callback hataları.

Rollback sırası:

1. Finans/pazar/ödeme write flaglerini kapat.
2. Gerekirse uygulamayı kayıtlı son SUCCESS Railway deploymentına döndür.
3. DB'yi otomatik geri döndürme; önce migration etkisini ve yeni yazılan veriyi incele.
4. Veri bozulması varsa doğrulanmış pre-cutover dump üzerinden kontrollü restore planı uygula.
5. Olay nedeni bulunmadan write flaglerini tekrar açma.

## 9. Final onay

PR `Draft` durumundan ancak tüm kontroller tamamlandığında çıkarılır. `main` merge ve Railway production deploy ayrı iki kontrollü adımdır; merge olmak tek başına production deploy onayı anlamına gelmez.
