# KOTAKAS Faz 21 — Railway Kaynak Geçişi

Bu branch canlı production'u değiştirmez. Amaç, mevcut Railway hot-patch tabanlı sistemi tek kaynak kod ağacına taşımaktır.

## Doğrulanan canlı baseline
- Railway project: KOTAKAS
- Service: kotakas-live
- Son sağlam deployment: 53727e2f-acd0-48ce-9f53-4a0152e27bf8
- Çalışan özellikler: V18.20 bakiye settlement, V18.23 admin yetki/şifre endpointleri, V18.31 canlı rol oturumu, V18.40 Admin Yönetimi

## Faz 21 adımları
- [x] Ayrı kaynak branch'i oluştur
- [x] Node 20 package yapısını oluştur
- [x] Merkezi environment config
- [x] PostgreSQL bağlantı/health katmanı
- [x] Roller ve backend yetki matrisi
- [x] `/api/health` ve smoke test iskeleti
- [x] Pazar politikaları: normal üyeye ayda 1 ücretsiz ilan
- [x] Pazar politikaları: normal/pazarcı ayrı komisyon oranı
- [x] Pazar politikaları: serbest sohbet kapalı + hazır Satıcıya Sor mesajları
- [x] Pazar politikaları: telefon/WhatsApp/Instagram/site dışı iletişim filtresi
- [x] Pazar politikası otomatik testleri
- [x] Auth kaynak katmanı: `/api/register`, `/api/login`, `/api/logout`, `/api/me`
- [x] Auth geriye uyum aliasları: `/api/auth/*`
- [x] HttpOnly/Secure/SameSite session cookie
- [x] Her istekte DB'den canlı rol yenileme (V18.31 davranışı)
- [x] Login/kayıt IP rate limit
- [x] Mevcut `users/app_users/members` tablo adları ve kolon aliasları için şema keşfi
- [x] Auth şema uyumluluğunu `/api/health` kapısına ekle
- [x] GitHub Actions syntax + unit test CI
- [ ] Canlı DB şemasını ayrı geçiş servisinde salt-okunur doğrula
- [ ] Kullanıcı / pazarcı / admin panellerini kaynak ağaca taşı
- [ ] Bakiye, komisyon ve settlement endpointlerini taşı
- [ ] Bildirim + hazır mesaj/Satıcıya Sor akışını taşı
- [ ] İlan / BUY / SELL / anlaşma akışlarını taşı
- [ ] Admin finans ve Admin Yönetimi fonksiyonlarını taşı
- [ ] Production benzeri test DB ile smoke test
- [ ] Railway'e ayrı geçiş servisi olarak deploy et
- [ ] Tüm smoke testler geçmeden production trafiğini değiştirme

## Güvenlik notları
- Kaynak auth sistemi plaintext şifre kabul etmez; bcrypt olmayan eski hash algılanırsa `password_migration_required` döner.
- Session token rol taşımaz; rol her istekte veritabanından yeniden okunur.
- Production'da `KOTAKAS_SOURCE_BASELINE_READY=true` verilmeden yeni kaynak baseline `/api/health` için 200 dönmez.

## Canlıdan doğrulanan API envanteri
- `/api/me`
- `/api/listings`
- `/api/notifications`
- `/api/requests`
- `/api/stats`
- `/api/transactions`
- `/api/market-rates`
- `/api/tickets`
- `/api/admin/users`
- `/api/admin/traders`
- `/api/admin/trader-applications`
- `/api/admin/listings`
- `/api/admin/wallets`
- `/api/admin/commissions`
- `/api/admin/disputes`
- `/api/admin/settings`
- `/api/admin/security-events`
- `/api/admin/market-rates`
- `/api/admin/overview`
