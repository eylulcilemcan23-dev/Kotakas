(()=>{
  const path=location.pathname.toLowerCase();
  const isHome=path==='/'||path.endsWith('/index.html');
  const isAdmin=path.endsWith('/admin.html');
  let scheduled=false;

  function addCss(){
    if(document.getElementById('kSimpleLayoutCleanupCss'))return;
    const s=document.createElement('style');
    s.id='kSimpleLayoutCleanupCss';
    s.textContent=`
      .k-shell-menu{display:none!important}
      body.k-home-simplified .kp-promo-grid{display:block!important}
      body.k-home-simplified .kp-promo-stack{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important;width:100%!important}
      body.k-home-simplified .kp-promo-stack>.kp-promo-side{min-height:180px!important}
      body.k-home-simplified .kp-footer-main{grid-template-columns:minmax(260px,1.5fr) repeat(2,minmax(150px,1fr))!important}
      .k-admin-collapse-btn{margin-left:auto!important;white-space:nowrap}
      @media(max-width:760px){body.k-home-simplified .kp-promo-stack{grid-template-columns:1fr!important}body.k-home-simplified .kp-footer-main{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function removeClosestSection(el){
    const section=el?.closest('.kp-section');
    if(section)section.remove();
  }

  function cleanHome(){
    if(!isHome)return;
    document.body.classList.add('k-home-simplified');

    document.querySelector('.kp-promo-main')?.remove();
    document.querySelectorAll('.kp-promo-side').forEach(card=>{
      const text=(card.textContent||'').toLocaleLowerCase('tr-TR');
      if(text.includes('düşük komisyon'))card.remove();
    });

    removeClosestSection(document.getElementById('kpPopularGames'));
    document.querySelector('.kp-trust-band')?.remove();

    const requestBlock=document.getElementById('kpLatestRequests');
    const traderBlock=document.getElementById('kpTopTraders');
    removeClosestSection(requestBlock||traderBlock);

    document.querySelectorAll('footer h4, footer h3, footer strong').forEach(title=>{
      const text=(title.textContent||'').trim().toLocaleLowerCase('tr-TR');
      if(text==='knight online'||text==='rise online'||text==='popüler oyunlar'||text==='oyunlar'){
        const col=title.parentElement;
        if(col&&col.closest('footer'))col.remove();
      }
    });
  }

  function removeGameDrawer(){
    document.querySelectorAll('.k-shell-menu').forEach(btn=>btn.style.display='none');
    document.getElementById('kShellDrawer')?.remove();
    if(typeof window.kOpenMenu==='function'&&!window.kOpenMenu.__disabledBySimpleLayout){
      const disabled=()=>{};
      disabled.__disabledBySimpleLayout=true;
      window.kOpenMenu=disabled;
    }
  }

  function makeAdminControlCollapsible(){
    if(!isAdmin)return;
    const title=[...document.querySelectorAll('h2,h3,h4,strong')].find(x=>(x.textContent||'').includes('Yönetim Kontrol Merkezi'));
    if(!title)return;
    const card=title.closest('.v5-card,.panel-card,.card')||title.parentElement?.parentElement;
    if(!card||card.dataset.kCollapseReady==='1')return;
    card.dataset.kCollapseReady='1';

    const header=title.closest('.v5-card-head')||title.parentElement;
    const headerChild=[...card.children].find(x=>x===header||x.contains(header))||card.firstElementChild;
    const content=[...card.children].filter(x=>x!==headerChild);
    if(!content.length)return;

    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn sm ghost k-admin-collapse-btn';
    btn.textContent='Aç ▾';
    (header||headerChild||card).appendChild(btn);

    let open=false;
    const paint=()=>{
      content.forEach(x=>x.style.display=open?'':'none');
      btn.textContent=open?'Kapat ▴':'Aç ▾';
      card.classList.toggle('k-admin-control-collapsed',!open);
    };
    btn.addEventListener('click',()=>{open=!open;paint()});
    paint();
  }

  function apply(){
    scheduled=false;
    addCss();
    removeGameDrawer();
    cleanHome();
    makeAdminControlCollapsible();
  }

  function queue(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  apply();
  const mo=new MutationObserver(queue);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(queue,300);
  setTimeout(queue,900);
  setTimeout(queue,1800);
  setTimeout(()=>mo.disconnect(),6000);
})();
