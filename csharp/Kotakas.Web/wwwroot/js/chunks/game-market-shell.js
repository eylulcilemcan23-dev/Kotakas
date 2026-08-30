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

  const gameUrl=(path,code=current.code)=>{const u=new URL(path,location.origin);u.searchParams.set('game',code);return u.pathname+u.search};
  window.kGameUrl=gameUrl;
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function cards(query=''){
    const q=String(query||'').trim().toLowerCase();
    return GAMES.filter(g=>!q||`${g.name} ${g.currency} ${g.types.join(' ')}`.toLowerCase().includes(q)).map(g=>`<button class="k-game-card ${g.code===current.code?'active':''}" data-game="${g.code}"><span class="k-game-logo">${safe(g.mark)}</span><span style="min-width:0"><strong>${safe(g.name)}</strong><span><b class="currency">${safe(g.currency)}</b> • ${safe(g.types.join(' • '))}</span></span></button>`).join('')||'<div class="empty" style="grid-column:1/-1">Bu aramada oyun bulunamadı.</div>';
  }

  function ensureMenu(){
    let menu=document.getElementById('kGameMenu');
    if(!menu){menu=document.createElement('div');menu.id='kGameMenu';menu.className='k-game-menu';document.body.append(menu)}
    menu.innerHTML=`<div class="k-game-menu-head"><div><strong>🎮 Oyun Pazarları</strong><span>Oyununu seç; para, item ve karakter pazarına geç.</span></div><a href="/games.html">Tüm oyunlar →</a></div><label class="k-game-search">⌕ <input id="kGameSearch" autocomplete="off" placeholder="Oyun ara... (Rise, PUBG, Metin2, Valorant)"></label><div id="kGameGrid" class="k-game-grid">${cards()}</div><div class="k-game-footer"><span>Seçili oyun: <b>${safe(current.name)}</b></span><span>• ${safe(current.currency)}</span><a href="/games.html">Oyun kataloğunu aç</a></div>`;
    const input=menu.querySelector('#kGameSearch');
    input?.addEventListener('input',()=>{const grid=menu.querySelector('#kGameGrid');if(grid)grid.innerHTML=cards(input.value);bindCards(menu)});
    bindCards(menu);
    return menu;
  }

  function bindCards(root){root.querySelectorAll('[data-game]').forEach(btn=>btn.onclick=()=>select(btn.dataset.game))}
  function select(code){
    const g=GAMES.find(x=>x.code===code);if(!g)return;
    localStorage.setItem('kotakas_game',g.code);
    current=g;window.KOTAKAS_GAME=g;
    const p=new URLSearchParams(location.search);p.set('game',g.code);
    location.href=location.pathname+'?'+p.toString();
  }
  window.kSelectGame=select;

  function close(){document.getElementById('kGameMenu')?.classList.remove('open');document.getElementById('kGameSwitch')?.classList.remove('open')}
  window.kToggleGameMenu=()=>{const menu=ensureMenu(),btn=document.getElementById('kGameSwitch');const open=!menu.classList.contains('open');close();if(open){menu.classList.add('open');btn?.classList.add('open');setTimeout(()=>menu.querySelector('input')?.focus(),40)}};

  function install(){
    const center=document.querySelector('.k-shell-center');if(!center)return false;
    if(!document.getElementById('kGameSwitch')){
      const btn=document.createElement('button');btn.id='kGameSwitch';btn.type='button';btn.className='k-game-switch';btn.innerHTML=`<span class="game-mark">${safe(current.mark)}</span><span class="game-name">${safe(current.name)}</span><small>▼</small>`;btn.onclick=e=>{e.stopPropagation();window.kToggleGameMenu()};center.prepend(btn);
    }
    document.querySelectorAll('.k-shell-center a[href^="/market.html"],.k-shell-center a[href^="/buy.html"],.k-shell-center a[href^="/sell.html"],.k-shell-center a[href^="/urgent-sell.html"]').forEach(a=>{const base=a.getAttribute('href').split('?')[0];a.href=gameUrl(base)});
    return true;
  }

  function gamesPage(){
    const grid=document.getElementById('gamesCatalog');if(!grid)return;
    grid.innerHTML=GAMES.map(g=>`<article class="game-market-tile"><span class="k-game-logo">${safe(g.mark)}</span><h3>${safe(g.name)}</h3><p>${safe(g.currency)} ve desteklenen dijital pazar kategorileri.</p><div class="game-market-tags">${g.types.map(t=>`<span>${safe(t)}</span>`).join('')}</div><div class="actions"><a class="btn ghost" href="${gameUrl('/market.html',g.code)}">Pazarı Gör</a><button class="btn teal" onclick="kSelectGame('${g.code}')">Seç</button></div></article>`).join('');
  }

  function selectedGameHint(){
    const targets=['/market.html','/buy.html','/sell.html','/urgent-sell.html'];if(!targets.some(x=>location.pathname.toLowerCase().endsWith(x)))return;
    const head=document.querySelector('.pagehead,.v5-head');if(!head||document.getElementById('kSelectedGameHint'))return;
    const hint=document.createElement('div');hint.id='kSelectedGameHint';hint.className='v5-kicker';hint.style.marginBottom='8px';hint.innerHTML=`🎮 ${safe(current.name)} <span style="opacity:.65">• ${safe(current.currency)}</span>`;head.parentNode?.insertBefore(hint,head);
  }

  let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>30){clearInterval(t);ensureMenu();selectedGameHint();gamesPage()}},120);
  document.addEventListener('click',e=>{const m=document.getElementById('kGameMenu'),b=document.getElementById('kGameSwitch');if(m?.classList.contains('open')&&!m.contains(e.target)&&!b?.contains(e.target))close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
})();