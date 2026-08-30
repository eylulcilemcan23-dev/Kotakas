(()=>{
  if(!location.pathname.toLowerCase().endsWith('/ring-sell.html'))return;
  window._enhance=0;
  const characterTitle=()=>{
    const custom=$('#item')?.value.trim()||'';
    if(custom)return custom;
    const level=Math.max(1,Math.min(83,Number($('#charLevel')?.value||83)));
    const klass=$('#charClass')?.value||'Warrior';
    return `${level} ${klass} Karakter`;
  };
  window.updateSellPreview=()=>{
    const item=characterTitle();
    const server=$('#server')?.value||'ZERO';
    const nation=$('#charNation')?.value||'Karus';
    const np=Number($('#charNp')?.value||0);
    const min=$('#min')?.value||'—';
    if($('#previewItem'))$('#previewItem').textContent=item;
    if($('#previewMeta'))$('#previewMeta').textContent=`${server} • ${nation}`;
    if($('#previewNp'))$('#previewNp').textContent=np>0?`${np.toLocaleString('tr-TR')} NP`:'NP belirtilmedi';
    if($('#previewPrice'))$('#previewPrice').textContent=`${min} GB`;
  };
  window.sellSubmit=async e=>{
    e.preventDefault();
    if(!ME){location.href='/login.html';return}
    const level=Math.max(1,Math.min(83,Number($('#charLevel')?.value||83)));
    const klass=$('#charClass')?.value||'Warrior';
    const nation=$('#charNation')?.value||'Karus';
    const np=Math.max(0,Number($('#charNp')?.value||0));
    const itemName=characterTitle();
    const min=Number(String($('#min')?.value||'0').replace(',','.'));
    if(!Number.isFinite(min)||min<=0)return toast('Geçerli minimum GB fiyatı gir.');
    try{
      const wallet=await api('/api/wallet');
      const fee=Number(wallet.nextRequestFeeTry||0);
      if(wallet.monthlyFreeRemaining===0&&fee<=0&&ME.role==='user')return toast('Ücretli talep fiyatı admin tarafından henüz ayarlanmamış.');
      if(fee>0){
        const bal=Number(wallet.balanceTry||0);
        if(bal<fee)return toast(`Bu talep ${fee.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺. Bakiyen yetersiz.`);
        if(!confirm(`Aylık ücretsiz hakkını kullandın. Bu karakter talebi için bakiyenden ${fee.toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺ düşülecek. Devam edilsin mi?`))return;
      }
      const details=[`[KARAKTER / CYPHER RING]`,`Class: ${klass}`,`Level: ${level}`,`Nation: ${nation}`,np>0?`NP: ${np}`:'NP: belirtilmedi',$('#note')?.value.trim()||''].filter(Boolean).join(' | ');
      const d=await api('/api/sale-requests',{method:'POST',body:{itemName,serverCode:$('#server')?.value||'ZERO',quantity:1,minimumGb:min,note:details}});
      toast(Number(d.feeTry||0)>0?'Karakter talebi yayınlandı ve ilan bedeli bakiyenden düşüldü.':'Karakter talebi pazarcılara gönderildi.');
      setTimeout(()=>location.href='/dashboard.html',650);
    }catch(err){
      if(err.data?.error==='listing_fee_balance_insufficient')toast(`Yetersiz bakiye. Gerekli: ${Number(err.data.requiredTry||0).toLocaleString('tr-TR',{minimumFractionDigits:2})} ₺`);
      else toast(err.data?.error||'Karakter talebi oluşturulamadı.');
    }
  };
  setTimeout(window.updateSellPreview,100);
})();
