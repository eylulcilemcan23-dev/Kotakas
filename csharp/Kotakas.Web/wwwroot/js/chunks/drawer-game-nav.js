(()=>{
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gameUrl=(path,code)=>{
    if(typeof window.kGameUrl==='function')return window.kGameUrl(path,code);
    const u=new URL(path,location.origin);u.searchParams.set('game',code);return u.pathname+u.search;
  };
  const currentGame=()=>window.KOTAKAS_GAME||window.KOTAKAS_GAMES?.[0]||{code:'knight-online',mark:'KO',name:'Knight Online',currency:'GB'};
  const wordmark=g=>({
    'knight-online':'KNIGHT ONLINE',
    'rise-online':'RISE ONLINE',
    'valorant':'VALORANT',
    'league-of-legends':'LEAGUE OF LEGENDS',
    'pubg-mobile':'PUBG MOBILE',
    'mobile-legends':'MOBILE LEGENDS',
    'metin2':'METİN2',
    'silkroad-online':'SILKROAD ONLINE',
    'steam':'STEAM'
  }[String(g?.code||'')]||String(g?.name||'OYUN').toUpperCase());
  const logoMap={
    'knight-online':'/assets/images/game-logos/knight-online.png',
    'rise-online':'/assets/images/game-logos/rise-online.png',
    'valorant':'/assets/images/game-logos/valorant.png',
    'league-of-legends':'/assets/images/game-logos/league-of-legends.png',
    'pubg-mobile':'/assets/images/game-logos/pubg-mobile.png',
    'mobile-legends':'/assets/images/game-logos/mobile-legends.png',
    'metin2':'/assets/images/game-logos/metin2.png'
  };

  function gameRows(query=''){
    const games=window.KOTAKAS_GAMES||[];
    const current=currentGame();
    const q=String(query||'').trim().toLowerCase();
    const rows=games.filter(g=>!q||`${g.name} ${g.currency} ${(g.types||[]).join(' ')}`.toLowerCase().includes(q));
    return rows.map(g=>{
      const logo=logoMap[g.code];
      const brand=logo
        ? `<img class="k-drawer-game-logo-img" src="${logo}" alt="${safe(g.name)} logosu" loading="lazy">`
        : `<span class="k-drawer-game-wordmark">${safe(wordmark(g))}</span>`;
      return `<button type="button" class="k-drawer-game-row ${g.code===current.code?'active':''}" data-drawer-game="${safe(g.code)}">
        <span class="k-drawer-game-brand">${brand}<span class="k-drawer-game-subline"><b>${safe(g.currency)}</b> • ${safe((g.types||[]).join(' • '))}</span></span>
        ${g.code===current.code?'<i>✓</i>':''}
      </button>`;
    }).join('')||'<div class="k-drawer-game-empty">Oyun bulunamadı.</div>';
  }

  function gameSection(){
    const games=window.KOTAKAS_GAMES||[];
    if(!games.length)return '';
    return `<div class="k-drawer-group k-drawer-games" data-drawer-games>
      <div class="k-drawer-label">🎮 OYUNLAR & OYUN PARALARI</div>
      <label class="k-drawer-game-search">⌕ <input id="kDrawerGameSearch" autocomplete="off" placeholder="Oyun veya para ara..."></label>
      <div class="k-drawer-game-list" data-drawer-game-list>${gameRows()}</div>
      <a class="k-drawer-all-games" href="/games.html">＋ Tüm Oyunlar Sayfası</a>
    </div>`;
  }

  function quickSection(){
    const g=currentGame();
    const panel=typeof panelHref==='function'?panelHref():'/dashboard.html';
    const logged=typeof ME!=='undefined'&&!!ME;
    return `<div class="k-account-section k-account-quick" data-account-quick>
      <div class="k-account-section-head"><strong>⚡ Hızlı Menü</strong></div>
      <div class="k-account-quick-grid">
        <a href="${gameUrl('/market.html',g.code)}">📡 <b>Pazar</b></a>
        <a href="${gameUrl('/buy.html',g.code)}">🛒 <b>Satın Al</b></a>
        <a href="${gameUrl('/sell.html',g.code)}">📤 <b>Sat</b></a>
        <a href="${gameUrl('/urgent-sell.html',g.code)}">⚡ <b>Hızlı Sat</b></a>
        ${logged?`<a href="${panel}">🏠 <b>Panelim</b></a><a href="/deals.html">🤝 <b>İşlemler</b></a>`:'<a href="/login.html">🔐 <b>Giriş</b></a><a href="/register.html">✨ <b>Kayıt Ol</b></a>'}
      </div>
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

  function bindSearch(root){
    const input=root?.querySelector('#kDrawerGameSearch');
    const list=root?.querySelector('[data-drawer-game-list]');
    if(!input||!list)return;
    input.addEventListener('input',()=>{
      list.innerHTML=gameRows(input.value);
      bindGameButtons(list);
    });
  }

  function decorateMenu(){
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    drawer.querySelector('[data-drawer-games]')?.remove();
    drawer.querySelector('.k-drawer-account')?.remove();
    drawer.querySelectorAll('.k-drawer-group').forEach(group=>group.remove());

    const top=drawer.querySelector('.k-drawer-top');
    top?.querySelector('.k-shell-logo')?.remove();
    if(top&&!top.querySelector('.k-drawer-title')){
      top.insertAdjacentHTML('afterbegin','<strong class="k-drawer-title">OYUNLAR</strong>');
    }

    if(top)top.insertAdjacentHTML('afterend',gameSection());
    else drawer.insertAdjacentHTML('afterbegin',gameSection());

    bindGameButtons(drawer);
    bindSearch(drawer);
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
    const wrapped=function(...args){
      const result=original.apply(this,args);
      if(result&&typeof result.then==='function'){
        return Promise.resolve(result).then(value=>{decorator();return value});
      }
      decorator();
      return result;
    };
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
