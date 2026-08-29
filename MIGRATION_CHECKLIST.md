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
- [x] Auth kaynak katmanı: `/api/register`, `/api/login`, `/api/logout`, `/api/me`
- [x] Auth geriye uyum aliasları: `/api/auth/*`
- [x] HttpOnly/Secure/SameSite session cookie
- [x] Her istekte DB'den canlı rol yenileme
- [x] Login/kayıt IP rate limit
- [x] Kullanıcı / pazarcı / admin panel erişimini backend'de ayır
- [x] Finans çekirdeği: wallet + ledger + idempotent admin bakiye ekle/çıkar
- [x] Finans çekirdeği: normal kullanıcı/pazarcı ayrı komisyon
- [x] Finans çekirdeği: iç bakiye settlement ve platform komisyon kaydı
- [x] Finans güvenliği: çift işlem engeli + deterministik wallet lock + self-settlement engeli
- [x] İlan çekirdeği: `/api/listings` + kendi ilanları + düzenle/kapat
- [x] Normal kullanıcı ilk aylık ilan ücretsiz, ikinci ilan ödeme gerektirir
- [x] Pazarcı ilan akışı ayrı publication type ile açık
- [x] İlan metninde site dışı iletişim filtresi
- [x] `/api/admin/listings` ve moderasyon endpointi
- [x] Bildirimler: `/api/notifications`, tekli okuma, `read-all`
- [x] Satıcıya Sor: yalnız hazır sorular + yalnız hazır cevaplar
- [x] Soru/cevap taraflarında otomatik bildirim üretimi
- [x] Market kurları: `/api/market-rates` + admin manuel kur endpointi
- [x] Anlaşma çekirdeği: `/api/deals`
- [x] Güvenli emanet bakiye: alıcı fon kilitleme
- [x] Satıcı teslim işareti + alıcı onayı sonrası komisyonlu serbest bırakma
- [x] Teslim öncesi iptalde otomatik emanet iadesi
- [x] Anlaşmazlıkta emanet bakiyeyi kilitli tutma
- [x] GitHub Actions syntax + unit test CI

## Kalan ana bloklar
- [ ] Canlı DB şemasını ayrı geçiş servisinde salt-okunur doğrula ve gerekli migration SQL'i çıkar
- [ ] Admin Finans / Admin Yönetimi ekran verilerini tam kaynak ağaca taşı + dispute çözüm endpointleri
- [ ] Google ile Giriş/Kayıt
- [ ] Footer: KVKK, İletişim, Piyasa Referansı: Kopazar.com + KVKK/İletişim sayfaları
- [ ] Production benzeri test DB + Railway ayrı geçiş servisi + smoke test + kontrollü trafik geçişi

## Güvenlik notları
- Kaynak auth sistemi plaintext şifre kabul etmez; bcrypt olmayan eski hash algılanırsa `password_migration_required` döner.
- Session token rol taşımaz; rol her istekte veritabanından yeniden okunur.
- Admin bakiye işlemleri idempotency key kullanır ve bakiye sıfırın altına düşmez.
- Normal kullanıcı ikinci ilanı ödeme entegrasyonu tamamlanmadan yanlışlıkla ücretsiz yayınlayamaz.
- Serbest alıcı/satıcı sohbeti kapalıdır; yalnız hazır soru ve hazır cevaplar kullanılabilir.
- Deal fiyatı istemciden alınmaz; ilandaki GB fiyatı ile server-side GB/TL kuru kullanılır.
- Satıcı kabul ettiğinde alıcı fonu emanet bakiyeye kilitlenir; alıcı teslimatı onaylamadan satıcıya geçmez.
- Anlaşmazlıkta escrow otomatik çözülmez; admin kararı gerekir.
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
