(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;
  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let busy = false;

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function statusLabel(status) {
    return ({ pending: 'Bekleyen Teklif', active: 'Teslimat', completed: 'Tamamlandı', rejected: 'Reddedildi', cancelled: 'İptal', disputed: 'İhtilaf' })[status] || status;
  }

  function row(swap) {
    const dispute = swap.dispute;
    const actions = swap.status === 'disputed'
      ? `<button class="btn success" type="button" data-admin-swap-resolve="${esc(swap.id)}" data-resolution="complete">Tamamlandı Yap</button><button class="btn ghost" type="button" data-admin-swap-resolve="${esc(swap.id)}" data-resolution="cancel">İptal Et / Kilidi Aç</button>`
      : '';
    return `<div class="list-item" data-admin-swap="${esc(swap.id)}"><div style="flex:1;min-width:0"><strong>Takas #${esc(swap.id)} · ${esc(statusLabel(swap.status))}</strong><span>#${esc(swap.proposerId)} ${esc(swap.offeredListing.title)} ⇄ #${esc(swap.recipientId)} ${esc(swap.requestedListing.title)}</span><span>${esc(swap.offeredListing.server)} · ${esc(money.format(swap.offeredListing.price))} ⇄ ${esc(money.format(swap.requestedListing.price))}</span>${dispute?.reason ? `<span class="swap-admin-reason">Sorun: ${esc(dispute.reason)}</span>` : ''}</div><div class="swap-actions">${actions}</div></div>`;
  }

  async function resolve(button, swapId, resolution) {
    const text = resolution === 'complete'
      ? 'Yönetim incelemesiyle bu takas tamamlandı olarak işaretlensin mi?'
      : 'Takas iptal edilip iki ilan yeniden aktif hale getirilsin mi?';
    if (!confirm(text)) return;
    button.closest('[data-admin-swap]')?.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    const { response, data } = await api(`/api/admin/swaps/${encodeURIComponent(swapId)}/resolve`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution }),
    });
    if (!response.ok) alert(data.error === 'swap_not_available' ? 'Bu takas artık çözümlenebilir durumda değil.' : 'Takas kararı kaydedilemedi.');
    await render(true);
  }

  async function render(force = false) {
    if (busy) return;
    const main = document.querySelector('main.main');
    if (!main) return;
    const old = main.querySelector('[data-admin-swaps]');
    if (old && !force) return;
    busy = true;
    try {
      const { response, data } = await api('/api/admin/swaps?limit=50');
      if (response.status === 401 || response.status === 403) return;
      old?.remove();
      const card = document.createElement('section');
      card.className = 'card full';
      card.dataset.adminSwaps = '1';
      if (!response.ok) {
        card.innerHTML = '<h3>Takas Yönetimi</h3><div class="notice">Takas tablosu staging migrationı doğrulandıktan sonra açılacak.</div>';
      } else {
        const swaps = Array.isArray(data.swaps) ? data.swaps : [];
        const open = swaps.filter((swap) => ['pending','active','disputed'].includes(swap.status));
        card.innerHTML = `<div class="page-title" style="margin-bottom:12px"><div><h3>Takas Yönetimi</h3><p>İhtilaflı takaslarda ilan kilitlerini yönetim kararıyla sonuçlandır.</p></div><span class="badge ${open.length ? 'yellow' : 'green'}">${open.length} açık</span></div><div class="list">${swaps.length ? swaps.map(row).join('') : '<div class="empty">Henüz takas kaydı yok.</div>'}</div>`;
      }
      main.querySelector('.grid')?.appendChild(card);
      card.querySelectorAll('[data-admin-swap-resolve]').forEach((button) => button.addEventListener('click', () => resolve(button, button.dataset.adminSwapResolve, button.dataset.resolution)));
    } finally {
      busy = false;
    }
  }

  const observer = new MutationObserver(() => render());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(render, 360);
  });
})();
