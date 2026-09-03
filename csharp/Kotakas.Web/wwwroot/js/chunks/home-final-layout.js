(()=>{
  const path=location.pathname.toLowerCase();
  if(path!=='/'&&!path.endsWith('/index.html'))return;

  const norm=v=>String(v||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();

  const promoCards=[
    {
      cls:'gold',
      key:'gold bar & item',
      html:'<small>KNIGHT ONLINE</small><h3>Gold Bar & Item</h3><p>ZERO ve diğer sunuculardaki güncel item ve GB pazarını incele.</p><a class="btn" href="/buy.html?game=knight-online">GB Al</a>'
    },
    {
      cls:'red',
      key:'bize sat — hızlı işlem',
      html:'<small>ANINDA TEKLİF</small><h3>Bize Sat — Hızlı İşlem</h3><p>KO ve desteklenen oyunlardaki varlıkların için hızlı fiyat talebi oluştur.</p><a class="btn" href="/urgent-sell.html">Hızlı Sat</a>'
    },
    {
      cls:'purple',
      key:'pazarcı başvurusu',
      html:'<small>KOTAKAS PAZARCI PROGRAMI</small><h3>Pazarcı Başvurusu</h3><p>Mağazanı aç, item ve GB ilanlarını yayınla, KOTAKAS üzerinden satış yap.</p><a class="btn" href="/trader-apply.html">Başvuru Yap</a>'
    }
  ];

  const statLabels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'];

  function addCss(){
    if(document.getElementById('kHomeFinalLayoutCss'))return;
    const s=document.createElement('style');
    s.id='kHomeFinalLayoutCss';
    s.textContent=`
      body.k-home-simplified .kp-promo-stack.k-home-promo-stack-final,
      .kp-promo-stack.k-home-promo-stack-final{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        grid-template-rows:none!important;
        gap:14px!important;
        width:100%!important;
        min-height:0!important;
        margin-bottom:0!important;
      }
      .kp-promo-stack.k-home-promo-stack-final>.kp-promo-side{
        min-height:176px!important;
        height:auto!important;
        margin:0!important;
      }
      #kHomeStatsRow{
        width:100%!important;
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:14px!important;
        margin:18px 0 26px!important;
        padding:0!important;
      }
      #kHomeStatsRow .k-home-stat-card{
        min-height:118px!important;
        padding:21px 22px!important;
        border-radius:12px!important;
        border:1px solid #303446!important;
        background:#171925!important;
        box-shadow:0 12px 28px rgba(0,0,0,.18)!important;
        display:flex!important;
        align-items:center!important;
        gap:16px!important;
        box-sizing:border-box!important;
      }
      #kHomeStatsRow .k-home-stat-icon{
        width:50px!important;
        height:50px!important;
        flex:0 0 50px!important;
        border-radius:12px!important;
        display:grid!important;
        place-items:center!important;
        background:#222536!important;
        font-size:24px!important;
      }
      #kHomeStatsRow .k-home-stat-copy{display:flex!important;flex-direction:column!important;gap:5px!important;min-width:0!important}
      #kHomeStatsRow .k-home-stat-copy strong{font-size:20px!important;line-height:1!important;color:#fff!important}
      #kHomeStatsRow .k-home-stat-copy span{font-size:11px!important;line-height:1.3!important;color:#a0a6b7!important}
      @media(max-width:980px){
        body.k-home-simplified .kp-promo-stack.k-home-promo-stack-final,.kp-promo-stack.k-home-promo-stack-final{grid-template-columns:1fr!important}
        #kHomeStatsRow{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
      @media(max-width:620px){#kHomeStatsRow{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function ensurePromo(){
    const stack=document.querySelector('.kp-promo-stack');
    if(!stack)return null;
    stack.classList.add('k-home-promo-stack-final');

    const existing=[...stack.querySelectorAll(':scope > .kp-promo-side')];
    existing.forEach(card=>{
      const t=norm(card.textContent);
      if(!promoCards.some(x=>t.includes(norm(x.key))))card.remove();
    });

    promoCards.forEach(def=>{
      let card=[...stack.querySelectorAll(':scope > .kp-promo-side')].find(x=>norm(x.textContent).includes(norm(def.key)));
      if(!card){
        card=document.createElement('article');
        card.className=`kp-promo-side ${def.cls}`;
        card.innerHTML=def.html;
        stack.appendChild(card);
      }else{
        card.classList.add(def.cls);
      }
    });

    const ordered=promoCards.map(def=>[...stack.querySelectorAll(':scope > .kp-promo-side')].find(x=>norm(x.textContent).includes(norm(def.key)))).filter(Boolean);
    ordered.forEach(card=>stack.appendChild(card));
    return stack;
  }

  function statHtml(){
    return `
      <div class="k-home-stat-card" data-home-stat="completed"><div class="k-home-stat-icon">🤝</div><div class="k-home-stat-copy"><strong id="kpCompletedDeals">0</strong><span>Tamamlanan işlem</span></div></div>
      <div class="k-home-stat-card" data-home-stat="users"><div class="k-home-stat-icon">👥</div><div class="k-home-stat-copy"><strong id="kpUsers">1+</strong><span>Kayıtlı kullanıcı</span></div></div>
      <div class="k-home-stat-card" data-home-stat="traders"><div class="k-home-stat-icon">🏪</div><div class="k-home-stat-copy"><strong id="kpTraders">0+</strong><span>Doğrulanmış pazarcı</span></div></div>
      <a class="k-home-stat-card" data-home-stat="support" href="/support.html"><div class="k-home-stat-icon">🎧</div><div class="k-home-stat-copy"><strong>Destek Merkezi</strong><span>İşlem sorunlarında KOTAKAS yanında</span></div></a>`;
  }

  function ensureStats(stack){
    if(!stack)return null;
    let row=document.getElementById('kHomeStatsRow');
    if(!row){
      row=document.createElement('section');
      row.id='kHomeStatsRow';
      row.setAttribute('aria-label','KOTAKAS istatistikleri');
      row.innerHTML=statHtml();
    }
    if(stack.nextElementSibling!==row)stack.insertAdjacentElement('afterend',row);
    return row;
  }

  function removeOldStats(newRow){
    if(!newRow)return;
    const main=document.querySelector('main');
    if(!main)return;

    const candidates=[...main.querySelectorAll('*')].filter(el=>{
      if(newRow.contains(el))return false;
      const t=norm(el.textContent);
      return statLabels.includes(t);
    });

    candidates.forEach(label=>{
      let card=label.closest('a,article,.card,.tile,.stat,.kp-stat,.kp-stat-card,.kp-info-card');
      if(!card){
        card=label;
        while(card.parentElement&&card.parentElement!==main){
          const pt=norm(card.parentElement.textContent);
          const hits=statLabels.filter(x=>pt.includes(x)).length;
          if(hits>1)break;
          card=card.parentElement;
        }
      }
      if(card&&card!==main&&!newRow.contains(card))card.remove();
    });
  }

  let statsLoaded=false;
  async function loadStats(){
    if(statsLoaded)return;
    try{
      const d=typeof api==='function'?await api('/api/public/stats'):await fetch('/api/public/stats').then(r=>r.json());
      const completed=document.getElementById('kpCompletedDeals');
      const users=document.getElementById('kpUsers');
      const traders=document.getElementById('kpTraders');
      if(completed)completed.textContent=Number(d.completedDeals||0).toLocaleString('tr-TR');
      if(users)users.textContent=Number(d.users||0).toLocaleString('tr-TR')+'+';
      if(traders)traders.textContent=Number(d.traders||0).toLocaleString('tr-TR')+'+';
      statsLoaded=true;
    }catch{}
  }

  let running=false;
  function apply(){
    if(running)return;
    running=true;
    requestAnimationFrame(()=>{
      running=false;
      addCss();
      const stack=ensurePromo();
      const row=ensureStats(stack);
      removeOldStats(row);
      loadStats();
    });
  }

  apply();
  const mo=new MutationObserver(apply);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  [100,300,700,1200,2200,4000,7000,12000].forEach(ms=>setTimeout(apply,ms));
})();
