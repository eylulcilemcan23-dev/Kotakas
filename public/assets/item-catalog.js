(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/sell.html', '/market.html'].includes(path)) return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  let securePurchaseEnabled = false;
  let catalogAvailable = null;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function loadPublicConfig() {
    try {
      const { response, data } = await jsonFetch('/api/public-config');
      securePurchaseEnabled = Boolean(response.ok && data.securePurchaseEnabled);
    } catch (_) {
      securePurchaseEnabled = false;
    }
  }

  async function checkCatalog() {
    if (catalogAvailable != null) return catalogAvailable;
    try {
      const { response } = await jsonFetch('/api/item-catalog?limit=1');
      catalogAvailable = response.ok;
    } catch (_) {
      catalogAvailable = false;
    }
    return catalogAvailable;
  }

  function debounce(fn, delay = 180) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function levelOptions(levels = []) {
    return levels.map((level) => `<option value="${Number(level)}">+${Number(level)}</option>`).join('');
  }

  function hasLevel(levels, level) {
    return Number.isInteger(level) && Array.isArray(levels) && levels.map(Number).includes(level);
  }

  async function enhanceSell() {
    const form = document.querySelector('#marketSellForm');
    if (!form || form.dataset.catalogEnhanced === '1') return;
    if (!(await checkCatalog())) return;
    form.dataset.catalogEnhanced = '1';

    const titleInput = form.querySelector('input[name="title"]');
    const titleField = titleInput?.closest('.field');
    if (!titleInput || !titleField) return;
    titleInput.readOnly = true;
    titleInput.placeholder = 'Önce katalogdan item seç';

    const picker = document.createElement('div');
    picker.className = 'catalog-picker';
    picker.innerHTML = `
      <div class="field catalog-search-field">
        <label>Item seç</label>
        <input type="search" data-catalog-query maxlength="80" autocomplete="off" placeholder="IB8, MD8, HB8, WOE8, Raptor +8…">
        <small class="catalog-search-hint">Kısaltma + seviye yazabilirsin: <b>IB8</b>, <b>MD8</b>, <b>HB8</b>, <b>WOE8</b>.</small>
        <div class="catalog-results" data-catalog-results hidden></div>
      </div>
      <div class="catalog-selected" data-catalog-selected hidden></div>
      <div class="catalog-variant-grid">
        <div class="field"><label>Artı</label><select data-catalog-enhancement disabled><option>Item seç</option></select></div>
        <div class="field catalog-check-field"><label>Reverse</label><label class="catalog-check"><input type="checkbox" data-catalog-reverse disabled> Reverse item</label></div>
        <div class="field"><label>Teslimat</label><select data-delivery-window><option value="">Belirtilmedi</option><option value="15 dk içinde">15 dk içinde</option><option value="30 dk içinde">30 dk içinde</option><option value="1 saat içinde">1 saat içinde</option><option value="09:00 - 18:00">09:00 - 18:00</option></select></div>
      </div>
      <div class="catalog-source-note">Katalog kaydı seçildiğinde item adı ve özellikleri sunucudaki doğrulanmış kayıttan gelir.</div>
      <button type="button" class="catalog-manual-toggle" data-catalog-manual>Item katalogda yok</button>`;
    form.insertBefore(picker, titleField);

    const query = picker.querySelector('[data-catalog-query]');
    const results = picker.querySelector('[data-catalog-results]');
    const selected = picker.querySelector('[data-catalog-selected]');
    const enhancement = picker.querySelector('[data-catalog-enhancement]');
    const reverse = picker.querySelector('[data-catalog-reverse]');
    const delivery = picker.querySelector('[data-delivery-window]');
    const manual = picker.querySelector('[data-catalog-manual]');
    let item = null;
    let manualMode = false;

    function applyLevels(preferredLevel = null) {
      if (!item) return;
      const levels = reverse.checked ? item.reverseLevels : item.normalLevels;
      enhancement.innerHTML = levelOptions(levels);
      enhancement.disabled = levels.length === 0;
      const preferred = Number(preferredLevel);
      if (levels.length) {
        enhancement.value = String(hasLevel(levels, preferred) ? preferred : levels[levels.length - 1]);
      }
      titleInput.value = levels.length ? `${item.canonicalName} +${enhancement.value}` : item.canonicalName;
    }

    function choose(next) {
      item = next;
      manualMode = false;
      titleInput.readOnly = true;
      titleInput.value = item.canonicalName;
      const matched = Number(item.matchedEnhancement);
      const matchedNormal = hasLevel(item.normalLevels, matched);
      const matchedReverse = hasLevel(item.reverseLevels, matched);
      reverse.disabled = !item.reverseLevels?.length;
      reverse.checked = Boolean(!matchedNormal && matchedReverse);
      enhancement.disabled = false;
      selected.hidden = false;
      selected.innerHTML = `<img src="${esc(item.imageUrl || '')}" alt="" onerror="this.style.display='none'"><div><strong>${esc(item.canonicalName)}${Number.isInteger(matched) ? ` <em class="catalog-match-level">+${matched}</em>` : ''}</strong><span>${esc([item.category, item.subcategory, item.classInfo].filter(Boolean).join(' · '))}</span><small>${esc(item.source?.name ? `Kaynak: ${item.source.name}${item.source.license ? ` · ${item.source.license}` : ''}` : 'Doğrulanmış katalog')}</small></div>`;
      results.hidden = true;
      applyLevels(Number.isInteger(matched) ? matched : null);
    }

    const search = debounce(async () => {
      const term = query.value.trim();
      if (term.length < 2) {
        results.hidden = true;
        return;
      }
      const { response, data } = await jsonFetch(`/api/item-catalog?q=${encodeURIComponent(term)}&limit=8`);
      if (!response.ok) return;
      const items = Array.isArray(data.items) ? data.items : [];
      results.innerHTML = items.length ? items.map((row) => `<button type="button" class="catalog-result" data-item-id="${esc(row.id)}"><img src="${esc(row.imageUrl || '')}" alt="" onerror="this.style.display='none'"><span><strong>${esc(row.canonicalName)}${Number.isInteger(Number(row.matchedEnhancement)) ? ` <em class="catalog-match-level">+${Number(row.matchedEnhancement)}</em>` : ''}</strong><small>${esc([row.category, row.subcategory, row.classInfo].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<div class="catalog-no-result">Sonuç yok. “Item katalogda yok” seçeneğini kullanabilirsin.</div>';
      results.hidden = false;
      results.querySelectorAll('[data-item-id]').forEach((button) => button.addEventListener('click', () => {
        const found = items.find((row) => String(row.id) === button.dataset.itemId);
        if (found) choose(found);
      }));
    });

    query.addEventListener('input', search);
    reverse.addEventListener('change', () => applyLevels());
    enhancement.addEventListener('change', () => {
      if (item) titleInput.value = `${item.canonicalName} +${enhancement.value}`;
    });
    manual.addEventListener('click', () => {
      manualMode = !manualMode;
      item = manualMode ? null : item;
      titleInput.readOnly = !manualMode;
      if (manualMode) {
        selected.hidden = true;
        enhancement.disabled = true;
        reverse.disabled = true;
        titleInput.value = '';
        titleInput.placeholder = 'Örn. Shard +8';
        manual.textContent = 'Katalog seçimine dön';
      } else {
        titleInput.readOnly = true;
        titleInput.placeholder = 'Önce katalogdan item seç';
        manual.textContent = 'Item katalogda yok';
      }
    });

    form.addEventListener('submit', async (event) => {
      if (manualMode || !item) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const submit = form.querySelector('button[type="submit"]');
      const data = new FormData(form);
      submit.disabled = true;
      try {
        const { response, data: result } = await jsonFetch('/api/market/catalog-listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            server: data.get('server'),
            itemId: item.id,
            enhancement: Number(enhancement.value),
            reverse: reverse.checked,
            deliveryWindow: delivery.value,
            price: data.get('price'),
            description: data.get('description'),
          }),
        });
        if (response.status === 401) {
          location.href = '/login.html?next=%2Fsell.html';
          return;
        }
        if (!response.ok) {
          const message = ({
            monthly_listing_limit_reached: 'Bu ayki ücretsiz ilan hakkını kullandın. Daha fazla ilan için Pazarcı olabilirsin.',
            catalog_variant_unavailable: 'Bu item için seçilen + / reverse bilgisi katalogda doğrulanmadı.',
            external_contact_not_allowed: 'İlanda telefon veya sosyal medya gibi dış iletişim bilgisi kullanılamaz.',
            market_writes_disabled: 'İlan yazma staging doğrulamasına kadar kapalı.',
          })[result.error] || 'İlan şu anda yayınlanamadı.';
          alert(message);
          return;
        }
        alert('İlanın doğrulanmış item kataloğuyla yayınlandı.');
        location.href = `/item.html?id=${encodeURIComponent(result.listing.id)}`;
      } finally {
        submit.disabled = false;
      }
    }, true);
  }

  function newIdempotencyKey(listingId) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `catalog-listing-${listingId}-${random}`;
  }

  async function buy(button, listing) {
    if (!securePurchaseEnabled) return;
    if (!confirm(`${listing.title} için ${money.format(listing.price)} bakiye bloke edilecek. Devam edilsin mi?`)) return;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'İşleniyor…';
    try {
      const { response, data } = await jsonFetch(`/api/market/listings/${encodeURIComponent(listing.id)}/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': newIdempotencyKey(listing.id) },
        body: '{}',
      });
      if (response.status === 401) {
        location.href = `/login.html?next=${encodeURIComponent(`/item.html?id=${listing.id}`)}`;
        return;
      }
      if (!response.ok) {
        alert(data.error === 'insufficient_balance' ? 'Bakiyen yetersiz.' : 'İlan artık satın alınabilir değil.');
        return;
      }
      location.href = '/deals.html';
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  }

  async function enhanceMarket() {
    const grid = document.querySelector('main.main .grid');
    if (!grid || grid.dataset.catalogBrowse === '1') return;
    if (!(await checkCatalog())) return;
    const [facetsResult, probe] = await Promise.all([
      jsonFetch('/api/item-catalog/facets'),
      jsonFetch('/api/market/catalog-listings?limit=1'),
    ]);
    if (!facetsResult.response.ok || !probe.response.ok) return;
    grid.dataset.catalogBrowse = '1';
    const categories = Array.isArray(facetsResult.data.categories) ? facetsResult.data.categories : [];
    const subcategories = Array.isArray(facetsResult.data.subcategories) ? facetsResult.data.subcategories : [];
    const classes = Array.isArray(facetsResult.data.classes) ? facetsResult.data.classes : [];
    const options = (rows) => rows.map((row) => `<option value="${esc(row.name)}">${esc(row.name)} (${Number(row.count || 0)})</option>`).join('');

    grid.innerHTML = `
      <section class="card full catalog-market-filter">
        <div class="catalog-market-filter-grid">
          <div class="field catalog-market-search"><label>Item ara</label><input type="search" data-market-q maxlength="80" placeholder="IB8, MD8, HB8, WOE8, Raptor +8…"><small class="catalog-search-hint">Item adı veya KO kısaltması + seviye ile ara.</small></div>
          <div class="field"><label>Kategori</label><select data-market-category><option value="">Tümü</option>${options(categories)}</select></div>
          <div class="field"><label>Tür</label><select data-market-subcategory><option value="">Tümü</option>${options(subcategories)}</select></div>
          <div class="field"><label>Sınıf</label><select data-market-class><option value="">Tümü</option>${options(classes)}</select></div>
          <div class="field"><label>Sunucu</label><select data-market-server><option value="">Tümü</option><option>ZERO</option><option>AGARTHA</option><option>PANDORA</option><option>FELIS</option></select></div>
          <div class="field"><label>Sıralama</label><select data-market-sort><option value="new">En yeni</option><option value="price_asc">Fiyat artan</option><option value="price_desc">Fiyat azalan</option></select></div>
        </div>
      </section>
      <section class="card full" id="catalogMarketResults"><div class="empty">İlanlar yükleniyor…</div></section>`;

    const q = grid.querySelector('[data-market-q]');
    const category = grid.querySelector('[data-market-category]');
    const subcategory = grid.querySelector('[data-market-subcategory]');
    const classInfo = grid.querySelector('[data-market-class]');
    const server = grid.querySelector('[data-market-server]');
    const sort = grid.querySelector('[data-market-sort]');
    const target = grid.querySelector('#catalogMarketResults');

    async function load() {
      const params = new URLSearchParams({ limit: '60', sort: sort.value });
      if (q.value.trim()) params.set('q', q.value.trim());
      if (category.value) params.set('category', category.value);
      if (subcategory.value) params.set('subcategory', subcategory.value);
      if (classInfo.value) params.set('class', classInfo.value);
      if (server.value) params.set('server', server.value);
      target.innerHTML = '<div class="empty">İlanlar yükleniyor…</div>';
      const { response, data } = await jsonFetch(`/api/market/catalog-listings?${params}`);
      if (!response.ok) {
        target.innerHTML = '<div class="empty">Katalog araması şu anda kullanılamıyor.</div>';
        return;
      }
      const listings = Array.isArray(data.listings) ? data.listings : [];
      if (!listings.length) {
        target.innerHTML = '<div class="empty">Bu filtrelerde aktif ilan bulunamadı.</div>';
        return;
      }
      target.innerHTML = `<div class="catalog-market-list">${listings.map((listing) => `<article class="catalog-market-row">
        <a class="catalog-market-item" href="/item.html?id=${encodeURIComponent(listing.id)}">
          <div class="catalog-market-image">${listing.item?.imageUrl ? `<img src="${esc(listing.item.imageUrl)}" alt="${esc(listing.title)}">` : '<span>KO</span>'}</div>
          <div class="catalog-market-copy"><strong>${esc(listing.title)}${listing.reverse ? ' <em class="catalog-reverse-badge">REB</em>' : ''}</strong><span>${esc([listing.server, listing.item?.subcategory || listing.item?.category, listing.item?.classInfo].filter(Boolean).join(' · '))}</span>${listing.description ? `<small>${esc(listing.description)}</small>` : ''}</div>
        </a>
        <div class="catalog-market-price"><strong>${esc(money.format(listing.price))}</strong>${listing.deliveryWindow ? `<small>${esc(listing.deliveryWindow)}</small>` : ''}<div><a class="btn ghost catalog-market-btn" href="/item.html?id=${encodeURIComponent(listing.id)}">İncele</a><button class="btn primary catalog-market-btn" data-catalog-buy="${esc(listing.id)}" ${securePurchaseEnabled ? '' : 'disabled'}>${securePurchaseEnabled ? 'Satın Al' : 'Yakında'}</button></div></div>
      </article>`).join('')}</div>`;
      target.querySelectorAll('[data-catalog-buy]').forEach((button) => {
        const listing = listings.find((row) => String(row.id) === button.dataset.catalogBuy);
        if (listing) button.addEventListener('click', () => buy(button, listing));
      });
    }

    const delayedLoad = debounce(load, 220);
    q.addEventListener('input', delayedLoad);
    category.addEventListener('change', load);
    subcategory.addEventListener('change', load);
    classInfo.addEventListener('change', load);
    server.addEventListener('change', load);
    sort.addEventListener('change', load);
    await load();
  }

  const observer = new MutationObserver(() => {
    if (path === '/sell.html') enhanceSell();
    if (path === '/market.html') enhanceMarket();
  });

  window.addEventListener('DOMContentLoaded', async () => {
    await loadPublicConfig();
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    if (path === '/sell.html') setTimeout(enhanceSell, 120);
    if (path === '/market.html') setTimeout(enhanceMarket, 180);
  });
})();
