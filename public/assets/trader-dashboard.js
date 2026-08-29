(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/trader.html') return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const QUESTION_LABELS = Object.freeze({
    STILL_AVAILABLE: 'Ürün hâlâ satılık mı?',
    DELIVERY_NOW: 'Şu an teslim edebilir misin?',
    DELIVERY_TIME: 'Tahmini teslim süresi nedir?',
    ITEM_INFO_CURRENT: 'İlandaki item bilgileri güncel mi?',
    CHECK_OFFER: 'Gönderdiğim teklifi kontrol eder misin?',
  });
  const ANSWERS = Object.freeze({
    YES_AVAILABLE: 'Evet, satılık.',
    DELIVERY_NOW: 'Evet, şu an teslim edebilirim.',
    DELIVERY_15: '15 dakika içinde teslim edebilirim.',
    DELIVERY_30: '30 dakika içinde teslim edebilirim.',
    INFO_CURRENT: 'Evet, ilan bilgileri güncel.',
    CHECKING_OFFER: 'Teklifini kontrol ediyorum.',
    OFFER_NOT_ACCEPTABLE: 'Teklifi kabul edemiyorum.',
    LISTING_PRICE_VALID: 'İlan fiyatı geçerli.',
  });

  let loading = false;
  let rendered = false;

  function pct(rate) {
    const value = Number(rate || 0) * 100;
    return `%${Number.isInteger(value) ? value : value.toFixed(2)}`;
  }

  function date(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('tr-TR'); } catch { return '—'; }
  }

  function statusLabel(value) {
    return ({
      active: 'Aktif', reserved: 'İşlemde', sold: 'Satıldı', swapped: 'Takaslandı', cancelled: 'Kaldırıldı',
      held: 'Ödeme Blokede', released: 'Tamamlandı', refunded: 'İade', pending: 'Bekliyor', rejected: 'Reddedildi',
    })[value] || value || '—';
  }

  function badgeClass(value) {
    if (['active', 'released', 'sold', 'swapped'].includes(value)) return 'green';
    if (['held', 'reserved', 'pending'].includes(value)) return 'yellow';
    if (['refunded', 'rejected', 'cancelled'].includes(value)) return 'red';
    return '';
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function newIdempotencyKey(offerId) {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `trader-offer-${offerId}-${random}`;
  }

  function empty(text) {
    return `<div class="trader-empty">${esc(text)}</div>`;
  }

  function readinessNotice(dashboard) {
    const readiness = dashboard.readiness || {};
    const missing = Object.entries(readiness).filter(([, ready]) => !ready).map(([key]) => ({
      wallet: 'bakiye', marketplace: 'pazar/satış', offers: 'teklif', questions: 'hazır soru', swaps: 'takas',
    })[key] || key);
    if (!missing.length) return '';
    return `<div class="notice trader-readiness">Staging şemasında şu bölümler henüz doğrulanmadı: <strong>${esc(missing.join(', '))}</strong>. Hazır olan gerçek veriler gösterilmeye devam ediyor.</div>`;
  }

  function renderListings(rows) {
    if (!rows.length) return empty('Henüz ilan yok.');
    return `<div class="trader-list">${rows.map((row) => `<div class="trader-row">
      <div class="trader-row-main"><strong>${esc(row.title)}</strong><span>${esc(row.server)} · ${esc(date(row.updatedAt || row.createdAt))}</span></div>
      <div class="trader-row-side"><b>${esc(money.format(row.price))}</b><span class="badge ${badgeClass(row.status)}">${esc(statusLabel(row.status))}</span><a class="btn ghost trader-mini-btn" href="/item.html?id=${encodeURIComponent(row.id)}">İncele</a></div>
    </div>`).join('')}</div>`;
  }

  function renderSales(rows) {
    if (!rows.length) return empty('Henüz satış işlemi yok.');
    return `<div class="trader-list">${rows.map((row) => `<div class="trader-row trader-sale-row">
      <div class="trader-row-main"><strong>${esc(row.title)}</strong><span>#${esc(row.id)} · ${esc(row.server)} · ${esc(date(row.updatedAt || row.createdAt))}</span></div>
      <div class="trader-sale-money"><span>Satış <b>${esc(money.format(row.amount))}</b></span><span>Komisyon <b>${esc(money.format(row.commissionAmount))}</b></span><span>Net <b>${esc(money.format(row.sellerNet))}</b></span></div>
      <span class="badge ${badgeClass(row.escrowState)}">${esc(statusLabel(row.escrowState))}</span>
    </div>`).join('')}</div>`;
  }

  function renderOffers(rows) {
    if (!rows.length) return empty('Bekleyen fiyat teklifi yok.');
    return `<div class="trader-list">${rows.map((row) => `<div class="trader-row" data-trader-offer="${esc(row.id)}">
      <div class="trader-row-main"><strong>${esc(row.listingTitle)}</strong><span>${esc(row.server)} · İlan ${esc(money.format(row.listingPrice))}</span></div>
      <div class="trader-offer-amount"><small>Gelen teklif</small><b>${esc(money.format(row.amount))}</b></div>
      <div class="trader-inline-actions"><button class="btn success trader-mini-btn" data-offer-accept="${esc(row.id)}">Kabul Et</button><button class="btn ghost trader-mini-btn" data-offer-reject="${esc(row.id)}">Reddet</button></div>
    </div>`).join('')}</div>`;
  }

  function renderQuestions(rows) {
    if (!rows.length) return empty('Bekleyen hazır soru yok.');
    const options = Object.entries(ANSWERS).map(([code, label]) => `<option value="${code}">${esc(label)}</option>`).join('');
    return `<div class="trader-list">${rows.map((row) => `<div class="trader-question" data-trader-question="${esc(row.id)}">
      <div><strong>${esc(row.listingTitle)}</strong><span>${esc(row.server)} · ${esc(date(row.createdAt))}</span></div>
      <p>${esc(QUESTION_LABELS[row.questionCode] || row.questionCode)}</p>
      <div class="trader-answer-line"><select data-question-answer>${options}</select><button class="btn primary trader-mini-btn" data-question-send="${esc(row.id)}">Yanıtla</button></div>
    </div>`).join('')}</div>`;
  }

  function renderSwaps(rows) {
    if (!rows.length) return empty('Bekleyen takas talebi yok.');
    return `<div class="trader-list">${rows.map((row) => `<div class="trader-swap" data-trader-swap="${esc(row.id)}">
      <div class="trader-swap-side"><small>Karşı tarafın sunduğu</small><strong>${esc(row.offeredListing.title)}</strong><span>${esc(row.offeredListing.server)} · ${esc(money.format(row.offeredListing.price))}</span></div>
      <div class="trader-swap-arrow">⇄</div>
      <div class="trader-swap-side"><small>Senin ilanın</small><strong>${esc(row.requestedListing.title)}</strong><span>${esc(row.requestedListing.server)} · ${esc(money.format(row.requestedListing.price))}</span></div>
      <div class="trader-inline-actions"><button class="btn success trader-mini-btn" data-swap-accept="${esc(row.id)}">Takas Et</button><button class="btn ghost trader-mini-btn" data-swap-reject="${esc(row.id)}">Reddet</button></div>
    </div>`).join('')}</div>`;
  }

  function dashboardMarkup(dashboard) {
    const s = dashboard.summary || {};
    const wallet = dashboard.wallet;
    return `<div class="trader-dashboard">
      <div class="page-title trader-title"><div><div class="trader-title-line"><h1>Pazarcı Paneli</h1><span class="badge green">Doğrulanmış Pazarcı</span></div><p>İlanlarını, satış gelirini, komisyonunu, teklifleri, hazır soruları ve takas taleplerini tek ekrandan yönet.</p></div><div class="trader-title-actions"><span class="trader-rate">Komisyon <b>${esc(pct(dashboard.commissionRate))}</b></span><a class="btn primary" href="/sell.html">+ İlan Ver</a></div></div>
      ${readinessNotice(dashboard)}
      <div class="trader-kpis">
        <article><span>Kullanılabilir Bakiye</span><strong>${wallet ? esc(money.format(wallet.availableBalance)) : '—'}</strong><small>${wallet ? `Bloke: ${esc(money.format(wallet.heldBalance))}` : 'Bakiye şeması bekleniyor'}</small></article>
        <article><span>Net Kazanç</span><strong>${esc(money.format(Number(s.netEarnings || 0)))}</strong><small>Tamamlanan satışlar</small></article>
        <article><span>Ödenen Komisyon</span><strong>${esc(money.format(Number(s.commissionPaid || 0)))}</strong><small>Brüt: ${esc(money.format(Number(s.grossRevenue || 0)))}</small></article>
        <article><span>Aktif İlan</span><strong>${Number(s.activeListings || 0)}</strong><small>İşlemde: ${Number(s.reservedListings || 0)}</small></article>
        <article><span>Gelen Teklif</span><strong>${Number(s.openOffers || 0)}</strong><small>Bekleyen fiyat teklifi</small></article>
        <article><span>Hazır Soru</span><strong>${Number(s.pendingQuestions || 0)}</strong><small>Yanıt bekliyor</small></article>
        <article><span>Takas Talebi</span><strong>${Number(s.pendingSwaps || 0)}</strong><small>Karar bekliyor</small></article>
        <article><span>Başarılı Satış</span><strong>${Number(s.completedSales || 0)}</strong><small>Toplam işlem: ${Number(s.totalSales || 0)}</small></article>
      </div>

      <div class="trader-quick-actions"><a href="#offers">Gelen Teklifler <b>${Number(s.openOffers || 0)}</b></a><a href="#questions">Hazır Sorular <b>${Number(s.pendingQuestions || 0)}</b></a><a href="#swaps">Takas Talepleri <b>${Number(s.pendingSwaps || 0)}</b></a><a href="/deals.html">Teslimatlar</a><a href="/dashboard.html">Bakiye Hareketleri</a></div>

      <section class="trader-panel" id="listings"><div class="trader-panel-head"><div><h2>İlanlarım</h2><p>Son ilanların ve mevcut durumları.</p></div><a class="btn ghost trader-mini-btn" href="/sell.html">Yeni İlan</a></div>${renderListings(dashboard.listings || [])}</section>
      <section class="trader-panel" id="sales"><div class="trader-panel-head"><div><h2>Satışlarım</h2><p>Brüt tutar, KOTAKAS komisyonu ve eline geçen net tutar.</p></div><a class="btn ghost trader-mini-btn" href="/deals.html">Tüm İşlemler</a></div>${renderSales(dashboard.sales || [])}</section>
      <section class="trader-panel" id="offers"><div class="trader-panel-head"><div><h2>Gelen Teklifler</h2><p>Alıcı kimliği gösterilmez. Kabulde tutar alıcının bakiyesinden güvenli işleme bloke edilir.</p></div><span class="badge yellow">${Number(s.openOffers || 0)} bekliyor</span></div>${renderOffers(dashboard.offers || [])}</section>
      <section class="trader-panel" id="questions"><div class="trader-panel-head"><div><h2>Hazır Sorular</h2><p>Serbest sohbet yok; yalnız sistemdeki hazır cevaplardan birini seç.</p></div><span class="badge">${Number(s.pendingQuestions || 0)} soru</span></div>${renderQuestions(dashboard.questions || [])}</section>
      <section class="trader-panel" id="swaps"><div class="trader-panel-head"><div><h2>Takas Talepleri</h2><p>Kabul ettiğinde iki ilan da kilitlenir. Item teslim edilmeden teslim onayı verme.</p></div><span class="badge yellow">${Number(s.pendingSwaps || 0)} bekliyor</span></div>${renderSwaps(dashboard.swaps || [])}</section>
    </div>`;
  }

  function messageForError(error) {
    return ({
      offers_temporarily_unavailable: 'Teklif işlemleri staging doğrulamasını bekliyor.',
      insufficient_balance: 'Alıcının bakiyesi bu teklif için yeterli değil.',
      offer_not_available: 'Bu teklif artık kullanılabilir değil.',
      preset_questions_temporarily_unavailable: 'Hazır soru sistemi staging doğrulamasını bekliyor.',
      swaps_temporarily_unavailable: 'Takas sistemi staging doğrulamasını bekliyor.',
      swap_not_available: 'Bu takas talebi artık kullanılabilir değil.',
    })[error] || 'İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.';
  }

  async function action(button, url, options = {}) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'İşleniyor…';
    try {
      const result = await jsonFetch(url, options);
      if (!result.response.ok) {
        alert(messageForError(result.data.error));
        return false;
      }
      await loadDashboard(true);
      return true;
    } finally {
      if (document.body.contains(button)) {
        button.disabled = false;
        button.textContent = old;
      }
    }
  }

  function bindActions(main) {
    main.querySelectorAll('[data-offer-reject]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Bu fiyat teklifini reddetmek istiyor musun?')) return;
      action(button, `/api/offers/${encodeURIComponent(button.dataset.offerReject)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    }));
    main.querySelectorAll('[data-offer-accept]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Teklifi kabul edince alıcının bakiyesi güvenli işleme bloke edilecek ve ilan rezerve edilecek. Devam edilsin mi?')) return;
      const id = button.dataset.offerAccept;
      action(button, `/api/offers/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': newIdempotencyKey(id) },
        body: '{}',
      });
    }));
    main.querySelectorAll('[data-question-send]').forEach((button) => button.addEventListener('click', () => {
      const card = button.closest('[data-trader-question]');
      const answerCode = card?.querySelector('[data-question-answer]')?.value;
      if (!answerCode) return;
      action(button, `/api/listing-questions/${encodeURIComponent(button.dataset.questionSend)}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answerCode }),
      });
    }));
    main.querySelectorAll('[data-swap-reject]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Bu takas teklifini reddetmek istiyor musun?')) return;
      action(button, `/api/swaps/${encodeURIComponent(button.dataset.swapReject)}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    }));
    main.querySelectorAll('[data-swap-accept]').forEach((button) => button.addEventListener('click', () => {
      if (!confirm('Takas kabul edilince iki ilan da kilitlenecek. Karşı itemi teslim almadan teslim onayı vermemelisin. Devam edilsin mi?')) return;
      action(button, `/api/swaps/${encodeURIComponent(button.dataset.swapAccept)}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    }));
  }

  async function loadDashboard(force = false) {
    if (loading) return;
    const main = document.querySelector('main.main');
    if (!main) return;
    if (rendered && !force) return;
    if (!main.querySelector('.page-title h1') && !force) return;
    loading = true;
    try {
      const { response, data } = await jsonFetch('/api/trader/dashboard?limit=15');
      if (response.status === 401) {
        location.href = `/login.html?next=${encodeURIComponent('/trader.html')}`;
        return;
      }
      if (response.status === 403) {
        main.innerHTML = '<div class="page-title"><div><h1>Pazarcı Paneli</h1><p>Bu bölüm yalnız onaylı Pazarcı hesaplarına açıktır.</p></div></div><section class="card full"><div class="empty"><a class="btn primary" href="/trader-apply.html">Pazarcı Ol</a></div></section>';
        rendered = true;
        return;
      }
      if (!response.ok) {
        main.innerHTML = '<div class="page-title"><div><h1>Pazarcı Paneli</h1><p>Gerçek pazarcı verileri hazırlanıyor.</p></div></div><section class="card full"><div class="notice">Pazarcı paneli verileri şu anda alınamadı. Staging veritabanı uyumluluğunu kontrol edeceğiz.</div></section>';
        rendered = true;
        return;
      }
      main.innerHTML = dashboardMarkup(data.dashboard || {});
      bindActions(main);
      rendered = true;
      const hash = location.hash;
      if (hash) setTimeout(() => document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40);
    } catch (_) {
      main.innerHTML = '<div class="page-title"><div><h1>Pazarcı Paneli</h1><p>Panel verileri alınamadı.</p></div></div><section class="card full"><div class="notice">Bağlantı hatası oluştu. Lütfen tekrar deneyin.</div></section>';
    } finally {
      loading = false;
    }
  }

  const observer = new MutationObserver(() => loadDashboard());
  window.addEventListener('kotakas:user-notification', () => loadDashboard(true));
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(loadDashboard, 100);
  });
})();
