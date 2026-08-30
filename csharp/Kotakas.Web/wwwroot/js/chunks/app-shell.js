(()=>{
  const path=location.pathname.toLowerCase();
  let avatarUrl=null;
  let walletBalance=0;
  let notificationCount=0;

  const roleLabel=role=>String(role||'user').startsWith('admin_')?'Yönetici':role==='trader'?'Pazarcı':'Kullanıcı';
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const initials=()=>String(ME?.displayName||ME?.email||'K').trim().split(/\s+/).map(x=>x[0]||'').join('').slice(0,2).toUpperCase()||'K';
  const panelUrl=()=>typeof panelHref==='function'?panelHref():'/dashboard.html';
  const active=href=>path===href||path.endsWith(href);
  const avatarHtml=()=>avatarUrl?`<img src="${esc(avatarUrl)}" alt="Profil resmi">`:esc(initials());

  function shellLogo(){return '<a class="k-shell-logo" href="/"><span class="ko">KO</span><span class="tak">TAKAS</span></a>'}

  function headerHtml(){
    const center=`<nav class="k-shell-center" aria-label="Ana menü">
      <a href="/market.html" class="${active('/market.html')?'active':''}" title="Canlı Pazar">📡 <span>Canlı Pazar</span></a>
      <a href="/buy.html" class="${active('/buy.html')||active('/listing.html')?'active':''}" title="Item Al">🛒 <span>Item Al</span></a>
      <a href="/sell.html" class="${active('/sell.html')?'active':''}" title="Item Sat">📤 <span>Item Sat</span></a>
      <a href="/urgent-sell.html" class="accent ${active('/urgent-sell.html')?'active':''}" title="Acil Item Sat">⚡ <span>Acil Sat</span></a>
    </nav>`;
    if(!ME){
      return `<div class="container k-shell-bar"><button class="k-shell-menu" onclick="kOpenMenu()" aria-label="Menüyü aç">☰</button>${shellLogo()}${center}<div class="k-shell-guest"><a href="/login.html">Giriş</a><a href="/register.html">Kayıt Ol</a></div></div>`;
    }
    const admin=String(ME.role||'').startsWith('admin_');
    return `<div class="container k-shell-bar"><button class="k-shell-menu" onclick="kOpenMenu()" aria-label="Menüyü aç">☰</button>${shellLogo()}${center}<div class="k-shell-right">${admin?'':`<button class="k-wallet-pill" onclick="kOpenWallet()" title="KOTAKAS Bakiyesi">💳 <span data-header-wallet>${money(walletBalance)}</span></button>`}<a class="k-icon-btn" href="/notifications.html" title="Bildirimler">🔔${notificationCount?`<span class="notif-badge" data-notif-count>${notificationCount}</span>`:'<span class="notif-badge" data-notif-count style="display:none"></span>'}</a><div class="k-profile-wrap"><button class="k-profile-btn" onclick="kOpenAccount()" aria-label="Hesabım"><span class="k-avatar" data-k-avatar>${avatarHtml()}</span><span class="k-profile-name">${esc(ME.displayName||ME.email||'Hesabım')}</span><span>⌄</span></button></div></div></div>`;
  }

  function menuHtml(){
    const logged=!!ME;
    const role=roleLabel(ME?.role);
    return `<div class="k-drawer-top">${shellLogo()}<button class="k-drawer-close" onclick="kCloseShell()">✕</button></div>
      ${logged?`<div class="k-drawer-account"><span class="k-avatar" data-k-avatar>${avatarHtml()}</span><div><strong>${esc(ME.displayName||'Kullanıcı')}</strong><span>${esc(role)} • ${esc(ME.email||'')}</span></div></div>`:''}
      <div class="k-drawer-group"><div class="k-drawer-label">Pazar</div><a href="/market.html">📡 Canlı Pazar</a><a href="/buy.html">🛒 Item Al</a><a href="/sell.html">📤 Item Sat</a><a href="/urgent-sell.html">⚡ Acil Item Sat</a></div>
      ${logged?`<div class="k-drawer-group"><div class="k-drawer-label">Hesabım</div><a href="${panelUrl()}">🏠 ${String(ME.role||'').startsWith('admin_')?'Yönetim Paneli':ME.role==='trader'?'Pazarcı Paneli':'Kullanıcı Paneli'}</a><a href="/deals.html">🤝 İşlemlerim</a><a href="/notifications.html">🔔 Bildirimler <span class="badge-side">${notificationCount}</span></a>${String(ME.role||'').startsWith('admin_')?'':'<a href="/favorites.html">❤ Favorilerim</a>'}<a href="/support.html">💬 Destek Merkezi</a><button class="k-drawer-link" onclick="kOpenAccount()">⚙️ Hesap & Güvenlik</button></div>`:`<div class="k-drawer-group"><div class="k-drawer-label">Hesap</div><a href="/login.html">🔐 Giriş Yap</a><a href="/register.html">✨ Kayıt Ol</a></div>`}
      <div class="k-drawer-group"><div class="k-drawer-label">KOTAKAS</div><a href="/rules.html">🛡️ İşlem Kuralları</a><a href="/contact.html">✉️ İletişim</a></div>`;
  }

  function accountHtml(){
    if(!ME)return '';
    const admin=String(ME.role||'').startsWith('admin_');
    const traderProfile=ME.role==='trader'?`<a href="/trader-profile.html?id=${encodeURIComponent(ME.id)}">🏪 Mağaza Profilim</a>`:'';
    return `<div class="k-account-top"><span class="k-avatar" data-k-avatar>${avatarHtml()}</span><div style="min-width:0"><strong>${esc(ME.displayName||'Kullanıcı')}</strong><span>${esc(ME.email||'')} • ${esc(roleLabel(ME.role))}</span></div><button class="k-account-close" onclick="kCloseShell()">✕</button></div>
      ${admin?'':`<div class="k-account-wallet"><small>KOTAKAS BAKİYEM</small><strong data-header-wallet>${money(walletBalance)}</strong><div class="actions"><button class="btn teal sm" onclick="kOpenWallet()">＋ Bakiye Ekle</button><a class="btn ghost sm" href="${panelUrl()}">Bakiye Hareketleri</a></div></div>`}
      <div class="k-account-links"><a href="${panelUrl()}">🏠 Hesabım / Panel</a><a href="/deals.html">🤝 İşlemlerim</a><a href="/notifications.html">🔔 Bildirimler (${notificationCount})</a>${admin?'':'<a href="/favorites.html">❤ Favorilerim</a>'}<a href="/support.html">💬 Destek</a>${traderProfile}</div>
      <div class="k-account-section"><div class="k-account-section-head"><strong>🖼️ Profil Resmi</strong></div><p>JPG, PNG veya WEBP yükleyebilirsin. En fazla 2 MB.</p><input id="kAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" onchange="kUploadAvatar(event)"><div class="k-avatar-actions"><button class="btn ghost sm" onclick="kChooseAvatar()">📷 Fotoğraf Yükle</button>${avatarUrl?'<button class="btn red sm" onclick="kDeleteAvatar()">Resmi Kaldır</button>':''}</div></div>
      <div class="k-account-section"><div class="k-account-section-head"><strong>👤 Profil Bilgisi</strong></div><form onsubmit="kSaveProfile(event)"><div class="field"><label>Görünen ad</label><input id="kShellDisplayName" maxlength="40" value="${esc(ME.displayName||'')}" required></div><button class="btn teal full">Adı Güncelle</button></form></div>
      <div class="k-account-section"><div class="k-account-section-head"><strong>🔐 Şifre & Güvenlik</strong></div><p>Şifren değiştiğinde diğer cihazlardaki açık oturumlar güvenlik için kapatılır.</p><form id="kShellPasswordForm" onsubmit="kSavePassword(event)"><div class="field"><label>Mevcut şifre</label><input name="currentPassword" type="password" autocomplete="current-password" placeholder="Google hesabında boş olabilir"></div><div class="field"><label>Yeni şifre</label><input name="newPassword" type="password" minlength="10" maxlength="128" autocomplete="new-password" placeholder="En az 10 karakter ve 1 rakam" required></div><button class="btn ghost full">Şifreyi Değiştir</button></form></div>
      <button class="k-account-logout" onclick="logout()">Çıkış Yap</button>`;
  }

  function ensureSurfaces(){
    let back=$('#kShellBackdrop');
    if(!back){back=document.createElement('div');back.id='kShellBackdrop';back.className='k-drawer-backdrop';back.onclick=()=>window.kCloseShell();document.body.append(back)}
    let menu=$('#kShellDrawer');
    if(!menu){menu=document.createElement('aside');menu.id='kShellDrawer';menu.className='k-drawer';document.body.append(menu)}
    menu.innerHTML=menuHtml();
    let account=$('#kAccountDrawer');
    if(!account){account=document.createElement('aside');account.id='kAccountDrawer';account.className='k-account-drawer';document.body.append(account)}
    account.innerHTML=accountHtml();
  }

  function paintAvatar(){
    $$('[data-k-avatar]').forEach(x=>x.innerHTML=avatarHtml());
  }

  async function refreshData(){
    if(!ME)return;
    const tasks=[api('/api/account/avatar/').catch(()=>({avatarUrl:null})),api('/api/notifications').catch(()=>({notifications:[]}))];
    if(!String(ME.role||'').startsWith('admin_'))tasks.push(api('/api/wallet').catch(()=>({balanceTry:walletBalance})));
    const rows=await Promise.all(tasks);
    avatarUrl=rows[0]?.avatarUrl||null;
    notificationCount=(rows[1]?.notifications||[]).filter(x=>!x.isRead).length;
    if(rows[2])walletBalance=Number(rows[2].balanceTry||0);
    $$('[data-header-wallet]').forEach(x=>x.textContent=money(walletBalance));
    $$('[data-notif-count]').forEach(x=>{x.textContent=notificationCount?String(notificationCount):'';x.style.display=notificationCount?'':'none'});
    paintAvatar();
    const menu=$('#kShellDrawer');if(menu)menu.innerHTML=menuHtml();
    const account=$('#kAccountDrawer');if(account)account.innerHTML=accountHtml();
  }

  window.kOpenMenu=()=>{
    ensureSurfaces();$('#kAccountDrawer')?.classList.remove('open');$('#kShellDrawer')?.classList.add('open');$('#kShellBackdrop')?.classList.add('open');document.body.classList.add('k-shell-lock');
  };
  window.kOpenAccount=async()=>{
    if(!ME){location.href='/login.html';return}
    ensureSurfaces();await refreshData();$('#kShellDrawer')?.classList.remove('open');$('#kAccountDrawer')?.classList.add('open');$('#kShellBackdrop')?.classList.add('open');document.body.classList.add('k-shell-lock');
  };
  window.kCloseShell=()=>{$('#kShellDrawer')?.classList.remove('open');$('#kAccountDrawer')?.classList.remove('open');$('#kShellBackdrop')?.classList.remove('open');document.body.classList.remove('k-shell-lock')};
  window.kOpenWallet=()=>{window.kCloseShell();if(typeof openWalletTopup==='function')openWalletTopup();else toast('Bakiye ekranı hazırlanamadı.')};
  window.kChooseAvatar=()=>$('#kAvatarInput')?.click();
  window.kUploadAvatar=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    if(file.size>2*1024*1024)return toast('Profil resmi en fazla 2 MB olabilir.');
    const fd=new FormData();fd.append('file',file);
    try{
      const r=await fetch('/api/account/avatar/',{method:'POST',body:fd,credentials:'same-origin',headers:{'X-KOTAKAS-CSRF':'1'}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Object.assign(new Error(d.error||`HTTP_${r.status}`),{data:d});
      avatarUrl=d.avatarUrl||null;paintAvatar();$('#kAccountDrawer').innerHTML=accountHtml();toast('Profil resmin güncellendi.');
    }catch(err){toast(err.data?.error==='avatar_too_large'?'Profil resmi en fazla 2 MB olabilir.':err.data?.error==='unsupported_avatar_type'?'Yalnız JPG, PNG veya WEBP kullan.':'Profil resmi yüklenemedi.')}
  };
  window.kDeleteAvatar=async()=>{
    if(!confirm('Profil resmini kaldırmak istiyor musun?'))return;
    try{await api('/api/account/avatar/',{method:'DELETE'});avatarUrl=null;paintAvatar();$('#kAccountDrawer').innerHTML=accountHtml();toast('Profil resmi kaldırıldı.')}catch{toast('Profil resmi kaldırılamadı.')}
  };
  window.kSaveProfile=async e=>{
    e.preventDefault();const displayName=$('#kShellDisplayName')?.value||'';
    try{const d=await api('/api/account/profile',{method:'PATCH',body:{displayName}});ME=d.user;toast('Profil bilgisi güncellendi.');buildHeader();ensureSurfaces();$('#kAccountDrawer')?.classList.add('open');$('#kShellBackdrop')?.classList.add('open');document.body.classList.add('k-shell-lock')}catch(err){toast(err.data?.error==='invalid_display_name'?'Görünen adı kontrol et.':'Profil güncellenemedi.')}
  };
  window.kSavePassword=async e=>{
    e.preventDefault();
    try{const d=await api('/api/account/password',{method:'POST',body:Object.fromEntries(new FormData(e.target))});e.target.reset();toast(`Şifren güncellendi${Number(d.otherSessionsRevoked||0)>0?`; ${d.otherSessionsRevoked} diğer oturum kapatıldı`:''}.`)}catch(err){const code=err.data?.error;toast(code==='current_password_required'?'Mevcut şifreni gir.':code==='invalid_new_password'?'Yeni şifre en az 10 karakter ve bir rakam içermeli.':code==='password_change_failed'?'Mevcut şifre hatalı olabilir.':'Şifre değiştirilemedi.')}
  };

  function buildHeader(){
    const header=$('header.site-header');if(!header)return;
    header.className='site-header k-shell';header.innerHTML=headerHtml();ensureSurfaces();
  }

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}
    await refreshData().catch(()=>{});buildHeader();
    document.addEventListener('keydown',e=>{if(e.key==='Escape')window.kCloseShell()});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ME)refreshData().catch(()=>{})});
  }
  setTimeout(boot,350);
})();
