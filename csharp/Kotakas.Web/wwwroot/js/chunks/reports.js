(()=>{
  let current=null;
  const reasons={scam:'Dolandırıcılık şüphesi',contact_bypass:'Site dışına yönlendirme / iletişim paylaşımı',wrong_listing:'Yanlış veya yanıltıcı ilan',harassment:'Taciz / uygunsuz davranış',fake_information:'Sahte bilgi',other:'Diğer'};

  function ensureModal(){
    let modal=$('#reportModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='reportModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox"><div class="modalhead"><div><h3>⚠️ Şikâyet Et</h3><div id="reportTargetLabel" class="meta"></div></div><button class="x" type="button" onclick="closeModal('reportModal')">✕</button></div><form id="reportForm"><div class="field"><label>Neden</label><select id="reportReason">${Object.entries(reasons).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div class="field"><label>Açıklama <span class="meta">(isteğe bağlı, en fazla 500 karakter)</span></label><textarea id="reportDetails" maxlength="500" rows="5" placeholder="Adminin incelemesine yardımcı olacak kısa açıklama..."></textarea></div><div class="notice">Şikâyet doğrudan KOTAKAS moderasyon kuyruğuna gider. Aynı kayıt için açık bir şikâyetin varsa ikinci kez oluşturulmaz.</div><button class="btn red full">Şikâyeti Gönder</button></form></div>`;
    document.body.appendChild(modal);
    $('#reportForm',modal)?.addEventListener('submit',async e=>{
      e.preventDefault();if(!current)return;
      const btn=e.target.querySelector('button');if(btn)btn.disabled=true;
      try{
        await api('/api/reports/',{method:'POST',body:{targetType:current.type,targetId:String(current.id),reasonCode:$('#reportReason')?.value||'other',details:$('#reportDetails')?.value||''}});
        closeModal('reportModal');toast('Şikâyetin moderasyon kuyruğuna gönderildi.');e.target.reset();
      }catch(err){const map={report_already_open:'Bu kayıt için açık bir şikâyetin zaten var.',cannot_report_self:'Kendini şikâyet edemezsin.',invalid_report_target:'Şikâyet hedefi geçersiz.',report_details_too_long:'Açıklama çok uzun.'};toast(map[err.data?.error]||'Şikâyet gönderilemedi.')}finally{if(btn)btn.disabled=false}
    });
    return modal;
  }

  window.openReport=(type,id,label='')=>{
    if(!ME){location.href='/login.html';return}
    current={type:String(type),id:String(id)};const modal=ensureModal();const target=$('#reportTargetLabel',modal);if(target)target.textContent=label||`${type} #${id}`;modal.classList.add('open');
  };

  async function decorateBuy(){
    const box=$('#buyListings');if(!box||!ME)return;let d;try{d=await api('/api/listings')}catch{return}
    const rows=d.listings||[],cards=$$('#buyListings .card');cards.forEach((card,i)=>{const x=rows[i];if(!x||x.sellerUserId===ME.id||card.querySelector('.report-listing-btn'))return;const btn=document.createElement('button');btn.type='button';btn.className='btn sm ghost report-listing-btn';btn.textContent='⚠ Şikâyet Et';btn.onclick=()=>openReport('listing',x.id,x.itemName);const actions=card.querySelector('.favorite-actions')||card.querySelector('.actions');(actions||card).append(btn)})
  }

  async function decorateMarket(){
    const box=$('#marketList');if(!box||!ME)return;let d;try{d=await api('/api/sale-requests')}catch{return}
    const rows=d.requests||[],cards=$$('#marketList .listitem');cards.forEach((card,i)=>{const x=rows[i];if(!x||card.querySelector('.report-request-btn'))return;const wrap=document.createElement('div');wrap.className='actions';const btn=document.createElement('button');btn.type='button';btn.className='btn sm ghost report-request-btn';btn.textContent='⚠ Şikâyet Et';btn.onclick=()=>openReport('sale_request',x.id,x.itemName);wrap.append(btn);card.append(wrap)})
  }

  async function decorateFavorites(){
    if(!location.pathname.toLowerCase().endsWith('/favorites.html')||!ME)return;let d;try{d=await api('/api/favorites/')}catch{return}
    const listingCards=$$('#favoriteListings .listitem');(d.listings||[]).forEach((x,i)=>{const card=listingCards[i];if(!card||x.missing||card.querySelector('.fav-report'))return;const btn=document.createElement('button');btn.className='btn sm ghost fav-report';btn.textContent='⚠ Şikâyet';btn.onclick=()=>openReport('listing',x.id,x.itemName);(card.querySelector('.actions')||card).append(btn)});
    const traderCards=$$('#favoriteTraders .v5-mini');(d.traders||[]).forEach((x,i)=>{const card=traderCards[i];if(!card||x.missing||x.id===ME.id||card.querySelector('.trader-report'))return;const btn=document.createElement('button');btn.className='btn sm ghost trader-report';btn.textContent='⚠ Şikâyet';btn.onclick=()=>openReport('trader',x.id,x.displayName);(card.querySelector('.actions')||card).append(btn)});
  }

  async function boot(){
    if(!ME)await loadMe();if(!ME)return;
    const p=location.pathname.toLowerCase();
    if(p.endsWith('/buy.html')){const b=$('#buyListings');if(b)new MutationObserver(decorateBuy).observe(b,{childList:true});setTimeout(decorateBuy,250)}
    if(p.endsWith('/market.html')){const b=$('#marketList');if(b)new MutationObserver(decorateMarket).observe(b,{childList:true});setTimeout(decorateMarket,250)}
    if(p.endsWith('/favorites.html')){const root=$('.page');if(root)new MutationObserver(decorateFavorites).observe(root,{childList:true,subtree:true});setTimeout(decorateFavorites,350)}
  }
  boot();
})();
