(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/dashboard.html') return;

  const money = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let mounted = false;

  function key(prefix) {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${id}`;
  }

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function statusLabel(status) {
    return ({
      created: 'Oluşturuldu', pending: 'Bekliyor', paid: 'Tamamlandı', failed: 'Başarısız', cancelled: 'İptal', refunded: 'İade',
      requested: 'İncelemede', processing: 'İşleniyor',
    })[status] || status;
  }

  function ledgerLabel(kind) {
    return ({
      deposit_credit: 'Bakiye yükleme',
      withdrawal_hold: 'Para çekme için bloke',
      withdrawal_paid: 'Para çekme tamamlandı',
      withdrawal_refund: 'Para çekme iadesi',
    })[kind] || kind;
  }

  function signed(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n === 0) return '—';
    return `${n > 0 ? '+' : ''}${money.format(n)}`;
  }

  async function mount() {
    if (mounted || document.querySelector('.page-title h1')?.textContent?.trim() !== 'Panelim') return;
    const grid = document.querySelector('.grid');
    if (!grid) return;
    mounted = true;

    const panel = document.createElement('section');
    panel.className = 'card full wallet-funding-shell';
    panel.innerHTML = '<div class="empty">Ödeme ve para çekme durumu yükleniyor…</div>';
    grid.appendChild(panel);

    const statusResult = await jsonFetch('/api/wallet/funding/status');
    if (statusResult.response.status === 401) {
      panel.innerHTML = '<div class="empty"><a class="btn" href="/login.html?next=%2Fdashboard.html">Bakiye işlemleri için giriş yap</a></div>';
      return;
    }
    if (!statusResult.response.ok) {
      panel.innerHTML = '<div class="empty">Ödeme altyapısı staging migration doğrulamasını bekliyor.</div>';
      return;
    }

    const status = statusResult.data;
    const [accountsResult, activityResult, withdrawalsResult] = await Promise.all([
      jsonFetch('/api/wallet/payout-accounts'),
      jsonFetch('/api/wallet/funding/activity?limit=12'),
      jsonFetch('/api/wallet/withdrawals?limit=8'),
    ]);
    const accounts = accountsResult.response.ok && Array.isArray(accountsResult.data.accounts) ? accountsResult.data.accounts : [];
    const activity = activityResult.response.ok && Array.isArray(activityResult.data.activity) ? activityResult.data.activity : [];
    const withdrawals = withdrawalsResult.response.ok && Array.isArray(withdrawalsResult.data.withdrawals) ? withdrawalsResult.data.withdrawals : [];

    const depositReady = Boolean(status.paymentCheckoutReady && status.paymentWritesEnabled && status.providerConfigured);
    const withdrawalReady = Boolean(status.withdrawalWritesEnabled && accounts.length);
    const feePct = Number(status.withdrawalFeeRate || 0) * 100;

    panel.innerHTML = `
      <div class="wallet-funding-head">
        <div><small>FAZ 17</small><h2>Bakiye İşlemleri</h2><p>Yükleme ve para çekme kayıtları ayrı finans defterinde, tekrar işlem korumasıyla tutulur.</p></div>
        <span class="badge ${status.compatibility?.ready ? 'green' : 'yellow'}">${status.compatibility?.ready ? 'ALTYAPI HAZIR' : 'MIGRATION BEKLİYOR'}</span>
      </div>
      <div class="wallet-funding-grid">
        <form class="wallet-funding-box" data-deposit-form>
          <div class="wallet-funding-icon">＋</div><div><h3>Bakiye Ekle</h3><p>${depositReady ? 'Güvenli ödeme sayfasına yönlendirilirsin.' : 'Gerçek ödeme sağlayıcısının checkout bağlantısı henüz açılmadı.'}</p></div>
          <label>Tutar (TL)<input name="amount" type="number" min="1" step="0.01" placeholder="500" ${depositReady ? '' : 'disabled'}></label>
          <button class="btn primary" type="submit" ${depositReady ? '' : 'disabled'}>${depositReady ? 'Ödemeye Geç' : 'Sağlayıcı Bağlantısı Bekleniyor'}</button>
        </form>
        <form class="wallet-funding-box" data-withdraw-form>
          <div class="wallet-funding-icon">↗</div><div><h3>Nakit Çek</h3><p>Talep oluşturulunca tutar kullanılabilir bakiyeden bloke bakiyeye alınır; sonuçlanmadan kaybolmaz.</p></div>
          <label>Doğrulanmış ödeme hesabı<select name="payoutAccountId" ${withdrawalReady ? '' : 'disabled'}>${accounts.length ? accounts.map((row) => `<option value="${esc(row.id)}">${esc(row.displayLabel)} · ${esc(row.provider)}</option>`).join('') : '<option>Doğrulanmış hesap yok</option>'}</select></label>
          <label>Tutar (TL)<input name="amount" type="number" min="${Number(status.withdrawalMinAmount || 100)}" max="${Number(status.withdrawalMaxAmount || 100000)}" step="0.01" placeholder="${Number(status.withdrawalMinAmount || 100)}" ${withdrawalReady ? '' : 'disabled'}></label>
          <small>Limit: ${esc(money.format(Number(status.withdrawalMinAmount || 0)))} – ${esc(money.format(Number(status.withdrawalMaxAmount || 0)))}${feePct > 0 ? ` · Ücret %${feePct.toFixed(2)}` : ' · Şu an ek çekim ücreti yok'}</small>
          <button class="btn" type="submit" ${withdrawalReady ? '' : 'disabled'}>${withdrawalReady ? 'Çekim Talebi Oluştur' : 'Doğrulanmış Ödeme Hesabı Bekleniyor'}</button>
        </form>
      </div>
      <div class="wallet-funding-note"><strong>Güvenlik:</strong> KOTAKAS bu tabloda ham kart, IBAN veya Papara numarası saklamaz. Yalnız ödeme sağlayıcısının tokeni ve maskeli hesap etiketi kullanılır.</div>
      <div class="wallet-funding-columns">
        <div><h3>Son Bakiye Hareketleri</h3><div data-funding-activity>${activity.length ? activity.map((row) => {
          const delta = Number(row.availableDelta || 0) !== 0 ? row.availableDelta : row.heldDelta;
          const date = row.createdAt ? new Date(row.createdAt).toLocaleString('tr-TR') : '';
          return `<div class="wallet-funding-row"><div><strong>${esc(ledgerLabel(row.kind))}</strong><span>${esc(date)}</span></div><b>${esc(signed(delta))}</b></div>`;
        }).join('') : '<div class="empty">Henüz yükleme/çekim hareketi yok.</div>'}</div></div>
        <div><h3>Para Çekme Taleplerim</h3><div>${withdrawals.length ? withdrawals.map((row) => `<div class="wallet-funding-row"><div><strong>${esc(money.format(row.amount))}</strong><span>${esc(row.payoutAccount?.displayLabel || 'Ödeme hesabı')} · ${esc(row.requestedAt ? new Date(row.requestedAt).toLocaleString('tr-TR') : '')}</span></div><span class="badge ${row.status === 'paid' ? 'green' : row.status === 'cancelled' || row.status === 'failed' ? 'red' : 'yellow'}">${esc(statusLabel(row.status))}</span></div>`).join('') : '<div class="empty">Henüz para çekme talebi yok.</div>'}</div></div>
      </div>`;

    const depositForm = panel.querySelector('[data-deposit-form]');
    depositForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!depositReady) return;
      const amount = Number(new FormData(depositForm).get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) return alert('Geçerli bir tutar gir.');
      const button = depositForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await jsonFetch('/api/wallet/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key('deposit') },
          body: JSON.stringify({ amount }),
        });
        if (!result.response.ok) {
          alert(result.data.error === 'payment_provider_checkout_not_ready' ? 'Ödeme sağlayıcısı henüz bağlanmadı.' : 'Bakiye yükleme başlatılamadı.');
          return;
        }
        if (result.data.intent?.checkoutUrl) location.href = result.data.intent.checkoutUrl;
        else alert('Ödeme kaydı oluştu fakat checkout adresi hazır değil.');
      } finally {
        button.disabled = false;
      }
    });

    const withdrawForm = panel.querySelector('[data-withdraw-form]');
    withdrawForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!withdrawalReady) return;
      const form = new FormData(withdrawForm);
      const amount = Number(form.get('amount'));
      if (!Number.isFinite(amount) || amount <= 0) return alert('Geçerli bir tutar gir.');
      if (!confirm(`${money.format(amount)} para çekme talebi oluşturulsun mu? Tutar sonuçlanana kadar bloke edilecek.`)) return;
      const button = withdrawForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await jsonFetch('/api/wallet/withdrawals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key('withdrawal') },
          body: JSON.stringify({ amount, payoutAccountId: form.get('payoutAccountId') }),
        });
        if (!result.response.ok) {
          const message = ({
            insufficient_available_balance: 'Kullanılabilir bakiyen yetersiz.',
            withdrawal_amount_outside_limits: 'Tutar para çekme limitlerinin dışında.',
          })[result.data.error] || 'Para çekme talebi oluşturulamadı.';
          alert(message);
          return;
        }
        alert('Para çekme talebin alındı. Tutar bloke bakiyeye taşındı.');
        location.reload();
      } finally {
        button.disabled = false;
      }
    });
  }

  const observer = new MutationObserver(() => mount().catch(() => {}));
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => mount().catch(() => {}), 120);
  });
})();
