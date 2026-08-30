(()=>{
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gameUrl=(path,code)=>{
    if(typeof window.kGameUrl==='function')return window.kGameUrl(path,code);
    const u=new URL(path,location.origin);u.searchParams.set('game',code);return u.pathname+u.search;
  };
  const currentGame=()=>window.KOTAKAS_GAME||window.KOTAKAS_GAMES?.[0]||{code:'knight-online',mark:'KO',name:'Knight Online',currency:'GB'};

  function gameSection(){
    const games=window.KOTAKAS_GAMES||[];
    if(!games.length)return '';
    const current=currentGame();
    const preferred=['knight-online','rise-online','pubg-mobile','metin2','silkroad-online','valorant'];
    const featured=preferred.map(code=>games.find(g=>g.code===code)).filter(Boolean);
    return `<div class="k-drawer-group k-drawer-games" data-drawer-games>
      <div class="k-drawer-label">🎮 Oyunlar</div>
      <a class="k-drawer-current-game" href="${gameUrl('/market.html',current.code)}">
        <span class="k-drawer-game-logo">${safe(current.mark||'🎮')}</span>
        <span><strong>${safe(current.name)}</strong><small>${safe(current.currency||'')}</small></span>
        <b>Seçili</b>
      </a>
      <div class="k-drawer-game-grid">
        ${featured.map(g=>`<button type="button" class="k-drawer-game-chip ${g.code===current.code?'active':''}" data-drawer-game="${safe(g.code)}"><span>${safe(g.mark)}</span><b>${safe(g.name.replace(' Online World','').replace(' Online',''))}</b></button>`).join('')}
      </div>
      <a class="k-drawer-all-games" href="/games.html">＋ Tüm Oyunları Gör</a>
    </div>`;
  }

  function quickSection(){
    const g=currentGame();
    const panel=typeof panelHref==='function'?panelHref():'/dashboard.html';
    const logged=typeof ME!=='undefined'&&!!ME;
    return `<div class="k-account-section k-account-quick" data-account-quick>
      <div class="k-account-section-head"><strong>⚡ Hızlı Menü</strong><span>${safe(g.mark||'🎮')} ${safe(g.name)}</span></div>
      <div class="k-account-quick-grid">
        <a href="${gameUrl('/market.html',g.code)}">📡 <b>Pazar</b></a>
        <a href="${gameUrl('/buy.html',g.code)}">🛒 <b>Satın Al</b></a>
        <a href="${gameUrl('/sell.html',g.code)}">📤 <b>Sat</b></a>
        <a href="${gameUrl('/urgent-sell.html',g.code)}">⚡ <b>Hızlı Sat</b></a>
        ${logged?`<a href="${panel}">🏠 <b>Panelim</b></a><a href="/deals.html">🤝 <b>İşlemler</b></a>`:'<a href="/login.html">🔐 <b>Giriş</b></a><a href="/register.html">✨ <b>Kayıt Ol</b></a>'}
      </div>
      <button type="button" class="btn ghost full k-account-games-btn" onclick="kCloseShell();setTimeout(()=>kToggleGameMenu?.(),60)">🎮 Oyun Değiştir</button>
    </div>`;
  }

  function bindGameButtons(root){
    root?.querySelectorAll('[data-drawer-game]').forEach(btn=>{
      btn.onclick=()=>{
        const code=btn.getAttribute('data-drawer-game');
        if(typeof window.kSelectGame==='function')window.kSelectGame(code);
        else location.href=gameUrl('/market.html',code);
      };
    });
  }

  function decorateMenu(){
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;
    drawer.querySelector('[data-drawer-games]')?.remove();
    const groups=drawer.querySelectorAll('.k-drawer-group');
    const account=drawer.querySelector('.k-drawer-account');
    if(account)account.insertAdjacentHTML('afterend',gameSection());
    else if(groups[0])groups[0].insertAdjacentHTML('beforebegin',gameSection());
    else drawer.insertAdjacentHTML('beforeend',gameSection());
    bindGameButtons(drawer);
  }

  function decorateAccount(){
    const drawer=document.getElementById('kAccountDrawer');
    if(!drawer)return;
    drawer.querySelector('[data-account-quick]')?.remove();
    const wallet=drawer.querySelector('.k-account-wallet');
    const activeDeal=drawer.querySelector('.k-account-section');
    if(wallet)wallet.insertAdjacentHTML('afterend',quickSection());
    else if(activeDeal)activeDeal.insertAdjacentHTML('beforebegin',quickSection());
    else drawer.querySelector('.k-account-top')?.insertAdjacentHTML('afterend',quickSection());
  }

  function decorate(){decorateMenu();decorateAccount()}

  function wrapOpen(name,decorator){
    const original=window[name];
    if(typeof original!=='function'||original.__drawerPlus)return false;
    const wrapped=function(...args){decorator();return original.apply(this,args)};
    wrapped.__drawerPlus=true;
    window[name]=wrapped;
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    const a=wrapOpen('kOpenMenu',decorateMenu);
    const b=wrapOpen('kOpenAccount',decorateAccount);
    if(a||b||tries%4===0)decorate();
    if((typeof window.kOpenMenu==='function'&&window.kOpenMenu.__drawerPlus)&&(typeof window.kOpenAccount!=='function'||window.kOpenAccount.__drawerPlus)||tries>40)clearInterval(timer);
  },150);

  window.kRefreshDrawerNavigation=decorate;
  setTimeout(decorate,500);
})();
