(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;

  const ANSWERS_BY_QUESTION = Object.freeze({
    'Ürün hâlâ satılık mı?': [
      ['YES_AVAILABLE', 'Evet, satılık.'],
    ],
    'Şu an teslim edebilir misin?': [
      ['DELIVERY_NOW', 'Evet, şu an teslim edebilirim.'],
      ['DELIVERY_15', '15 dakika içinde teslim edebilirim.'],
      ['DELIVERY_30', '30 dakika içinde teslim edebilirim.'],
    ],
    'Tahmini teslim süresi nedir?': [
      ['DELIVERY_NOW', 'Evet, şu an teslim edebilirim.'],
      ['DELIVERY_15', '15 dakika içinde teslim edebilirim.'],
      ['DELIVERY_30', '30 dakika içinde teslim edebilirim.'],
    ],
    'İlandaki item bilgileri güncel mi?': [
      ['INFO_CURRENT', 'Evet, ilan bilgileri güncel.'],
    ],
    'Gönderdiğim teklifi kontrol eder misin?': [
      ['CHECKING_OFFER', 'Teklifini kontrol ediyorum.'],
      ['OFFER_NOT_ACCEPTABLE', 'Teklifi kabul edemiyorum.'],
      ['LISTING_PRICE_VALID', 'İlan fiyatı geçerli.'],
    ],
  });

  const ADMIN_REMOVE_SECTIONS = new Set(['Siparişlerim', 'Satışlarım', 'Ödeme İşlemleri', 'Mağazam']);

  function esc(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char]);
  }

  function shieldIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-2.6 7.7-7 10-4.4-2.3-7-5.5-7-10V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
  }

  function adminSection(title, rows) {
    const links = rows.map(([href, label]) => `<a class="account-sub-link" href="${href}" data-account-drawer-link>${esc(label)}</a>`).join('');
    return `<details class="account-section" data-faz20-admin-section><summary><span class="account-menu-icon">${shieldIcon()}</span><strong>${esc(title)}</strong><span class="account-chevron"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10l4 4 4-4"></path></svg></span></summary><div class="account-section-body">${links}</div></details>`;
  }

  function polishTrader() {
    if (path !== '/trader.html') return;

    document.querySelectorAll('.trader-question').forEach((card) => {
      const select = card.querySelector('[data-question-answer]');
      const question = card.querySelector('p')?.textContent?.trim() || '';
      if (!select || select.dataset.faz20QuestionReady === '1') return;
      const allowed = ANSWERS_BY_QUESTION[question];
      if (!allowed?.length) return;
      select.innerHTML = allowed.map(([code, label]) => `<option value="${code}">${esc(label)}</option>`).join('');
      select.dataset.faz20QuestionReady = '1';
    });

    document.querySelectorAll('[data-swap-accept]').forEach((button) => {
      if (button.dataset.faz20LabelReady === '1') return;
      button.textContent = 'Kabul Et';
      button.title = 'Takas teklifini kabul et';
      button.dataset.faz20LabelReady = '1';
    });

    const demoBadge = document.querySelector('[data-preview-demo-badge]');
    const rate = document.querySelector('.trader-rate');
    if (demoBadge?.textContent?.includes('Pazarcı') && rate && rate.dataset.faz20DemoRate !== '1') {
      const value = rate.querySelector('b')?.textContent || '';
      rate.innerHTML = `Demo komisyon <b>${esc(value)}</b>`;
      rate.title = 'Bu oran yalnız önizleme verisidir; yayın komisyon oranı değildir.';
      rate.dataset.faz20DemoRate = '1';
    }
  }

  function sectionTitle(section) {
    return section.querySelector('summary strong')?.textContent?.trim() || '';
  }

  function polishAdminDrawer() {
    const drawer = document.querySelector('#accountDrawerContent');
    const adminRow = drawer?.querySelector('.account-admin-row');
    if (!drawer || !adminRow || drawer.dataset.faz20AdminReady === '1') return;

    const meta = drawer.querySelector('.account-user-card span')?.textContent || '';
    const financeAllowed = meta.includes('Ana Yönetici') || meta.includes('Tam Yetkili');

    drawer.querySelector('.account-balance-row')?.remove();
    drawer.querySelector('.account-static-row')?.remove();

    [...drawer.querySelectorAll('.account-section')].forEach((section) => {
      const title = sectionTitle(section);
      if (ADMIN_REMOVE_SECTIONS.has(title)) section.remove();
      if (title === 'Mesajlarım') {
        const strong = section.querySelector('summary strong');
        if (strong) strong.textContent = 'Bildirimler ve Destek';
      }
    });

    const menu = drawer.querySelector('.account-menu-list');
    if (!menu) return;

    const account = [...menu.querySelectorAll('.account-section')].find((section) => sectionTitle(section) === 'Hesabım');
    const comms = [...menu.querySelectorAll('.account-section')].find((section) => sectionTitle(section) === 'Bildirimler ve Destek');
    adminRow.remove();
    (comms || account)?.insertAdjacentElement('afterend', adminRow);

    adminRow.insertAdjacentHTML('afterend', adminSection('Yönetim', [
      ['/admin.html#members', 'Üyeler'],
      ['/admin.html#traders', 'Pazarcılar'],
      ['/admin.html#applications', 'Başvurular'],
      ['/admin.html#listings', 'İlan Yönetimi'],
      ['/admin.html#disputes', 'İhtilaf ve Takas Yönetimi'],
      ['/admin.html#support', 'Destek Talepleri'],
    ]));

    if (financeAllowed) {
      const management = menu.querySelector('[data-faz20-admin-section]');
      management?.insertAdjacentHTML('afterend', adminSection('Finans ve Yetki', [
        ['/admin.html#finance', 'Finans Yönetimi'],
        ['/admin-access.html', 'Yetki Seviyeleri'],
      ]));
    }

    menu.querySelectorAll('[data-account-drawer-link]').forEach((link) => {
      if (link.dataset.faz20CloseBound === '1') return;
      link.addEventListener('click', () => {
        document.querySelector('#accountBackdrop')?.classList.remove('open');
        document.querySelector('#accountDrawer')?.classList.remove('open');
        document.body.classList.remove('account-drawer-open');
      });
      link.dataset.faz20CloseBound = '1';
    });

    drawer.dataset.faz20AdminReady = '1';
  }

  function run() {
    polishTrader();
    polishAdminDrawer();
  }

  const observer = new MutationObserver(run);
  window.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
    run();
  });
})();
