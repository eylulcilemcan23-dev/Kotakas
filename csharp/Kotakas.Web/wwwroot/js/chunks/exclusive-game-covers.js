(()=>{
  const VERSION='20260901-0630-pubg-kotakas-cover';
  const SPRITE=`/assets/images/games/kotakas-hd-covers-v7.webp?v=${VERSION}`;
  const PUBGCOVER=`/assets/images/games/pubg-mobile-kotakas.jpg?v=${VERSION}`;
  const ORDER=['knight-online','rise-online','pubg-mobile','metin2','silkroad-online','valorant','league-of-legends','mobile-legends','free-fire','world-of-warcraft','lost-ark','albion-online','roblox','fortnite','ea-fc','steam'];
  const POS=Object.fromEntries(ORDER.map((code,i)=>[code,[i%4,Math.floor(i/4)]]));
  let ready=false;

  function ensureStyle(){
    if(document.getElementById('kHdGameCoverV7Style'))return;
    ['kSafeGameCoverFix','kExactGeneratedCoverStyle','kExactCoverStyleV3','kExactGameCoverV4Style','kExactGameCoverV5Style','kExactGameCoverV6Style'].forEach(id=>document.getElementById(id)?.remove());
    const s=document.createElement('style');
    s.id='kHdGameCoverV7Style';
    s.textContent=`
      .game-market-media.k-hd-cover-v7{
        position:relative!important;
        overflow:hidden!important;
        background-image:url("${SPRITE}")!important;
        background-size:400% 400%!important;
        background-repeat:no-repeat!important;
        background-color:#090b12!important;
        isolation:isolate!important;
      }
      .game-market-media.k-hd-cover-v7.k-pubg-kotakas-cover{
        background-image:url("${PUBGCOVER}")!important;
        background-size:cover!important;
        background-position:center center!important;
      }
      .game-market-media.k-hd-cover-v7 .game-market-cover{display:none!important}
      .game-market-media.k-hd-cover-v7 .game-market-media-glow{display:none!important}
      .game-market-media.k-hd-cover-v7:before{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        z-index:2!important;
        pointer-events:none!important;
        background:linear-gradient(180deg,rgba(5,7,12,.02) 0%,rgba(5,7,12,.04) 38%,rgba(5,7,12,.34) 58%,rgba(5,7,12,.80) 80%,rgba(5,7,12,.93) 100%)!important;
      }
      .game-market-media.k-hd-cover-v7 .game-market-logo-wrap{
        display:flex!important;
        position:absolute!important;
        inset:0!important;
        z-index:5!important;
        align-items:center!important;
        justify-content:center!important;
        pointer-events:none!important;
      }
      .game-market-media.k-hd-cover-v7 .game-market-logo-wrap:before{
        content:""!important;
        position:absolute!important;
        width:72%!important;
        height:62%!important;
        left:14%!important;
        top:31%!important;
        border-radius:50%!important;
        background:radial-gradient(ellipse at center,rgba(7,9,15,.64) 0%,rgba(7,9,15,.48) 36%,rgba(7,9,15,.18) 62%,transparent 78%)!important;
        backdrop-filter:blur(4px) brightness(.76)!important;
        -webkit-backdrop-filter:blur(4px) brightness(.76)!important;
        pointer-events:none!important;
      }
      .game-market-media.k-hd-cover-v7 .game-market-real-logo,
      .game-market-media.k-hd-cover-v7 .k-game-logo-fallback{
        position:relative!important;
        z-index:2!important;
        filter:drop-shadow(0 3px 8px rgba(0,0,0,.72))!important;
      }
      .game-market-media.k-hd-cover-v7 .game-market-real-logo{
        max-width:54%!important;
        max-height:58px!important;
        width:auto!important;
        height:auto!important;
        object-fit:contain!important;
      }
      .game-market-media.k-hd-cover-v7 .k-game-logo-fallback.show{
        display:block!important;
        color:#fff!important;
        font-size:22px!important;
        font-weight:950!important;
      }
      @media(max-width:680px){
        .game-market-media.k-hd-cover-v7 .game-market-real-logo{max-width:58%!important;max-height:50px!important}
        .game-market-media.k-hd-cover-v7 .game-market-logo-wrap:before{width:78%!important;left:11%!important;height:66%!important;top:29%!important}
      }
    `;
    document.head.appendChild(s);
  }

  function apply(){
    if(!ready)return;
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      const code=media.getAttribute('data-game-code');
      const p=POS[code];if(!p)return;
      media.classList.remove('no-cover','k-cover-fallback','k-exclusive-cover','k-exact-generated-cover','k-exact-cover-v2','k-exact-cover-v3','k-exact-cover-v4','k-exact-cover-v5','k-exact-cover-v6','k-pubg-kotakas-cover');
      media.classList.add('has-cover','k-hd-cover-v7');
      if(code==='pubg-mobile'){
        media.classList.add('k-pubg-kotakas-cover');
        media.style.removeProperty('background-position');
      }else{
        media.style.setProperty('background-position',`${p[0]*100/3}% ${p[1]*100/3}%`,'important');
      }
    });
    window.kRefreshLocalGameLogos?.();
  }

  function fallback(){
    document.querySelectorAll('.game-market-media').forEach(media=>{
      media.classList.remove('k-hd-cover-v7','k-pubg-kotakas-cover');
      media.style.removeProperty('background-position');
    });
    window.kRefreshLocalGameLogos?.();
  }

  function load(){
    const spriteImg=new Image();
    const pubgImg=new Image();
    let spriteOk=false,pubgOk=false;
    const done=()=>{
      if(!spriteOk)return;
      ready=true;
      [0,80,180,400,900,1600].forEach(ms=>setTimeout(apply,ms));
    };
    spriteImg.onload=()=>{spriteOk=!!(spriteImg.naturalWidth&&spriteImg.naturalHeight);done();};
    spriteImg.onerror=fallback;
    pubgImg.onload=()=>{pubgOk=!!(pubgImg.naturalWidth&&pubgImg.naturalHeight);done();};
    pubgImg.onerror=()=>{pubgOk=false;done();};
    spriteImg.src=SPRITE;
    pubgImg.src=PUBGCOVER;
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  load();
  window.kRefreshExclusiveGameCovers=apply;
})();
