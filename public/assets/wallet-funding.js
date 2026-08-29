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
      created: 'Oluşturuldu', pending: 'Ödeme Bekliyor', paid: 'Tamamlandı', failed: 'Başarısız', cancelled: 'İptal', refunded: 'İade',
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

  function isSafePaytrUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'www.paytr.com' && url.pathname.startsWith('/odeme/guvenli/');
    } catch {
      return false;
    }
  }

  function openPaytrCheckout(url) {
    if (!isSafePaytrUrl(url)) {
      alert('Ödeme adresi doğrulanamadı. İşlem başlatılmadı.');
      return;
    }
    document.querySelector('[data-paytr-modal]')?.remove();
    const modal = document.createElement('div');
    modal.className = 'paytr-modal';
    modal.dataset.paytrModal = '1';
    modal.innerHTML = `
      <div class="paytr-modal-backdrop" data-paytr-close></div>
      <section class="paytr-modal-card" role="dialog" aria-modal="true" aria-label="PayTR güvenli ödeme">
        <div class="paytr-modal-head">
          <div><small>GÜVENLİ ÖDEME</small><h2>PayTR ile Bakiye Ekle</h2><p>Kart bilgilerin PayTR ekranında girilir; KOTAKAS kart numarası veya CVV görmez ve saklamaz.</p></div>
          <button type="button" class="paytr-modal-close" data-paytr-close aria-label="Ödeme penceresini kapat">×</button>
        </div>
        <div class="paytr-frame-wrap"><iframe src="${esc(url)}" title="PayTR güvenli ödeme" allow="payment" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
        <div class="paytr-modal-foot"><span>Yönlendirme tek başına ödeme onayı değildir. Bakiye yalnız PayTR callback doğrulamasından sonra yüklenir.</span><button type="button" class="btn" data-paytr-refresh>Bakiyeyi Yenile</button></div>
      </section>`;
    document.body.appendChild(modal);
    document.documentElement.classList.add('paytr-modal-open');

    const close = () => {
      modal.remove();
      document.documentElement.classList.remove('paytr-modal-open');
    };
    modal.querySelectorAll('[data-paytr-close]').forEach((button) => button.addEventListener('click', close));
    modal.querySelector('[data-paytr-refresh]')?.addEventListener('click', () => location.reload());
    const iframe = modal.querySelector('iframe');
    iframe?.addEventListener('load', () => {
      try {
        const frameUrl = new URL(iframe.contentWindow.location.href);
        if (frameUrl.origin !== location.origin || frameUrl.pathname !== '/dashboard.html') return;
        const result = frameUrl.searchParams.get('payment');
        if (result === 'success') {
          close();
          setTimeout(() => location.replace('/dashboard.html?payment=checking'), 250);
        }
        if (result === 'failed') {
          close();
          alert('Ödeme tamamlanamadı. Bakiyene herhangi bir tutar eklenmedi.');
        }
      } catch (_) {
        // PayTR cross-origin sayfası açıkken iframe konumu okunamaz; bu beklenen davranıştır.
      }
    });
  }

  function paymentReturnNotice() {
    const result = new URLSearchParams(location.search).get('payment');
    if (result !== 'checking') return '';
    return '<div class="wallet-payment-return"><strong>Ödeme sonucu kontrol ediliyor.</strong><span>PayTR bildirimi ulaştıysa bakiye birkaç saniye içinde burada görünecek. Sayfayı yenileyebilirsin.</span></div>';
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

    const paytr = status.provider === 'paytr';
    const depositReady = Boolean(paytr && status.paymentCheckoutReady && status.paymentWritesEnabled && status.providerConfigured);
    const withdrawalReady = Boolean(status.withdrawalProviderReady && status.withdrawalWritesEnabled && accounts.length);
    const feePct = Number(status.withdrawalFeeRate || 0) * 100;
    const depositMin = Number(status.depositMinAmount || 50);
    const depositMax = Number(status.depositMaxAmount || 50000);

    panel.innerHTML = `
      ${paymentReturnNotice()}
      <div class="wallet-funding-head">
        <div><small>FAZ 17</small><h2>Bakiye İşlemleri</h2><p>Yükleme ve para çekme kayıtları ayrı finans defterinde, tekrar işlem korumasıyla tutulur.</p></div>
        <span class="badge ${status.compatibility?.ready ? 'green' : 'yellow'}">${status.compatibility?.ready ? 'ALTYAPI HAZIR' : 'MIGRATION BEKLİYOR'}</span>
      </div>
      <div class="wallet-funding-grid">
        <form class="wallet-funding-box" data-deposit-form>
          <div class="wallet-funding-icon">＋</div><div><h3>Bakiye Ekle</h3><p>${depositReady ? `PayTR iFrame · ${status.paymentMode === 'test' ? 'test modu' : 'canlı mod'}. Ödeme sağlayıcısına güvenli biçimde yönlendirilirsin.` : 'PayTR staging bilgileri ve ödeme yazma anahtarları tamamlanınca aktif olacak.'}</p></div>
          <label>Tutar (TL)<input name="amount" type="number" min="${depositMin}" max="${depositMax}" step="0.01" placeholder="500" ${depositReady ? '' : 'disabled'}></label>
          ${paytr ? `<div class="wallet-paytr-profile"><label>Ad Soyad<input name="userName" maxlength="60" autocomplete="name" placeholder="Ad Soyad" ${depositReady ? 'required' : 'disabled'}></label><label>Telefon<input name="userPhone" maxlength="20" autocomplete="tel" placeholder="05xx xxx xx xx" ${depositReady ? 'required' : 'disabled'}></label><label class="full">Adres<input name="userAddress" maxlength="400" autocomplete="street-address" placeholder="Ödeme sağlayıcısı için adres bilgisi" ${depositReady ? 'required' : 'disabled'}></label></div>` : ''}
          <small>Yükleme limiti: ${esc(money.format(depositMin))} – ${esc(money.format(depositMax))}. Kart bilgileri KOTAKAS sunucusuna gönderilmez.</small>
          <button class="btn primary" type="submit" ${depositReady ? '' : 'disabled'}>${depositReady ? 'PayTR ile Ödemeye Geç' : 'PayTR Staging Bağlantısı Bekleniyor'}</button>
        </form>
        <form class="wallet-funding-box" data-withdraw-form>
          <div class="wallet-funding-icon">↗</div><div><h3>Nakit Çek</h3><p>${status.withdrawalProviderReady ? 'Talep oluşturulunca tutar kullanılabilir bakiyeden bloke bakiyeye alınır.' : 'PayTR standart iFrame ödemesi genel cüzdan nakit çekimi için kullanılmaz. Satıcı ödemeleri Marketplace/Platform Transfer onayı sonrası açılacak.'}</p></div>
          <label>Doğrulanmış ödeme hesabı<select name="payoutAccountId" ${withdrawalReady ? '' : 'disabled'}>${accounts.length ? accounts.map((row) => `<option value="${esc(row.id)}">${esc(row.displayLabel)} · ${esc(row.provider)}</option>`).join('') : '<option>Doğrulanmış hesap yok</option>'}</select></label>
          <label>Tutar (TL)<input name="amount" type="number" min="${Number(status.withdrawalMinAmount || 100)}" max="${Number(status.withdrawalMaxAmount || 100000)}" step="0.01" placeholder="${Number(status.withdrawalMinAmount || 100)}" ${withdrawalReady ? '' : 'disabled'}></label>
          <small>Limit: ${esc(money.format(Number(status.withdrawalMinAmount || 0)))} – ${esc(money.format(Number(status.withdrawalMaxAmount || 0)))}${feePct > 0 ? ` · Ücret %${feePct.toFixed(2)}` : ' · Ek çekim ücreti yapılandırılmadı'}</small>
          <button class="btn" type="submit" ${withdrawalReady ? '' : 'disabled'}>${withdrawalReady ? 'Çekim Talebi Oluştur' : 'Marketplace Payout Onayı Bekleniyor'}</button>
        </form>
      </div>
      <div class="wallet-funding-note"><strong>Güvenlik:</strong> KOTAKAS kart numarası, CVV veya PayTR merchant secret değerlerini tarayıcıya göndermez. Ham ödeme hesabı bilgileri finans tablolarında tutulmaz.</div>
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
      const form = new FormData(depositForm);
      const amount = Number(form.get('amount'));
      if (!Number.isFinite(amount) || amount < depositMin || amount > depositMax) return alert(`Tutar ${money.format(depositMin)} ile ${money.format(depositMax)} arasında olmalı.`);
      const userName = String(form.get('userName') || '').trim();
      const userPhone = String(form.get('userPhone') || '').trim();
      const userAddress = String(form.get('userAddress') || '').trim();
      if (paytr && (userName.length < 2 || userPhone.length < 7 || userAddress.length < 5)) return alert('PayTR ödeme bilgilerini eksiksiz doldur.');
      const button = depositForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const result = await jsonFetch('/api/wallet/deposits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key('deposit') },
          body: JSON.stringify({ amount, userName, userPhone, userAddress }),
        });
        if (!result.response.ok) {
          const message = ({
            payment_provider_checkout_not_ready: 'PayTR ödeme bağlantısı henüz staging için hazır değil.',
            payment_provider_temporarily_unavailable: 'PayTR ile bağlantı kurulamadı. Biraz sonra tekrar dene.',
            deposit_amount_outside_limits: 'Yükleme tutarı izin verilen limitlerin dışında.',
            invalid_funding_request: 'Ödeme bilgilerini kontrol et.',
          })[result.data.error] || 'Bakiye yükleme başlatılamadı.';
          alert(message);
          return;
        }
        if (result.data.intent?.checkoutUrl) openPaytrCheckout(result.data.intent.checkoutUrl);
        else alert('Ödeme kaydı oluştu fakat PayTR ödeme ekranı alınamadı.');
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
            withdrawal_provider_not_ready: 'Satıcı ödeme sağlayıcısı henüz aktive edilmedi.',
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
