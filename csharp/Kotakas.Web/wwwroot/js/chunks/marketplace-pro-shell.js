(()=>{
  function install(){
    const header=document.querySelector('header.site-header');
    const bar=header?.querySelector('.k-shell-bar');
    if(!header||!bar)return false;

    bar.classList.add('kp-shell-main','kp-shell-no-search');
    bar.dataset.kpPro='1';

    // Ana üst çubuktaki global arama alanı artık kullanılmıyor.
    bar.querySelectorAll('.kp-global-search,#kpGlobalSearchForm,#kpGlobalSearchResults').forEach(el=>el.remove());

    // Arama kalkınca logo solda, hesap/sepet tarafı sağda düzgün dursun.
    bar.style.setProperty('justify-content','space-between','important');

    header.querySelector('.kp-category-wrap')?.remove();
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(install()||tries>60)clearInterval(timer);
  },120);

  const observer=new MutationObserver(()=>install());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>observer.disconnect(),12000);

  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible')setTimeout(install,80);
  });

  window.kRefreshMarketplaceShell=install;
})();
