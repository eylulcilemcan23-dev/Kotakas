(()=>{
  const path=location.pathname.toLowerCase();
  let myPresence=null;
  const baseOpenOffer=window.openOffer;

  const fmtResponse=min=>{
    if(min==null||!Number.isFinite(Number(min)))return 'Henüz ölçülmedi';
    const n=Number(min);if(n<1)return '<1 dk';if(n<60)return `${Math.round(n)} dk`;if(n<1440)return `${(n/60).toFixed(1)} saat`;return `${(n/1440).toFixed(1)} gün`;
  };
  const relSeen=(last,online=false)=>{
    if(online)return 'Şu an online';
    if(!last)return 'Henüz görülmedi';
    const diff=Math.max(0,Date.now()-new Date(last).getTime()),m=Math.floor(diff/60000);
    if(m<2)return 'Az önce görüldü';if(m<60)return `${m} dk önce görüldü`;const h=Math.floor(m/60);if(h<24)return `${h} sa önce görüldü`;const d=Math.floor(h/24);return `${d} gün önce görüldü`;
  };
  const initials=name=>String(name||'P').split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase();

  async function heartbeat(){
    if(!ME)return;
    try{await api('/api/presence/heartbeat',{method:'POST'})}catch{}
  }

  function applyOfferAvailability(){
    if(!path.endsWith('/trader.html')||!myPresence)return;
    const enabled=!!myPresence.traderAcceptingOffers;
    const toggle=$('#onlineToggle');if(toggle)toggle.classList.toggle('on',enabled);
    const text=$('#onlineText');if(text)text.textContent=enabled?'Teklif almaya açıksın':'Teklif almaya kapalısın';
    const sub=$('.trader-toolbar div:nth-child(2) span');if(sub)sub.textContent=enabled?'Yeni satış talepleri geldiğinde bildirim alırsın.':'Yeni satış talebi bildirimi almazsın ve teklif endpointi kilitlidir.';
    $$('#incomingRequests button').forEach(btn=>{
      if(!btn.dataset.realOfferLabel)btn.dataset.realOfferLabel=btn.textContent||'Teklif Ver';
      btn.disabled=!enabled;
      btn.textContent=enabled?btn.dataset.realOfferLabel:'Teklifler Kapalı';
    });
  }

  window.toggleTraderOnline=async()=>{
    if(!ME)return;
    const next=!(myPresence?.traderAcceptingOffers??true);
    try{
      myPresence=await api('/api/trader/presence',{method:'PUT',body:{acceptingOffers:next}});
      applyOfferAvailability();
      toast(next?'Teklif almaya açıldın.':'Teklif alımı kapatıldı. Yeni talep bildirimi gelmeyecek.');
    }catch{toast('Pazarcı durumu güncellenemedi.')}
  };

  if(typeof baseOpenOffer==='function'){
    window.openOffer=function(...args){
      if(path.endsWith('/trader.html')&&myPresence&&!myPresence.traderAcceptingOffers){toast('Önce teklif alımını aç.');return}
      return baseOpenOffer(...args);
    };
  }

  async function renderTraderPanelRealtime(){
    if(!path.endsWith('/trader.html')||!ME||!(ME.role==='trader'||String(ME.role).startsWith('admin_')))return;
    try{
      const [presence,profile]=await Promise.all([api('/api/trader/presence'),api(`/api/trader-profiles/${encodeURIComponent(ME.id)}`)]);
      myPresence=presence;const t=profile.trader||{};
      applyOfferAvailability();
      const pspan=$('.v5-profilebar div:nth-child(2) span');
      if(pspan)pspan.textContent=`${t.online?'🟢 Online':'⚫ '+relSeen(t.lastSeenAt,false)} • ⭐ ${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'—'} • ${Number(t.completedDeals||0)} işlem • Cevap ${fmtResponse(t.averageResponseMinutes)}`;
      const status=$('.v5-profilebar .v5-status');if(status){status.textContent=t.online?'● ONLINE':'○ OFFLINE';status.classList.toggle('online',!!t.online)}
      $$('.v5-mini').forEach(card=>{
        const label=card.querySelector('span')?.textContent||'',strong=card.querySelector('strong');if(!strong)return;
        if(label.includes('Pazarcı puanı'))strong.textContent=Number(t.rating||0)>0?`${Number(t.rating).toFixed(1)} / 5.0`:'Henüz puan yok';
        if(label.includes('Ortalama cevap')||label.includes('Cevap süresi')){strong.textContent=fmtResponse(t.averageResponseMinutes);card.querySelector('span').textContent=`${Number(t.responseSamples||0)} gerçek ilk teklif örneği`;}
        if(label.includes('Başarılı işlem oranı')||label.includes('Tamamlanan gerçek işlem')){strong.textContent=t.successRate==null?'—':`%${Number(t.successRate).toFixed(1)}`;card.querySelector('span').textContent=`${Number(t.completedDeals||0)} tamamlanan işlem`;}
      });
      const perf=$$('.v5-card').find(x=>x.querySelector('h3')?.textContent?.includes('Performans'));
      if(perf&&!perf.querySelector('.real-score-row')){
        const list=perf.querySelector('.v5-mini-list');if(list){const row=document.createElement('div');row.className='v5-mini real-score-row';row.innerHTML=`<div class="micon">🏆</div><div><strong>${Number(t.kotakasScore||0).toFixed(1)} / 100</strong><span>KOTAKAS güven skoru</span></div>`;list.prepend(row)}
      }
      const incoming=$('#incomingRequests');if(incoming&&!incoming.dataset.availabilityObserved){incoming.dataset.availabilityObserved='1';new MutationObserver(applyOfferAvailability).observe(incoming,{childList:true,subtree:true})}
    }catch{}
  }

  async function renderFeaturedTraders(){
    if(!(path==='/'||path.endsWith('/index.html')))return;
    const box=$('#traderShowcase');if(!box)return;
    try{
      const d=await api('/api/traders/featured?limit=8'),rows=d.traders||[];
      box.innerHTML=rows.length?rows.map(t=>`<div class="trader-mini"><div class="avatar">${esc(initials(t.displayName))}</div><div style="min-width:0;flex:1"><strong>#${Number(t.rank)} ${esc(t.displayName)} ✓</strong><span>${t.online?'🟢 Online':`⚫ ${esc(relSeen(t.lastSeenAt,false))}`} • ${t.acceptingOffers?'Teklif açık':'Teklif kapalı'}</span><div class="meta">🏆 ${Number(t.score||0).toFixed(1)} skor • ⭐ ${Number(t.rating||0)>0?Number(t.rating).toFixed(1):'—'} • ${Number(t.completedDeals||0)} işlem • ⚡ ${esc(fmtResponse(t.averageResponseMinutes))}</div><div class="actions" style="margin-top:7px"><a class="btn sm ghost trader-profile-link" href="/trader-profile.html?id=${encodeURIComponent(t.id)}">Profili Gör</a></div></div></div>`).join(''):'<div class="empty">Henüz doğrulanmış pazarcı yok.</div>';
    }catch{}
  }

  async function enhanceTraderProfileRealtime(){
    if(!path.endsWith('/trader-profile.html'))return;
    const id=new URLSearchParams(location.search).get('id');if(!id)return;
    try{
      const d=await api(`/api/trader-profiles/${encodeURIComponent(id)}`),t=d.trader||{};
      const since=$('#tpSince');if(since)since.textContent=`${t.online?'🟢 Şu an online':`⚫ ${relSeen(t.lastSeenAt,false)}`} • ${t.acceptingOffers?'Teklif almaya açık':'Teklif almaya kapalı'} • KOTAKAS'a katılım: ${formatDate(t.createdAt)}`;
      const summary=$('#tpVerification')?.closest('.v5-mini-list');
      if(summary&&!summary.querySelector('.tp-live-score')){
        const score=document.createElement('div');score.className='v5-mini tp-live-score';score.innerHTML=`<div class="micon">🏆</div><div><strong>${Number(t.kotakasScore||0).toFixed(1)} / 100</strong><span>KOTAKAS güven skoru</span></div>`;summary.prepend(score);
        const response=document.createElement('div');response.className='v5-mini';response.innerHTML=`<div class="micon">⚡</div><div><strong>${esc(fmtResponse(t.averageResponseMinutes))}</strong><span>${Number(t.responseSamples||0)} gerçek teklif örneği</span></div>`;summary.append(response);
        const presence=document.createElement('div');presence.className='v5-mini';presence.innerHTML=`<div class="micon">${t.online?'🟢':'⚫'}</div><div><strong>${esc(t.online?'Online':relSeen(t.lastSeenAt,false))}</strong><span>${t.acceptingOffers?'Teklif almaya açık':'Teklif almaya kapalı'}</span></div>`;summary.append(presence);
      }
    }catch{}
  }

  async function boot(){
    if(!ME)await loadMe();
    if(ME){await heartbeat();setInterval(()=>{if(document.visibilityState==='visible')heartbeat()},45000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')heartbeat()})}
    await Promise.all([renderTraderPanelRealtime(),renderFeaturedTraders(),enhanceTraderProfileRealtime()]);
    if(path.endsWith('/trader.html')){setTimeout(renderTraderPanelRealtime,700);setTimeout(renderTraderPanelRealtime,1400)}
    if(path==='/'||path.endsWith('/index.html'))setTimeout(renderFeaturedTraders,700);
    if(path.endsWith('/trader-profile.html'))setTimeout(enhanceTraderProfileRealtime,700);
  }
  boot();
})();
