(()=>{
  const path=location.pathname.toLowerCase();
  const money=v=>Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const percent=v=>v==null?'—':`%${Number(v||0).toFixed(1)}`;
  const safeCall=(url,fallback={})=>api(url).catch(()=>fallback);
  const activeDeal=d=>Number(d?.escrowTry||0)>0&&!['completed','refunded','cancelled'].includes(String(d?.status||''));
  const dealPill=s=>s==='completed'?'green':s==='disputed'?'red':s==='seller_delivered'?'gold':'purple';

  function insertAfter(anchor,node){if(anchor?.parentNode)anchor.parentNode.insertBefore(node,anchor.nextSibling)}
  function quickLink(href,icon,title,sub){return `<a class="v5-mini" href="${href}"><div class="micon">${icon}</div><div><strong>${title}</strong><span>${sub}</span></div><div class="right">›</div></a>`}

  window.panelPurchaseAcceptedOffer=async(id,item,totalGb)=>{
    if(!ME){location.href='/login.html';return}
    try{
      const cfg=await api('/api/public/market-config'),rate=Number(cfg.gbTryRate||0),tryTotal=Number(totalGb||0)*rate;
      const msg=rate>0?`${item}\nToplam: ${fmtGB(totalGb)} ≈ ${money(tryTotal)}\nBu tutar KOTAKAS emanet bakiyesine alınacak. Devam?`:`${item}\nToplam: ${fmtGB(totalGb)}\nBu tutar KOTAKAS emanet bakiyesine alınacak. Devam?`;
      if(!confirm(msg))return;
      const d=await api(`/api/listing-price-offers/${id}/purchase`,{method:'POST',headers:{'Idempotency-Key':`panel-price-offer-${id}-${Date.now()}`}});
      toast('Teklif fiyatından güvenli işlem başladı.');
      setTimeout(()=>location.href=`/deals.html?id=${d.deal?.id||''}`,350);
    }catch(err){
      const map={price_offer_expired:'Bu teklifin satın alma süresi doldu.',price_offer_not_accepted:'Teklif artık satın alınabilir durumda değil.',buyer_balance_insufficient:`Bakiyen yetersiz. Gerekli ${money(err.data?.requiredTry||0)}`,listing_stock_changed:'İlan stoğu değişti. Teklifi yeniden kontrol et.'};
      toast(map[err.data?.error]||err.data?.error||'Teklif fiyatından satın alma başlatılamadı.');
    }
  };

  window.panelPriceOfferDecision=async(id,action)=>{
    const label=action==='accept'?'kabul etmek':'reddetmek';
    if(!confirm(`Bu fiyat teklifini ${label} istiyor musun?`))return;
    try{await api(`/api/listing-price-offers/${id}/decision`,{method:'POST',body:{action}});toast(action==='accept'?'Teklif kabul edildi. Alıcının 10 dakikası başladı.':'Teklif reddedildi.');setTimeout(()=>location.reload(),300)}catch(err){toast(err.data?.error||'Fiyat teklifi güncellenemedi.')}
  };

  window.panelOpenAdminPane=name=>{
    const nav=$(`.adminNav[data-pane="${name}"]`);
    if(nav){nav.click();nav.scrollIntoView({behavior:'smooth',block:'start'});return}
    toast('Bu bölüm mevcut yetkinle kullanılamıyor.');
  };

  async function renderUserCenter(){
    if(!path.endsWith('/dashboard.html')||!ME||ME.role!=='user')return;
    if($('#userCommandCenter'))return;
    const [fav,watches,po,dd]=await Promise.all([
      safeCall('/api/favorites/',{total:0,listings:[],traders:[]}),
      safeCall('/api/item-watches/',{watches:[]}),
      safeCall('/api/listing-price-offers/mine',{offers:[]}),
      safeCall('/api/deals',{deals:[]})
    ]);
    const deals=dd.deals||[],offers=(po.offers||[]).filter(x=>x.role==='buyer'),accepted=offers.filter(x=>x.status==='accepted'),pending=offers.filter(x=>x.status==='pending');
    const activeEscrow=deals.filter(activeDeal).reduce((s,x)=>s+Number(x.escrowTry||0),0),completed=deals.filter(x=>x.status==='completed'),watchRows=watches.watches||[],watchMatches=watchRows.reduce((s,x)=>s+Number(x.matchCount||0),0);
    const node=document.createElement('section');node.id='userCommandCenter';node.className='v5-card';node.style.marginBottom='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🧭 Kullanıcı Kontrol Merkezi</h3><p>Takiplerin, pazarlıkların ve güvenli işlemlerin tek bakışta.</p></div><div class="spacer"></div><span class="pill green">CANLI ÖZET</span></div>
      <div class="v5-statgrid" style="margin-bottom:14px">
        <div class="v5-stat purple"><div class="top"><div class="ico">🔐</div><span>Aktif Emanet</span></div><strong style="font-size:20px">${money(activeEscrow)}</strong><span>${deals.filter(activeDeal).length} güvenli işlem</span></div>
        <div class="v5-stat green"><div class="top"><div class="ico">✅</div><span>Tamamlanan</span></div><strong>${completed.length}</strong><span>Başarıyla kapanan işlem</span></div>
        <div class="v5-stat"><div class="top"><div class="ico">❤</div><span>Favoriler</span></div><strong>${Number(fav.total||0)}</strong><span>${(fav.listings||[]).length} ilan • ${(fav.traders||[]).length} pazarcı</span></div>
        <div class="v5-stat gold"><div class="top"><div class="ico">🎯</div><span>Item Alarmı</span></div><strong>${watchMatches}</strong><span>${watchRows.length} alarmda aktif eşleşme</span></div>
      </div>
      <div class="v5-layout">
        <div>
          <div class="v5-card-head"><div><h3>💬 SELL Pazarlıklarım</h3><p>Kabul edilen tekliflerde satın alma süresi 10 dakikadır.</p></div><div class="spacer"></div><span class="pill purple">${pending.length} BEKLEYEN</span></div>
          <div class="v5-mini-list">${offers.length?offers.slice(0,6).map(o=>{const l=o.listing||{},total=Number(o.offerGbPerUnit||0)*Number(o.quantity||1),canBuy=o.status==='accepted'&&new Date(o.expiresAt).getTime()>Date.now();return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">${canBuy?'🔥':'💬'}</div><div style="flex:1"><strong>${esc(l.itemName||'SELL ilanı')} x${Number(o.quantity||1)}</strong><span>${fmtGB(o.offerGbPerUnit)} / adet • ${esc(String(o.status||''))}${o.expiresAt?' • '+formatDate(o.expiresAt):''}</span>${canBuy?`<div class="actions" style="margin-top:8px"><button class="btn sm teal" onclick="panelPurchaseAcceptedOffer(${o.id},'${esc(String(l.itemName||'Item')).replaceAll("'","\\'")}',${total})">Bu Fiyattan Satın Al</button></div>`:''}</div></div>`}).join(''):'<div class="empty">Henüz SELL fiyat teklifin yok.</div>'}</div>
        </div>
        <aside>
          <div class="v5-card-head"><div><h3>⚡ Hızlı İşlemler</h3><p>En çok kullanacağın alanlar.</p></div></div>
          <div class="v5-mini-list">
            ${quickLink('/buy.html','🛒','Item Al','Pazarcı SELL ilanlarına bak')}
            ${quickLink('/sell.html','📤','Item Sat','Pazarcılardan BUY teklifi topla')}
            ${quickLink('/favorites.html','❤','Takip Merkezi','Favoriler ve item alarmları')}
            ${quickLink('/deals.html','🤝','Güvenli İşlemler','Emanet bakiyedeki işlemler')}
            ${quickLink('/support.html','🛟','Destek','Sorun veya anlaşmazlık bildir')}
          </div>
        </aside>
      </div>`;
    const stats=$('.v5-statgrid');insertAfter(stats,node);
  }

  async function renderTraderCenter(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader')return;
    if($('#traderCommandCenter'))return;
    const [profile,ld,po,dd]=await Promise.all([
      safeCall(`/api/trader-profiles/${encodeURIComponent(ME.id)}`,{trader:{}}),
      safeCall('/api/listings/mine',{listings:[]}),
      safeCall('/api/listing-price-offers/mine',{offers:[]}),
      safeCall('/api/deals',{deals:[]})
    ]);
    const t=profile.trader||{},listings=ld.listings||[],offers=(po.offers||[]).filter(x=>x.role==='seller'),pending=offers.filter(x=>x.status==='pending'),low=listings.filter(x=>x.status==='active'&&Number(x.stock||0)<=2),deals=dd.deals||[];
    const completed=deals.filter(x=>x.status==='completed'&&x.traderUserId===ME.id),net=completed.reduce((s,x)=>s+Number(x.sellerNetTry||0),0);
    const node=document.createElement('section');node.id='traderCommandCenter';node.className='v5-card';node.style.marginBottom='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🏪 Pazarcı Operasyon Merkezi</h3><p>Mağaza sağlığı, satış performansı, pazarlıklar ve stok uyarıları.</p></div><div class="spacer"></div><a class="btn sm ghost" href="/trader-profile.html?id=${encodeURIComponent(ME.id)}">Mağaza Profilim</a></div>
      <div class="v5-statgrid" style="margin-bottom:14px">
        <div class="v5-stat"><div class="top"><div class="ico">🏆</div><span>KOTAKAS Skoru</span></div><strong>${Number(t.kotakasScore||0).toFixed(1)}</strong><span>100 üzerinden güven skoru</span></div>
        <div class="v5-stat green"><div class="top"><div class="ico">📈</div><span>Başarı Oranı</span></div><strong>${percent(t.successRate)}</strong><span>${Number(t.completedDeals||0)} tamamlanan işlem</span></div>
        <div class="v5-stat purple"><div class="top"><div class="ico">⭐</div><span>Puan / Takipçi</span></div><strong>${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'—'}</strong><span>${Number(t.followerCount||0)} takipçi • ${Number(t.reviewCount||0)} yorum</span></div>
        <div class="v5-stat gold"><div class="top"><div class="ico">💰</div><span>Tamamlanan Net</span></div><strong style="font-size:20px">${money(net)}</strong><span>${completed.length} tamamlanan satış</span></div>
      </div>
      <div class="v5-layout">
        <div>
          <div class="v5-card-head"><div><h3>💬 İlanıma Gelen Fiyat Teklifleri</h3><p>Kabul edince para çekilmez; alıcıya 10 dakikalık satın alma hakkı açılır.</p></div><div class="spacer"></div><span class="pill ${pending.length?'gold':'green'}">${pending.length} BEKLEYEN</span></div>
          <div class="v5-mini-list">${pending.length?pending.slice(0,8).map(o=>{const l=o.listing||{};return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">💸</div><div style="flex:1"><strong>${esc(l.itemName||'SELL ilanı')} x${Number(o.quantity||1)}</strong><span>${esc(o.buyerName||'Kullanıcı')} • teklif ${fmtGB(o.offerGbPerUnit)} / adet • ilan ${fmtGB(l.priceGb)}</span><div class="actions" style="margin-top:8px"><button class="btn sm green" onclick="panelPriceOfferDecision(${o.id},'accept')">Kabul Et</button><button class="btn sm ghost" onclick="panelPriceOfferDecision(${o.id},'decline')">Reddet</button></div></div></div>`}).join(''):'<div class="empty">Bekleyen fiyat teklifi yok.</div>'}</div>
        </div>
        <aside>
          <div class="v5-card-head"><div><h3>📦 Stok Uyarıları</h3><p>2 ve altına düşen aktif ilanlar.</p></div><div class="spacer"></div><button class="btn sm teal" onclick="openModal('listingModal')">＋ Yeni İlan</button></div>
          <div class="v5-mini-list">${low.length?low.slice(0,6).map(x=>`<div class="v5-mini"><div class="micon">${Number(x.stock)<=1?'🚨':'⚠️'}</div><div><strong>${esc(x.itemName)}</strong><span>${esc(x.serverCode)} • ${fmtGB(x.priceGb)} • Stok ${Number(x.stock)}</span></div></div>`).join(''):'<div class="empty">Kritik stokta aktif ilan yok.</div>'}</div>
          <div class="v5-tip" style="margin-top:10px"><strong style="display:block;margin-bottom:5px;color:#e3fffd">⚡ Mağaza hedefi</strong>Teklif alımını açık tut, düşük stokları yenile ve bekleyen pazarlıkları hızlı cevapla. Gerçek cevap süresi KOTAKAS skoruna yansır.</div>
        </aside>
      </div>`;
    const stats=$('.v5-statgrid');insertAfter(stats,node);
  }

  async function renderAdminCenter(){
    if(!path.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_'))return;
    if($('#adminCommandCenter'))return;
    const canFinance=ME.role==='admin_owner'||ME.role==='admin_full';
    const [ov,support,disputes,health,risk,finance]=await Promise.all([
      safeCall('/api/admin/overview',{overview:{}}),
      safeCall('/api/admin/support',{tickets:[]}),
      safeCall('/api/admin/disputes',{deals:[]}),
      safeCall('/api/health',{}),
      canFinance?safeCall('/api/admin/risk/summary',{}):Promise.resolve({}),
      canFinance?safeCall('/api/admin/finance/summary',{}):Promise.resolve({})
    ]);
    const o=ov.overview||{},tickets=support.tickets||[],openTickets=tickets.filter(x=>x.status!=='closed'),dx=disputes.deals||[];
    const node=document.createElement('section');node.id='adminCommandCenter';node.className='v5-card';node.style.marginBottom='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🎛️ Yönetim Kontrol Merkezi</h3><p>Önce müdahale edilmesi gereken işler ve platform sağlığı.</p></div><div class="spacer"></div><span class="pill ${Number(risk.critical||0)>0?'red':'green'}">${Number(risk.critical||0)>0?'DİKKAT GEREKİYOR':'SİSTEM NORMAL'}</span></div>
      <div class="v5-statgrid" style="margin-bottom:14px">
        <div class="v5-stat gold"><div class="top"><div class="ico">🏪</div><span>Bekleyen Başvuru</span></div><strong>${Number(o.pendingApplications||0)}</strong><span>Pazarcı onayı bekliyor</span></div>
        <div class="v5-stat ${openTickets.length?'purple':''}"><div class="top"><div class="ico">🛟</div><span>Açık Destek</span></div><strong>${openTickets.length}</strong><span>Kapanmamış destek kaydı</span></div>
        <div class="v5-stat ${dx.length?'gold':'green'}"><div class="top"><div class="ico">⚖️</div><span>Anlaşmazlık</span></div><strong>${dx.length}</strong><span>Emanet çözümü bekliyor</span></div>
        <div class="v5-stat ${Number(risk.critical||0)>0?'red':'green'}"><div class="top"><div class="ico">🛡️</div><span>Kritik Risk</span></div><strong>${canFinance?Number(risk.critical||0):'—'}</strong><span>${canFinance?`${Number(risk.open||0)} açık risk sinyali`:'Yetki gerektirir'}</span></div>
      </div>
      <div class="v5-layout">
        <div>
          <div class="v5-card-head"><div><h3>🚨 Öncelikli İşler</h3><p>Tek tıkla ilgili yönetim bölümüne geç.</p></div></div>
          <div class="v5-mini-list">
            <button class="v5-mini" style="width:100%;text-align:left;cursor:pointer" onclick="panelOpenAdminPane('apps')"><div class="micon">🏪</div><div><strong>Pazarcı başvuruları</strong><span>${Number(o.pendingApplications||0)} kayıt inceleme bekliyor</span></div><div class="right">›</div></button>
            <button class="v5-mini" style="width:100%;text-align:left;cursor:pointer" onclick="panelOpenAdminPane('support')"><div class="micon">🛟</div><div><strong>Destek kuyruğu</strong><span>${openTickets.length} açık kayıt</span></div><div class="right">›</div></button>
            <button class="v5-mini" style="width:100%;text-align:left;cursor:pointer" onclick="panelOpenAdminPane('disputes')"><div class="micon">⚖️</div><div><strong>Anlaşmazlıklar</strong><span>${dx.length} finansal karar bekliyor</span></div><div class="right">›</div></button>
            ${canFinance?`<button class="v5-mini" style="width:100%;text-align:left;cursor:pointer" onclick="panelOpenAdminPane('risk')"><div class="micon">🛡️</div><div><strong>Risk Merkezi</strong><span>${Number(risk.critical||0)} kritik • ${Number(risk.high||0)} yüksek</span></div><div class="right">›</div></button>`:''}
          </div>
        </div>
        <aside>
          <div class="v5-card-head"><div><h3>💳 Finans ve Sistem</h3><p>Platformun canlı teknik/finans özeti.</p></div></div>
          <div class="v5-mini-list">
            ${canFinance?`<div class="v5-mini"><div class="micon">🔐</div><div><strong>${money(finance.activeEscrowTry)}</strong><span>Aktif emanet bakiye</span></div></div><div class="v5-mini"><div class="micon">💰</div><div><strong>${money(finance.platformCommissionTry)}</strong><span>Tamamlanan platform komisyonu</span></div></div>`:''}
            <div class="v5-mini"><div class="micon">🗄️</div><div><strong>${esc(health.database||risk.provider||'Veritabanı')}</strong><span>Schema V${esc(health.schemaVersion||'—')} • ${health.pendingMigrations===0?'Migration güncel':'Migration kontrolü gerekli'}</span></div></div>
            <div class="v5-mini"><div class="micon">⚙️</div><div><strong>${esc(health.app||'KOTAKAS')}</strong><span>${esc(health.runtime||'.NET 8')} • Yönetim rolü: ${esc(ME.role)}</span></div></div>
          </div>
          ${canFinance?`<div class="actions" style="margin-top:10px"><button class="btn sm ghost" onclick="panelOpenAdminPane('finance')">Finans Detayı</button><button class="btn sm teal" onclick="runAdminRiskScan?.()">Risk Taraması</button></div>`:''}
        </aside>
      </div>`;
    const stats=$('#adminStats');insertAfter(stats,node);
  }

  async function boot(){
    if(!ME)await loadMe();
    if(!ME)return;
    if(path.endsWith('/dashboard.html'))await renderUserCenter();
    else if(path.endsWith('/trader.html'))await renderTraderCenter();
    else if(path.endsWith('/admin.html'))await renderAdminCenter();
  }

  setTimeout(boot,350);
  setTimeout(boot,1000);
})();
