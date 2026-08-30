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
    let restoreQueued=false;
    const restore=()=>{
      restoreQueued=false;
      const enabled=$('#onlineToggle')?.classList.contains('on');
      $$('#incomingRequests button').forEach(btn=>{
        if(!btn.dataset.realOfferLabel&&btn.textContent!=='Teklifler Kapalı')btn.dataset.realOfferLabel=btn.textContent||'Teklif Ver';
        const nextLabel=enabled?(btn.dataset.realOfferLabel||'Teklif Ver'):'Teklifler Kapalı';
        const nextDisabled=!enabled;
        if(btn.disabled!==nextDisabled)btn.disabled=nextDisabled;
        if(btn.textContent!==nextLabel)btn.textContent=nextLabel;
      });
    };
    const queueRestore=()=>{
      if(restoreQueued)return;
      restoreQueued=true;
      requestAnimationFrame(restore);
    };
    // Sürekli MutationObserver / 3 sn interval kaldırıldı. Trader canlı yenilemesi
    // zaten durumu düzenli olarak tekrar uygular; burada yalnız ilk yüklemeyi dengeliyoruz.
    queueRestore();
    setTimeout(queueRestore,700);
    setTimeout(queueRestore,1800);
  }
})();
