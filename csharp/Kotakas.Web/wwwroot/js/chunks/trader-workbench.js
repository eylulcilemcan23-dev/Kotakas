(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/trader.html'))return;

  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const gb=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2})+' GB';
  const fmtMinutes=n=>n==null?'—':Number(n)<1?'< 1 dk':`${Number(n).toLocaleString('tr-TR',{maximumFractionDigits:1})} dk`;
  const statusLabel=s=>({active:'Yayında',paused:'Duraklatıldı',sold_out:'Tükendi',cancelled:'Kaldırıldı',pending:'Bekliyor',accepted:'Kabul',declined:'Reddedildi',expired:'Süresi doldu',purchased:'Satın alındı',funded:'Emanette',seller_delivered:'Teslim onayı',disputed:'Anlaşmazlık',completed:'Tamamlandı',refunded:'İade'})[String(s||'').toLowerCase()]||String(s||'—');
  const statusClass=s=>['active','accepted','purchased','completed'].includes(String(s||'').toLowerCase())?'green':['declined','cancelled','disputed','refunded'].includes(String(s||'').toLowerCase())?'red':['pending','paused','seller_delivered'].includes(String(s||'').toLowerCase())?'gold':'purple';
  const activeDeal=d=>['funded','seller_delivered','disputed'].includes(String(d?.status||'').toLowerCase());
  let STATE={listings:[],priceOffers:[],requestOffers:[],deals:[],wallet:{},insights:{},profile:{},rate:0,filter:'all',query:''};

  function jsq(v){return JSON.stringify(String(v||''))}

  async function mutateListing(id,body,msg){
    try{await api(`/api/listings/${Number(id)}`,{method:'PATCH',body});toast(msg||'İlan güncellendi.');await refresh()}catch(err){toast(err.data?.error==='listing_cancelled'?'Bu ilan kaldırılmış.':err.data?.error||'İlan güncellenemedi.')}
  }
  window.traderWorkbenchStock=(id,stock,delta)=>mutateListing(id,{stock:Math.max(0,Number(stock||0)+Number(delta||0))},'Stok güncellendi.');
  window.traderWorkbenchToggle=(id,status,stock)=>{
    const next=String(status)==='active'?'paused':'active';
    if(next==='active'&&Number(stock||0)<=0)return toast('Yayına almak için önce stok ekle.');
    return mutateListing(id,{status:next},next==='active'?'İlan yeniden yayında.':'İlan duraklatıldı.');
  };
  window.traderWorkbenchPrice=async(id,current)=>{
    const raw=prompt('Yeni SELL fiyatı (GB):',Number(current||0));
    if(raw===null)return;
    const price=Number(String(raw).replace(',','.'));
    if(!Number.isFinite(price)||price<=0)return toast('Geçerli fiyat gir.');
    await mutateListing(id,{priceGb:price},'Fiyat güncellendi ve geçmişe işlendi.');
  };
  window.traderWorkbenchRemove=async(id,item)=>{
    if(!confirm(`${item} ilanını kaldırmak istiyor musun? Bekleyen pazarlıklar da kapanır.`))return;
    try{await api(`/api/listings/${Number(id)}`,{method:'DELETE'});toast('İlan kaldırıldı.');await refresh()}catch(err){toast(err.data?.error||'İlan kaldırılamadı.')}
  };
  window.traderWorkbenchDecision=async(id,action)=>{
    if(!confirm(action==='accept'?'Bu fiyat teklifini kabul etmek istiyor musun? Alıcının 10 dakikalık satın alma süresi başlayacak.':'Bu teklifi reddetmek istiyor musun?'))return;
    try{await api(`/api/listing-price-offers/${Number(id)}/decision`,{method:'POST',body:{action}});toast(action==='accept'?'Teklif kabul edildi.':'Teklif reddedildi.');await refresh()}catch(err){toast(err.data?.error||'Teklif güncellenemedi.')}
  };
  window.traderWorkbenchFilter=(filter,btn)=>{STATE.filter=filter;$$('#traderWorkbench .tw-filter').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');renderInventory()};
  window.traderWorkbenchSearch=e=>{STATE.query=String(e?.target?.value||'').trim().toLowerCase();renderInventory()};

  function realProfile(){
    const t=STATE.profile?.trader||{};
    const bar=$('.v5-profilebar');
    if(bar){
      const avatar=bar.querySelector('.avatar');
      const name=bar.querySelector('[data-user-name]');
      const span=bar.querySelector('div:nth-child(2) span');
      const status=bar.querySelector('.v5-status');
      const initials=String(ME?.displayName||'P').trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase();
      if(avatar)avatar.textContent=initials||'P';
      if(name)name.textContent=ME?.displayName||'Pazarcı';
      if(span)span.textContent=`⭐ ${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'Yeni'} • ${Number(t.completedDeals||0)} tamamlanan işlem • Cevap ${fmtMinutes(t.averageResponseMinutes)}`;
      if(status){status.textContent=t.online?'● ONLINE':'○ OFFLINE';status.className='v5-status'}
    }
    const perf=[...$$('.v5-card')].find(x=>x.querySelector('h3')?.textContent?.trim()==='Performans');
    if(perf){
      const list=perf.querySelector('.v5-mini-list');
      if(list)list.innerHTML=`<div class="v5-mini"><div class="micon">⭐</div><div><strong>${Number(t.rating||0)>0?Number(t.rating).toFixed(1)+' / 5.0':'Henüz puan yok'}</strong><span>${Number(t.reviewCount||0)} gerçek değerlendirme</span></div></div><div class="v5-mini"><div class="micon">⚡</div><div><strong>${fmtMinutes(t.averageResponseMinutes)}</strong><span>Gerçek ortalama cevap süresi</span></div></div><div class="v5-mini"><div class="micon">✓</div><div><strong>${t.successRate==null?'—':'%'+Number(t.successRate).toFixed(1)}</strong><span>${Number(t.completedDeals||0)} tamamlanan • ${Number(t.refundedDeals||0)} iade</span></div></div>`;
    }
  }

  function ensureWorkbench(){
    if($('#traderWorkbench'))return;
    const node=document.createElement('section');node.id='traderWorkbench';node.className='v5-card';node.style.margin='14px 0';
    const anchor=$('.v5-profilebar')||$('.trader-toolbar');
    anchor?.parentNode?.insertBefore(node,anchor.nextSibling);
  }

  function renderSummary(){
    const node=$('#traderWorkbench');if(!node)return;
    const i=STATE.insights||{},listings=STATE.listings||[],pending=(STATE.priceOffers||[]).filter(x=>x.role==='seller'&&x.status==='pending'&&new Date(x.expiresAt).getTime()>Date.now()),activeDeals=(STATE.deals||[]).filter(activeDeal),active=listings.filter(x=>x.status==='active'&&Number(x.stock||0)>0),low=active.filter(x=>Number(x.stock||0)<=2);
    const escrow=activeDeals.reduce((s,x)=>s+Number(x.escrowTry||0),0);
    node.innerHTML=`<div class="v5-card-head"><div><h3>⚡ Pazarcı Hızlı Yönetim</h3><p>Stok, pazarlık, güvenli işlem ve bakiyeni tek yerden yönet.</p></div><div class="spacer"></div><span class="pill green">GERÇEK VERİ</span></div>
      <div class="v5-statgrid" style="margin-bottom:14px">
        <div class="v5-stat"><div class="top"><div class="ico">💳</div><span>Kullanılabilir Bakiye</span></div><strong style="font-size:20px">${money(STATE.wallet.balanceTry)}</strong><span>KOTAKAS cüzdanın</span></div>
        <div class="v5-stat green"><div class="top"><div class="ico">📦</div><span>Aktif Stok</span></div><strong>${Number(i.listings?.totalStock??active.reduce((s,x)=>s+Number(x.stock||0),0))}</strong><span>${active.length} ilan • ${low.length} düşük stok</span></div>
        <div class="v5-stat gold"><div class="top"><div class="ico">💬</div><span>Bekleyen Pazarlık</span></div><strong>${pending.length}</strong><span>Yanıt bekleyen SELL teklifi</span></div>
        <div class="v5-stat purple"><div class="top"><div class="ico">🔐</div><span>Aktif Emanet</span></div><strong style="font-size:20px">${money(escrow)}</strong><span>${activeDeals.length} güvenli işlem</span></div>
      </div>
      <div class="actions" style="gap:8px;flex-wrap:wrap;margin-bottom:14px"><button class="btn teal" onclick="openModal('listingModal')">＋ Yeni Satış İlanı</button><a class="btn ghost" href="/market.html">💰 Teklif Pazarına Git</a><a class="btn ghost" href="/deals.html">🤝 Aktif İşlemler</a><a class="btn ghost" href="/wallet.html">💳 Cüzdan Merkezi</a><a class="btn ghost" href="/trader-profile.html?id=${encodeURIComponent(ME.id)}">🏪 Mağaza Profilim</a></div>
      <div class="v5-statgrid" style="margin-bottom:16px"><div class="v5-stat green"><div class="top"><div class="ico">1G</div><span>Bugün Net</span></div><strong style="font-size:19px">${money(i.today?.netTry)}</strong><span>${Number(i.today?.deals||0)} tamamlanan satış</span></div><div class="v5-stat"><div class="top"><div class="ico">7G</div><span>7 Gün Net</span></div><strong style="font-size:19px">${money(i.last7?.netTry)}</strong><span>${Number(i.last7?.deals||0)} satış</span></div><div class="v5-stat purple"><div class="top"><div class="ico">30</div><span>30 Gün Net</span></div><strong style="font-size:19px">${money(i.last30?.netTry)}</strong><span>Komisyon ${money(i.last30?.commissionTry)}</span></div><div class="v5-stat gold"><div class="top"><div class="ico">Ø</div><span>Ort. Sepet</span></div><strong style="font-size:19px">${money(i.last30?.averageTicketTry)}</strong><span>Son 30 gün</span></div></div>
      <div class="v5-layout"><div><div class="v5-card-head"><div><h3>📦 İlan & Stok Merkezi</h3><p>Fiyatı, stoğu ve yayın durumunu sayfa yenilemeden yönet.</p></div><div class="spacer"></div><input id="twSearch" oninput="traderWorkbenchSearch(event)" placeholder="Item ara..." style="max-width:190px"></div><div class="v5-tabs"><button class="v5-tab tw-filter active" onclick="traderWorkbenchFilter('all',this)">Tümü</button><button class="v5-tab tw-filter" onclick="traderWorkbenchFilter('active',this)">Yayında</button><button class="v5-tab tw-filter" onclick="traderWorkbenchFilter('low',this)">Düşük Stok</button><button class="v5-tab tw-filter" onclick="traderWorkbenchFilter('paused',this)">Duraklatılmış</button></div><div id="twInventory" class="v5-mini-list"></div></div><aside><div class="v5-card-head"><div><h3>💬 Bekleyen Pazarlıklar</h3><p>Kullanıcıların SELL ilanlarına verdiği fiyat teklifleri.</p></div></div><div id="twNegotiations" class="v5-mini-list"></div></aside></div>
      <div class="v5-layout" style="margin-top:16px"><div><div class="v5-card-head"><div><h3>💸 Verdiğim BUY Teklifleri</h3><p>Teklif Pazarı'nda kullanıcılara verdiğin teklifler.</p></div><div class="spacer"></div><a class="btn sm ghost" href="/market.html">Yeni Teklif Ver</a></div><div id="twRequestOffers" class="v5-mini-list"></div></div><aside><div class="v5-card-head"><div><h3>🤝 Güvenli İşlemler</h3><p>Önce aksiyon isteyen işlemler gösterilir.</p></div><div class="spacer"></div><a class="btn sm ghost" href="/deals.html">Tümünü Aç</a></div><div id="twDeals" class="v5-mini-list"></div></aside></div>`;
    renderInventory();renderNegotiations();renderRequestOffers();renderDeals();
  }

  function renderInventory(){
    const box=$('#twInventory');if(!box)return;
    let rows=(STATE.listings||[]).filter(x=>String(x.status)!=='cancelled');
    if(STATE.filter==='active')rows=rows.filter(x=>x.status==='active'&&Number(x.stock)>0);
    if(STATE.filter==='low')rows=rows.filter(x=>x.status==='active'&&Number(x.stock)<=2);
    if(STATE.filter==='paused')rows=rows.filter(x=>x.status==='paused'||x.status==='sold_out');
    if(STATE.query)rows=rows.filter(x=>`${x.itemName} ${x.serverCode}`.toLowerCase().includes(STATE.query));
    rows=rows.slice(0,12);
    box.innerHTML=rows.length?rows.map(x=>{const tl=STATE.rate>0?Number(x.priceGb||0)*STATE.rate:0;return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">${Number(x.stock||0)<=1?'🚨':'📦'}</div><div style="flex:1;min-width:0"><strong>${esc(x.itemName)}</strong><span>${esc(x.serverCode)} • ${gb(x.priceGb)}${tl>0?' ≈ '+money(tl):''} • Stok ${Number(x.stock||0)} • <b>${statusLabel(x.status)}</b></span><div class="actions" style="margin-top:8px;gap:5px;flex-wrap:wrap"><button class="btn sm ghost" onclick="traderWorkbenchStock(${Number(x.id)},${Number(x.stock||0)},-1)" ${Number(x.stock||0)<=0?'disabled':''}>−1</button><button class="btn sm teal" onclick="traderWorkbenchStock(${Number(x.id)},${Number(x.stock||0)},1)">＋1</button><button class="btn sm ghost" onclick="traderWorkbenchPrice(${Number(x.id)},${Number(x.priceGb||0)})">💰 Fiyat</button><button class="btn sm ghost" onclick="traderWorkbenchToggle(${Number(x.id)},${jsq(x.status)},${Number(x.stock||0)})">${x.status==='active'?'⏸ Durdur':'▶ Yayına Al'}</button><a class="btn sm ghost" href="/listing.html?id=${Number(x.id)}">Gör</a><button class="btn sm red" onclick="traderWorkbenchRemove(${Number(x.id)},${jsq(x.itemName)})">Kaldır</button></div></div></div>`}).join(''):'<div class="empty">Bu filtrede ilan yok.</div>';
  }

  function renderNegotiations(){
    const box=$('#twNegotiations');if(!box)return;
    const rows=(STATE.priceOffers||[]).filter(x=>x.role==='seller'&&x.status==='pending'&&new Date(x.expiresAt).getTime()>Date.now()).slice(0,8);
    box.innerHTML=rows.length?rows.map(o=>{const l=o.listing||{},left=Math.max(0,Math.ceil((new Date(o.expiresAt).getTime()-Date.now())/60000));return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">💬</div><div style="flex:1"><strong>${esc(l.itemName||'SELL ilanı')} x${Number(o.quantity||1)}</strong><span>${esc(o.buyerName||'Kullanıcı')} • ${gb(o.offerGbPerUnit)}/adet • İlan ${gb(l.priceGb)} • ${left} dk kaldı</span><div class="actions" style="margin-top:8px"><button class="btn sm green" onclick="traderWorkbenchDecision(${Number(o.id)},'accept')">Kabul Et</button><button class="btn sm ghost" onclick="traderWorkbenchDecision(${Number(o.id)},'decline')">Reddet</button></div></div></div>`}).join(''):'<div class="empty">Bekleyen pazarlık yok.</div>';
  }

  function renderRequestOffers(){
    const box=$('#twRequestOffers');if(!box)return;
    const rows=(STATE.requestOffers||[]).slice(0,8);
    box.innerHTML=rows.length?rows.map(o=>{const active=o.status==='active'&&(new Date(o.createdAt).getTime()+Number(o.expiryMinutes||0)*60000>Date.now());const left=active?Math.max(0,Math.ceil((new Date(o.createdAt).getTime()+Number(o.expiryMinutes||0)*60000-Date.now())/60000)):0;return `<div class="v5-mini"><div class="micon">${o.status==='accepted'?'✅':active?'💸':'⌛'}</div><div><strong>${esc(o.itemName||'Item')}</strong><span>${esc(o.serverCode||'')} • ${gb(o.priceGb)} • <b>${statusLabel(o.status)}</b>${active?` • ${left} dk`:''}</span></div><span class="pill ${statusClass(o.status)}">${String(statusLabel(o.status)).toUpperCase()}</span></div>`}).join(''):'<div class="empty">Henüz BUY teklifin yok.</div>';
  }

  function renderDeals(){
    const box=$('#twDeals');if(!box)return;
    const rows=(STATE.deals||[]).slice().sort((a,b)=>(activeDeal(b)?1:0)-(activeDeal(a)?1:0)||Number(b.id)-Number(a.id)).slice(0,7);
    box.innerHTML=rows.length?rows.map(d=>`<a class="v5-mini" href="/deals.html?id=${Number(d.id)}"><div class="micon">${activeDeal(d)?'⚡':'🤝'}</div><div style="flex:1"><strong>#${Number(d.id)} ${esc(d.itemName||'İşlem')}</strong><span>${esc(d.serverCode||'')} • ${money(d.grossTry)} • ${statusLabel(d.status)}</span></div><span class="pill ${statusClass(d.status)}">${String(statusLabel(d.status)).toUpperCase()}</span></a>`).join(''):'<div class="empty">Henüz işlem yok.</div>';
  }

  async function refresh(){
    if(!ME||ME.role!=='trader')return;
    const [profile,insights,listings,priceOffers,requestOffers,deals,wallet,cfg]=await Promise.all([
      safe(`/api/trader-profiles/${encodeURIComponent(ME.id)}`,{}),safe('/api/panel/trader-insights',{}),safe('/api/listings/mine',{listings:[]}),safe('/api/listing-price-offers/mine',{offers:[]}),safe('/api/offers/mine',{offers:[]}),safe('/api/deals',{deals:[]}),safe('/api/wallet',{}),safe('/api/public/market-config',{})
    ]);
    STATE={...STATE,profile,insights,listings:listings.listings||[],priceOffers:priceOffers.offers||[],requestOffers:requestOffers.offers||[],deals:deals.deals||[],wallet,rate:Number(cfg.gbTryRate||0)};
    realProfile();ensureWorkbench();renderSummary();
  }

  async function boot(){try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{};if(!ME||ME.role!=='trader')return;await refresh();}
  setTimeout(boot,1050);
})();
