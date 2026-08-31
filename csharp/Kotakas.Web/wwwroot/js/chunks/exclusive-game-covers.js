(()=>{
  const VERSION='20260831-1925';
  const PARTS=[1,2,3,4,5].map(n=>`/assets/images/games/exact-cover-v6/part${n}.txt?v=${VERSION}`);
  const ORDER=['knight-online','rise-online','pubg-mobile','metin2','silkroad-online','valorant','league-of-legends','mobile-legends','free-fire','world-of-warcraft','lost-ark','albion-online','roblox','fortnite','ea-fc','steam'];
  const POS=Object.fromEntries(ORDER.map((code,i)=>[code,[i%4,Math.floor(i/4)]]));
  let sprite='';
  let ready=false;

  function ensureStyle(){
    document.getElementById('kSafeGameCoverFix')?.remove();
    document.getElementById('kExactGeneratedCoverStyle')?.remove();
    document.getElementById('kExactCoverStyleV3')?.remove();
    document.getElementById('kExactGameCoverV4Style')?.remove();
    document.getElementById('kExactGameCoverV5Style')?.remove();
    if(document.getElementById('kExactGameCoverV6Style')||!sprite)return;
    const s=document.createElement('style');
    s.id='kExactGameCoverV6Style';
    s.textContent=`
      .game-market-media.k-exact-cover-v6{
        background-image:url("${sprite}")!important;
        background-size:400% 400%!important;
        background-repeat:no-repeat!important;
        background-color:#090b12!important;
      }
      .game-market-media.k-exact-cover-v6 .game-market-cover,
      .game-market-media.k-exact-cover-v6 .game-market-logo-wrap,
      .game-market-media.k-exact-cover-v6 .game-market-media-glow{
        display:none!important;
      }
      .game-market-media.k-exact-cover-v6:after{
        content:""!important;
        position:absolute!important;
        inset:0!important;
        background:linear-gradient(180deg,transparent 80%,rgba(0,0,0,.10))!important;
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
      media.classList.remove('no-cover','k-cover-fallback','k-exclusive-cover','k-exact-generated-cover','k-exact-cover-v2','k-exact-cover-v3','k-exact-cover-v4','k-exact-cover-v5');
      media.classList.add('has-cover','k-exact-cover-v6');
      media.style.setProperty('background-position',`${p[0]*100/3}% ${p[1]*100/3}%`,'important');
    });
  }

  function fallback(err){
    console.warn('KOTAKAS özel oyun kapakları yüklenemedi; mevcut kapak ve logolar korunuyor.',err||'');
    document.querySelectorAll('.game-market-media').forEach(media=>{
      media.classList.remove('k-exact-cover-v6');
      media.style.removeProperty('background-position');
    });
    window.kRefreshLocalGameLogos?.();
  }

  async function load(){
    try{
      const chunks=await Promise.all(PARTS.map(async url=>{
        const r=await fetch(url,{cache:'no-store'});
        if(!r.ok)throw new Error(`${url} ${r.status}`);
        return (await r.text()).trim();
      }));
      const b64=chunks.join('');
      if(!b64.startsWith('/9j/')||!b64.endsWith('/9k='))throw new Error('Kapak verisi eksik veya bozuk');
      const candidate='data:image/jpeg;base64,'+b64;
      await new Promise((resolve,reject)=>{
        const img=new Image();
        img.onload=()=>img.naturalWidth>0?resolve():reject(new Error('Görsel boyutu okunamadı'));
        img.onerror=()=>reject(new Error('Kapak görseli çözülemedi'));
        img.src=candidate;
      });
      sprite=candidate;
      ready=true;
      [0,80,180,400,900,1600].forEach(ms=>setTimeout(apply,ms));
    }catch(err){fallback(err)}
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  load();
  window.kRefreshExclusiveGameCovers=apply;
})();