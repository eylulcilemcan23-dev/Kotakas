(()=>{
  // Footer'da yalnız KOTAKAS + Hukuki + Destek + Knight Online kalacak.
  // Türkçe büyük I harfi (RISE -> rıse) yüzünden önceki sürüm eşleşmiyordu.
  const norm=v=>String(v||'')
    .replace(/\s+/g,' ')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g,'i')
    .replace(/\u0307/g,'');

  let queued=false;

  function footerRoot(){
    return document.querySelector('footer.kp-footer,footer,.kp-footer,.site-footer,[data-footer]');
  }

  function removeColumn(node,footer){
    if(!node||!footer||!footer.contains(node))return;
    let block=node;
    while(block.parentElement&&block.parentElement!==footer){
      const parent=block.parentElement;
      if(parent.classList?.contains('kp-footer-main')||parent.classList?.contains('k-footer-four-cols'))break;
      block=parent;
    }
    if(block&&block!==footer)block.remove();
  }

  function removeRise(){
    const footer=footerRoot();
    if(!footer)return;

    // 1) Başlıktan kaldır: RISE ONLINE / Rise Online / Türkçe I fark etmez.
    [...footer.querySelectorAll('h1,h2,h3,h4,h5,h6,strong')].forEach(el=>{
      if(norm(el.textContent)==='rise online')removeColumn(el,footer);
    });

    // 2) Linklerden kaldır: başlık başka biçimde yazılsa bile sütunu yakala.
    [...footer.querySelectorAll('a[href*="rise-online"],a[href*="game=rise-online"]')].forEach(a=>{
      let block=a;
      while(block.parentElement&&block.parentElement!==footer){
        const parent=block.parentElement;
        const text=norm(parent.textContent);
        if(parent.classList?.contains('kp-footer-main')||parent.classList?.contains('k-footer-four-cols'))break;
        block=parent;
        if(text.includes('rise online')&&!text.includes('knight online')&&!text.includes('hukuki')&&!text.includes('destek')&&!text.includes('kotakas')){
          // Rise sütununu bulduk; bir üst grid'e çıkmadan burada kal.
          if(block.parentElement?.classList?.contains('kp-footer-main')||block.parentElement?.classList?.contains('k-footer-four-cols'))break;
        }
      }
      if(block&&block!==footer)block.remove();
    });

    // 3) Artık metin kalmışsa sadece Rise'a ait küçük bloğu temizle.
    [...footer.querySelectorAll('div,nav,section,article,ul')].forEach(el=>{
      if(!el.isConnected)return;
      const text=norm(el.textContent);
      if(!text.includes('rise online'))return;
      if(text.includes('knight online')||text.includes('hukuki')||text.includes('destek')||text.includes('kotakas'))return;
      removeColumn(el,footer);
    });

    // Dört ana sütunu düzgün hizala.
    const grid=footer.querySelector('.kp-footer-main')||footer.querySelector('.k-footer-four-cols');
    if(grid){
      grid.classList.add('k-footer-four-cols');
      grid.style.setProperty('display','grid','important');
      grid.style.setProperty('grid-template-columns','minmax(300px,1.45fr) repeat(3,minmax(180px,1fr))','important');
      grid.style.setProperty('column-gap','72px','important');
      grid.style.setProperty('row-gap','28px','important');
      grid.style.setProperty('align-items','start','important');
    }
  }

  function clean(){queued=false;removeRise()}
  function queue(){if(queued)return;queued=true;requestAnimationFrame(clean)}

  clean();
  const mo=new MutationObserver(queue);
  mo.observe(document.documentElement,{childList:true,subtree:true});
  [50,120,250,500,900,1500,2500,4000,7000,12000].forEach(ms=>setTimeout(queue,ms));
})();
