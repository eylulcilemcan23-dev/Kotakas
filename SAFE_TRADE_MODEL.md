# KOTAKAS Güvenli Ticaret Modeli — Faz 22

Bu fazın hedefi KOTAKAS'ı para/oyun parası saklayan veya transfer eden bir aracıdan ziyade ticaret kayıt ve analiz aracına dönüştürmektir.

## Temel sınırlar

- KOTAKAS kullanıcı adına TL, GB, NPoint veya oyun içi eşya saklamaz.
- KOTAKAS içinde kullanıcıdan kullanıcıya GB transferi yoktur.
- KOTAKAS içinde GB yatırma/çekme veya nakde çevirme yoktur.
- `trade_journal` kayıtları yalnızca kullanıcının oyun içinde tamamladığını beyan ettiği işlemlerin özel muhasebe kaydıdır.
- TL karşılığı ileride gösterilirse yalnızca piyasa referansı olarak gösterilir; ödeme veya mutabakat değeri değildir.
- Bu fazda eklenen ekran escrow değildir ve kullanıcılar arasında işlem eşleştirmez.

## Faz 22 v1

- Alış/satış kaydı: sunucu, varlık türü, ürün adı, adet, birim GB fiyatı.
- Toplam alış GB, toplam satış GB, net GB akışı ve işlem sayısı özeti.
- Kullanıcı kendi kayıtlarını görebilir ve silebilir.

## Sonraki güvenli modüller

- Stok ve ortalama maliyet.
- Gerçekleşmiş / gerçekleşmemiş kâr analizi.
- Kullanıcının kendi işlem geçmişinden fiyat grafikleri.
- Fiyat alarmı ve izleme listesi.
- Anonim ve toplulaştırılmış piyasa istatistikleri.

## Canlıya geçiş notu

Eski TL cüzdanı, escrow ve dış işlem eşleştirme akışları ayrı bir geçiş fazında devre dışı bırakılmadan bu dosya tek başına 'journal-only' çalışma garantisi vermez. Canlıya alma öncesinde transactional endpoint ve ekranların kapatılması ayrıca yapılmalıdır.
