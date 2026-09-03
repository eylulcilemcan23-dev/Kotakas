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

  const promoDefs=[
    {key:'gold bar & item',cls:'gold',html:'<small>KNIGHT ONLINE</small><h3>Gold Bar & Item</h3><p>ZERO ve diğer sunuculardaki güncel item ve GB pazarını incele.</p><a class="btn" href="/buy.html?game=knight-online">GB Al</a>'},
    {key:'bize sat — hızlı işlem',cls:'red',html:'<small>ANINDA TEKLİF</small><h3>Bize Sat — Hızlı İşlem</h3><p>KO ve desteklenen oyunlardaki varlıkların için hızlı fiyat talebi oluştur.</p><a class="btn" href="/urgent-sell.html">Hızlı Sat</a>'},
    {key:'pazarcı başvurusu',cls:'purple',html:'<small>KOTAKAS PAZARCI PROGRAMI</small><h3>Pazarcı Başvurusu</h3><p>Mağazanı aç, item ve GB ilanlarını yayınla, KOTAKAS üzerinden satış yap.</p><a class="btn" href="/trader-apply.html">Başvuru Yap</a>'}
  ];
  const statLabels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'];

  function css(){
    if(document.getElementById('kHomeFinalLayoutCss'))return;
    const s=document.createElement('style');
    s.id='kHomeFinalLayoutCss';
    s.textContent=`
      body.k-home-simplified #kHomeTopArea.kp-promo-grid,
      #kHomeTopArea.kp-promo-grid{display:block!important;min-height:0!important;height:auto!important;padding-bottom:12px!important}
      body.k-home-simplified #kHomeTopArea>.kp-promo-main,
      #kHomeTopArea>.kp-promo-main{display:flex!important;width:100%!important;margin-bottom:14px!important}
      body.k-home-simplified #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final,
      #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:none!important;gap:14px!important;width:100%!important;min-height:0!important;margin:0!important}
      body.k-home-simplified #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final>.kp-promo-side,
      #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final>.kp-promo-side{display:flex!important;min-height:176px!important;height:auto!important;margin:0!important}
      body.k-home-simplified #kHomeTopArea>#kHomeStatsRow,
      #kHomeTopArea>#kHomeStatsRow{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important;width:100%!important;margin:18px 0 8px!important;padding:0!important;min-height:0!important}
      #kHomeStatsRow .k-home-stat-card{min-height:120px!important;padding:22px 24px!important;border-radius:12px!important;border:1px solid #34384a!important;background:#171925!important;box-shadow:0 12px 28px rgba(0,0,0,.20)!important;display:flex!important;align-items:center!important;gap:16px!important;box-sizing:border-box!important;text-decoration:none!important;color:#fff!important}
      #kHomeStatsRow .k-home-stat-icon{width:52px!important;height:52px!important;flex:0 0 52px!important;border-radius:13px!important;display:grid!important;place-items:center!important;background:#222536!important;font-size:25px!important}
      #kHomeStatsRow .k-home-stat-copy{display:flex!important;flex-direction:column!important;gap:6px!important;min-width:0!important}
      #kHomeStatsRow .k-home-stat-copy strong{font-size:20px!important;line-height:1.05!important;color:#fff!important}
      #kHomeStatsRow .k-home-stat-copy span{font-size:11px!important;line-height:1.35!important;color:#a0a6b7!important}
      .kp-home .k-home-latest-items{margin-top:0!important;padding-top:14px!important}
      @media(max-width:980px){body.k-home-simplified #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final,#kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final{grid-template-columns:1fr!important}body.k-home-simplified #kHomeTopArea>#kHomeStatsRow,#kHomeTopArea>#kHomeStatsRow{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:620px){body.k-home-simplified #kHomeTopArea>#kHomeStatsRow,#kHomeTopArea>#kHomeStatsRow{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function ensurePromo(top){
    let stack=top.querySelector(':scope > .kp-promo-stack');
    if(!stack){stack=document.createElement('div');stack.className='kp-promo-stack k-home-promo-stack-final';top.appendChild(stack)}
    stack.classList.add('k-home-promo-stack-final');

    [...stack.querySelectorAll(':scope > .kp-promo-side')].forEach(card=>{
      if(!promoDefs.some(d=>norm(card.textContent).includes(norm(d.key))))card.remove();
    });

    promoDefs.forEach(def=>{
      let card=[...stack.querySelectorAll(':scope > .kp-promo-side')].find(x=>norm(x.textContent).includes(norm(def.key)));
      if(!card){card=document.createElement('article');card.className=`kp-promo-side ${def.cls}`;card.innerHTML=def.html}
      card.classList.add(def.cls);
      stack.appendChild(card);
    });
    return stack;
  }

  function statsMarkup(){return `
    <div class="k-home-stat-card" data-home-stat="completed"><div class="k-home-stat-icon">🤝</div><div class="k-home-stat-copy"><strong id="kpCompletedDeals">0</strong><span>Tamamlanan işlem</span></div></div>
    <div class="k-home-stat-card" data-home-stat="users"><div class="k-home-stat-icon">👥</div><div class="k-home-stat-copy"><strong id="kpUsers">1+</strong><span>Kayıtlı kullanıcı</span></div></div>
    <div class="k-home-stat-card" data-home-stat="traders"><div class="k-home-stat-icon">🏪</div><div class="k-home-stat-copy"><strong id="kpTraders">0+</strong><span>Doğrulanmış pazarcı</span></div></div>
    <a class="k-home-stat-card" data-home-stat="support" href="/support.html"><div class="k-home-stat-icon">🎧</div><div class="k-home-stat-copy"><strong>Destek Merkezi</strong><span>İşlem sorunlarında KOTAKAS yanında</span></div></a>`}

  function ensureStats(top,stack){
    let row=top.querySelector(':scope > #kHomeStatsRow');
    if(!row){row=document.createElement('section');row.id='kHomeStatsRow';row.dataset.kHomeStats='1';row.setAttribute('aria-label','KOTAKAS istatistikleri');row.innerHTML=statsMarkup()}
    if(stack.nextElementSibling!==row)stack.insertAdjacentElement('afterend',row);
    return row;
  }

  function removeLegacyStats(row){
    const main=document.querySelector('main');
    if(!main)return;
    const groups=[...main.querySelectorAll('section,div')]
      .filter(el=>el!==row&&!row.contains(el)&&!el.contains(row))
      .filter(el=>{const t=norm(el.textContent);return statLabels.every(x=>t.includes(x))})
      .sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
    if(groups[0])groups[0].remove();

    [...document.querySelectorAll('#kHomeStatsRow')].forEach((x,i)=>{if(i>0)x.remove()});
  }

  let loaded=false;
  async function loadStats(){
    if(loaded)return;
    try{
      const d=typeof api==='function'?await api('/api/public/stats'):await fetch('/api/public/stats').then(r=>r.json());
      const a=document.getElementById('kpCompletedDeals'),b=document.getElementById('kpUsers'),c=document.getElementById('kpTraders');
      if(a)a.textContent=Number(d.completedDeals||0).toLocaleString('tr-TR');
      if(b)b.textContent=Number(d.users||0).toLocaleString('tr-TR')+'+';
      if(c)c.textContent=Number(d.traders||0).toLocaleString('tr-TR')+'+';
      loaded=true;
    }catch{}
  }

  let queued=false;
  function apply(){
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{
      queued=false;css();
      const top=document.getElementById('kHomeTopArea')||document.querySelector('.kp-promo-grid');
      if(!top)return;
      top.id='kHomeTopArea';
      const stack=ensurePromo(top);
      const row=ensureStats(top,stack);
      removeLegacyStats(row);
      loadStats();
    });
  }

  apply();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
  [100,300,700,1200,2000,3500,6000,10000,16000].forEach(ms=>setTimeout(apply,ms));
})();
