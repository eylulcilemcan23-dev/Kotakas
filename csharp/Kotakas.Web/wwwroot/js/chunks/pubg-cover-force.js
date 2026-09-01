(()=>{
  const VERSION='20260901-1218-pubg-force';
  const COVER=`/assets/images/games/pubg-mobile-kotakas.webp?v=${VERSION}`;
  let imageReady=false;
  let mediaObserver=null;

  function forcePubgCover(){
    if(!imageReady)return;
    const media=document.querySelector('.game-market-media[data-game-code="pubg-mobile"]');
    if(!media)return;

    media.classList.add('has-cover','k-pubg-force-cover');
    media.classList.remove('no-cover','k-cover-fallback');

    const wanted=`url(\"${COVER}\")`;
    const current=media.style.getPropertyValue('background-image');
    if(!current.includes('pubg-mobile-kotakas')){
      media.style.setProperty('background-image',wanted,'important');
      media.style.setProperty('background-size','cover','important');
      media.style.setProperty('background-position','center 38%','important');
      media.style.setProperty('background-repeat','no-repeat','important');
      media.style.setProperty('background-color','#090b12','important');
    }

    const cover=media.querySelector('.game-market-cover');
    if(cover)cover.style.setProperty('display','none','important');
    const glow=media.querySelector('.game-market-media-glow');
    if(glow)glow.style.setProperty('display','none','important');

    const logoWrap=media.querySelector('.game-market-logo-wrap');
    if(logoWrap){
      logoWrap.style.setProperty('display','flex','important');
      logoWrap.style.setProperty('position','absolute','important');
      logoWrap.style.setProperty('inset','0','important');
      logoWrap.style.setProperty('z-index','6','important');
      logoWrap.style.setProperty('align-items','center','important');
      logoWrap.style.setProperty('justify-content','center','important');
    }

    if(!mediaObserver){
      mediaObserver=new MutationObserver(()=>requestAnimationFrame(forcePubgCover));
      mediaObserver.observe(media,{attributes:true,attributeFilter:['class','style']});
    }
  }

  const img=new Image();
  img.onload=()=>{
    imageReady=!!(img.naturalWidth&&img.naturalHeight);
    if(!imageReady)return;
    [0,50,150,350,750,1500,3000].forEach(ms=>setTimeout(forcePubgCover,ms));
  };
  img.onerror=()=>console.error('KOTAKAS PUBG kapak resmi yüklenemedi:',COVER);
  img.src=COVER;

  const domObserver=new MutationObserver(()=>requestAnimationFrame(forcePubgCover));
  domObserver.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('load',forcePubgCover);
  window.addEventListener('pageshow',forcePubgCover);
  window.kForcePubgCover=forcePubgCover;
})();
