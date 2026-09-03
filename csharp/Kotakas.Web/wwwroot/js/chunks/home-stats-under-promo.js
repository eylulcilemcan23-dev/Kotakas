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

  const labels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'].map(norm);

  function addCss(){
    if(document.getElementById('kHomeStatsUnderPromoCss'))return;
    const s=document.createElement('style');
    s.id='kHomeStatsUnderPromoCss';
    s.textContent=`
      body.k-home-simplified .kp-promo-stack,
      .kp-promo-stack{
        display:grid!important;
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:14px!important;
        width:100%!important;
      }
      body.k-home-simplified .kp-promo-stack>.kp-promo-side,
      .kp-promo-stack>.kp-promo-side{
        min-height:178px!important;
      }
      #kHomeStatsRow.k-home-stats-row{
        width:100%!important;
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:16px!important;
        margin:18px 0 10px!important;
        padding:0!important;
      }
      #kHomeStatsRow .k-home-stat-card{
        min-height:126px!important;
        padding:24px 24px!important;
        border-radius:12px!important;
        border:1px solid #303446!important;
        background:#171925!important;
        box-shadow:0 12px 28px rgba(0,0,0,.20)!important;
        display:flex!important;
        align-items:center!important;
        gap:18px!important;
        box-sizing:border-box!important;
        transition:transform .18s ease,border-color .18s ease!important;
      }
      #kHomeStatsRow .k-home-stat-card:hover{
        border-color:#4b5068!important;
        transform:translateY(-2px)!important;
      }
      #kHomeStatsRow .k-home-stat-card strong,
      #kHomeStatsRow .k-home-stat-card b{
        font-size:21px!important;
        line-height:1.1!important;
      }
      #kHomeStatsRow .k-home-stat-card small,
      #kHomeStatsRow .k-home-stat-card span{
        line-height:1.35!important;
      }
      #kHomeStatsRow .k-home-stat-card .icon,
      #kHomeStatsRow .k-home-stat-card [class*="icon"]{
        font-size:29px!important;
      }
      @media(max-width:1100px){
        body.k-home-simplified .kp-promo-stack,.kp-promo-stack{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        #kHomeStatsRow.k-home-stats-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      }
      @media(max-width:700px){
        body.k-home-simplified .kp-promo-stack,.kp-promo-stack{grid-template-columns:1fr!important}
        #kHomeStatsRow.k-home-stats-row{grid-template-columns:1fr!important}
        #kHomeStatsRow .k-home-stat-card{min-height:104px!important;padding:20px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function exactLabelNode(label){
    return [...document.querySelectorAll('main *')]
      .filter(el=>norm(el.textContent)===label)
      .sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0]||null;
  }

  function cardFor(node){
    if(!node)return null;
    let cur=node;
    while(cur.parentElement&&cur.parentElement.tagName!=='MAIN'){
      const p=cur.parentElement;
      const text=norm(p.textContent);
      const hits=labels.filter(x=>text.includes(x)).length;
      if(hits>1)break;
      cur=p;
    }
    return cur;
  }

  function apply(){
    addCss();
    const stack=document.querySelector('.kp-promo-stack');
    if(!stack)return;

    const nodes=labels.map(exactLabelNode);
    if(nodes.some(x=>!x))return;

    const cards=nodes.map(cardFor);
    if(cards.some(x=>!x))return;

    let target=document.getElementById('kHomeStatsRow');
    if(!target){
      target=document.createElement('div');
      target.id='kHomeStatsRow';
      target.className='k-home-stats-row';
      stack.insertAdjacentElement('afterend',target);
    }else if(stack.nextElementSibling!==target){
      stack.insertAdjacentElement('afterend',target);
    }

    const oldParents=new Set(cards.map(card=>card.parentElement));
    cards.forEach(card=>{
      card.classList.add('k-home-stat-card');
      if(card.parentElement!==target)target.appendChild(card);
    });

    oldParents.forEach(parent=>{
      if(!parent||parent===target||!parent.isConnected)return;
      if(!parent.children.length||!norm(parent.textContent))parent.remove();
    });
  }

  let queued=false;
  const queue=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply()});
  };

  apply();
  const mo=new MutationObserver(queue);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  [120,300,600,1000,1600,2500,4000,7000,11000,16000].forEach(ms=>setTimeout(queue,ms));
})();
