(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/market.html', '/sell.html', '/deals.html'].includes(path)) return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let enhanced = false;
  let config = null;

  async function getConfig() {
    if (config) return config;
    const response = await fetch('/api/public-config', { headers: { Accept: 'application/json' } });
    config = response.ok ? await response.json() : {};
    return config;
  }

  function mainGrid() {
    return document.querySelector('main.main .grid');
  }

  function newIdempotencyKey(listingId) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `listing-${listingId}-${random}`;
  }

  async function buyListing(button, listing) {
    if (!confirm(`${listing.title} için ${money.format(listing.price)} bakiye bloke edilecek. Devam edilsin mi?`)) return;
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'İşlem başlatılıyor…';
    try {
      const response = await fetch(`/api/market/listings/${encodeURIComponent(listing.id)}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Idempotency-Key': newIdempotencyKey(listing.id),
        },
        body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        location.href = `/login.html?next=${encodeURIComponent('/market.html')}`;
        return;
      }
      if (!response.ok) {
        const messages = {
          insufficient_balance: 'Bakiyen bu ilanı satın almak için yetersiz.',
          listing_not_available: 'Bu ilan başka bir alıcı tarafından alınmış veya artık aktif değil.',
          secure_purchase_disabled: 'Güvenli satın alma staging doğrulaması tamamlanana kadar kapalı.',
        };
        alert(messages[data.error] || 'Satın alma şu anda tamamlanamadı.');
        await renderMarket(true);
        return;
      }
      alert(`İşlem #${data.order.id} açıldı. Tutar bakiyenden güvenli şekilde bloke edildi.`);
      location.href = '/deals.html';
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function renderMarket(force = false) {
    const grid = mainGrid();
    if (!grid) return;
    if (!force && grid.dataset.marketReady === '1') return;
    grid.dataset.marketReady = '1';
    const cfg = await getConfig();
    grid.innerHTML = '<section class="card full"><div class="empty">İlanlar yükleniyor…</div></section>';
    try {
      const response = await fetch('/api/market/listings?limit=50', { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'market_failed');
      const listings = Array.isArray(data.listings) ? data.listings : [];
      if (!listings.length) {
        grid.innerHTML = '<section class="card full"><div class="empty">Şu anda aktif ilan yok. İlk ilanı sen verebilirsin.</div></section>';
        return;
      }
      grid.innerHTML = `<section class="card full"><div class="list" id="marketList">${listings.map((listing) => `
        <div class="list-item" data-listing-id="${esc(listing.id)}">
          <div style="flex:1;min-width:0">
            <strong>${esc(listing.title)}</strong>
            <span>${esc(listing.server)} · Satıcı #${esc(listing.sellerId)}${listing.description ? ` · ${esc(listing.description)}` : ''}</span>
          </div>
          <div style="text-align:right;display:grid;gap:8px;justify-items:end">
            <strong>${esc(money.format(listing.price))}</strong>
            <button class="btn primary" data-buy-listing="${esc(listing.id)}" ${cfg.securePurchaseEnabled ? '' : 'disabled'}>${cfg.securePurchaseEnabled ? 'Güvenli Satın Al' : 'Yakında'}</button>
          </div>
        </div>`).join('')}</div></section>`;
      document.querySelectorAll('[data-buy-listing]').forEach((button) => {
        const listing = listings.find((item) => String(item.id) === button.dataset.buyListing);
        if (listing) button.addEventListener('click', () => buyListing(button, listing));
      });
    } catch (_) {
      grid.innerHTML = '<section class="card full"><div class="empty">Pazar verileri staging veritabanı şeması doğrulandıktan sonra burada görünecek.</div></section>';
    }
  }

  async function renderSell() {
    const grid = mainGrid();
    if (!grid || grid.dataset.sellReady === '1') return;
    grid.dataset.sellReady = '1';
    const cfg = await getConfig();
    const enabled = Boolean(cfg.marketWritesEnabled);
    grid.innerHTML = `
      <section class="card wide">
        ${enabled ? '' : '<div class="notice" style="margin-bottom:14px">İlan yazma işlemi staging veritabanı doğrulamasına kadar güvenlik için kapalı.</div>'}
        <form class="form" id="marketSellForm">
          <div class="field"><label>Sunucu</label><select name="server"><option>ZERO</option><option>AGARTHA</option><option>PANDORA</option><option>FELIS</option></select></div>
          <div class="field"><label>İlan başlığı</label><input name="title" maxlength="160" placeholder="Örn. Mirage Dagger +8" required></div>
          <div class="field"><label>Fiyat</label><input name="price" type="number" min="0.01" step="0.01" placeholder="TL" required></div>
          <div class="field"><label>Açıklama</label><textarea name="description" maxlength="2000" rows="4" placeholder="Teslimat ve ürün detayları"></textarea></div>
          <button class="btn success" type="submit" ${enabled ? '' : 'disabled'}>İlanı Yayınla</button>
        </form>
      </section>
      <aside class="card">
        <h3>Güvenli Satış</h3>
        <p>Alıcı “Satın Al” dediğinde ilandaki fiyat sunucu tarafından okunur. Tutar alıcı bakiyesinde bloke edilir; teslim onayından sonra komisyon kesilip net tutar satıcıya geçer.</p>
        <div class="kpi">%${Number(cfg.commissionRate || 0) * 100}<small> satıcı komisyonu</small></div>
      </aside>`;

    document.querySelector('#marketSellForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!enabled) return;
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      submit.disabled = true;
      try {
        const response = await fetch('/api/market/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            server: data.get('server'),
            title: data.get('title'),
            price: data.get('price'),
            description: data.get('description'),
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 401) {
          location.href = '/login.html?next=%2Fsell.html';
          return;
        }
        if (!response.ok) throw new Error(result.error || 'listing_failed');
        alert('İlanın yayınlandı.');
        location.href = '/market.html';
      } catch (_) {
        alert('İlan şu anda yayınlanamadı.');
      } finally {
        submit.disabled = false;
      }
    });
  }

  function stateLabel(state) {
    return ({ held: 'Teslim onayı bekliyor', released: 'Tamamlandı', refunded: 'İade edildi' })[state] || state;
  }

  async function releaseOrder(button, orderId) {
    if (!confirm('Item/GB teslimini aldığını onaylıyor musun? Onaydan sonra ödeme satıcıya aktarılacak.')) return;
    button.disabled = true;
    try {
      const response = await fetch(`/api/escrow/${encodeURIComponent(orderId)}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'release_failed');
      alert('Teslim onaylandı. Satıcı ödemesi ve KOTAKAS komisyonu işlendi.');
      await renderDeals(true);
    } catch (_) {
      alert('Teslim onayı şu anda tamamlanamadı.');
    } finally {
      button.disabled = false;
    }
  }

  async function renderDeals(force = false) {
    const main = document.querySelector('main.main');
    if (!main) return;
    if (!force && main.dataset.dealsReady === '1') return;
    main.dataset.dealsReady = '1';
    const existing = main.querySelector('.card.full');
    if (existing) existing.innerHTML = '<div class="empty">İşlemler yükleniyor…</div>';
    try {
      const response = await fetch('/api/market/orders/mine?limit=50', { headers: { Accept: 'application/json' } });
      if (response.status === 401) {
        if (existing) existing.innerHTML = '<div class="empty"><a class="btn" href="/login.html?next=%2Fdeals.html">İşlemler için giriş yap</a></div>';
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'orders_failed');
      const orders = Array.isArray(data.orders) ? data.orders : [];
      const actor = String(data.actorId || '');
      if (!existing) return;
      if (!orders.length) {
        existing.innerHTML = '<div class="empty">Henüz alım veya satış işlemin yok.</div>';
        return;
      }
      existing.innerHTML = `<div class="list">${orders.map((order) => {
        const isBuyer = String(order.buyerId) === actor;
        const roleText = isBuyer ? 'Alım' : 'Satış';
        const payout = isBuyer ? money.format(order.amount) : `${money.format(order.sellerNet)} net`;
        const action = order.escrowState === 'held' && isBuyer
          ? `<button class="btn success" data-release-order="${esc(order.id)}">Teslim Aldım</button>`
          : `<span class="badge ${order.escrowState === 'released' ? 'green' : order.escrowState === 'refunded' ? 'yellow' : ''}">${esc(stateLabel(order.escrowState))}</span>`;
        return `<div class="list-item"><div style="flex:1"><strong>${esc(order.title)} · ${esc(roleText)}</strong><span>${esc(order.server)} · İşlem #${esc(order.id)} · ${esc(payout)}</span></div><div>${action}</div></div>`;
      }).join('')}</div>`;
      document.querySelectorAll('[data-release-order]').forEach((button) => button.addEventListener('click', () => releaseOrder(button, button.dataset.releaseOrder)));
    } catch (_) {
      if (existing) existing.innerHTML = '<div class="empty">İşlem geçmişi staging şeması doğrulandıktan sonra burada görünecek.</div>';
    }
  }

  async function enhance() {
    if (!document.querySelector('.page-title h1')) return;
    if (path === '/market.html') await renderMarket();
    if (path === '/sell.html') await renderSell();
    if (path === '/deals.html') await renderDeals();
    enhanced = true;
  }

  const observer = new MutationObserver(() => { if (!enhanced) enhance(); });
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(enhance, 100);
  });
})();
