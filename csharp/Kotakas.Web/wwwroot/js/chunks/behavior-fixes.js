(()=>{
  const path=location.pathname.toLowerCase();

  const baseAccept=window.acceptOffer;
  if(typeof baseAccept==='function'){
    window.acceptOffer=async id=>{
      if(!confirm('Bu pazarcının teklifini kabul etmek istiyor musun?'))return;
      try{await api(`/api/offers/${id}/accept`,{method:'POST'});toast('Teklif kabul edildi.');setTimeout(()=>location.reload(),400)}catch(err){toast(err.data?.error==='offer_expired'?'Bu teklifin süresi dolmuş. Yeni teklif bekleyebilirsin.':err.data?.error==='buyer_balance_insufficient'?'Pazarcının emanet için bakiyesi yetersiz.':'Teklif kabul edilemedi.')}
    };
  }

  if(path.endsWith('/trader.html')){
    const restore=()=>{
      const enabled=$('#onlineToggle')?.classList.contains('on');
      $$('#incomingRequests button').forEach(btn=>{
        if(!btn.dataset.realOfferLabel&&btn.textContent!=='Teklifler Kapalı')btn.dataset.realOfferLabel=btn.textContent||'Teklif Ver';
        if(enabled){btn.disabled=false;btn.textContent=btn.dataset.realOfferLabel||'Teklif Ver'}
        else{btn.disabled=true;btn.textContent='Teklifler Kapalı'}
      });
    };
    const box=$('#incomingRequests');if(box)new MutationObserver(restore).observe(box,{childList:true,subtree:true});setInterval(()=>{if(document.visibilityState==='visible')restore()},3000);
  }
})();
