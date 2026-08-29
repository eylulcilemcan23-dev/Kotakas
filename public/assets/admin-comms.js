(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let chatDispute = null;
  let pollTimer = null;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function getHost() {
    const main = document.querySelector('main.main');
    if (!main) return null;
    let host = document.querySelector('#adminCommsHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'adminCommsHost';
      host.className = 'grid';
      host.style.marginTop = '18px';
      main.appendChild(host);
    }
    return host;
  }

  async function markRead(id) {
    const { response } = await jsonFetch(`/api/admin/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (response.ok) await renderNotifications();
  }

  function notificationCard(data) {
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    return `<section class="card full"><div class="page-title" style="margin-bottom:12px"><div><h3>Yönetici Bildirimleri</h3><p>Okunmamış: ${Number(data.unreadCount || 0)}</p></div><span class="badge ${Number(data.unreadCount || 0) ? 'yellow' : 'green'}">${Number(data.unreadCount || 0)} yeni</span></div>${notifications.length ? `<div class="list">${notifications.map((n) => `<div class="list-item"><div style="flex:1;min-width:0"><strong>${esc(n.title)}</strong><span>${esc(n.body)}</span></div><div style="display:flex;gap:8px;align-items:center"><span class="badge ${n.unread ? 'yellow' : ''}">${n.unread ? 'Yeni' : 'Okundu'}</span>${n.unread ? `<button class="btn ghost" data-read-notification="${esc(n.id)}">Okundu</button>` : ''}</div></div>`).join('')}</div>` : '<div class="empty">Bildirim yok.</div>'}</section>`;
  }

  async function renderNotifications() {
    const host = getHost();
    if (!host) return;
    const { response, data } = await jsonFetch('/api/admin/notifications?limit=20');
    if (response.status === 401 || response.status === 403) return;
    let notificationHost = host.querySelector('#adminNotificationCard');
    if (!notificationHost) {
      notificationHost = document.createElement('div');
      notificationHost.id = 'adminNotificationCard';
      notificationHost.style.display = 'contents';
      host.appendChild(notificationHost);
    }
    notificationHost.innerHTML = response.ok ? notificationCard(data) : '<section class="card full"><div class="notice">Yönetici bildirimleri staging migration doğrulamasını bekliyor.</div></section>';
    notificationHost.querySelectorAll('[data-read-notification]').forEach((button) => button.addEventListener('click', () => markRead(button.dataset.readNotification)));
  }

  function chatPanel() {
    const host = getHost();
    if (!host) return null;
    let panel = host.querySelector('#adminDisputeChat');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'adminDisputeChat';
      panel.className = 'card full';
      panel.style.display = 'none';
      host.appendChild(panel);
    }
    return panel;
  }

  function renderChat(disputeId, messages, open = true) {
    const panel = chatPanel();
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `<div class="page-title" style="margin-bottom:12px"><div><h3>İhtilaf #${esc(disputeId)} Mesajları</h3><p>Alıcı, satıcı ve yönetim yazışma geçmişi</p></div><button class="btn ghost" id="adminChatClose">Kapat</button></div><div class="list">${messages.length ? messages.map((m) => `<div class="list-item"><div><strong>${m.senderRole.startsWith('admin_') ? `Yönetim · ${esc(m.senderRole)}` : `Kullanıcı #${esc(m.senderId)}`}</strong><span>${esc(m.body)}</span></div><span class="badge">${esc(new Date(m.createdAt).toLocaleString('tr-TR'))}</span></div>`).join('') : '<div class="empty">Henüz mesaj yok.</div>'}</div>${open ? `<form class="form" id="adminDisputeMessageForm" style="margin-top:14px"><div class="field"><label>Yönetim mesajı</label><textarea name="body" rows="3" maxlength="2000" required placeholder="Kullanıcıdan belge, ekran görüntüsü veya teslimat açıklaması iste..."></textarea></div><button class="btn primary" type="submit">Mesaj Gönder</button></form>` : '<div class="notice" style="margin-top:14px">İhtilaf sonuçlandı; yazışma geçmişi salt okunur.</div>'}`;
    panel.querySelector('#adminChatClose')?.addEventListener('click', () => { chatDispute = null; panel.style.display = 'none'; });
    panel.querySelector('#adminDisputeMessageForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const body = new FormData(form).get('body');
      const { response, data } = await jsonFetch(`/api/disputes/${encodeURIComponent(disputeId)}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      });
      button.disabled = false;
      if (!response.ok) {
        alert(data.error === 'communications_temporarily_unavailable' ? 'Mesajlaşma staging doğrulamasına kadar kapalı.' : 'Mesaj gönderilemedi.');
        return;
      }
      form.reset();
      await refreshActiveChat();
    });
  }

  async function refreshActiveChat() {
    if (!chatDispute) return;
    const { response, data } = await jsonFetch(`/api/disputes/${encodeURIComponent(chatDispute)}/messages?limit=200`);
    if (response.ok) renderChat(chatDispute, Array.isArray(data.messages) ? data.messages : [], true);
  }

  async function openChat(disputeId, open = true) {
    chatDispute = String(disputeId);
    const panel = chatPanel();
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = '<div class="empty">Mesajlar yükleniyor…</div>';
    const { response, data } = await jsonFetch(`/api/disputes/${encodeURIComponent(disputeId)}/messages?limit=200`);
    if (!response.ok) {
      panel.innerHTML = '<div class="notice">İhtilaf mesajlaşması staging migration doğrulamasını bekliyor.</div>';
      return;
    }
    renderChat(disputeId, Array.isArray(data.messages) ? data.messages : [], open);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function enhanceDisputeRows() {
    document.querySelectorAll('[data-admin-dispute]').forEach((row) => {
      const id = row.dataset.adminDispute;
      if (row.querySelector('[data-admin-chat]')) return;
      const actions = row.lastElementChild;
      if (!actions) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.dataset.adminChat = id;
      button.textContent = 'Mesajlar';
      button.addEventListener('click', () => openChat(id, true));
      actions.appendChild(button);
    });
  }

  async function tick() {
    await renderNotifications();
    enhanceDisputeRows();
    await refreshActiveChat();
  }

  const observer = new MutationObserver(() => enhanceDisputeRows());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(tick, 350);
    pollTimer = setInterval(tick, 60000);
    window.addEventListener('beforeunload', () => clearInterval(pollTimer), { once: true });
  });

  window.addEventListener('kotakas:admin-notification', () => renderNotifications());
  window.addEventListener('kotakas:admin-notification-read', () => renderNotifications());
  window.addEventListener('kotakas:dispute-message', (event) => {
    renderNotifications();
    if (chatDispute && String(event.detail?.disputeId) === String(chatDispute)) refreshActiveChat();
  });
  window.addEventListener('kotakas:dispute-resolved', () => tick());
})();
