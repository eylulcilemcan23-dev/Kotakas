(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/dashboard.html') return;

  let enhanced = false;
  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  function findCard(title) {
    return [...document.querySelectorAll('.card')].find((card) => card.querySelector('h3')?.textContent?.trim() === title) || null;
  }

  function kindLabel(kind) {
    return ({
      escrow_hold: 'İşlem için bloke edildi',
      escrow_release: 'Bloke satışa aktarıldı',
      sale_credit: 'Satış geliri',
      escrow_refund: 'İşlem iadesi',
    })[kind] || kind;
  }

  function signed(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === 0) return '—';
    return `${n > 0 ? '+' : ''}${money.format(n)}`;
  }

  async function enhanceDashboard() {
    if (enhanced || !document.querySelector('.page-title h1')) return;
    if (document.querySelector('.page-title h1')?.textContent?.trim() !== 'Panelim') return;
    enhanced = true;

    const balanceCard = findCard('Kullanılabilir Bakiye');
    const empty = document.querySelector('.card.full .empty');

    try {
      const response = await fetch('/api/wallet/me', { headers: { Accept: 'application/json' } });
      if (response.status === 401) {
        if (balanceCard) balanceCard.querySelector('.kpi').innerHTML = '<small>Giriş yapmalısın</small>';
        if (empty) empty.innerHTML = '<a class="btn" href="/login.html">Bakiye ve işlemler için giriş yap</a>';
        return;
      }
      if (!response.ok) {
        if (balanceCard) balanceCard.querySelector('.kpi').innerHTML = '<small>Bakiye sistemi staging doğrulamasını bekliyor</small>';
        return;
      }

      const data = await response.json();
      const wallet = data.wallet;
      if (balanceCard && wallet) {
        balanceCard.querySelector('.kpi').innerHTML = `${esc(money.format(wallet.availableBalance))}<small>Bloke: ${esc(money.format(wallet.heldBalance))}</small>`;
      }

      const txResponse = await fetch('/api/wallet/transactions?limit=10', { headers: { Accept: 'application/json' } });
      if (!txResponse.ok || !empty) return;
      const txData = await txResponse.json();
      const rows = Array.isArray(txData.transactions) ? txData.transactions : [];
      if (!rows.length) {
        empty.textContent = 'Henüz bakiye hareketi yok.';
        return;
      }

      empty.classList.remove('empty');
      empty.innerHTML = `<div class="list">${rows.map((tx) => {
        const delta = Number(tx.availableDelta || 0) !== 0 ? tx.availableDelta : tx.heldDelta;
        const date = tx.createdAt ? new Date(tx.createdAt).toLocaleString('tr-TR') : '';
        return `<div class="list-item"><div><strong>${esc(kindLabel(tx.kind))}</strong><span>İşlem #${esc(tx.orderId)} · ${esc(date)}</span></div><span>${esc(signed(delta))}</span></div>`;
      }).join('')}</div>`;
    } catch (_) {
      if (balanceCard) balanceCard.querySelector('.kpi').innerHTML = '<small>Bakiye bilgisi alınamadı</small>';
    }
  }

  const observer = new MutationObserver(() => enhanceDashboard());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(enhanceDashboard, 80);
  });
})();
