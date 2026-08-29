# KOTAKAS

KOTAKAS, Knight Online item/GB pazarı için geliştirilen güvenli işlem ve pazar altyapısıdır.

## Kaynak mimarisi

- Node.js 20+
- Express 5
- Socket.IO
- PostgreSQL
- JWT tabanlı oturum
- Rol/yetki: `admin_owner`, `admin_full`, `admin_limited`, `trader`, `user`

## Güvenli işlem

Alıcı bakiyesi doğrudan satıcıya gitmez. Satın alma sırasında tutar blokeye alınır; teslimat onayında komisyon ayrılır ve satıcının net bakiyesi aktarılır. İhtilaf açıldığında normal kullanıcı serbest bırakma yapamaz; finans yetkili admin iade veya aktarım kararı verebilir.

## Pazar ve ürün detay

- İlan oluşturma / listeleme / iptal
- Sunucu tarafında fiyat ve satıcı doğrulaması
- Aynı ilanın eşzamanlı iki alıcıya satılmasını engelleyen kilit
- `/item.html?id=<listingId>` ürün detay ekranı
- Item katalog metadata modeli
- Gerçek fiyat geçmişi ve teklif istatistikleri için staging tabloları
- Veri yokken sahte grafik üretilmez

## Bildirimler

- Kalıcı kullanıcı bildirim merkezi
- Socket.IO ile anlık bildirimler
- Okundu / tümünü okundu akışı
- Kategori bazlı bildirim tercihleri: mesajlar, pazar/teklifler, ihtilaflar ve sistem
- Para, iade ve güvenlik bildirimleri zorunludur ve kullanıcı tarafından kapatılamaz

## Migration güvenliği

`migrations/` altındaki yeni tablolar staging doğrulaması içindir. Production veritabanında otomatik migration çalıştırılmaz. Özellikle aşağıdaki migrationlar kaynak dalında STAGING ONLY kabul edilir:

- `002_disputes_audit.sql`
- `003_dispute_messages_admin_notifications.sql`
- `004_user_notifications.sql`
- `005_item_catalog_price_history_offers.sql`
- `006_notification_preferences.sql`

## Çalıştırma

```bash
npm install
npm run check
npm test
npm start
```

Gerekli değişkenler için `.env.example` dosyasına bakın.

## Durum

Bu kaynak dalı canlı Railway servisini otomatik olarak değiştirmez. Canlıya geçişten önce staging PostgreSQL şema uyumluluğu, mobil/desktop smoke test ve kontrollü deployment tamamlanmalıdır.
