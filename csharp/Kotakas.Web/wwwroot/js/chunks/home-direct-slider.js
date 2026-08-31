(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const V='20260831-0915';
  const EMPTY='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const slides=[
    {
      chunks:[
        `/assets/slider-data/general-00.txt?v=${V}`,
        `/assets/slider-data/general-01.txt?v=${V}`,
        `/assets/slider-data/general-02.txt?v=${V}`,
        `/assets/slider-data/general-03.txt?v=${V}`
      ],
      mime:'image/avif',
      alt:'KOTAKAS Genel Pazaryeri',
      href:'/sell.html'
    },
    {
      b64:`/assets/slider-data/slider-hizli-teslimat.txt?v=${V}`,
      mime:'image/avif',
      alt:'Knight Online 7/24 Hızlı Teslimat',
      href:'/buy.html?game=knight-online'
    },
    {
      b64:`/assets/slider-data/slider-30-agustos.txt?v=${V}`,
      mime:'image/avif',
      alt:'30 Ağustos Zafer Bayramı',
      href:''
    },
    {
      src:`/assets/images/sliders/slider-knight-bize-sat.webp?v=${V}`,
      alt:'Knight Online Bize Sat',
      href:'/urgent-sell.html'
    }
  ];

  function addCss(){
    if(document.getElementById('kDirectSliderCss'))return;
    const s=document.createElement('style');
    s.id='kDirectSliderCss';
    s.textContent=`
      .kp-promo-main.k-direct-slider{position:relative!important;overflow:hidden!important;isolation:isolate!important;min-height:0!important;aspect-ratio:16/7!important;background:#07080d!important;border-radius:12px!important;padding:0!important}
      .k-direct-slide{position:absolute!important;inset:0!important;opacity:0!important;pointer-events:none!important;transition:opacity .42s ease!important;background:#07080d!important;overflow:hidden!important}
      .k-direct-slide.active{opacity:1!important;pointer-events:auto!important}
      .k-direct-slide-link{position:absolute!important;inset:0!important;display:block!important;z-index:1!important;text-decoration:none!important;color:inherit!important}
      .k-direct-bg,.k-direct-art{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important}
      .k-direct-bg{object-fit:cover!important;object-position:center!important;filter:blur(22px) brightness(.36) saturate(.92)!important;transform:scale(1.11)!important;opacity:.9!important}
      .k-direct-art{object-fit:contain!important;object-position:center!important;z-index:2!important;filter:none!important;background:transparent!important}
      .k-direct-slide.loading:after{content:'KOTAKAS';position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.22);font-size:13px;font-weight:900;letter-spacing:.2em;z-index:0}
      .k-direct-nav{position:absolute!important;z-index:6!important;top:50%!important;transform:translateY(-50%)!important;width:38px!important;height:38px!important;border-radius:50%!important;border:1px solid rgba(255,255,255,.24)!important;background:rgba(5,6,11,.70)!important;color:#fff!important;font-size:22px!important;cursor:pointer!important;display:grid!important;place-items:center!important;backdrop-filter:blur(8px)!important}
      .k-direct-nav.prev{left:12px!important}.k-direct-nav.next{right:12px!important}
      .k-direct-dots{position:absolute!important;z-index:6!important;left:50%!important;bottom:10px!important;transform:translateX(-50%)!important;display:flex!important;gap:6px!important;padding:5px 8px!important;border-radius:99px!important;background:rgba(5,6,10,.42)!important}
      .k-direct-dot{width:8px!important;height:8px!important;padding:0!important;border:0!important;border-radius:50%!important;background:rgba(255,255,255,.38)!important;cursor:pointer!important}
      .k-direct-dot.active{width:22px!important;border-radius:6px!important;background:#fff!important}
      @media(max-width:900px){.kp-promo-main.k-direct-slider{aspect-ratio:16/7!important}.k-direct-nav{width:32px!important;height:32px!important;font-size:18px!important}}
      @media(max-width:520px){.kp-promo-main.k-direct-slider{aspect-ratio:16/8!important;border-radius:8px!important}.k-direct-nav{width:28px!important;height:28px!important;font-size:16px!important}.k-direct-nav.prev{left:6px!important}.k-direct-nav.next{right:6px!important}.k-direct-dots{bottom:6px!important}.k-direct-dot{width:6px!important;height:6px!important}.k-direct-dot.active{width:17px!important}}
    `;
    document.head.appendChild(s);
  }

  async function sourceFor(slide){
    if(slide.src)return slide.src;
    let data='';
    if(slide.chunks?.length){
      const parts=[];
      for(const url of slide.chunks){
        const r=await fetch(url,{cache:'force-cache'});
        if(!r.ok)throw new Error('asset '+r.status);
        parts.push((await r.text()).trim());
      }
      data=parts.join('');
    }else if(slide.b64){
      const r=await fetch(slide.b64,{cache:'force-cache'});
      if(!r.ok)throw new Error('asset '+r.status);
      data=(await r.text()).trim();
    }
    return data?`data:${slide.mime};base64,${data}`:EMPTY;
  }

  async function hydrate(article,slide){
    try{
      const src=await sourceFor(slide);
      article.querySelectorAll('img').forEach(img=>{img.src=src;});
      article.classList.remove('loading');
    }catch(err){
      console.warn('KOTAKAS slider asset yüklenemedi',err);
    }
  }

  function mount(){
    const host=document.querySelector('.kp-promo-main');
    if(!host)return;
    if(host.dataset.directSlider==='2'&&host.querySelectorAll('.k-direct-slide').length===slides.length)return;
    addCss();
    host.dataset.directSlider='2';
    host.classList.remove('k-game-slider');
    host.classList.add('k-direct-slider');
    host.innerHTML=slides.map((x,i)=>{
      const src=x.src||EMPTY;
      const inner=`<img class="k-direct-bg" src="${src}" alt="" aria-hidden="true"><img class="k-direct-art" src="${src}" alt="${x.alt}" decoding="async" ${i===0?'fetchpriority="high"':'loading="lazy"'}>`;
      return `<article class="k-direct-slide loading${i===0?' active':''}" data-i="${i}">${x.href?`<a class="k-direct-slide-link" href="${x.href}" aria-label="${x.alt}">${inner}</a>`:inner}</article>`;
    }).join('')+`<button class="k-direct-nav prev" type="button" aria-label="Önceki">‹</button><button class="k-direct-nav next" type="button" aria-label="Sonraki">›</button><div class="k-direct-dots">${slides.map((_,i)=>`<button class="k-direct-dot${i===0?' active':''}" type="button" data-i="${i}" aria-label="Slider ${i+1}"></button>`).join('')}</div>`;

    [...host.querySelectorAll('.k-direct-slide')].forEach((el,i)=>hydrate(el,slides[i]));
    let current=0,timer=null,touchX=null;
    const show=i=>{
      const items=[...host.querySelectorAll('.k-direct-slide')];
      const dots=[...host.querySelectorAll('.k-direct-dot')];
      current=(i+items.length)%items.length;
      items.forEach((el,n)=>el.classList.toggle('active',n===current));
      dots.forEach((el,n)=>el.classList.toggle('active',n===current));
    };
    const stop=()=>{if(timer){clearInterval(timer);timer=null;}};
    const start=()=>{stop();timer=setInterval(()=>show(current+1),6000);};
    host.querySelector('.prev')?.addEventListener('click',e=>{e.preventDefault();show(current-1);start();});
    host.querySelector('.next')?.addEventListener('click',e=>{e.preventDefault();show(current+1);start();});
    host.querySelector('.k-direct-dots')?.addEventListener('click',e=>{const b=e.target.closest('.k-direct-dot');if(!b)return;show(Number(b.dataset.i));start();});
    host.addEventListener('mouseenter',stop);
    host.addEventListener('mouseleave',start);
    host.addEventListener('touchstart',e=>{touchX=e.touches[0]?.clientX??null;},{passive:true});
    host.addEventListener('touchend',e=>{if(touchX==null)return;const x=e.changedTouches[0]?.clientX??touchX;const d=x-touchX;if(Math.abs(d)>45){show(current+(d<0?1:-1));}touchX=null;start();},{passive:true});
    start();
  }

  mount();
  [300,750,1400].forEach(ms=>setTimeout(mount,ms));
  window.addEventListener('pageshow',()=>setTimeout(mount,80));
})();
