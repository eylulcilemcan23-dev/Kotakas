(() => {
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const onPage = () => (location.pathname === '/notifications.html');
  let lastUnread = 0;
  let renderTimer = null;

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function decorateBell(count) {
    lastUnread = Number(count || 0);
    document.querySelectorAll('a[href="/notifications.html"]').forEach((link) => {
      let badge = link.querySelector('[data-user-notification-count]');
      if (!badge) {
        badge = document.createElement('span');
        badge.dataset.userNotificationCount = '1';
        badge.style.cssText = 'display:none;min-width:18px;height:18px;padding:0 5px;margin-left:5px;border-radius:999px;align-items:center;justify-content:center;font-size:10px;font-weight:800;background:#f59e0b;color:#111827;vertical-align:middle';
        link.appendChild(badge);
      }
      if (lastUnread > 0) {
        badge.textContent = lastUnread > 99 ? '99+' : String(lastUnread);
        badge.style.display = 'inline-flex';
        link.setAttribute('aria-label', `Bildirimler, ${lastUnread} okunmamış`);
      } else {
        badge.style.display = 'none';
        link.setAttribute('aria-label', 'Bildirimler');
      }
    });
  }

  function targetHref(notification) {
    if (notification.targetType === 'dispute') return '/deals.html';
    if (notification.targetType === 'order') return '/deals.html';
    return '/notifications.html';
  }

  function card(data) {
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    return `
      <div class="page-title">
        <div><h1>Bildirimler</h1><p>İşlem, ihtilaf, mesaj ve yönetim güncellemelerin.</p></div>
        ${Number(data.unreadCount || 0) ? '<button class="btn ghost" id="markAllNotificationsRead">Tümünü Okundu Yap</button>' : ''}
      </div>
      <section class="card full">
        <div class="page-title" style="margin-bottom:12px">
          <div><h3>Bildirim Merkezi</h3><p>Okunmamış: ${Number(data.unreadCount || 0)}</p></div>
          <span class="badge ${Number(data.unreadCount || 0) ? 'yellow' : 'green'}">${Number(data.unreadCount || 0)} yeni</span>
        </div>
        ${notifications.length ? `<div class="list">${notifications.map((n) => `
          <div class="list-item" data-user-notification="${esc(n.id)}">
            <div style="flex:1;min-width:0">
              <strong>${esc(n.title)}</strong>
              <span>${esc(n.body)}</span>
              <span>${esc(new Date(n.createdAt).toLocaleString('tr-TR'))}</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
              <span class="badge ${n.unread ? 'yellow' : ''}">${n.unread ? 'Yeni' : 'Okundu'}</span>
              <a class="btn ghost" href="${targetHref(n)}">Aç</a>
              ${n.unread ? `<button class="btn ghost" data-mark-user-notification="${esc(n.id)}">Okundu</button>` : ''}
            </div>
          </div>`).join('')}</div>` : '<div class="empty">Henüz bildirimin yok.</div>'}
      </section>`;
  }

  async function renderPage() {
    if (!onPage()) return;
    const main = document.querySelector('main.main');
    if (!main) return;
    main.dataset.notificationPageEnhanced = '1';
    const { response, data } = await jsonFetch('/api/notifications/mine?limit=100');
    if (response.status === 401) {
      main.innerHTML = '<div class="page-title"><div><h1>Bildirimler</h1><p>Bildirimlerini görmek için giriş yap.</p></div></div><section class="card full"><div class="empty"><a class="btn primary" href="/login.html?next=%2Fnotifications.html">Giriş Yap</a></div></section>';
      decorateBell(0);
      return;
    }
    if (!response.ok) {
      main.innerHTML = '<div class="page-title"><div><h1>Bildirimler</h1><p>Kalıcı bildirim merkezi hazırlanıyor.</p></div></div><section class="card full"><div class="notice">Bildirim tablosu staging migration doğrulamasını bekliyor.</div></section>';
      return;
    }
    decorateBell(data.unreadCount);
    main.innerHTML = card(data);
    main.querySelectorAll('[data-mark-user-notification]').forEach((button) => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        const result = await jsonFetch(`/api/notifications/${encodeURIComponent(button.dataset.markUserNotification)}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (result.response.ok) await renderPage();
        else button.disabled = false;
      });
    });
    main.querySelector('#markAllNotificationsRead')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      const result = await jsonFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (result.response.ok) await renderPage();
      else button.disabled = false;
    });
  }

  async function refreshSummary() {
    const { response, data } = await jsonFetch('/api/notifications/mine?limit=1');
    if (response.ok) decorateBell(data.unreadCount);
    else if (response.status === 401) decorateBell(0);
  }

  function scheduleRefresh() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      if (onPage()) renderPage();
      else refreshSummary();
    }, 80);
  }

  const observer = new MutationObserver(() => {
    if (document.querySelector('a[href="/notifications.html"]')) decorateBell(lastUnread);
    const main = document.querySelector('main.main');
    if (onPage() && main && main.dataset.notificationPageEnhanced !== '1') {
      main.dataset.notificationPageEnhanced = '1';
      scheduleRefresh();
    }
  });

  window.addEventListener('kotakas:user-notification', scheduleRefresh);
  window.addEventListener('kotakas:user-notification-read', scheduleRefresh);
  window.addEventListener('kotakas:user-notifications-read-all', scheduleRefresh);

  window.addEventListener('DOMContentLoaded', () => {
    const app = document.querySelector('#app');
    if (app) observer.observe(app, { childList: true, subtree: true });
    setTimeout(() => {
      refreshSummary();
      if (onPage()) renderPage();
    }, 300);
  });
})();
