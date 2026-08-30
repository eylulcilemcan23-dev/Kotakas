(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/market.html'))return;

  const isTrader=()=>ME&&(ME.role==='trader'||String(ME.role||'').startsWith('admin_'));
  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  const trNum=n=>Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2});
  let currentRequestId=0;
  let renderTimer=null;

  function ensureModal(){
    let modal=$('#marketOfferModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='marketOfferModal';
    modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:460px">
      <div class="modalhead"><div><h3>💸 Fiyat Teklifi Ver</h3><div id="marketOfferItem" class="meta"></div></div><button class="x" type="button" onclick="closeMarketOffer()">✕</button></div>
      <form onsubmit="submitMarketOffer(event)">
        <div class="notice"><strong id="marketOfferMinimum">Kullanıcı beklentisi: —</strong><br><span>Bu itemi satın almak için vermek istediğin BUY fiyatını GB olarak gir.</span></div>
        <div class="field"><label>Teklifin (GB)</label><input id="marketOfferPrice" inputmode="decimal" placeholder="Örn. 6,80" required></div>
        <div class="field"><label>Teklif geçerlilik süresi</label><select id="marketOfferExpiry"><option value="5">5 dakika</option><option value="10" selected>10 dakika</option><option value="15">15 dakika</option><option value="30">30 dakika</option><option value="60">1 saat</option></select></div>
        <button class="btn teal full" type="submit">Teklifi Kullanıcıya Gönder</button>
      </form>
    </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)closeMarketOffer()});
    return modal;
  }

  window.openMarketOffer=(id,item,minimum)=>{
    if(!isTrader())return toast('Teklif vermek için pazarcı hesabıyla giriş yapmalısın.');
    currentRequestId=Number(id||0);
    ensureModal();
    if($('#marketOfferItem'))$('#marketOfferItem').textContent=item||'Satış talebi';
    if($('#marketOfferMinimum'))$('#marketOfferMinimum').textContent=`Kullanıcının en düşük beklentisi: ${trNum(minimum)} GB`;
    if($('#marketOfferPrice')){$('#marketOfferPrice').value='';$('#marketOfferPrice').focus()}
    $('#marketOfferModal')?.classList.add('open');
  };

  window.closeMarketOffer=()=>$('#marketOfferModal')?.classList.remove('open');

  window.submitMarketOffer=async e=>{
    e.preventDefault();
    const price=Number(String($('#marketOfferPrice')?.value||'0').replace(',','.'));
    const expiry=Number($('#marketOfferExpiry')?.value||10);
    if(!currentRequestId||!Number.isFinite(price)||price<=0)return toast('Geçerli bir GB teklifi gir.');
    try{
      await api(`/api/sale-requests/${currentRequestId}/offers`,{method:'POST',body:{priceGb:price,expiryMinutes:expiry}});
      closeMarketOffer();
      toast('Teklifin kullanıcıya gönderildi.');
      setTimeout(drawMarket,260);
    }catch(err){
      if(err.data?.error==='cannot_offer_own_request')toast('Kendi satış talebine teklif veremezsin.');
      else if(err.data?.error==='buyer_balance_insufficient')toast(`Bakiyen bu teklif için yetersiz. Gerekli: ${Number(err.data.requiredTry||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺`);
      else toast(err.data?.error||'Teklif gönderilemedi.');
    }
  };

  function cardActions(r,own){
    const activeOffers=(r.offers||[]).filter(x=>String(x.status||'').toLowerCase()==='active').length;
    if(own){
      return `<div class="actions" style="margin-top:12px"><a class="btn sm teal" href="/dashboard.html#myRequests">📋 Tekliflerimi / Talebimi Yönet</a><span class="meta">Bu senin satış talebin. ${activeOffers?`${activeOffers} aktif teklif var.`:'Pazarcı teklifleri bekleniyor.'}</span></div>`;
    }
    if(isTrader()){
      const item=String(r.itemName||'Item').replaceAll('\\','\\\\').replaceAll("'","\\'");
      return `<div class="actions" style="margin-top:12px"><button class="btn sm teal" type="button" onclick="openMarketOffer(${Number(r.id)},'${item}',${Number(r.minimumGb||0)})">💸 Fiyat Teklifi Ver</button><span class="meta">Kullanıcı en az ${trNum(r.minimumGb)} GB bekliyor.</span></div>`;
    }
    if(ME)return `<div class="actions" style="margin-top:12px"><a class="btn sm ghost" href="/sell.html">＋ Ben de Item Satacağım</a><span class="meta">Bu talebe yalnız doğrulanmış pazarcılar BUY teklifi verebilir.</span></div>`;
    return `<div class="actions" style="margin-top:12px"><a class="btn sm ghost" href="/login.html">Giriş Yap</a><span class="meta">Satış talebi açmak veya tekliflerini görmek için giriş yap.</span></div>`;
  }

  function requestCard(r,own){
    const activeOffers=(r.offers||[]).filter(x=>String(x.status||'').toLowerCase()==='active').length;
    const offerLabel=own?'BENİM TALEBİM':`${activeOffers} AKTİF TEKLİF`;
    const offerClass=own?'purple':activeOffers?'green':'purple';
    return `<div class="listitem" data-request-id="${Number(r.id)}">
      <div class="itemhead">
        <div><div class="itemtitle">${esc(r.itemName)}</div><div class="meta">${esc(r.serverCode)} • ${Number(r.quantity||1)} adet • Satış talebi #${Number(r.id)}</div></div>
        <div class="spacer"></div><span class="pill ${offerClass}">${offerLabel}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin-top:12px">
        <div class="notice" style="margin:0;padding:10px 12px"><span class="meta">EN DÜŞÜK BEKLENTİ</span><br><strong style="font-size:17px">${fmtGB(r.minimumGb)}</strong></div>
        <div class="notice" style="margin:0;padding:10px 12px"><span class="meta">GELEN TEKLİF</span><br><strong style="font-size:17px">${activeOffers}</strong></div>
        <div class="notice" style="margin:0;padding:10px 12px"><span class="meta">YAYIN TARİHİ</span><br><strong>${formatDate(r.createdAt)}</strong></div>
      </div>
      ${cardActions(r,own)}
      <div style="margin-top:10px;text-align:right"><a class="meta" href="/reports.html?type=sale_request&id=${Number(r.id)}" title="Bu talebi bildir">⋯ Sorun bildir</a></div>
    </div>`;
  }

  async function drawMarket(){
    try{
      if(!ME&&typeof loadMe==='function')await loadMe();
      const qs=new URLSearchParams();
      const server=$('#marketServer')?.value;
      if(server&&server!=='ALL')qs.set('server',server);
      const search=$('#marketSearch')?.value.trim();
      if(search)qs.set('search',search);
      const minePromise=ME?safe('/api/sale-requests/mine',{requests:[]}):Promise.resolve({requests:[]});
      const [all,mine]=await Promise.all([safe('/api/sale-requests?'+qs.toString(),{requests:[]}),minePromise]);
      const ownIds=new Set((mine.requests||[]).map(x=>Number(x.id)));
      const rows=all.requests||[];
      const box=$('#marketList');
      if(!box)return;
      box.innerHTML=rows.length?rows.map(r=>requestCard(r,ownIds.has(Number(r.id)))).join(''):`<div class="empty"><strong>Şu anda açık satış talebi yok.</strong><br><span>Item satmak istiyorsan yeni talep açabilirsin.</span><div style="margin-top:12px"><a class="btn teal sm" href="/sell.html">＋ Itemimi Satmak İstiyorum</a></div></div>`;
    }catch{}
  }

  function refreshSoon(){clearTimeout(renderTimer);renderTimer=setTimeout(drawMarket,120)}

  function renameShell(){
    document.querySelectorAll('a[href="/market.html"]').forEach(a=>{
      if(a.closest('.k-shell-center'))a.innerHTML='💰 <span>Teklif Pazarı</span>';
      else if(a.closest('.k-drawer'))a.innerHTML='💰 Teklif Pazarı';
    });
  }

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}
    if(isTrader())ensureModal();
    renameShell();
    $('#marketSearch')?.addEventListener('input',refreshSoon);
    $('#marketServer')?.addEventListener('change',refreshSoon);
    setTimeout(drawMarket,120);
    setTimeout(()=>{renameShell();drawMarket()},700);
  }

  setTimeout(boot,700);
})();
