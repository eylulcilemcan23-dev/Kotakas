(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/trader-profile.html'))return;

  const qs=new URLSearchParams(location.search),traderId=qs.get('id')||'';
  const fmtHours=v=>v==null?'—':(Number(v)<24?`${Number(v).toFixed(1)} sa`:`${(Number(v)/24).toFixed(1)} gün`);
  const fmtPct=v=>v==null?'—':`%${Number(v).toFixed(1)}`;

  function badgeHtml(b){return `<span class="pill ${b.code==='verified_trader'||b.code==='verified_account'?'green':b.code.includes('rating')?'gold':'purple'}">${esc(b.icon||'')} ${esc(b.label||'')}</span>`}
  function listingHtml(x){return `<div class="listitem tp-listing" data-id="${Number(x.id)}" data-stock="${Number(x.stock||0)}" data-price="${Number(x.priceGb||0)}" data-name="${encodeURIComponent(x.itemName||'')}"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • Stok ${Number(x.stock||0)} • ${formatDate(x.createdAt)}</div></div><div class="spacer"></div><span class="pill gold">${fmtGB(x.priceGb)}</span></div><div class="actions"><button class="btn sm teal tp-buy">Satın Al</button><button class="btn sm ghost tp-fav">♡ Favoriye Al</button></div></div>`}
  function reviewHtml(x){return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${'★'.repeat(Number(x.stars||0))}${'☆'.repeat(Math.max(0,5-Number(x.stars||0)))} • ${esc(x.reviewer||'Kullanıcı')}</div><div class="meta">İşlem #${Number(x.dealId)} • ${formatDate(x.createdAt)}</div></div></div>${x.comment?`<div class="notice" style="margin-top:8px">${esc(x.comment)}</div>`:''}</div>`}

  async function loadProfile(){
    if(!traderId){$('#tpName').textContent='Pazarcı bulunamadı';return}
    try{
      if(!ME)await loadMe();updateNav();
      const d=await api(`/api/trader-profiles/${encodeURIComponent(traderId)}`),t=d.trader||{};
      document.title=`${t.displayName||'Pazarcı'} • KOTAKAS`;
      $('#tpName').textContent=t.displayName||'Pazarcı';
      $('#tpSince').textContent=`KOTAKAS'a katılım: ${formatDate(t.createdAt)} • Profil istatistikleri gerçek işlemlerden hesaplanır.`;
      $('#tpBadges').innerHTML=(t.badges||[]).map(badgeHtml).join('')||'<span class="pill purple">Yeni Pazarcı</span>';
      $('#tpRating').textContent=Number(t.rating||0)>0?Number(t.rating).toFixed(2):'—';
      $('#tpReviewCount').textContent=`${Number(t.reviewCount||0)} değerlendirme`;
      $('#tpCompleted').textContent=Number(t.completedDeals||0);
      $('#tpSuccess').textContent=fmtPct(t.successRate);
      $('#tpSpeed').textContent=fmtHours(t.averageCompletionHours);
      $('#tpFollowers').textContent=`${Number(t.followerCount||0)} takipçi`;
      $('#tpActiveListings').textContent=`${Number(t.activeListings||0)} aktif ilan`;
      $('#tpListingMeta').textContent=`${Number(t.activeListings||0)} aktif SELL ilanı • Stok ve fiyat bilgisi canlıdır.`;
      $('#tpVerification').textContent=t.userVerified?'Hesap + Pazarcı doğrulandı':'Pazarcı doğrulandı';

      const dist=d.ratingDistribution||{};
      $('#tpDistribution').innerHTML=[5,4,3,2,1].map(star=>`<div class="v5-mini"><div class="micon">${star}★</div><div><strong>${Number(dist[star]??dist[String(star)]??0)} değerlendirme</strong><span>${Number(t.reviewCount||0)>0?`Toplamın %${Math.round(Number(dist[star]??dist[String(star)]??0)*100/Number(t.reviewCount||1))}`:'Henüz değerlendirme yok'}</span></div></div>`).join('');
      $('#tpListings').innerHTML=(d.listings||[]).length?(d.listings||[]).map(listingHtml).join(''):'<div class="empty">Bu pazarcının şu an aktif SELL ilanı yok.</div>';
      $('#tpReviews').innerHTML=(d.reviews||[]).length?(d.reviews||[]).map(reviewHtml).join(''):'<div class="empty">Henüz tamamlanmış işlem değerlendirmesi yok.</div>';

      let favState=false,listingFavIds=new Set();
      if(ME){try{const fd=await api('/api/favorites/');favState=(fd.traderIds||[]).map(String).includes(String(traderId));listingFavIds=new Set((fd.listingIds||[]).map(String))}catch{}}
      const actions=$('#tpActions');actions.innerHTML='';
      if(ME&&ME.id!==traderId){
        const fav=document.createElement('button');fav.className=`btn ${favState?'teal':'ghost'}`;fav.textContent=favState?'★ Pazarcı Takipte':'☆ Pazarcıyı Takip Et';fav.dataset.favoriteType='trader';fav.dataset.favoriteId=traderId;fav.onclick=()=>toggleFavorite('trader',traderId,fav);actions.append(fav);
        const report=document.createElement('button');report.className='btn ghost';report.textContent='⚠ Şikâyet Et';report.onclick=()=>openReport('trader',traderId,t.displayName||'Pazarcı');actions.append(report);
      }else if(ME&&ME.id===traderId){
        const manage=document.createElement('a');manage.href='/trader.html';manage.className='btn teal';manage.textContent='🛍️ İlanlarımı Yönet';actions.append(manage);
      }else{
        const login=document.createElement('a');login.href='/login.html';login.className='btn teal';login.textContent='Giriş Yap ve Takip Et';actions.append(login);
      }

      $$('.tp-listing').forEach(card=>{
        const id=Number(card.dataset.id),stock=Number(card.dataset.stock),price=Number(card.dataset.price),name=decodeURIComponent(card.dataset.name||'');
        const buy=card.querySelector('.tp-buy'),fav=card.querySelector('.tp-fav');
        if(ME&&ME.id===traderId){if(buy)buy.remove();if(fav)fav.remove();const a=document.createElement('a');a.href='/trader.html';a.className='btn sm ghost';a.textContent='İlanı Yönet';card.querySelector('.actions')?.append(a);return}
        buy?.addEventListener('click',()=>{if(!ME){location.href='/login.html';return}if(typeof window.buyListing==='function')window.buyListing(id,stock,name,price);else location.href='/buy.html'});
        if(fav){const active=listingFavIds.has(String(id));fav.dataset.favoriteType='listing';fav.dataset.favoriteId=String(id);fav.textContent=active?'♥ Favoride':'♡ Favoriye Al';fav.classList.toggle('teal',active);fav.classList.toggle('ghost',!active);fav.addEventListener('click',()=>toggleFavorite('listing',id,fav))}
      });
    }catch{
      $('#tpName').textContent='Pazarcı bulunamadı';
      $('#tpListings').innerHTML='<div class="empty">Bu profil aktif değil veya mevcut değil.</div>';
    }
  }
  loadProfile();
})();
