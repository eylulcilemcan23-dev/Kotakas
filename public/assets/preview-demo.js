(() => {
  const hostname = String(location.hostname || '').toLowerCase();
  if (!hostname.endsWith('.vercel.app')) return;

  const STORAGE_KEY = 'kotakas_preview_demo_role';
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const now = () => new Date().toISOString();

  const demos = Object.freeze({
    user: {
      label: 'Kullanıcı',
      route: '/dashboard.html',
      user: { id: '9001', name: 'Demo Kullanıcı', email: 'demo.kullanici@kotakas.test', role: 'user' },
      wallet: { availableBalance: 124.5, heldBalance: 25 },
    },
    trader: {
      label: 'Pazarcı',
      route: '/trader.html',
      user: { id: '9002', name: 'Demo Pazarcı', email: 'demo.pazarci@kotakas.test', role: 'trader' },
      wallet: { availableBalance: 1842.75, heldBalance: 320 },
    },
    admin: {
      label: 'Admin',
      route: '/admin.html',
      user: { id: '9003', name: 'Demo Yönetici', email: 'demo.admin@kotakas.test', role: 'admin_owner' },
      wallet: { availableBalance: 0, heldBalance: 0 },
    },
  });

  function currentRole() {
    const role = localStorage.getItem(STORAGE_KEY);
    return Object.prototype.hasOwnProperty.call(demos, role) ? role : '';
  }

  function currentDemo() {
    const role = currentRole();
    return role ? demos[role] : null;
  }

  function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  function traderDashboard(demo) {
    return {
      readiness: { wallet: true, marketplace: true, offers: true, questions: true, swaps: true },
      commissionRate: 0.05,
      wallet: demo.wallet,
      summary: {
        activeListings: 3,
        reservedListings: 1,
        completedSales: 27,
        totalSales: 29,
        grossRevenue: 23540,
        commissionPaid: 1177,
        netEarnings: 22363,
        openOffers: 2,
        pendingQuestions: 1,
        pendingSwaps: 1,
      },
      listings: [
        { id: '501', title: 'Iron Bow +8', server: 'ZERO', price: 8450, status: 'active', createdAt: now(), updatedAt: now() },
        { id: '502', title: 'Raptor +8', server: 'ZERO', price: 7350, status: 'active', createdAt: now(), updatedAt: now() },
        { id: '503', title: 'Shard +8', server: 'ZERO', price: 5250, status: 'reserved', createdAt: now(), updatedAt: now() },
      ],
      sales: [
        { id: '901', title: 'Shard +8', server: 'ZERO', amount: 5200, commissionAmount: 260, sellerNet: 4940, escrowState: 'released', createdAt: now(), updatedAt: now() },
        { id: '902', title: 'Mirage Dagger +8', server: 'ZERO', amount: 4100, commissionAmount: 205, sellerNet: 3895, escrowState: 'released', createdAt: now(), updatedAt: now() },
      ],
      offers: [
        { id: '701', listingTitle: 'Iron Bow +8', server: 'ZERO', listingPrice: 8450, amount: 8000 },
        { id: '702', listingTitle: 'Raptor +8', server: 'ZERO', listingPrice: 7350, amount: 7000 },
      ],
      questions: [
        { id: '801', listingTitle: 'Raptor +8', server: 'ZERO', questionCode: 'DELIVERY_NOW', createdAt: now() },
      ],
      swaps: [
        {
          id: '851',
          offeredListing: { title: 'Mirage Dagger +8', server: 'ZERO', price: 6100 },
          requestedListing: { title: 'Iron Bow +8', server: 'ZERO', price: 8450 },
        },
      ],
    };
  }

  function analytics(range = 30) {
    const days = [7, 30, 90].includes(Number(range)) ? Number(range) : 30;
    const seriesDays = Math.min(days, 14);
    const series = Array.from({ length: seriesDays }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (seriesDays - 1 - index));
      const gross = index % 4 === 0 ? 1800 : index % 3 === 0 ? 950 : index % 2 === 0 ? 1350 : 620;
      return {
        day: date.toISOString().slice(0, 10),
        gross,
        commission: gross * 0.05,
      };
    });
    return {
      rangeDays: days,
      period: {
        grossRevenue: 23540,
        netEarnings: 22363,
        commissionPaid: 1177,
        completedSales: 27,
        refundedSales: 1,
        pendingSales: 1,
        completionRate: 93.1,
        effectiveCommissionRate: 5,
        averageOrderValue: 871.85,
        netMarginRate: 95,
        activeStockValue: 21050,
        activeListings: 3,
      },
      bestDay: { day: series[series.length - 2]?.day || new Date().toISOString().slice(0, 10), gross: 3100, sales: 4 },
      series,
      topItems: [
        { title: 'Iron Bow +8', server: 'ZERO', sales: 8, gross: 9100, net: 8645 },
        { title: 'Raptor +8', server: 'ZERO', sales: 6, gross: 6500, net: 6175 },
        { title: 'Shard +8', server: 'ZERO', sales: 5, gross: 4300, net: 4085 },
      ],
    };
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    let parsed;
    try { parsed = new URL(url, location.origin); } catch { return nativeFetch(input, init); }
    const path = parsed.pathname;
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
    const demo = currentDemo();

    if (path === '/api/logout' && method === 'POST') {
      localStorage.removeItem(STORAGE_KEY);
      return jsonResponse({ ok: true, demo: true });
    }

    if (!demo) return nativeFetch(input, init);

    if (path === '/api/me') return jsonResponse({ ok: true, user: demo.user });
    if (path === '/api/wallet/me') return jsonResponse({ ok: true, wallet: demo.wallet });
    if (path === '/api/notifications/mine') return jsonResponse({ ok: true, notifications: [] });
    if (path === '/api/notification-preferences/mine') {
      return jsonResponse({ ok: true, preferences: { messages: true, market: true, disputes: true, system: true } });
    }
    if (path === '/api/support/tickets/mine') return jsonResponse({ ok: true, tickets: [] });
    if (path === '/api/trader/dashboard' && demo.user.role === 'trader') {
      return jsonResponse({ ok: true, dashboard: traderDashboard(demo) });
    }
    if (path === '/api/trader/analytics' && demo.user.role === 'trader') {
      return jsonResponse({ ok: true, analytics: analytics(parsed.searchParams.get('range')) });
    }

    if (method !== 'GET' && path.startsWith('/api/')) {
      return jsonResponse({ ok: true, demo: true, message: 'Preview demo modunda veri yazılmaz.' });
    }

    return nativeFetch(input, init);
  };

  function setDemo(role) {
    if (!demos[role]) return;
    localStorage.setItem(STORAGE_KEY, role);
    location.href = demos[role].route;
  }

  function addStyles() {
    if (document.querySelector('#kotakasPreviewDemoStyles')) return;
    const style = document.createElement('style');
    style.id = 'kotakasPreviewDemoStyles';
    style.textContent = `
      .preview-demo-box{margin-top:18px;padding:15px;border:1px solid rgba(124,92,255,.3);border-radius:15px;background:rgba(124,92,255,.08)}
      .preview-demo-box strong{display:block;margin-bottom:5px}.preview-demo-box p{margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.5}
      .preview-demo-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.preview-demo-actions button{border:1px solid var(--line);background:#132238;color:var(--text);border-radius:11px;padding:10px 8px;font-weight:750;font-size:12px;cursor:pointer}.preview-demo-actions button:hover{border-color:var(--accent);background:#192c47}
      .preview-demo-badge{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid rgba(66,214,180,.28);border-radius:999px;background:rgba(66,214,180,.09);color:#7cf0d5;font-size:11px;font-weight:850;white-space:nowrap}
      @media(max-width:520px){.preview-demo-actions{grid-template-columns:1fr}.preview-demo-badge{font-size:10px;padding:6px 8px}}
    `;
    document.head.appendChild(style);
  }

  function installAuthControls() {
    const path = location.pathname === '/index.html' ? '/' : location.pathname;
    if (!['/login.html', '/register.html'].includes(path)) return;
    const card = document.querySelector('.auth-card');
    if (!card || card.querySelector('[data-preview-demo-box]')) return;
    card.insertAdjacentHTML('beforeend', `
      <div class="preview-demo-box" data-preview-demo-box>
        <strong>Önizleme hesabıyla içeri gir</strong>
        <p>Gerçek üyelik oluşturmaz. Yalnızca ekranları ve rol bazlı menüleri gezmek içindir.</p>
        <div class="preview-demo-actions">
          <button type="button" data-preview-demo-role="user">Demo Kullanıcı</button>
          <button type="button" data-preview-demo-role="trader">Demo Pazarcı</button>
          <button type="button" data-preview-demo-role="admin">Demo Admin</button>
        </div>
      </div>`);
    card.querySelectorAll('[data-preview-demo-role]').forEach((button) => {
      button.addEventListener('click', () => setDemo(button.dataset.previewDemoRole));
    });
  }

  function installBadge() {
    const demo = currentDemo();
    const topbar = document.querySelector('.topbar-inner');
    if (!demo || !topbar || topbar.querySelector('[data-preview-demo-badge]')) return;
    const badge = document.createElement('a');
    badge.href = '/login.html';
    badge.className = 'preview-demo-badge';
    badge.dataset.previewDemoBadge = '1';
    badge.textContent = `DEMO · ${demo.label}`;
    badge.title = 'Demo rolünü değiştirmek için tıkla';
    const actions = topbar.querySelector('.account-top-actions');
    if (actions) topbar.insertBefore(badge, actions); else topbar.appendChild(badge);
  }

  function install() {
    addStyles();
    installAuthControls();
    installBadge();
  }

  const observer = new MutationObserver(install);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('DOMContentLoaded', install);
})();
