(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const slider=document.querySelector('[data-k-slider]');
  if(!slider)return;
  const track=slider.querySelector('.k-slider-track');
  const slides=[...slider.querySelectorAll('.k-slide')];
  const dots=[...slider.querySelectorAll('.k-slider-dot')];
  const prev=slider.querySelector('[data-slider-prev]');
  const next=slider.querySelector('[data-slider-next]');
  const progress=slider.querySelector('.k-slider-progress span');
  if(!track||slides.length<2)return;
  let index=0,timer=null,paused=false;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const restartProgress=()=>{
    if(!progress)return;
    progress.classList.remove('play');
    void progress.offsetWidth;
    if(!reduce&&!paused)progress.classList.add('play');
  };
  const render=(nextIndex,user=false)=>{
    index=(nextIndex+slides.length)%slides.length;
    track.style.transform=`translateX(-${index*100}%)`;
    slides.forEach((s,i)=>s.setAttribute('aria-hidden',i===index?'false':'true'));
    dots.forEach((d,i)=>{d.classList.toggle('active',i===index);d.setAttribute('aria-current',i===index?'true':'false')});
    restartProgress();
    if(user)restartTimer();
  };
  const restartTimer=()=>{
    clearInterval(timer);
    if(reduce||paused)return;
    timer=setInterval(()=>render(index+1),6000);
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
