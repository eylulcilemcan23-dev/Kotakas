(()=>{
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';

  async function ensureTraderFunding(priceGb){
    const [wallet,config]=await Promise.all([
      api('/api/wallet'),
      api('/api/public/market-config')
    ]);
    const rate=Number(config.gbTryRate||0);
    if(rate<=0){
      toast('GB/TL kuru admin tarafından ayarlanmamış.');
      return false;
    }
    const required=Math.round(Number(priceGb||0)*rate*100)/100;
    const balance=Number(wallet.balanceTry||0);
    if(balance<required){
      toast(`Bu teklif için pazarcı bakiyende en az ${money(required)} olmalı. Mevcut: ${money(balance)}. Önce Bakiye Ekle.`);
      return false;
    }
    return true;
  }

  // Canlı Pazar teklif penceresindeki talep id'sini hatırla.
  const originalOpenMarketOffer=window.openMarketOffer;
  if(typeof originalOpenMarketOffer==='function'){
    window.openMarketOffer=(id,...args)=>{
      window.__kotakasMarketOfferRequestId=Number(id||0);
      return originalOpenMarketOffer(id,...args);
    };
  }

  // Canlı Pazar: bakiyesi olmayan pazarcı teminatsız teklif gönderemesin.
  if(typeof window.submitMarketOffer==='function'){
    window.submitMarketOffer=async e=>{
      e.preventDefault();
      const requestId=Number(window.__kotakasMarketOfferRequestId||0);
      const price=Number(String($('#marketOfferPrice')?.value||'0').replace(',','.'));
      const expiry=Number($('#marketOfferExpiry')?.value||10);
      if(!requestId||!Number.isFinite(price)||price<=0)return toast('Geçerli bir GB teklifi gir.');
      try{
        if(!await ensureTraderFunding(price))return;
        await api(`/api/sale-requests/${requestId}/offers`,{method:'POST',body:{priceGb:price,expiryMinutes:expiry}});
        closeMarketOffer?.();
        toast('Teklifin kullanıcıya gönderildi ve bakiyen doğrulandı.');
        setTimeout(()=>location.reload(),350);
      }catch(err){
        const code=err.data?.error;
        if(code==='cannot_offer_own_request')toast('Kendi satış talebine teklif veremezsin.');
        else if(code==='buyer_balance_insufficient')toast(`Teklif için bakiye yetersiz. Gerekli: ${money(err.data?.requiredTry)}, mevcut: ${money(err.data?.balanceTry)}.`);
        else toast(code||'Teklif gönderilemedi.');
      }
    };
  }

  // Pazarcı panelindeki teklif formu da aynı bakiye kontrolünden geçsin.
  window.sendOffer=async e=>{
    e.preventDefault();
    const fallback=(typeof CURRENT_OFFER_REQUEST!=='undefined'?CURRENT_OFFER_REQUEST:0);
    const rid=Number($('#offerRequestId')?.value||fallback||0);
    const price=Number(String($('#offerPrice')?.value||'0').replace(',','.'));
    const expiry=Number($('#offerExpiry')?.value||10);
    if(!rid||!price)return toast('Teklif bilgilerini kontrol et.');
    try{
      if(!await ensureTraderFunding(price))return;
      await api(`/api/sale-requests/${rid}/offers`,{method:'POST',body:{priceGb:price,expiryMinutes:expiry}});
      closeModal?.('offerModal');
      toast('Teklif gönderildi ve bakiyen doğrulandı.');
      setTimeout(()=>location.reload(),400);
    }catch(err){
      const code=err.data?.error;
      if(code==='cannot_offer_own_request')toast('Kendi satış talebine teklif veremezsin.');
      else if(code==='buyer_balance_insufficient')toast(`Teklif için bakiye yetersiz. Gerekli: ${money(err.data?.requiredTry)}, mevcut: ${money(err.data?.balanceTry)}.`);
      else toast(code||'Teklif gönderilemedi.');
    }
  };

  // Kullanıcı teklif kabul ederken gerçek hata sebebini göster.
  window.acceptOffer=async id=>{
    if(!confirm('Bu pazarcının teklifini kabul etmek istiyor musun? Kabul anında pazarcının TL bakiyesi KOTAKAS emanetine alınır.'))return;
    try{
      const d=await api(`/api/offers/${id}/accept`,{method:'POST'});
      toast(`Teklif kabul edildi. ${money(d.deal?.grossTry)} KOTAKAS emanetine alındı.`);
      setTimeout(()=>location.reload(),450);
    }catch(err){
      const code=err.data?.error;
      if(code==='buyer_balance_insufficient'){
        toast(`Pazarcının bakiyesi yetersiz. Bu teklif şu an kabul edilemez. Gerekli: ${money(err.data?.requiredTry)}, pazarcı bakiyesi: ${money(err.data?.balanceTry)}.`);
      }else if(code==='market_rate_not_configured'){
        toast('GB/TL kuru admin tarafından ayarlanmamış.');
      }else if(err.status===404){
        toast('Bu teklif artık aktif değil veya satış talebi kapanmış.');
      }else{
        toast(code||'Teklif kabul edilemedi.');
      }
    }
  };
})();
