(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/market.html'))return;

  const isTrader=()=>ME&&(ME.role==='trader'||String(ME.role||'').startsWith('admin_'));
  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  let currentRequestId=0;

  function ensureModal(){
    let modal=$('#marketOfferModal');
    if(modal)return modal;
    modal=document.createElement('div');
    modal.id='marketOfferModal';
    modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:460px">
      <div class="modalhead"><div><h3>💸 Teklif Ver</h3><div id="marketOfferItem" class="meta"></div></div><button class="x" type="button" onclick="closeMarketOffer()">✕</button></div>
      <form onsubmit="submitMarketOffer(event)">
        <div class="notice"><strong id="marketOfferMinimum">Minimum fiyat: —</strong><br><span>Pazarcı olarak ödemek istediğin BUY fiyatını GB cinsinden gir.</span></div>
        <div class="field"><label>Teklifin (GB)</label><input id="marketOfferPrice" inputmode="decimal" placeholder="Örn. 6,80" required></div>
        <div class="field"><label>Teklif geçerlilik süresi</label><select id="marketOfferExpiry"><option value="5">5 dakika</option><option value="10" selected>10 dakika</option><option value="15">15 dakika</option><option value="30">30 dakika</option><option value="60">1 saat</option></select></div>
        <button class="btn teal full" type="submit">Teklifi Gönder</button>
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
    if($('#marketOfferMinimum'))$('#marketOfferMinimum').textContent=`Minimum fiyat: ${Number(minimum||0).toLocaleString('tr-TR',{maximumFractionDigits:2})} GB`;
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
      setTimeout(()=>decorate(),260);
    }catch(err){
      if(err.data?.error==='cannot_offer_own_request')toast('Kendi satış talebine teklif veremezsin.');
      else toast(err.data?.error||'Teklif gönderilemedi.');
    }
  };

  async function decorate(){
    try{
      if(!ME&&typeof loadMe==='function')await loadMe();
      if(!isTrader())return;
      const qs=new URLSearchParams();
      const server=$('#marketServer')?.value;
      if(server&&server!=='ALL')qs.set('server',server);
      const search=$('#marketSearch')?.value.trim();
      if(search)qs.set('search',search);
      const [all,mine]=await Promise.all([
        safe('/api/sale-requests?'+qs.toString(),{requests:[]}),
        safe('/api/sale-requests/mine',{requests:[]})
      ]);
      const rows=all.requests||[];
      const ownIds=new Set((mine.requests||[]).map(x=>Number(x.id)));
      const cards=$$('#marketList > .listitem');
      cards.forEach(x=>x.querySelector('.market-offer-actions')?.remove());
      rows.forEach((r,i)=>{
        const card=cards[i];if(!card)return;
        const actions=document.createElement('div');
        actions.className='actions market-offer-actions';
        if(ownIds.has(Number(r.id))){
          actions.innerHTML='<span class="pill purple">👤 KENDİ TALEBİN</span><span class="meta">Bu talebe aynı hesapla teklif veremezsin.</span>';
        }else{
          const item=String(r.itemName||'Item').replaceAll('\\','\\\\').replaceAll("'","\\'");
          actions.innerHTML=`<button class="btn sm teal" type="button" onclick="openMarketOffer(${Number(r.id)},'${item}',${Number(r.minimumGb||0)})">💸 Teklif Ver</button><span class="meta">Kullanıcı minimum ${Number(r.minimumGb||0).toLocaleString('tr-TR',{maximumFractionDigits:2})} GB istiyor.</span>`;
        }
        card.appendChild(actions);
      });
      if(rows.length!==cards.length)setTimeout(decorate,300);
    }catch{}
  }

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}
    if(!isTrader())return;
    ensureModal();
    setTimeout(decorate,350);
    $('#marketSearch')?.addEventListener('input',()=>setTimeout(decorate,220));
    $('#marketServer')?.addEventListener('change',()=>setTimeout(decorate,220));
    setTimeout(decorate,1500);
  }

  setTimeout(boot,650);
})();
