(()=>{
  const path=location.pathname.toLowerCase();
  let packageState={active:null,pending:null,packages:[]};

  const gb=n=>`${Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2})} GB`;
  const date=s=>{try{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium'}).format(new Date(s))}catch{return s||'—'}};
  const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function addStyle(){
    if(document.getElementById('kTraderPackageStyle'))return;
    const style=document.createElement('style');
    style.id='kTraderPackageStyle';
    style.textContent=`
      .k-package-center{margin:14px 0}.k-package-summary{display:grid;grid-template-columns:1.2fr .8fr .8fr;gap:12px;margin-bottom:12px}
      .k-package-summary .v5-card{padding:16px}.k-package-label{display:block;color:#8fa0bd;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;margin-bottom:5px}
      .k-package-big{font-size:25px;font-weight:950;color:#fff}.k-package-big.teal{color:var(--teal)}.k-package-big.gold{color:#ffd791}
      .k-package-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.k-package-card{position:relative;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:linear-gradient(180deg,rgba(22,29,47,.96),rgba(12,17,29,.96));overflow:hidden}
      .k-package-card.pro{border-color:rgba(36,225,209,.35)}.k-package-card.elite{border-color:rgba(255,215,145,.42)}.k-package-card h4{margin:0 0 5px;font-size:18px;color:#fff}.k-package-price{font-size:27px;font-weight:950;color:#24e1d1;margin:10px 0}.k-package-card.elite .k-package-price{color:#ffd791}
      .k-package-features{display:grid;gap:6px;color:#aeb9cd;font-size:13px;margin:12px 0 16px}.k-package-ribbon{position:absolute;right:10px;top:10px;font-size:10px;font-weight:900;padding:5px 8px;border-radius:999px;background:rgba(36,225,209,.13);color:#62f1e5}
      .k-package-pending{padding:14px 16px;border:1px solid rgba(255,199,80,.28);background:rgba(255,199,80,.06);border-radius:14px;margin-bottom:12px;color:#d9deea}.k-package-pending strong{color:#ffd791}
      .k-package-admin-row{display:grid;grid-template-columns:1.2fr .8fr .65fr .7fr auto;gap:12px;align-items:center;padding:14px;border-bottom:1px solid rgba(255,255,255,.07)}.k-package-admin-row:last-child{border-bottom:0}.k-package-admin-row strong{color:#fff}.k-package-admin-row small{display:block;color:#8f9bb0;margin-top:3px}.k-package-status{font-size:11px;font-weight:900;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.08);width:max-content}.k-package-status.pending{color:#ffd791;background:rgba(255,199,80,.10)}.k-package-status.active{color:#61f2c7;background:rgba(62,224,170,.10)}
      @media(max-width:900px){.k-package-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.k-package-summary{grid-template-columns:1fr 1fr}.k-package-summary>div:first-child{grid-column:1/-1}.k-package-admin-row{grid-template-columns:1fr 1fr}.k-package-admin-row .actions{grid-column:1/-1}}
      @media(max-width:560px){.k-package-grid,.k-package-summary{grid-template-columns:1fr}.k-package-summary>div:first-child{grid-column:auto}.k-package-admin-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  async function fetchTraderPackageState(){
    const [catalog,mine]=await Promise.all([api('/api/trader-packages/catalog'),api('/api/trader-packages/mine')]);
    packageState={packages:catalog.packages||[],active:mine.active||null,pending:mine.pending||null};
    return packageState;
  }

  function packageFeatures(p){
    const rights=p.unlimited?'Sınırsız item ilanı':`${p.listingLimit} item ilanı`;
    const rows=[`✓ ${rights}`,`✓ ${p.durationDays} gün kullanım`];
    if(p.featuredListings)rows.push('✓ Öne çıkarma özelliği');
    if(p.eliteBadge)rows.push('✓ Elite rozet + vitrin avantajı');
    return rows.map(x=>`<span>${x}</span>`).join('');
  }

  function renderTraderPackageCenter(){
    const root=document.getElementById('traderPackageCenter');
    if(!root)return;
    const a=packageState.active,p=packageState.pending;
    const summary=a?`
      <div class="k-package-summary">
        <div class="v5-card"><span class="k-package-label">Aktif paket</span><div class="k-package-big teal">${safe(a.packageName)}</div><div class="meta">${date(a.expiresAt)} tarihine kadar aktif</div></div>
        <div class="v5-card"><span class="k-package-label">Kalan süre</span><div class="k-package-big">${a.daysRemaining} gün</div><div class="meta">30 günlük paket dönemi</div></div>
        <div class="v5-card"><span class="k-package-label">İlan hakkı</span><div class="k-package-big gold">${a.unlimited?'Sınırsız':a.remainingListings}</div><div class="meta">${a.unlimited?'Limit yok':`${a.listingsUsed} / ${a.listingLimit} kullanıldı`}</div></div>
      </div>`:`
      <div class="k-package-summary">
        <div class="v5-card" style="grid-column:1/-1"><span class="k-package-label">Pazarcı paketi</span><div class="k-package-big">Aktif paket yok</div><div class="meta">Item satış ilanı açmak için aşağıdaki paketlerden birini GB ile al.</div></div>
      </div>`;

    const pending=p?`<div class="k-package-pending"><strong>⏳ ${safe(p.packageName)} paketi bekliyor • ${gb(p.priceGb)}</strong><br><span>GB teslimini KOTAKAS yetkilisine yaptıktan sonra admin “GB teslim alındı” onayı verir ve paketin aktif olur.</span></div>`:'';
    const cards=packageState.packages.map(x=>{
      const current=a?.packageCode===x.code;
      const disabled=p?'disabled':'';
      const label=current?'Paketi Yenile':p?'Onay Bekleniyor':'Paketi Al';
      return `<div class="k-package-card ${safe(x.code)}">${x.code==='pro'?'<span class="k-package-ribbon">POPÜLER</span>':x.code==='elite'?'<span class="k-package-ribbon">VİTRİN</span>':''}<h4>${safe(x.name)}</h4><div class="meta">Pazarcı satış paketi</div><div class="k-package-price">${gb(x.priceGb)}</div><div class="k-package-features">${packageFeatures(x)}</div><button class="btn ${x.code==='elite'?'ghost':'teal'} full" ${disabled} onclick="buyTraderPackage('${safe(x.code)}')">${label}</button></div>`;
    }).join('');
    root.innerHTML=`${summary}${pending}<div class="v5-card"><div class="v5-card-head"><div><h3>GB ile Pazarcı Paketleri</h3><p>Paket ücretini oyun içinde GB olarak teslim et. Satıştan ayrıca komisyon kesilmez.</p></div></div><div class="k-package-grid">${cards}</div></div>`;
  }

  window.buyTraderPackage=async code=>{
    if(packageState.pending)return toast('Zaten admin onayı bekleyen bir paket talebin var.');
    const p=packageState.packages.find(x=>x.code===code);if(!p)return;
    if(!confirm(`${p.name} paketi ${gb(p.priceGb)}. Paket talebi oluşturulsun mu?`))return;
    try{
      await api('/api/trader-packages/orders',{method:'POST',body:{packageCode:code}});
      toast('Paket talebi oluşturuldu. GB tesliminden sonra admin paketi aktif edecek.');
      await fetchTraderPackageState();renderTraderPackageCenter();gateListingButton();
    }catch(err){toast(err.data?.error==='package_order_already_pending'?'Onay bekleyen paket talebin zaten var.':err.data?.error||'Paket talebi oluşturulamadı.');}
  };

  function focusPackages(){document.getElementById('traderPackageCenter')?.scrollIntoView({behavior:'smooth',block:'start'});toast('Satış ilanı açmak için aktif pazarcı paketi gerekli.');}

  function gateListingButton(){
    const btn=[...document.querySelectorAll('.head-actions button')].find(x=>String(x.textContent).includes('Satış İlanı'));
    if(!btn)return;
    if(!btn.dataset.packageGateBound){
      btn.dataset.packageGateBound='1';
      btn.removeAttribute('onclick');
      btn.addEventListener('click',()=>{
        if(!packageState.active)return focusPackages();
        if(!packageState.active.unlimited && Number(packageState.active.remainingListings||0)<=0)return focusPackages();
        openModal('listingModal');
      });
    }
    btn.textContent=packageState.active?'＋ Satış İlanı':'🔒 Paket Al / İlan Aç';
  }

  function overrideListingSubmit(){
    window.addListing=async e=>{
      e.preventDefault();
      if(!packageState.active){focusPackages();closeModal('listingModal');return;}
      if(!packageState.active.unlimited && Number(packageState.active.remainingListings||0)<=0){toast('Paketindeki ilan hakkı doldu. Paketi yenile veya yükselt.');closeModal('listingModal');focusPackages();return;}
      try{
        await api('/api/listings',{method:'POST',body:{
          itemName:document.getElementById('listingItem')?.value||'',
          serverCode:document.getElementById('listingServer')?.value||'ZERO',
          priceGb:Number(String(document.getElementById('listingPrice')?.value||'0').replace(',','.')),
          stock:Number(document.getElementById('listingStock')?.value||1)
        }});
        closeModal('listingModal');toast('Satış ilanı yayınlandı. 1 ilan hakkı kullanıldı.');e.target.reset();
        await fetchTraderPackageState();renderTraderPackageCenter();gateListingButton();
        setTimeout(()=>location.reload(),350);
      }catch(err){
        if(err.data?.error==='package_required'){closeModal('listingModal');focusPackages();return;}
        if(err.data?.error==='listing_limit_reached'){closeModal('listingModal');toast('Paketindeki ilan hakkı doldu.');focusPackages();return;}
        toast(err.data?.error||'İlan yayınlanamadı.');
      }
    };
  }

  async function initTrader(){
    const profile=document.querySelector('.v5-profilebar');if(!profile)return;
    addStyle();
    let root=document.getElementById('traderPackageCenter');
    if(!root){root=document.createElement('section');root.id='traderPackageCenter';root.className='k-package-center';profile.after(root);}
    try{await fetchTraderPackageState();renderTraderPackageCenter();gateListingButton();overrideListingSubmit();}
    catch(err){root.innerHTML='<div class="v5-card"><div class="empty">Pazarcı paket bilgileri yüklenemedi.</div></div>';}
  }

  function statusText(s){return ({pending:'BEKLİYOR',active:'AKTİF',rejected:'REDDEDİLDİ',replaced:'YENİLENDİ',expired:'SÜRESİ DOLDU'})[s]||String(s||'').toUpperCase();}

  async function renderAdminPackages(){
    const box=document.getElementById('adminPackageOrders');if(!box)return;
    try{
      const d=await api('/api/admin/trader-packages/orders');const rows=d.orders||[];
      box.innerHTML=rows.length?rows.map(o=>`<div class="k-package-admin-row"><div><strong>${safe(o.displayName||'Pazarcı')}</strong><small>${safe(o.email||'')} • #${o.id}</small></div><div><strong>${safe(o.packageName)}</strong><small>${o.listingLimit<0?'Sınırsız ilan':`${o.listingLimit} ilan`} • ${o.durationDays} gün</small></div><div><strong>${gb(o.priceGb)}</strong><small>Oyun içi teslim</small></div><div><span class="k-package-status ${safe(o.status)}">${statusText(o.status)}</span>${o.expiresAt?`<small>Bitiş: ${date(o.expiresAt)}</small>`:''}</div><div class="actions">${o.status==='pending'?`<button class="btn sm teal" onclick="adminApproveTraderPackage(${o.id})">✓ GB Teslim Alındı / Aktif Et</button><button class="btn sm ghost" onclick="adminRejectTraderPackage(${o.id})">Reddet</button>`:''}</div></div>`).join(''):'<div class="empty" style="padding:22px">Henüz paket talebi yok.</div>';
    }catch(err){box.innerHTML='<div class="empty" style="padding:22px">Paket talepleri yüklenemedi.</div>';}
  }

  window.adminApproveTraderPackage=async id=>{
    if(!confirm('GB oyun içinde teslim alındı mı? Onaylarsan pazarcının paketi hemen aktif olacak.'))return;
    try{await api(`/api/admin/trader-packages/orders/${id}/approve`,{method:'POST'});toast('GB teslimi onaylandı, paket aktif edildi.');renderAdminPackages();}
    catch(err){toast(err.data?.error||'Paket aktif edilemedi.');}
  };
  window.adminRejectTraderPackage=async id=>{
    if(!confirm('Bu paket talebi reddedilsin mi?'))return;
    try{await api(`/api/admin/trader-packages/orders/${id}/reject`,{method:'POST'});toast('Paket talebi reddedildi.');renderAdminPackages();}
    catch(err){toast(err.data?.error||'Talep reddedilemedi.');}
  };

  function initAdmin(){
    addStyle();
    document.querySelectorAll('.adminNav[data-pane="finance"],.adminNav[data-pane="settings"],#pane-finance,#pane-settings').forEach(x=>x.style.display='none');
    const sidebar=document.querySelector('.sidebar');const section=document.querySelector('.v5-layout>section');if(!sidebar||!section)return;
    let nav=document.getElementById('adminPackageNav');
    if(!nav){
      nav=document.createElement('a');nav.id='adminPackageNav';nav.className='adminNav';nav.href='#';nav.dataset.pane='packages';nav.textContent='📦 Pazarcı Paketleri';
      const support=sidebar.querySelector('[data-pane="support"]');support?.before(nav);
    }
    let pane=document.getElementById('pane-packages');
    if(!pane){
      pane=document.createElement('div');pane.id='pane-packages';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML='<div class="v5-card-head"><div><h3>Pazarcı Paketleri</h3><p>Pazarcı GB teslimini yaptıktan sonra paketi buradan aktif et.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="renderAdminTraderPackages()">Yenile</button></div><div id="adminPackageOrders"></div>';
      section.appendChild(pane);
    }
    nav.addEventListener('click',e=>{
      e.preventDefault();document.querySelectorAll('.adminNav').forEach(x=>x.classList.remove('active'));nav.classList.add('active');document.querySelectorAll('.adminPane').forEach(x=>x.style.display='none');pane.style.display='';renderAdminPackages();
    });
    window.renderAdminTraderPackages=renderAdminPackages;
    renderAdminPackages();
  }

  if(path.endsWith('/trader.html'))initTrader();
  if(path.endsWith('/admin.html'))initAdmin();
})();
