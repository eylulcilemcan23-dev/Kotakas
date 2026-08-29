(() => {
  const page = location.pathname === '/index.html' ? '/' : location.pathname;
  if (page !== '/trader.html') return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let range = 30;
  let requestId = 0;

  function dayLabel(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
  }

  function rangeLabel(days) {
    return ({ 7: 'Son 7 gün', 30: 'Son 30 gün', 90: 'Son 90 gün' })[Number(days)] || `Son ${Number(days)} gün`;
  }

  function pct(value) {
    const number = Number(value || 0);
    return `%${Number.isInteger(number) ? number : number.toFixed(2)}`;
  }

  function lineChart(series, key, title, description) {
    const rows = Array.isArray(series) ? series : [];
    const values = rows.map((row) => Math.max(0, Number(row[key] || 0)));
    const max = Math.max(0, ...values);
    if (!rows.length || max <= 0) {
      return `<article class="trader-chart-card"><div class="trader-chart-head"><div><strong>${esc(title)}</strong><span>${esc(description)}</span></div></div><div class="trader-analytics-empty">Bu dönemde grafik oluşturacak tamamlanmış satış yok.</div></article>`;
    }

    const width = 720;
    const height = 190;
    const left = 18;
    const right = 18;
    const top = 18;
    const bottom = 34;
    const chartWidth = width - left - right;
    const chartHeight = height - top - bottom;
    const points = rows.map((row, index) => {
      const x = rows.length === 1 ? left + chartWidth / 2 : left + (index / (rows.length - 1)) * chartWidth;
      const y = top + chartHeight - (Math.max(0, Number(row[key] || 0)) / max) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const start = dayLabel(rows[0]?.day);
    const end = dayLabel(rows[rows.length - 1]?.day);

    return `<article class="trader-chart-card"><div class="trader-chart-head"><div><strong>${esc(title)}</strong><span>${esc(description)}</span></div><b>${esc(money.format(max))}</b></div><svg class="trader-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line x1="${left}" y1="${top + chartHeight}" x2="${width - right}" y2="${top + chartHeight}" class="trader-chart-axis"></line><polyline class="trader-chart-line ${key === 'commission' ? 'commission' : ''}" points="${points}"></polyline><text x="${left}" y="${height - 8}" class="trader-chart-label">${esc(start)}</text><text x="${width - right}" y="${height - 8}" text-anchor="end" class="trader-chart-label">${esc(end)}</text></svg></article>`;
  }

  function topItems(items) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return '<div class="trader-analytics-empty">Bu dönemde tamamlanan item satışı yok.</div>';
    return `<div class="trader-top-items">${rows.map((item, index) => `<div class="trader-top-item"><span class="trader-rank">${index + 1}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.server || 'Server yok')} · ${Number(item.sales || 0)} satış</small></div><div class="trader-top-money"><b>${esc(money.format(Number(item.gross || 0)))}</b><small>Net ${esc(money.format(Number(item.net || 0)))}</small></div></div>`).join('')}</div>`;
  }

  function markup(analytics) {
    const p = analytics.period || {};
    const best = analytics.bestDay;
    const days = Number(analytics.rangeDays || range);
    return `<div class="trader-analytics-content">
      <div class="trader-analytics-toolbar"><div><h2>Mağaza Performansı</h2><p>Yalnız gerçek tamamlanmış satışlardan hesaplanır. İade ve bekleyen işlemler ayrıca izlenir.</p></div><div class="trader-range-tabs" role="group" aria-label="Performans dönemi"><button type="button" data-analytics-range="7" class="${days === 7 ? 'active' : ''}">7 Gün</button><button type="button" data-analytics-range="30" class="${days === 30 ? 'active' : ''}">30 Gün</button><button type="button" data-analytics-range="90" class="${days === 90 ? 'active' : ''}">90 Gün</button></div></div>
      <div class="trader-performance-kpis">
        <article><span>Dönem Cirosu</span><strong>${esc(money.format(Number(p.grossRevenue || 0)))}</strong><small>${esc(rangeLabel(days))}</small></article>
        <article><span>Net Kazanç</span><strong>${esc(money.format(Number(p.netEarnings || 0)))}</strong><small>${Number(p.completedSales || 0)} tamamlanan satış</small></article>
        <article><span>Komisyon</span><strong>${esc(money.format(Number(p.commissionPaid || 0)))}</strong><small>Efektif oran ${esc(pct(p.effectiveCommissionRate))}</small></article>
        <article><span>Tamamlama Oranı</span><strong>${esc(pct(p.completionRate))}</strong><small>${Number(p.refundedSales || 0)} iade · ${Number(p.pendingSales || 0)} bekleyen</small></article>
        <article><span>Ortalama Sipariş</span><strong>${esc(money.format(Number(p.averageOrderValue || 0)))}</strong><small>Net marj ${esc(pct(p.netMarginRate))}</small></article>
        <article><span>Aktif Stok Değeri</span><strong>${esc(money.format(Number(p.activeStockValue || 0)))}</strong><small>${Number(p.activeListings || 0)} aktif ilan</small></article>
      </div>
      ${best ? `<div class="trader-best-day"><span>En güçlü gün</span><strong>${esc(dayLabel(best.day))}</strong><b>${esc(money.format(Number(best.gross || 0)))}</b><small>${Number(best.sales || 0)} satış</small></div>` : ''}
      <div class="trader-chart-grid">${lineChart(analytics.series, 'gross', 'Satış Grafiği', 'Günlük tamamlanan satış cirosu')}${lineChart(analytics.series, 'commission', 'Komisyon Grafiği', 'Günlük KOTAKAS komisyonu')}</div>
      <div class="trader-top-section"><div class="trader-panel-head"><div><h3>En Çok Satan Itemler</h3><p>${esc(rangeLabel(days))} içinde gerçek tamamlanan satışlara göre sıralanır.</p></div></div>${topItems(analytics.topItems)}</div>
    </div>`;
  }

  function bind(section) {
    section.querySelectorAll('[data-analytics-range]').forEach((button) => button.addEventListener('click', () => {
      const next = Number(button.dataset.analyticsRange);
      if (![7, 30, 90].includes(next) || next === range) return;
      range = next;
      load(section);
    }));
  }

  async function load(section) {
    const current = ++requestId;
    section.innerHTML = '<div class="trader-analytics-loading">Mağaza performansı hesaplanıyor…</div>';
    try {
      const response = await fetch(`/api/trader/analytics?range=${range}`, { headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (current !== requestId || !document.body.contains(section)) return;
      if (!response.ok) {
        section.innerHTML = `<div class="notice">${response.status === 503 ? 'Performans analitiği staging şema doğrulamasını bekliyor.' : 'Performans verileri şu anda alınamadı.'}</div>`;
        return;
      }
      section.innerHTML = markup(data.analytics || {});
      bind(section);
    } catch (_) {
      if (current === requestId && document.body.contains(section)) section.innerHTML = '<div class="notice">Performans verileri için bağlantı kurulamadı.</div>';
    }
  }

  function install() {
    const dashboard = document.querySelector('.trader-dashboard');
    if (!dashboard || dashboard.dataset.analyticsReady === '1') return;
    dashboard.dataset.analyticsReady = '1';
    const section = document.createElement('section');
    section.className = 'trader-panel trader-analytics-panel';
    section.id = 'performance';
    section.innerHTML = '<div class="trader-analytics-loading">Mağaza performansı hazırlanıyor…</div>';
    const listings = dashboard.querySelector('#listings');
    if (listings) dashboard.insertBefore(section, listings); else dashboard.appendChild(section);
    const quick = dashboard.querySelector('.trader-quick-actions');
    if (quick && !quick.querySelector('a[href="#performance"]')) quick.insertAdjacentHTML('afterbegin', '<a href="#performance">Mağaza Performansı</a>');
    load(section);
  }

  const observer = new MutationObserver(install);
  window.addEventListener('kotakas:user-notification', () => {
    const section = document.querySelector('#performance');
    if (section) load(section);
  });
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    install();
  });
})();
