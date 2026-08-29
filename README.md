# KOTAKAS

KOTAKAS'in canli ortami **Railway / production**'dir.

## Canli sistem
- Resmi kaynak servisi: `kotakas-source`
- Canli domain: `https://kotakas-source-production.up.railway.app`
- Railway proje: `KOTAKAS`
- Veritabani: `Postgres`
- Healthcheck: `/api/health`
- Canli deployment: `8a02a969-3a14-47ed-aecb-88640b76aa09` — SUCCESS
- Eski `kotakas-live` servisi legacy/fallback olarak tutulur; yeni Docker deployment'lari container baslamadan FAILED oldugu icin kaynak servisi production olarak kullanilir.

## Kaynak surum
- Final kaynak agaci `main` branch'indedir.
- Release: `21.8.0`
- Node 20 + Express + PostgreSQL.
- Railway hot-patch degiskenleri yeni gelistirme kaynagi olarak kullanilmaz.

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
Her kaynak deploy'unda Railway su zinciri uygular:
1. `npm run check`
2. `npm test`
3. Additive `npm run migrate` (DROP/TRUNCATE yok)
4. `npm start`
5. `/api/health` 200 olmadan deployment SUCCESS kabul edilmez.

## Production gecisi — 29 Agustos 2026
- Eski saglam deployment: `53727e2f-acd0-48ce-9f53-4a0152e27bf8`.
- Eski `kopazar-live-api` projesindeki `kotakas-v6` ve `kopazar-api2` servisleri tamamen silindi; `kopazar-api` aktif deployment'i kaldirildi.
- GitHub `main` kaynakli `kotakas-source` servisi olusturuldu.
- Production Postgres reference variable ile baglandi.
- Deployment `8a02a969-3a14-47ed-aecb-88640b76aa09` SUCCESS oldu.
- Build 0 npm vulnerability raporladi; uygulama `:3000` portunda basladi ve Railway healthcheck'i gecti.

## Harici gereksinimler
- Google ile girisin gercekten calismasi icin Railway `kotakas-source` servisine `GOOGLE_CLIENT_ID` ve `GOOGLE_CLIENT_SECRET` eklenmelidir.
- Yetkili callback: `https://kotakas-source-production.up.railway.app/auth/google/callback`
- Ikinci normal kullanici ilaninin ucret tutari/odeme saglayicisi henuz kararlastirilmadigi icin sistem bunu bedava yayinlamak yerine guvenli olarak `paid_listing_required` ile engeller.
- KVKK metni teknik taslaktir; ticari/odeme faaliyeti oncesi hukuk danismani ile nihai kontrol onerilir.

## Gizlilik kurali
Gizli bilgiler (DB URL, JWT secret, OAuth secret, admin sifresi) GitHub'a yazilmaz; sadece Railway Variables kullanilir.
