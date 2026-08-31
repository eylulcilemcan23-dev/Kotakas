(()=>{
  const GAMES=[
    {code:'knight-online',mark:'KO',name:'Knight Online',currency:'GB',types:['Oyun Parası','Item','Karakter']},
    {code:'rise-online',mark:'RO',name:'Rise Online World',currency:'Gold',types:['Oyun Parası','Item','Karakter']},
    {code:'pubg-mobile',mark:'PG',name:'PUBG Mobile',currency:'UC',types:['UC','Kod']},
    {code:'metin2',mark:'M2',name:'Metin2',currency:'Won / Yang',types:['Oyun Parası','Item','Karakter']},
    {code:'silkroad-online',mark:'SR',name:'Silkroad Online',currency:'Gold',types:['Oyun Parası','Item']},
    {code:'valorant',mark:'V',name:'Valorant',currency:'VP',types:['VP / Kod']},
    {code:'league-of-legends',mark:'LOL',name:'League of Legends',currency:'RP',types:['RP / Kod']},
    {code:'mobile-legends',mark:'ML',name:'Mobile Legends',currency:'Diamond',types:['Diamond']},
    {code:'free-fire',mark:'FF',name:'Free Fire',currency:'Diamond',types:['Diamond']},
    {code:'world-of-warcraft',mark:'WOW',name:'World of Warcraft',currency:'Gold',types:['Oyun Parası','Item']},
    {code:'lost-ark',mark:'LA',name:'Lost Ark',currency:'Gold',types:['Oyun Parası','Item']},
    {code:'albion-online',mark:'AO',name:'Albion Online',currency:'Silver / Gold',types:['Oyun Parası','Item']},
    {code:'roblox',mark:'R',name:'Roblox',currency:'Robux',types:['Robux / Kod']},
    {code:'fortnite',mark:'FN',name:'Fortnite',currency:'V-Bucks',types:['V-Bucks / Kod']},
    {code:'ea-fc',mark:'FC',name:'EA SPORTS FC',currency:'FC Points',types:['Points / Kod']},
    {code:'steam',mark:'ST',name:'Steam',currency:'Cüzdan Kodu',types:['Cüzdan Kodu']}
  ];

  window.KOTAKAS_GAMES=GAMES;
  const params=new URLSearchParams(location.search);
  const param=params.get('game');
  const saved=localStorage.getItem('kotakas_game');
  let current=GAMES.find(x=>x.code===(param||saved))||GAMES[0];
  localStorage.setItem('kotakas_game',current.code);
  window.KOTAKAS_GAME=current;

  const gameUrl=(path,code=current.code)=>{
    const u=new URL(path,location.origin);
    u.searchParams.set('game',code);
    return u.pathname+u.search;
  };
  window.kGameUrl=gameUrl;
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const GAME_COVERS={
    'knight-online':'/assets/images/games/knight-online.jpg',
    'rise-online':'/assets/images/games/rise-online.jpg',
    'valorant':'/assets/images/games/valorant.jpg',
    'mobile-legends':'/assets/images/games/mobile-legends.webp'
  };
  const GAME_LOGOS=new Set(['knight-online','rise-online','valorant','league-of-legends','pubg-mobile','mobile-legends','metin2']);
  const logoUrl=code=>`/assets/images/game-logos/${code}.png`;

  function select(code){
    const g=GAMES.find(x=>x.code===code);if(!g)return;
    localStorage.setItem('kotakas_game',g.code);
    current=g;window.KOTAKAS_GAME=g;
    const p=new URLSearchParams(location.search);p.set('game',g.code);
    location.href=location.pathname+'?'+p.toString();
  }
  window.kSelectGame=select;

  // Oyun seçici artık orta header'a eklenmez. Bu fonksiyon sol hamburger menüsünü açar.
  window.kToggleGameMenu=()=>{
    if(typeof window.kOpenMenu==='function'){
      window.kOpenMenu();
      setTimeout(()=>document.getElementById('kDrawerGameSearch')?.focus(),120);
      return;
    }
    location.href='/games.html';
  };

  function wireHeaderLinks(){
    const links=document.querySelectorAll('.k-shell-center a[href^="/market.html"],.k-shell-center a[href^="/buy.html"],.k-shell-center a[href^="/sell.html"],.k-shell-center a[href^="/urgent-sell.html"]');
    links.forEach(a=>{
      const base=a.getAttribute('href').split('?')[0];
      a.href=gameUrl(base);
    });
    // Önceki sürümden kalmış bir oyun sekmesi varsa kesin olarak kaldır.
    document.getElementById('kGameSwitch')?.remove();
    document.getElementById('kGameMenu')?.remove();
    document.getElementById('kSelectedGameHint')?.remove();
    return !!document.querySelector('.k-shell-center');
  }

  function gameMedia(g){
    const cover=GAME_COVERS[g.code];
    const hasLogo=GAME_LOGOS.has(g.code);
    return `<div class="game-market-media ${cover?'has-cover':'no-cover'}" data-game-code="${safe(g.code)}">
      ${cover?`<img class="game-market-cover" src="${cover}" alt="${safe(g.name)}" loading="lazy">`:''}
      <span class="game-market-media-glow"></span>
      <div class="game-market-logo-wrap">
        ${hasLogo?`<img class="game-market-real-logo" src="${logoUrl(g.code)}" alt="${safe(g.name)} logosu" loading="lazy" onerror="this.remove();this.parentElement.querySelector('.k-game-logo-fallback')?.classList.add('show')">`:''}
        <span class="k-game-logo k-game-logo-fallback ${hasLogo?'':'show'}">${safe(g.mark)}</span>
      </div>
    </div>`;
  }

  function gamesPage(){
    const grid=document.getElementById('gamesCatalog');if(!grid)return;
    grid.innerHTML=GAMES.map(g=>`<article class="game-market-tile premium-game-card" data-game="${safe(g.code)}">
      ${gameMedia(g)}
      <div class="game-market-body">
        <h3>${safe(g.name)}</h3>
        <p><strong>${safe(g.currency)}</strong> • ${safe(g.types.join(' • '))}</p>
        <div class="game-market-tags">${g.types.map(t=>`<span>${safe(t)}</span>`).join('')}</div>
        <div class="actions"><a class="btn ghost" href="${gameUrl('/market.html',g.code)}">Pazarı Gör</a><button class="btn teal" onclick="kSelectGame('${g.code}')">Seç</button></div>
      </div>
    </article>`).join('');
  }

  let tries=0;
  const t=setInterval(()=>{
    tries++;
    if(wireHeaderLinks()||tries>30){
      clearInterval(t);
      gamesPage();
      window.kRefreshDrawerNavigation?.();
    }
  },120);
})();
