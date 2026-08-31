(()=>{
  const SRC='/assets/images/games/kotakas-exact-covers-v4.jpg?v=20260831-1905';
  const ORDER=['knight-online','rise-online','pubg-mobile','metin2','silkroad-online','valorant','league-of-legends','mobile-legends','free-fire','world-of-warcraft','lost-ark','albion-online','roblox','fortnite','ea-fc','steam'];
  const POS=Object.fromEntries(ORDER.map((code,i)=>[code,[i%4,Math.floor(i/4)]]));
  let ready=false;

  function ensureStyle(){
    document.getElementById('kSafeGameCoverFix')?.remove();
    document.getElementById('kExactGeneratedCoverStyle')?.remove();
    document.getElementById('kExactCoverStyleV3')?.remove();
    if(document.getElementById('kExactGameCoverV4Style'))return;
    const s=document.createElement('style');
    s.id='kExactGameCoverV4Style';
    s.textContent=`
      .game-market-media.k-exact-cover-v4{
        background-image:url("${SRC}")!important;
        background-size:400% 400%!important;
        background-repeat:no-repeat!important;
        background-color:#090b12!important;
      }
      .game-market-media.k-exact-cover-v4 .game-market-cover,
      .game-market-media.k-exact-cover-v4 .game-market-logo-wrap,
      .game-market-media.k-exact-cover-v4 .game-market-media-glow{
        display:none!important;
      }
      .game-market-media.k-exact-cover-v4:after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        background:linear-gradient(180deg,transparent 76%,rgba(0,0,0,.08))!important;
        pointer-events:none!important;
        z-index:2!important;
      }
    `;
    document.head.appendChild(s);
  }

  function apply(){
    if(!ready)return;
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      const code=media.getAttribute('data-game-code');
      const p=POS[code];
      if(!p)return;
      media.classList.remove('no-cover','k-cover-fallback','k-exclusive-cover','k-exact-generated-cover','k-exact-cover-v2','k-exact-cover-v3');
      media.classList.add('has-cover','k-exact-cover-v4');
      media.style.setProperty('background-position',`${p[0]*100/3}% ${p[1]*100/3}%`,'important');
    });
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});

  const preload=new Image();
  preload.onload=()=>{
    ready=true;
    [0,80,180,400,900,1600].forEach(ms=>setTimeout(apply,ms));
  };
  preload.onerror=()=>{
    console.warn('KOTAKAS oyun kapakları yüklenemedi; mevcut kapak ve logolar korunuyor.');
    window.kRefreshLocalGameLogos?.();
  };
  preload.src=SRC;
  window.kRefreshExclusiveGameCovers=apply;
})();