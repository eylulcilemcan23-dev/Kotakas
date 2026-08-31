(()=>{
  const MAP={
    'silkroad-online':'/assets/images/game-logos/silkroad-online.svg',
    'free-fire':'/assets/images/game-logos/free-fire.svg',
    'world-of-warcraft':'/assets/images/game-logos/world-of-warcraft.svg',
    'lost-ark':'/assets/images/game-logos/lost-ark.svg',
    'albion-online':'/assets/images/game-logos/albion-online.svg',
    'roblox':'/assets/images/game-logos/roblox.svg',
    'fortnite':'/assets/images/game-logos/fortnite.svg',
    'ea-fc':'/assets/images/game-logos/ea-fc.svg',
    'steam':'/assets/images/game-logos/steam.svg'
  };

  function ensureStyle(){
    if(document.getElementById('kLocalGameLogoStyle'))return;
    const s=document.createElement('style');s.id='kLocalGameLogoStyle';s.textContent=`
      .k-drawer-game-logo-shell{width:100%;max-width:178px;min-height:26px;display:flex;align-items:center}
      .k-drawer-game-logo-img.k-local-logo{display:block!important;width:auto!important;height:26px!important;max-width:165px!important;max-height:26px!important;object-fit:contain!important;object-position:left center!important;filter:none!important}
      .game-market-real-logo.k-local-logo{width:auto!important;max-width:78%!important;max-height:72px!important;object-fit:contain!important;filter:none!important}
      @media(max-width:680px){.k-drawer-game-logo-img.k-local-logo{height:24px!important;max-height:24px!important;max-width:155px!important}}
    `;document.head.appendChild(s);
  }

  function fixDrawer(){
    document.querySelectorAll('[data-drawer-game]').forEach(row=>{
      const code=row.getAttribute('data-drawer-game'),src=MAP[code];if(!src)return;
      const brand=row.querySelector('.k-drawer-game-brand');if(!brand)return;
      let shell=brand.querySelector('.k-drawer-game-logo-shell');
      if(!shell){shell=document.createElement('span');shell.className='k-drawer-game-logo-shell';brand.insertBefore(shell,brand.firstChild)}
      let img=shell.querySelector('img');
      if(!img){img=document.createElement('img');shell.insertBefore(img,shell.firstChild)}
      img.className='k-drawer-game-logo-img k-local-logo';
      img.src=src;img.alt=code+' logosu';img.loading='eager';img.removeAttribute('referrerpolicy');img.style.display='block';
      shell.querySelectorAll('.k-drawer-game-wordmark').forEach(x=>x.style.display='none');
      brand.querySelectorAll(':scope > .k-drawer-game-wordmark').forEach(x=>x.style.display='none');
    });
  }

  function fixGamesPage(){
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      const code=media.getAttribute('data-game-code'),src=MAP[code];if(!src)return;
      const wrap=media.querySelector('.game-market-logo-wrap');if(!wrap)return;
      let img=wrap.querySelector('.game-market-real-logo');
      if(!img){img=document.createElement('img');wrap.insertBefore(img,wrap.firstChild)}
      img.className='game-market-real-logo k-local-logo';img.src=src;img.alt=code+' logosu';img.loading='eager';
      wrap.querySelector('.k-game-logo-fallback')?.classList.remove('show');
    });
  }

  function fix(){ensureStyle();fixDrawer();fixGamesPage()}
  const observer=new MutationObserver(()=>requestAnimationFrame(fix));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  [0,150,400,800,1500,2500].forEach(ms=>setTimeout(fix,ms));
  document.addEventListener('click',e=>{if(e.target.closest('.k-shell-menu'))setTimeout(fix,80)});
  window.kRefreshLocalGameLogos=fix;
})();