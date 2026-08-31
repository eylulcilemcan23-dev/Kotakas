(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const V='20260831-2030';
  const assetBase='/assets/images/games/';
  const makeSources=stem=>['png','jpg','jpeg','webp'].map(ext=>`${assetBase}${stem}.${ext}?v=${V}`);
  const slides=[
    {srcs:makeSources('slider-1-genel-pazaryeri'),alt:'KOTAKAS Genel Pazaryeri',href:'/sell.html'},
    {srcs:makeSources('slider-2-hizli-teslimat'),alt:'Knight Online 7/24 Hızlı Teslimat',href:'/buy.html?game=knight-online'},
    {srcs:makeSources('slider-3-30-agustos'),alt:'30 Ağustos Zafer Bayramı',href:''},
    {srcs:makeSources('slider-4-bize-sat'),alt:'Knight Online Bize Sat',href:'/urgent-sell.html'}
  ];

  function addCss(){
    document.getElementById('kDirectSliderCss')?.remove();
    const s=document.createElement('style');
    s.id='kDirectSliderCss';
    s.textContent=`
      .kp-promo-main.k-direct-slider{position:relative!important;overflow:hidden!important;isolation:isolate!important;min-height:0!important;aspect-ratio:24/11!important;background:#07080d!important;border-radius:12px!important;padding:0!important}
      .k-direct-slide{position:absolute!important;inset:0!important;opacity:0!important;pointer-events:none!important;transition:opacity .42s ease!important;background:#07080d!important;overflow:hidden!important}
      .k-direct-slide.active{opacity:1!important;pointer-events:auto!important}
      .k-direct-slide-link{position:absolute!important;inset:0!important;display:block!important;z-index:2!important;text-decoration:none!important;color:inherit!important;overflow:hidden!important}
      .k-direct-zoom{position:absolute!important;inset:0!important;overflow:hidden!important;transform:scale(1.15);transform-origin:50% 48%;will-change:transform}
      .k-direct-slide.active .k-direct-zoom{animation:kDirectSlowZoom 5.9s linear forwards}
      @keyframes kDirectSlowZoom{0%{transform:scale(1.15)}100%{transform:scale(1.275)}}
      .k-direct-bg,.k-direct-art{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important}
      .k-direct-bg{object-fit:cover!important;object-position:center!important;filter:blur(32px) brightness(.28) saturate(.78) contrast(.9)!important;transform:scale(1.12)!important;opacity:.68!important;z-index:0!important}
      .k-direct-art{object-fit:contain!important;object-position:center!important;z-index:1!important;filter:none!important;background:transparent!important}
      .k-direct-slide.missing:after{content:'Slider görseli bulunamadı';position:absolute;inset:0;display:grid;place-items:center;color:#8992a8;font-size:13px;font-weight:800;letter-spacing:.05em;z-index:1}
      .k-direct-nav{position:absolute!important;z-index:6!important;top:50%!important;transform:translateY(-50%)!important;width:38px!important;height:38px!important;border-radius:50%!important;border:1px solid rgba(255,255,255,.24)!important;background:rgba(5,6,11,.7)!important;color:#fff!important;font-size:22px!important;cursor:pointer!important;display:grid!important;place-items:center!important;backdrop-filter:blur(8px)!important}
      .k-direct-nav.prev{left:12px!important}.k-direct-nav.next{right:12px!important}
      .k-direct-dots{position:absolute!important;z-index:6!important;left:50%!important;bottom:10px!important;transform:translateX(-50%)!important;display:flex!important;gap:6px!important;padding:5px 8px!important;border-radius:99px!important;background:rgba(5,6,10,.42)!important}
      .k-direct-dot{width:8px!important;height:8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.38)!important;cursor:pointer!important}.k-direct-dot.active{width:22px!important;border-radius:6px!important;background:#fff!important}
      @media(max-width:900px){.kp-promo-main.k-direct-slider{aspect-ratio:24/11!important}.k-direct-nav{width:32px!important;height:32px!important;font-size:18px!important}}
      @media(max-width:520px){.kp-promo-main.k-direct-slider{aspect-ratio:16/8!important;border-radius:8px!important}.k-direct-art{object-fit:contain!important}.k-direct-nav{width:28px!important;height:28px!important;font-size:16px!important}.k-direct-nav.prev{left:6px!important}.k-direct-nav.next{right:6px!important}.k-direct-dots{bottom:6px!important}.k-direct-dot{width:6px!important;height:6px!important}.k-direct-dot.active{width:17px!important}}
    `;
    document.head.appendChild(s);
  }

  function attachFallback(img,srcs,slideEl){
    let i=0;
    img.src=srcs[0];
    img.addEventListener('load',()=>slideEl?.classList.remove('missing'));
    img.addEventListener('error',()=>{
      i++;
      if(i<srcs.length){img.src=srcs[i];return;}
      slideEl?.classList.add('missing');
      img.style.display='none';
    });
  }

  function mount(){
    const host=document.querySelector('.kp-promo-main');
    if(!host)return;
    if(host.dataset.directSlider==='11'&&host.querySelectorAll('.k-direct-slide').length===slides.length)return;
    addCss();
    host.dataset.directSlider='11';
    host.classList.remove('k-game-slider');
    host.classList.add('k-direct-slider');
    host.innerHTML=slides.map((x,i)=>{
      const visual=`<div class="k-direct-zoom"><img class="k-direct-bg" alt="" aria-hidden="true"><img class="k-direct-art" alt="${x.alt}" decoding="async" ${i===0?'fetchpriority="high"':'loading="lazy"'}></div>`;
      return `<article class="k-direct-slide${i===0?' active':''}" data-i="${i}">${x.href?`<a class="k-direct-slide-link" href="${x.href}" aria-label="${x.alt}">${visual}</a>`:visual}</article>`;
    }).join('')+`<button class="k-direct-nav prev" type="button" aria-label="Önceki">‹</button><button class="k-direct-nav next" type="button" aria-label="Sonraki">›</button><div class="k-direct-dots">${slides.map((_,i)=>`<button class="k-direct-dot${i===0?' active':''}" type="button" data-i="${i}" aria-label="Slider ${i+1}"></button>`).join('')}</div>`;

    [...host.querySelectorAll('.k-direct-slide')].forEach((el,i)=>{
      el.querySelectorAll('img').forEach(img=>attachFallback(img,slides[i].srcs,el));
    });

    let current=0,timer=null,touchX=null;
    const restartZoom=el=>{
      const zoom=el?.querySelector('.k-direct-zoom');
      if(!zoom)return;
      zoom.style.animation='none';
      void zoom.offsetWidth;
      zoom.style.animation='';
    };
    const show=i=>{
      const items=[...host.querySelectorAll('.k-direct-slide')],dots=[...host.querySelectorAll('.k-direct-dot')];
      current=(i+items.length)%items.length;
      items.forEach((el,n)=>el.classList.toggle('active',n===current));
      dots.forEach((el,n)=>el.classList.toggle('active',n===current));
      restartZoom(items[current]);
    };
    const stop=()=>{if(timer){clearInterval(timer);timer=null;}};
    const start=()=>{stop();timer=setInterval(()=>show(current+1),6000);};
    host.querySelector('.prev')?.addEventListener('click',e=>{e.preventDefault();show(current-1);start();});
    host.querySelector('.next')?.addEventListener('click',e=>{e.preventDefault();show(current+1);start();});
    host.querySelector('.k-direct-dots')?.addEventListener('click',e=>{const b=e.target.closest('.k-direct-dot');if(!b)return;show(Number(b.dataset.i));start();});
    host.addEventListener('mouseenter',stop);host.addEventListener('mouseleave',start);
    host.addEventListener('touchstart',e=>{touchX=e.touches[0]?.clientX??null;},{passive:true});
    host.addEventListener('touchend',e=>{if(touchX==null)return;const x=e.changedTouches[0]?.clientX??touchX,d=x-touchX;if(Math.abs(d)>45)show(current+(d<0?1:-1));touchX=null;start();},{passive:true});
    restartZoom(host.querySelector('.k-direct-slide.active'));
    start();
  }

  mount();[300,750,1400].forEach(ms=>setTimeout(mount,ms));window.addEventListener('pageshow',()=>setTimeout(mount,80));
})();
