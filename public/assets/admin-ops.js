(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let mounted = false;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function resolutionLabel(value) {
    return ({ refund: 'Alıcıya İade', release: 'Satıcıya Öde', dismiss: 'İhtilafı Kapat' })[value] || value;
  }

  async function resolveDispute(button, disputeId, resolution) {
    const label = resolutionLabel(resolution);
    if (!confirm(`İhtilaf #${disputeId}: ${label} işlemi uygulansın mı?`)) return;
    button.disabled = true;
    try {
      const { response, data } = await jsonFetch(`/api/admin/disputes/${encodeURIComponent(disputeId)}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      if (response.status === 403) {
        alert('Bu karar finans yetkisi gerektiriyor.');
        return;
      }
      if (!response.ok) {
        alert('İhtilaf şu anda sonuçlandırılamadı.');
        return;
      }
      alert(`İhtilaf #${data.dispute.id} sonuçlandırıldı: ${label}.`);
      await renderOps(true);
    } finally {
      button.disabled = false;
    }
  }

  function disputeCard(disputes, canFinance) {
    if (!disputes.length) return '<section class="card full"><h3>Açık İhtilaflar</h3><div class="empty">Açık ihtilaf yok.</div></section>';
    return `<section class="card full"><h3>Açık İhtilaflar</h3><div class="list">${disputes.map((d) => `
      <div class="list-item" data-admin-dispute="${esc(d.id)}">
        <div style="flex:1;min-width:0">
          <strong>İhtilaf #${esc(d.id)} · İşlem #${esc(d.orderId)}</strong>
          <span>Alıcı #${esc(d.buyerId)} · Satıcı #${esc(d.sellerId)} · ${esc(money.format(d.amount))}</span>
          <span>${esc(d.reason)}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${canFinance ? `<button class="btn success" data-resolution="release" data-dispute-id="${esc(d.id)}">Satıcıya Öde</button><button class="btn" data-resolution="refund" data-dispute-id="${esc(d.id)}">Alıcıya İade</button><button class="btn ghost" data-resolution="dismiss" data-dispute-id="${esc(d.id)}">Kapat</button>` : '<span class="badge yellow">Finans kararı bekliyor</span>'}
        </div>
      </div>`).join('')}</div></section>`;
  }

  function auditCard(logs) {
    if (!logs.length) return '<section class="card full"><h3>Güvenlik / İşlem Kaydı</h3><div class="empty">Henüz audit kaydı yok.</div></section>';
    return `<section class="card full"><h3>Güvenlik / İşlem Kaydı</h3><div class="list">${logs.map((log) => `
      <div class="list-item">
        <div style="flex:1;min-width:0"><strong>${esc(log.action)}</strong><span>${esc(log.actorRole || 'sistem')} #${esc(log.actorId || '—')} · ${esc(log.targetType)} #${esc(log.targetId || '—')}</span></div>
        <span class="badge">${esc(new Date(log.createdAt).toLocaleString('tr-TR'))}</span>
      </div>`).join('')}</div></section>`;
  }

  async function renderOps(force = false) {
    const main = document.querySelector('main.main');
    if (!main) return;
    let host = document.querySelector('#adminOpsHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'adminOpsHost';
      host.className = 'grid';
      host.style.marginTop = '18px';
      main.appendChild(host);
    }
    if (!force && host.dataset.ready === '1') return;
    host.dataset.ready = '1';
    host.innerHTML = '<section class="card full"><div class="empty">İhtilaf ve audit verileri yükleniyor…</div></section>';

    const [disputeResult, auditResult, financeResult] = await Promise.all([
      jsonFetch('/api/admin/disputes?status=open&limit=50'),
      jsonFetch('/api/admin/audit?limit=25'),
      jsonFetch('/api/admin/finance/summary'),
    ]);

    if (disputeResult.response.status === 401 || disputeResult.response.status === 403) {
      host.innerHTML = '';
      return;
    }

    const canFinance = financeResult.response.ok;
    const disputes = disputeResult.response.ok && Array.isArray(disputeResult.data.disputes) ? disputeResult.data.disputes : [];
    const logs = auditResult.response.ok && Array.isArray(auditResult.data.logs) ? auditResult.data.logs : [];
    const disputeUnavailable = disputeResult.response.status === 503;
    const auditUnavailable = auditResult.response.status === 503;

    host.innerHTML = `${disputeUnavailable ? '<section class="card full"><div class="notice">İhtilaf tablosu staging migration doğrulamasını bekliyor.</div></section>' : disputeCard(disputes, canFinance)}${auditUnavailable ? '<section class="card full"><div class="notice">Audit log staging migration doğrulamasını bekliyor.</div></section>' : auditCard(logs)}`;
    document.querySelectorAll('[data-resolution][data-dispute-id]').forEach((button) => {
      button.addEventListener('click', () => resolveDispute(button, button.dataset.disputeId, button.dataset.resolution));
    });
  }

  const observer = new MutationObserver(() => {
    if (!mounted && document.querySelector('.page-title h1')) {
      mounted = true;
      renderOps();
    }
  });

  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => {
      if (!mounted && document.querySelector('.page-title h1')) {
        mounted = true;
        renderOps();
      }
    }, 150);
  });

  window.addEventListener('kotakas:admin-notification', (event) => {
    if (event.detail?.notification?.kind === 'dispute_opened') renderOps(true);
  });
  window.addEventListener('kotakas:dispute-resolved', () => renderOps(true));
})();
