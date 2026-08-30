(async()=>{
  const scripts=['/js/chunks/core.js','/js/chunks/security-client.js','/js/chunks/auth-security.js','/js/chunks/real-placeholders.js','/js/chunks/marketplace.js','/js/chunks/payments.js','/js/chunks/management.js','/js/chunks/deals.js','/js/chunks/trust.js','/js/chunks/admin-init.js','/js/chunks/moderation.js','/js/chunks/finance.js','/js/chunks/admin-risk.js','/js/chunks/favorites.js','/js/chunks/item-watches.js','/js/chunks/notification-preferences.js','/js/chunks/reports.js','/js/chunks/admin-tools.js','/js/chunks/verification.js','/js/chunks/trader-profile.js','/js/chunks/trader-discovery.js','/js/chunks/trader-realtime.js','/js/chunks/admin-trader-ranking.js','/js/chunks/admin-audit.js','/js/chunks/admin-backups.js','/js/chunks/support-center.js','/js/chunks/session-ui.js','/js/chunks/live-refresh.js','/js/chunks/behavior-fixes.js','/js/chunks/marketplace-extras.js','/js/chunks/panel-centers.js','/js/chunks/site-state.js','/js/chunks/panel-insights.js'];
  for(const src of scripts){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }
})().catch(()=>console.error('KOTAKAS arayüz dosyaları yüklenemedi.'));
