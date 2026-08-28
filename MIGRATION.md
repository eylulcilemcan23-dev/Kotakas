# KOTAKAS Source Migration

Bu dalin amaci Railway Variables icine parca parca yazilan hot-patch zincirini kaldirip KOTAKAS'i normal kaynak kod projesine tasimaktir.

## Guvenlik kurali

- `source-migration` production'a bagli degildir.
- Canli `kotakas-live` servisine bu dal hazir olmadan deploy yapilmaz.
- Mevcut ACTIVE/SUCCESS Railway deployment korunur.
- Secret degerler GitHub'a yazilmaz.
- Veritabaninda silme/degistirme yapan migration, tablo semasi dogrulanmadan eklenmez.

## Fazlar

1. Temel Node/Express/Socket.IO/Postgres kaynak agaci.
2. Canli frontend dosyalarinin kaynak agacina alinmasi.
3. Mevcut auth route/API uyumlulugu.
4. Admin rolleri: `admin_owner`, `admin_full`, `admin_limited`.
5. Kullanici/pazarci paneli ve bakiye API'leri.
6. Guvenli satis + komisyon + settlement akisi.
7. Google OAuth.
8. KVKK, Iletisim ve Kopazar piyasa referansi footer'i.
9. Staging smoke testleri.
10. Yalniz tum kontroller gecerse Railway production gecisi.

## Production'a gecis kontrol listesi

- `/api/health` 200
- Veritabani baglantisi OK
- Ana sayfa 200
- Login/register smoke test
- Admin owner erisimi
- Limited admin icin finans endpointleri 403
- Trader paneli
- Bakiye ve transaction listeleme
- Socket.IO baglantisi
- Mobil menu
- Rollback noktasi hazir
