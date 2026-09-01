(()=>{
  const VERSION='20260901-1238-pubg-img-layer';
  const COVER=`/assets/images/games/pubg-mobile-kotakas.jpg?v=${VERSION}`;

  function findMedia(){
    return document.querySelector('.game-market-media[data-game-code="pubg-mobile"]')
      || document.querySelector('[data-game-code="pubg-mobile"] .game-market-media')
      || [...document.querySelectorAll('.game-market-tile')].find(x=>/PUBG Mobile/i.test(x.textContent||''))?.querySelector('.game-market-media');
  }

  function force(){
    const media=findMedia();
    if(!media)return;

    media.style.setProperty('position','relative','important');
    media.style.setProperty('overflow','hidden','important');
    media.style.setProperty('isolation','isolate','important');
    media.style.setProperty('background-color','#090b12','important');

    let bg=media.querySelector(':scope > .k-pubg-card-bg-v2');
    if(!bg){
      bg=document.createElement('img');
      bg.className='k-pubg-card-bg-v2';
      bg.alt='';
      bg.setAttribute('aria-hidden','true');
      bg.decoding='async';
      bg.loading='eager';
      media.prepend(bg);
    }

    if(!bg.getAttribute('src')?.includes('pubg-mobile-kotakas.jpg')) bg.src=COVER;
    bg.style.setProperty('position','absolute','important');
    bg.style.setProperty('inset','0','important');
    bg.style.setProperty('width','100%','important');
    bg.style.setProperty('height','100%','important');
    bg.style.setProperty('object-fit','cover','important');
    bg.style.setProperty('object-position','center 42%','important');
    bg.style.setProperty('display','block','important');
    bg.style.setProperty('opacity','1','important');
    bg.style.setProperty('visibility','visible','important');
    bg.style.setProperty('z-index','0','important');
    bg.style.setProperty('pointer-events','none','important');

    const oldCover=media.querySelector('.game-market-cover');
    if(oldCover)oldCover.style.setProperty('display','none','important');
    const glow=media.querySelector('.game-market-media-glow');
    if(glow)glow.style.setProperty('display','none','important');

    const logo=media.querySelector('.game-market-logo-wrap');
    if(logo){
      logo.style.setProperty('display','flex','important');
      logo.style.setProperty('position','absolute','important');
      logo.style.setProperty('inset','0','important');
      logo.style.setProperty('z-index','6','important');
      logo.style.setProperty('align-items','center','important');
      logo.style.setProperty('justify-content','center','important');
      logo.style.setProperty('pointer-events','none','important');
    }
  }

  [0,100,250,500,900,1500,2500,4000].forEach(ms=>setTimeout(force,ms));
  new MutationObserver(()=>requestAnimationFrame(force)).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',force);
  window.addEventListener('pageshow',force);
  window.kForcePubgCardImage=force;
})();
