(async()=>{
  const UI_VERSION='20260831-2030';
  const theme=document.createElement('link');
  theme.rel='stylesheet';
  theme.id='kotakasRetailTheme';
  theme.href='/assets/chunks/retail-market-theme.css?v='+UI_VERSION;
  document.head.appendChild(theme);
  const pages=document.createElement('link');
  pages.rel='stylesheet';
  pages.id='kotakasReferencePages';
  pages.href='/assets/chunks/reference-pages.css?v='+UI_VERSION;
  document.head.appendChild(pages);
  const cartStyle=document.createElement('link');
  cartStyle.rel='stylesheet';
  cartStyle.id='kotakasStorefrontCartStyle';
  cartStyle.href='/assets/chunks/storefront-cart.css?v='+UI_VERSION;
  document.head.appendChild(cartStyle);
  const scripts=['/js/chunks/core.js','/js/chunks/security-client.js','/js/chunks/auth-security.js','/js/chunks/real-placeholders.js','/js/chunks/marketplace.js','/js/chunks/character-sale.js','/js/chunks/market-offers.js','/js/chunks/payments.js','/js/chunks/wallet-header.js','/js/chunks/management.js','/js/chunks/deals.js','/js/chunks/trust.js','/js/chunks/admin-init.js','/js/chunks/moderation.js','/js/chunks/finance.js','/js/chunks/admin-risk.js','/js/chunks/favorites.js','/js/chunks/item-watches.js','/js/chunks/notification-preferences.js','/js/chunks/reports.js','/js/chunks/admin-tools.js','/js/chunks/verification.js','/js/chunks/trader-profile.js','/js/chunks/trader-discovery.js','/js/chunks/trader-realtime.js','/js/chunks/admin-trader-ranking.js','/js/chunks/admin-audit.js','/js/chunks/admin-backups.js','/js/chunks/support-center.js','/js/chunks/session-ui.js','/js/chunks/live-refresh.js','/js/chunks/behavior-fixes.js','/js/chunks/marketplace-extras.js','/js/chunks/listing-experience.js','/js/chunks/panel-centers.js','/js/chunks/site-state.js','/js/chunks/panel-insights.js','/js/chunks/panel-pro.js','/js/chunks/admin-resilience.js','/js/chunks/panel-ops.js','/js/chunks/panel-workflow.js','/js/chunks/urgent-sales.js','/js/chunks/offer-funding-ux.js','/js/chunks/market-rate-admin.js','/js/chunks/wallet-center.js','/js/chunks/active-deal-center.js','/js/chunks/trader-workbench.js','/js/chunks/item-icon-search.js','/js/chunks/app-shell.js','/js/chunks/game-market-shell.js','/js/chunks/drawer-game-nav.js','/js/chunks/marketplace-pro-shell.js','/js/chunks/reference-page-unifier.js','/js/chunks/storefront-cart.js','/js/chunks/home-marketplace-pro.js','/js/chunks/home-direct-slider.js','/js/chunks/notification-actions.js'];
  for(const src of scripts){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src+(src.includes('?')?'&':'?')+'v='+UI_VERSION;
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }
})().catch(()=>console.error('KOTAKAS arayüz dosyaları yüklenemedi.'));
