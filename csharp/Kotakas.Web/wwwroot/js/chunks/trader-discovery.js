(()=>{
  const p=location.pathname.toLowerCase();
  const profileUrl=id=>`/trader-profile.html?id=${encodeURIComponent(id)}`;

  async function decorateBuy(){
    const box=$('#buyListings');if(!box)return;let ld,td;try{[ld,td]=await Promise.all([api('/api/listings'),api('/api/trust/traders')])}catch{return}const rows=ld.listings||[],trust=new Map((td.traders||[]).map(t=>[String(t.id),t])),cards=$$('#buyListings .card');cards.forEach((card,i)=>{const x=rows[i];if(!x||card.querySelector('.trader-profile-link'))return;const t=trust.get(String(x.sellerUserId));const meta=document.createElement('div');meta.className='meta trader-trust-summary';meta.style.margin='8px 0';meta.textContent=t&&Number(t.rating||0)>0?`⭐ ${Number(t.rating).toFixed(1)} • ${Number(t.reviewCount||0)} yorum • ${Number(t.completedDeals||0)} işlem`:`${Number(t?.completedDeals||0)} tamamlanan işlem`;const head=card.querySelector('.itemhead');head?.insertAdjacentElement('afterend',meta);const a=document.createElement('a');a.href=profileUrl(x.sellerUserId);a.className='btn sm ghost trader-profile-link';a.textContent='🏪 Pazarcı Profili';const actions=card.querySelector('.favorite-actions')||card.querySelector('.actions');(actions||card).append(a)})
  }

  async function decorateHome(){
    const box=$('#traderShowcase');if(!box)return;let d;try{d=await api('/api/traders')}catch{return}const rows=d.traders||[],cards=$$('#traderShowcase .trader-mini');cards.forEach((card,i)=>{const t=rows[i];if(!t||card.querySelector('.trader-profile-link'))return;const a=document.createElement('a');a.href=profileUrl(t.id);a.className='btn sm ghost trader-profile-link';a.textContent='Profili Gör';card.append(a)})
  }

  async function decorateFavorites(){
    if(!p.endsWith('/favorites.html'))return;let d;try{d=await api('/api/favorites/')}catch{return}
    const traderCards=$$('#favoriteTraders .v5-mini');(d.traders||[]).forEach((t,i)=>{const card=traderCards[i];if(!card||t.missing||card.querySelector('.trader-profile-link'))return;const a=document.createElement('a');a.href=profileUrl(t.id);a.className='btn sm ghost trader-profile-link';a.textContent='🏪 Profili Gör';(card.querySelector('.actions')||card).append(a)});
    const listingCards=$$('#favoriteListings .listitem');(d.listings||[]).forEach((x,i)=>{const card=listingCards[i];if(!card||x.missing||!x.sellerUserId||card.querySelector('.seller-profile-link'))return;const a=document.createElement('a');a.href=profileUrl(x.sellerUserId);a.className='btn sm ghost seller-profile-link';a.textContent='Pazarcı Profili';(card.querySelector('.actions')||card).append(a)})
  }

  async function decorateDashboardOffers(){
    if(!p.endsWith('/dashboard.html'))return;const root=$('#myRequests');if(!root)return;let rd,td;try{[rd,td]=await Promise.all([api('/api/sale-requests/mine'),api('/api/trust/traders')])}catch{return}
    const trust=new Map((td.traders||[]).map(t=>[String(t.id),t])),offers=[];(rd.requests||[]).forEach(r=>(r.offers||[]).sort((a,b)=>Number(b.priceGb)-Number(a.priceGb)).forEach(o=>offers.push(o)));
    const cards=$$('#myRequests .offer');cards.forEach((card,i)=>{const o=offers[i];if(!o||!o.traderUserId||card.querySelector('.offer-trader-trust'))return;const t=trust.get(String(o.traderUserId));const wrap=document.createElement('div');wrap.className='offer-trader-trust';wrap.style.marginTop='6px';const rating=t&&Number(t.rating||0)>0?`⭐ ${Number(t.rating).toFixed(1)} • ${Number(t.reviewCount||0)} yorum • ${Number(t.completedDeals||0)} işlem`:`${Number(t?.completedDeals||0)} tamamlanan işlem`;wrap.innerHTML=`<div class="meta">${rating}</div><a class="btn sm ghost" href="${profileUrl(o.traderUserId)}">Pazarcı Profilini Gör</a>`;card.append(wrap)})
  }

  function decorateTraderSelf(){
    if(!p.endsWith('/trader.html')||!ME)return;const actions=$('.v5-head .head-actions');if(!actions||actions.querySelector('.self-trader-profile'))return;const a=document.createElement('a');a.href=profileUrl(ME.id);a.className='btn ghost self-trader-profile';a.textContent='🏪 Profilimi Gör';actions.prepend(a)
  }

  async function boot(){
    if(!ME)await loadMe();
    if(p.endsWith('/buy.html')){const box=$('#buyListings');if(box)new MutationObserver(decorateBuy).observe(box,{childList:true});setTimeout(decorateBuy,300)}
    if(p==='/'||p.endsWith('/index.html')){const box=$('#traderShowcase');if(box)new MutationObserver(decorateHome).observe(box,{childList:true});setTimeout(decorateHome,300)}
    if(p.endsWith('/favorites.html')){const root=$('.page');if(root)new MutationObserver(decorateFavorites).observe(root,{childList:true,subtree:true});setTimeout(decorateFavorites,450)}
    if(p.endsWith('/dashboard.html')){const root=$('#myRequests');if(root)new MutationObserver(decorateDashboardOffers).observe(root,{childList:true,subtree:true});setTimeout(decorateDashboardOffers,450);setTimeout(decorateDashboardOffers,1000)}
    if(p.endsWith('/trader.html'))setTimeout(decorateTraderSelf,350)
  }
  boot();
})();
