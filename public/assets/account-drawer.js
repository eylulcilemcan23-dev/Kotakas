(() => {
  const state = { user: null, wallet: null, hydrated: false, hydrating: null };
  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const currentPath = () => location.pathname === '/index.html' ? '/' : location.pathname;

  function roleLabel(role) {
    return ({ admin_owner: 'Ana Yönetici', admin_full: 'Tam Yetkili', admin_limited: 'Sınırlı Yetkili', trader: 'Pazarcı', user: 'Kullanıcı' })[role] || 'Kullanıcı';
  }

  function isAdmin(role) {
    return ['admin_owner', 'admin_full', 'admin_limited'].includes(role);
  }

  function icon(name) {
    const common = 'viewBox="0 0 24 24" aria-hidden="true"';
    const icons = {
      user: `<svg ${common}><circle cx="12" cy="8" r="4"></circle><path d="M4.5 20c.8-4.2 3.2-6.2 7.5-6.2s6.7 2 7.5 6.2"></path></svg>`,
      bell: `<svg ${common}><path d="M6.8 9.6a5.2 5.2 0 0 1 10.4 0c0 5.2 2.1 5.7 2.1 5.7H4.7s2.1-.5 2.1-5.7"></path><path d="M10 18.2h4"></path></svg>`,
      close: `<svg ${common}><path d="M6 6l12 12M18 6L6 18"></path></svg>`,
      chevron: `<svg ${common}><path d="M8 10l4 4 4-4"></path></svg>`,
      home: `<svg ${common}><path d="M3.5 11.2L12 4l8.5 7.2"></path><path d="M5.5 10.5V20h13v-9.5"></path></svg>`,
      message: `<svg ${common}><path d="M4 5.5h16v11H9l-5 3v-14z"></path><path d="M8 9h8M8 12h5"></path></svg>`,
      orders: `<svg ${common}><rect x="5" y="3.5" width="14" height="17" rx="2"></rect><path d="M8 8h8M8 12h8M8 16h5"></path></svg>`,
      sales: `<svg ${common}><path d="M4 8h16l-1.3 12H5.3L4 8z"></path><path d="M7 8a5 5 0 0 1 10 0"></path></svg>`,
      wallet: `<svg ${common}><path d="M4 7h14.5A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5V7z"></path><path d="M4 7l10-3v3M15 12h5"></path></svg>`,
      star: `<svg ${common}><path d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.5-5-2.6-5 2.6.9-5.5-4-3.9 5.6-.8L12 3.8z"></path></svg>`,
      store: `<svg ${common}><path d="M4 9l1.5-5h13L20 9"></path><path d="M5 9v11h14V9"></path><path d="M9 20v-6h6v6"></path></svg>`,
      settings: `<svg ${common}><circle cx="12" cy="12" r="3"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"></path></svg>`,
      shield: `<svg ${common}><path d="M12 3l7 3v5c0 4.5-2.6 7.7-7 10-4.4-2.3-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>`,
      logout: `<svg ${common}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"></path></svg>`,
    };
    return icons[name] || icons.home;
  }

  function linkRow(href, label, { soon = false } = {}) {
    if (soon) return `<div class="account-sub-link disabled"><span>${esc(label)}</span><em>Yakında</em></div>`;
    const active = currentPath() === href.split(/[?#]/)[0];
    return `<a class="account-sub-link ${active ? 'active' : ''}" href="${href}" data-account-drawer-link>${esc(label)}</a>`;
  }

  function section(title, iconName, rows) {
    return `<details class="account-section"><summary><span class="account-menu-icon">${icon(iconName)}</span><strong>${esc(title)}</strong><span class="account-chevron">${icon('chevron')}</span></summary><div class="account-section-body">${rows.join('')}</div></details>`;
  }

  function guestContent() {
    return `<div class="account-drawer-head"><button class="account-close" type="button" aria-label="Menüyü kapat" data-account-close>${icon('close')}</button><div class="account-user-card"><div class="account-avatar">${icon('user')}</div><div><strong>Hesabınla devam et</strong><span>İşlem, bakiye ve ilanlarını buradan yönet.</span></div></div><div class="account-balance-row"><div><span>Güncel Bakiyem</span><strong>—</strong></div><a class="btn primary account-balance-action" href="/login.html" data-account-drawer-link>Giriş Yap</a></div></div><div class="account-menu-list">${section('Hesabım', 'user', [linkRow('/login.html', 'Giriş Yap'), linkRow('/register.html', 'Hesap Oluştur')])}${section('Pazar', 'store', [linkRow('/market.html', 'İlanları Gör'), linkRow('/trader-apply.html', 'Pazarcı Ol')])}${section('Destek', 'message', [linkRow('/support.html', 'Destek Merkezi'), linkRow('/contact.html', 'İletişim')])}</div>`;
  }

  function authenticatedContent() {
    const user = state.user || {};
    const role = user.role || 'user';
    const isTrader = role === 'trader';
    const admin = isAdmin(role);
    const displayName = user.name || user.email || `Kullanıcı #${user.id || ''}`;
    const initial = String(displayName || 'K').trim().charAt(0).toLocaleUpperCase('tr-TR') || 'K';
    const balance = state.wallet ? money.format(Number(state.wallet.availableBalance || 0)) : '— TL';
    const held = state.wallet && Number(state.wallet.heldBalance || 0) > 0 ? `<small>Bloke: ${esc(money.format(Number(state.wallet.heldBalance)))}</small>` : '';
    const shopRows = isTrader ? [linkRow('/trader.html', 'Pazarcı Paneli'), linkRow('/sell.html', 'İlan Ver'), linkRow('/deals.html#offers', 'Gelen Teklifler'), linkRow('/deals.html#swaps', 'Takas Talepleri')] : [linkRow('/sell.html', 'Ücretsiz İlan Ver'), linkRow('/trader-apply.html', 'Pazarcı Ol')];

    return `<div class="account-drawer-head"><button class="account-close" type="button" aria-label="Menüyü kapat" data-account-close>${icon('close')}</button><div class="account-user-card"><div class="account-avatar initial">${esc(initial)}</div><div><strong>${esc(displayName)}</strong><span>${esc(roleLabel(role))}${user.email && user.name ? ` · ${esc(user.email)}` : ''}</span></div></div><div class="account-balance-row"><div><span>Güncel Bakiyem</span><strong>${esc(balance)}</strong>${held}</div><button class="btn primary account-balance-action" type="button" data-account-topup>Bakiye Ekle</button></div></div><div class="account-menu-list">${section('Hesabım', 'user', [linkRow('/dashboard.html', 'Panelim'), linkRow('/profile.html', 'Profilim'), linkRow('/notifications.html', 'Bildirimler')])}${section('Mesajlarım', 'message', [linkRow('/notifications.html', 'İşlem Bildirimleri'), linkRow('/support.html', 'Destek Mesajları')])}${section('Siparişlerim', 'orders', [linkRow('/deals.html', 'Tüm İşlemlerim'), linkRow('/deals.html#offers', 'Tekliflerim'), linkRow('/deals.html#swaps', 'Takaslarım')])}${section('Satışlarım', 'sales', [linkRow('/sell.html', 'İlan Ver'), linkRow('/deals.html', 'Satış ve Teslimatlar')])}${section('Ödeme İşlemleri', 'wallet', [linkRow('/dashboard.html', 'Bakiye ve Hareketler'), linkRow('#', 'Nakit Çek', { soon: true })])}<div class="account-static-row"><span class="account-menu-icon">${icon('star')}</span><strong>Favorilerim</strong><em>Yakında</em></div>${section('Mağazam', 'store', shopRows)}${admin ? `<a class="account-admin-row" href="/admin.html" data-account-drawer-link><span class="account-menu-icon">${icon('shield')}</span><span><strong>Admin Paneli</strong><small>Yönetim merkezine geç</small></span></a>` : ''}${section('Hesap Ayarları', 'settings', [linkRow('/profile.html', 'Hesap ve Güvenlik'), linkRow('/profile.html#notification-preferences', 'Bildirim Tercihleri')])}<button class="account-logout" type="button" data-account-logout><span class="account-menu-icon">${icon('logout')}</span><strong>Güvenli Çıkış</strong></button></div>`;
  }

  function renderDrawer() {
    const content = document.querySelector('#accountDrawerContent');
    if (!content) return;
    content.innerHTML = state.user ? authenticatedContent() : guestContent();
    content.querySelectorAll('[data-account-close]').forEach((button) => button.addEventListener('click', closeDrawer));
    content.querySelectorAll('[data-account-drawer-link]').forEach((link) => link.addEventListener('click', closeDrawer));
    content.querySelector('[data-account-topup]')?.addEventListener('click', () => alert('Bakiye yükleme ekranı ödeme sağlayıcısı staging doğrulamasından sonra açılacak. Şimdilik bakiye hareketlerini Panelim ekranından görebilirsin.'));
    content.querySelector('[data-account-logout]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try { await fetch('/api/logout', { method: 'POST', headers: { Accept: 'application/json' } }); } finally { location.href = '/'; }
    });
  }

  function ensureLayer() {
    if (document.querySelector('#accountDrawer')) return;
    document.body.insertAdjacentHTML('beforeend', `<div class="account-backdrop" id="accountBackdrop" aria-hidden="true"></div><aside class="account-drawer" id="accountDrawer" aria-label="Hesap menüsü" aria-hidden="true"><div class="account-drawer-scroll" id="accountDrawerContent"></div></aside>`);
    document.querySelector('#accountBackdrop')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeDrawer(); });
    renderDrawer();
  }

  function openDrawer() {
    ensureLayer();
    renderDrawer();
    document.querySelector('#accountBackdrop')?.classList.add('open');
    const drawer = document.querySelector('#accountDrawer');
    drawer?.classList.add('open');
    drawer?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('account-drawer-open');
  }

  function closeDrawer() {
    document.querySelector('#accountBackdrop')?.classList.remove('open');
    const drawer = document.querySelector('#accountDrawer');
    drawer?.classList.remove('open');
    drawer?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('account-drawer-open');
  }

  function profileButtonLabel() {
    if (!state.user) return 'Hesap menüsünü aç';
    return `${state.user.name || state.user.email || 'Hesap'} menüsünü aç`;
  }

  function enhanceTopbar() {
    const topbar = document.querySelector('.topbar-inner');
    if (!topbar || topbar.dataset.accountDrawerReady === '1') return;
    topbar.dataset.accountDrawerReady = '1';
    document.querySelector('#menuButton')?.remove();
    document.querySelector('#mobileMenu')?.remove();
    const nav = topbar.querySelector('.nav');
    nav?.querySelector('a[href="/notifications.html"]')?.remove();
    nav?.querySelector('a[href="/profile.html"]')?.remove();
    const actions = document.createElement('div');
    actions.className = 'account-top-actions';
    actions.innerHTML = `<a class="account-top-icon account-bell" href="/notifications.html" aria-label="Bildirimler">${icon('bell')}</a><button class="account-top-icon account-profile-button" type="button" aria-label="${esc(profileButtonLabel())}" data-account-open>${icon('user')}</button>`;
    topbar.appendChild(actions);
    actions.querySelector('[data-account-open]')?.addEventListener('click', openDrawer);
  }

  async function hydrateAccount() {
    if (state.hydrated) return;
    if (state.hydrating) return state.hydrating;
    state.hydrating = (async () => {
      try {
        const meResponse = await fetch('/api/me', { headers: { Accept: 'application/json' } });
        if (meResponse.ok) {
          const me = await meResponse.json().catch(() => ({}));
          state.user = me.user || null;
        }
        if (state.user) {
          const walletResponse = await fetch('/api/wallet/me', { headers: { Accept: 'application/json' } });
          if (walletResponse.ok) {
            const walletData = await walletResponse.json().catch(() => ({}));
            state.wallet = walletData.wallet || null;
          }
        }
      } catch (_) {
        state.user = null;
        state.wallet = null;
      } finally {
        state.hydrated = true;
        state.hydrating = null;
        renderDrawer();
        const button = document.querySelector('[data-account-open]');
        if (button) button.setAttribute('aria-label', profileButtonLabel());
      }
    })();
    return state.hydrating;
  }

  const observer = new MutationObserver(enhanceTopbar);
  window.addEventListener('DOMContentLoaded', () => {
    ensureLayer();
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    enhanceTopbar();
    hydrateAccount();
  });
})();
