(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/sell.html') return;

  const contactPattern = /(?:https?:\/\/|www\.|whats?app|instagram|telegram|t\.me|discord(?:\.gg)?|(?:^|\s)@[a-z0-9._]{3,}|(?:\+?90[\s.-]*)?(?:\(?0?5\d{2}\)?[\s.-]*)\d{3}[\s.-]*\d{2}[\s.-]*\d{2})/i;
  let booted = false;

  async function loadAllowance() {
    const response = await fetch('/api/market/listing-allowance/mine', { headers: { Accept: 'application/json' } });
    if (response.status === 401) return { login: false };
    const data = await response.json().catch(() => ({}));
    return response.ok ? data.allowance : null;
  }

  function install(form, allowance) {
    if (!form || form.dataset.policyEnhanced === '1') return;
    form.dataset.policyEnhanced = '1';
    const title = form.querySelector('[name="title"]');
    const description = form.querySelector('[name="description"]');
    const submit = form.querySelector('button[type="submit"]');
    const note = document.createElement('div');
    note.className = 'notice marketplace-policy-note';
    note.innerHTML = allowance?.unlimited
      ? `<strong>Pazarcı hesabı:</strong> İlan sınırı yok. Tamamlanan her satışta %${(Number(allowance.commissionRate || 0) * 100).toFixed(2).replace(/\.00$/, '')} KOTAKAS komisyonu uygulanır.`
      : `<strong>Normal kullanıcı:</strong> Bu ay ${allowance?.used ?? 0}/${allowance?.limit ?? 1} ücretsiz ilan hakkını kullandın. Normal kullanıcı satışında komisyon %0'dır.`;
    form.prepend(note);

    if (allowance && !allowance.unlimited && Number(allowance.remaining) <= 0 && submit) {
      submit.disabled = true;
      submit.textContent = 'Aylık Ücretsiz İlan Hakkın Doldu';
      note.insertAdjacentHTML('beforeend', ' <a href="/trader-apply.html">Pazarcı Ol</a> ile sınırsız ilan verebilirsin.');
    }

    const contactNote = document.createElement('div');
    contactNote.className = 'marketplace-contact-warning';
    contactNote.hidden = true;
    contactNote.textContent = 'Telefon, WhatsApp, Instagram, Telegram, Discord, kullanıcı adı veya dış bağlantı ilanlarda paylaşılamaz.';
    form.insertBefore(contactNote, submit);

    const validate = () => {
      const hasRisk = contactPattern.test(`${title?.value || ''}\n${description?.value || ''}`);
      contactNote.hidden = !hasRisk;
      if (submit && !(allowance && !allowance.unlimited && Number(allowance.remaining) <= 0)) submit.disabled = hasRisk;
      return !hasRisk;
    };
    title?.addEventListener('input', validate);
    description?.addEventListener('input', validate);
    form.addEventListener('submit', (event) => {
      if (!validate()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert('İlan içine dış iletişim bilgisi ekleyemezsin. Satış ve ödeme KOTAKAS içinde kalmalıdır.');
      }
    }, true);

    const side = form.closest('.grid')?.querySelector('aside.card');
    if (side && allowance) {
      const kpi = side.querySelector('.kpi');
      if (kpi) kpi.innerHTML = allowance.unlimited
        ? `%${(Number(allowance.commissionRate || 0) * 100).toFixed(2).replace(/\.00$/, '')}<small> pazarcı satış komisyonu</small>`
        : '1<small> aylık ücretsiz ilan · %0 komisyon</small>';
    }
  }

  async function boot() {
    if (booted) return;
    const form = document.querySelector('#marketSellForm');
    if (!form) return;
    booted = true;
    const allowance = await loadAllowance().catch(() => null);
    install(form, allowance);
  }

  const observer = new MutationObserver(() => boot());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(boot, 150);
  });
})();
