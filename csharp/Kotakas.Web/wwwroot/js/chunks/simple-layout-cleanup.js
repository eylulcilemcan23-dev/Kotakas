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
      .k-footer-four-cols{display:grid!important;grid-template-columns:minmax(300px,1.45fr) repeat(3,minmax(180px,1fr))!important;column-gap:72px!important;row-gap:28px!important;align-items:start!important}
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

  function footerRoot(){
    return document.querySelector('footer,.kp-footer,.site-footer,[data-footer],.k-footer');
  }

  function footerBlockForTitle(title,footer){
    const known=new Set(['hukuki','destek','knight online','rise online','popüler oyunlar']);
    let node=title;
    while(node.parentElement&&node.parentElement!==footer){
      const parent=node.parentElement;
      const headings=[...parent.querySelectorAll('h1,h2,h3,h4,h5,h6,strong')].map(x=>norm(x.textContent)).filter(x=>known.has(x));
      if(headings.length>1)break;
      node=parent;
    }
    return node;
  }

  function findFooterGrid(footer){
    const titles=[...footer.querySelectorAll('h1,h2,h3,h4,h5,h6,strong')];
    const wanted=['hukuki','destek','knight online'];
    const nodes=wanted.map(w=>titles.find(x=>norm(x.textContent)===w)).filter(Boolean);
    if(nodes.length!==wanted.length)return null;
    let grid=nodes[0].parentElement;
    while(grid&&grid!==footer&&!nodes.every(n=>grid.contains(n)))grid=grid.parentElement;
    return grid&&grid!==footer?grid:null;
  }

  function removeFooterGameColumns(){
    const footer=footerRoot();
    if(!footer)return;
    const targets=new Set(['rise online','popüler oyunlar']);

    [...footer.querySelectorAll('h1,h2,h3,h4,h5,h6,strong')].forEach(title=>{
      if(!targets.has(norm(title.textContent)))return;
      const block=footerBlockForTitle(title,footer);
      if(block&&block!==footer)block.remove();
    });

    // Başlık farklı bir sarmalayıcıda kalırsa, Rise/Popüler oyun bloklarını metinden de temizle.
    [...footer.querySelectorAll('section,nav,article,div,ul')]
      .sort((a,b)=>b.querySelectorAll('*').length-a.querySelectorAll('*').length)
      .forEach(el=>{
        if(!el.isConnected||el===footer)return;
        const text=norm(el.textContent);
        if(!(text.startsWith('rise online')||text.startsWith('popüler oyunlar')))return;
        if(text.includes('hukuki')||text.includes('destek')||text.includes('knight online')||text.includes('kotakas'))return;
        el.remove();
      });

    const grid=findFooterGrid(footer);
    if(grid)grid.classList.add('k-footer-four-cols');
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
  [250,600,1200,2200,4000,7000,12000].forEach(ms=>setTimeout(queue,ms));
})();
