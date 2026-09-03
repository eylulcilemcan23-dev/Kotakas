(()=>{
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLocaleUpperCase('tr-TR');

  function removeMoneyUi(){
    document.querySelectorAll('.v5-walletbar').forEach(x=>x.remove());

    const exact=['BAKİYE YÜKLE','+ BAKİYE EKLE','BAKİYE EKLE','CÜZDAN MERKEZİ','CÜZDAN & HAREKETLER','CÜZDAN VE HAREKETLER'];
    document.querySelectorAll('a,button').forEach(el=>{
      if(exact.includes(norm(el.textContent))) el.remove();
    });

    document.querySelectorAll('div,section,aside').forEach(el=>{
      const text=norm(el.textContent);
      if(!text)return;
      if(text.includes('KOTAKAS BAKİYEM') && el.querySelector('#dashBalance')) el.remove();
      if(text.includes('AYLIK ÜCRETSİZ SATIŞ TALEBİ') && el.querySelector('#dashFreeQuota')) el.remove();
    });

    document.querySelectorAll('.meta,small,span,p').forEach(el=>{
      const text=norm(el.textContent);
      if(text.includes('TL KURU ADMIN TARAFINDAN AYARLANMALI') || text.includes('₺ / ADET')) el.remove();
    });

    if(location.pathname.endsWith('/buy.html')){
      const box=document.getElementById('buyListings');
      if(box && !box.dataset.gbModeLocked){
        box.dataset.gbModeLocked='1';
        box.innerHTML='<div class="empty" style="padding:28px"><strong style="display:block;color:#fff;font-size:18px;margin-bottom:8px">🎮 KOTAKAS Item Mağazası hazırlanıyor</strong><span>Eski TL/bakiye ile item satın alma sistemi kapatıldı. Yeni mağazada yalnızca KOTAKAS stoğundaki itemler GB fiyatıyla yayınlanacak.</span></div>';
      }
    }
  }

  window.sellSubmit=async e=>{
    e?.preventDefault?.();
    if(!window.ME){location.href='/login.html';return;}
    const enhance=window._enhance??8;
    const itemBase=document.getElementById('item')?.value.trim()||'';
    const itemName=/\+\d+$/.test(itemBase)?itemBase:`${itemBase} +${enhance}`;
    const minimumGb=Number(String(document.getElementById('min')?.value||'0').replace(',','.'));
    if(itemBase.length<2 || !minimumGb || minimumGb<=0){window.toast?.('Item adı ve GB fiyatı gerekli.');return;}
    try{
      await window.api('/api/gb-trade/requests',{method:'POST',body:{
        itemName,
        serverCode:document.getElementById('server')?.value||'ZERO',
        quantity:Number(document.getElementById('qty')?.value||1),
        minimumGb,
        note:document.getElementById('note')?.value||''
      }});
      window.toast?.('Item talebin KOTAKAS alım masasına gönderildi.');
      setTimeout(()=>location.href='/dashboard.html',500);
    }catch(err){
      window.toast?.(err?.data?.error||'Item talebi gönderilemedi.');
    }
  };

  window.acceptOffer=async id=>{
    if(!confirm('Bu GB teklifini kabul etmek istiyor musun? Kabulden sonra item teslim aşamasına geçilecek.'))return;
    try{
      const d=await window.api(`/api/gb-trade/offers/${id}/accept`,{method:'POST'});
      window.toast?.('Teklif kabul edildi. Item teslim aşamasına geçildi.');
      setTimeout(()=>location.href=`/deals.html?id=${d.deal.id}`,450);
    }catch(err){
      window.toast?.(err?.data?.error||'Teklif kabul edilemedi.');
    }
  };

  window.buyListing=()=>window.toast?.('Eski TL ile item satın alma kapatıldı. Yeni KOTAKAS GB stok mağazası kuruluyor.');

  removeMoneyUi();
  const observer=new MutationObserver(()=>requestAnimationFrame(removeMoneyUi));
  observer.observe(document.documentElement,{subtree:true,childList:true});
  [100,300,700,1500].forEach(ms=>setTimeout(removeMoneyUi,ms));
})();
