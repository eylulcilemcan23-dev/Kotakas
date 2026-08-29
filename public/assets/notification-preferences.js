(() => {
  const onPage = () => location.pathname === '/notifications.html';
  const labels = {
    messages: ['Mesajlar', 'Satıcı, alıcı ve ihtilaf konuşmalarındaki yeni mesajlar.'],
    market: ['Pazar ve teklifler', 'İlan, teklif, satış ilgisi ve pazar güncellemeleri.'],
    disputes: ['İhtilaflar', 'İhtilaf açılışı ve finans dışı süreç güncellemeleri.'],
    system: ['Sistem', 'Genel KOTAKAS sistem ve kullanım bildirimleri.'],
    finance: ['Para ve iadeler', 'Bakiye, ödeme, bloke, iade, komisyon ve ödeme aktarımı bildirimleri.'],
    security: ['Güvenlik', 'Hesap ve güvenlik bildirimleri.'],
  };
  let cached = null;
  let loading = false;
  let timer = null;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function row(key, enabled, locked) {
    const [title, description] = labels[key];
    return `<label class="notification-pref-row ${locked ? 'locked' : ''}">
      <span><strong>${title}</strong><small>${description}</small>${locked ? '<em>Zorunlu bildirim · kapatılamaz</em>' : ''}</span>
      <input type="checkbox" data-notification-pref="${key}" ${enabled ? 'checked' : ''} ${locked ? 'disabled' : ''}>
      <i aria-hidden="true"></i>
    </label>`;
  }

  function markup(data) {
    const prefs = data.preferences || {};
    const locked = new Set(Array.isArray(data.locked) ? data.locked : ['finance', 'security']);
    const order = ['messages', 'market', 'disputes', 'system', 'finance', 'security'];
    return `<section class="card full notification-pref-card" data-notification-preferences-card="1">
      <div class="page-title notification-pref-title">
        <div><h3>Bildirim Tercihleri</h3><p>Gereksiz bildirimleri kapat; para, iade ve güvenlik bildirimleri her zaman açık kalır.</p></div>
        <span class="badge green">Kontrol sende</span>
      </div>
      <div class="notification-pref-list">
        ${order.map((key) => row(key, prefs[key] !== false, locked.has(key))).join('')}
      </div>
      <div class="notification-pref-status" data-notification-pref-status>${data.updatedAt ? `Son değişiklik: ${new Date(data.updatedAt).toLocaleString('tr-TR')}` : 'Varsayılan ayarlar kullanılıyor.'}</div>
    </section>`;
  }

  function mount(data) {
    if (!onPage()) return;
    const main = document.querySelector('main.main');
    if (!main || main.querySelector('[data-notification-preferences-card]')) return;
    const firstCard = main.querySelector('section.card.full');
    if (!firstCard) return;
    firstCard.insertAdjacentHTML('beforebegin', markup(data));
    const card = main.querySelector('[data-notification-preferences-card]');
    card?.querySelectorAll('[data-notification-pref]').forEach((input) => {
      if (input.disabled) return;
      input.addEventListener('change', async () => {
        const key = input.dataset.notificationPref;
        const wanted = input.checked;
        input.disabled = true;
        const status = card.querySelector('[data-notification-pref-status]');
        if (status) status.textContent = 'Kaydediliyor…';
        const result = await jsonFetch('/api/notification-preferences/mine', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: wanted }),
        });
        if (!result.response.ok) {
          input.checked = !wanted;
          if (status) status.textContent = 'Ayar kaydedilemedi. Biraz sonra tekrar dene.';
          input.disabled = false;
          return;
        }
        cached = result.data;
        if (status) status.textContent = `Kaydedildi: ${new Date(result.data.updatedAt || Date.now()).toLocaleString('tr-TR')}`;
        input.disabled = false;
      });
    });
  }

  async function load() {
    if (!onPage()) return;
    if (cached) {
      mount(cached);
      return;
    }
    if (loading) return;
    loading = true;
    try {
      const { response, data } = await jsonFetch('/api/notification-preferences/mine');
      if (response.ok) {
        cached = data;
        mount(data);
      } else if (response.status === 503) {
        const main = document.querySelector('main.main');
        const firstCard = main?.querySelector('section.card.full');
        if (firstCard && !main.querySelector('[data-notification-preferences-card]')) {
          firstCard.insertAdjacentHTML('beforebegin', '<section class="card full notification-pref-card" data-notification-preferences-card="1"><div class="notice">Bildirim tercihleri staging veritabanı doğrulamasından sonra aktif olacak. Para, iade ve güvenlik bildirimleri yine zorunlu kalacak.</div></section>');
        }
      }
    } finally {
      loading = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(load, 80);
  }

  const observer = new MutationObserver(() => {
    if (!onPage()) return;
    const main = document.querySelector('main.main');
    if (main && !main.querySelector('[data-notification-preferences-card]')) schedule();
  });

  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(load, 450);
  });
})();
