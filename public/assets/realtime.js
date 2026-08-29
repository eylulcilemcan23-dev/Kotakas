(() => {
  if (typeof window.io !== 'function') return;

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function toast(message) {
    const old = document.querySelector('#kotakasRealtimeToast');
    old?.remove();
    const box = document.createElement('div');
    box.id = 'kotakasRealtimeToast';
    box.textContent = message;
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;right:16px;bottom:18px;z-index:9999;max-width:min(360px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.35);font:600 13px/1.4 system-ui,sans-serif';
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4500);
  }

  const socket = window.io({
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => dispatch('kotakas:realtime-connected', { id: socket.id }));
  socket.on('disconnect', (reason) => dispatch('kotakas:realtime-disconnected', { reason }));
  socket.on('connect_error', (error) => dispatch('kotakas:realtime-error', { message: error?.message || 'connection_error' }));

  socket.on('admin:notification', (payload) => {
    dispatch('kotakas:admin-notification', payload);
    if (location.pathname === '/admin.html' && payload?.notification?.title) toast(payload.notification.title);
  });

  socket.on('admin:notification-read', (payload) => {
    dispatch('kotakas:admin-notification-read', payload);
  });

  socket.on('dispute:message', (payload) => {
    dispatch('kotakas:dispute-message', payload);
    const message = payload?.message;
    if (message?.senderRole?.startsWith('admin_') && location.pathname !== '/admin.html') {
      toast(`İhtilaf #${payload.disputeId}: Yönetimden yeni mesaj var.`);
    }
  });

  socket.on('dispute:resolved', (payload) => {
    dispatch('kotakas:dispute-resolved', payload);
    if (location.pathname !== '/admin.html' && payload?.dispute?.id) {
      toast(`İhtilaf #${payload.dispute.id} yönetim tarafından sonuçlandırıldı.`);
    }
  });

  window.KotakasRealtime = {
    socket,
    connected: () => socket.connected,
  };
})();
