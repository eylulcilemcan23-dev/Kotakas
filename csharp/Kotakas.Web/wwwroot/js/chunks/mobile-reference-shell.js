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

  function mobileSearchSubmit(e){
    e.preventDefault();
    const input=e.currentTarget.querySelector('input');
    const q=String(input?.value||'').trim();
    if(!q)return;
    location.href='/buy.html?search='+encodeURIComponent(q);
  }

  function priorityHtml(){return `<div class="k-mobile-drawer-priority" data-mobile-priority>
      <form class="k-mobile-drawer-search" data-mobile-search>
        <span>⌕</span><input autocomplete="off" placeholder="Oyun, uygulama, ürün ara" aria-label="Ara">
      </form>
      <div class="k-mobile-auth">
        <a class="login" href="/login.html">↪ &nbsp; Giriş Yap</a>
        <a href="/register.html">👤＋ &nbsp; Kayıt Ol</a>
      </div>
    </div>`}

  function installDrawer(){
    if(!matchMedia(MOBILE).matches)return;
    const drawer=document.getElementById('kShellDrawer');
    if(!drawer)return;

    if(!ME){
      if(!drawer.querySelector('[data-mobile-priority]')){
        const top=drawer.querySelector('.k-drawer-top');
        top?.insertAdjacentHTML('afterend',priorityHtml());
        drawer.querySelector('[data-mobile-search]')?.addEventListener('submit',mobileSearchSubmit);
      }
      drawer.querySelectorAll('.k-drawer-group').forEach(group=>{
        const label=group.querySelector('.k-drawer-label')?.textContent?.trim().toLowerCase();
        if(label==='hesap')group.style.display='none';
      });
    }else{
      drawer.querySelector('[data-mobile-priority]')?.remove();
      drawer.querySelectorAll('.k-drawer-group').forEach(group=>group.style.removeProperty('display'));
    }
  }

  function install(){
    paintBrowser();
    installDrawer();
  }

  const observer=new MutationObserver(()=>installDrawer());
  const startObserver=()=>{
    const drawer=document.getElementById('kShellDrawer');
    if(drawer)observer.observe(drawer,{childList:true,subtree:false});
  };

  document.addEventListener('click',e=>{
    if(e.target.closest('.k-shell-menu'))setTimeout(installDrawer,30);
  });
  window.addEventListener('pageshow',install);
  window.addEventListener('resize',()=>setTimeout(installDrawer,50));
  paintBrowser();
  [120,300,650,1200,2200].forEach(ms=>setTimeout(()=>{install();startObserver()},ms));
})();
