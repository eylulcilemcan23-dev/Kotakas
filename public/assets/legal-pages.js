(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/kvkk.html','/contact.html'].includes(path)) return;

  function host() { return document.querySelector('main.main'); }

  function renderKvkk() {
    const main = host();
    if (!main) return;
    main.innerHTML = `
      <div class="page-title"><div><h1>KVKK ve Gizlilik</h1><p>KOTAKAS'ın kişisel veri işleme çerçevesi için yayın öncesi taslak.</p></div></div>
      <div class="notice"><strong>Yayın öncesi hukuk kontrolü gerekli.</strong> İşletme unvanı, adres, veri sorumlusu kimliği ve gerekli resmî kayıt bilgileri kesinleşmeden bu metin nihai aydınlatma metni sayılmaz.</div>
      <div class="grid">
        <section class="card half"><h3>İşlenen veri grupları</h3><p>Hesap e-postası, kullanıcı adı, rol, oturum/güvenlik kayıtları, ilan ve işlem kayıtları, ödeme sağlayıcısından gelen referanslar, destek ve ihtilaf mesajları.</p></section>
        <section class="card half"><h3>İşleme amaçları</h3><p>Hesap ve pazar hizmetini sunmak, dolandırıcılığı azaltmak, güvenli işlem ve escrow akışlarını yürütmek, destek sağlamak ve yasal yükümlülüklere hazırlanmak.</p></section>
        <section class="card half"><h3>Ödeme verileri</h3><p>Kart numarası ve CVV KOTAKAS formunda tutulmaz. PayTR checkout kullanıldığında kart alanları ödeme sağlayıcısının güvenli ekranında kalır; KOTAKAS yalnız işlem referansı ve doğrulanmış ödeme sonucunu işler.</p></section>
        <section class="card half"><h3>İletişim güvenliği</h3><p>Satış öncesi serbest alıcı-satıcı sohbeti kapalıdır. Hazır soru/cevap, teklif, takas, destek ve ihtilaf akışları sistem içi kayıtlarla yürütülür.</p></section>
        <section class="card full"><h3>Hak talepleri ve iletişim</h3><p>KVKK kapsamındaki talepler için yayın öncesi resmî başvuru kanalı ve veri sorumlusu iletişim bilgileri eklenecektir. Genel destek için <a href="/support.html">Destek Merkezi</a> kullanılabilir.</p></section>
      </div>`;
  }

  function renderContact() {
    const main = host();
    if (!main) return;
    main.innerHTML = `
      <div class="page-title"><div><h1>İletişim</h1><p>KOTAKAS destek ve resmî iletişim kanalları.</p></div></div>
      <div class="grid">
        <section class="card half"><h3>Sistem İçi Destek</h3><p>Hesap, ilan, ödeme ve genel kullanım konularında kayıtlı destek talebi açabilirsin.</p><a class="btn primary" href="/support.html">Destek Merkezi</a></section>
        <section class="card half"><h3>Resmî İletişim</h3><p>İşletme unvanı, resmî e-posta, açık adres ve varsa ticari kayıt bilgileri Faz 20 yayın kontrolünde doğrulandıktan sonra burada yayımlanacaktır.</p></section>
        <section class="card full"><h3>Sponsor</h3><p>KOTAKAS arayüzünde sponsor alanı için <strong>kopazar.com</strong> referansı korunmaktadır. Sponsor/iş ortaklığı ifadesi yayına alınmadan önce ticari ilişki ve kullanım izni ayrıca doğrulanmalıdır.</p></section>
      </div>`;
  }

  window.addEventListener('DOMContentLoaded', () => setTimeout(() => path === '/kvkk.html' ? renderKvkk() : renderContact(), 120));
})();
