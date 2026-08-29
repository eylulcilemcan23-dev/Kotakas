(()=>{
  async function loadPrefs(){
    if(!location.pathname.toLowerCase().endsWith('/notifications.html'))return;
    if(!ME)await loadMe();if(!ME)return;
    try{
      const d=await api('/api/notification-preferences'),p=d.preferences||{};
      const set=(id,v)=>{const e=$(id);if(e)e.checked=!!v};
      set('#prefOffers',p.offersEnabled);set('#prefDeals',p.dealsEnabled);set('#prefFavorites',p.favoritesEnabled);set('#prefItemWatches',p.itemWatchesEnabled);set('#prefMarketplace',p.marketplaceEnabled);
    }catch{}
    $('#notificationPreferenceForm')?.addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        await api('/api/notification-preferences',{method:'PUT',body:{
          offersEnabled:$('#prefOffers')?.checked??true,
          dealsEnabled:$('#prefDeals')?.checked??true,
          favoritesEnabled:$('#prefFavorites')?.checked??true,
          itemWatchesEnabled:$('#prefItemWatches')?.checked??true,
          marketplaceEnabled:$('#prefMarketplace')?.checked??true
        }});
        toast('Bildirim tercihlerin kaydedildi.');
        if(typeof renderNotifications==='function')await renderNotifications();
      }catch{toast('Bildirim tercihleri kaydedilemedi.')}
    });
  }
  setTimeout(loadPrefs,120);
})();
