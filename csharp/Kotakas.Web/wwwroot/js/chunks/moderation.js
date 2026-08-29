(()=>{
  if(!location.pathname.toLowerCase().endsWith('/admin.html'))return;

  window.adminCancelRequest=async id=>{if(!confirm('Bu satış talebini yönetim tarafından kapatmak istiyor musun?'))return;try{await api(`/api/admin/moderation/sale-requests/${id}/cancel`,{method:'POST'});toast('Satış talebi kapatıldı.');setTimeout(()=>location.reload(),300)}catch(err){toast(err.data?.error==='request_not_open'?'Talep artık açık değil.':'Talep kapatılamadı.')}};
  window.adminCancelListing=async id=>{if(!confirm('Bu SELL ilanını yayından kaldırmak istiyor musun?'))return;try{await api(`/api/admin/moderation/listings/${id}/cancel`,{method:'POST'});toast('SELL ilanı kapatıldı.');setTimeout(()=>loadModerationPanes(),250)}catch{toast('İlan kapatılamadı.')}};
  window.adminDeleteReview=async id=>{if(!confirm('Bu değerlendirmeyi moderasyon nedeniyle kaldırmak istiyor musun?'))return;try{await api(`/api/admin/moderation/reviews/${id}`,{method:'DELETE'});toast('Değerlendirme kaldırıldı.');setTimeout(()=>loadModerationPanes(),250)}catch{toast('Değerlendirme kaldırılamadı.')}};
  window.adminCloseUser=async id=>{if(!confirm('Bu hesabı kapatmak istiyor musun? Açık talepler ve ilanlar kapanır; finans ve işlem geçmişi SİLİNMEZ.'))return;try{await api(`/api/admin/moderation/users/${id}/close`,{method:'POST'});toast('Hesap güvenli şekilde kapatıldı.');setTimeout(()=>location.reload(),300)}catch(err){toast(err.data?.error==='cannot_close_self'?'Kendi admin hesabını kapatamazsın.':'Hesap kapatılamadı.')}};
  window.adminRestoreUser=async id=>{try{await api(`/api/admin/moderation/users/${id}/restore`,{method:'POST'});toast('Hesap yeniden aktifleştirildi.');setTimeout(()=>location.reload(),300)}catch{toast('Hesap açılamadı.')}};

  function addNavigation(){
    const side=$('.sidebar');if(!side)return;
    if(!side.querySelector('[data-pane="listings"]')){const a=document.createElement('a');a.className='adminNav';a.dataset.pane='listings';a.href='#';a.textContent='🛍️ SELL İlanları';const finance=side.querySelector('[data-pane="finance"]');side.insertBefore(a,finance)}
    if(!side.querySelector('[data-pane="reviews"]')){const a=document.createElement('a');a.className='adminNav';a.dataset.pane='reviews';a.href='#';a.textContent='⭐ Değerlendirmeler';const support=side.querySelector('[data-pane="support"]');side.insertBefore(a,support)}
    $$('.adminNav').forEach(nav=>{if(nav.dataset.moderationBound)return;nav.dataset.moderationBound='1';nav.addEventListener('click',e=>{e.preventDefault();$$('.adminNav').forEach(x=>x.classList.remove('active'));nav.classList.add('active');$$('.adminPane').forEach(x=>x.style.display='none');const pane=$('#pane-'+nav.dataset.pane);if(pane)pane.style.display='';})});
  }

  function addPanes(){
    const host=$('#pane-users')?.parentElement;if(!host)return;
    if(!$('#pane-listings')){const pane=document.createElement('div');pane.id='pane-listings';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML='<div class="v5-card-head"><div><h3>SELL İlan Moderasyonu</h3><p>Pazarcı stok ilanlarını incele ve gerektiğinde yayından kaldır.</p></div></div><div id="adminModerationListings" class="list"></div>';host.append(pane)}
    if(!$('#pane-reviews')){const pane=document.createElement('div');pane.id='pane-reviews';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML='<div class="v5-card-head"><div><h3>Pazarcı Değerlendirmeleri</h3><p>Yalnız tamamlanmış işlemlerden gelen yorumları denetle.</p></div></div><div id="adminModerationReviews" class="list"></div>';host.append(pane)}
  }

  async function loadModerationPanes(){
    try{
      const [ld,rv]=await Promise.all([api('/api/admin/moderation/listings'),api('/api/admin/moderation/reviews')]);
      const listings=ld.listings||[],lb=$('#adminModerationListings');if(lb)lb.innerHTML=listings.length?listings.map(x=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${esc(x.sellerName)} • ${fmtGB(x.priceGb)} • Stok ${x.stock}</div></div><div class="spacer"></div><span class="pill ${x.status==='active'?'green':x.status==='cancelled'?'red':'gold'}">${esc(x.status)}</span></div>${x.status!=='cancelled'?`<div class="actions"><button class="btn sm red" onclick="adminCancelListing(${x.id})">Yayından Kaldır</button></div>`:''}</div>`).join(''):'<div class="empty">İlan bulunmuyor.</div>';
      const reviews=rv.reviews||[],rb=$('#adminModerationReviews');if(rb)rb.innerHTML=reviews.length?reviews.map(x=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${'★'.repeat(x.stars)}${'☆'.repeat(5-x.stars)} • ${esc(x.trader)}</div><div class="meta">İşlem #${x.dealId} • ${esc(x.reviewer)} • ${formatDate(x.createdAt)}</div></div><div class="spacer"></div><button class="btn sm red" onclick="adminDeleteReview(${x.id})">Kaldır</button></div>${x.comment?`<div class="notice" style="margin-top:8px">${esc(x.comment)}</div>`:''}</div>`).join(''):'<div class="empty">Henüz değerlendirme yok.</div>';
    }catch{}
  }

  async function enhanceRequests(){try{const d=await api('/api/sale-requests'),rows=d.requests||[],cards=$$('#adminRequests .listitem');cards.forEach((card,i)=>{const r=rows[i];if(!r||card.querySelector('.mod-request-actions'))return;const a=document.createElement('div');a.className='actions mod-request-actions';a.innerHTML=`<button class="btn sm red" onclick="adminCancelRequest(${r.id})">Moderasyonla Kapat</button>`;card.append(a)})}catch{}}

  async function enhanceUsers(){
    try{const d=await api('/api/admin/users'),users=d.users||[],rows=$$('#adminUsers tr');rows.forEach((tr,i)=>{const u=users[i];if(!u||tr.querySelector('.mod-account'))return;const cell=tr.lastElementChild;if(!cell)return;const b=document.createElement('button');b.className='btn sm '+(u.active?'red':'ghost')+' mod-account';b.style.marginLeft='4px';b.textContent=u.active?'Hesabı Kapat':'Geri Aç';b.onclick=()=>u.active?adminCloseUser(u.id):adminRestoreUser(u.id);cell.append(b)})}catch{}
  }

  async function init(){
    if(!ME||!String(ME.role).startsWith('admin_'))return;
    addNavigation();addPanes();await Promise.all([loadModerationPanes(),enhanceRequests(),enhanceUsers()]);
  }
  setTimeout(init,350);setTimeout(init,900);
})();
