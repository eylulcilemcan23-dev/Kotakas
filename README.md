# KOTAKAS

KOTAKAS'in tek canli ortami **Railway / production**'dir.

## Canli sistem
- Domain: `https://kotakas-live-production.up.railway.app`
- Railway proje: `KOTAKAS`
- Servis: `kotakas-live`
- Veritabani: `Postgres`
- Healthcheck: `/api/health`

## Kaynak surum
- Final kaynak agaci artik `main` branch'indedir.
- Release adayi: `21.8.0-rc1`
- Node 20 + Express + PostgreSQL.
- Railway hot-patch degiskenleri yeni gelistirme kaynagi olarak kullanilmayacak.

### Kaynaga tasinan temel ozellikler
- Kullanici / Pazarcı / Admin panel ayrimi
- `admin_owner`, `admin_full`, `admin_limited`, `trader`, `user` rolleri
- E-posta/sifre giris + legacy sifreyi bcrypt'e tek seferlik gecis
- Google OAuth kaynak akisi (Client ID/Secret Railway Variables ile etkinlesir)
- Normal uyeye ayda 1 ucretsiz ilan
- Pazarcı ve normal uye icin ayri komisyon
- Wallet + ledger + admin bakiye ayarlama
- Idempotent finans hareketleri
- BUY/SELL deal akisi
- KOTAKAS escrow: alici onayi olmadan saticiya odeme yok
- Anlasmazlikta escrow kilidi ve admin cozum endpointleri
- Serbest sohbet kapali; sadece hazir soru/cevap
- Telefon/WhatsApp/Instagram/Discord/URL filtreleri
- Bildirimler
- Piyasa kurlari
- Admin finans/uyeler/yetkiler/anlasmazliklar
- KVKK ve Iletisim sayfalari
- Mobil uyumlu sag-ust menu
- Footer: KVKK, Iletisim, Piyasa Referansi: Kopazar.com

## Deploy guvenligi
1. `npm run check`
2. `npm test`
3. Additive `npm run migrate` (DROP/TRUNCATE yok)
4. `npm start`
5. `/api/health` 200 olmadan yeni deployment saglikli kabul edilmez.

## Mevcut production durumu — 29 Agustos 2026
- Son dogrulanmis eski SUCCESS deployment: `53727e2f-acd0-48ce-9f53-4a0152e27bf8`.
- Kaynak gecisi icin `kotakas-live` start/health config hazirlandi.
- Railway Free plan yeni container provision asamasinda deploylari uygulama logu olusmadan `FAILED` durumuna dusuruyor.
- Ayri staging servisi olusturma denemesi de `Free plan resource provision limit exceeded` ile engellendi.
- Bu nedenle eski saglam deployment trafikte korunurken final kaynak `main` branch'inde hazir bekliyor.

## Harici gereksinimler
- Google ile girisin gercekten calismasi icin Railway'e `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` eklenmelidir.
- Yetkili callback: `https://kotakas-live-production.up.railway.app/auth/google/callback`
- Ikinci normal kullanici ilaninin ucret tutari/odeme saglayicisi henuz kararlastirilmadigi icin sistem bunu bedava yayinlamak yerine guvenli olarak `paid_listing_required` ile engeller.
- KVKK metni teknik taslaktir; ticari/odeme faaliyeti oncesi hukuk danismani ile nihai kontrol onerilir.

## Gizlilik kurali
Gizli bilgiler (DB URL, JWT secret, OAuth secret, admin sifresi) GitHub'a yazilmaz; sadece Railway Variables kullanilir.
