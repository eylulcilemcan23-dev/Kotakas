(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/deals.html') return;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  let activeDispute = null;
  let refreshTimer = null;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function panelHost() {
    const main = document.querySelector('main.main');
    if (!main) return null;
    let panel = document.querySelector('#disputeChatPanel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'disputeChatPanel';
      panel.className = 'card full';
      panel.style.marginTop = '18px';
      panel.style.display = 'none';
      main.appendChild(panel);
    }
    return panel;
  }

  function renderMessages(panel, dispute, messages) {
    const open = dispute.status === 'open';
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="page-title" style="margin-bottom:14px"><div><h2>İhtilaf #${esc(dispute.id)} Mesajları</h2><p>İşlem #${esc(dispute.orderId)} · ${open ? 'İnceleme devam ediyor' : 'Sonuçlandı'}</p></div><button class="btn ghost" id="closeDisputeChat">Kapat</button></div>
      <div class="list" id="disputeMessageList">${messages.length ? messages.map((message) => `
        <div class="list-item"><div><strong>${message.senderRole.startsWith('admin_') ? 'KOTAKAS Yönetim' : `Kullanıcı #${esc(message.senderId)}`}</strong><span>${esc(message.body)}</span></div><span class="badge">${esc(new Date(message.createdAt).toLocaleString('tr-TR'))}</span></div>`).join('') : '<div class="empty">Henüz mesaj yok.</div>'}</div>
      ${open ? `<form class="form" id="disputeMessageForm" style="margin-top:14px"><div class="field"><label>Mesaj</label><textarea name="body" rows="3" maxlength="2000" placeholder="Teslimat, item veya ödeme ile ilgili ayrıntıyı yaz..." required></textarea></div><button class="btn primary" type="submit">Mesaj Gönder</button></form>` : '<div class="notice" style="margin-top:14px">Bu ihtilaf sonuçlandığı için yeni mesaj gönderilemez.</div>'}`;
    panel.querySelector('#closeDisputeChat')?.addEventListener('click', () => {
      activeDispute = null;
      panel.style.display = 'none';
      clearInterval(refreshTimer);
      refreshTimer = null;
    });
    panel.querySelector('#disputeMessageForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const body = new FormData(form).get('body');
      button.disabled = true;
      const { response, data } = await jsonFetch(`/api/disputes/${encodeURIComponent(dispute.id)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
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
    if (!activeDispute) return;
    const panel = panelHost();
    if (!panel) return;
    const result = await jsonFetch(`/api/disputes/${encodeURIComponent(activeDispute.id)}/messages?limit=200`);
    if (result.response.ok) renderMessages(panel, activeDispute, Array.isArray(result.data.messages) ? result.data.messages : []);
  }

  async function openChat(dispute, { scroll = true } = {}) {
    activeDispute = dispute;
    const panel = panelHost();
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = '<div class="empty">Mesajlar yükleniyor…</div>';
    const { response, data } = await jsonFetch(`/api/disputes/${encodeURIComponent(dispute.id)}/messages?limit=200`);
    if (!response.ok) {
      panel.innerHTML = '<div class="notice">Mesajlaşma tablosu staging migration doğrulamasını bekliyor.</div>';
      return;
    }
    renderMessages(panel, dispute, Array.isArray(data.messages) ? data.messages : []);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refreshActiveChat, 30000);
    if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function enhanceRows() {
    const rows = [...document.querySelectorAll('[data-order-id]')];
    if (!rows.length) return;
    const { response, data } = await jsonFetch('/api/disputes/mine?limit=100');
    if (!response.ok) return;
    const disputes = Array.isArray(data.disputes) ? data.disputes : [];
    for (const dispute of disputes) {
      const row = rows.find((item) => item.dataset.orderId === String(dispute.orderId));
      if (!row || row.querySelector(`[data-chat-dispute="${dispute.id}"]`)) continue;
      const actions = row.lastElementChild;
      if (!actions) continue;
      const button = document.createElement('button');
      button.className = 'btn';
      button.type = 'button';
      button.dataset.chatDispute = dispute.id;
      button.textContent = 'Mesajlar';
      button.style.marginLeft = '8px';
      button.addEventListener('click', () => openChat(dispute));
      actions.appendChild(button);
    }
  }

  const observer = new MutationObserver(() => enhanceRows());
  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(enhanceRows, 300);
  });

  window.addEventListener('kotakas:dispute-message', (event) => {
    if (activeDispute && String(event.detail?.disputeId) === String(activeDispute.id)) refreshActiveChat();
    enhanceRows();
  });

  window.addEventListener('kotakas:dispute-resolved', async (event) => {
    if (!activeDispute || String(event.detail?.dispute?.id) !== String(activeDispute.id)) return;
    const { response, data } = await jsonFetch('/api/disputes/mine?limit=100');
    if (!response.ok) return;
    const updated = (Array.isArray(data.disputes) ? data.disputes : []).find((item) => String(item.id) === String(activeDispute.id));
    if (updated) {
      activeDispute = updated;
      await refreshActiveChat();
    }
  });
})();
