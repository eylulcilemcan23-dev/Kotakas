(()=>{
  const MOBILE='(max-width:680px)';
  const accent='#ff285a';

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

  function actionHref(el){
    const text=lower(el?.textContent);
    if(text.includes('tüm oyunlar'))return '/games.html';
    if(text.includes('bize sat')||text.includes('hızlı sat')||text.includes('acil sat'))return gameHref('/urgent-sell.html');
    if(text.includes('ilan ekle')||text.includes('ilan ver'))return gameHref('/sell.html');
    if(text.includes('bakiye yükle')||text.includes('bakiye ekle'))return (typeof ME!=='undefined'&&ME)?'/wallet.html':'/login.html';
    return null;
  }

  function makeNativeLink(el,href){
    if(!el||!href)return el;
    if(el.tagName==='A'){
      el.setAttribute('href',href);
      el.removeAttribute('onclick');
      el.style.setProperty('pointer-events','auto','important');
      el.style.setProperty('touch-action','manipulation','important');
      return el;
    }

    const a=document.createElement('a');
    for(const attr of [...el.attributes]){
      if(attr.name==='type'||attr.name==='onclick')continue;
      a.setAttribute(attr.name,attr.value);
    }
    a.href=href;
    a.innerHTML=el.innerHTML;
    a.style.cssText=el.style.cssText;
    a.style.setProperty('pointer-events','auto','important');
    a.style.setProperty('touch-action','manipulation','important');
    el.replaceWith(a);
    return a;
  }

  function normalizeActions(drawer){
    [...drawer.querySelectorAll('a,button,[role="button"]')].forEach(el=>{
      const href=actionHref(el);
      if(href)makeNativeLink(el,href);
    });
  }

  function installDrawer(){
    if(!matchMedia(MOBILE).matches)return;
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    // Eski mobil blok ikinci Giriş/Kayıt alanı oluşturmasın.
    drawer.querySelectorAll('[data-mobile-priority]').forEach(x=>x.remove());

    // Panelin tamamı tek scroll yüzeyi olsun.
    drawer.style.setProperty('overflow-y','auto','important');
    drawer.style.setProperty('overflow-x','hidden','important');
    drawer.style.setProperty('-webkit-overflow-scrolling','touch','important');
    drawer.style.setProperty('overscroll-behavior-y','contain','important');
    drawer.style.setProperty('touch-action','pan-y','important');

    const gameList=drawer.querySelector('[data-drawer-game-list]');
    if(gameList){
      gameList.style.setProperty('max-height','none','important');
      gameList.style.setProperty('height','auto','important');
      gameList.style.setProperty('overflow','visible','important');
      gameList.style.setProperty('touch-action','pan-y','important');
    }

    drawer.querySelectorAll('a,button,[role="button"],input,label').forEach(el=>{
      el.style.setProperty('pointer-events','auto','important');
      if(!el.matches('input,label'))el.style.setProperty('touch-action','manipulation','important');
    });

    normalizeActions(drawer);
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

  // JS ile touch/click yakalamıyoruz. Mobil tarayıcının doğal <a href> davranışı kullanılıyor.
  document.addEventListener('click',e=>{
    if(e.target.closest('.k-shell-menu'))setTimeout(()=>{installDrawer();startObserver()},30);
  },true);

  window.addEventListener('pageshow',install);
  window.addEventListener('resize',()=>setTimeout(installDrawer,50));
  paintBrowser();
  [60,140,280,520,900,1500,2400].forEach(ms=>setTimeout(()=>{install();startObserver()},ms));
})();
