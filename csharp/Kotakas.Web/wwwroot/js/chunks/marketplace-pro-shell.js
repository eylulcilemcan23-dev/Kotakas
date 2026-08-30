(()=>{
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const games=()=>window.KOTAKAS_GAMES||[];
  const gameUrl=(path,code)=>typeof window.kGameUrl==='function'?window.kGameUrl(path,code):`${path}?game=${encodeURIComponent(code||'knight-online')}`;

  function searchResults(q=''){
    const query=String(q||'').trim().toLowerCase();
    if(query.length<1)return '';
    const g=games().filter(x=>`${x.name} ${x.currency} ${(x.types||[]).join(' ')}`.toLowerCase().includes(query)).slice(0,8);
    const action=[
      {name:'Item Sat',meta:'Satış talebi aç',icon:'📤',href:'/sell.html'},
      {name:'Item Al',meta:'Pazarcı ilanlarını gör',icon:'🛒',href:'/buy.html'},
      {name:'Karakter Sat',meta:'Karakter satış talebi',icon:'🧙',href:'/ring-sell.html'},
      {name:'Acil Item Sat',meta:'KOTAKAS alım masası',icon:'⚡',href:'/urgent-sell.html'}
    ].filter(x=>`${x.name} ${x.meta}`.toLowerCase().includes(query));
    return [...g.map(x=>({name:x.name,meta:`${x.currency} • ${(x.types||[]).join(' • ')}`,icon:x.mark,href:gameUrl('/market.html',x.code)})),...action].slice(0,10).map(x=>`<a class="kp-search-result" href="${safe(x.href)}"><span class="logo">${safe(x.icon)}</span><span><strong>${safe(x.name)}</strong><small>${safe(x.meta)}</small></span></a>`).join('')||'<div class="kp-search-result"><span><strong>Sonuç bulunamadı</strong><small>Farklı bir oyun veya ürün adı dene.</small></span></div>';
  }

  function searchHtml(){return `<div class="kp-global-search"><form id="kpGlobalSearchForm"><span class="kp-search-icon">⌕</span><input id="kpGlobalSearchInput" autocomplete="off" placeholder="Oyun, item, karakter veya oyun parası ara..."><button type="submit">Ara</button></form><div id="kpGlobalSearchResults" class="kp-search-results"></div></div>`}
  function categoryHtml(){
    const current=window.KOTAKAS_GAME?.code||'knight-online';
    const item=(name,code,href='/market.html',extra='')=>`<a class="${current===code?'active ':''}${extra}" href="${gameUrl(href,code)}">${name}</a>`;
    return `<div class="kp-category-wrap"><div class="container kp-category-bar"><button type="button" onclick="kOpenMenu?.()">☰ Oyunlar</button>${item('Knight Online','knight-online')}${item('Rise Online','rise-online')}${item('Valorant','valorant')}${item('League of Legends','league-of-legends')}${item('PUBG Mobile','pubg-mobile')}${item('Mobile Legends','mobile-legends')}${item('Metin2','metin2')}<a href="/games.html">Tüm Oyunlar</a><span class="spacer"></span><a href="/market.html">Pazaryeri</a><a class="hot" href="/urgent-sell.html">⚡ Hızlı Sat</a>${typeof ME!=='undefined'&&ME?'<a class="balance-link" href="/wallet.html">＋ Bakiye Yükle</a>':''}</div></div>`;
  }

  function bindSearch(){
    const input=document.getElementById('kpGlobalSearchInput'),box=document.getElementById('kpGlobalSearchResults'),form=document.getElementById('kpGlobalSearchForm');
    if(!input||!box||!form)return;
    const draw=()=>{const html=searchResults(input.value);box.innerHTML=html;box.classList.toggle('open',!!html)};
    input.addEventListener('input',draw);input.addEventListener('focus',draw);
    form.addEventListener('submit',e=>{e.preventDefault();const q=input.value.trim();if(!q)return;const found=games().find(x=>`${x.name} ${x.currency}`.toLowerCase().includes(q.toLowerCase()));if(found)location.href=gameUrl('/market.html',found.code);else location.href='/buy.html?search='+encodeURIComponent(q)});
    document.addEventListener('click',e=>{if(!e.target.closest('.kp-global-search'))box.classList.remove('open')});
  }

  function install(){
    const header=document.querySelector('header.site-header');const bar=header?.querySelector('.k-shell-bar');if(!header||!bar)return false;
    if(bar.dataset.kpPro==='1')return true;
    bar.dataset.kpPro='1';bar.classList.add('kp-shell-main');
    const logo=bar.querySelector('.k-shell-logo');if(logo&&!bar.querySelector('.kp-global-search'))logo.insertAdjacentHTML('afterend',searchHtml());
    header.querySelector('.kp-category-wrap')?.remove();header.insertAdjacentHTML('beforeend',categoryHtml());
    bindSearch();
    return true;
  }

  let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>50)clearInterval(timer)},120);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,60)});
  window.kRefreshMarketplaceShell=install;
})();
