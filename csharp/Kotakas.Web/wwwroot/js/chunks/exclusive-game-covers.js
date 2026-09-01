(()=>{
  const VERSION='20260901-1218-pubg-independent';
  const PUBGCOVER=`/assets/images/games/pubg-mobile-kotakas.webp?v=${VERSION}`;
  let pubgReady=false;

  function ensureStyle(){
    if(document.getElementById('kPubgKotakasCoverStyle'))return;
    const s=document.createElement('style');
    s.id='kPubgKotakasCoverStyle';
    s.textContent=`
      .game-market-media.k-pubg-kotakas-cover{
        position:relative!important;
        overflow:hidden!important;
        background-image:url("${PUBGCOVER}")!important;
        background-size:cover!important;
        background-position:center center!important;
        background-repeat:no-repeat!important;
        background-color:#090b12!important;
        isolation:isolate!important;
      }
      .game-market-media.k-pubg-kotakas-cover .game-market-cover,
      .game-market-media.k-pubg-kotakas-cover .game-market-media-glow{display:none!important}
      .game-market-media.k-pubg-kotakas-cover:before{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:2!important;
        pointer-events:none!important;
        background:linear-gradient(180deg,rgba(5,7,12,.00) 0%,rgba(5,7,12,.03) 45%,rgba(5,7,12,.30) 68%,rgba(5,7,12,.72) 100%)!important;
      }
      .game-market-media.k-pubg-kotakas-cover .game-market-logo-wrap{
        display:flex!important;
        position:absolute!important;
        inset:0!important;
        z-index:5!important;
        align-items:center!important;
        justify-content:center!important;
        pointer-events:none!important;
      }
      .game-market-media.k-pubg-kotakas-cover .game-market-real-logo{
        position:relative!important;
        z-index:2!important;
        max-width:54%!important;
        max-height:58px!important;
        width:auto!important;
        height:auto!important;
        object-fit:contain!important;
        filter:drop-shadow(0 3px 8px rgba(0,0,0,.80))!important;
      }
      @media(max-width:680px){
        .game-market-media.k-pubg-kotakas-cover .game-market-real-logo{max-width:58%!important;max-height:50px!important}
      }
    `;
    document.head.appendChild(s);
  }

  function apply(){
    if(!pubgReady)return;
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code="pubg-mobile"]').forEach(media=>{
      media.classList.remove('no-cover','k-cover-fallback','k-exclusive-cover','k-exact-generated-cover','k-exact-cover-v2','k-exact-cover-v3','k-exact-cover-v4','k-exact-cover-v5','k-exact-cover-v6','k-hd-cover-v7');
      media.classList.add('has-cover','k-pubg-kotakas-cover');
      media.style.removeProperty('background-position');
      media.style.removeProperty('background-image');
    });
    window.kRefreshLocalGameLogos?.();
  }

  function load(){
    const img=new Image();
    img.onload=()=>{
      pubgReady=!!(img.naturalWidth&&img.naturalHeight);
      if(!pubgReady)return;
      [0,80,180,400,900,1600].forEach(ms=>setTimeout(apply,ms));
    };
    img.onerror=()=>{pubgReady=false;};
    img.src=PUBGCOVER;
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  load();
  window.kRefreshExclusiveGameCovers=apply;
})();
