# KOTAKAS

KOTAKAS'in tek canli ortami **Railway / production**'dir.

## Canli sistem
- Domain: `https://kotakas-live-production.up.railway.app`
- Railway proje: `KOTAKAS`
- Servis: `kotakas-live`
- Veritabani: `Postgres`
- Healthcheck: `/api/health`

## Bilinen saglam surum
- Son dogrulanmis SUCCESS deployment: `53727e2f-acd0-48ce-9f53-4a0152e27bf8`
- Tarih: 2026-08-28 14:57 UTC
- Bu surumde V18.40 Admin Yonetimi, V18.31 canli rol oturumu, V18.23 admin yap/kaldir ve sifre endpointleri calisiyordu.

## Kaynak migrasyonu
Yeni temiz kaynak kod `source-migration` dalinda gelistiriliyor ve PR #1 Draft tutuluyor. Bu dal production'a otomatik alinmayacak.

Tamamlanan ana katmanlar:
- Express + Socket.IO + Postgres kaynak agaci
- `/api/health`
- admin_owner / admin_full / admin_limited / trader / user rol modeli
- backend 401/403 yetki korumasi
- mobil sag ust hamburger menu ve responsive uygulama kabugu
- Google OAuth config hazirligi
- KVKK / Iletisim / Kopazar.com piyasa referansi
- JWT session okuma/dogrulama
- read-only kullanici sema uyumluluk adaptoru
- bcrypt tabanli legacy parola dogrulama adaptoru
- `/api/login` ve `/api/logout` kaynak route'lari; `LEGACY_LOGIN_ENABLED=false` ile varsayilan kapali
- read-only bakiye/komisyon sema uyumluluk adaptoru
- escrow release/refund ve komisyon uzlasma cekirdegi
- `FINANCE_WRITES_ENABLED=false` ile finans yazmalarinin varsayilan kapali tutulmasi
- tam yetkili admin icin salt sema metadata raporu: `/api/admin/schema-compatibility`
- GitHub CI syntax + rol + session + login + finans + escrow + smoke testleri

## Kural
1. Vercel canli KOTAKAS'in parcasi degildir; sadece eski testler icin kullanildi.
2. Yeni ozellikler once GitHub kaynak kodunda tutulacak.
3. Railway environment icine yeni `V18xx` hot-patch zinciri eklenmeyecek.
4. Her degisiklikten once mevcut canli surum korunacak ve healthcheck gecmeden trafik yeni deploy'a alinmayacak.
5. Gizli bilgiler (DB URL, JWT secret, OAuth secret, admin sifresi) GitHub'a yazilmayacak; sadece Railway Variables kullanilacak.
6. Login ve finans yazma feature flagleri staging semasi dogrulanmadan acilmayacak.

## Siradaki isler
- [ ] `/api/admin/schema-compatibility` ile staging DB semasini dogrulamak
- [ ] Dogrulanan tablo/kolonlara gore bakiye hold/release/refund SQL islemlerini transaction icinde baglamak
- [ ] Legacy login'i staging'de gercek kullanici ile dogrulayip `LEGACY_LOGIN_ENABLED` flagini kontrollu acmak
- [ ] Google ile Giris/Kayit (OAuth)
- [ ] Kayit ve sifre sifirlama uyumlulugu
- [ ] Staging smoke testi icin Railway kaynak limiti acildiginda ayri test servisi
- [ ] Yeni kaynak kod dogrulandiktan sonra eski hot-patch degiskenlerini arsivleme
