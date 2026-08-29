(()=>{
  const path=location.pathname.toLowerCase();
  let running=false,lastAt=null;
  const fmtResp=v=>v==null?'—':Number(v)<60?`${Math.round(Number(v))} dk`:`${(Number(v)/60).toFixed(1)} sa`;
  const busyUi=()=>!!document.querySelector('.modal.open')||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName||'');

  function ensureBadge(){
    let b=$('#liveSyncBadge');if(b)return b;
    const head=$('.pagehead,.v5-head,.home-section-head');if(!head)return null;
    b=document.createElement('span');b.id='liveSyncBadge';b.className='pill green';b.style.cssText='white-space:nowrap;margin-left:auto';b.textContent='● CANLI';head.append(b);return b;
  }
  function markLive(){lastAt=new Date();const b=ensureBadge();if(b)b.textContent=`● CANLI • ${lastAt.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}`}

  async function refreshHome(){
    if(typeof renderHome==='function')await renderHome();
    const box=$('#traderShowcase');if(!box)return;
    try{const [d,fav]=await Promise.all([api('/api/traders/featured?limit=8'),ME?api('/api/favorites/').catch(()=>({traderIds:[]})):Promise.resolve({traderIds:[]})]),favs=new Set((fav.traderIds||[]).map(String));box.innerHTML=(d.traders||[]).map(t=>{const followed=favs.has(String(t.id)),ini=String(t.displayName||'P').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();return`<div class="trader-mini" data-favorite-decorated="1"><div class="avatar">${esc(ini)}</div><div style="min-width:0;flex:1"><strong>#${t.rank} ${esc(t.displayName)} ✓</strong><span>${t.online?'🟢 Online':'⚫ Offline'} • ${t.acceptingOffers?'Teklif açık':'Teklif kapalı'}</span><div class="meta">🏆 ${Number(t.score||0).toFixed(1)} skor • ⭐ ${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'—'} • ${Number(t.completedDeals||0)} işlem • ⚡ ${fmtResp(t.averageResponseMinutes)}</div><div class="actions" style="margin-top:7px"><a class="btn sm ghost trader-profile-link" href="/trader-profile.html?id=${encodeURIComponent(t.id)}">Profili Gör</a>${ME&&ME.id!==t.id?`<button class="btn sm ${followed?'teal':'ghost'}" data-favorite-type="trader" data-favorite-id="${esc(t.id)}" onclick="toggleFavorite('trader','${esc(t.id)}',this)">${followed?'★ Takipte':'☆ Takip Et'}</button>`:''}</div></div></div>`}).join('')||'<div class="empty">Henüz doğrulanmış pazarcı yok.</div>'}catch{}
  }

  async function refreshMarket(){
    const box=$('#marketList');if(!box)return;const qs=new URLSearchParams(),server=$('#marketServer')?.value,search=$('#marketSearch')?.value.trim();if(server&&server!=='ALL')qs.set('server',server);if(search)qs.set('search',search);
    try{const d=await api('/api/sale-requests?'+qs.toString()),rows=d.requests||[];box.innerHTML=rows.map(r=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(r.itemName)}</div><div class="meta">${esc(r.serverCode)} • Min ${fmtGB(r.minimumGb)} • ${formatDate(r.createdAt)}</div></div><div class="spacer"></div><span class="pill green">${(r.offers||[]).filter(x=>x.status==='active').length} aktif teklif</span></div></div>`).join('')||'<div class="empty">Açık talep bulunamadı.</div>'}catch{}
  }

  async function refreshBuy(){
    const box=$('#buyListings');if(!box)return;
    try{const [d,td]=await Promise.all([api('/api/listings'),api('/api/traders/featured?limit=24').catch(()=>({traders:[]}))]),trust=new Map((td.traders||[]).map(t=>[String(t.id),t])),rows=d.listings||[];box.innerHTML=rows.map(x=>{const t=trust.get(String(x.sellerUserId)),item=encodeURIComponent(String(x.itemName||''));return`<div class="card" data-live-listing="${x.id}"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${esc(x.sellerName)} ${t?.online?'🟢':'⚫'} • ${t&&Number(t.rating||0)>0?'⭐ '+Number(t.rating).toFixed(1):'Yeni pazarcı'}</div></div><div class="spacer"></div><span class="pill gold">${fmtGB(x.priceGb)}</span></div><div class="meta">Stok ${Number(x.stock||0)}${Number(x.priceTry||0)>0?' • '+Number(x.priceTry).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺':''}${t?' • 🏆 '+Number(t.score||0).toFixed(1):''}</div><div class="actions"><button class="btn teal live-buy" data-id="${x.id}" data-stock="${Number(x.stock||0)}" data-item="${item}" data-price="${Number(x.priceGb||0)}">Satın Al</button><a class="btn ghost trader-profile-link" href="/trader-profile.html?id=${encodeURIComponent(x.sellerUserId)}">Pazarcı Profili</a></div></div>`}).join('')||'<div class="empty">Aktif SELL ilanı bulunmuyor.</div>';$$('.live-buy',box).forEach(btn=>btn.addEventListener('click',()=>{if(!ME){location.href='/login.html';return}if(typeof buyListing==='function')buyListing(Number(btn.dataset.id),Number(btn.dataset.stock),decodeURIComponent(btn.dataset.item||''),Number(btn.dataset.price));else toast('Satın alma ekranı hazırlanamadı.')}))}catch{}
  }

  async function refreshTrader(){
    if(typeof renderTrader==='function')await renderTrader();
    if(!ME)return;
    try{const [p,d]=await Promise.all([api('/api/trader/presence'),api(`/api/trader-profiles/${encodeURIComponent(ME.id)}`)]),t=d.trader||{},enabled=!!p.traderAcceptingOffers;const toggle=$('#onlineToggle');if(toggle)toggle.classList.toggle('on',enabled);if($('#onlineText'))$('#onlineText').textContent=enabled?'Teklif almaya açıksın':'Teklif almaya kapalısın';const span=$('.v5-profilebar div:nth-child(2) span');if(span)span.textContent=`${t.online?'🟢 Online':'⚫ Offline'} • ⭐ ${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'—'} • ${Number(t.completedDeals||0)} işlem • Cevap ${fmtResp(t.averageResponseMinutes)}`;$$('#incomingRequests button').forEach(b=>{b.disabled=!enabled;if(!enabled)b.textContent='Teklifler Kapalı'})}catch{}
  }

  async function refreshNotifications(){if(typeof renderNotifications==='function')await renderNotifications();try{const d=await api('/api/notifications'),n=(d.notifications||[]).filter(x=>!x.isRead).length;$$('[data-notif-count]').forEach(x=>x.textContent=n?String(n):'')}catch{}}
  async function refreshDashboard(){if(typeof renderDashboard==='function')await renderDashboard()}
  async function refreshProfile(){const id=new URLSearchParams(location.search).get('id');if(!id)return;try{const d=await api(`/api/trader-profiles/${encodeURIComponent(id)}`),t=d.trader||{};if($('#tpRating'))$('#tpRating').textContent=Number(t.rating||0)>0?Number(t.rating).toFixed(2):'—';if($('#tpCompleted'))$('#tpCompleted').textContent=Number(t.completedDeals||0);if($('#tpSuccess'))$('#tpSuccess').textContent=t.successRate==null?'—':'%'+Number(t.successRate).toFixed(1);const since=$('#tpSince');if(since)since.textContent=`${t.online?'🟢 Şu an online':'⚫ Offline'} • ${t.acceptingOffers?'Teklif almaya açık':'Teklif almaya kapalı'} • Skor ${Number(t.kotakasScore||0).toFixed(1)}/100`;}catch{}}

  async function refresh(){
    if(running||document.visibilityState!=='visible'||busyUi())return;running=true;
    try{if(path==='/'||path.endsWith('/index.html'))await refreshHome();else if(path.endsWith('/market.html'))await refreshMarket();else if(path.endsWith('/buy.html'))await refreshBuy();else if(path.endsWith('/dashboard.html'))await refreshDashboard();else if(path.endsWith('/trader.html'))await refreshTrader();else if(path.endsWith('/notifications.html'))await refreshNotifications();else if(path.endsWith('/trader-profile.html'))await refreshProfile();markLive()}finally{running=false}
  }

  const supported=path==='/'||['/index.html','/market.html','/buy.html','/dashboard.html','/trader.html','/notifications.html','/trader-profile.html'].some(x=>path.endsWith(x));
  if(!supported)return;setTimeout(refresh,1200);setInterval(refresh,15000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
})();
