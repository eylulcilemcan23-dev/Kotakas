(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/item.html', '/deals.html'].includes(path)) return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let config = null;
  let busy = false;
  let timer = null;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function getConfig() {
    if (config) return config;
    const { response, data } = await api('/api/public-config');
    config = response.ok ? data : {};
    return config;
  }

  function listingId() {
    const id = new URLSearchParams(location.search).get('id');
    return id && /^\d+$/.test(id) ? id : null;
  }

  function statusLabel(status) {
    return ({ pending: 'Yanıt Bekliyor', active: 'Teslimat Aşamasında', completed: 'Tamamlandı', rejected: 'Reddedildi', cancelled: 'İptal Edildi', disputed: 'Yönetim İncelemesinde' })[status] || status;
  }

  function statusClass(status) {
    if (status === 'completed') return 'green';
    if (status === 'active' || status === 'pending') return 'yellow';
    if (status === 'disputed') return 'red';
    return '';
  }

  function errorMessage(code) {
    return ({
      swap_server_mismatch: 'Takas yalnızca aynı oyun sunucusundaki ilanlar arasında yapılabilir.',
      self_swap_not_allowed: 'Kendi ilanların arasında takas oluşturamazsın.',
      swap_not_available: 'Bu takas veya ilanlar artık uygun durumda değil.',
      swaps_temporarily_unavailable: 'Takas sistemi staging doğrulaması tamamlanana kadar kapalı.',
      forbidden: 'Bu takas üzerinde işlem yapma yetkin yok.',
      invalid_swap_request: 'Takas isteği geçersiz.',
    })[code] || 'Takas işlemi şu anda tamamlanamadı.';
  }

  function swapRow(swap, compact = false) {
    const my = swap.myListing || swap.offeredListing;
    const their = swap.theirListing || swap.requestedListing;
    const pendingIncoming = swap.status === 'pending' && swap.perspective === 'recipient';
    const pendingOutgoing = swap.status === 'pending' && swap.perspective === 'proposer';
    const canConfirm = swap.status === 'active' && !swap.myReceivedAt;
    const receipt = swap.status === 'active'
      ? `<span class="swap-receipt-state">Sen: ${swap.myReceivedAt ? '✓ aldım' : 'bekliyor'} · Karşı taraf: ${swap.otherReceivedAt ? '✓ aldı' : 'bekliyor'}</span>`
      : '';
    const actions = [
      pendingIncoming ? `<button class="btn success" data-swap-accept="${esc(swap.id)}">Kabul Et</button><button class="btn ghost" data-swap-reject="${esc(swap.id)}">Reddet</button>` : '',
      pendingOutgoing ? `<button class="btn ghost" data-swap-cancel="${esc(swap.id)}">Teklifi Geri Çek</button>` : '',
      canConfirm ? `<button class="btn success" data-swap-confirm="${esc(swap.id)}">Karşı Itemi Teslim Aldım</button><button class="btn ghost" data-swap-problem="${esc(swap.id)}">Sorun Bildir</button>` : '',
      swap.status === 'active' && swap.myReceivedAt ? `<button class="btn ghost" data-swap-problem="${esc(swap.id)}">Sorun Bildir</button>` : '',
    ].filter(Boolean).join('');
    return `<div class="swap-row" data-swap-id="${esc(swap.id)}">
      <div class="swap-pair">
        <div><small>${compact ? 'SENİN İLANIN' : 'BENİM ITEMİM'}</small><strong>${esc(my.title)}</strong><span>${esc(my.server)} · ${esc(money.format(my.price))}</span></div>
        <b class="swap-arrow">⇄</b>
        <div><small>${compact ? 'KARŞI İLAN' : 'İSTEDİĞİM ITEM'}</small><strong>${esc(their.title)}</strong><span>${esc(their.server)} · ${esc(money.format(their.price))}</span></div>
      </div>
      <div class="swap-row-footer"><div><span class="badge ${statusClass(swap.status)}">${esc(statusLabel(swap.status))}</span>${receipt}</div><div class="swap-actions">${actions}</div></div>
      ${swap.status === 'disputed' ? '<div class="swap-warning">İki ilan da yönetim kararı verilene kadar kilitli kalır.</div>' : ''}
    </div>`;
  }

  function bindActions(root) {
    root?.querySelectorAll('[data-swap-accept]').forEach((button) => button.addEventListener('click', () => postAction(button, button.dataset.swapAccept, 'accept', 'Takas teklifini kabul edersen iki ilan da teslimat tamamlanana kadar kilitlenecek. Devam edilsin mi?')));
    root?.querySelectorAll('[data-swap-reject]').forEach((button) => button.addEventListener('click', () => postAction(button, button.dataset.swapReject, 'reject', 'Takas teklifini reddetmek istiyor musun?')));
    root?.querySelectorAll('[data-swap-cancel]').forEach((button) => button.addEventListener('click', () => postAction(button, button.dataset.swapCancel, 'cancel', 'Bekleyen takas teklifini geri çekmek istiyor musun?')));
    root?.querySelectorAll('[data-swap-confirm]').forEach((button) => button.addEventListener('click', () => postAction(button, button.dataset.swapConfirm, 'confirm-receipt', 'Karşı item gerçekten oyun hesabına ulaştı mı? Bu onayı yalnızca itemi aldıysan ver.')));
    root?.querySelectorAll('[data-swap-problem]').forEach((button) => button.addEventListener('click', () => reportProblem(button, button.dataset.swapProblem)));
  }

  async function postAction(button, id, action, question) {
    if (!confirm(question)) return;
    button.disabled = true;
    const { response, data } = await api(`/api/swaps/${encodeURIComponent(id)}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) alert(errorMessage(data.error));
    else if (action === 'accept') alert('Takas kabul edildi. İki ilan da kilitlendi; artık yalnızca teslimat onayları veya yönetim incelemesiyle sonuçlanabilir.');
    else if (action === 'confirm-receipt') alert(data.swap?.status === 'completed' ? 'İki taraf da teslimatı onayladı. Takas tamamlandı.' : 'Teslim aldım onayın kaydedildi. Karşı tarafın onayı bekleniyor.');
    await refresh(true);
  }

  async function reportProblem(button, id) {
    const reason = prompt('Takasla ilgili sorunu yönetime yaz. En az 10 karakter. Bu metin karşı tarafa serbest sohbet olarak iletilmez.');
    if (reason == null) return;
    if (reason.trim().length < 10) return alert('Sorunu biraz daha ayrıntılı yazmalısın.');
    button.disabled = true;
    const { response, data } = await api(`/api/swaps/${encodeURIComponent(id)}/problem`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!response.ok) alert(errorMessage(data.error));
    else alert('Sorun yönetime iletildi. İki ilan da karar verilene kadar kilitli kalacak.');
    await refresh(true);
  }

  async function chooseListing(targetId) {
    const [{ response: targetResponse, data: targetData }, { response: mineResponse, data: mineData }] = await Promise.all([
      api(`/api/market/listings/${encodeURIComponent(targetId)}/detail`),
      api('/api/market/listings/mine?limit=100'),
    ]);
    if (mineResponse.status === 401) {
      location.href = `/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
      return;
    }
    if (!targetResponse.ok || !mineResponse.ok) return alert('Takas için ilanların şu anda yüklenemedi.');
    const target = targetData.listing;
    const mine = (Array.isArray(mineData.listings) ? mineData.listings : []).filter((item) => item.status === 'active' && String(item.server).toUpperCase() === String(target.server).toUpperCase() && String(item.id) !== String(target.id));
    let panel = document.querySelector('[data-swap-picker]');
    panel?.remove();
    panel = document.createElement('section');
    panel.className = 'item-detail-card swap-picker';
    panel.dataset.swapPicker = '1';
    panel.innerHTML = `<div class="item-section-title"><div><small>TAKAS TEKLİFİ</small><h2>Hangi itemini teklif edeceksin?</h2></div><button class="btn ghost" type="button" data-close-swap-picker>Kapat</button></div>
      <div class="swap-policy-note">Serbest mesajlaşma ve nakit fark yoktur. Yalnızca aynı sunucudaki kendi aktif ilanınla takas teklif edebilirsin.</div>
      ${mine.length ? `<div class="swap-picker-list">${mine.map((item) => `<button type="button" class="swap-picker-item" data-offer-swap-listing="${esc(item.id)}"><span><strong>${esc(item.title)}</strong><small>${esc(item.server)} · ${esc(money.format(item.price))}</small></span><b>Bu itemi teklif et</b></button>`).join('')}</div>` : '<div class="empty">Bu sunucuda takasa sunabileceğin başka aktif ilanın yok. Önce kendi itemini ilan olarak eklemelisin.</div>'}`;
    const anchor = document.querySelector('.item-accordion-card') || document.querySelector('.item-security-warning');
    anchor?.insertAdjacentElement('beforebegin', panel);
    panel.querySelector('[data-close-swap-picker]')?.addEventListener('click', () => panel.remove());
    panel.querySelectorAll('[data-offer-swap-listing]').forEach((button) => button.addEventListener('click', () => createSwap(button, button.dataset.offerSwapListing, targetId)));
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function createSwap(button, offeredListingId, requestedListingId) {
    if (!confirm('Bu iki item arasında takas teklifi gönderilsin mi? Nakit fark ve serbest mesajlaşma kullanılamaz.')) return;
    button.disabled = true;
    const { response, data } = await api('/api/swaps', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ offeredListingId, requestedListingId }),
    });
    if (!response.ok) alert(errorMessage(data.error));
    else {
      alert('Takas teklifin gönderildi. Karşı taraf kabul edene kadar iki ilan da satışta kalır; kabul anında ikisi birden kilitlenir.');
      document.querySelector('[data-swap-picker]')?.remove();
    }
    await refresh(true);
  }

  async function upgradeSwapButton() {
    if (path !== '/item.html') return;
    const id = listingId();
    const old = document.querySelector('button[data-coming-soon="Takas"]');
    if (!id || !old) return;
    const cfg = await getConfig();
    const button = old.cloneNode(true);
    old.replaceWith(button);
    button.removeAttribute('data-coming-soon');
    button.dataset.swapStart = id;
    if (!cfg.swapWritesEnabled || !cfg.marketWritesEnabled) {
      button.disabled = true;
      button.innerHTML = 'Takas Yap <small>Staging Bekleniyor</small>';
      return;
    }
    button.disabled = false;
    button.textContent = 'Takas Yap';
    button.addEventListener('click', () => chooseListing(id));
  }

  async function renderItemSwaps(swaps) {
    const id = listingId();
    const shell = document.querySelector('#itemDetailRoot');
    if (!id || !shell) return;
    shell.querySelector('[data-item-swaps]')?.remove();
    const relevant = swaps.filter((swap) => [swap.offeredListing?.id, swap.requestedListing?.id].map(String).includes(String(id)));
    if (!relevant.length) return;
    const card = document.createElement('section');
    card.className = 'item-detail-card swap-panel';
    card.dataset.itemSwaps = '1';
    card.innerHTML = `<div class="item-section-title"><div><small>TAKASLAR</small><h2>Bu İlanla İlgili Takaslar</h2></div><span class="badge">${relevant.length}</span></div><div class="swap-list">${relevant.map((swap) => swapRow(swap)).join('')}</div>`;
    const anchor = shell.querySelector('.item-accordion-card') || shell.querySelector('.item-security-warning');
    anchor?.insertAdjacentElement('beforebegin', card);
    bindActions(card);
  }

  function renderDealsSwaps(swaps) {
    const main = document.querySelector('main.main');
    if (!main) return;
    main.querySelector('[data-deals-swaps]')?.remove();
    const card = document.createElement('section');
    card.className = 'card full swap-deals-card';
    card.dataset.dealsSwaps = '1';
    card.innerHTML = `<div class="page-title" style="margin-bottom:12px"><div><h3>Takas İşlemlerim</h3><p>Teklif, iki taraflı teslim onayı ve yönetim inceleme durumlarını buradan takip et.</p></div><span class="badge ${swaps.some((swap) => ['pending','active','disputed'].includes(swap.status)) ? 'yellow' : 'green'}">${swaps.filter((swap) => ['pending','active','disputed'].includes(swap.status)).length} açık</span></div>
      <div class="swap-list">${swaps.length ? swaps.map((swap) => swapRow(swap, true)).join('') : '<div class="empty">Henüz bir takas teklifin veya işlemin yok.</div>'}</div>`;
    main.appendChild(card);
    bindActions(card);
  }

  async function refresh(force = false) {
    if (busy) return;
    const shell = path === '/item.html' ? document.querySelector('#itemDetailRoot') : document.querySelector('main.main');
    if (!shell) return;
    if (!force && shell.dataset.swapEnhanced === '1') return;
    busy = true;
    try {
      await upgradeSwapButton();
      const { response, data } = await api('/api/swaps/mine?limit=100');
      if (response.status === 401) {
        shell.dataset.swapEnhanced = '1';
        return;
      }
      if (response.ok) {
        const swaps = Array.isArray(data.swaps) ? data.swaps : [];
        if (path === '/item.html') await renderItemSwaps(swaps);
        if (path === '/deals.html') renderDealsSwaps(swaps);
      }
      shell.dataset.swapEnhanced = '1';
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => refresh(), 160);
  }

  const observer = new MutationObserver(() => schedule());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => refresh(), 320);
  });
})();
