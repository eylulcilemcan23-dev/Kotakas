(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let enhanced = false;

  function stateLabel(state) {
    return ({ held: 'Beklemede', released: 'Tamamlandı', refunded: 'İade' })[state] || state;
  }

  function stateBadge(state) {
    const cls = state === 'released' ? 'green' : state === 'refunded' ? 'red' : 'yellow';
    return `<span class="badge ${cls}">${esc(stateLabel(state))}</span>`;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: 'application/json', ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function summaryCards(summary) {
    return `
      <article class="card"><h3>KOTAKAS Toplam Komisyon</h3><div class="kpi">${esc(money.format(summary.commissions.total))}</div><p>Bugün: ${esc(money.format(summary.commissions.today))} · 7 gün: ${esc(money.format(summary.commissions.last7Days))}</p></article>
      <article class="card"><h3>Blokede</h3><div class="kpi">${esc(money.format(summary.orders.heldAmount))}</div><p>${esc(summary.orders.heldCount)} bekleyen güvenli işlem</p></article>
      <article class="card"><h3>Tamamlanan Satış</h3><div class="kpi">${esc(summary.orders.releasedCount)}</div><p>Toplam hacim: ${esc(money.format(summary.orders.releasedAmount))}</p></article>
      <article class="card"><h3>İade Edilen</h3><div class="kpi">${esc(summary.orders.refundedCount)}</div><p>Toplam iade: ${esc(money.format(summary.orders.refundedAmount))}</p></article>
      <article class="card"><h3>Kullanılabilir Bakiyeler</h3><div class="kpi">${esc(money.format(summary.wallets.availableTotal))}</div><p>${esc(summary.wallets.count)} cüzdan</p></article>
      <article class="card"><h3>Toplam Bloke Bakiye</h3><div class="kpi">${esc(money.format(summary.wallets.heldTotal))}</div><p>Escrow korumasında tutulan tutar</p></article>`;
  }

  function orderRow(order, controls) {
    const title = order.listingTitle || `İşlem #${order.id}`;
    const meta = [order.listingServer, `Alıcı #${order.buyerId}`, `Satıcı #${order.sellerId}`].filter(Boolean).join(' · ');
    const canRefund = order.escrowState === 'held' && controls.financeWritesEnabled && controls.escrowApiEnabled;
    return `<div class="list-item" data-admin-order="${esc(order.id)}">
      <div style="flex:1;min-width:0">
        <strong>${esc(title)}</strong>
        <span>${esc(meta)}</span>
        <span>${esc(money.format(order.amount))} · Komisyon ${esc(money.format(order.commissionAmount))} · Satıcı net ${esc(money.format(order.sellerNet))}</span>
      </div>
      <div style="display:grid;gap:8px;justify-items:end">
        ${stateBadge(order.escrowState)}
        ${canRefund ? `<button class="btn" data-refund-order="${esc(order.id)}">İade Et</button>` : ''}
      </div>
    </div>`;
  }

  async function refundOrder(orderId, button) {
    if (!confirm(`İşlem #${orderId} için bloke tutar alıcıya tamamen iade edilsin mi?`)) return;
    button.disabled = true;
    const old = button.textContent;
    button.textContent = 'İade ediliyor…';
    try {
      const { response, data } = await api(`/api/escrow/${encodeURIComponent(orderId)}/refund`, { method: 'POST' });
      if (!response.ok) {
        alert(data.error === 'invalid_escrow_state' ? 'Bu işlem artık iade edilebilir durumda değil.' : 'İade işlemi tamamlanamadı.');
        return;
      }
      alert(`İşlem #${orderId} iade edildi.`);
      enhanced = false;
      await enhanceAdmin(true);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function enhanceAdmin(force = false) {
    const title = document.querySelector('.page-title h1');
    if (!title || title.textContent.trim() !== 'Admin Merkezi') return;
    if (enhanced && !force) return;
    enhanced = true;

    const grid = document.querySelector('main.main .grid');
    if (!grid) return;

    const summaryResult = await api('/api/admin/finance/summary');
    if (summaryResult.response.status === 401) {
      grid.innerHTML = '<section class="card full"><div class="empty"><a class="btn" href="/login.html?next=%2Fadmin.html">Admin paneli için giriş yap</a></div></section>';
      return;
    }
    if (summaryResult.response.status === 403) {
      const financeCard = [...document.querySelectorAll('.card')].find((card) => card.querySelector('h3')?.textContent?.trim() === 'Finans');
      if (financeCard) financeCard.innerHTML = '<h3>Finans</h3><p>Bu bölüm yalnızca Ana Yönetici ve Tam Yetkili yöneticilere açıktır.</p>';
      return;
    }
    if (!summaryResult.response.ok) {
      grid.insertAdjacentHTML('afterbegin', '<section class="card full"><div class="notice">Finans paneli staging veritabanı şeması doğrulamasını bekliyor.</div></section>');
      return;
    }

    const summary = summaryResult.data.summary;
    const [ordersResult, commissionsResult] = await Promise.all([
      api('/api/admin/finance/orders?limit=40'),
      api('/api/admin/finance/commissions?limit=20'),
    ]);
    const orders = ordersResult.response.ok && Array.isArray(ordersResult.data.orders) ? ordersResult.data.orders : [];
    const commissions = commissionsResult.response.ok && Array.isArray(commissionsResult.data.commissions) ? commissionsResult.data.commissions : [];

    const writeNotice = summary.controls.financeWritesEnabled && summary.controls.escrowApiEnabled
      ? '<div class="notice">Finans yazma işlemleri açık. Bekleyen escrow işlemleri dikkatle yönetilmelidir.</div>'
      : '<div class="notice">Finans yazma işlemleri staging doğrulaması tamamlanana kadar kilitli. Bu ekran şu anda salt okunur çalışır.</div>';

    grid.innerHTML = `${summaryCards(summary)}
      <section class="card full">${writeNotice}</section>
      <section class="card full">
        <div class="page-title" style="margin-bottom:14px"><div><h1 style="font-size:22px">Son İşlemler</h1><p>Escrow, satış ve iadeler.</p></div><button class="btn" id="refreshAdminFinance">Yenile</button></div>
        <div class="list">${orders.length ? orders.map((order) => orderRow(order, summary.controls)).join('') : '<div class="empty">Henüz finans işlemi yok.</div>'}</div>
      </section>
      <section class="card full">
        <h3>Son KOTAKAS Komisyonları</h3>
        <div class="list" style="margin-top:12px">${commissions.length ? commissions.map((item) => `<div class="list-item"><div style="flex:1"><strong>İşlem #${esc(item.orderId)}</strong><span>Alıcı #${esc(item.buyerId)} · Satıcı #${esc(item.sellerId)} · Satış ${esc(money.format(item.orderAmount))}</span></div><strong>${esc(money.format(item.amount))}</strong></div>`).join('') : '<div class="empty">Henüz komisyon kaydı yok.</div>'}</div>
      </section>`;

    document.querySelector('#refreshAdminFinance')?.addEventListener('click', async () => {
      enhanced = false;
      await enhanceAdmin(true);
    });
    document.querySelectorAll('[data-refund-order]').forEach((button) => {
      button.addEventListener('click', () => refundOrder(button.dataset.refundOrder, button));
    });
  }

  const observer = new MutationObserver(() => enhanceAdmin());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(enhanceAdmin, 120);
  });
})();
