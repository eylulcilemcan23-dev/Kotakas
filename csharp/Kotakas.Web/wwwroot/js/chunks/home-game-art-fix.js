(()=>{
  if(!['/','/index.html'].includes(location.pathname.toLowerCase()))return;
  const V='20260831-0545';
  const art={
    'knight-online':'/assets/images/games/knight-online.jpg?v='+V,
    'rise-online':'/assets/images/games/rise-online.jpg?v='+V,
    'valorant':'/assets/images/games/valorant.webp?v='+V,
    'mobile-legends':'/assets/images/games/mobile-legends.webp?v='+V
  };

  function css(){
    if(document.getElementById('kGameArtFixCss'))return;
    const s=document.createElement('style');
    s.id='kGameArtFixCss';
    s.textContent=`
      .kp-promo-main.k-game-slider{min-height:360px!important;background:#0e1019!important}
      .k-game-slide{isolation:isolate!important;overflow:hidden!important;background:#0e1019!important}
      .k-game-slide:before{content:''!important;position:absolute!important;inset:-28px!important;z-index:0!important;background-image:var(--k-art)!important;background-size:cover!important;background-position:center!important;filter:blur(20px) brightness(.42) saturate(.9)!important;transform:scale(1.1)!important;opacity:.9!important}
      .k-game-slide>img{position:absolute!important;inset:0!important;z-index:1!important;width:100%!important;height:100%!important;object-fit:contain!important;object-position:center center!important;filter:none!important;transform:none!important;background:transparent!important}
      .k-game-slide:after{z-index:2!important;background:linear-gradient(90deg,rgba(7,8,15,.64) 0%,rgba(7,8,15,.18) 33%,rgba(7,8,15,0) 62%)!important;pointer-events:none!important}
      .k-game-slide-copy{z-index:3!important;left:22px!important;bottom:22px!important;max-width:275px!important;padding:12px 14px!important;border-radius:10px!important;background:rgba(9,10,17,.64)!important;backdrop-filter:blur(7px)!important}
      .k-game-slide-copy h2{font-size:23px!important;margin:4px 0 4px!important}.k-game-slide-copy p{font-size:9px!important;margin-bottom:9px!important}.k-game-slide-copy small{font-size:7px!important}.k-game-slide-copy .btn{min-height:31px!important;padding:7px 10px!important;font-size:8px!important}
      .k-game-slider-nav,.k-game-slider-dots{z-index:4!important}
      .kp-game-row{align-items:start!important}.kp-game-tile.k-cover{min-height:0!important;height:auto!important;aspect-ratio:1/1!important}.kp-game-tile.k-cover>img{width:100%!important;height:100%!important;min-height:0!important;object-fit:cover!important;object-position:center!important}.kp-game-tile.k-cover .k-cover-info{padding:48px 12px 11px!important}
      @media(max-width:900px){.kp-promo-main.k-game-slider{min-height:320px!important}.k-game-slide-copy{left:14px!important;bottom:14px!important;max-width:230px!important}.k-game-slide-copy h2{font-size:19px!important}.kp-game-tile.k-cover{height:auto!important;min-height:0!important}}
      @media(max-width:520px){.kp-promo-main.k-game-slider{min-height:290px!important}.k-game-slide-copy{left:9px!important;bottom:9px!important;max-width:190px!important;padding:9px!important}.k-game-slide-copy p{display:none!important}.k-game-slide-copy h2{font-size:16px!important}.k-game-slide-copy .btn{min-height:28px!important;padding:6px 8px!important}.kp-game-tile.k-cover{min-width:70vw!important;aspect-ratio:1/1!important}}
    `;
    document.head.appendChild(s);
  }

  function patch(){
    css();
    const slides=[...document.querySelectorAll('.k-game-slide')];
    const order=['knight-online','rise-online','valorant','mobile-legends'];
    slides.forEach((slide,i)=>{
      const code=order[i]; if(!code||!art[code])return;
      slide.style.setProperty('--k-art',`url("${art[code]}")`);
      const img=slide.querySelector(':scope > img');
      if(img){img.src=art[code];img.decoding='async';}
    });
    document.querySelectorAll('.kp-game-tile.k-cover').forEach(card=>{
      const href=card.getAttribute('href')||'';
      const code=Object.keys(art).find(c=>href.includes('game='+c)||href.includes('game='+encodeURIComponent(c)));
      if(!code)return;
      const img=card.querySelector('img');if(img){img.src=art[code];img.decoding='async';}
    });
  }

  [550,1000,1700,2800,4500].forEach(ms=>setTimeout(patch,ms));
  window.addEventListener('pageshow',()=>setTimeout(patch,120));
})();
