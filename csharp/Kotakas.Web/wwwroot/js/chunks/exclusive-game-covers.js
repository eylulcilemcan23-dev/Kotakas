(()=>{
  const THEMES={
    'knight-online':['#090b12','#32130f','#9b4a25','#ff6a34',0],
    'rise-online':['#0c0b1d','#31125d','#6c29a7','#d34cff',1],
    'pubg-mobile':['#08131d','#173b5d','#9b5c2e','#7fd8ff',2],
    'metin2':['#10070a','#4b1014','#b8321d','#ff9d43',3],
    'silkroad-online':['#160e08','#5b3a14','#b88432','#f1cf75',4],
    'valorant':['#090913','#38125a','#731fa0','#ff3d73',5],
    'league-of-legends':['#06131b','#12384f','#176f8d','#d5ad55',6],
    'mobile-legends':['#100b20','#432366','#9d2a78','#65e6ff',7],
    'free-fire':['#081018','#44211c','#b64b1b','#ffd13d',8],
    'world-of-warcraft':['#06131d','#15334b','#236f9c','#e2b64a',9],
    'lost-ark':['#0d0f14','#372824','#8a5638','#f0c987',10],
    'albion-online':['#171008','#5a3a18','#a9792f','#c43a50',11],
    'roblox':['#0c0e1b','#2d3165','#a92e57','#56dce2',12],
    'fortnite':['#0d0a1e','#3b1d63','#7131bc','#5ce4ff',13],
    'ea-fc':['#06110d','#0a3221','#11663b','#97f36d',14],
    'steam':['#07121d','#0e3957','#17668f','#82d9ff',15]
  };

  const SCENES=[
    `<path d="M0 390L120 305 185 350 280 250 360 350 455 275 545 355 650 245 735 335 835 270 960 370V480H0Z" fill="#05070c"/><g fill="#171820"><rect x="105" y="205" width="48" height="150"/><path d="M100 205l29-42 30 42z"/><rect x="700" y="180" width="56" height="178"/><path d="M692 180l36-48 37 48z"/></g><path d="M455 460l38-210 40 210z" fill="#20222a"/><circle cx="494" cy="230" r="19" fill="#292b34"/>`,
    `<circle cx="480" cy="250" r="155" fill="none" stroke="url(#ring)" stroke-width="22" opacity=".78"/><circle cx="480" cy="250" r="95" fill="#170b31" opacity=".65"/><path d="M480 78l58 138-58 52-58-52z" fill="#c85cff" opacity=".66"/><path d="M0 400L160 320 315 370 440 315 585 365 735 300 960 390V480H0Z" fill="#070914"/>`,
    `<path d="M0 390L120 335 225 360 325 315 435 365 555 325 670 355 800 305 960 380V480H0Z" fill="#071018"/><path d="M720 72q50-38 100 0-15 48-50 62-35-14-50-62z" fill="none" stroke="#d5efff" stroke-width="4" opacity=".66"/><path d="M770 134v78" stroke="#d5efff" stroke-width="3" opacity=".56"/><circle cx="790" cy="118" r="75" fill="#a4d5ff" opacity=".1"/>`,
    `<path d="M0 430L230 260 355 430z" fill="#120b0d"/><path d="M245 430L520 175 730 430z" fill="#17100f"/><path d="M520 175l45 95-50-22-45 67-30-59z" fill="#ff5b1c" opacity=".78"/><path d="M0 440L960 390V480H0Z" fill="#07080b"/>`,
    `<path d="M0 365q150-55 300 0t300-10t360 5V480H0Z" fill="#a46f2b" opacity=".52"/><path d="M0 415q180-60 360 0t360-10t240 0V480H0Z" fill="#42270f" opacity=".9"/><circle cx="760" cy="120" r="76" fill="#ffd77d" opacity=".16"/><g fill="#110e09"><circle cx="320" cy="342" r="18"/><rect x="300" y="356" width="40" height="27"/><circle cx="395" cy="350" r="14"/><rect x="380" y="362" width="30" height="20"/></g>`,
    `<path d="M0 410L110 290 220 365 335 215 465 365 605 255 735 360 850 235 960 340V480H0Z" fill="#080910"/><path d="M110 290L335 215M335 215L605 255M605 255L850 235" stroke="#a83cff" stroke-width="7" opacity=".65"/><path d="M470 430l50-205 55 205z" fill="#14131f"/><circle cx="522" cy="205" r="21" fill="#201629"/>`,
    `<path d="M0 420L130 305 265 385 405 235 530 370 655 255 790 375 960 285V480H0Z" fill="#061016"/><path d="M55 288q145-165 300-28t300-35t250 22" fill="none" stroke="#289cc1" stroke-width="7" opacity=".5"/><circle cx="500" cy="220" r="68" fill="#d0ad59" opacity=".12"/>`,
    `<ellipse cx="480" cy="360" rx="335" ry="98" fill="#080b16" stroke="#8145b7" stroke-width="8"/><path d="M145 350l120-130 105 130M595 350l115-145 112 145" fill="#23113b" stroke="#7b2da6" stroke-width="5"/><circle cx="480" cy="168" r="85" fill="#ff4dad" opacity=".14"/>`,
    `<g fill="#0b1017"><rect x="58" y="225" width="88" height="180"/><rect x="165" y="185" width="118" height="220"/><rect x="720" y="175" width="105" height="230"/><rect x="840" y="235" width="82" height="170"/></g><path d="M0 420L960 345V480H0Z" fill="#07090d"/><path d="M505 455l35-205 33 205z" fill="#151820"/><circle cx="552" cy="150" r="115" fill="#ff7620" opacity=".14"/>`,
    `<path d="M0 430L175 255 305 430z" fill="#0a1721"/><path d="M185 430L420 165 655 430z" fill="#102837"/><path d="M545 430L760 215 960 430z" fill="#091721"/><path d="M420 165l42 90-58-22-48 72-28-58z" fill="#7fd2ff" opacity=".32"/>`,
    `<path d="M0 420L140 340 260 380 395 278 525 365 650 270 790 350 960 305V480H0Z" fill="#090b10"/><g fill="#1c1c1d"><rect x="410" y="185" width="45" height="185"/><rect x="505" y="150" width="55" height="220"/><rect x="592" y="205" width="40" height="165"/></g><circle cx="770" cy="125" r="78" fill="#e6aa6b" opacity=".15"/>`,
    `<path d="M0 400q180-75 360 0t360-10t240-5V480H0Z" fill="#3a2913" opacity=".84"/><g fill="#15120c"><rect x="570" y="185" width="140" height="190"/><rect x="540" y="240" width="205" height="135"/><path d="M570 185l40-52 42 52z"/><path d="M670 185l40-48 44 48z"/></g><circle cx="180" cy="130" r="72" fill="#f5d076" opacity=".12"/>`,
    `<g opacity=".94"><rect x="70" y="245" width="112" height="112" fill="#d54c69"/><rect x="200" y="195" width="120" height="162" fill="#4a5ed4"/><rect x="350" y="235" width="92" height="122" fill="#44c3c7"/><rect x="685" y="185" width="140" height="172" fill="#ffb34a"/><rect x="840" y="250" width="85" height="107" fill="#8b5ee4"/></g><path d="M0 405L960 365V480H0Z" fill="#080a12"/>`,
    `<path d="M480 35l55 120-32 86 62 98-88 110-58-112 38-104-58-78z" fill="#83eaff" opacity=".23"/><path d="M0 420L145 325 265 375 395 265 525 370 655 255 790 365 960 290V480H0Z" fill="#080a13"/><circle cx="480" cy="230" r="125" fill="#9d52ff" opacity=".13"/>`,
    `<ellipse cx="480" cy="365" rx="415" ry="140" fill="#05140d" stroke="#1f7a49" stroke-width="12"/><ellipse cx="480" cy="360" rx="285" ry="78" fill="#0b4d2b" opacity=".86"/><path d="M480 282V438M195 360H765" stroke="#e0ffe9" stroke-width="3" opacity=".26"/><g fill="#9cff74" opacity=".34"><circle cx="120" cy="115" r="5"/><circle cx="205" cy="90" r="4"/><circle cx="825" cy="95" r="5"/><circle cx="892" cy="140" r="4"/></g>`,
    `<g stroke="#4db4e8" stroke-width="2" opacity=".36"><path d="M0 335H960"/><path d="M0 375H960"/><path d="M0 415H960"/><path d="M120 195V480"/><path d="M285 155V480"/><path d="M465 125V480"/><path d="M650 170V480"/><path d="M835 140V480"/></g><circle cx="480" cy="250" r="108" fill="none" stroke="#73d2ff" stroke-width="12" opacity=".3"/><circle cx="480" cy="250" r="46" fill="#73d2ff" opacity=".17"/>`
  ];

  function cover(code){
    const [c1,c2,c3,a,idx]=THEMES[code]||THEMES['knight-online'];
    const scene=SCENES[idx]||SCENES[0];
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 480"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient><radialGradient id="ring"><stop stop-color="${a}" stop-opacity=".9"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs><rect width="960" height="480" fill="url(#bg)"/><circle cx="760" cy="100" r="175" fill="${a}" opacity=".09" filter="url(#b)"/><circle cx="220" cy="400" r="220" fill="${c3}" opacity=".08" filter="url(#b)"/>${scene}<g fill="${a}" opacity=".32"><circle cx="88" cy="92" r="3"/><circle cx="150" cy="140" r="2"/><circle cx="260" cy="82" r="3"/><circle cx="670" cy="150" r="2"/><circle cx="845" cy="205" r="3"/><circle cx="905" cy="110" r="2"/></g><rect x="18" y="18" width="924" height="444" rx="26" fill="none" stroke="${a}" stroke-opacity=".16" stroke-width="2"/><path d="M0 435c190-40 350 25 520-10s270-40 440 0v55H0z" fill="#05070b" opacity=".46"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function ensureStyle(){
    if(document.getElementById('kExclusiveCoverStyle'))return;
    const s=document.createElement('style');s.id='kExclusiveCoverStyle';s.textContent=`
      .game-market-media.k-exclusive-cover{background:#0b0d15!important}
      .game-market-media.k-exclusive-cover .game-market-cover{width:100%!important;height:100%!important;object-fit:cover!important;filter:saturate(1.12) contrast(1.04)!important}
      .game-market-media.k-exclusive-cover .game-market-logo-wrap{z-index:4!important;filter:drop-shadow(0 4px 12px rgba(0,0,0,.72))}
      .game-market-media.k-exclusive-cover:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.16) 64%,rgba(0,0,0,.42));pointer-events:none;z-index:2}
    `;document.head.appendChild(s);
  }

  function apply(){
    ensureStyle();
    document.querySelectorAll('.game-market-media[data-game-code]').forEach(media=>{
      const code=media.getAttribute('data-game-code');if(!THEMES[code])return;
      let img=media.querySelector('.game-market-cover');
      if(!img){img=document.createElement('img');img.className='game-market-cover';media.insertBefore(img,media.firstChild)}
      const src=cover(code);if(img.dataset.kExclusive!==code){img.src=src;img.dataset.kExclusive=code;img.alt=code+' KOTAKAS özel kapağı'}
      media.classList.add('has-cover','k-exclusive-cover');media.classList.remove('no-cover');
    });
  }

  const observer=new MutationObserver(()=>requestAnimationFrame(apply));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  [0,120,350,800,1500,2500].forEach(ms=>setTimeout(apply,ms));
  window.kRefreshExclusiveGameCovers=apply;
})();