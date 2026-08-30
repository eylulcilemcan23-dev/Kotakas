(()=>{
  if(!location.pathname.toLowerCase().endsWith('/ring-sell.html'))return;
  window._enhance=0;
  window.updateSellPreview=()=>{
    const item=$('#item')?.value.trim()||'83 Warrior Karakter';
    const server=$('#server')?.value||'ZERO';
    const qty=$('#qty')?.value||1;
    const min=$('#min')?.value||'—';
    if($('#previewItem'))$('#previewItem').textContent=item;
    if($('#previewMeta'))$('#previewMeta').textContent=`${server} • ${qty} karakter`;
    if($('#previewPrice'))$('#previewPrice').textContent=`${min} GB`;
  };
  window.sellSubmit=async e=>{
    e.preventDefault();
    if(!ME){location.href='/login.html';return}
    const itemName=$('#item')?.value.trim()||'';
    if(!itemName)return toast('Karakter bilgisini yaz.');
    try{
      const wallet=await api('/api/wallet');
      const fee=Number(wallet.nextRequestFeeTry||0);
      if(wallet.monthlyFreeRemaining===0&&fee<=0&&ME.role==='user')return toast('Ücretli talep fiyatı admin tarafından henüz ayarlanmamış.');
      if(fee>0){
        const bal=Number(wallet.balanceTry||0);
        if(bal<fee)return toast(`Bu talep ${fee.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺. Bakiyen yetersiz.`);
        if(!confirm(`Aylık ücretsiz hakkını kullandın. Bu karakter talebi için bakiyenden ${fee.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺ düşülecek. Devam edilsin mi?`))return;
      }
      const notePrefix='[KARAKTER / CYPHER RING] ';
      const d=await api('/api/sale-requests',{method:'POST',body:{itemName,serverCode:$('#server')?.value||'ZERO',quantity:Number($('#qty')?.value||1),minimumGb:Number(String($('#min')?.value||'0').replace(',','.')),note:notePrefix+($('#note')?.value||'')}});
      toast(Number(d.feeTry||0)>0?'Karakter talebi yayınlandı ve ilan bedeli bakiyenden düşüldü.':'Karakter talebi pazarcılara gönderildi.');
      setTimeout(()=>location.href='/dashboard.html',650);
    }catch(err){
      if(err.data?.error==='listing_fee_balance_insufficient')toast(`Yetersiz bakiye. Gerekli: ${Number(err.data.requiredTry||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺`);
      else toast(err.data?.error||'Karakter talebi oluşturulamadı.');
    }
  };
  setTimeout(window.updateSellPreview,100);
})();
