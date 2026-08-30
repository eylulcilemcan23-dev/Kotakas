(()=>{
  const path=location.pathname.toLowerCase();
  const money=v=>Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  const text=v=>esc(String(v??''));
  const csvCell=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const date=v=>v?new Date(v).toLocaleString('tr-TR'):'—';

  function insertAfter(anchor,node){
    if(anchor?.parentNode)anchor.parentNode.insertBefore(node,anchor.nextSibling);
  }

  function downloadCsv(filename,headers,rows){
    const body=[headers.map(csvCell).join(';'),...rows.map(r=>r.map(csvCell).join(';'))].join('\n');
    const blob=new Blob(['\ufeff'+body],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('CSV raporu hazırlandı.');
  }

  function urgencyCard(icon,title,body,actionHtml='',kind=''){
    return `<div class="v5-mini ${kind}" style="align-items:flex-start">
      <div class="micon">${icon}</div>
      <div style="flex:1"><strong>${title}</strong><span>${body}</span>${actionHtml?`<div class="actions" style="margin-top:8px">${actionHtml}</div>`:''}</div>
    </div>`;
  }

  function activeDeal(d){
    return Number(d?.escrowTry||0)>0&&!['completed','refunded','cancelled'].includes(String(d?.status||''));
  }

  window.exportUserDealsCsv=async()=>{
    const d=await safe('/api/deals',{deals:[]}),rows=d.deals||[];
    downloadCsv('kotakas-kullanici-islemleri.csv',
      ['İşlem No','Akış','Item','Server','Adet','Birim GB','Brüt TL','Emanet TL','Durum','Oluşturma','Tamamlanma'],
      rows.map(x=>[x.id,x.flow,x.itemName,x.serverCode,x.quantity,x.unitPriceGb||x.priceGb,x.grossTry,x.escrowTry,x.status,date(x.createdAt),date(x.completedAt)]));
  };

  window.exportTraderSalesCsv=async()=>{
    const d=await safe('/api/deals',{deals:[]});
    const rows=(d.deals||[]).filter(x=>x.traderUserId===ME?.id);
    downloadCsv('kotakas-pazarci-satislari.csv',
      ['İşlem No','Akış','Item','Server','Adet','Birim GB','Brüt TL','Komisyon %','Komisyon TL','Net TL','Durum','Tamamlanma'],
      rows.map(x=>[x.id,x.flow,x.itemName,x.serverCode,x.quantity,x.unitPriceGb||x.priceGb,x.grossTry,x.commissionPercent,x.commissionTry,x.sellerNetTry,x.status,date(x.completedAt)]));
  };

  window.exportAdminPerformanceCsv=async()=>{
    try{
      const d=await api('/api/admin/performance'),m=d.last30||{};
      const rows=[
        ['30 Gün Tamamlanan İşlem',m.deals],['30 Gün Hacim TL',m.volumeTry],['30 Gün Komisyon TL',m.commissionTry],['Ortalama Sepet TL',m.averageTicketTry],['Yeni Kullanıcı',m.newUsers],['Satış Talebi',m.saleRequests],['Yeni SELL İlanı',m.newListings],
        ...((d.topTraders||[]).map((x,i)=>[`İlk Pazarcı ${i+1}: ${x.displayName}`,`${x.deals} işlem / ${x.volumeTry} TL`])),
        ...((d.topServers||[]).map(x=>[`Server ${x.serverCode}`,`${x.deals} işlem / ${x.volumeTry} TL`]))
      ];
      downloadCsv('kotakas-admin-performans.csv',['Gösterge','Değer'],rows);
    }catch(err){toast(err.data?.error||'Performans raporu alınamadı.');}
  };

  async function userPro(){
    if(!path.endsWith('/dashboard.html')||!ME||ME.role!=='user'||$('#userProCenter'))return;
    const [ins,dd,po]=await Promise.all([
      safe('/api/panel/user-insights',{}),
      safe('/api/deals',{deals:[]}),
      safe('/api/listing-price-offers/mine',{offers:[]})
    ]);
    const deals=dd.deals||[],offers=(po.offers||[]).filter(x=>x.role==='buyer');
    const active=deals.filter(activeDeal),accepted=offers.filter(x=>x.status==='accepted'&&new Date(x.expiresAt).getTime()>Date.now());
    const disputed=deals.filter(x=>x.status==='disputed');
    const completed=deals.filter(x=>x.status==='completed');
    const actions=[];

    accepted.slice(0,3).forEach(o=>{
      const l=o.listing||{},remaining=Math.max(0,Math.ceil((new Date(o.expiresAt).getTime()-Date.now())/60000));
      actions.push(urgencyCard('🔥',`${text(l.itemName||'SELL ilanı')} için kabul edilen fiyat`,`Satın alma hakkının bitmesine yaklaşık ${remaining} dakika kaldı.`,`<button class="btn sm teal" onclick="panelPurchaseAcceptedOffer(${Number(o.id)},'${text(l.itemName||'Item').replaceAll("'","\\'")}',${Number(o.offerGbPerUnit||0)*Number(o.quantity||1)})">Güvenli Satın Al</button>`,'gold'));
    });
    disputed.slice(0,2).forEach(d=>actions.push(urgencyCard('⚖️',`#${Number(d.id)} anlaşmazlık açık`,`${text(d.itemName)} • ${money(d.escrowTry)} emanet bakiyede.`,`<a class="btn sm ghost" href="/deals.html?id=${Number(d.id)}">İşlemi Aç</a>`,'gold')));
    active.filter(x=>x.status!=='disputed').slice(0,3).forEach(d=>actions.push(urgencyCard('🔐',`#${Number(d.id)} güvenli işlem devam ediyor`,`${text(d.itemName)} • durum: ${text(d.status)} • emanet ${money(d.escrowTry)}`,`<a class="btn sm ghost" href="/deals.html?id=${Number(d.id)}">Detaya Git</a>`)));
    if(!actions.length)actions.push('<div class="empty">Şu anda acil işlem gerektiren bir kayıt yok.</div>');

    const node=document.createElement('section');node.id='userProCenter';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🧠 İşlem Asistanı</h3><p>Kabul edilen fiyatlar, emanet işlemleri ve riskli durumları öncelik sırasına koyar.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="exportUserDealsCsv()">⬇ CSV Hareket Dökümü</button></div>
      <div class="v5-layout">
        <div><div class="v5-card-head"><div><h3>Şimdi Ne Yapmalıyım?</h3><p>Gerçek hesap hareketlerinden oluşturulan görev listesi.</p></div></div><div class="v5-mini-list">${actions.join('')}</div></div>
        <aside><div class="v5-card-head"><div><h3>📌 Hesap Özeti</h3><p>İşlem geçmişinin kısa görünümü.</p></div></div><div class="v5-mini-list">
          ${urgencyCard('✅','Tamamlanan işlem',`${completed.length} işlem • toplam hacim ${money(ins.completedVolumeTry)}`)}
          ${urgencyCard('🔐','Aktif emanet',`${active.length} işlem • ${money(ins.activeEscrowTry)}`)}
          ${urgencyCard('🏅','Seviye',`${text(ins.level?.icon||'🪶')} ${text(ins.level?.name||'Çaylak')} • sonraki seviyeye ${Number(ins.level?.remaining||0)} işlem`)}
        </div><div class="actions" style="margin-top:10px"><a class="btn sm teal" href="/favorites.html">❤ Takiplerim</a><a class="btn sm ghost" href="/deals.html">🤝 Tüm İşlemler</a></div></aside>
      </div>`;
    insertAfter($('#userLevelCenter')||$('#userCommandCenter')||$('.v5-layout'),node);
  }

  async function traderPro(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader'||$('#traderProCenter'))return;
    const [ins,ld,dd]=await Promise.all([
      safe('/api/panel/trader-insights',{}),
      safe('/api/listings/mine',{listings:[]}),
      safe('/api/deals',{deals:[]})
    ]);
    const listings=ld.listings||[],deals=(dd.deals||[]).filter(x=>x.traderUserId===ME.id),active=deals.filter(activeDeal);
    const low=listings.filter(x=>x.status==='active'&&Number(x.stock||0)<=2),soldOut=listings.filter(x=>x.status==='sold_out'||Number(x.stock||0)<=0);
    const p=ins.priceOffers||{},w7=ins.last7||{},w30=ins.last30||{};
    const weeklyRunRate=Number(w7.netTry||0)*4.2857,trend=Number(w30.netTry||0)>0?((weeklyRunRate-Number(w30.netTry||0))/Number(w30.netTry||0))*100:null;
    const actions=[];
    if(Number(p.pending||0)>0)actions.push(urgencyCard('💬',`${Number(p.pending)} fiyat teklifi cevap bekliyor`,`30 günlük cevap oranın ${p.responseRate30==null?'henüz oluşmadı':'%'+Number(p.responseRate30).toFixed(1)}.`,`<span class="pill gold">HIZLI CEVAPLA</span>`,'gold'));
    low.slice(0,4).forEach(x=>actions.push(urgencyCard(Number(x.stock)<=1?'🚨':'⚠️',`${text(x.itemName)} stok azalıyor`,`${text(x.serverCode)} • stok ${Number(x.stock)} • ${Number(x.priceGb||0).toFixed(2)} GB`,`<button class="btn sm ghost" onclick="openModal('listingModal')">Yeni İlan / Stok</button>`)));
    active.slice(0,3).forEach(d=>actions.push(urgencyCard('🤝',`#${Number(d.id)} aktif işlem`,`${text(d.itemName)} • ${money(d.escrowTry)} emanet • ${text(d.status)}`,`<a class="btn sm ghost" href="/deals.html?id=${Number(d.id)}">İşlemi Aç</a>`)));
    if(!actions.length)actions.push('<div class="empty">Operasyon kuyruğun temiz. Yeni taleplere teklif verebilirsin.</div>');

    const node=document.createElement('section');node.id='traderProCenter';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🚀 Pazarcı Pro Operasyon</h3><p>Satış temposu, stok sağlığı ve bekleyen aksiyonları tek yerde toplar.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="exportTraderSalesCsv()">⬇ Satış CSV</button></div>
      <div class="v5-statgrid">
        <div class="v5-stat green"><div class="top"><div class="ico">7G</div><span>7 Gün Net</span></div><strong style="font-size:19px">${money(w7.netTry)}</strong><span>${Number(w7.deals||0)} tamamlanan satış</span></div>
        <div class="v5-stat gold"><div class="top"><div class="ico">30</div><span>30 Gün Net</span></div><strong style="font-size:19px">${money(w30.netTry)}</strong><span>Ort. sepet ${money(w30.averageTicketTry)}</span></div>
        <div class="v5-stat ${trend!=null&&trend>=0?'green':'purple'}"><div class="top"><div class="ico">📈</div><span>Satış Temposu</span></div><strong>${trend==null?'—':(trend>=0?'+':'')+trend.toFixed(1)+'%'}</strong><span>7 günlük hızın 30 güne göre tahmini</span></div>
        <div class="v5-stat purple"><div class="top"><div class="ico">📦</div><span>Stok Sağlığı</span></div><strong>${Number(ins.listings?.active||0)}</strong><span>${low.length} düşük • ${soldOut.length} tükenen</span></div>
      </div>
      <div class="v5-layout" style="margin-top:14px"><div><div class="v5-card-head"><div><h3>⚡ Günlük Operasyon Kuyruğu</h3><p>Önce cevap, sonra stok, ardından aktif işlemler.</p></div></div><div class="v5-mini-list">${actions.join('')}</div></div>
      <aside><div class="v5-card-head"><div><h3>🎯 30 Günlük Odak</h3><p>Gerçek performans verisinden kısa yönlendirme.</p></div></div><div class="v5-mini-list">
        ${urgencyCard('💬','Pazarlık dönüşü',`${p.responseRate30==null?'—':'%'+Number(p.responseRate30).toFixed(1)} cevap oranı • ${Number(p.accepted30||0)} kabul`)}
        ${urgencyCard('🛍️','Aktif stok',`${Number(ins.listings?.totalStock||0)} adet toplam stok • ${Number(ins.listings?.soldOut||0)} tükenen ilan`)}
        ${urgencyCard('💰','30 gün komisyon',`${money(w30.commissionTry)} platform komisyonu • net ${money(w30.netTry)}`)}
      </div></aside></div>`;
    insertAfter($('#traderAnalyticsCenter')||$('#traderCommandCenter')||$('#myOffers')?.closest('.v5-card'),node);
  }

  async function adminPro(){
    if(!path.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_')||$('#adminProCenter'))return;
    const full=ME.role==='admin_owner'||ME.role==='admin_full';
    const [ov,support,disputes,perf]=await Promise.all([
      safe('/api/admin/overview',{overview:{}}),
      safe('/api/admin/support',{tickets:[]}),
      safe('/api/admin/disputes',{deals:[]}),
      full?safe('/api/admin/performance',{}):Promise.resolve({})
    ]);
    const o=ov.overview||{},tickets=support.tickets||[],open=tickets.filter(x=>x.status!=='closed'),urgent=open.filter(x=>String(x.priority).toLowerCase()==='high'||String(x.priority).toLowerCase()==='urgent'),dx=disputes.deals||[],m=perf.last30||{};
    const queue=[
      {icon:'🏪',title:'Pazarcı başvuruları',count:Number(o.pendingApplications||0),sub:'onay bekliyor',pane:'apps'},
      {icon:'🛟',title:'Açık destek',count:open.length,sub:`${urgent.length} yüksek öncelik`,pane:'support'},
      {icon:'⚖️',title:'Anlaşmazlık',count:dx.length,sub:'emanet kararı bekliyor',pane:'disputes'}
    ].sort((a,b)=>b.count-a.count);

    const node=document.createElement('section');node.id='adminProCenter';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`
      <div class="v5-card-head"><div><h3>🧩 Yönetim Pro Merkezi</h3><p>Operasyon yoğunluğunu sıralar ve üst yönetim için rapor üretir.</p></div><div class="spacer"></div>${full?'<button class="btn sm ghost" onclick="exportAdminPerformanceCsv()">⬇ Performans CSV</button>':''}</div>
      <div class="v5-layout"><div><div class="v5-card-head"><div><h3>🚨 Öncelik Sırası</h3><p>En yoğun yönetim kuyruğu üstte.</p></div></div><div class="v5-mini-list">${queue.map((q,i)=>urgencyCard(i===0&&q.count>0?'🔥':q.icon,`${q.title}: ${q.count}`,q.sub,`<button class="btn sm ${i===0&&q.count>0?'teal':'ghost'}" onclick="panelOpenAdminPane('${q.pane}')">Bölümü Aç</button>`,i===0&&q.count>0?'gold':'')).join('')}</div></div>
      <aside><div class="v5-card-head"><div><h3>📊 Yönetici Özeti</h3><p>${full?'Son 30 günlük gerçek platform verisi.':'Rolüne açık operasyon özeti.'}</p></div></div><div class="v5-mini-list">
        ${full?urgencyCard('💳','30 gün işlem hacmi',`${money(m.volumeTry)} • ${Number(m.deals||0)} tamamlanan işlem`):''}
        ${full?urgencyCard('💰','30 gün platform geliri',`${money(m.commissionTry)} • ortalama sepet ${money(m.averageTicketTry)}`):''}
        ${urgencyCard('👥','Kullanıcı tabanı',`${Number(o.users||0)} kullanıcı • ${Number(o.traders||0)} pazarcı`)}
        ${full?urgencyCard('🌱','30 gün büyüme',`${Number(m.newUsers||0)} yeni kullanıcı • ${Number(m.newListings||0)} yeni SELL ilanı`):''}
      </div></aside></div>`;
    insertAfter($('#adminCommandCenter')||$('#adminStats'),node);
  }

  async function boot(){
    if(!ME)await loadMe();
    if(!ME)return;
    if(path.endsWith('/dashboard.html'))await userPro();
    else if(path.endsWith('/trader.html'))await traderPro();
    else if(path.endsWith('/admin.html'))await adminPro();
  }

  window.refreshPanelPro=boot;
  setTimeout(boot,850);
  setTimeout(boot,1700);
})();
