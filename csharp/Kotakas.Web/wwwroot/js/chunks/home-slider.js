(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;

  const mountSlider=()=>{
    let slider=document.querySelector('[data-k-slider]');
    if(slider)return slider;
    const oldHero=document.querySelector('.kp-promo-grid');
    if(!oldHero)return null;
    const section=document.createElement('section');
    section.className='k-hero-slider k-art-slider';
    section.setAttribute('aria-label','KOTAKAS kampanyaları');
    section.innerHTML=`<div class="k-slider-shell" data-k-slider>
      <div class="k-slider-track">
        <article class="k-slide k-slide-art" data-asset="s1" aria-hidden="false"><img alt="KOTAKAS kampanya görseli 1"><span class="k-slide-loading">KOTAKAS hazırlanıyor…</span></article>
        <article class="k-slide k-slide-art" data-asset="s2" aria-hidden="true"><img alt="KOTAKAS kampanya görseli 2"><span class="k-slide-loading">KOTAKAS hazırlanıyor…</span></article>
        <article class="k-slide k-slide-art" data-asset="s3" aria-hidden="true"><img alt="KOTAKAS kampanya görseli 3"><span class="k-slide-loading">KOTAKAS hazırlanıyor…</span></article>
      </div>
      <div class="k-slider-controls">
        <div class="k-slider-dots" aria-label="Slider seçimi">
          <button class="k-slider-dot active" aria-label="1. görsel" aria-current="true"></button>
          <button class="k-slider-dot" aria-label="2. görsel" aria-current="false"></button>
          <button class="k-slider-dot" aria-label="3. görsel" aria-current="false"></button>
        </div>
        <div class="k-slider-nav"><button type="button" data-slider-prev aria-label="Önceki görsel">‹</button><button type="button" data-slider-next aria-label="Sonraki görsel">›</button></div>
      </div>
      <div class="k-slider-progress" aria-hidden="true"><span></span></div>
    </div>`;
    oldHero.replaceWith(section);
    return section.querySelector('[data-k-slider]');
  };

  const slider=mountSlider();
  if(!slider)return;
  const track=slider.querySelector('.k-slider-track');
  const slides=[...slider.querySelectorAll('.k-slide')];
  const dots=[...slider.querySelectorAll('.k-slider-dot')];
  const prev=slider.querySelector('[data-slider-prev]');
  const next=slider.querySelector('[data-slider-next]');
  const progress=slider.querySelector('.k-slider-progress span');
  if(!track||slides.length<2)return;

  const FALLBACKS={
    s1:['/assets/slider-data/s1-00.txt','/assets/slider-data/s1-01.txt','/assets/slider-data/s1-02.txt','/assets/slider-data/s1-03.txt','/assets/slider-data/s1-04.txt'],
    s2:['/assets/slider-data/s2-00.txt','/assets/slider-data/s2-01.txt'],
    s3:['/assets/slider-data/slider-30-agustos.b64','/assets/slider-data/s3-01.txt','/assets/slider-data/s3-02.txt']
  };
  const STATIC_FALLBACK={
    s1:'/assets/images/games/knight-online.jpg',
    s2:'/assets/images/games/rise-online.jpg',
    s3:'/assets/images/games/mobile-legends.webp'
  };

  const fetchPart=async path=>{
    const r=await fetch(path,{cache:'force-cache'});
    if(!r.ok)throw new Error('missing '+path);
    return (await r.text()).replace(/\s+/g,'');
  };
  const mimeFor=b64=>b64.startsWith('UklG')?'image/webp':b64.startsWith('iVBOR')?'image/png':b64.startsWith('/9j/')?'image/jpeg':b64.startsWith('AAAAIGZ0eXBhdmlm')?'image/avif':'application/octet-stream';
  const objectUrl=b64=>{
    const raw=atob(b64);const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes],{type:mimeFor(b64)}));
  };
  const validImage=url=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(true);im.onerror=()=>resolve(false);im.src=url});
  const loadPartsFromText=async parts=>{
    const b64=parts.join('');const url=objectUrl(b64);
    if(await validImage(url))return url;
    URL.revokeObjectURL(url);throw new Error('invalid image');
  };
  const loadParts=async paths=>loadPartsFromText(await Promise.all(paths.map(fetchPart)));
  const loadFinal=async key=>{
    const parts=[];
    for(let i=0;i<24;i++){
      const path=`/assets/slider-final/${key}-${String(i).padStart(2,'0')}.txt`;
      let text;
      try{text=await fetchPart(path)}catch{throw new Error('final incomplete')}
      parts.push(text);
      if(text.length<7900)return loadPartsFromText(parts);
    }
    throw new Error('final incomplete');
  };
  const hydrateSlide=async slide=>{
    const key=slide.dataset.asset;const img=slide.querySelector('img');
    if(!key||!img)return;
    let url=null;
    try{url=await loadFinal(key)}catch{
      try{url=await loadParts(FALLBACKS[key]||[])}catch{url=STATIC_FALLBACK[key]||''}
    }
    if(url){img.src=url;img.classList.add('ready');slide.classList.add('is-ready')}
  };
  slides.forEach(hydrateSlide);

  let index=0,timer=null,paused=false;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const restartProgress=()=>{
    if(!progress)return;
    progress.classList.remove('play');void progress.offsetWidth;
    if(!reduce&&!paused)progress.classList.add('play');
  };
  const restartTimer=()=>{
    clearInterval(timer);if(reduce||paused)return;
    timer=setInterval(()=>render(index+1),6000);
  };
  const render=(nextIndex,user=false)=>{
    index=(nextIndex+slides.length)%slides.length;
    track.style.transform=`translateX(-${index*100}%)`;
    slides.forEach((s,i)=>s.setAttribute('aria-hidden',i===index?'false':'true'));
    dots.forEach((d,i)=>{d.classList.toggle('active',i===index);d.setAttribute('aria-current',i===index?'true':'false')});
    restartProgress();if(user)restartTimer();
  };
  dots.forEach((dot,i)=>dot.addEventListener('click',()=>render(i,true)));
  prev?.addEventListener('click',()=>render(index-1,true));
  next?.addEventListener('click',()=>render(index+1,true));
  slider.addEventListener('mouseenter',()=>{paused=true;clearInterval(timer);progress?.classList.remove('play')});
  slider.addEventListener('mouseleave',()=>{paused=false;restartProgress();restartTimer()});
  slider.addEventListener('focusin',()=>{paused=true;clearInterval(timer);progress?.classList.remove('play')});
  slider.addEventListener('focusout',e=>{if(slider.contains(e.relatedTarget))return;paused=false;restartProgress();restartTimer()});
  let touchX=null;
  slider.addEventListener('touchstart',e=>{touchX=e.touches?.[0]?.clientX??null},{passive:true});
  slider.addEventListener('touchend',e=>{if(touchX==null)return;const end=e.changedTouches?.[0]?.clientX??touchX;const diff=end-touchX;touchX=null;if(Math.abs(diff)>45)render(index+(diff<0?1:-1),true)},{passive:true});
  render(0);restartTimer();
})();
