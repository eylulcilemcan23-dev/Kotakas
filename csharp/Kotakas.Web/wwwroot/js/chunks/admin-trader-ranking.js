(()=>{
  if(!location.pathname.toLowerCase().endsWith('/admin.html'))return;

  const fmtResp=v=>v==null?'—':Number(v)<60?`${Math.round(Number(v))} dk`:`${(Number(v)/60).toFixed(1)} sa`;
  const attention=t=>{
    const issues=[];
    if(Number(t.reviewCount||0)>=5&&Number(t.rating||0)<3.5)issues.push('düşük puan');
    if((Number(t.completedDeals||0)+Number(t.refundedDeals||0))>=5&&t.successRate!=null&&Number(t.successRate)<85)issues.push('düşük başarı');
    if(t.averageResponseMinutes!=null&&Number(t.averageResponseMinutes)>180)issues.push('yavaş yanıt');
    if(Number(t.score||0)<45)issues.push('düşük skor');
    return issues;
  };

  function bind(nav){if(nav.dataset.rankBound)return;nav.dataset.rankBound='1';nav.addEventListener('click',e=>{e.preventDefault();$$('.adminNav').forEach(x=>x.classList.remove('active'));nav.classList.add('active');$$('.adminPane').forEach(x=>x.style.display='none');const pane=$('#pane-'+nav.dataset.pane);if(pane)pane.style.display='';if(nav.dataset.pane==='trader-ranking')loadTraderRanking()})}

  function ensurePane(){
    const side=$('.sidebar'),host=$('#pane-users')?.parentElement;if(!side||!host)return;
    if(!side.querySelector('[data-pane="trader-ranking"]')){const a=document.createElement('a');a.className='adminNav';a.dataset.pane='trader-ranking';a.href='#';a.textContent='🏆 Pazarcı Sıralaması';const traders=side.querySelector('[data-pane="traders"]');if(traders)traders.after(a);else side.append(a)}
    if(!$('#pane-trader-ranking')){const pane=document.createElement('div');pane.id='pane-trader-ranking';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>🏆 Gerçek Pazarcı Sıralaması</h3><p>Online durum, doğrulama, gerçek puan, başarı, hacim, yanıt hızı, ilan ve takipçi verisinden otomatik hesaplanır.</p></div><div class="spacer"></div><button class="btn sm teal" onclick="loadTraderRanking()">Yenile</button></div><div class="v5-statgrid" style="margin-bottom:14px"><div class="v5-stat"><div class="top"><div class="ico">🟢</div><span>Online</span></div><strong id="rankOnline">0</strong><span>Son 2,5 dk aktif</span></div><div class="v5-stat purple"><div class="top"><div class="ico">📥</div><span>Teklif Açık</span></div><strong id="rankAccepting">0</strong><span>Yeni talep alıyor</span></div><div class="v5-stat green"><div class="top"><div class="ico">💎</div><span>80+ Skor</span></div><strong id="rankElite">0</strong><span>Yüksek güven skoru</span></div><div class="v5-stat gold"><div class="top"><div class="ico">⚠️</div><span>Kontrol</span></div><strong id="rankAttention">0</strong><span>İncelenebilir profil</span></div></div><div class="tablewrap"><table class="table"><thead><tr><th>#</th><th>Pazarcı</th><th>Durum</th><th>Skor</th><th>Puan</th><th>Başarı</th><th>İşlem</th><th>Yanıt</th><th>İlan</th><th>Takipçi</th><th>Kontrol</th></tr></thead><tbody id="adminTraderRanking"></tbody></table></div><div class="notice" style="margin-top:12px">Skor tek başına ceza nedeni değildir. Admin kararı verirken şikâyet, anlaşmazlık ve işlem geçmişini birlikte değerlendirmelidir.</div>`;host.append(pane)}
    $$('.adminNav').forEach(bind);
  }

  window.loadTraderRanking=async()=>{
    try{
      const d=await api('/api/traders/featured?limit=24'),rows=d.traders||[];
      $('#rankOnline').textContent=rows.filter(x=>x.online).length;
      $('#rankAccepting').textContent=rows.filter(x=>x.acceptingOffers).length;
      $('#rankElite').textContent=rows.filter(x=>Number(x.score||0)>=80).length;
      $('#rankAttention').textContent=rows.filter(x=>attention(x).length).length;
      const body=$('#adminTraderRanking');if(!body)return;
      body.innerHTML=rows.length?rows.map(t=>{const issues=attention(t);return `<tr><td><strong>#${Number(t.rank)}</strong></td><td><a href="/trader-profile.html?id=${encodeURIComponent(t.id)}" target="_blank">${esc(t.displayName)}</a>${t.userVerified?' 🛡️':''}</td><td><span class="pill ${t.online?'green':'purple'}">${t.online?'ONLINE':'OFFLINE'}</span> <span class="pill ${t.acceptingOffers?'green':'red'}">${t.acceptingOffers?'AÇIK':'KAPALI'}</span></td><td><strong>${Number(t.score||0).toFixed(1)}</strong></td><td>${Number(t.rating||0)>0?'⭐ '+Number(t.rating).toFixed(1):'—'} <span class="meta">(${Number(t.reviewCount||0)})</span></td><td>${t.successRate==null?'—':'%'+Number(t.successRate).toFixed(1)}</td><td>${Number(t.completedDeals||0)}</td><td>${fmtResp(t.averageResponseMinutes)}</td><td>${Number(t.activeListings||0)}</td><td>${Number(t.followerCount||0)}</td><td>${issues.length?`<span class="pill red">${esc(issues.join(', '))}</span>`:'<span class="pill green">Normal</span>'}</td></tr>`}).join(''):'<tr><td colspan="11">Doğrulanmış pazarcı bulunmuyor.</td></tr>';
    }catch{toast('Pazarcı sıralaması yüklenemedi.')}
  };

  async function init(){if(!ME)await loadMe();if(!ME||!String(ME.role).startsWith('admin_'))return;ensurePane()}
  setTimeout(init,500);setTimeout(ensurePane,1100);
})();
