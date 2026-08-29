# KOTAKAS Faz 18 - Staging Rehearsal

Bu dosya `source-migration` dalındaki STAGING ONLY migration zincirinin nasıl doğrulandığını açıklar.

## CI rehearsal

`npm run staging:rehearsal` yalnız şu iki koşul birlikte sağlanırsa çalışır:

- `NODE_ENV=test`
- `KOTAKAS_STAGING_REHEARSAL=1`

Script izole CI PostgreSQL veritabanındaki `public` şemasını silip yeniden kurduğu için gerçek staging veya production veritabanında çalıştırılmamalıdır.

Rehearsal sırası:

1. Eski kaynak uygulamanın ihtiyaç duyduğu temel `users`, `wallets`, `listings`, `orders`, `wallet_transactions`, `commissions` şeması oluşturulur.
2. `migrations/002_...sql` ile `migrations/012_...sql` arasındaki bütün migrationlar eksiksiz ve sıra atlamadan uygulanır.
3. Marketplace, finance, offer, swap, item catalog ve payment funding compatibility denetimleri `ready=true` vermek zorundadır.
4. `IB8` katalog aramasının `Iron Bow +8` sonucuna çözülmesi doğrulanır.
5. Sandbox ödeme olayı ile bakiye yalnız bir kez yüklenir; duplicate event ikinci kredi oluşturamaz.
6. Pazarcı ilanına parçalı teklif oluşturulur, teklif kabul edilerek escrow tutulur ve teslim sonrası satıcı neti + KOTAKAS komisyonu yazılır.
7. Ayrı bir ilanda doğrudan satın alma -> escrow -> release zinciri doğrulanır.
8. Aynı serverdaki iki ilan için takas teklifi -> kabul -> iki taraflı teslim onayı -> `swapped` akışı doğrulanır.
9. Son bakiyeler ve toplam komisyon tutarı invariant olarak kontrol edilir.

## Gerçek Railway staging

Gerçek staging ortamında bu destructive rehearsal scripti kullanılmaz. Bunun yerine boş/ayrı bir staging PostgreSQL servisine migrationlar 002-012 sırayla uygulanır ve uygulama `source-migration` dalından deploy edilir.

Production güvenlik kuralı:

- `kotakas-live` ve production PostgreSQL bu Faz 18 çalışması sırasında değiştirilmez.
- Önce staging schema compatibility kontrol edilir.
- PayTR merchant credential yalnız Railway staging secret/variable olarak eklenir; GitHub'a yazılmaz.
- `PAYMENT_WRITES_ENABLED`, `FINANCE_WRITES_ENABLED`, `MARKET_WRITES_ENABLED`, `ESCROW_API_ENABLED`, `SWAP_WRITES_ENABLED` ancak staging test planı sırasında kontrollü açılır.
- PayTR test ödeme doğrulaması gerçek merchant test credential gerektirir; credential yokken canlı ödeme başarısı iddia edilmez.
