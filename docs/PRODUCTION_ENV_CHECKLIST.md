# KOTAKAS Production Environment Checklist

Bu dosya secret içermez. Yalnızca canlıya geçişte hangi değişkenlerin kontrol edileceğini listeler.

## Zorunlu çekirdek

- `NODE_ENV=production`
- `DATABASE_URL` Railway Postgres bağlantısı
- `JWT_SECRET` en az 32 karakter
- `APP_PUBLIC_BASE_URL=https://<canli-domain>`
- `KOTAKAS_BACKUP_CONFIRMED=1` yalnız doğrulanmış DB yedeği alındıktan sonra
- `KOTAKAS_ROLLBACK_DEPLOYMENT_ID=<son çalışan deployment id>`

## İlk güvenli açılış

İlk source cutover sırasında aşağıdaki yazma flagleri kapalı başlatılmalı ve smoke testten sonra kontrollü açılmalıdır:

- `USER_WRITES_ENABLED=false`
- `REGISTRATION_ENABLED=false`
- `PASSWORD_RESET_ENABLED=false`
- `SUPPORT_WRITES_ENABLED=false`
- `FINANCE_WRITES_ENABLED=false`
- `PAYMENT_WRITES_ENABLED=false`
- `WITHDRAWAL_WRITES_ENABLED=false`
- `ESCROW_API_ENABLED=false`
- `DIRECT_ESCROW_ENABLED=false`
- `MARKET_WRITES_ENABLED=false`
- `SWAP_WRITES_ENABLED=false`
- `DISPUTE_WRITES_ENABLED=false`
- `COMMUNICATION_WRITES_ENABLED=false`
- `AUDIT_LOG_ENABLED=false`
- `GOOGLE_AUTO_REGISTER_ENABLED=false`

## Pazaryeri açılırken

- Onaylanan Pazarcı komisyon oranı: `TRADER_COMMISSION_RATE=0.03` (%3).
- 1.000 TL tamamlanmış Pazarcı satışında komisyon 30 TL, satıcı neti 970 TL olur.
- `FINANCE_WRITES_ENABLED=true`
- `ESCROW_API_ENABLED=true`
- `MARKET_WRITES_ENABLED=true`
- Takas açılacaksa ayrıca `SWAP_WRITES_ENABLED=true`
- İhtilaf/iletişim açılacaksa ilgili flagler ayrı ayrı açılmalı.

Normal kullanıcı ilan kotası için `NORMAL_USER_MONTHLY_LISTING_LIMIT` bilinçli seçilmelidir.

## PayTR açılacaksa

- `PAYMENT_PROVIDER=paytr`
- `PAYTR_MERCHANT_ID`
- `PAYTR_MERCHANT_KEY`
- `PAYTR_MERCHANT_SALT`
- `PAYMENT_PUBLIC_BASE_URL=https://<canli-domain>`
- Gerçek canlı ödeme sırasında `PAYTR_TEST_MODE=false`
- Sonra `PAYMENT_WRITES_ENABLED=true`

`WITHDRAWAL_WRITES_ENABLED=false` kalmalıdır. Satıcı/pazarcı payout için doğrulanmış Platform Transfer/payout adapteri henüz yoktur.

## Google giriş açılacaksa

Aşağıdaki üçü birlikte tanımlanmalı; kısmi set bırakılmamalıdır:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://<canli-domain>/auth/google/callback`

İlk testlerde `GOOGLE_AUTO_REGISTER_ENABLED=false` bırakılabilir.

## Şifre sıfırlama e-postası açılacaksa

- `PASSWORD_RESET_SECRET` en az 32 karakter
- `EMAIL_PROVIDER=resend`
- `EMAIL_API_KEY`
- `EMAIL_FROM`
- `PASSWORD_RESET_ENABLED=true`
- `USER_WRITES_ENABLED=true`

## Son komut

Canlıya geçmeden hemen önce gerçek Railway değişkenleriyle:

```bash
KOTAKAS_RELEASE_MODE=production npm run release:check
```

Komut FAIL verirse production cutover durdurulmalıdır.

## Rollback referansı

29 Ağustos 2026 incelemesinde bilinen son başarılı eski Railway deployment referansı:

`53727e2f-acd0-48ce-9f53-4a0152e27bf8`

Cutover anında bu değer yeniden kontrol edilmeli; daha yeni başarılı bir deployment varsa rollback referansı onunla değiştirilmelidir.
