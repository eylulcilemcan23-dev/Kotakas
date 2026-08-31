(async()=>{
  const UI_VERSION='20260831-1830-exact-generated-covers';

  // Mobil Chrome/Android tarayıcı üst çubuğunu KOTAKAS pembe rengine boya.
  let themeColor=document.querySelector('meta[name="theme-color"]');
  if(!themeColor){themeColor=document.createElement('meta');themeColor.name='theme-color';document.head.appendChild(themeColor)}
  themeColor.content='#ff285a';

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
  const mobileStyle=document.createElement('link');
  mobileStyle.rel='stylesheet';
  mobileStyle.id='kotakasMobileReferenceShell';
  mobileStyle.href='/assets/chunks/mobile-reference-shell.css?v='+UI_VERSION;
  document.head.appendChild(mobileStyle);
  const cartOverride=document.createElement('link');
  cartOverride.rel='stylesheet';
  cartOverride.id='kotakasCartButtonOverride';
  cartOverride.href='/assets/chunks/cart-button-override.css?v='+UI_VERSION;
  document.head.appendChild(cartOverride);
  const homePolish=document.createElement('link');
  homePolish.rel='stylesheet';
  homePolish.id='kotakasHomePolish';
  homePolish.href='/assets/chunks/home-polish.css?v='+UI_VERSION;
  document.head.appendChild(homePolish);
  const liveSupport=document.createElement('link');
  liveSupport.rel='stylesheet';
  liveSupport.id='kotakasLiveSupportStyle';
  liveSupport.href='/assets/chunks/live-support-widget.css?v='+UI_VERSION;
  document.head.appendChild(liveSupport);
  const pageScrollbar=document.createElement('link');
  pageScrollbar.rel='stylesheet';
  pageScrollbar.id='kotakasPageScrollbar';
  pageScrollbar.href='/assets/chunks/page-scrollbar.css?v='+UI_VERSION;
  document.head.appendChild(pageScrollbar);
  const twoPagePolish=document.createElement('link');
  twoPagePolish.rel='stylesheet';
  twoPagePolish.id='kotakasTwoPagePolish';
  twoPagePolish.href='/assets/chunks/two-page-polish.css?v='+UI_VERSION;
  document.head.appendChild(twoPagePolish);
  const traderLivePolish=document.createElement('link');
  traderLivePolish.rel='stylesheet';
  traderLivePolish.id='kotakasTraderLivePolish';
  traderLivePolish.href='/assets/chunks/trader-live-polish.css?v='+UI_VERSION;
  document.head.appendChild(traderLivePolish);

  const scripts=['/js/chunks/core.js','/js/chunks/security-client.js','/js/chunks/auth-security.js','/js/chunks/real-placeholders.js','/js/chunks/marketplace.js','/js/chunks/character-sale.js','/js/chunks/market-offers.js','/js/chunks/payments.js','/js/chunks/wallet-header.js','/js/chunks/management.js','/js/chunks/deals.js','/js/chunks/trust.js','/js/chunks/admin-init.js','/js/chunks/admin-wallet-controls.js','/js/chunks/moderation.js','/js/chunks/finance.js','/js/chunks/admin-risk.js','/js/chunks/favorites.js','/js/chunks/item-watches.js','/js/chunks/notification-preferences.js','/js/chunks/reports.js','/js/chunks/admin-tools.js','/js/chunks/verification.js','/js/chunks/trader-profile.js','/js/chunks/trader-discovery.js','/js/chunks/trader-realtime.js','/js/chunks/admin-trader-ranking.js','/js/chunks/admin-audit.js','/js/chunks/admin-backups.js','/js/chunks/support-center.js','/js/chunks/session-ui.js','/js/chunks/live-refresh.js','/js/chunks/behavior-fixes.js','/js/chunks/marketplace-extras.js','/js/chunks/listing-experience.js','/js/chunks/panel-centers.js','/js/chunks/site-state.js','/js/chunks/panel-insights.js','/js/chunks/panel-pro.js','/js/chunks/admin-resilience.js','/js/chunks/panel-ops.js','/js/chunks/panel-workflow.js','/js/chunks/urgent-sales.js','/js/chunks/offer-funding-ux.js','/js/chunks/market-rate-admin.js','/js/chunks/wallet-center.js','/js/chunks/active-deal-center.js','/js/chunks/trader-workbench.js','/js/chunks/item-icon-search.js','/js/chunks/app-shell.js','/js/chunks/account-drawer-wheel-fix.js','/js/chunks/game-market-shell.js','/js/chunks/drawer-game-nav.js','/js/chunks/local-game-logos.js','/js/chunks/exclusive-game-covers.js','/js/chunks/marketplace-pro-shell.js','/js/chunks/reference-page-unifier.js','/js/chunks/storefront-cart.js','/js/chunks/mobile-reference-shell.js','/js/chunks/home-marketplace-pro.js','/js/chunks/home-direct-slider.js','/js/chunks/notification-actions.js','/js/chunks/home-polish.js','/js/chunks/two-page-polish.js','/js/chunks/live-support-widget.js'];
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
