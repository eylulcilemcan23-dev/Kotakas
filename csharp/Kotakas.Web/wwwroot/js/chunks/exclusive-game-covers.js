(()=>{
  const VERSION='20260831-2140-hd-individual-covers';
  const PARTS=[1,2,3,4,5].map(n=>`/assets/images/games/exact-cover-v6/part${n}.txt?v=${VERSION}`);
  const ORDER=['knight-online','rise-online','pubg-mobile','metin2','silkroad-online','valorant','league-of-legends','mobile-legends','free-fire','world-of-warcraft','lost-ark','albion-online','roblox','fortnite','ea-fc','steam'];
  const POS=Object.fromEntries(ORDER.map((code,i)=>[code,[i%4,Math.floor(i/4)]]));
  const HD_W=1120,HD_H=464;
  const covers=new Map();
  let sourceImage=null;
  let ready=false;

  function ensureStyle(){
    ['kSafeGameCoverFix','kExactGeneratedCoverStyle','kExactCoverStyleV3','kExactGameCoverV4Style','kExactGameCoverV5Style','kExactGameCoverV6Style','kHdIndividualCoverStyle'].forEach(id=>document.getElementById(id)?.remove());
    const s=document.createElement('style');
    s.id='kHdIndividualCoverStyle';
    s.textContent=`
      .game-market-media.k-hd-individual-cover{
        position:relative!important;
        overflow:hidden!important;
        background-repeat:no-repeat!important;
        background-position:center!important;
        background-size:cover!important;
        background-color:#090b12!important;
      }
      .game-market-media.k-hd-individual-cover .game-market-cover{display:none!important}
      .game-market-media.k-hd-individual-cover .game-market-media-glow{display:block!important;opacity:.18!important;z-index:2!important}
      .game-market-media.k-hd-individual-cover:before{
        content:""!important;position:absolute!important;inset:0!important;z-index:3!important;pointer-events:none!important;
        background:radial-gradient(ellipse 38% 54% at 50% 52%,rgba(7,9,15,.46) 0%,rgba(7,9,15,.18) 48%,transparent 76%),linear-gradient(180deg,transparent 66%,rgba(5,7,12,.23) 100%)!important;
      }
      .game-market-media.k-hd-individual-cover .game-market-logo-wrap{
        display:flex!important;position:absolute!important;inset:0!important;z-index:5!important;align-items:center!important;justify-content:center!important;pointer-events:none!important;
      }
      .game-market-media.k-hd-individual-cover .game-market-real-logo{
        display:block!important;width:auto!important;height:auto!important;max-width:61%!important;max-height:64%!important;object-fit:contain!important;filter:drop-shadow(0 2px 8px rgba(0,0,0,.72))!important;
      }
      .game-market-media.k-hd-individual-cover .k-game-logo-fallback.show{
        display:grid!important;min-width:86px!important;min-height:44px!important;padding:8px 13px!important;background:rgba(8,10,17,.68)!important;border:1px solid rgba(255,255,255,.15)!important;border-radius:10px!important;color:#fff!important;font-weight:950!important;font-size:22px!important;place-items:center!important;
      }
      @media(max-width:680px){
        .game-market-media.k-hd-individual-cover .game-market-real-logo{max-width:66%!important;max-height:66%!important}
      }
    `;
    document.head.appendChild(s);
  }

  function sharpenPixels(ctx,w,h,amount=.34){
    try{
      const img=ctx.getImageData(0,0,w,h),d=img.data,copy=new Uint8ClampedArray(d);
      const stride=w*4;
      for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
          const i=y*stride+x*4;
          for(let c=0;c<3;c++){
            const center=copy[i+c];
            const blur=(copy[i-4+c]+copy[i+4+c]+copy[i-stride+c]+copy[i+stride+c])/4;
            d[i+c]=Math.max(0,Math.min(255,center+(center-blur)*amount));
          }
        }
      }
      ctx.putImageData(img,0,0);
    }catch(_){/* güvenli fallback */}
  }

  function renderCover(code){
    if(!sourceImage||covers.has(code))return covers.get(code)||'';
    const p=POS[code];if(!p)return '';
    const sw=sourceImage.naturalWidth/4,sh=sourceImage.naturalHeight/4;
    const sx=p[0]*sw,sy=p[1]*sh;

    // Tek adımda dev büyütmek yerine üç aşamalı yüksek kaliteli örnekleme yapıyoruz.
    const c1=document.createElement('canvas');c1.width=Math.round(sw*2);c1.height=Math.round(sh*2);
    const x1=c1.getContext('2d',{alpha:false});x1.imageSmoothingEnabled=true;x1.imageSmoothingQuality='high';x1.drawImage(sourceImage,sx,sy,sw,sh,0,0,c1.width,c1.height);

    const c2=document.createElement('canvas');c2.width=Math.round(sw*4);c2.height=Math.round(sh*4);
    const x2=c2.getContext('2d',{alpha:false});x2.imageSmoothingEnabled=true;x2.imageSmoothingQuality='high';x2.drawImage(c1,0,0,c1.width,c1.height,0,0,c2.width,c2.height);

    const out=document.createElement('canvas');out.width=HD_W;out.height=HD_H;
    const ctx=out.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.filter='contrast(1.06) saturate(1.08)';
    ctx.drawImage(c2,0,0,c2.width,c2.height,0,0,HD_W,HD_H);
    ctx.filter='none';
    sharpenPixels(ctx,HD_W,HD_H,.28);

    // Çok hafif film grain, eski JPEG bloklarını daha az görünür yapar.
    const grain=ctx.getImageData(0,0,HD_W,HD_H),gd=grain.data;
    for(let i=0;i<gd.length;i+=4){
      const n=((Math.random()-.5)*3)|0;
      gd[i]=Math.max(0,Math.min(255,gd[i]+n));
      gd[i+1]=Math.max(0,Math.min(255,gd[i+1]+n));
      gd[i+2]=Math.max(0,Math.min(255,gd[i+2]+n));
    }
    ctx.putImageData(grain,0,0);

    const url=out.toDataURL('image/jpeg',.95);
    covers.set(code,url);
    return url;
  }

  function renderAll(){ORDER.forEach(renderCover)}

  function apply(){
    if(!ready)return;
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      const code=media.getAttribute('data-game-code');
      const cover=covers.get(code)||renderCover(code);if(!cover)return;
      media.classList.remove('no-cover','k-cover-fallback','k-exclusive-cover','k-exact-generated-cover','k-exact-cover-v2','k-exact-cover-v3','k-exact-cover-v4','k-exact-cover-v5','k-exact-cover-v6');
      media.classList.add('has-cover','k-hd-individual-cover');
      media.style.setProperty('background-image',`url("${cover}")`,'important');
      media.style.removeProperty('background-position');
    });
    // Kapakların üstündeki logolar sprite'tan değil, ayrı ve net logo dosyalarından gelsin.
    window.kRefreshLocalGameLogos?.();
  }

  function fallback(err){
    console.warn('KOTAKAS HD ayrı oyun kapakları üretilemedi; mevcut kapaklar/logolar korunuyor.',err||'');
    document.querySelectorAll('.game-market-media').forEach(media=>{
      media.classList.remove('k-hd-individual-cover');
      media.style.removeProperty('background-image');
    });
    window.kRefreshLocalGameLogos?.();
  }

  async function load(){
    try{
      const chunks=await Promise.all(PARTS.map(async url=>{
        const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`${url} ${r.status}`);return (await r.text()).trim();
      }));
      const b64=chunks.join('');
      if(!b64.startsWith('/9j/')||!b64.endsWith('/9k='))throw new Error('Kapak verisi eksik veya bozuk');
      const candidate='data:image/jpeg;base64,'+b64;
      sourceImage=await new Promise((resolve,reject)=>{
        const img=new Image();img.onload=()=>img.naturalWidth>0?resolve(img):reject(new Error('Görsel boyutu okunamadı'));img.onerror=()=>reject(new Error('Kapak görseli çözülemedi'));img.src=candidate;
      });
      renderAll();ready=true;
      [0,80,180,400,900,1600].forEach(ms=>setTimeout(apply,ms));
    }catch(err){fallback(err)}
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  load();
  window.kRefreshExclusiveGameCovers=apply;
})();