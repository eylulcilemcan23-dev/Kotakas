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

  async function resolve(id, outcome) {
    let providerPayoutId = null;
    let resolutionNote = null;
    if (outcome === 'paid') {
      providerPayoutId = prompt('Banka/ödeme sağlayıcı işlem referansını gir:')?.trim() || '';
      if (!providerPayoutId) return;
      if (!confirm('Bu ödeme gerçekten gönderildi mi? Onay sonrası bloke tutar hesaptan kesin düşer.')) return;
    } else {
      resolutionNote = prompt('İptal/iade sebebini yaz:')?.trim() || '';
      if (resolutionNote.length < 3) return;
      if (!confirm('Talep iptal edilip tutar kullanıcının kullanılabilir bakiyesine geri aktarılsın mı?')) return;
    }
    const result = await jsonFetch(`/api/admin/finance/withdrawals/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome, providerPayoutId, resolutionNote }),
    });
    if (!result.response.ok) {
      alert(result.data.error === 'withdrawal_already_final' ? 'Bu talep daha önce sonuçlandırılmış.' : 'Para çekme talebi sonuçlandırılamadı.');
      return;
    }
    alert(outcome === 'paid' ? 'Para çekme tamamlandı.' : 'Tutar kullanıcı bakiyesine iade edildi.');
    mounted = false;
    document.querySelector('[data-admin-payout-shell]')?.remove();
    await mount();
  }

  async function mount() {
    if (mounted || document.querySelector('.page-title h1')?.textContent?.trim() !== 'Admin Merkezi') return;
    const grid = document.querySelector('.grid');
    if (!grid) return;
    mounted = true;
    const result = await jsonFetch('/api/admin/finance/withdrawals?status=requested&limit=50');
    if (result.response.status === 401 || result.response.status === 403) return;
    if (!result.response.ok) return;
    const rows = Array.isArray(result.data.withdrawals) ? result.data.withdrawals : [];
    const section = document.createElement('section');
    section.className = 'card full admin-payout-shell';
    section.dataset.adminPayoutShell = '1';
    section.innerHTML = `<div class="page-title"><div><h2>Para Çekme Talepleri</h2><p>Yalnız finans yetkili yöneticiler görür. Ödeme gönderilmeden “Ödendi” yapılmamalıdır.</p></div><span class="badge ${rows.length ? 'yellow' : 'green'}">${rows.length} BEKLEYEN</span></div>${rows.length ? `<div class="admin-payout-list">${rows.map((row) => `<div class="admin-payout-row"><div><strong>#${esc(row.id)} · ${esc(money.format(row.amount))}</strong><small>Kullanıcı #${esc(row.userId)} · Net ${esc(money.format(row.netAmount))} · ${esc(row.payoutAccount?.displayLabel || 'Maskeli ödeme hesabı')} · ${esc(row.requestedAt ? new Date(row.requestedAt).toLocaleString('tr-TR') : '')}</small></div><div class="admin-payout-actions"><button class="btn success" data-paid="${esc(row.id)}">Ödendi</button><button class="btn ghost" data-cancel="${esc(row.id)}">İptal / İade</button></div></div>`).join('')}</div>` : '<div class="empty">Bekleyen para çekme talebi yok.</div>'}`;
    grid.appendChild(section);
    section.querySelectorAll('[data-paid]').forEach((button) => button.addEventListener('click', () => resolve(button.dataset.paid, 'paid')));
    section.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => resolve(button.dataset.cancel, 'cancelled')));
  }

  const observer = new MutationObserver(() => mount().catch(() => {}));
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => mount().catch(() => {}), 180);
  });
})();
