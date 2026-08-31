(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const unit=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2});
  const safe=s=>typeof esc==='function'?esc(s):String(s||'');
  const gameUrl=(path,code)=>typeof window.kGameUrl==='function'?window.kGameUrl(path,code):`${path}?game=${encodeURIComponent(code)}`;
  const setHtml=(id,html)=>{const el=document.getElementById(id);if(el)el.innerHTML=html};

  const GAME_ART=[
    {code:'knight-online',name:'Knight Online',sub:'GB • Item • Karakter',image:'/assets/images/games/knight-online.jpg'},
    {code:'rise-online',name:'Rise Online',sub:'Gold • Item • Karakter',image:'/assets/images/games/rise-online.jpg'},
    {code:'valorant',name:'Valorant',sub:'VP • Dijital Ürün',image:'/assets/images/games/valorant.jpg'},
    {code:'mobile-legends',name:'Mobile Legends',sub:'Diamond • Dijital Ürün',image:'/assets/images/games/mobile-legends.webp'}
  ];

  function addShowcaseCss(){
    if(document.getElementById('kGameShowcaseCss'))return;
    const s=document.createElement('style');s.id='kGameShowcaseCss';s.textContent=`
      .kp-promo-main.k-game-slider{padding:0!important;overflow:hidden;position:relative;min-height:410px;background:#10121c!important}
      .k-game-slide{position:absolute;inset:0;opacity:0;pointer-events:none;transition:opacity .45s ease;background:#10121c}
      .k-game-slide.active{opacity:1;pointer-events:auto}
      .k-game-slide img{width:100%;height:100%;position:absolute;inset:0;object-fit:cover;object-position:center 38%}
      .k-game-slide:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,8,15,.82) 0%,rgba(7,8,15,.32) 50%,rgba(7,8,15,.10) 100%)}
      .k-game-slide-copy{position:absolute;z-index:2;left:34px;bottom:34px;max-width:430px;text-shadow:0 2px 16px #000}
      .k-game-slide-copy small{font-size:9px;font-weight:900;letter-spacing:.13em;color:#ff5578}.k-game-slide-copy h2{font-size:35px;margin:7px 0 7px;color:#fff}.k-game-slide-copy p{font-size:11px;color:#e0e2eb;margin:0 0 15px}.k-game-slide-actions{display:flex;gap:8px;flex-wrap:wrap}
      .k-game-slider-nav{position:absolute;z-index:3;right:18px;bottom:18px;display:flex;gap:7px}.k-game-slider-nav button{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.22);background:rgba(12,13,21,.76);color:#fff;font-size:18px;cursor:pointer}
      .k-game-slider-dots{position:absolute;z-index:3;left:50%;bottom:13px;transform:translateX(-50%);display:flex;gap:5px}.k-game-slider-dots button{width:7px;height:7px;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.35)}.k-game-slider-dots button.active{width:19px;border-radius:8px;background:#fff}
      .kp-game-row{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}.kp-game-tile.k-cover{min-height:220px!important;padding:0!important;overflow:hidden!important;position:relative!important;background:#151722!important;border:1px solid #2b2e3e!important}.kp-game-tile.k-cover img{width:100%;height:220px;object-fit:cover;display:block;transition:transform .25s ease}.kp-game-tile.k-cover:hover img{transform:scale(1.035)}.kp-game-tile.k-cover .k-cover-info{position:absolute;inset:auto 0 0;padding:42px 13px 13px;background:linear-gradient(transparent,rgba(5,6,12,.96));z-index:2}.kp-game-tile.k-cover strong{font-size:12px;color:#fff;display:block}.kp-game-tile.k-cover span{font-size:8px;color:#c6cad6}.kp-game-tile.k-cover .mark{display:none!important}
      @media(max-width:900px){.kp-promo-main.k-game-slider{min-height:340px}.kp-game-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}.k-game-slide-copy{left:20px;right:20px;bottom:30px}.k-game-slide-copy h2{font-size:27px}.kp-game-tile.k-cover,.kp-game-tile.k-cover img{min-height:190px!important;height:190px}}
      @media(max-width:520px){.kp-promo-main.k-game-slider{min-height:300px}.kp-game-row{display:flex!important;overflow-x:auto!important;scroll-snap-type:x mandatory}.kp-game-tile.k-cover{min-width:72vw!important;scroll-snap-align:start}.k-game-slide-copy h2{font-size:24px}.k-game-slide-copy p{font-size:9px}.k-game-slider-nav{right:10px;bottom:10px}}
    `;document.head.appendChild(s);
  }

  function renderGames(){
    addShowcaseCss();
    const preferred=['knight-online','rise-online','valorant','mobile-legends','league-of-legends','pubg-mobile','metin2','steam'];
    const all=window.KOTAKAS_GAMES||[];
    const rows=preferred.map(code=>all.find(x=>x.code===code)).filter(Boolean);
    const art=new Map(GAME_ART.map(x=>[x.code,x]));
    setHtml('kpPopularGames',rows.map(g=>{const a=art.get(g.code);return a?`<a class="kp-game-tile k-cover" href="${gameUrl('/market.html',g.code)}"><img src="${a.image}" alt="${safe(g.name)}" loading="lazy"><div class="k-cover-info"><strong>${safe(g.name)}</strong><span>${safe(g.currency)} • ${safe((g.types||[])[0]||'Pazar')}</span></div></a>`:`<a class="kp-game-tile" href="${gameUrl('/market.html',g.code)}"><span class="mark">${safe(g.mark)}</span><strong>${safe(g.name)}</strong><span>${safe(g.currency)} • ${safe((g.types||[])[0]||'Pazar')}</span></a>`}).join(''));
  }

  async function iconFor(name){try{const d=await api('/api/public/item-icons/search?q='+encodeURIComponent(name));return d.items?.[0]?.iconUrl||null}catch{return null}}
  function listingCard(x){const priceTry=Number(x.priceTry||0);const priceText=priceTry>0?money(priceTry):`${unit(x.priceGb)} GB`;return `<a class="kp-product-card" href="/listing.html?id=${Number(x.id)}"><div class="kp-product-thumb" data-icon-name="${safe(x.itemName)}"><span class="fallback">📦</span></div><div class="kp-product-body"><span class="server">${safe(x.serverCode||'SERVER')}</span><h3>${safe(x.itemName)}</h3><div class="kp-product-meta"><span>🏪 ${safe(x.sellerName||'Pazarcı')}</span><span>•</span><span>Stok ${Number(x.stock||0)}</span></div><div class="kp-product-price"><strong>${priceText}</strong><span>${unit(x.priceGb)} GB</span></div></div></a>`}
  async function hydrateIcons(){const thumbs=[...document.querySelectorAll('.kp-product-thumb[data-icon-name]')].slice(0,8);await Promise.allSettled(thumbs.map(async el=>{const name=el.getAttribute('data-icon-name');const url=await iconFor(name);if(url)el.innerHTML=`<img src="${safe(url)}" alt="${safe(name)}" loading="lazy">`}))}
  function requestRows(rows){return rows.slice(0,6).map(r=>{const offers=(r.offers||[]).filter(x=>x.status==='active');const best=offers.sort((a,b)=>Number(b.priceGb)-Number(a.priceGb))[0];return `<a class="kp-mini-row" href="/market.html"><span class="icon">💰</span><span><strong>${safe(r.itemName)}</strong><span>${safe(r.serverCode)} • Min ${unit(r.minimumGb)} GB • ${Number(r.quantity||1)} adet</span></span><b>${best?unit(best.priceGb)+' GB':'Teklif bekliyor'}</b></a>`}).join('')||'<div class="kp-empty-card">Henüz açık satış talebi yok.</div>'}
  function traderRows(rows){return rows.slice(0,6).map(t=>`<a class="kp-mini-row" href="/trader-profile.html?id=${encodeURIComponent(t.id)}"><span class="icon">🏪</span><span><strong>${safe(t.displayName)} ✓</strong><span>Doğrulanmış pazarcı • ${Number(t.completedDeals||0)} tamamlanan işlem</span></span><b>Profili Gör</b></a>`).join('')||'<div class="kp-empty-card">Henüz doğrulanmış pazarcı yok.</div>'}

  async function boot(){
    renderGames();
    try{
      const [listings,requests,traders,stats]=await Promise.all([api('/api/listings').catch(()=>({listings:[]})),api('/api/sale-requests').catch(()=>({requests:[]})),api('/api/traders').catch(()=>({traders:[]})),api('/api/public/stats').catch(()=>({}))]);
      const rows=(listings.listings||[]).slice(0,8);setHtml('kpLatestItems',rows.length?rows.map(listingCard).join(''):'<div class="kp-empty-card">Henüz aktif item ilanı yok. İlk ilanı pazarcılar oluşturabilir.</div>');setHtml('kpLatestRequests',requestRows(requests.requests||[]));setHtml('kpTopTraders',traderRows(traders.traders||[]));
      const d=document.getElementById('kpCompletedDeals');if(d)d.textContent=Number(stats.completedDeals||0).toLocaleString('tr-TR');const u=document.getElementById('kpUsers');if(u)u.textContent=Number(stats.users||0).toLocaleString('tr-TR')+'+';const t=document.getElementById('kpTraders');if(t)t.textContent=Number(stats.traders||0).toLocaleString('tr-TR')+'+';hydrateIcons();
    }catch{}
  }
  setTimeout(boot,500);
})();
