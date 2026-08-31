(()=>{
  const MOBILE='(max-width:680px)';
  const accent='#ff285a';
  let press=null;
  let lastHandled=0;

  function paintBrowser(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
    meta.setAttribute('content',accent);
    let ms=document.querySelector('meta[name="msapplication-navbutton-color"]');
    if(!ms){ms=document.createElement('meta');ms.name='msapplication-navbutton-color';document.head.appendChild(ms)}
    ms.setAttribute('content',accent);
  }

  const lower=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');

  function gameHref(path){
    const code=window.KOTAKAS_GAME?.code||'knight-online';
    if(typeof window.kGameUrl==='function')return window.kGameUrl(path,code);
    const u=new URL(path,location.origin);u.searchParams.set('game',code);return u.pathname+u.search;
  }

  function actionType(text){
    const t=lower(text);
    if(!t||t.length>55)return null;
    if(t.includes('tüm oyunlar'))return 'games';
    if(t.includes('bize sat')||t==='hızlı sat'||t==='acil sat')return 'urgent';
    if(t.includes('ilan ekle')||t.includes('ilan ver'))return 'sell';
    if(t.includes('bakiye yükle')||t.includes('bakiye ekle'))return 'wallet';
    return null;
  }

  function hrefFor(type){
    if(type==='games')return '/games.html';
    if(type==='urgent')return gameHref('/urgent-sell.html');
    if(type==='sell')return gameHref('/sell.html');
    if(type==='wallet')return (typeof ME!=='undefined'&&ME)?'/wallet.html':'/login.html';
    return null;
  }

  function closeDrawer(){
    if(typeof window.kCloseShell==='function')window.kCloseShell();
    else{
      document.getElementById('kShellDrawer')?.classList.remove('open');
      document.getElementById('kShellBackdrop')?.classList.remove('open');
      document.body.classList.remove('k-shell-lock');
    }
  }

  function run(type){
    if(!type)return false;
    lastHandled=Date.now();
    closeDrawer();
    if(type==='wallet'){
      if(!(typeof ME!=='undefined'&&ME)){location.href='/login.html';return true;}
      setTimeout(()=>{
        if(typeof window.openWalletTopup==='function')window.openWalletTopup();
        else location.href='/wallet.html';
      },40);
      return true;
    }
    location.href=hrefFor(type);
    return true;
  }

  function tagActions(drawer){
    if(!drawer)return;
    const nodes=[...drawer.querySelectorAll('a,button,[role="button"],div,span')];
    nodes.forEach(node=>{
      if(node.children.length>3)return;
      const type=actionType(node.textContent);
      if(!type)return;
      let target=node.closest('a,button,[role="button"]');
      if(!target||!drawer.contains(target))target=node;
      target.dataset.kMobileAction=type;
      target.style.setProperty('pointer-events','auto','important');
      target.style.setProperty('touch-action','pan-y','important');
      target.style.setProperty('-webkit-user-select','none','important');
      if(target.tagName==='A'){
        target.setAttribute('href',hrefFor(type));
        target.removeAttribute('onclick');
      }else if(!target.hasAttribute('role')){
        target.setAttribute('role','button');
        target.setAttribute('tabindex','0');
      }
    });
  }

  function actionAtPoint(x,y,drawer){
    if(!drawer)return null;
    const stack=document.elementsFromPoint?.(x,y)||[];
    for(const el of stack){
      let n=el;
      for(let i=0;n&&i<8;i++,n=n.parentElement){
        if(n===drawer)break;
        const type=n?.dataset?.kMobileAction||actionType(n?.textContent);
        if(type&&drawer.contains(n))return type;
      }
    }
    // Üstte şeffaf bir katman varsa bile gerçek butonu koordinatından bul.
    for(const el of drawer.querySelectorAll('[data-k-mobile-action]')){
      const r=el.getBoundingClientRect();
      if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return el.dataset.kMobileAction;
    }
    return null;
  }

  function installDrawer(){
    if(!matchMedia(MOBILE).matches)return;
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    drawer.querySelectorAll('[data-mobile-priority]').forEach(x=>x.remove());

    drawer.style.setProperty('overflow-y','auto','important');
    drawer.style.setProperty('overflow-x','hidden','important');
    drawer.style.setProperty('-webkit-overflow-scrolling','touch','important');
    drawer.style.setProperty('overscroll-behavior-y','contain','important');
    drawer.style.setProperty('touch-action','pan-y','important');
    drawer.style.setProperty('scroll-behavior','auto','important');
    drawer.style.setProperty('z-index','2147483600','important');

    const backdrop=document.getElementById('kShellBackdrop');
    if(backdrop)backdrop.style.setProperty('z-index','2147483500','important');

    const gameList=drawer.querySelector('[data-drawer-game-list]');
    if(gameList){
      gameList.style.setProperty('max-height','none','important');
      gameList.style.setProperty('height','auto','important');
      gameList.style.setProperty('overflow','visible','important');
      gameList.style.setProperty('touch-action','pan-y','important');
    }

    drawer.querySelectorAll('a,button,[role="button"],input,label').forEach(el=>{
      el.style.setProperty('pointer-events','auto','important');
      if(!el.matches('input'))el.style.setProperty('touch-action','pan-y','important');
    });
    tagActions(drawer);
  }

  function insideDrawerPoint(x,y){
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer?.classList.contains('open'))return null;
    const r=drawer.getBoundingClientRect();
    return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom?drawer:null;
  }

  function beginPoint(x,y,id){
    const drawer=insideDrawerPoint(x,y);if(!drawer)return;
    press={x,y,id,drawer,at:Date.now()};
  }
  function endPoint(x,y,id,e){
    if(!press||press.id!==id)return;
    const p=press;press=null;
    const moved=Math.hypot(x-p.x,y-p.y);
    if(moved>14||Date.now()-p.at>900)return;
    const type=actionAtPoint(x,y,p.drawer);
    if(!type)return;
    e?.preventDefault?.();e?.stopPropagation?.();e?.stopImmediatePropagation?.();
    run(type);
  }

  if(window.PointerEvent){
    document.addEventListener('pointerdown',e=>{
      if(!matchMedia(MOBILE).matches||!e.isPrimary)return;
      beginPoint(e.clientX,e.clientY,e.pointerId);
    },true);
    document.addEventListener('pointerup',e=>{
      if(!matchMedia(MOBILE).matches||!e.isPrimary)return;
      endPoint(e.clientX,e.clientY,e.pointerId,e);
    },true);
    document.addEventListener('pointercancel',()=>{press=null},true);
  }else{
    document.addEventListener('touchstart',e=>{const t=e.touches?.[0];if(t)beginPoint(t.clientX,t.clientY,1)},{capture:true,passive:true});
    document.addEventListener('touchend',e=>{const t=e.changedTouches?.[0];if(t)endPoint(t.clientX,t.clientY,1,e)},{capture:true,passive:false});
    document.addEventListener('touchcancel',()=>{press=null},{capture:true,passive:true});
  }

  // Masaüstü emülasyon ve mobil tarayıcının ürettiği normal click için yedek.
  document.addEventListener('click',e=>{
    if(e.target.closest('.k-shell-menu'))setTimeout(()=>{installDrawer();startObserver()},30);
    if(!matchMedia(MOBILE).matches||Date.now()-lastHandled<700)return;
    const drawer=insideDrawerPoint(e.clientX,e.clientY);if(!drawer)return;
    const type=actionAtPoint(e.clientX,e.clientY,drawer);if(!type)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();run(type);
  },true);

  function install(){paintBrowser();installDrawer()}
  const observer=new MutationObserver(()=>requestAnimationFrame(installDrawer));
  const startObserver=()=>{
    const drawer=document.getElementById('kShellDrawer');
    if(drawer&&!drawer.__kMobileObserver){drawer.__kMobileObserver=true;observer.observe(drawer,{childList:true,subtree:true})}
  };

  window.addEventListener('pageshow',install);
  window.addEventListener('resize',()=>setTimeout(installDrawer,50));
  paintBrowser();
  [60,140,280,520,900,1500,2400].forEach(ms=>setTimeout(()=>{install();startObserver()},ms));
})();
