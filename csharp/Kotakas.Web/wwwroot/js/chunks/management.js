(()=>{
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const salePayload=()=>{const enhance=window._enhance??8,itemBase=$('#item')?.value.trim()||'';return{itemName:/\+\d+$/.test(itemBase)?itemBase:`${itemBase} +${enhance}`,serverCode:$('#server')?.value||'ZERO',quantity:Number($('#qty')?.value||1),minimumGb:Number(String($('#min')?.value||'0').replace(',','.')),note:$('#note')?.value||''}};

  async function uploadRequestImage(requestId,file){
    if(!file)return null;
    if(file.size>5*1024*1024)throw Object.assign(new Error('image_too_large'),{data:{error:'image_too_large'}});
    const form=new FormData();form.append('file',file);
    const r=await fetch(`/api/sale-requests/${requestId}/image`,{method:'POST',body:form,credentials:'same-origin'});
    let d={};try{d=await r.json()}catch{}
    if(!r.ok)throw Object.assign(new Error(d.error||`HTTP_${r.status}`),{status:r.status,data:d});
    return d;
  }

  async function finishSaleRequest(d,successText){
    const id=d?.request?.id;
    const file=$('#sellImage')?.files?.[0];
    if(id&&file){
      try{await uploadRequestImage(id,file);toast(successText+' Görsel de yüklendi.')}catch(err){const code=err.data?.error;toast(code==='image_too_large'?successText+' Ancak görsel 5 MB sınırını aştı.':code==='unsupported_image_type'?successText+' Ancak görsel yalnız JPG/PNG/WEBP olabilir.':successText+' Ancak görsel yüklenemedi; panelden tekrar ekleyebilirsin.')}}
    else toast(successText);
    setTimeout(()=>location.href='/dashboard.html',750);
  }

  // payments.js üzerindeki gönderimi genişlet: talep oluştuktan sonra gerçek item görselini yükle.
  window.sellSubmit=async e=>{
    e.preventDefault();if(!ME){location.href='/login.html';return}
    const payload=salePayload();
    try{
      const [wallet,credit,payment]=await Promise.all([api('/api/wallet'),api('/api/payments/paid-listing/status').catch(()=>({availableCredit:false})),api('/api/payments/status').catch(()=>({configured:false}))]);
      const fee=Number(wallet.nextRequestFeeTry||0);
      if((wallet.monthlyFreeRemaining??0)>0||ME.role!=='user'){
        const d=await api('/api/sale-requests',{method:'POST',body:payload});
        return finishSaleRequest(d,Number(d.feeTry||0)>0?'Ücretli talep yayınlandı.':'Talep pazarcılara gönderildi.');
      }
      if(credit.availableCredit){
        const d=await api('/api/payments/paid-listing/create-request',{method:'POST',body:payload});
        return finishSaleRequest(d,'Ödenmiş ilan hakkın kullanıldı ve talep yayınlandı.');
      }
      if(fee<=0)return toast('Ücretli talep fiyatı admin tarafından henüz ayarlanmamış.');
      const bal=Number(wallet.balanceTry||0);
      if(bal>=fee){
        if(!confirm(`Bu talep için bakiyenden ${money(fee)} düşülecek. Devam edilsin mi?`))return;
        const d=await api('/api/sale-requests',{method:'POST',body:payload});
        return finishSaleRequest(d,'Ücretli talep yayınlandı ve ilan bedeli bakiyenden düşüldü.');
      }
      if(payment.configured){toast('Bakiyen yetersiz. Kart ile ücretli ilan hakkı alabilirsin.');return openPaidListingPayment(fee)}
      toast(`Yetersiz bakiye. Gerekli: ${money(fee)}`);
    }catch(err){
      const code=err.data?.error;
      const map={paid_listing_credit_required:'Ödenmiş ilan hakkı bulunamadı.',listing_fee_balance_insufficient:`Yetersiz bakiye. Gerekli: ${money(err.data?.requiredTry)}`,paid_listing_price_not_configured:'Ücretli talep fiyatı henüz ayarlanmamış.',invalid_or_external_contact:'Item/not alanında iletişim bilgisi kullanılamaz.'};
      toast(map[code]||code||'Talep oluşturulamadı.');
    }
  };

  async function requestImage(id){try{return(await api(`/api/sale-requests/${id}/image`)).imageUrl||null}catch{return null}}
  async function attachThumb(card,id){
    if(!card||card.querySelector('.request-thumb'))return;
    const url=await requestImage(id);if(!url)return;
    const img=document.createElement('img');img.className='request-thumb';img.src=url;img.alt='Item ekran görüntüsü';img.loading='lazy';img.style.cssText='width:96px;height:72px;object-fit:cover;border-radius:12px;border:1px solid rgba(255,255,255,.12);margin:10px 0;display:block;cursor:pointer';img.onclick=()=>window.open(url,'_blank','noopener');
    const head=card.querySelector('.itemhead');head?.insertAdjacentElement('afterend',img);
  }

  window.editSaleRequest=async(id)=>{
    try{
      const d=await api('/api/sale-requests/mine'),r=(d.requests||[]).find(x=>Number(x.id)===Number(id));if(!r)return toast('Talep bulunamadı.');
      const item=prompt('Item adı:',r.itemName);if(item===null)return;
      const qtyRaw=prompt('Adet:',r.quantity);if(qtyRaw===null)return;
      const minRaw=prompt('Minimum fiyat (GB):',r.minimumGb);if(minRaw===null)return;
      const note=prompt('Not:',r.note||'');if(note===null)return;
      if((r.offers||[]).some(x=>x.status==='active')&&!confirm('Talebi değiştirmek mevcut aktif teklifleri kapatır. Devam edilsin mi?'))return;
      await api(`/api/sale-requests/${id}`,{method:'PATCH',body:{itemName:item,serverCode:r.serverCode,quantity:Number(qtyRaw),minimumGb:Number(String(minRaw).replace(',','.')),note}});
      toast('Talep güncellendi.');setTimeout(()=>location.reload(),300);
    }catch(err){toast(err.data?.error==='invalid_or_external_contact'?'Bilgileri kontrol et; iletişim bilgisi kullanılamaz.':'Talep güncellenemedi.')}
  };

  window.cancelSaleRequest=async id=>{
    if(!confirm('Bu satış talebini iptal etmek istiyor musun? Ücretsiz hak/ödenmiş ilan bedeli geri verilmez.'))return;
    try{await api(`/api/sale-requests/${id}`,{method:'DELETE'});toast('Talep iptal edildi.');setTimeout(()=>location.reload(),300)}catch(err){toast(err.data?.error==='request_not_open'?'Yalnız açık talepler iptal edilebilir.':'Talep iptal edilemedi.')}
  };

  window.replaceRequestImage=id=>{
    const input=document.createElement('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';
    input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{await uploadRequestImage(id,file);toast('Item görseli güncellendi.');setTimeout(()=>location.reload(),250)}catch(err){toast(err.data?.error==='image_too_large'?'Görsel en fazla 5 MB olabilir.':err.data?.error==='unsupported_image_type'?'Yalnız JPG, PNG veya WEBP yüklenebilir.':'Görsel yüklenemedi.')}};input.click();
  };

  function ensureAccountModal(){
    let modal=$('#accountSettingsModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='accountSettingsModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:560px"><div class="modalhead"><h3>Profil & Güvenlik</h3><button class="x" onclick="closeModal('accountSettingsModal')">✕</button></div><form id="profileNameForm"><div class="field"><label>Görünen ad</label><input id="profileDisplayName" maxlength="40" required></div><button class="btn teal full">Adı Güncelle</button></form><hr style="border:0;border-top:1px solid rgba(255,255,255,.1);margin:20px 0"><form id="profilePasswordForm"><div class="field"><label>Mevcut şifre</label><input name="currentPassword" type="password" autocomplete="current-password" placeholder="Google hesabında boş bırakılabilir"></div><div class="field"><label>Yeni şifre</label><input name="newPassword" type="password" minlength="8" maxlength="128" required autocomplete="new-password"></div><button class="btn ghost full">Şifreyi Değiştir</button></form></div>`;
    document.body.append(modal);
    $('#profileNameForm',modal)?.addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/account/profile',{method:'PATCH',body:{displayName:$('#profileDisplayName').value}});ME=d.user;updateNav();toast('Profil adı güncellendi.');closeModal('accountSettingsModal')}catch{toast('Profil adı güncellenemedi.')}});
    $('#profilePasswordForm',modal)?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/account/password',{method:'POST',body:Object.fromEntries(new FormData(e.target))});e.target.reset();toast('Şifren güncellendi.')}catch(err){const code=err.data?.error;toast(code==='current_password_required'?'Mevcut şifreni gir.':code==='password_change_failed'?'Mevcut şifre hatalı olabilir.':'Şifre değiştirilemedi.')}});
    return modal;
  }
  window.openAccountSettings=()=>{const modal=ensureAccountModal();$('#profileDisplayName').value=ME?.displayName||'';openModal('accountSettingsModal')};

  async function enhanceDashboard(){
    try{
      const d=await api('/api/sale-requests/mine'),rows=d.requests||[],cards=$$('#myRequests .listitem');
      cards.forEach((card,i)=>{const r=rows[i];if(!r)return;attachThumb(card,r.id);if(r.status==='open'&&!card.querySelector('.request-manage')){const actions=document.createElement('div');actions.className='actions request-manage';actions.innerHTML=`<button class="btn sm ghost" onclick="editSaleRequest(${r.id})">✏️ Düzenle</button><button class="btn sm ghost" onclick="replaceRequestImage(${r.id})">📷 Görsel</button><button class="btn sm red" onclick="cancelSaleRequest(${r.id})">İptal Et</button>`;card.append(actions)}});
      const head=$('.v5-head .head-actions');if(head&&!head.querySelector('.account-settings-btn'))head.insertAdjacentHTML('afterbegin','<button class="btn ghost account-settings-btn" onclick="openAccountSettings()">⚙️ Profil / Güvenlik</button>');
    }catch{}
  }

  async function enhanceTrader(){
    try{
      const [rd,ld]=await Promise.all([api('/api/sale-requests'),api('/api/listings/mine')]);
      const reqs=rd.requests||[],cards=$$('#incomingRequests .listitem');cards.forEach((card,i)=>{const r=reqs[i];if(r)attachThumb(card,r.id)});
      const listings=ld.listings||[];let section=$('#myTraderListingsCard');if(!section){section=document.createElement('div');section.id='myTraderListingsCard';section.className='v5-card';section.style.marginTop='14px';const offers=$('#myOffers')?.closest('.v5-card');offers?.parentNode?.insertBefore(section,offers)}
      if(section)section.innerHTML=`<div class="v5-card-head"><div><h3>Satış ilanlarım</h3><p>SELL fiyatı, stok ve yayın durumunu yönet.</p></div><div class="spacer"></div><button class="btn sm teal" onclick="openModal('listingModal')">＋ Yeni İlan</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Item</th><th>Fiyat</th><th>Stok</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${listings.length?listings.map(x=>`<tr><td>${esc(x.itemName)}</td><td>${fmtGB(x.priceGb)}</td><td>${x.stock}</td><td><span class="pill ${x.status==='active'?'green':x.status==='cancelled'?'red':'gold'}">${esc(x.status)}</span></td><td>${x.status!=='cancelled'?`<button class="btn sm ghost" onclick="editTraderListing(${x.id},${Number(x.priceGb)},${Number(x.stock)})">Düzenle</button> <button class="btn sm ghost" onclick="toggleTraderListing(${x.id},'${x.status==='active'?'paused':'active'}')">${x.status==='active'?'Duraklat':'Yayınla'}</button> <button class="btn sm red" onclick="cancelTraderListing(${x.id})">Kaldır</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="5">Henüz satış ilanı yok.</td></tr>'}</tbody></table></div>`;
      const head=$('.v5-head .head-actions');if(head&&!head.querySelector('.account-settings-btn'))head.insertAdjacentHTML('afterbegin','<button class="btn ghost account-settings-btn" onclick="openAccountSettings()">⚙️ Profil / Güvenlik</button>');
    }catch{}
  }

  window.editTraderListing=async(id,price,stock)=>{const p=prompt('Yeni SELL fiyatı (GB):',price);if(p===null)return;const s=prompt('Yeni stok:',stock);if(s===null)return;try{await api(`/api/listings/${id}`,{method:'PATCH',body:{priceGb:Number(String(p).replace(',','.')),stock:Number(s)}});toast('İlan güncellendi.');setTimeout(()=>location.reload(),250)}catch{toast('İlan güncellenemedi.')}};
  window.toggleTraderListing=async(id,status)=>{try{await api(`/api/listings/${id}`,{method:'PATCH',body:{status}});toast(status==='active'?'İlan yeniden yayında.':'İlan duraklatıldı.');setTimeout(()=>location.reload(),250)}catch{toast('İlan durumu değiştirilemedi.')}};
  window.cancelTraderListing=async id=>{if(!confirm('Bu SELL ilanını kaldırmak istiyor musun? Mevcut başlamış anlaşmalar etkilenmez.'))return;try{await api(`/api/listings/${id}`,{method:'DELETE'});toast('İlan kaldırıldı.');setTimeout(()=>location.reload(),250)}catch{toast('İlan kaldırılamadı.')}};

  async function enhanceMarket(){try{const d=await api('/api/sale-requests'),rows=d.requests||[],cards=$$('#marketList .listitem');cards.forEach((card,i)=>{const r=rows[i];if(r)attachThumb(card,r.id)})}catch{}}
  async function enhanceHome(){try{const d=await api('/api/sale-requests'),rows=(d.requests||[]).slice(0,4),cards=$$('#homeRequests .listitem');cards.forEach((card,i)=>{const r=rows[i];if(r)attachThumb(card,r.id)})}catch{}}

  const baseDashboard=typeof renderDashboard==='function'?renderDashboard:null;if(baseDashboard)renderDashboard=async function(){await baseDashboard();await enhanceDashboard()};
  const baseTrader=typeof renderTrader==='function'?renderTrader:null;if(baseTrader)renderTrader=async function(){await baseTrader();await enhanceTrader()};
  const baseMarket=typeof renderMarket==='function'?renderMarket:null;if(baseMarket)renderMarket=async function(){await baseMarket();setTimeout(enhanceMarket,120)};
  const baseHome=typeof renderHome==='function'?renderHome:null;if(baseHome)renderHome=async function(){await baseHome();await enhanceHome()};

  if(location.pathname.toLowerCase().endsWith('/sell.html')){
    const help=$('.uploadbox span');if(help)help.textContent='(JPG, PNG veya WEBP • en fazla 5 MB)';
    const input=$('#sellImage');if(input)input.accept='image/jpeg,image/png,image/webp';
  }
})();
