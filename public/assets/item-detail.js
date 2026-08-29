(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const statCache = new Map();
  let detailBooted = false;

  function newIdempotencyKey(listingId) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `listing-detail-${listingId}-${random}`;
  }

  function formatDuration(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value <= 0) return 'Henüz veri yok';
    if (value < 60) return `~${Math.round(value)} dk`;
    const hours = value / 60;
    return `~${hours < 10 ? hours.toFixed(1) : Math.round(hours)} saat`;
  }

  function statusLabel(status) {
    return ({ active: 'Satışta', reserved: 'İşlemde', sold: 'Satıldı', cancelled: 'Kaldırıldı' })[status] || status;
  }

  function statusClass(status) {
    if (status === 'active') return 'green';
    if (status === 'reserved') return 'yellow';
    if (status === 'sold' || status === 'cancelled') return 'red';
    return '';
  }

  function rangeLabel(range) {
    return ({ weekly: 'Haftalık', monthly: 'Aylık', yearly: 'Yıllık' })[range] || 'Haftalık';
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function buyListing(button, listing) {
    if (listing.status !== 'active') return;
    if (!confirm(`${listing.title} için ${money.format(listing.price)} tutar güvenli işlemde bloke edilecek. Devam edilsin mi?`)) return;
    const buttons = [...document.querySelectorAll('[data-detail-buy]')];
    buttons.forEach((item) => { item.disabled = true; });
    const oldText = button.textContent;
    button.textContent = 'İşlem başlatılıyor…';
    try {
      const { response, data } = await jsonFetch(`/api/market/listings/${encodeURIComponent(listing.id)}/buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': newIdempotencyKey(listing.id),
        },
        body: '{}',
      });
      if (response.status === 401) {
        location.href = `/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
        return;
      }
      if (!response.ok) {
        const messages = {
          insufficient_balance: 'Bakiyen bu ilan için yetersiz.',
          listing_not_available: 'Bu ilan artık satın alınabilir durumda değil.',
          secure_purchase_disabled: 'Güvenli satın alma staging doğrulaması tamamlanana kadar kapalı.',
        };
        alert(messages[data.error] || 'Satın alma şu anda tamamlanamadı.');
        return;
      }
      alert(`İşlem #${data.order.id} açıldı. Ödeme güvenli şekilde blokeye alındı.`);
      location.href = '/deals.html';
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
      button.textContent = oldText;
    }
  }

  function detailMark(listing) {
    const item = listing.item || {};
    if (item.imageUrl) {
      return `<div class="item-detail-mark has-image"><img class="item-detail-image" src="${esc(item.imageUrl)}" alt="${esc(item.canonicalName || listing.title)}" loading="eager"><small>${esc(listing.enhancementLabel || '')}</small></div>`;
    }
    const title = String(item.canonicalName || listing.title || 'K').replace(/[^a-zA-Z0-9+]/g, ' ').trim();
    const letters = title.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'K';
    return `<div class="item-detail-mark" aria-hidden="true"><span>${esc(letters)}</span><small>${esc(listing.enhancementLabel || '')}</small></div>`;
  }

  function attributeLabel(key) {
    return ({
      attackPower: 'Attack Power', attack_power: 'Attack Power', attackSpeed: 'Attack Speed', attack_speed: 'Attack Speed',
      effectiveRange: 'Effective Range', effective_range: 'Effective Range', weight: 'Weight', maxDurability: 'Max Durability',
      max_durability: 'Max Durability', poisonDamage: 'Poison Damage', poison_damage: 'Poison Damage', requiredStrength: 'Required Strength',
      required_strength: 'Required Strength', flameDamage: 'Flame Damage', glacierDamage: 'Glacier Damage', lightningDamage: 'Lightning Damage',
    })[key] || String(key).replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function attributeRows(listing) {
    const attrs = listing.item?.attributes;
    if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return '';
    return Object.entries(attrs).slice(0, 12).map(([key, value]) => {
      const shown = value == null ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `<div><dt>${esc(attributeLabel(key))}</dt><dd>${esc(shown)}</dd></div>`;
    }).join('');
  }

  function howToBuy() {
    return `<div class="guide-steps">
      <div><b>1</b><span><strong>İlanı incele</strong><small>Sunucu, fiyat, açıklama ve satıcı geçmişini kontrol et.</small></span></div>
      <div><b>2</b><span><strong>Güvenli Satın Al</strong><small>İşlem açılınca ilan fiyatı sunucu tarafından okunur; istemciden fiyat kabul edilmez.</small></span></div>
      <div><b>3</b><span><strong>Tutar blokeye alınır</strong><small>Para doğrudan satıcıya gitmez; KOTAKAS güvenli işlem bakiyesinde bekler.</small></span></div>
      <div><b>4</b><span><strong>Teslimatı bekle</strong><small>Satıcı item veya GB teslimatını tamamlar. Teslim detaylarını İşlemlerim ekranından takip et.</small></span></div>
      <div><b>5</b><span><strong>Kontrol et</strong><small>Ürün gerçekten hesabına ulaştıysa “Teslim Aldım” onayını ver.</small></span></div>
      <div><b>6</b><span><strong>İşlem tamamlanır</strong><small>Onaydan sonra komisyon ayrılır ve satıcının net bakiyesi otomatik aktarılır.</small></span></div>
    </div>`;
  }

  function howToSell() {
    return `<div class="guide-steps">
      <div><b>1</b><span><strong>İlan oluştur</strong><small>Sunucu, item adı, fiyat ve teslimat açıklamasını doğru gir.</small></span></div>
      <div><b>2</b><span><strong>Alıcı işlemini bekle</strong><small>Satın alma başladığında ilan rezerve edilir ve aynı ilan ikinci kez satılamaz.</small></span></div>
      <div><b>3</b><span><strong>Doğru kişiye teslim et</strong><small>Yalnızca işlem ekranında doğruladığın teslim bilgilerine göre hareket et.</small></span></div>
      <div><b>4</b><span><strong>Alıcı kontrolü</strong><small>Alıcı teslimatı onaylayana kadar tutar blokede kalır.</small></span></div>
      <div><b>5</b><span><strong>Komisyon otomatik ayrılır</strong><small>KOTAKAS komisyonu işlem tutarından sistem tarafından hesaplanır.</small></span></div>
      <div><b>6</b><span><strong>Net bakiye hesabına geçer</strong><small>Başarılı işlem satıcı geçmişine eklenir.</small></span></div>
    </div>`;
  }

  function sparkline(points, valueKey, emptyText) {
    const values = points.map((point) => Number(point[valueKey])).filter(Number.isFinite);
    if (!values.length) return `<div class="item-chart-empty"><p>${esc(emptyText)}</p></div>`;
    const width = 760;
    const height = 220;
    const pad = 20;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, Math.max(1, max * 0.01));
    const coords = values.map((value, index) => {
      const x = values.length === 1 ? width / 2 : pad + (index / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / spread) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `<div class="item-chart-real"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gerçek piyasa verisi"><polyline points="${coords.join(' ')}"></polyline>${values.map((value, index) => {
      const pair = coords[index].split(',');
      return `<circle cx="${pair[0]}" cy="${pair[1]}" r="4"><title>${esc(money.format(value))}</title></circle>`;
    }).join('')}</svg><div class="item-chart-scale"><span>${esc(money.format(min))}</span><span>${esc(money.format(max))}</span></div></div>`;
  }

  function statTabs(range) {
    return `<div class="item-stat-tabs" role="tablist">${['weekly', 'monthly', 'yearly'].map((key) => `<button type="button" class="item-stat-tab ${key === range ? 'active' : ''}" data-stat-range="${key}">${rangeLabel(key)}</button>`).join('')}</div>`;
  }

  function statsPanel(listing, stats = null, range = 'weekly') {
    const label = rangeLabel(range);
    if (!stats) {
      return `${statTabs(range)}<div class="item-chart-card"><div><span>Fiyat Geçmişi</span><strong>${esc(money.format(listing.price))}</strong></div><div class="item-chart-empty"><p>${label} gerçek piyasa verisi yükleniyor.</p></div></div>`;
    }
    const priceSummary = stats.priceSummary || {};
    const offers = stats.offersSummary || {};
    const priceHistory = Array.isArray(stats.priceHistory) ? stats.priceHistory : [];
    const offerHistory = Array.isArray(stats.offerHistory) ? stats.offerHistory : [];
    const change = priceSummary.changePercent == null ? '—' : `${priceSummary.changePercent > 0 ? '+' : ''}%${priceSummary.changePercent}`;
    const priceBody = stats.historyReady
      ? sparkline(priceHistory, 'price', `${label} dönemde henüz fiyat noktası oluşmadı.`)
      : '<div class="item-chart-empty"><p>Fiyat geçmişi staging migrationı uygulanınca burada gerçek veriler birikmeye başlayacak.</p></div>';
    const offerBody = stats.offersReady
      ? sparkline(offerHistory, 'averageAmount', `${label} dönemde henüz teklif kaydı yok.`)
      : '<div class="item-chart-empty"><p>Teklif istatistikleri staging şeması doğrulanınca gerçek kayıtlarla açılacak.</p></div>';

    return `${statTabs(range)}
      <div class="item-stat-kpis"><div><strong>${esc(change)}</strong><span>Fiyat değişimi</span></div><div><strong>${priceSummary.min == null ? '—' : esc(money.format(priceSummary.min))}</strong><span>En düşük</span></div><div><strong>${priceSummary.max == null ? '—' : esc(money.format(priceSummary.max))}</strong><span>En yüksek</span></div><div><strong>${Number(offers.count || 0)}</strong><span>Teklif</span></div></div>
      <div class="item-chart-card"><div><span>Fiyat Geçmişi · ${label}</span><strong>${esc(money.format(stats.currentPrice ?? listing.price))}</strong></div>${priceBody}</div>
      <div class="item-chart-card"><div><span>Fiyat Teklifleri · ${label}</span><strong>${offers.averageAmount == null ? 'Veri yok' : esc(money.format(offers.averageAmount))}</strong></div>${offerBody}<div class="item-offer-summary"><span>Açık: <b>${Number(offers.openCount || 0)}</b></span><span>Kabul: <b>${Number(offers.acceptedCount || 0)}</b></span><span>Ort.: <b>${offers.averageAmount == null ? '—' : esc(money.format(offers.averageAmount))}</b></span></div></div>`;
  }

  async function loadStats(listingId, range) {
    const key = `${listingId}:${range}`;
    if (statCache.has(key)) return statCache.get(key);
    const result = await jsonFetch(`/api/market/listings/${encodeURIComponent(listingId)}/stats?range=${encodeURIComponent(range)}`);
    const stats = result.response.ok ? result.data.statistics : null;
    statCache.set(key, stats);
    return stats;
  }

  function bindStatTabs(root, listing) {
    if (!root) return;
    root.querySelectorAll('[data-stat-range]').forEach((button) => button.addEventListener('click', async () => {
      const range = button.dataset.statRange;
      root.innerHTML = statsPanel(listing, null, range);
      bindStatTabs(root, listing);
      const stats = await loadStats(listing.id, range).catch(() => null);
      root.innerHTML = statsPanel(listing, stats, range);
      bindStatTabs(root, listing);
    }));
  }

  function renderDetail(main, listing, cfg, initialStats) {
    const active = listing.status === 'active';
    const purchaseReady = Boolean(active && cfg.securePurchaseEnabled);
    const seller = listing.seller || {};
    const item = listing.item || {};
    document.title = `${listing.title} | KOTAKAS`;
    main.innerHTML = `<div class="item-detail-shell" id="itemDetailRoot">
      <div class="item-detail-breadcrumb"><a href="/market.html">Pazar</a><span>›</span><span>${esc(listing.server)}</span><span>›</span><strong>${esc(item.canonicalName || listing.title)}</strong></div>

      <section class="item-detail-hero">
        <div class="item-detail-identity">
          ${detailMark(listing)}
          <div><div class="item-detail-tags"><span class="badge">${esc(listing.server)}</span>${listing.enhancementLabel ? `<span class="badge">${esc(listing.enhancementLabel)}</span>` : ''}${listing.reverse != null ? `<span class="badge">${listing.reverse ? 'Reverse' : 'Normal'}</span>` : ''}<span class="badge ${statusClass(listing.status)}">${esc(statusLabel(listing.status))}</span></div><h1>${esc(listing.title)}</h1><p>${esc(listing.description || 'Satıcı bu ilan için ek açıklama girmedi.')}</p>${item.classInfo ? `<div class="item-class-info">${esc(item.classInfo)}</div>` : ''}</div>
        </div>
        <div class="item-detail-pricebox"><small>İlan fiyatı</small><strong>${esc(money.format(listing.price))}</strong>${listing.deliveryWindow ? `<span>Teslimat: ${esc(listing.deliveryWindow)}</span>` : ''}<span>Son güncelleme: ${esc(new Date(listing.updatedAt).toLocaleString('tr-TR'))}</span><button class="btn primary item-detail-main-buy" type="button" data-detail-buy ${purchaseReady ? '' : 'disabled'}>${purchaseReady ? 'Güvenli Satın Al' : active ? 'Staging Doğrulaması Bekleniyor' : statusLabel(listing.status)}</button></div>
      </section>

      <div class="item-detail-columns">
        <section class="item-detail-card seller-detail-card">
          <div class="item-section-title"><div><small>SATICI</small><h2>${esc(seller.displayName || `Satıcı #${listing.sellerId}`)}</h2></div><span class="seller-avatar">${esc(String(listing.sellerId).slice(-2))}</span></div>
          <div class="seller-detail-stats"><div><strong>${Number(seller.successfulSales || 0)}</strong><span>Başarılı satış</span></div><div><strong>${esc(formatDuration(seller.averageCompletionMinutes))}</strong><span>Ort. işlem süresi</span></div><div><strong>${seller.verified === true ? 'Doğrulandı' : '—'}</strong><span>Doğrulama</span></div></div>
          <button class="btn ghost" type="button" data-seller-question>Satıcıya Sor</button>
        </section>

        <section class="item-detail-card">
          <div class="item-section-title"><div><small>İLAN / ITEM BİLGİLERİ</small><h2>Özellikler</h2></div></div>
          <dl class="item-facts"><div><dt>Sunucu</dt><dd>${esc(listing.server)}</dd></div><div><dt>Artı</dt><dd>${esc(listing.enhancementLabel || 'Belirtilmedi')}</dd></div><div><dt>Reverse</dt><dd>${listing.reverse == null ? 'Belirtilmedi' : listing.reverse ? 'Evet' : 'Hayır'}</dd></div>${item.classInfo ? `<div><dt>Sınıf</dt><dd>${esc(item.classInfo)}</dd></div>` : ''}${listing.deliveryWindow ? `<div><dt>Teslimat</dt><dd>${esc(listing.deliveryWindow)}</dd></div>` : ''}${attributeRows(listing)}<div><dt>İlan tarihi</dt><dd>${esc(new Date(listing.createdAt).toLocaleDateString('tr-TR'))}</dd></div><div><dt>Durum</dt><dd>${esc(statusLabel(listing.status))}</dd></div></dl>
        </section>
      </div>

      <section class="item-detail-card item-actions-card"><button class="btn primary" type="button" data-detail-buy ${purchaseReady ? '' : 'disabled'}>${purchaseReady ? 'Güvenli Satın Al' : 'Satın Alma Şimdilik Kapalı'}</button><button class="btn" type="button" data-coming-soon="Takas">Takas Yap <small>Yakında</small></button><button class="btn" type="button" data-coming-soon="Parçalı teklif">Parçalı Teklif Ver <small>Yakında</small></button></section>

      <section class="item-detail-card item-accordion-card">
        <button class="item-accordion-button" type="button" data-accordion="buyGuide"><span>Nasıl Alınır?</span><b>+</b></button><div class="item-accordion-panel" id="buyGuide" hidden>${howToBuy()}</div>
        <button class="item-accordion-button" type="button" data-accordion="sellGuide"><span>Nasıl Satılır?</span><b>+</b></button><div class="item-accordion-panel" id="sellGuide" hidden>${howToSell()}</div>
        <button class="item-accordion-button" type="button" data-accordion="reportGuide"><span>Hata Bildir</span><b>+</b></button><div class="item-accordion-panel" id="reportGuide" hidden><p>İlan bilgisinde hata görüyorsan ürün adı, sunucu veya fiyat detayını açıklayarak destek talebi açabilirsin.</p><a class="btn ghost" href="/support.html">Destek Talebi Aç</a></div>
      </section>

      <section class="item-security-warning"><div class="item-warning-icon">!</div><div><h2>Güvenli İşlem Uyarısı</h2><p><strong>“Teslim Aldım” onayını yalnızca item veya GB gerçekten hesabına geçtiğinde ver.</strong> Teslimatta sorun varsa onay vermeden İşlemlerim ekranından ihtilaf aç. Para ihtilaf çözülene kadar blokede kalır.</p><p>Oyunda farklı bir karakter veya farklı teslim yöntemi istenirse işlemi durdur ve KOTAKAS desteğe bildir.</p></div></section>

      <section class="item-detail-card"><div class="item-section-title"><div><small>GERÇEK VERİ</small><h2>İstatistikler</h2></div><span class="badge green">Sahte veri yok</span></div><div id="itemStatsRoot">${statsPanel(listing, initialStats, 'weekly')}</div></section>

      <section class="item-detail-card"><div class="item-section-title"><div><small>KOTAKAS</small><h2>Güvenli alışveriş nasıl çalışır?</h2></div></div><div class="safe-flow"><div><b>1</b><span>Sipariş aç</span></div><i></i><div><b>2</b><span>Ödeme blokede</span></div><i></i><div><b>3</b><span>Teslimatı kontrol et</span></div><i></i><div><b>4</b><span>Onayla ve tamamla</span></div></div></section>
    </div>

    <div class="item-sticky-buy"><div><small>${esc(listing.server)} · ${esc(listing.title)}</small><strong>${esc(money.format(listing.price))}</strong></div><button class="btn primary" type="button" data-detail-buy ${purchaseReady ? '' : 'disabled'}>${purchaseReady ? 'Güvenli Satın Al' : active ? 'Yakında' : statusLabel(listing.status)}</button></div>`;

    main.querySelectorAll('[data-detail-buy]').forEach((button) => button.addEventListener('click', () => buyListing(button, listing)));
    main.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => alert(`${button.dataset.comingSoon} özelliği teklif/takas güvenlik kuralları tamamlandıktan sonra açılacak.`)));
    main.querySelector('[data-seller-question]')?.addEventListener('click', () => alert('Satış öncesi satıcı mesajlaşması sonraki pazar geliştirme fazında güvenli kurallarla eklenecek.'));
    main.querySelectorAll('[data-accordion]').forEach((button) => button.addEventListener('click', () => {
      const panel = main.querySelector(`#${button.dataset.accordion}`);
      if (!panel) return;
      panel.hidden = !panel.hidden;
      button.classList.toggle('open', !panel.hidden);
      const icon = button.querySelector('b');
      if (icon) icon.textContent = panel.hidden ? '+' : '−';
    }));
    bindStatTabs(main.querySelector('#itemStatsRoot'), listing);
  }

  async function bootDetail() {
    if (path !== '/item.html' || detailBooted) return;
    const main = document.querySelector('main.main');
    if (!main) return;
    detailBooted = true;
    main.innerHTML = '<div class="item-detail-loading"><div class="empty">Ürün detayları yükleniyor…</div></div>';
    const id = new URLSearchParams(location.search).get('id');
    if (!id || !/^\d+$/.test(id)) {
      main.innerHTML = '<div class="item-detail-loading"><div class="empty">Geçerli bir ilan seçilmedi. <a href="/market.html">Pazara dön</a></div></div>';
      return;
    }
    try {
      const [detailResult, configResult, statsResult] = await Promise.all([
        jsonFetch(`/api/market/listings/${encodeURIComponent(id)}/detail`),
        jsonFetch('/api/public-config'),
        jsonFetch(`/api/market/listings/${encodeURIComponent(id)}/stats?range=weekly`),
      ]);
      if (!detailResult.response.ok) {
        main.innerHTML = `<div class="item-detail-loading"><div class="empty">${detailResult.response.status === 404 ? 'Bu ilan bulunamadı veya kaldırıldı.' : 'Ürün detayları staging veritabanı doğrulamasından sonra burada görünecek.'} <a href="/market.html">Pazara dön</a></div></div>`;
        return;
      }
      const stats = statsResult.response.ok ? statsResult.data.statistics : null;
      statCache.set(`${id}:weekly`, stats);
      renderDetail(main, detailResult.data.listing, configResult.response.ok ? configResult.data : {}, stats);
    } catch (_) {
      main.innerHTML = '<div class="item-detail-loading"><div class="empty">Ürün detayları şu anda yüklenemedi. <a href="/market.html">Pazara dön</a></div></div>';
    }
  }

  function decorateMarketRows() {
    if (path !== '/market.html') return;
    document.querySelectorAll('[data-listing-id]').forEach((row) => {
      if (row.querySelector('[data-listing-detail-link]')) return;
      const actions = row.lastElementChild;
      if (!actions) return;
      const link = document.createElement('a');
      link.className = 'btn ghost';
      link.dataset.listingDetailLink = '1';
      link.href = `/item.html?id=${encodeURIComponent(row.dataset.listingId)}`;
      link.textContent = 'İncele';
      actions.prepend(link);
    });
  }

  const observer = new MutationObserver(() => {
    if (path === '/item.html') bootDetail();
    if (path === '/market.html') decorateMarketRows();
  });

  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => {
      bootDetail();
      decorateMarketRows();
    }, 150);
  });
})();
