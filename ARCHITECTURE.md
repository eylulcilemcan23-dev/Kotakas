# KOTAKAS Mimari Plani

## Tek merkez
Production yalniz Railway'dedir. Vercel production parcasi degildir.

## Roller
- `admin_owner`: Ana KOTAKAS yoneticisi. Tam yetki, kaldirilamaz.
- `admin_full`: Tam yetkili yonetici.
- `admin_limited`: Sinirli yonetici.
- `trader`: Dogrulanmis pazarci.
- `user`: Normal uye.

### Sinirli yonetici izinleri
Gorebilir/yonetebilir:
- Uyeler
- Pazarcilar
- Basvurular
- Ilanlar
- Anlasmazliklar
- Destek

Erisemez:
- Bakiye
- Finans
- Komisyon
- Admin Yonetimi
- Guvenlik
- Kritik platform ayarlari
- Admin yap/kaldir
- Admin sifre islemleri

Yetki kontrolu sadece arayuzde gizleme ile yapilmayacak. Hassas API endpointleri backend'de rol kontrolu ile `403` dondurecek.

## Kimlik dogrulama
Mevcut e-posta/sifre girisi korunacak. Yeni kaynak kod JWT tabanli httpOnly cookie oturumu okuyup dogrulayabilecek. Mevcut kullanici tablosu production'a yazmadan once `information_schema` ile read-only algilanacak; tablo ve kolon isimleri dogrulanmadan veri migrasyonu yapilmayacak.

Google OAuth eklendiginde gerekli Railway Variables:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL=https://kotakas-live-production.up.railway.app/auth/google/callback`

Google hesabiyla ilk giriste e-posta benzersiz anahtar olarak kullanilacak. Mevcut ayni e-postali hesap varsa yeni hesap acmak yerine o hesaba baglanacak.

## Bakiye ve komisyon
Mevcut wallet/transaction/commission/order tablolari once read-only sema adaptoru ile algilanacak. Satis para hareketleri baglanirken alim bedeli, platform komisyonu ve satici net bakiyesi tek DB transaction'i icinde atomik islenecek. Boylece komisyon sonradan saticidan istenen borc degil, islem aninda kesilen platform payi olacak.

## Footer
Tum genel sayfalarda:
- KVKK
- Iletisim
- Piyasa Referansi: Kopazar.com

Kopazar resmi sponsorluk anlasmasi yapilirsa metin daha sonra `Sponsor: Kopazar.com` olarak degistirilebilir.

## Deploy guvenligi
1. Kaynak kod GitHub'da commitlenir.
2. Test/syntax/rol/session/finans kontrolleri yapilir.
3. Railway staging veya izole test servisi tetiklenir.
4. `/api/health` SUCCESS olmadan yeni deployment canli kabul edilmez.
5. Admin, login, trader, bakiye ve bildirim icin temel smoke test yapilir.
6. Production ancak kaynak surum dogrulandiktan sonra degistirilir.
