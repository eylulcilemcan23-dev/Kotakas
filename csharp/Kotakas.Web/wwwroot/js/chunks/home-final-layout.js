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

  const statLabels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'].map(norm);

  function addCss(){
    if(document.getElementById('kHomeFinalLayoutCss'))return;
    const s=document.createElement('style');
    s.id='kHomeFinalLayoutCss';
    s.textContent=`
      #kHomeTopArea{display:block!important;min-height:0!important;height:auto!important;padding-bottom:12px!important}
      #kHomeTopArea>.kp-promo-main{display:flex!important;width:100%!important;margin-bottom:14px!important}
      #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:none!important;gap:14px!important;width:100%!important;min-height:0!important;margin:0!important}
      #kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final>.kp-promo-side{display:flex!important;min-height:176px!important;height:auto!important;margin:0!important}
      #kHomeTopArea>#kHomeStatsRow{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:14px!important;width:100%!important;margin:18px 0 8px!important;padding:0!important}
      #kHomeStatsRow .k-home-stat-card{min-height:120px!important;padding:22px 24px!important;border-radius:12px!important;border:1px solid #34384a!important;background:#171925!important;box-shadow:0 12px 28px rgba(0,0,0,.20)!important;display:flex!important;align-items:center!important;gap:16px!important;box-sizing:border-box!important;text-decoration:none!important;color:#fff!important}
      #kHomeStatsRow .k-home-stat-icon{width:52px!important;height:52px!important;flex:0 0 52px!important;border-radius:13px!important;display:grid!important;place-items:center!important;background:#222536!important;font-size:25px!important}
      #kHomeStatsRow .k-home-stat-copy{display:flex!important;flex-direction:column!important;gap:6px!important;min-width:0!important}
      #kHomeStatsRow .k-home-stat-copy strong{font-size:20px!important;line-height:1.05!important;color:#fff!important}
      #kHomeStatsRow .k-home-stat-copy span{font-size:11px!important;line-height:1.35!important;color:#a0a6b7!important}
      @media(max-width:980px){#kHomeTopArea>.kp-promo-stack.k-home-promo-stack-final{grid-template-columns:1fr!important}#kHomeTopArea>#kHomeStatsRow{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:620px){#kHomeTopArea>#kHomeStatsRow{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function killLegacyStats(){
    const main=document.querySelector('main');
    const top=document.getElementById('kHomeTopArea');
    const keep=document.getElementById('kHomeStatsRow');
    if(!main||!top||!keep)return;

    // Yeni büyük kartların dışındaki, dört eski başlığı birden taşıyan en küçük satırı bul ve sil.
    let removed=true;
    while(removed){
      removed=false;
      const candidates=[...main.querySelectorAll('section,div,aside,article')]
        .filter(el=>el!==top&&el!==keep&&!top.contains(el)&&!el.contains(top)&&!keep.contains(el)&&!el.contains(keep))
        .filter(el=>{
          const t=norm(el.textContent);
          return statLabels.every(label=>t.includes(label));
        })
        .sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length);
      if(candidates.length){
        candidates[0].remove();
        removed=true;
      }
    }

    // Başka JS tek tek kartları yeniden basarsa onları da temizle.
    [...main.querySelectorAll('*')].forEach(el=>{
      if(top.contains(el)||keep.contains(el))return;
      const t=norm(el.textContent);
      if(!statLabels.includes(t))return;
      let card=el;
      while(card.parentElement&&card.parentElement!==main){
        const pt=norm(card.parentElement.textContent);
        const hits=statLabels.filter(x=>pt.includes(x)).length;
        if(hits>1)break;
        card=card.parentElement;
      }
      if(card!==main&&!top.contains(card)&&!keep.contains(card))card.remove();
    });

    [...document.querySelectorAll('#kHomeStatsRow')].forEach((row,i)=>{if(i>0)row.remove()});
  }

  async function refreshStats(){
    try{
      const d=typeof api==='function'?await api('/api/public/stats'):await fetch('/api/public/stats').then(r=>r.json());
      const a=document.getElementById('kpCompletedDeals');
      const b=document.getElementById('kpUsers');
      const c=document.getElementById('kpTraders');
      if(a)a.textContent=Number(d.completedDeals||0).toLocaleString('tr-TR');
      if(b)b.textContent=Number(d.users||0).toLocaleString('tr-TR')+'+';
      if(c)c.textContent=Number(d.traders||0).toLocaleString('tr-TR')+'+';
    }catch{}
  }

  let queued=false;
  function apply(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      addCss();
      killLegacyStats();
    });
  }

  apply();
  refreshStats();
  new MutationObserver(apply).observe(document.documentElement,{childList:true,subtree:true});
  [100,300,700,1200,2000,3500,6000,10000,16000].forEach(ms=>setTimeout(apply,ms));
})();
