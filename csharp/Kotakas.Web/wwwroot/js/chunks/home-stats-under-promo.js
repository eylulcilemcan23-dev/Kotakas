(()=>{
  const path=location.pathname.toLowerCase();
  if(path!=='/'&&!path.endsWith('/index.html'))return;

  const labels=['tamamlanan işlem','kayıtlı kullanıcı','doğrulanmış pazarcı','destek merkezi'];
  const norm=v=>String(v||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/ı/g,'i')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();

  function addCss(){
    if(document.getElementById('kHomeStatsUnderPromoCss'))return;
    const s=document.createElement('style');
    s.id='kHomeStatsUnderPromoCss';
    s.textContent=`
      .k-home-stats-row{
        width:100%!important;
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:16px!important;
        margin:18px 0 8px!important;
        padding:0!important;
      }
      .k-home-stat-card{
        min-height:112px!important;
        padding:20px 22px!important;
        border-radius:12px!important;
        border:1px solid #303446!important;
        background:#171925!important;
        box-shadow:0 12px 26px rgba(0,0,0,.18)!important;
        display:flex!important;
        align-items:center!important;
        gap:16px!important;
        box-sizing:border-box!important;
      }
      .k-home-stat-card:hover{border-color:#454a61!important;transform:translateY(-1px)!important}
      .k-home-stat-card strong,.k-home-stat-card b{font-size:18px!important;line-height:1.1!important}
      .k-home-stat-card small{font-size:11px!important;line-height:1.35!important}
      .k-home-stat-card .icon,.k-home-stat-card [class*="icon"],.k-home-stat-card>:first-child:not(div){font-size:24px!important}
      @media(max-width:980px){.k-home-stats-row{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
      @media(max-width:620px){.k-home-stats-row{grid-template-columns:1fr!important}.k-home-stat-card{min-height:96px!important}}
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
      const count=labels.filter(x=>norm(p.textContent).includes(x)).length;
      if(count>1)break;
      cur=p;
    }
    return cur;
  }

  function commonRow(cards){
    if(cards.length!==4)return null;
    let row=cards[0].parentElement;
    while(row&&row.tagName!=='MAIN'&&!cards.every(c=>row.contains(c)))row=row.parentElement;
    if(!row||row.tagName==='MAIN')return null;
    return row;
  }

  function apply(){
    addCss();
    const stack=document.querySelector('.kp-promo-stack');
    if(!stack)return;

    const nodes=labels.map(exactLabelNode);
    if(nodes.some(x=>!x))return;
    const cards=nodes.map(cardFor);
    if(cards.some(x=>!x))return;

    const row=commonRow(cards);
    if(!row)return;

    row.classList.add('k-home-stats-row');
    cards.forEach(card=>card.classList.add('k-home-stat-card'));

    if(stack.nextElementSibling!==row)stack.insertAdjacentElement('afterend',row);
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
  [200,500,900,1500,2500,4000,7000,11000].forEach(ms=>setTimeout(queue,ms));
})();
