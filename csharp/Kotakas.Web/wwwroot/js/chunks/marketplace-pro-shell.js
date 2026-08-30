(()=>{
  const safe=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const games=()=>window.KOTAKAS_GAMES||[];
  const gameUrl=(path,code)=>typeof window.kGameUrl==='function'?window.kGameUrl(path,code):`${path}?game=${encodeURIComponent(code||'knight-online')}`;

  function searchResults(q=''){
    const query=String(q||'').trim().toLowerCase();
    if(!query)return '';
    const gameRows=games().filter(x=>`${x.name} ${x.currency} ${(x.types||[]).join(' ')}`.toLowerCase().includes(query)).slice(0,6);
    const actions=[
      {name:'Teklif Pazarı',meta:'Pazarcılardan BUY teklifi al',icon:'💰',href:'/market.html'},
      {name:'Item Al',meta:'Pazarcı SELL ilanlarını gör',icon:'🛒',href:'/buy.html'},
      {name:'Item Sat',meta:'Satış talebi oluştur',icon:'📤',href:'/sell.html'},
      {name:'Karakter Pazarı',meta:'Karakter satış işlemleri',icon:'🧙',href:'/ring-sell.html'},
      {name:'Acil Sat',meta:'KOTAKAS alım masası',icon:'⚡',href:'/urgent-sell.html'}
    ].filter(x=>`${x.name} ${x.meta}`.toLowerCase().includes(query));
    return [...gameRows.map(x=>({name:x.name,meta:`${x.currency} • ${(x.types||[]).join(' • ')}`,icon:x.mark,href:gameUrl('/market.html',x.code)})),...actions]
      .slice(0,10)
      .map(x=>`<a class="kp-search-result" href="${safe(x.href)}"><span class="logo">${safe(x.icon)}</span><span><strong>${safe(x.name)}</strong><small>${safe(x.meta)}</small></span></a>`).join('')
      ||'<div class="kp-search-result"><span><strong>Sonuç bulunamadı</strong><small>Farklı bir oyun, item veya ürün adı dene.</small></span></div>';
  }

  function searchHtml(){return `<div class="kp-global-search"><form id="kpGlobalSearchForm"><span class="kp-search-icon">⌕</span><input id="kpGlobalSearchInput" autocomplete="off" placeholder="Oyun, item, karakter veya oyun parası ara..."><button type="submit">Ara</button></form><div id="kpGlobalSearchResults" class="kp-search-results"></div></div>`}

  function categoryHtml(){
    const currentPath=location.pathname.toLowerCase();
    const active=href=>currentPath.endsWith(href)?'active':'';
    return `<div class="kp-category-wrap"><div class="container kp-category-bar">
      <button type="button" class="hot" onclick="kOpenMenu?.()">☰ Oyunlar</button>
      <a class="${active('/market.html')}" href="/market.html">💰 Teklif Pazarı</a>
      <a class="${active('/buy.html')}" href="/buy.html">🛒 Item Al</a>
      <a class="${active('/sell.html')}" href="/sell.html">📤 Item Sat</a>
      <a class="${active('/ring-sell.html')}" href="/ring-sell.html">🧙 Karakter</a>
      <a class="hot ${active('/urgent-sell.html')}" href="/urgent-sell.html">⚡ Acil Sat</a>
      <a href="/trader-apply.html">🤝 Pazarcı Ol</a>
      <span class="spacer"></span>
      <a href="/support.html">Destek</a>
      ${typeof ME!=='undefined'&&ME?'<a class="balance-link" href="/wallet.html">＋ Bakiye Yükle</a>':''}
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
    bar.classList.add('kp-shell-main');
    bar.dataset.kpPro='1';
    const oldSearch=bar.querySelector('.kp-global-search');
    if(!oldSearch){const logo=bar.querySelector('.k-shell-logo');logo?.insertAdjacentHTML('afterend',searchHtml());bindSearch()}
    header.querySelector('.kp-category-wrap')?.remove();
    header.insertAdjacentHTML('beforeend',categoryHtml());
    return true;
  }

  let tries=0;
  const timer=setInterval(()=>{tries++;if(install()||tries>60)clearInterval(timer)},120);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(install,80)});
  window.kRefreshMarketplaceShell=install;
})();
