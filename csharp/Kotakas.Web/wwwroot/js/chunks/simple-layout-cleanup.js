(()=>{
  const path=location.pathname.toLowerCase();
  const isHome=path==='/'||path.endsWith('/index.html');
  const isAdmin=path.endsWith('/admin.html');
  let scheduled=false;

  const norm=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr-TR');

  function addCss(){
    if(document.getElementById('kSimpleLayoutCleanupCss'))return;
    const s=document.createElement('style');
    s.id='kSimpleLayoutCleanupCss';
    s.textContent=`
      .k-shell-menu,.site-header button[aria-label="Menüyü aç"],.site-header button[aria-label="Menüyü Aç"]{display:none!important}
      body.k-home-simplified .kp-promo-grid{display:block!important}
      body.k-home-simplified .kp-promo-main{display:flex!important;width:100%!important;margin-bottom:14px!important}
      body.k-home-simplified .kp-promo-stack{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important;width:100%!important}
      body.k-home-simplified .kp-promo-stack>.kp-promo-side{min-height:180px!important}
      .k-footer-four-cols{display:grid!important;grid-template-columns:minmax(280px,1.45fr) repeat(3,minmax(170px,1fr))!important;column-gap:64px!important;row-gap:28px!important;align-items:start!important}
      .k-footer-four-cols>*{min-width:0!important}
      .k-admin-collapse-btn{margin-left:auto!important;white-space:nowrap}
      @media(max-width:980px){.k-footer-four-cols{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:30px 44px!important}}
      @media(max-width:760px){body.k-home-simplified .kp-promo-stack{grid-template-columns:1fr!important}body.k-home-simplified .kp-promo-main{min-height:330px!important;padding:32px 28px!important}body.k-home-simplified .kp-promo-main h1{font-size:48px!important}.k-footer-four-cols{grid-template-columns:1fr!important;gap:24px!important}}
    `;
    document.head.appendChild(s);
  }

  function removeClosestSection(el){
    const section=el?.closest('.kp-section');
    if(section)section.remove();
  }

  function footerColumnForTitle(title,root){
    let node=title;
    while(node.parentElement&&node.parentElement!==root){
      const parent=node.parentElement;
      const headingCount=parent.querySelectorAll('h1,h2,h3,h4,h5,h6').length;
      const linkCount=parent.querySelectorAll('a').length;
      if(linkCount>0&&headingCount<=1)return parent;
      node=parent;
    }
    return title.parentElement;
  }

  function removeFooterGameColumns(){
    const targets=new Set(['rise online','popüler oyunlar']);
    const roots=[...document.querySelectorAll('footer,.kp-footer,.site-footer,[class*="footer"]')];
    const grids=new Set();

    roots.forEach(root=>{
      root.querySelectorAll('h1,h2,h3,h4,h5,h6,strong').forEach(title=>{
        if(!targets.has(norm(title.textContent)))return;
        const col=footerColumnForTitle(title,root);
        if(!col||col===root)return;
        if(col.parentElement)grids.add(col.parentElement);
        col.remove();
      });
    });

    // Footer geç yüklenirse veya özel sınıf kullanıyorsa başlıkları yine yakala.
    document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong').forEach(title=>{
      if(!targets.has(norm(title.textContent)))return;
      const root=title.closest('footer,.kp-footer,.site-footer,[class*="footer"]');
      if(!root)return;
      const col=footerColumnForTitle(title,root);
      if(!col||col===root)return;
      if(col.parentElement)grids.add(col.parentElement);
      col.remove();
    });

    grids.forEach(grid=>{
      const text=norm(grid.textContent);
      if(text.includes('hukuki')&&text.includes('destek')&&text.includes('knight online'))grid.classList.add('k-footer-four-cols');
    });
  }

  function removeHomeCurrencyGames(){
    if(!isHome)return;
    const main=document.querySelector('main');
    if(!main)return;

    const titleNeedle='oyun para birimleri & dijital ürünler';
    [...main.querySelectorAll('h1,h2,h3,h4,strong,.k-ref-section-title,.kp-section-head,div')].forEach(el=>{
      const text=norm(el.textContent);
      if(text!==titleNeedle)return;
      const target=el.closest('.k-ref-section-title,.kp-section-head,.section-title')||el;
      target.remove();
    });

    const gameLabels=['rise online gold','pubg mobile uc','valorant vp','league of legends rp'];
    const statLabels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'];
    const seed=[...main.querySelectorAll('*')].find(el=>norm(el.textContent).includes(gameLabels[0]));
    if(!seed)return;

    let row=seed;
    while(row&&row!==main){
      const text=norm(row.textContent);
      if(gameLabels.every(x=>text.includes(x)))break;
      row=row.parentElement;
    }
    if(!row||row===main)return;

    const rowText=norm(row.textContent);
    if(!statLabels.some(x=>rowText.includes(x))){
      row.remove();
      return;
    }

    gameLabels.forEach(label=>{
      const leaf=[...main.querySelectorAll('*')].find(el=>{
        const text=norm(el.textContent);
        return text.includes(label)&&!statLabels.some(x=>text.includes(x));
      });
      if(!leaf)return;
      let card=leaf.closest('a,article,.card,.tile,.kp-game-tile,.kp-product-card,.k-product-card');
      if(!card){
        card=leaf;
        while(card.parentElement&&card.parentElement!==main){
          const parentText=norm(card.parentElement.textContent);
          if(gameLabels.filter(x=>parentText.includes(x)).length>1)break;
          card=card.parentElement;
        }
      }
      if(card&&card!==main)card.remove();
    });
  }

  function cleanHome(){
    if(!isHome)return;
    document.body.classList.add('k-home-simplified');

    document.querySelectorAll('.kp-promo-side').forEach(card=>{
      const text=norm(card.textContent);
      if(text.includes('düşük komisyon'))card.remove();
    });

    removeClosestSection(document.getElementById('kpPopularGames'));
    document.querySelector('.kp-trust-band')?.remove();

    const requestBlock=document.getElementById('kpLatestRequests');
    const traderBlock=document.getElementById('kpTopTraders');
    removeClosestSection(requestBlock||traderBlock);

    removeHomeCurrencyGames();
  }

  function removeGameDrawer(){
    document.querySelectorAll('.site-header .k-shell-menu,.site-header button[aria-label="Menüyü aç"],.site-header button[aria-label="Menüyü Aç"]').forEach(btn=>btn.remove());
    document.querySelectorAll('.site-header button').forEach(btn=>{
      const text=(btn.textContent||'').trim();
      const label=(btn.getAttribute('aria-label')||'').toLocaleLowerCase('tr-TR');
      if(text==='☰'||label.includes('menü'))btn.remove();
    });
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
    removeFooterGameColumns();
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
  setTimeout(queue,3500);
  setTimeout(queue,6500);
  setTimeout(()=>mo.disconnect(),15000);
})();
