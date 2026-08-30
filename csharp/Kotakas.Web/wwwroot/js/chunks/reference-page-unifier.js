(()=>{
  const path=location.pathname.toLowerCase();
  const pageMap={
    '/buy.html':'k-page-buy','/sell.html':'k-page-sell','/ring-sell.html':'k-page-character','/urgent-sell.html':'k-page-urgent',
    '/dashboard.html':'k-page-dashboard','/trader.html':'k-page-trader','/admin.html':'k-page-admin','/market.html':'k-page-market'
  };
  const genericPages=['/wallet.html','/deals.html','/notifications.html','/favorites.html','/support.html','/trader-apply.html','/listing.html','/trader-profile.html','/games.html','/contact.html','/rules.html','/privacy.html','/terms.html','/cookies.html','/reports.html','/verification.html','/login.html','/register.html'];
  let cls=Object.entries(pageMap).find(([p])=>path.endsWith(p))?.[1];
  if(!cls&&genericPages.some(p=>path.endsWith(p)))cls='k-page-generic';
  if(!cls)return;
  document.body.classList.add('k-ref-page',cls);

  const make=(html)=>{const t=document.createElement('template');t.innerHTML=html.trim();return t.content.firstElementChild};

  function decorateBuy(){
    const listings=document.getElementById('buyListings');if(!listings)return;
    if(!document.getElementById('kRefBuyBenefits')){
      const n=make(`<div id="kRefBuyBenefits" class="k-ref-buy-benefits">
        <div class="k-ref-buy-benefit"><i>🔐</i><div><strong>Emanet Ödeme</strong><span>Teslim tamamlanana kadar bakiye korunur.</span></div></div>
        <div class="k-ref-buy-benefit"><i>✓</i><div><strong>Doğrulanmış Pazarcı</strong><span>Mağaza ve işlem geçmişini karşılaştır.</span></div></div>
        <div class="k-ref-buy-benefit"><i>⚡</i><div><strong>Hızlı Teslim</strong><span>Aktif stok ve güvenli hazır işlem adımları.</span></div></div>
      </div>`);
      listings.parentNode?.insertBefore(n,listings);
    }
    if(!document.getElementById('kRefBuyTitle')){
      const title=make('<div id="kRefBuyTitle" class="k-ref-section-title">Aktif Item İlanları <span>Doğrulanmış pazarcı SELL ilanları</span></div>');
      listings.parentNode?.insertBefore(title,listings);
    }
  }

  function decorateSell(){
    const form=document.querySelector('.sell-formcard');if(!form)return;
    if(!form.previousElementSibling?.classList?.contains('k-ref-section-title')) form.insertAdjacentElement('beforebegin',make('<div class="k-ref-section-title">İlan Bilgileri <span>Bilgileri doldur ve pazarcılara yayınla</span></div>'));
  }

  function decorateUrgent(){
    const form=document.getElementById('urgentSaleForm');const card=form?.closest('.v5-card');if(!card)return;
    card.style.borderColor='#54283a';
  }

  function decoratePanel(){
    const stats=document.querySelector('.v5-statgrid');
    if(stats&&!stats.previousElementSibling?.classList?.contains('k-ref-section-title')) stats.insertAdjacentElement('beforebegin',make('<div class="k-ref-section-title">Panel Özeti <span>Hesap ve işlem durumun</span></div>'));
  }

  if(cls==='k-page-buy')decorateBuy();
  if(cls==='k-page-sell'||cls==='k-page-character')decorateSell();
  if(cls==='k-page-urgent')decorateUrgent();
  if(['k-page-dashboard','k-page-trader','k-page-admin'].includes(cls))decoratePanel();
})();
