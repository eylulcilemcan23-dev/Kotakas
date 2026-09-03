(()=>{
  let scheduled=false;

  function apply(){
    scheduled=false;
    const header=document.querySelector('header.site-header');
    const bar=header?.querySelector('.k-shell-bar');
    if(!header||!bar)return;

    header.querySelectorAll('.kp-global-search,#kpGlobalSearchForm,#kpGlobalSearchResults').forEach(el=>el.remove());
    bar.classList.add('kp-shell-no-search');
    bar.style.setProperty('justify-content','space-between','important');
  }

  function queue(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  [100,300,700,1200,2200,4000,7000].forEach(ms=>setTimeout(queue,ms));
  setTimeout(()=>observer.disconnect(),10000);
})();
