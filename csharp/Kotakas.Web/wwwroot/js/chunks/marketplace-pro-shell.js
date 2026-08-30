(()=>{
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const games=()=>window.KOTAKAS_GAMES||[];
  const gameUrl=(path,code)=>typeof window.kGameUrl==='function'?window.kGameUrl(path,code):`${path}?game=${encodeURIComponent(code||'knight-online')}`;

  function searchResults(q=''){
    const query=String(q||'').trim().toLowerCase();
    if(!query)return '';
    const gameRows=games().filter(x=>`${x.name} ${x.currency} ${(x.types||[]).join(' ')}`.toLowerCase().includes(query)).slice(0,6);
    const actions=[
      {name:'Teklif Pazarı',meta:'Pazarcılardan BUY teklifi al',icon:'TP',href:'/market.html'},
      {name:'Item Al',meta:'Pazarcı SELL ilanlarını gör',icon:'AL',href:'/buy.html'},
      {name:'Item Sat',meta:'Satış talebi oluştur',icon:'SAT',href:'/sell.html'},
      {name:'Karakter Pazarı',meta:'Karakter satış işlemleri',icon:'KR',href:'/ring-sell.html'},
      {name:'Bize Sat',meta:'KOTAKAS hızlı alım masası',icon:'⚡',href:'/urgent-sell.html'}
    ].filter(x=>`${x.name} ${x.meta}`.toLowerCase().includes(query));
    return [...gameRows.map(x=>({name:x.name,meta:`${x.currency} • ${(x.types||[]).join(' • ')}`,icon:x.mark,href:gameUrl('/market.html',x.code)})),...actions]
      .slice(0,10).map(x=>`<a class="kp-search-result" href="${safe(x.href)}"><span class="logo">${safe(x.icon)}</span><span><strong>${safe(x.name)}</strong><small>${safe(x.meta)}</small></span></a>`).join('')
      ||'<div class="kp-search-result"><span><strong>Sonuç bulunamadı</strong><small>Farklı bir oyun, item veya ürün adı dene.</small></span></div>';
  }

  function searchHtml(){return `<div class="kp-global-search"><form id="kpGlobalSearchForm"><span class="kp-search-icon">⌕</span><input id="kpGlobalSearchInput" autocomplete="off" placeholder="Oyun, uygulama, ürün ara..."><button type="submit">Ara</button></form><div id="kpGlobalSearchResults" class="kp-search-results"></div></div>`}

  function categoryHtml(){
    const current=window.KOTAKAS_GAME?.code||'knight-online';
    const game=(label,code,mini='')=>`<a class="game-nav ${current===code?'active':''}" href="${gameUrl('/market.html',code)}"><span>${label}</span>${mini?`<b>${mini}</b>`:''}</a>`;
    return `<div class="kp-category-wrap"><div class="container kp-category-bar">
      <button type="button" class="menu-grid" onclick="kOpenMenu?.()" title="Tüm oyunlar">▦</button>
      ${game('KNIGHT','knight-online','ONLINE')}
      ${game('RISE','rise-online','ONLINE')}
      ${game('VALORANT','valorant')}
      ${game('LEAGUE','league-of-legends')}
      ${game('PUBG','pubg-mobile')}
      ${game('MOBILE LEGENDS','mobile-legends')}
      ${game('METİN2','metin2')}
      <a class="game-nav" href="/games.html"><span>Yayıncılar</span></a>
      <a class="game-nav" href="/market.html"><span>Pazaryeri</span></a>
      <span class="spacer"></span>
      <a class="seller-action" href="/urgent-sell.html">🤝 Bize Sat</a>
      <a class="seller-action" href="/sell.html">▣ İlan Ekle</a>
      ${typeof ME!=='undefined'&&ME?'<a class="balance-link" href="/wallet.html">BAKİYE YÜKLE</a>':'<a class="balance-link" href="/login.html">BAKİYE YÜKLE</a>'}
    </div></div>`;
  }

  function bindSearch(){
    const input=document.getElementById('kpGlobalSearchInput'),box=document.getElementById('kpGlobalSearchResults'),form=document.getElementById('kpGlobalSearchForm');
    if(!input||!box||!form)return;
    const draw=()=>{const html=searchResults(input.value);box.innerHTML=html;box.classList.toggle('open',!!input.value.trim())};
    input.addEventListener('input',draw);input.addEventListener('focus',draw);
    form.addEventListener('submit',e=>{e.preventDefault();const q=input.value.trim();if(!q)return;const found=games().find(x=>`${x.name} ${x.currency}`.toLowerCase().includes(q.toLowerCase()));if(found)location.href=gameUrl('/market.html',found.code);else location.href='/buy.html?search='+encodeURIComponent(q)});
    document.addEventListener('click',e=>{if(!e.target.closest('.kp-global-search'))box.classList.remove('open')});
  }

  function install(){
    const header=document.querySelector('header.site-header');
    const bar=header?.querySelector('.k-shell-bar');
    if(!header||!bar)return false;
    bar.classList.add('kp-shell-main');bar.dataset.kpPro='1';
    if(!bar.querySelector('.kp-global-search')){const logo=bar.querySelector('.k-shell-logo');logo?.insertAdjacentHTML('afterend',searchHtml());bindSearch()}
    header.querySelector('.kp-category-wrap')?.remove();
    header.insertAdjacentHTML('beforeend',categoryHtml());
    return true;
  }

  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>60)clearInterval(timer)},120);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,80)});
  window.kRefreshMarketplaceShell=install;
})();
