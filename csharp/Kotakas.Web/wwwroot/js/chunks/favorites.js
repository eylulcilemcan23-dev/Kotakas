(()=>{
  const state={listingIds:new Set(),traderIds:new Set(),data:null};
  const favKey=(type,id)=>String(type)==='listing'?state.listingIds:state.traderIds;
  const isFav=(type,id)=>favKey(type,id).has(String(id));

  async function loadFavoriteState(){
    if(!ME)return null;
    try{
      const d=await api('/api/favorites/');
      state.data=d;
      state.listingIds=new Set((d.listingIds||[]).map(String));
      state.traderIds=new Set((d.traderIds||[]).map(String));
      updateFavoriteNav(d.total||0);
      return d;
    }catch{return null}
  }

  function updateFavoriteNav(total){
    if(!ME)return;
    $$('[data-auth]').forEach(wrap=>{
      if(wrap.querySelector('.favorite-nav-link'))return;
      const a=document.createElement('a');
      a.href='/favorites.html';a.className='favorite-nav-link';
      a.innerHTML=`❤ Favoriler <span class="notif-badge favorite-count">${Number(total||0)||''}</span>`;
      const notif=wrap.querySelector('a[href$="notifications.html"]');
      wrap.insertBefore(a,notif||wrap.firstChild);
    });
    $$('.favorite-count').forEach(x=>x.textContent=Number(total||0)>0?String(total):'');
    const mobile=$('#mobileNav');
    if(mobile&&!mobile.querySelector('.favorite-mobile-link')){
      const a=document.createElement('a');a.href='/favorites.html';a.className='favorite-mobile-link';a.textContent='❤ Favorilerim';
      const account=mobile.querySelector('a[href$="dashboard.html"]');mobile.insertBefore(a,account||null);
    }
    if(location.pathname.endsWith('/dashboard.html')){
      const actions=$('.v5-head .head-actions');
      if(actions&&!actions.querySelector('.dashboard-favorites')){
        const a=document.createElement('a');a.href='/favorites.html';a.className='btn ghost dashboard-favorites';a.textContent=`❤ Favoriler (${Number(total||0)})`;actions.prepend(a);
      }
    }
  }

  window.toggleFavorite=async(type,id,button)=>{
    if(!ME){location.href='/login.html';return}
    type=String(type);id=String(id);const active=isFav(type,id);
    if(button)button.disabled=true;
    try{
      await api(`/api/favorites/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,{method:active?'DELETE':'POST'});
      if(active)favKey(type,id).delete(id);else favKey(type,id).add(id);
      const total=state.listingIds.size+state.traderIds.size;updateFavoriteNav(total);
      syncFavoriteButtons(type,id);
      if(location.pathname.endsWith('/favorites.html'))await renderFavorites();
      toast(active?'Favorilerden çıkarıldı.':'Favorilere eklendi.');
    }catch(err){
      const map={cannot_favorite_own_listing:'Kendi ilanını favorileyemezsin.',cannot_favorite_self:'Kendini favorileyemezsin.',invalid_favorite_target:'Favori hedefi geçersiz.'};
      toast(map[err.data?.error]||'Favori işlemi yapılamadı.');
    }finally{if(button)button.disabled=false}
  };

  function syncFavoriteButtons(type,id){
    const active=isFav(type,id);
    $$(`[data-favorite-type="${CSS.escape(String(type))}"][data-favorite-id="${CSS.escape(String(id))}"]`).forEach(btn=>{
      btn.classList.toggle('teal',active);btn.classList.toggle('ghost',!active);
      if(type==='listing')btn.textContent=active?'♥ Favoride':'♡ Favoriye Al';
      else btn.textContent=active?'★ Pazarcı Takipte':'☆ Pazarcıyı Takip Et';
    });
  }

  async function decorateBuyListings(){
    const box=$('#buyListings');if(!box)return;
    let listingData;try{listingData=await api('/api/listings')}catch{return}
    const rows=listingData.listings||[],cards=$$('#buyListings .card');
    cards.forEach((card,i)=>{
      const x=rows[i];if(!x||card.dataset.favoriteDecorated==='1')return;
      card.dataset.favoriteDecorated='1';card.dataset.listingId=String(x.id);
      const controls=document.createElement('div');controls.className='actions favorite-actions';controls.style.margin='10px 0';
      const listingBtn=document.createElement('button');listingBtn.type='button';listingBtn.className=`btn sm ${isFav('listing',x.id)?'teal':'ghost'}`;listingBtn.dataset.favoriteType='listing';listingBtn.dataset.favoriteId=String(x.id);listingBtn.textContent=isFav('listing',x.id)?'♥ Favoride':'♡ Favoriye Al';listingBtn.onclick=()=>toggleFavorite('listing',x.id,listingBtn);controls.appendChild(listingBtn);
      if(ME&&ME.id!==x.sellerUserId){const traderBtn=document.createElement('button');traderBtn.type='button';traderBtn.className=`btn sm ${isFav('trader',x.sellerUserId)?'teal':'ghost'}`;traderBtn.dataset.favoriteType='trader';traderBtn.dataset.favoriteId=String(x.sellerUserId);traderBtn.textContent=isFav('trader',x.sellerUserId)?'★ Pazarcı Takipte':'☆ Pazarcıyı Takip Et';traderBtn.onclick=()=>toggleFavorite('trader',x.sellerUserId,traderBtn);controls.appendChild(traderBtn)}
      const head=card.querySelector('.itemhead');head?.insertAdjacentElement('afterend',controls);
    });
  }

  async function decorateHomeTraders(){
    const box=$('#traderShowcase');if(!box||!ME)return;
    let d;try{d=await api('/api/traders')}catch{return}
    const rows=d.traders||[],cards=$$('#traderShowcase .trader-mini');
    cards.forEach((card,i)=>{
      const t=rows[i];if(!t||card.dataset.favoriteDecorated==='1'||t.id===ME.id)return;
      card.dataset.favoriteDecorated='1';
      const btn=document.createElement('button');btn.type='button';btn.className=`btn sm ${isFav('trader',t.id)?'teal':'ghost'}`;btn.style.marginLeft='auto';btn.dataset.favoriteType='trader';btn.dataset.favoriteId=String(t.id);btn.textContent=isFav('trader',t.id)?'★ Takipte':'☆ Takip Et';btn.onclick=()=>toggleFavorite('trader',t.id,btn);card.appendChild(btn);
    });
  }

  window.showFavoriteTraderListings=async(id,name)=>{
    try{
      const d=await api('/api/listings'),rows=(d.listings||[]).filter(x=>x.sellerUserId===id),box=$('#favoriteListings');
      if(!box)return;if(!rows.length){toast(`${name} için aktif SELL ilanı yok.`);return}
      box.innerHTML=rows.map(x=>favoriteListingHtml({...x,missing:false,rating:0,reviews:0})).join('');
      toast(`${name} aktif ilanları gösteriliyor.`);
    }catch{toast('Pazarcı ilanları yüklenemedi.')}
  };

  function favoriteListingHtml(x){
    if(x.missing)return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName||'İlan artık mevcut değil')}</div><div class="meta">Bu kayıt artık bulunamıyor.</div></div><div class="spacer"></div><button class="btn sm ghost" data-favorite-type="listing" data-favorite-id="${x.id||0}" onclick="toggleFavorite('listing','${x.id||0}',this)">Favoriden Çıkar</button></div></div>`;
    const active=x.status==='active'&&Number(x.stock)>0,stars=Number(x.rating||0)>0?`⭐ ${Number(x.rating).toFixed(1)} (${x.reviews||0})`:'Henüz puan yok';
    return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${esc(x.sellerName)} • ${stars}</div></div><div class="spacer"></div><span class="pill ${active?'green':'red'}">${active?'AKTİF':esc(x.status||'PASİF')}</span></div><div class="actions"><span class="pill gold">${fmtGB(x.priceGb)} • Stok ${Number(x.stock||0)}</span>${active?`<button class="btn sm teal" onclick="buyListing(${Number(x.id)},${Number(x.stock)},'${esc(x.itemName).replaceAll("'","\\'")}',${Number(x.priceGb)})">Satın Al</button>`:''}<button class="btn sm ghost" data-favorite-type="listing" data-favorite-id="${x.id}" onclick="toggleFavorite('listing','${x.id}',this)">♥ Favoriden Çıkar</button></div></div>`;
  }

  function favoriteTraderHtml(t){
    if(t.missing)return `<div class="v5-mini"><div class="micon">🏪</div><div><strong>${esc(t.displayName)}</strong><span>Bu pazarcı artık mevcut değil.</span></div></div>`;
    const active=t.accountStatus==='active'&&t.verifiedTrader,rating=Number(t.rating||0)>0?`⭐ ${Number(t.rating).toFixed(1)} • ${t.reviews||0} yorum`:'Henüz puan yok';
    return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">🏪</div><div style="flex:1"><strong>${esc(t.displayName)} ${active?'✓':''}</strong><span>${rating} • ${t.completedDeals||0} tamamlanan işlem</span><div class="actions" style="margin-top:8px"><button class="btn sm teal" onclick="showFavoriteTraderListings('${esc(t.id).replaceAll("'","\\'")}','${esc(t.displayName).replaceAll("'","\\'")}')">Aktif İlanları</button><button class="btn sm ghost" data-favorite-type="trader" data-favorite-id="${esc(t.id)}" onclick="toggleFavorite('trader','${esc(t.id).replaceAll("'","\\'")}',this)">★ Takipten Çıkar</button></div></div></div>`;
  }

  window.renderFavorites=async()=>{
    if(!ME){location.href='/login.html';return}
    const d=await loadFavoriteState();if(!d)return;
    if($('#favListingCount'))$('#favListingCount').textContent=(d.listings||[]).length;
    if($('#favTraderCount'))$('#favTraderCount').textContent=(d.traders||[]).length;
    if($('#favoriteListings'))$('#favoriteListings').innerHTML=(d.listings||[]).length?(d.listings||[]).map(favoriteListingHtml).join(''):'<div class="empty">Henüz favori SELL ilanın yok. Item Al sayfasından ❤ ile ekleyebilirsin.</div>';
    if($('#favoriteTraders'))$('#favoriteTraders').innerHTML=(d.traders||[]).length?(d.traders||[]).map(favoriteTraderHtml).join(''):'<div class="empty">Henüz favori pazarcın yok.</div>';
  };

  async function bootFavorites(){
    if(!ME)await loadMe();updateNav();
    if(!ME)return;
    await loadFavoriteState();
    const p=location.pathname.toLowerCase();
    if(p.endsWith('/favorites.html'))await renderFavorites();
    if(p.endsWith('/buy.html')){
      const box=$('#buyListings');if(box){new MutationObserver(()=>decorateBuyListings()).observe(box,{childList:true});setTimeout(decorateBuyListings,80);setTimeout(decorateBuyListings,350)}
    }
    if(p==='/'||p.endsWith('/index.html')){
      const box=$('#traderShowcase');if(box){new MutationObserver(()=>decorateHomeTraders()).observe(box,{childList:true});setTimeout(decorateHomeTraders,100);setTimeout(decorateHomeTraders,350)}
    }
  }
  bootFavorites();
})();
