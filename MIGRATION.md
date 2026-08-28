# KOTAKAS Kaynak Migrasyonu

## Guvenlik kurali
Bu dal production degildir. `source-migration` dalindaki kod canli `kotakas-live` servisine baglanmadan once CI ve staging testlerinden gececek.

## Tamamlananlar
- Node 20 + Express + Socket.IO kaynak agaci
- PostgreSQL baglanti katmani ve `/api/health`
- Rol/yetki matrisi ve backend 401/403 korumasi
- Canli API route kontrati
- Responsive mobil/masaustu uygulama kabugu
- Sag ust mobil hamburger menu
- Google OAuth config hazirligi
- KVKK / Iletisim / Kopazar.com piyasa referansi
- JWT session okuma/dogrulama katmani
- Mevcut kullanici tablosunu read-only `information_schema` ile algilayan uyumluluk adaptoru
- Bcrypt parola hash uyumluluk kontrolu
- `/api/me` ve `/api/auth/status` kaynak route'lari
- Bakiye / transaction / komisyon / order tablolarini read-only algilayan finans adaptoru
- Komisyon hesaplama fonksiyonu ve testleri
- Syntax, rol/yetki, session, finans ve source smoke CI testleri

## Henuz production'a alinmayacaklar
- Legacy giris endpointinin yeni session katmanina baglanmasi
- Kayit ve sifre sifirlama akisi
- Gercek Google OAuth credentials
- Bakiye/komisyon yazma islemleri ve escrow
- Eski Railway hot-patch degiskenlerinin temizlenmesi

## Gecis plani
1. Eski DB semasi staging benzeri ortamda read-only algilanir.
2. Login/session uyumlulugu test edilir.
3. Bakiye ve komisyon tablolari mevcut semaya gore baglanir.
4. Escrow/komisyon hareketleri transaction icinde atomik uygulanir.
5. `/api/health`, auth, admin, trader ve finans smoke testleri SUCCESS olmadan production degismez.
6. Yeni kaynak surum SUCCESS olduktan sonra eski V18xx hot-patch zinciri arsivlenir.
