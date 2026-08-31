(()=>{
  const MOBILE='(max-width:680px)';
  const accent='#ff285a';
  let touchState=null;
  let lastTouchActionAt=0;

  function paintBrowser(){
    let meta=document.querySelector('meta[name="theme-color"]');
    if(!meta){meta=document.createElement('meta');meta.name='theme-color';document.head.appendChild(meta)}
    meta.setAttribute('content',accent);
    let ms=document.querySelector('meta[name="msapplication-navbutton-color"]');
    if(!ms){ms=document.createElement('meta');ms.name='msapplication-navbutton-color';document.head.appendChild(ms)}
    ms.setAttribute('content',accent);
  }

  const lower=s=>String(s||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');

  function actionOf(target){
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer||!target||!drawer.contains(target))return null;
    const el=target.closest?.('a,button,[role="button"]');
    if(!el||!drawer.contains(el))return null;
    const text=lower(el.textContent);
    if(text.includes('tüm oyunlar'))return {type:'games',el};
    if(text.includes('bize sat'))return {type:'urgent',el};
    if(text.includes('ilan ekle')||text.includes('ilan ver'))return {type:'sell',el};
    if(text.includes('bakiye yükle')||text.includes('bakiye ekle'))return {type:'wallet',el};
    return null;
  }

  function gameHref(path){
    const code=window.KOTAKAS_GAME?.code||'knight-online';
    if(typeof window.kGameUrl==='function')return window.kGameUrl(path,code);
    const u=new URL(path,location.origin);u.searchParams.set('game',code);return u.pathname+u.search;
  }

  function closeDrawer(){
    if(typeof window.kCloseShell==='function')window.kCloseShell();
    else{
      document.getElementById('kShellDrawer')?.classList.remove('open');
      document.getElementById('kShellBackdrop')?.classList.remove('open');
      document.body.classList.remove('k-shell-lock');
    }
  }

  function runAction(action){
    if(!action)return;
    closeDrawer();
    if(action.type==='games')return location.assign('/games.html');
    if(action.type==='urgent')return location.assign(gameHref('/urgent-sell.html'));
    if(action.type==='sell')return location.assign(gameHref('/sell.html'));
    if(action.type==='wallet'){
      const logged=typeof ME!=='undefined'&&!!ME;
      if(!logged)return location.assign('/login.html');
      setTimeout(()=>{
        if(typeof window.openWalletTopup==='function')window.openWalletTopup();
        else location.assign('/wallet.html');
      },70);
    }
  }

  function normalizeBottomActions(drawer){
    drawer.querySelectorAll('a,button,[role="button"]').forEach(el=>{
      const action=actionOf(el);
      if(!action)return;
      el.style.pointerEvents='auto';
      el.style.touchAction='pan-y';
      el.style.position='relative';
      el.style.zIndex='3';
      let p=el.parentElement;
      let depth=0;
      while(p&&p!==drawer&&depth<3){
        const pos=getComputedStyle(p).position;
        if(pos==='fixed'||pos==='sticky'){
          p.style.setProperty('position','static','important');
          p.style.removeProperty('top');
          p.style.removeProperty('bottom');
        }
        p.style.pointerEvents='auto';
        p.style.touchAction='pan-y';
        p=p.parentElement;depth++;
      }
    });
  }

  function installDrawer(){
    if(!matchMedia(MOBILE).matches)return;
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    // Giriş/Kayıt alanını yalnız drawer-game-nav.js yönetsin; çift blok oluşmasın.
    drawer.querySelectorAll('[data-mobile-priority]').forEach(x=>x.remove());

    // Tek scroll yüzeyi: oyun listesinin kendi kaydırmasını tamamen kapat.
    const gameList=drawer.querySelector('[data-drawer-game-list]');
    if(gameList){
      gameList.style.setProperty('max-height','none','important');
      gameList.style.setProperty('height','auto','important');
      gameList.style.setProperty('overflow','visible','important');
      gameList.style.setProperty('touch-action','pan-y','important');
      gameList.style.setProperty('overscroll-behavior','auto','important');
    }

    drawer.style.setProperty('overflow-y','scroll','important');
    drawer.style.setProperty('overflow-x','hidden','important');
    drawer.style.setProperty('overscroll-behavior-y','none','important');
    drawer.style.setProperty('-webkit-overflow-scrolling','touch','important');
    drawer.style.setProperty('touch-action','pan-y','important');
    drawer.style.setProperty('scroll-behavior','auto','important');

    drawer.querySelectorAll('a,button,[role="button"],input,label').forEach(el=>{
      el.style.pointerEvents='auto';
      if(!el.matches('input'))el.style.touchAction='pan-y';
    });
    normalizeBottomActions(drawer);
  }

  function install(){paintBrowser();installDrawer()}

  const observer=new MutationObserver(()=>requestAnimationFrame(installDrawer));
  const startObserver=()=>{
    const drawer=document.getElementById('kShellDrawer');
    if(drawer&&!drawer.__kMobileObserver){
      drawer.__kMobileObserver=true;
      observer.observe(drawer,{childList:true,subtree:true});
    }
  };

  // Mobilde scroll ile tap'i ayır. Hareket varsa sadece kaydır; kısa dokunuşsa butonu çalıştır.
  document.addEventListener('touchstart',e=>{
    if(!matchMedia(MOBILE).matches)return;
    const action=actionOf(e.target);if(!action)return;
    const t=e.touches?.[0];if(!t)return;
    touchState={action,x:t.clientX,y:t.clientY,at:Date.now()};
  },{capture:true,passive:true});

  document.addEventListener('touchend',e=>{
    if(!touchState||!matchMedia(MOBILE).matches)return;
    const state=touchState;touchState=null;
    const t=e.changedTouches?.[0];if(!t)return;
    const moved=Math.hypot(t.clientX-state.x,t.clientY-state.y);
    const elapsed=Date.now()-state.at;
    if(moved>12||elapsed>750)return;
    e.preventDefault();
    e.stopPropagation();
    lastTouchActionAt=Date.now();
    runAction(state.action);
  },{capture:true,passive:false});

  document.addEventListener('touchcancel',()=>{touchState=null},{capture:true,passive:true});

  document.addEventListener('click',e=>{
    if(e.target.closest('.k-shell-menu'))setTimeout(()=>{installDrawer();startObserver()},30);
    if(!matchMedia(MOBILE).matches)return;
    const action=actionOf(e.target);if(!action)return;
    e.preventDefault();
    e.stopPropagation();
    if(Date.now()-lastTouchActionAt<800)return;
    runAction(action);
  },true);

  window.addEventListener('pageshow',install);
  window.addEventListener('resize',()=>setTimeout(installDrawer,50));
  paintBrowser();
  [60,140,280,520,900,1500,2400].forEach(ms=>setTimeout(()=>{install();startObserver()},ms));
})();
