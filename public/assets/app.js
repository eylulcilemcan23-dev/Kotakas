(() => {
  const state = {
    config: { environment: 'preview', googleEnabled: false, legacyLoginEnabled: false, commissionRate: 0, traderDebtLimitGb: 0, marketReference: 'Kopazar.com' },
    menuOpen: false,
  };
  const route = () => location.pathname === '/index.html' ? '/' : location.pathname;
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const navItems = [['/', 'Ana Sayfa'], ['/market.html', 'Pazar'], ['/buy.html', 'Al'], ['/sell.html', 'Sat'], ['/deals.html', 'İşlemler'], ['/support.html', 'Destek']];
  function navLinks(mobile = false) {
    const current = route();
    return navItems.map(([href, label]) => `<a href="${href}" class="${current === href ? 'active' : ''}"${mobile ? ' data-mobile-link' : ''}>${label}</a>`).join('');
  }
  function shell(content) {
    const preview = state.config.environment !== 'production' ? '<div class="preview-banner">Kaynak kod migrasyon önizlemesi — canlı KOTAKAS etkilenmez.</div>' : '';
    return `${preview}<header class="topbar"><div class="topbar-inner"><a class="brand" href="/"><span class="brand-mark">K</span><span>KOTAKAS</span></a><nav class="nav">${navLinks()}<a href="/notifications.html">🔔</a><a href="/profile.html">Profil</a></nav><button class="menu-button" id="menuButton" aria-label="Menüyü aç">☰</button></div><nav class="mobile-menu ${state.menuOpen ? 'open' : ''}" id="mobileMenu">${navLinks(true)}<a href="/notifications.html" data-mobile-link>Bildirimler</a><a href="/profile.html" data-mobile-link>Profil</a><a href="/login.html" data-mobile-link>Giriş Yap</a></nav></header><main class="main">${content}</main><footer class="footer"><div class="footer-inner"><div>© ${new Date().getFullYear()} KOTAKAS</div><div class="footer-links"><a href="/kvkk.html">KVKK</a><a href="/contact.html">İletişim</a><span>Piyasa Referansı: ${esc(state.config.marketReference)}</span></div></div></footer>`;
  }
  function pageTitle(title, text, action = '') { return `<div class="page-title"><div><h1>${title}</h1><p>${text}</p></div>${action}</div>`; }
  function homePage() { return `<section class="hero"><h1>Oyuncudan oyuncuya güvenli pazar.</h1><p>KOTAKAS; Knight Online item, GB ve oyuncu işlemlerini tek bir düzenli pazarda buluşturmak için geliştiriliyor. Alıcı, satıcı ve doğrulanmış pazarcı rolleri ayrı yönetilir.</p><div class="actions"><a class="btn primary" href="/market.html">Pazarı Aç</a><a class="btn" href="/sell.html">İlan Ver</a><a class="btn ghost" href="/trader-apply.html">Pazarcı Ol</a></div></section><div class="grid"><article class="card"><h3>Güvenli İşlem</h3><p>Bakiye, işlem ve komisyon akışı kaynak kod migrasyonunda backend yetkileriyle korunacak.</p></article><article class="card"><h3>Doğrulanmış Pazarcılar</h3><p>Pazarcılar ayrı role ve onay sürecine sahip olacak; kullanıcı yetkileriyle karışmayacak.</p></article><article class="card"><h3>Canlı Bildirimler</h3><p>Socket.IO tabanı hazır. İşlem, mesaj ve yönetim bildirimleri bu kanaldan ilerleyecek.</p></article></div>`; }
  function marketPage() { return `${pageTitle('Pazar', 'Aktif item ve GB ilanlarının temiz kaynak kod görünümü.', '<a class="btn primary" href="/sell.html">+ İlan Ver</a>')}<div class="grid"><section class="card full"><div class="list"><div class="list-item"><div><strong>İlan verileri taşınmayı bekliyor</strong><span>Canlı API uyumluluk adaptörü bağlandığında mevcut ilanlar burada görünecek.</span></div><span class="badge yellow">MIGRATION</span></div></div></section></div>`; }
  function buyPage() { return `${pageTitle('Satın Al', 'Sunucu ve ürün seçerek güvenli işlem başlat.')}<div class="grid"><section class="card half"><form class="form" data-preview-form><div class="field"><label>Sunucu</label><select><option>ZERO</option><option>AGARTHA</option><option>PANDORA</option><option>FELIS</option></select></div><div class="field"><label>Aradığın ürün</label><input placeholder="Örn. Mirage Dagger +8"></div><div class="field"><label>Bütçe</label><input type="number" min="0" placeholder="TL"></div><button class="btn primary" type="submit">Talep Oluştur</button></form></section><aside class="card half"><h3>İşlem Güvenliği</h3><p>Ödeme ve teslim onay modeli, bakiye/komisyon backend modülü bağlandığında aktif olacak.</p></aside></div>`; }
  function sellPage() { return `${pageTitle('İlan Ver', 'Item veya GB satışını pazar listesine ekle.')}<div class="grid"><section class="card wide"><form class="form" data-preview-form><div class="field"><label>Sunucu</label><select><option>ZERO</option><option>AGARTHA</option><option>PANDORA</option><option>FELIS</option></select></div><div class="field"><label>İlan başlığı</label><input placeholder="Ürün / item adı"></div><div class="field"><label>Fiyat</label><input type="number" min="0" placeholder="TL"></div><div class="field"><label>Açıklama</label><textarea rows="4" placeholder="Teslimat ve ürün detayları"></textarea></div><button class="btn success" type="submit">İlanı Hazırla</button></form></section><aside class="card"><h3>Komisyon</h3><div class="kpi">%${Number(state.config.commissionRate || 0)} <small>yapılandırılmış oran</small></div><p>Canlıya geçmeden önce finans kuralları yeniden doğrulanacak.</p></aside></div>`; }
  function dashboardPage() { return `${pageTitle('Panelim', 'Bakiye, ilan, işlem ve bildirim özeti.')}<div class="grid"><article class="card"><h3>Kullanılabilir Bakiye</h3><div class="kpi">— <small>TL</small></div></article><article class="card"><h3>Aktif İlan</h3><div class="kpi">—</div></article><article class="card"><h3>Bekleyen İşlem</h3><div class="kpi">—</div></article><section class="card full"><div class="empty">Mevcut hesap verileri canlı API adaptörü bağlandığında gösterilecek.</div></section></div>`; }
  const dealsPage = () => `${pageTitle('İşlemlerim', 'Alım-satım, teslim ve ödeme geçmişi.')}<div class="card full"><div class="empty">İşlem verisi henüz kaynak migrasyonuna bağlanmadı.</div></div>`;
  const notificationsPage = () => `${pageTitle('Bildirimler', 'Mesaj, işlem ve sistem bildirimleri.')}<div class="card full"><div class="empty">Canlı bildirim kanalı hazır; kullanıcı oturumu bağlandığında içerik burada görünecek.</div></div>`;
  const profilePage = () => `${pageTitle('Profil', 'Hesap, rol ve güvenlik bilgileri.')}<div class="grid"><section class="card half"><h3>Hesap</h3><p>JWT oturum katmanı hazır; staging doğrulamasından sonra gerçek hesap bilgileri gösterilecek.</p></section><section class="card half"><h3>Güvenlik</h3><p>Şifre ve bağlı Google hesabı işlemleri backend üzerinden doğrulanacak.</p></section></div>`;
  const traderApplyPage = () => `${pageTitle('Pazarcı Başvurusu', 'Doğrulanmış pazarcı rolü için başvuru.')}<div class="grid"><section class="card wide"><form class="form" data-preview-form><div class="field"><label>Mağaza / kullanıcı adı</label><input></div><div class="field"><label>İletişim</label><input></div><div class="field"><label>Açıklama</label><textarea rows="4"></textarea></div><button class="btn primary" type="submit">Başvuruyu Hazırla</button></form></section></div>`;
  const traderPage = () => `${pageTitle('Pazarcı Paneli', 'Onaylı pazarcı ilanları, satışlar ve hesap özeti.')}<div class="grid"><article class="card"><h3>Satış</h3><div class="kpi">—</div></article><article class="card"><h3>Komisyon</h3><div class="kpi">—</div></article><article class="card"><h3>Bakiye</h3><div class="kpi">—</div></article></div>`;
  const supportPage = () => `${pageTitle('Destek', 'İşlem, hesap veya anlaşmazlık için destek talebi aç.')}<div class="grid"><section class="card wide"><form class="form" data-preview-form><div class="field"><label>Konu</label><input></div><div class="field"><label>Mesaj</label><textarea rows="6"></textarea></div><button class="btn primary" type="submit">Talebi Hazırla</button></form></section></div>`;
  function adminPage() { return `${pageTitle('Admin Merkezi', 'Rol tabanlı yönetim ekranlarının kaynak kod taslağı.')}<div class="notice">Hassas finans ve admin yönetimi bölümleri yalnızca <strong>Ana Yönetici</strong> ve <strong>Tam Yetkili</strong> rollerine backend tarafından açılacak.</div><div class="grid"><article class="card"><h3>Üyeler</h3><div class="kpi">—</div></article><article class="card"><h3>Pazarcılar</h3><div class="kpi">—</div></article><article class="card"><h3>Başvurular</h3><div class="kpi">—</div></article><section class="card half"><h3>Finans</h3><p>Bakiye ve komisyon verileri sınırlı yöneticiden gizlenecek.</p></section><section class="card half"><h3>Güvenlik</h3><p>Admin işlemleri ve kritik ayarlar ayrı permission kontrolünden geçecek.</p></section></div>`; }
  function adminAccessPage() { return `${pageTitle('Yetki Seviyeleri', 'Admin rollerinin erişim sınırları.')}<section class="card full"><table class="role-table"><thead><tr><th>Rol</th><th>Standart Yönetim</th><th>Finans</th><th>Admin Yönetimi</th></tr></thead><tbody><tr><td><span class="badge green">Ana Yönetici</span></td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td><span class="badge">Tam Yetkili</span></td><td>✓</td><td>✓</td><td>✓</td></tr><tr><td><span class="badge yellow">Sınırlı Yetkili</span></td><td>✓</td><td>—</td><td>—</td></tr></tbody></table></section>`; }
  function authErrorMessage() {
    const code = new URLSearchParams(location.search).get('error');
    if (!code) return '';
    const messages = {
      google_account_not_registered: 'Bu Google e-postasıyla kayıtlı KOTAKAS hesabı bulunamadı.',
      google_email_unverified: 'Google e-posta doğrulaması tamamlanamadı.',
      google_state_invalid: 'Google giriş oturumu geçersiz veya süresi dolmuş.',
      google_oauth_failed: 'Google girişinde geçici bir hata oluştu.',
      google_oauth_not_ready: 'Google giriş yapılandırması henüz tamamlanmadı.',
    };
    return `<div class="notice">${esc(messages[code] || 'Giriş tamamlanamadı. Lütfen tekrar deneyin.')}</div>`;
  }
  function authPage(register = false) {
    const googleControl = state.config.googleEnabled
      ? '<a class="google-btn" href="/auth/google">Google ile devam et</a>'
      : '<button class="google-btn" disabled>Google ile giriş — yapılandırma bekliyor</button>';
    const loginReady = !register && state.config.legacyLoginEnabled;
    const formAttr = loginReady ? 'data-login-form' : 'data-preview-form';
    const status = !register && !state.config.legacyLoginEnabled ? '<div class="sub">E-posta girişi staging doğrulamasına kadar kapalı.</div>' : '';
    return `<div class="auth-wrap"><section class="auth-card"><h1>${register ? 'Hesap Oluştur' : 'Giriş Yap'}</h1><div class="sub">KOTAKAS hesabınla devam et.</div>${authErrorMessage()}${googleControl}<div class="divider">veya</div>${status}<form class="form" ${formAttr}><div class="field"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Şifre</label><input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" required></div>${register ? '<div class="field"><label>Şifre tekrar</label><input type="password" required></div>' : ''}<button class="btn primary" type="submit">${register ? 'Kayıt Ol' : 'Giriş Yap'}</button></form><p style="color:var(--muted);font-size:13px;margin-top:18px">${register ? 'Zaten hesabın var mı? <a href="/login.html">Giriş yap</a>' : 'Hesabın yok mu? <a href="/register.html">Kayıt ol</a>'}</p></section></div>`;
  }
  const kvkkPage = () => `${pageTitle('KVKK', 'Kişisel verilerin işlenmesi ve korunması.')}<section class="card full"><h3>Kaynak migrasyon notu</h3><p>Bu sayfa için nihai aydınlatma metni, işletme bilgileri ve veri işleme süreçleri hukuk kontrolünden sonra yayımlanmalıdır. Şimdilik arayüz ve navigasyon hazırlandı.</p></section>`;
  const contactPage = () => `${pageTitle('İletişim', 'KOTAKAS destek ve işletme iletişim kanalları.')}<section class="card half"><h3>Destek</h3><p>Destek talepleri için sistem içi destek modülü kullanılacak. Resmî iletişim bilgileri yayına geçmeden önce eklenecek.</p></section>`;
  const pages = { '/': homePage, '/market.html': marketPage, '/buy.html': buyPage, '/sell.html': sellPage, '/dashboard.html': dashboardPage, '/deals.html': dealsPage, '/notifications.html': notificationsPage, '/profile.html': profilePage, '/trader-apply.html': traderApplyPage, '/trader.html': traderPage, '/support.html': supportPage, '/admin.html': adminPage, '/admin-access.html': adminAccessPage, '/login.html': () => authPage(false), '/register.html': () => authPage(true), '/kvkk.html': kvkkPage, '/contact.html': contactPage };
  function render() { const page = pages[route()] || (() => `${pageTitle('Sayfa bulunamadı', 'İstediğin sayfa kaynak migrasyonunda tanımlı değil.')}<a class="btn" href="/">Ana sayfaya dön</a>`); document.querySelector('#app').innerHTML = shell(page()); bindUi(); }
  function bindUi() {
    document.querySelector('#menuButton')?.addEventListener('click', () => { state.menuOpen = !state.menuOpen; document.querySelector('#mobileMenu')?.classList.toggle('open', state.menuOpen); });
    document.querySelectorAll('[data-mobile-link]').forEach((link) => link.addEventListener('click', () => { state.menuOpen = false; }));
    document.querySelectorAll('[data-preview-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); alert('Bu form kaynak migrasyon önizlemesinde veri yazmaz. Canlı sistem etkilenmedi.'); }));
    document.querySelectorAll('[data-login-form]').forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      if (submit) submit.disabled = true;
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'login_failed');
        location.href = '/dashboard.html';
      } catch (_) {
        alert('Giriş yapılamadı. E-posta ve şifrenizi kontrol edin.');
      } finally {
        if (submit) submit.disabled = false;
      }
    }));
  }
  async function loadConfig() { try { const response = await fetch('/api/public-config', { headers: { Accept: 'application/json' } }); if (response.ok) state.config = { ...state.config, ...(await response.json()) }; } catch (_) {} render(); }
  window.addEventListener('DOMContentLoaded', loadConfig);
})();