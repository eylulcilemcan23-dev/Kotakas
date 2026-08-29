# PayTR staging entegrasyonu

Bu dosya kaynak migrasyon dalı içindir. Production ödeme yazımı varsayılan olarak kapalıdır.

## Gerekli Railway staging değişkenleri

- `PAYMENT_PROVIDER=paytr`
- `PAYMENT_WRITES_ENABLED=true`
- `FINANCE_WRITES_ENABLED=true`
- `PAYMENT_PUBLIC_BASE_URL=https://<staging-domain>`
- `PAYTR_MERCHANT_ID=<PayTR mağaza no>`
- `PAYTR_MERCHANT_KEY=<secret>`
- `PAYTR_MERCHANT_SALT=<secret>`
- `PAYTR_TEST_MODE=true`
- `PAYTR_DEBUG_ON=true`

PayTR mağaza panelindeki Bildirim URL değeri:

`https://<staging-domain>/api/payments/paytr/callback`

Başarılı/başarısız yönlendirme sayfası ödeme onayı sayılmaz. Bakiye yalnız PayTR sunucusundan gelen ve HMAC doğrulamasını geçen callback sonrasında yüklenir.

## Para çekme

Standart PayTR iFrame checkout yalnız bakiye yükleme için kullanılır. Genel cüzdan bakiyesini banka hesabına nakit çekme akışı production'da açılmamalıdır. Pazarcı/satıcı ödemeleri için PayTR Marketplace / Platform Transfer ürünü ve gerekli sözleşme-KYC aktivasyonu doğrulanmadan `WITHDRAWAL_WRITES_ENABLED` açılmaz.

KOTAKAS kart, CVV veya PayTR merchant secret değerlerini istemciye göndermez. Checkout kart alanları PayTR iFrame içinde kalır.
