(()=>{
  const path=location.pathname.toLowerCase();
  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  const date=v=>v?new Date(v).toLocaleString('tr-TR'):'—';
  const money=v=>Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const gb=v=>Number(v||0).toLocaleString('tr-TR',{maximumFractionDigits:2})+' GB';
  const short=(v,n=48)=>{const s=String(v??'');return s.length>n?s.slice(0,n-1)+'…':s};
  const statusPill=s=>{
    const v=String(s||'').toLowerCase();
    const cls=['completed','accepted','active','purchased'].includes(v)?'green':['cancelled','declined','expired','refunded'].includes(v)?'red':['funded','seller_delivered','pending','open','matched'].includes(v)?'gold':'purple';
    return `<span class="pill ${cls}">${esc(String(s||'—').toUpperCase())}</span>`;
  };
  const insertAfter=(anchor,node)=>anchor?.parentNode&&anchor.parentNode.insertBefore(node,anchor.nextSibling);

  async function userTimeline(){
    if(!path.endsWith('/dashboard.html')||!ME||ME.role!=='user'||$('#userActivityTimeline'))return;
    const [wallet,deals,requests,offers]=await Promise.all([
      safe('/api/wallet/history?take=40',{entries:[]}),
      safe('/api/deals',{deals:[]}),
      safe('/api/sale-requests/mine',{requests:[]}),
      safe('/api/listing-price-offers/mine',{offers:[]})
    ]);
    const events=[];
    (wallet.entries||[]).forEach(x=>events.push({at:x.createdAt,icon:Number(x.amountTry)>=0?'💰':'💸',title:Number(x.amountTry)>=0?'Bakiye girişi':'Bakiye çıkışı',body:`${money(x.amountTry)} • ${esc(short(x.reason||x.type,70))}`,kind:Number(x.amountTry)>=0?'green':'purple'}));
    (deals.deals||[]).forEach(x=>events.push({at:x.completedAt||x.createdAt,icon:x.status==='completed'?'✅':'🤝',title:`#${Number(x.id)} ${x.itemName||'Güvenli işlem'}`,body:`${esc(x.serverCode||'')} • ${gb(x.priceGb||x.unitPriceGb)} • ${statusPill(x.status)}`,href:`/deals.html?id=${Number(x.id)}`,kind:x.status==='completed'?'green':'gold'}));
    (requests.requests||[]).forEach(x=>events.push({at:x.createdAt,icon:'📤',title:`Satış talebi: ${x.itemName||'Item'}`,body:`${esc(x.serverCode||'')} • min. ${gb(x.minimumGb)} • ${statusPill(x.status)}`,kind:'purple'}));
    (offers.offers||[]).filter(x=>x.role==='buyer').forEach(x=>events.push({at:x.createdAt,icon:'💬',title:`Fiyat teklifi: ${x.listing?.itemName||'SELL ilanı'}`,body:`${gb(x.offerGbPerUnit)} / adet • ${Number(x.quantity||1)} adet • ${statusPill(x.status)}`,href:x.listingId?`/buy.html?listing=${Number(x.listingId)}`:'',kind:'gold'}));
    events.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
    const rows=events.slice(0,12);
    const node=document.createElement('section');node.id='userActivityTimeline';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`<div class="v5-card-head"><div><h3>🕘 Hesap Hareket Akışı</h3><p>Bakiye, satış talebi, fiyat teklifi ve güvenli işlemler tek kronolojik listede.</p></div><div class="spacer"></div><a class="btn sm ghost" href="/deals.html">Tüm İşlemler</a></div><div class="v5-mini-list">${rows.length?rows.map(x=>`<div class="v5-mini ${x.kind||''}" style="align-items:flex-start"><div class="micon">${x.icon}</div><div style="flex:1"><strong>${esc(x.title)}</strong><span>${x.body}</span><span style="margin-top:4px">${date(x.at)}</span></div>${x.href?`<a class="btn sm ghost" href="${x.href}">Aç</a>`:''}</div>`).join(''):'<div class="empty">Henüz hesap hareketi yok.</div>'}</div>`;
    insertAfter($('#userReviewFollowups')||$('#userProCenter')||$('#userLevelCenter'),node);
  }

  function aggregate(rows,key,valueKey='sellerNetTry'){
    const m=new Map();
    rows.forEach(x=>{const k=String(x[key]||'Bilinmiyor');const cur=m.get(k)||{name:k,count:0,value:0};cur.count++;cur.value+=Number(x[valueKey]||0);m.set(k,cur)});
    return [...m.values()].sort((a,b)=>b.value-a.value||b.count-a.count);
  }

  async function traderBreakdown(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader'||$('#traderSalesBreakdown'))return;
    const d=await safe('/api/deals',{deals:[]}),all=(d.deals||[]).filter(x=>x.traderUserId===ME.id&&x.status==='completed');
    const sell=all.filter(x=>x.flow==='trader_listing'),buy=all.filter(x=>x.flow==='request_offer');
    const sellNet=sell.reduce((s,x)=>s+Number(x.sellerNetTry||0),0),sellGross=sell.reduce((s,x)=>s+Number(x.grossTry||0),0),buySpend=buy.reduce((s,x)=>s+Number(x.grossTry||0),0);
    const byItem=aggregate(sell,'itemName'),byServer=aggregate(sell,'serverCode','grossTry');
    const maxItem=Math.max(1,...byItem.slice(0,5).map(x=>x.value));
    const node=document.createElement('section');node.id='traderSalesBreakdown';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`<div class="v5-card-head"><div><h3>📊 Satış Kırılımı</h3><p>SELL satışlarını ve satış talebinden yaptığın BUY alımlarını birbirinden ayırır.</p></div></div><div class="v5-statgrid"><div class="v5-stat green"><div class="top"><div class="ico">SELL</div><span>Tamamlanan Satış</span></div><strong>${sell.length}</strong><span>${money(sellGross)} brüt hacim</span></div><div class="v5-stat green"><div class="top"><div class="ico">NET</div><span>SELL Net Kazanç</span></div><strong style="font-size:18px">${money(sellNet)}</strong><span>komisyon sonrası</span></div><div class="v5-stat purple"><div class="top"><div class="ico">BUY</div><span>Tamamlanan Alım</span></div><strong>${buy.length}</strong><span>${money(buySpend)} alış hacmi</span></div><div class="v5-stat gold"><div class="top"><div class="ico">AVG</div><span>Ort. SELL Sepeti</span></div><strong style="font-size:18px">${sell.length?money(sellGross/sell.length):'—'}</strong><span>tamamlanan satış başına</span></div></div><div class="v5-layout" style="margin-top:14px"><div><div class="v5-card-head"><div><h3>🏆 En Çok Kazandıran Itemler</h3><p>Tamamlanan SELL işlemlerindeki net kazanca göre.</p></div></div>${byItem.length?byItem.slice(0,5).map((x,i)=>`<div style="margin:10px 0"><div style="display:flex;gap:8px;align-items:center"><strong style="min-width:24px">${i+1}.</strong><span style="flex:1">${esc(x.name)}</span><strong>${money(x.value)}</strong></div><div style="height:7px;background:rgba(255,255,255,.07);border-radius:99px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.max(5,Math.round(x.value/maxItem*100))}%;background:currentColor;border-radius:99px"></div></div><span class="muted">${x.count} işlem</span></div>`).join(''):'<div class="empty">Tamamlanan SELL satışı henüz yok.</div>'}</div><aside><div class="v5-card-head"><div><h3>🌍 Server Dağılımı</h3><p>SELL brüt hacmine göre.</p></div></div><div class="v5-mini-list">${byServer.length?byServer.slice(0,6).map(x=>`<div class="v5-mini"><div class="micon">🛡️</div><div><strong>${esc(x.name)}</strong><span>${x.count} satış • ${money(x.value)}</span></div></div>`).join(''):'<div class="empty">Henüz veri yok.</div>'}</div></aside></div>`;
    insertAfter($('#traderProCenter')||$('#traderAnalyticsCenter')||$('#traderCommandCenter'),node);
  }

  window.adminQuickSearch=async()=>{
    const input=$('#adminQuickSearchInput'),box=$('#adminQuickSearchResults');if(!input||!box)return;
    const q=input.value.trim();if(q.length<2){box.innerHTML='<div class="empty">En az 2 karakter yaz.</div>';return}
    box.innerHTML='<div class="empty">Aranıyor...</div>';
    const e=encodeURIComponent(q);
    const [u,l,r]=await Promise.all([
      safe(`/api/admin/search/users?q=${e}`,{users:[]}),
      safe(`/api/admin/search/listings?q=${e}`,{listings:[]}),
      safe(`/api/admin/search/requests?q=${e}`,{requests:[]})
    ]);
    const users=(u.users||[]).slice(0,5),listings=(l.listings||[]).slice(0,5),requests=(r.requests||[]).slice(0,5);
    const group=(title,count,html)=>`<div style="margin-top:12px"><div class="v5-card-head"><div><h3>${title} <span class="pill purple">${count}</span></h3></div></div>${html}</div>`;
    box.innerHTML=`${group('👥 Üyeler',users.length,users.length?users.map(x=>`<div class="v5-mini"><div class="micon">👤</div><div style="flex:1"><strong>${esc(x.displayName||'Kullanıcı')}</strong><span>${esc(x.email||'')} • ${esc(x.role||'user')} • ${x.active?'aktif':'pasif'}</span></div><button class="btn sm ghost" onclick="panelOpenAdminPane('users')">Üyelere Git</button></div>`).join(''):'<div class="empty">Eşleşen üye yok.</div>')}${group('🛍️ SELL İlanları',listings.length,listings.length?listings.map(x=>`<div class="v5-mini"><div class="micon">📦</div><div style="flex:1"><strong>${esc(x.itemName)}</strong><span>${esc(x.serverCode)} • ${esc(x.sellerName)} • ${gb(x.priceGb)} • stok ${Number(x.stock||0)}</span></div><a class="btn sm ghost" href="/buy.html?listing=${Number(x.id)}">İlanı Aç</a></div>`).join(''):'<div class="empty">Eşleşen SELL ilanı yok.</div>')}${group('📥 Satış Talepleri',requests.length,requests.length?requests.map(x=>`<div class="v5-mini"><div class="micon">📨</div><div style="flex:1"><strong>${esc(x.itemName)}</strong><span>${esc(x.serverCode)} • min. ${gb(x.minimumGb)} • ${esc(x.status)}</span></div><button class="btn sm ghost" onclick="panelOpenAdminPane('requests')">Taleplere Git</button></div>`).join(''):'<div class="empty">Eşleşen satış talebi yok.</div>')}`;
  };

  function adminSearchCenter(){
    if(!path.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_')||$('#adminQuickSearchCenter'))return;
    const node=document.createElement('section');node.id='adminQuickSearchCenter';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`<div class="v5-card-head"><div><h3>🔎 Yönetim Hızlı Bul</h3><p>İsim, e-posta, item veya pazarcı adıyla üye + SELL ilanı + satış talebini aynı anda ara.</p></div></div><div class="actions"><input id="adminQuickSearchInput" style="flex:1;min-width:220px" placeholder="Örn. test@gmail.com, Raptor, SelfTest..." autocomplete="off"><button class="btn teal" onclick="adminQuickSearch()">Ara</button></div><div id="adminQuickSearchResults"><div class="empty">Bir arama yazarak başla.</div></div>`;
    $('#adminQuickSearchInput',node)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();adminQuickSearch()}});
    insertAfter($('#adminResponseAging')||$('#adminProCenter')||$('#adminCommandCenter'),node);
  }

  async function boot(){
    if(!ME)await loadMe();if(!ME)return;
    if(path.endsWith('/dashboard.html'))await userTimeline();
    else if(path.endsWith('/trader.html'))await traderBreakdown();
    else if(path.endsWith('/admin.html'))adminSearchCenter();
  }
  setTimeout(boot,2900);
  setTimeout(boot,4700);
})();
