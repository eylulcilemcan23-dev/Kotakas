(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  async function api(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(data.error || `http_${response.status}`), { status: response.status });
    return data;
  }

  async function render() {
    let data;
    try {
      data = await api('/api/admin/support/tickets?limit=30');
    } catch (error) {
      if ([401, 403, 503].includes(error.status)) return;
      return;
    }
    const main = document.querySelector('main.main');
    if (!main || main.querySelector('[data-admin-support]')) return;
    const section = document.createElement('section');
    section.className = 'card full';
    section.dataset.adminSupport = '1';
    section.innerHTML = `<h3>Destek Talepleri</h3><p class="sub">Sınırlı, tam ve ana yöneticiler destek taleplerini görebilir. Finans yetkisi gerekmez.</p><div class="list" data-admin-support-list></div>`;
    main.appendChild(section);
    const list = section.querySelector('[data-admin-support-list]');
    const tickets = data.tickets || [];
    list.innerHTML = tickets.length ? tickets.map((ticket) => `
      <div class="list-item" data-ticket="${esc(ticket.id)}">
        <div style="min-width:0;flex:1"><strong>#${esc(ticket.id)} · ${esc(ticket.subject)}</strong><span>${esc(ticket.lastMessage || '')}</span><small>${esc(ticket.status)} · ${new Date(ticket.updatedAt).toLocaleString('tr-TR')}</small></div>
        <div class="actions" style="flex-wrap:wrap"><button class="btn" type="button" data-open-support="${esc(ticket.id)}">Aç</button>${ticket.status !== 'closed' ? `<button class="btn ghost" type="button" data-close-support="${esc(ticket.id)}">Kapat</button>` : ''}</div>
      </div>`).join('') : '<div class="empty">Açık destek talebi yok.</div>';

    section.querySelectorAll('[data-open-support]').forEach((button) => button.addEventListener('click', async () => {
      const id = button.dataset.openSupport;
      try {
        const thread = await api(`/api/admin/support/tickets/${encodeURIComponent(id)}`);
        const messages = (thread.messages || []).map((message) => `${message.senderRole === 'user' ? 'Kullanıcı' : 'Yönetim'}: ${message.body}`).join('\n\n');
        const reply = prompt(`Destek #${id}\n\n${messages}\n\nYanıt yaz:`);
        if (!reply) return;
        await api(`/api/admin/support/tickets/${encodeURIComponent(id)}/reply`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: reply }),
        });
        location.reload();
      } catch { alert('Destek talebi işlenemedi.'); }
    }));

    section.querySelectorAll('[data-close-support]').forEach((button) => button.addEventListener('click', async () => {
      if (!confirm('Bu destek talebi kapatılsın mı?')) return;
      try {
        await api(`/api/admin/support/tickets/${encodeURIComponent(button.dataset.closeSupport)}/close`, { method: 'POST' });
        location.reload();
      } catch { alert('Destek talebi kapatılamadı.'); }
    }));
  }

  window.addEventListener('DOMContentLoaded', () => setTimeout(render, 300));
})();
