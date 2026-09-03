(()=>{
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('tr-TR');
  let queued=false;

  function findExact(text){
    const want=norm(text);
    return [...document.querySelectorAll('body *')].filter(el=>norm(el.textContent)===want);
  }

  function removeColumnByTitle(text){
    const keep=['hukuki','destek','knight online','kotakas'];
    findExact(text).forEach(title=>{
      let block=title;
      while(block.parentElement&&block.parentElement!==document.body){
        const parent=block.parentElement;
        const parentText=norm(parent.textContent);
        if(keep.some(k=>parentText.includes(k)))break;
        block=parent;
      }
      if(block&&block!==document.body)block.remove();
    });
  }

  function removeResidualRise(){
    const needles=['rise online gold','rise online item','rise online karakter'];
    [...document.querySelectorAll('footer *, .kp-footer *, [class*="footer"] *')]
      .sort((a,b)=>a.querySelectorAll('*').length-b.querySelectorAll('*').length)
      .forEach(el=>{
        if(!el.isConnected)return;
        const text=norm(el.textContent);
        if(!needles.some(n=>text.includes(n)))return;
        if(text.includes('hukuki')||text.includes('destek')||text.includes('knight online')||text.includes('kotakas'))return;
        let block=el;
        while(block.parentElement&&block.parentElement!==document.body){
          const p=block.parentElement;
          const pt=norm(p.textContent);
          if(pt.includes('hukuki')||pt.includes('destek')||pt.includes('knight online')||pt.includes('kotakas'))break;
          block=p;
        }
        if(block&&block!==document.body)block.remove();
      });
  }

  function alignFooter(){
    const footer=[...document.querySelectorAll('footer,.kp-footer,.site-footer,[class*="footer"]')].find(f=>{
      const t=norm(f.textContent);
      return t.includes('hukuki')&&t.includes('destek')&&t.includes('knight online');
    });
    if(!footer)return;
    const wanted=['hukuki','destek','knight online'];
    const labels=[...footer.querySelectorAll('*')].filter(el=>wanted.includes(norm(el.textContent)));
    if(labels.length<3)return;
    let grid=labels[0].parentElement;
    while(grid&&grid!==footer&&!labels.every(x=>grid.contains(x)))grid=grid.parentElement;
    if(!grid||grid===footer)return;
    grid.style.setProperty('display','grid','important');
    grid.style.setProperty('grid-template-columns','minmax(300px,1.45fr) repeat(3,minmax(180px,1fr))','important');
    grid.style.setProperty('column-gap','72px','important');
    grid.style.setProperty('row-gap','28px','important');
    grid.style.setProperty('align-items','start','important');
  }

  function clean(){
    queued=false;
    removeColumnByTitle('Rise Online');
    removeColumnByTitle('Popüler Oyunlar');
    removeResidualRise();
    alignFooter();
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(clean);
  }

  clean();
  const mo=new MutationObserver(queue);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  [100,250,500,900,1500,2500,4000,7000,11000,16000].forEach(ms=>setTimeout(queue,ms));
  setTimeout(()=>mo.disconnect(),25000);
})();
