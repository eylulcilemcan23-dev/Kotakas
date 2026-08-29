(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/item.html', '/deals.html'].includes(path)) return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let config = null;
  let itemTimer = null;
  let dealsTimer = null;
  let itemBusy = false;
  let dealsBusy = false;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function getConfig() {
    if (config) return config;
    const { response, data } = await jsonFetch('/api/public-config');
    config = response.ok ? data : {};
    return config;
  }

  function newIdempotencyKey(offerId) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `offer-accept-${offerId}-${random}`;
  }

  function listingId() {
    const id = new URLSearchParams(location.search).get('id');
    return id && /^\d+$/.test(id) ? id : null;
  }

  function statusLabel(status) {
    return ({ open: 'Açık', accepted: 'Kabul Edildi', rejected: 'Reddedildi', cancelled: 'İptal Edildi', expired: 'Süresi Doldu' })[status] || status;
  }

  function statusBadge(status) {
    if (status === 'accepted') return 'green';
    if (status === 'open') return 'yellow';
    return '';
  }

  function offerError(code) {
    return ({
      offer_must_be_below_price: 'Teklif, ilandaki satış fiyatından düşük olmalı.',
      self_offer_not_allowed: 'Kendi ilanına teklif veremezsin.',
      insufficient_balance: 'Alıcının kullanılabilir bakiyesi bu teklifi karşılamıyor. Teklif açık kalacak.',
      offer_not_available: 'Bu teklif artık işlem yapılabilir durumda değil.',
      idempotency_conflict: 'Aynı işlem anahtarı farklı bir işlemde kullanılmış.',
      offers_temporarily_unavailable: 'Teklif sistemi staging doğrulaması tamamlanana kadar kapalı.',
      forbidden: 'Bu teklif üzerinde işlem yapma yetkin yok.',
    })[code] || 'Teklif işlemi şu anda tamamlanamadı.';
  }

  async function submitOffer(button, id) {
    const raw = prompt('Teklif tutarını TL olarak yaz. Teklif, ilan fiyatından düşük olmalı.');
    if (raw == null) return;
    const amount = Number(String(raw).trim().replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Geçerli bir teklif tutarı yazmalısın.');
      return;
    }
    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Gönderiliyor…';
    try {
      const { response, data } = await jsonFetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id, amount }),
      });
      if (response.status === 401) {
        location.href = `/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
        return;
      }
      if (!response.ok) {
        alert(offerError(data.error));
        return;
      }
      alert(`Teklifin satıcıya iletildi: ${money.format(data.offer.amount)}`);
      await refreshItemPanels(true);
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function upgradeOfferButton(cfg, id) {
    const old = document.querySelector('button[data-coming-soon="Parçalı teklif"]');
    if (!old) return false;
    const button = old.cloneNode(true);
    old.replaceWith(button);
    button.removeAttribute('data-coming-soon');
    button.dataset.offerListing = id;
    if (!cfg.marketWritesEnabled) {
      button.disabled = true;
      button.innerHTML = 'Teklif Ver <small>Staging Bekleniyor</small>';
      return true;
    }
    button.disabled = false;
    button.textContent = 'Teklif Ver';
    button.addEventListener('click', () => submitOffer(button, id));
    return true;
  }

  function ownOfferCard(offers, id) {
    const mine = offers.filter((offer) => String(offer.listingId) === String(id));
    if (!mine.length) return '';
    return `<section class="item-detail-card offer-panel" data-offer-own-panel="1">
      <div class="item-section-title"><div><small>TEKLİFLERİM</small><h2>Bu İlana Verdiğin Teklif</h2></div></div>
      <div class="offer-list">${mine.map((offer) => `
        <div class="offer-row">
          <div><strong>${esc(money.format(offer.amount))}</strong><span>${esc(new Date(offer.updatedAt || offer.createdAt).toLocaleString('tr-TR'))}</span></div>
          <div class="offer-actions"><span class="badge ${statusBadge(offer.status)}">${esc(statusLabel(offer.status))}</span>${offer.status === 'open' ? `<button class="btn ghost" type="button" data-cancel-offer="${esc(offer.id)}">Teklifi İptal Et</button>` : ''}</div>
        </div>`).join('')}</div>
    </section>`;
  }

  function sellerOfferCard(offers, cfg) {
    return `<section class="item-detail-card offer-panel" data-offer-seller-panel="1">
      <div class="item-section-title"><div><small>SATICI PANELİ</small><h2>Gelen Teklifler</h2></div><span class="badge ${offers.some((offer) => offer.status === 'open') ? 'yellow' : ''}">${offers.filter((offer) => offer.status === 'open').length} açık</span></div>
      ${offers.length ? `<div class="offer-list">${offers.map((offer) => `
        <div class="offer-row">
          <div><strong>${esc(money.format(offer.amount))}</strong><span>Teklif #${esc(offer.id)} · ${esc(new Date(offer.updatedAt || offer.createdAt).toLocaleString('tr-TR'))}</span></div>
          <div class="offer-actions"><span class="badge ${statusBadge(offer.status)}">${esc(statusLabel(offer.status))}</span>${offer.status === 'open' ? `<button class="btn success" type="button" data-accept-offer="${esc(offer.id)}" data-offer-amount="${esc(offer.amount)}" ${cfg.securePurchaseEnabled ? '' : 'disabled'}>${cfg.securePurchaseEnabled ? 'Kabul Et' : 'Staging Bekleniyor'}</button><button class="btn ghost" type="button" data-reject-offer="${esc(offer.id)}" ${cfg.marketWritesEnabled ? '' : 'disabled'}>Reddet</button>` : ''}</div>
        </div>`).join('')}</div>` : '<div class="empty">Bu ilana henüz teklif gelmedi.</div>'}
      <div class="offer-security-note">Teklif kabul edilince teklif tutarı alıcının KOTAKAS bakiyesinden otomatik olarak blokeye alınır. Para teslimat onayına kadar satıcıya geçmez.</div>
    </section>`;
  }

  async function cancelOffer(button, offerId) {
    if (!confirm('Bu açık teklifi iptal etmek istiyor musun?')) return;
    button.disabled = true;
    const { response, data } = await jsonFetch(`/api/offers/${encodeURIComponent(offerId)}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) alert(offerError(data.error));
    await refreshItemPanels(true);
  }

  async function rejectOffer(button, offerId) {
    if (!confirm('Bu teklifi reddetmek istiyor musun?')) return;
    button.disabled = true;
    const { response, data } = await jsonFetch(`/api/offers/${encodeURIComponent(offerId)}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) alert(offerError(data.error));
    await refreshItemPanels(true);
  }

  async function acceptOffer(button, offerId, amount) {
    if (!confirm(`${money.format(Number(amount))} teklifini kabul edersen tutar alıcının KOTAKAS bakiyesinden blokeye alınacak ve ilan rezerve edilecek. Devam edilsin mi?`)) return;
    const card = button.closest('[data-offer-seller-panel]');
    card?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    const oldText = button.textContent;
    button.textContent = 'Güvenli işlem açılıyor…';
    const { response, data } = await jsonFetch(`/api/offers/${encodeURIComponent(offerId)}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': newIdempotencyKey(offerId) },
      body: '{}',
    });
    if (!response.ok) {
      alert(offerError(data.error));
      card?.querySelectorAll('button').forEach((item) => { item.disabled = false; });
      button.textContent = oldText;
      return;
    }
    alert(`Teklif kabul edildi. İşlem #${data.order.id} açıldı ve ${money.format(data.order.amount)} güvenli şekilde blokeye alındı.`);
    location.href = '/deals.html';
  }

  function bindItemOfferActions(root) {
    root?.querySelectorAll('[data-cancel-offer]').forEach((button) => button.addEventListener('click', () => cancelOffer(button, button.dataset.cancelOffer)));
    root?.querySelectorAll('[data-reject-offer]').forEach((button) => button.addEventListener('click', () => rejectOffer(button, button.dataset.rejectOffer)));
    root?.querySelectorAll('[data-accept-offer]').forEach((button) => button.addEventListener('click', () => acceptOffer(button, button.dataset.acceptOffer, button.dataset.offerAmount)));
  }

  async function refreshItemPanels(force = false) {
    if (path !== '/item.html' || itemBusy) return;
    const id = listingId();
    const shell = document.querySelector('#itemDetailRoot');
    if (!id || !shell) return;
    if (!force && shell.dataset.offersEnhanced === '1') return;
    itemBusy = true;
    try {
      const cfg = await getConfig();
      upgradeOfferButton(cfg, id);
      shell.querySelectorAll('[data-offer-own-panel],[data-offer-seller-panel]').forEach((node) => node.remove());

      const [mineResult, sellerResult] = await Promise.all([
        jsonFetch('/api/offers/mine?limit=100'),
        jsonFetch(`/api/offers/listing/${encodeURIComponent(id)}?limit=100`),
      ]);

      const anchor = shell.querySelector('.item-accordion-card') || shell.querySelector('.item-security-warning');
      if (anchor && mineResult.response.ok) {
        const html = ownOfferCard(Array.isArray(mineResult.data.offers) ? mineResult.data.offers : [], id);
        if (html) anchor.insertAdjacentHTML('beforebegin', html);
      }
      if (anchor && sellerResult.response.ok) {
        anchor.insertAdjacentHTML('beforebegin', sellerOfferCard(Array.isArray(sellerResult.data.offers) ? sellerResult.data.offers : [], cfg));
      }
      bindItemOfferActions(shell);
      shell.dataset.offersEnhanced = '1';
    } finally {
      itemBusy = false;
    }
  }

  async function cancelDealOffer(button, offerId) {
    if (!confirm('Bu açık teklifi iptal etmek istiyor musun?')) return;
    button.disabled = true;
    const { response, data } = await jsonFetch(`/api/offers/${encodeURIComponent(offerId)}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    if (!response.ok) alert(offerError(data.error));
    await renderDealsOffers(true);
  }

  function dealOffersCard(offers) {
    return `<section class="card full offer-deals-card" data-deals-offers="1">
      <div class="page-title" style="margin-bottom:12px"><div><h3>Tekliflerim</h3><p>Verdiğin parçalı teklifleri buradan takip edebilirsin.</p></div><span class="badge ${offers.some((offer) => offer.status === 'open') ? 'yellow' : 'green'}">${offers.filter((offer) => offer.status === 'open').length} açık</span></div>
      ${offers.length ? `<div class="list">${offers.map((offer) => `
        <div class="list-item">
          <div style="flex:1;min-width:0"><strong>${esc(offer.listingTitle || `İlan #${offer.listingId}`)}</strong><span>${esc(offer.server || '')} · ${esc(money.format(offer.amount))} · ${esc(new Date(offer.updatedAt || offer.createdAt).toLocaleString('tr-TR'))}</span></div>
          <div class="offer-actions"><span class="badge ${statusBadge(offer.status)}">${esc(statusLabel(offer.status))}</span><a class="btn ghost" href="/item.html?id=${encodeURIComponent(offer.listingId)}">İlanı Aç</a>${offer.status === 'open' ? `<button class="btn ghost" type="button" data-deal-cancel-offer="${esc(offer.id)}">İptal Et</button>` : ''}</div>
        </div>`).join('')}</div>` : '<div class="empty">Henüz verdiğin bir teklif yok.</div>'}
    </section>`;
  }

  async function renderDealsOffers(force = false) {
    if (path !== '/deals.html' || dealsBusy) return;
    const main = document.querySelector('main.main');
    if (!main) return;
    const old = main.querySelector('[data-deals-offers]');
    if (!force && old) return;
    dealsBusy = true;
    try {
      const { response, data } = await jsonFetch('/api/offers/mine?limit=100');
      if (!response.ok) return;
      old?.remove();
      const cards = main.querySelectorAll('section.card.full');
      const anchor = cards[cards.length - 1] || main.lastElementChild;
      if (!anchor) return;
      anchor.insertAdjacentHTML('afterend', dealOffersCard(Array.isArray(data.offers) ? data.offers : []));
      main.querySelectorAll('[data-deal-cancel-offer]').forEach((button) => button.addEventListener('click', () => cancelDealOffer(button, button.dataset.dealCancelOffer)));
    } finally {
      dealsBusy = false;
    }
  }

  function scheduleItem() {
    clearTimeout(itemTimer);
    itemTimer = setTimeout(() => refreshItemPanels(), 120);
  }

  function scheduleDeals() {
    clearTimeout(dealsTimer);
    dealsTimer = setTimeout(() => renderDealsOffers(), 180);
  }

  const observer = new MutationObserver(() => {
    if (path === '/item.html') {
      const shell = document.querySelector('#itemDetailRoot');
      if (shell && shell.dataset.offersEnhanced !== '1') scheduleItem();
    }
    if (path === '/deals.html' && !document.querySelector('[data-deals-offers]')) scheduleDeals();
  });

  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    if (path === '/item.html') setTimeout(refreshItemPanels, 450);
    if (path === '/deals.html') setTimeout(renderDealsOffers, 650);
  });
})();
