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
- [ ] Mevcut auth/register/session endpointlerini kaynak ağaca taşı
- [ ] Kullanıcı / pazarcı / admin panellerini kaynak ağaca taşı
- [ ] Bakiye, komisyon ve settlement endpointlerini taşı
- [ ] Bildirim + hazır mesaj/Satıcıya Sor akışını taşı
- [ ] İlan / BUY / SELL / anlaşma akışlarını taşı
- [ ] Admin finans ve Admin Yönetimi fonksiyonlarını taşı
- [ ] Production benzeri test DB ile smoke test
- [ ] Railway'e ayrı geçiş servisi olarak deploy et
- [ ] Tüm smoke testler geçmeden production trafiğini değiştirme

## Test sonucu
- `node --check`: başarılı
- `node --test`: 4/4 marketplace policy testi başarılı

## Güvenlik kapısı
Production'da `KOTAKAS_SOURCE_BASELINE_READY=true` verilmeden yeni kaynak baseline `/api/health` için 200 dönmez. Bu, eksik kaynak ağacının yanlışlıkla canlıya alınmasını önler.
