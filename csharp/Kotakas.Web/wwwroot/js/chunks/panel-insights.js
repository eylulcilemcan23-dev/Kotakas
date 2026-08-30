(()=>{
  const path=location.pathname.toLowerCase();
  const money=v=>Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const pct=v=>v==null?'—':`%${Number(v).toFixed(1)}`;

  function after(anchor,node){if(anchor?.parentNode)anchor.parentNode.insertBefore(node,anchor.nextSibling)}
  function stat(icon,label,value,sub,kind=''){return `<div class="v5-stat ${kind}"><div class="top"><div class="ico">${icon}</div><span>${label}</span></div><strong>${value}</strong><span>${sub}</span></div>`}

  async function userInsights(){
    if(!path.endsWith('/dashboard.html')||!ME||ME.role!=='user'||$('#userLevelCenter'))return;
    try{
      const d=await api('/api/panel/user-insights'),lvl=d.level||{},badges=d.badges||[];
      const node=document.createElement('section');node.id='userLevelCenter';node.className='v5-card';node.style.marginTop='14px';
      node.innerHTML=`<div class="v5-card-head"><div><h3>${esc(lvl.icon||'🪶')} Kullanıcı Seviyem: ${esc(lvl.name||'Çaylak')}</h3><p>Seviye ve rozetler yalnız tamamlanan gerçek KOTAKAS işlemlerinden oluşur.</p></div><div class="spacer"></div><span class="pill ${d.verified?'green':'purple'}">${d.verified?'🛡️ DOĞRULANDI':'STANDART HESAP'}</span></div>
        <div class="v5-statgrid">
          ${stat('🤝','Tamamlanan',Number(d.completedDeals||0),'Gerçek güvenli işlem','green')}
          ${stat('🔐','Aktif Emanet',money(d.activeEscrowTry),`${Number(d.activeDeals||0)} açık işlem`,'purple')}
          ${stat('💹','İşlem Hacmi',money(d.completedVolumeTry),'Tamamlanan işlemler','gold')}
          ${stat('⭐','Değerlendirme',Number(d.reviewsGiven||0),'Verdiğin gerçek yorum')}
        </div>
        <div style="margin:14px 0"><div style="display:flex;justify-content:space-between;gap:10px"><strong>${esc(lvl.name||'Seviye')}</strong><span class="meta">${lvl.nextAt?`${Number(lvl.remaining||0)} işlem sonra yeni seviye`:'En üst seviyedesin'}</span></div><div style="height:10px;background:#0d2029;border:1px solid #21424d;border-radius:99px;overflow:hidden;margin-top:8px"><div style="height:100%;width:${Math.max(0,Math.min(100,Number(lvl.progressPercent||0)))}%;background:var(--teal)"></div></div></div>
        <div class="v5-card-head"><div><h3>🏅 Rozetlerim</h3><p>Profil geçmişini ve platform kullanımını özetler.</p></div></div>
        <div class="grid3">${badges.length?badges.map(b=>`<div class="v5-mini"><div class="micon">${esc(b.icon)}</div><div><strong>${esc(b.title)}</strong><span>${esc(b.description)}</span></div></div>`).join(''):'<div class="empty" style="grid-column:1/-1">İlk güvenli işlemini tamamladığında ilk rozetin açılacak.</div>'}</div>`;
      const anchor=$('#walletHistoryCard')||$('#userCommandCenter')||$('.v5-layout');after(anchor,node);
    }catch{}
  }

  function windowCard(title,w,kind=''){
    return `<div class="v5-stat ${kind}"><div class="top"><div class="ico">📊</div><span>${title}</span></div><strong style="font-size:19px">${money(w?.netTry)}</strong><span>${Number(w?.deals||0)} satış • Hacim ${money(w?.volumeTry)}</span></div>`;
  }

  async function traderInsights(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader'||$('#traderAnalyticsCenter'))return;
    try{
      const d=await api('/api/panel/trader-insights'),list=d.listings||{},po=d.priceOffers||{},daily=d.daily||[],tops=d.topItems||[];
      const max=Math.max(1,...daily.map(x=>Number(x.netTry||0)));
      const node=document.createElement('section');node.id='traderAnalyticsCenter';node.className='v5-card';node.style.marginTop='14px';
      node.innerHTML=`<div class="v5-card-head"><div><h3>📈 Satış Analitiği</h3><p>Gerçek tamamlanan işlemlerden günlük, haftalık ve aylık performans.</p></div><div class="spacer"></div><span class="pill green">GERÇEK VERİ</span></div>
        <div class="v5-statgrid">${windowCard('Son 24 Saat',d.today,'green')}${windowCard('Son 7 Gün',d.last7,'purple')}${windowCard('Son 30 Gün',d.last30,'gold')}${stat('📦','Aktif İlan',Number(list.active||0),`${Number(list.lowStock||0)} düşük stok • ${Number(list.totalStock||0)} toplam stok`)}</div>
        <div class="v5-layout"><div><div class="v5-card-head"><div><h3>14 Günlük Net Satış</h3><p>Gün bazında tamamlanan net kazanç.</p></div></div><div style="display:flex;align-items:end;gap:5px;height:150px;padding:10px 4px;border-bottom:1px solid #21424d">${daily.map(x=>`<div title="${esc(x.date)} • ${money(x.netTry)} • ${Number(x.deals)} işlem" style="flex:1;min-width:8px;height:${Math.max(4,Number(x.netTry||0)/max*125)}px;background:linear-gradient(180deg,var(--teal),#176b69);border-radius:5px 5px 2px 2px"></div>`).join('')}</div><div class="meta" style="margin-top:7px">Son 14 gün • çubuk yüksekliği net satış tutarını gösterir.</div></div>
        <aside><div class="v5-card-head"><div><h3>🏆 En Çok İşlem Gören Itemler</h3><p>Son 30 gün.</p></div></div><div class="v5-mini-list">${tops.length?tops.map((x,i)=>`<div class="v5-mini"><div class="micon">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'📦'}</div><div><strong>${esc(x.itemName)}</strong><span>${Number(x.deals)} işlem • Net ${money(x.netTry)}</span></div></div>`).join(''):'<div class="empty">Son 30 günde tamamlanan satış yok.</div>'}<div class="v5-tip"><strong style="display:block;color:#e3fffd">💬 Pazarlık cevap oranı</strong>${pct(po.responseRate30)} • ${Number(po.pending||0)} bekleyen teklif • ${Number(po.accepted30||0)} kabul.</div></div></aside></div>`;
      const anchor=$('#traderWalletHistoryCard')||$('#traderCommandCenter')||$('#myOffers')?.closest('.v5-card');after(anchor,node);
    }catch{}
  }

  async function adminPerformance(){
    if(!path.endsWith('/admin.html')||!ME||(ME.role!=='admin_owner'&&ME.role!=='admin_full'))return;
    const pane=$('#pane-sitecontrol');if(!pane)return;
    try{
      const d=await api('/api/admin/performance'),m=d.last30||{},tops=d.topTraders||[],servers=d.topServers||[],daily=d.daily||[];
      const max=Math.max(1,...daily.map(x=>Number(x.commissionTry||0)));
      const host=$('#adminPerformanceBox');if(!host)return;
      host.innerHTML=`<div class="v5-card-head"><div><h3>📊 Platform Performansı</h3><p>Son 30 gün ve son 14 günlük gelir hareketi.</p></div></div>
        <div class="v5-statgrid">${stat('💳','30 Gün Hacim',money(m.volumeTry),`${Number(m.deals||0)} tamamlanan işlem`,'green')}${stat('💰','30 Gün Komisyon',money(m.commissionTry),`Ort. sepet ${money(m.averageTicketTry)}`,'gold')}${stat('👥','Yeni Kullanıcı',Number(m.newUsers||0),`${Number(m.saleRequests||0)} satış talebi`,'purple')}${stat('🏪','Yeni SELL İlanı',Number(m.newListings||0),'Son 30 günde açılan')}</div>
        <div class="v5-layout"><div><div class="v5-card-head"><div><h3>14 Günlük Komisyon</h3><p>Tamamlanan işlemlerden platform geliri.</p></div></div><div style="display:flex;align-items:end;gap:5px;height:145px;border-bottom:1px solid #21424d;padding:8px 3px">${daily.map(x=>`<div title="${esc(x.date)} • ${money(x.commissionTry)}" style="flex:1;height:${Math.max(4,Number(x.commissionTry||0)/max*120)}px;background:linear-gradient(180deg,#ffd791,#8c6725);border-radius:5px 5px 2px 2px"></div>`).join('')}</div></div><aside><div class="v5-card-head"><div><h3>🏆 İlk 5 Pazarcı</h3><p>30 günlük işlem hacmi.</p></div></div><div class="v5-mini-list">${tops.map((x,i)=>`<div class="v5-mini"><div class="micon">${i+1}</div><div><strong>${esc(x.displayName)}</strong><span>${Number(x.deals)} işlem • ${money(x.volumeTry)}</span></div></div>`).join('')||'<div class="empty">Veri yok.</div>'}</div><div class="v5-card-head" style="margin-top:12px"><div><h3>Server Dağılımı</h3></div></div><div class="v5-mini-list">${servers.map(x=>`<div class="v5-mini"><div class="micon">🌐</div><div><strong>${esc(x.serverCode)}</strong><span>${Number(x.deals)} işlem • ${money(x.volumeTry)}</span></div></div>`).join('')||'<div class="empty">Veri yok.</div>'}</div></aside></div>`;
    }catch{}
  }

  window.refreshPanelInsights=()=>Promise.all([userInsights(),traderInsights(),adminPerformance()]);
  setTimeout(refreshPanelInsights,650);setTimeout(refreshPanelInsights,1400);
})();
