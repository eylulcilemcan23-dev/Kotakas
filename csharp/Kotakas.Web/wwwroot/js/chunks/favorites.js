(()=>{
  const state={listingIds:new Set(),traderIds:new Set(),data:null};
  const favKey=type=>String(type)==='listing'?state.listingIds:state.traderIds;
  const isFav=(type,id)=>favKey(type).has(String(id));

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
      let a=wrap.querySelector('.favorite-nav-link')||wrap.querySelector('a[href$="favorites.html"]');
      if(!a){
        a=document.createElement('a');a.href='/favorites.html';
        const notif=wrap.querySelector('a[href$="notifications.html"]');wrap.insertBefore(a,notif||wrap.firstChild);
      }
      a.classList.add('favorite-nav-link');
      a.innerHTML=`❤ Favoriler <span class="notif-badge favorite-count">${Number(total||0)>0?Number(total):''}</span>`;
    });
    $$('.favorite-count').forEach(x=>x.textContent=Number(total||0)>0?String(total):'');
    const mobile=$('#mobileNav');
    if(mobile&&!mobile.querySelector('a[href$="favorites.html"]')){
      const a=document.createElement('a');a.href='/favorites.html';a.className='favorite-mobile-link';a.textContent='❤ Favorilerim';
      const account=mobile.querySelector('a[href$="dashboard.html"]');mobile.insertBefore(a,account||null);
    }
    if(location.pathname.endsWith('/dashboard.html')){
      const actions=$('.v5-head .head-actions');
      if(actions){
        let a=actions.querySelector('.dashboard-favorites');
        if(!a){a=document.createElement('a');a.href='/favorites.html';a.className='btn ghost dashboard-favorites';actions.prepend(a)}
        a.textContent=`❤ Favoriler (${Number(total||0)})`;
      }
    }
  }

  window.toggleFavorite=async(type,id,button)=>{
    if(!ME){location.href='/login.html';return}
    type=String(type);id=String(id);const active=isFav(type,id);
    if(button)button.disabled=true;
    try{
      await api(`/api/favorites/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,{method:active?'DELETE':'POST'});
      if(active)favKey(type).delete(id);else favKey(type).add(id);
      const total=state.listingIds.size+state.traderIds.size;updateFavoriteNav(total);
      syncFavoriteButtons(type,id);
      if(location.pathname.endsWith('/favorites.html'))await renderFavorites();
      toast(active?'Favorilerden çıkarıldı.':'Favorilere eklendi.');
    }catch(err){
      const map={cannot_favorite_own_listing:'Kendi ilanını favorileyemezsin.',cannot_favorite_self:'Kendini favorileyemezsin.',invalid_favorite_target:'Favori hedefi geçersiz.',invalid_listing:'İlan bulunamadı.'};
      toast(map[err.data?.error]||'Favori işlemi yapılamadı.');
    }finally{if(button)button.disabled=false}
  };

  function syncFavoriteButtons(type,id){
    const active=isFav(type,id),safeType=window.CSS?.escape?CSS.escape(String(type)):String(type),safeId=window.CSS?.escape?CSS.escape(String(id)):String(id);
    $$(`[data-favorite-type="${safeType}"][data-favorite-id="${safeId}"]`).forEach(btn=>{
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

  window.favoriteBuy=(id,stock,itemEncoded,price)=>buyListing(Number(id),Number(stock),decodeURIComponent(itemEncoded),Number(price));
  window.showFavoriteTraderListings=async(idEncoded,nameEncoded)=>{
    const id=decodeURIComponent(idEncoded),name=decodeURIComponent(nameEncoded);
    try{
      const d=await api('/api/listings'),rows=(d.listings||[]).filter(x=>x.sellerUserId===id),box=$('#favoriteListings');
      if(!box)return;if(!rows.length){toast(`${name} için aktif SELL ilanı yok.`);return}
      box.innerHTML=rows.map(x=>favoriteListingHtml({...x,missing:false,rating:0,reviews:0})).join('');
      toast(`${name} aktif ilanları gösteriliyor.`);
    }catch{toast('Pazarcı ilanları yüklenemedi.')}
  };

  function favoriteListingHtml(x){
    const id=Number(x.id||0);
    if(x.missing)return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName||'İlan artık mevcut değil')}</div><div class="meta">Bu kayıt artık bulunamıyor.</div></div><div class="spacer"></div><button class="btn sm ghost" data-favorite-type="listing" data-favorite-id="${id}" onclick="toggleFavorite('listing','${id}',this)">♥ Favoriden Çıkar</button></div></div>`;
    const active=x.status==='active'&&Number(x.stock)>0,stars=Number(x.rating||0)>0?`⭐ ${Number(x.rating).toFixed(1)} (${x.reviews||0})`:'Henüz puan yok',liked=isFav('listing',id),encodedItem=encodeURIComponent(String(x.itemName||''));
    return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${esc(x.sellerName)} • ${stars}</div></div><div class="spacer"></div><span class="pill ${active?'green':'red'}">${active?'AKTİF':esc(x.status||'PASİF')}</span></div><div class="actions"><span class="pill gold">${fmtGB(x.priceGb)} • Stok ${Number(x.stock||0)}</span>${active?`<button class="btn sm teal" onclick="favoriteBuy(${id},${Number(x.stock)},'${encodedItem}',${Number(x.priceGb)})">Satın Al</button>`:''}<button class="btn sm ${liked?'teal':'ghost'}" data-favorite-type="listing" data-favorite-id="${id}" onclick="toggleFavorite('listing','${id}',this)">${liked?'♥ Favoride':'♡ Favoriye Al'}</button></div></div>`;
  }

  function favoriteTraderHtml(t){
    const id=String(t.id||''),idEncoded=encodeURIComponent(id),nameEncoded=encodeURIComponent(String(t.displayName||''));
    if(t.missing)return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">🏪</div><div style="flex:1"><strong>${esc(t.displayName)}</strong><span>Bu pazarcı artık mevcut değil.</span><div class="actions" style="margin-top:8px"><button class="btn sm ghost" data-favorite-type="trader" data-favorite-id="${esc(id)}" onclick="toggleFavorite('trader','${esc(id)}',this)">★ Takipten Çıkar</button></div></div></div>`;
    const active=t.accountStatus==='active'&&t.verifiedTrader,rating=Number(t.rating||0)>0?`⭐ ${Number(t.rating).toFixed(1)} • ${t.reviews||0} yorum`:'Henüz puan yok';
    return `<div class="v5-mini" style="align-items:flex-start"><div class="micon">🏪</div><div style="flex:1"><strong>${esc(t.displayName)} ${active?'✓':''}</strong><span>${rating} • ${t.completedDeals||0} tamamlanan işlem</span><div class="actions" style="margin-top:8px"><button class="btn sm teal" onclick="showFavoriteTraderListings('${idEncoded}','${nameEncoded}')">Aktif İlanları</button><button class="btn sm ghost" data-favorite-type="trader" data-favorite-id="${esc(id)}" onclick="toggleFavorite('trader','${esc(id)}',this)">★ Takipten Çıkar</button></div></div></div>`;
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
