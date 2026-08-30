(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const unit=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2});
  const safe=s=>typeof esc==='function'?esc(s):String(s||'');
  const gameUrl=(path,code)=>typeof window.kGameUrl==='function'?window.kGameUrl(path,code):`${path}?game=${encodeURIComponent(code)}`;
  const setHtml=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html};

  function renderGames(){
    const preferred=['knight-online','rise-online','valorant','league-of-legends','pubg-mobile','mobile-legends','metin2','steam'];
    const all=window.KOTAKAS_GAMES||[];
    const rows=preferred.map(code=>all.find(x=>x.code===code)).filter(Boolean);
    setHtml('kpPopularGames',rows.map(g=>`<a class="kp-game-tile" href="${gameUrl('/market.html',g.code)}"><span class="mark">${safe(g.mark)}</span><strong>${safe(g.name)}</strong><span>${safe(g.currency)} • ${safe((g.types||[])[0]||'Pazar')}</span></a>`).join(''));
  }

  async function iconFor(name){
    try{const d=await api('/api/public/item-icons/search?q='+encodeURIComponent(name));return d.items?.[0]?.iconUrl||null}catch{return null}
  }

  function listingCard(x){
    const priceTry=Number(x.priceTry||0);
    const priceText=priceTry>0?money(priceTry):`${unit(x.priceGb)} GB`;
    return `<a class="kp-product-card" href="/listing.html?id=${Number(x.id)}"><div class="kp-product-thumb" data-icon-name="${safe(x.itemName)}"><span class="fallback">📦</span></div><div class="kp-product-body"><span class="server">${safe(x.serverCode||'SERVER')}</span><h3>${safe(x.itemName)}</h3><div class="kp-product-meta"><span>🏪 ${safe(x.sellerName||'Pazarcı')}</span><span>•</span><span>Stok ${Number(x.stock||0)}</span></div><div class="kp-product-price"><strong>${priceText}</strong><span>${unit(x.priceGb)} GB</span></div></div></a>`;
  }

  async function hydrateIcons(){
    const thumbs=[...document.querySelectorAll('.kp-product-thumb[data-icon-name]')].slice(0,8);
    await Promise.allSettled(thumbs.map(async el=>{const name=el.getAttribute('data-icon-name');const url=await iconFor(name);if(url)el.innerHTML=`<img src="${safe(url)}" alt="${safe(name)}" loading="lazy">`}));
  }

  function requestRows(rows){
    return rows.slice(0,6).map(r=>{const offers=(r.offers||[]).filter(x=>x.status==='active');const best=offers.sort((a,b)=>Number(b.priceGb)-Number(a.priceGb))[0];return `<a class="kp-mini-row" href="/market.html"><span class="icon">💰</span><span><strong>${safe(r.itemName)}</strong><span>${safe(r.serverCode)} • Min ${unit(r.minimumGb)} GB • ${Number(r.quantity||1)} adet</span></span><b>${best?unit(best.priceGb)+' GB':'Teklif bekliyor'}</b></a>`}).join('')||'<div class="kp-empty-card">Henüz açık satış talebi yok.</div>';
  }

  function traderRows(rows){
    return rows.slice(0,6).map(t=>`<a class="kp-mini-row" href="/trader-profile.html?id=${encodeURIComponent(t.id)}"><span class="icon">🏪</span><span><strong>${safe(t.displayName)} ✓</strong><span>Doğrulanmış pazarcı • ${Number(t.completedDeals||0)} tamamlanan işlem</span></span><b>Profili Gör</b></a>`).join('')||'<div class="kp-empty-card">Henüz doğrulanmış pazarcı yok.</div>';
  }

  async function boot(){
    renderGames();
    try{
      const [listings,requests,traders,stats]=await Promise.all([
        api('/api/listings').catch(()=>({listings:[]})),
        api('/api/sale-requests').catch(()=>({requests:[]})),
        api('/api/traders').catch(()=>({traders:[]})),
        api('/api/public/stats').catch(()=>({}))
      ]);
      const rows=(listings.listings||[]).slice(0,8);
      setHtml('kpLatestItems',rows.length?rows.map(listingCard).join(''):'<div class="kp-empty-card">Henüz aktif item ilanı yok. İlk ilanı pazarcılar oluşturabilir.</div>');
      setHtml('kpLatestRequests',requestRows(requests.requests||[]));
      setHtml('kpTopTraders',traderRows(traders.traders||[]));
      const d=document.getElementById('kpCompletedDeals');if(d)d.textContent=Number(stats.completedDeals||0).toLocaleString('tr-TR');
      const u=document.getElementById('kpUsers');if(u)u.textContent=Number(stats.users||0).toLocaleString('tr-TR')+'+';
      const t=document.getElementById('kpTraders');if(t)t.textContent=Number(stats.traders||0).toLocaleString('tr-TR')+'+';
      hydrateIcons();
    }catch{}
  }
  setTimeout(boot,500);
})();
