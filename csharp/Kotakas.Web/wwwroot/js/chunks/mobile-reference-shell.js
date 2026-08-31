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

  function installDrawer(){
    if(!matchMedia(MOBILE).matches)return;
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    // Giriş/Kayıt alanını drawer-game-nav.js yönetiyor.
    // Eski mobil öncelik bloğu ikinci kez Giriş Yap / Kayıt Ol oluşturuyordu.
    drawer.querySelectorAll('[data-mobile-priority]').forEach(x=>x.remove());

    // Mobilde çekmecenin tamamı tek parça kaydırılsın; iç içe scroll oluşmasın.
    const gameList=drawer.querySelector('[data-drawer-game-list]');
    if(gameList){
      gameList.style.maxHeight='none';
      gameList.style.overflow='visible';
      gameList.style.touchAction='auto';
    }
  }

  function install(){
    paintBrowser();
    installDrawer();
  }

  const observer=new MutationObserver(()=>installDrawer());
  const startObserver=()=>{
    const drawer=document.getElementById('kShellDrawer');
    if(drawer&&!drawer.__kMobileObserver){
      drawer.__kMobileObserver=true;
      observer.observe(drawer,{childList:true,subtree:true});
    }
  };

  document.addEventListener('click',e=>{
    if(e.target.closest('.k-shell-menu'))setTimeout(()=>{installDrawer();startObserver()},30);
  });
  window.addEventListener('pageshow',install);
  window.addEventListener('resize',()=>setTimeout(installDrawer,50));
  paintBrowser();
  [80,180,350,700,1300,2200].forEach(ms=>setTimeout(()=>{install();startObserver()},ms));
})();
