(()=>{
  // KOTAKAS oyun kartları güvenli kapak modu.
  // Bozuk sprite kapaklarını devre dışı bırakır; mevcut gerçek kapakları ve yerel logoları korur.
  function ensureStyle(){
    if(document.getElementById('kSafeGameCoverFix'))return;
    const s=document.createElement('style');
    s.id='kSafeGameCoverFix';
    s.textContent=`
      .game-market-media.k-exact-generated-cover{background-image:none!important;background-color:transparent!important}
      .game-market-media.k-exact-generated-cover .game-market-cover{display:block!important;width:100%!important;height:100%!important;object-fit:cover!important}
      .game-market-media.k-exact-generated-cover .game-market-logo-wrap{display:flex!important;position:absolute!important;inset:0!important;align-items:center!important;justify-content:center!important;z-index:4!important;pointer-events:none!important}
      .game-market-media.k-exact-generated-cover .game-market-media-glow{display:block!important}
      .game-market-media.k-exact-generated-cover:after{display:none!important}
      .game-market-media.no-cover,.game-market-media.k-cover-fallback{background:radial-gradient(circle at 50% 38%,rgba(255,40,90,.12),transparent 45%),linear-gradient(135deg,#101320,#17111d 55%,#0b1019)!important}
      .game-market-media .game-market-logo-wrap{display:flex!important}
      .game-market-media .game-market-real-logo{display:block!important;max-width:72%!important;max-height:72px!important;object-fit:contain!important;filter:drop-shadow(0 3px 12px rgba(0,0,0,.55))!important}
      .game-market-media .k-game-logo-fallback.show{display:inline-flex!important}
    `;
    document.head.appendChild(s);
  }

  function apply(){
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      media.classList.remove('k-exact-generated-cover','k-exclusive-cover','k-exact-cover-v2');
      media.style.removeProperty('background-position');
      media.style.removeProperty('background-size');
      media.style.removeProperty('background-image');
      if(!media.querySelector('.game-market-cover')) media.classList.add('k-cover-fallback');
      else media.classList.remove('k-cover-fallback');
    });
    window.kRefreshLocalGameLogos?.();
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  [0,100,250,600,1200,2200].forEach(ms=>setTimeout(apply,ms));
  window.kRefreshExclusiveGameCovers=apply;
})();