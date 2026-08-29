(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/support.html') return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let tickets = [];

  async function json(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `http_${response.status}`);
    return body;
  }

  function main() { return document.querySelector('main.main'); }

  function statusLabel(status) {
    return status === 'closed' ? 'Kapalı' : status === 'answered' ? 'Yanıtlandı' : 'Açık';
  }

  async function openTicket(id) {
    const data = await json(`/api/support/tickets/${encodeURIComponent(id)}`);
    const messages = (data.messages || []).map((message) => `
      <div class="list-item"><div><strong>${message.senderRole === 'user' ? 'Sen' : 'KOTAKAS Destek'}</strong><span>${esc(message.body)}</span></div><small>${new Date(message.createdAt).toLocaleString('tr-TR')}</small></div>`).join('');
    const ticket = data.ticket || {};
    const reply = ticket.status === 'closed' ? '<div class="notice">Bu talep kapatıldı. Yeni bir konu için yeni talep açabilirsin.</div>' : `
      <form class="form" data-support-reply="${esc(ticket.id)}">
        <div class="field"><label>Yanıt ekle</label><textarea name="body" rows="3" maxlength="2000" required></textarea></div>
        <button class="btn primary" type="submit">Mesaj Gönder</button>
      </form>`;
    const host = document.querySelector('[data-support-thread]');
    if (!host) return;
    host.innerHTML = `<h3>#${esc(ticket.id)} — ${esc(ticket.subject)}</h3><div class="list">${messages || '<div class="empty">Mesaj yok.</div>'}</div>${reply}`;
    host.querySelector('form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = new FormData(event.currentTarget).get('body');
      await json(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      });
      await openTicket(ticket.id);
      await loadTickets();
    });
  }

  function render() {
    const host = main();
    if (!host) return;
    const cards = tickets.map((ticket) => `
      <button class="list-item" type="button" data-support-open="${esc(ticket.id)}" style="width:100%;text-align:left;border:0;background:transparent;color:inherit">
        <div><strong>#${esc(ticket.id)} · ${esc(ticket.subject)}</strong><span>${esc(ticket.lastMessage || 'Yeni destek talebi')}</span></div>
        <span class="badge ${ticket.status === 'closed' ? '' : ticket.status === 'answered' ? 'green' : 'yellow'}">${statusLabel(ticket.status)}</span>
      </button>`).join('');
    host.innerHTML = `
      <div class="page-title"><div><h1>Destek Merkezi</h1><p>Hesap, ödeme, ilan, takas veya ihtilaf dışındaki konular için KOTAKAS destek ekibine sistem içinden ulaş.</p></div></div>
      <div class="grid">
        <section class="card half">
          <h3>Yeni Talep</h3>
          <form class="form" id="supportTicketForm">
            <div class="field"><label>Konu</label><input name="subject" minlength="5" maxlength="120" required placeholder="Örn. Hesap ayarlarım hakkında"></div>
            <div class="field"><label>Mesaj</label><textarea name="body" rows="5" minlength="2" maxlength="2000" required placeholder="Sorunu mümkün olduğunca net anlat."></textarea></div>
            <button class="btn primary" type="submit">Destek Talebi Aç</button>
          </form>
          <p class="sub">Satış öncesi alıcı-satıcı serbest sohbeti burada açılmaz. Destek mesajları yalnız KOTAKAS destek ekibiyle paylaşılır.</p>
        </section>
        <section class="card half"><h3>Taleplerim</h3><div class="list">${cards || '<div class="empty">Henüz destek talebin yok.</div>'}</div></section>
        <section class="card full" data-support-thread><div class="empty">Bir talebi açarak mesaj geçmişini görebilirsin.</div></section>
      </div>`;

    document.querySelector('#supportTicketForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await json('/api/support/tickets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: data.get('subject'), body: data.get('body') }),
        });
        form.reset();
        await loadTickets();
      } catch (error) {
        if (error.message === 'unauthorized') location.href = '/login.html';
        else alert('Destek talebi şu anda gönderilemedi.');
      } finally {
        if (button) button.disabled = false;
      }
    });
    document.querySelectorAll('[data-support-open]').forEach((button) => button.addEventListener('click', () => openTicket(button.dataset.supportOpen).catch(() => alert('Talep açılamadı.'))));
  }

  async function loadTickets() {
    try {
      const data = await json('/api/support/tickets/mine?limit=50');
      tickets = data.tickets || [];
      render();
    } catch (error) {
      const host = main();
      if (!host) return;
      if (['unauthorized','http_401'].includes(error.message)) {
        host.innerHTML = '<div class="auth-wrap"><section class="auth-card"><h1>Destek Merkezi</h1><div class="notice">Destek talebi açmak ve geçmişini görmek için giriş yapmalısın.</div><a class="btn primary" href="/login.html">Giriş Yap</a></section></div>';
      } else {
        host.innerHTML = '<div class="notice">Destek sistemi staging doğrulaması tamamlanana kadar kapalı olabilir.</div>';
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => setTimeout(loadTickets, 120));
})();
