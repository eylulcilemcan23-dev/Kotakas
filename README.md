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

## Kural
1. Vercel canli KOTAKAS'in parcasi degildir; sadece eski testler icin kullanildi.
2. Yeni ozellikler once bu repoda kaynak kod olarak tutulacak.
3. Railway environment icine yeni `V18xx` hot-patch zinciri eklenmeyecek.
4. Her degisiklikten once mevcut canli surum korunacak ve healthcheck gecmeden trafik yeni deploy'a alinmayacak.
5. Gizli bilgiler (DB URL, JWT secret, OAuth secret, admin sifresi) GitHub'a yazilmayacak; sadece Railway Variables kullanilacak.

## Siradaki isler
- [ ] Mevcut Railway uygulamasini tek kaynak kod agacina tasima
- [ ] Admin yetki seviyeleri: Ana Yonetici / Tam Yetkili / Sinirli Yetkili
- [ ] Google ile Giris/Kayit (OAuth)
- [ ] Footer: KVKK, Iletisim, Piyasa Referansi: Kopazar.com
- [ ] KVKK ve Iletisim sayfalari
- [ ] Eski hot-patch degiskenlerini yeni kaynak kod dogrulandiktan sonra arsivleme
