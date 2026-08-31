(()=>{
  const path=location.pathname.toLowerCase();
  const isHome=path==='/'||path.endsWith('/index.html');
  const isTrader=path.endsWith('/trader.html');

  function installHomeQuickSearch(){
    if(!isHome)return false;
    const input=document.getElementById('kpGlobalSearchInput');
    const box=document.getElementById('kpGlobalSearchResults');
    if(!input||!box)return false;
    if(input.dataset.quickBound==='1')return true;
    input.dataset.quickBound='1';

    const quickHtml=()=>`<div class="kp-search-quick-wrap">
      <div class="kp-search-quick-title">Hızlı erişim</div>
      <div class="kp-search-quick-grid">
        <a class="kp-search-quick hot" href="/market.html?game=knight-online">⚔️ Knight Online</a>
        <a class="kp-search-quick" href="/buy.html?game=knight-online&search=gold%20bar">🪙 Gold Bar</a>
        <a class="kp-search-quick" href="/buy.html?game=knight-online">🛡️ Item</a>
        <a class="kp-search-quick" href="/ring-sell.html">💍 Karakter</a>
        <a class="kp-search-quick" href="/market.html?game=mobile-legends">💎 Mobile Legends</a>
      </div>
    </div>`;
    const show=()=>{
      if(input.value.trim())return;
      setTimeout(()=>{
        if(input.value.trim())return;
        box.innerHTML=quickHtml();
        box.classList.add('open','k-quick-open');
      },0);
    };
    const clearQuick=()=>box.classList.remove('k-quick-open');
    input.addEventListener('focus',show);
    input.addEventListener('click',show);
    input.addEventListener('input',()=>{if(input.value.trim())clearQuick();else show()});
    document.addEventListener('click',e=>{if(!e.target.closest('.kp-global-search'))clearQuick()});
    return true;
  }

  function statInfo(label){
    const root=document.getElementById('traderWorkbench');
    if(!root)return null;
    const card=[...root.querySelectorAll('.v5-stat')].find(x=>x.querySelector('.top span')?.textContent?.trim().toLowerCase().includes(label.toLowerCase()));
    if(!card)return null;
    return {value:card.querySelector('strong')?.textContent?.trim()||'0',meta:card.querySelector(':scope > span:last-child')?.textContent?.trim()||''};
  }
  function numFromText(v){const m=String(v||'').match(/\d+/);return m?Number(m[0]):0}
  function moneyActive(v){return !/^\s*0(?:[.,]0+)?\s*₺?\s*$/.test(String(v||'').trim())}

  function jumpTrader(kind){
    const root=document.getElementById('traderWorkbench');if(!root)return;
    const map={neg:'Bekleyen Pazarlıklar',stock:'İlan & Stok Merkezi',deal:'Güvenli İşlemler',today:'Pazarcı Hızlı Yönetim'};
    const text=map[kind]||'';
    const h=[...root.querySelectorAll('h3')].find(x=>x.textContent.includes(text));
    (h?.closest('.v5-layout')||h?.closest('.v5-card-head')||root).scrollIntoView({behavior:'smooth',block:'center'});
  }
  window.kTraderJump=jumpTrader;

  function updateTraderFocus(){
    if(!isTrader)return false;
    const root=document.getElementById('traderWorkbench');
    const head=root?.querySelector(':scope > .v5-card-head');
    if(!root||!head)return false;
    let bar=root.querySelector('.k-trader-focusbar');
    if(!bar){bar=document.createElement('div');bar.className='k-trader-focusbar';head.insertAdjacentElement('afterend',bar)}

    const neg=statInfo('Bekleyen Pazarlık')||{value:'0',meta:''};
    const stock=statInfo('Aktif Stok')||{value:'0',meta:''};
    const escrow=statInfo('Aktif Emanet')||{value:'0,00 ₺',meta:''};
    const today=statInfo('Bugün Net')||{value:'0,00 ₺',meta:''};
    const lowMatch=String(stock.meta||'').match(/(\d+)\s+düşük stok/i);
    const low=lowMatch?Number(lowMatch[1]):0;
    const negCount=numFromText(neg.value);
    const escrowOn=moneyActive(escrow.value);

    bar.innerHTML=`
      <button class="k-trader-focus ${negCount>0?'hot':'ok'}" type="button" onclick="kTraderJump('neg')"><span class="kf-ico">💬</span><span class="kf-copy"><small>BEKLEYEN PAZARLIK</small><strong>${neg.value}</strong></span><span class="kf-go">→</span></button>
      <button class="k-trader-focus ${low>0?'warn':'ok'}" type="button" onclick="kTraderJump('stock')"><span class="kf-ico">📦</span><span class="kf-copy"><small>DÜŞÜK STOK</small><strong>${low} ilan</strong></span><span class="kf-go">→</span></button>
      <button class="k-trader-focus ${escrowOn?'hot':'ok'}" type="button" onclick="kTraderJump('deal')"><span class="kf-ico">🔐</span><span class="kf-copy"><small>AKTİF EMANET</small><strong>${escrow.value}</strong></span><span class="kf-go">→</span></button>
      <button class="k-trader-focus ok" type="button" onclick="kTraderJump('today')"><span class="kf-ico">📈</span><span class="kf-copy"><small>BUGÜN NET</small><strong>${today.value}</strong></span><span class="kf-go">→</span></button>`;
    return true;
  }

  const install=()=>{installHomeQuickSearch();updateTraderFocus()};
  [250,600,1100,1800,2800].forEach(ms=>setTimeout(install,ms));
  setInterval(()=>{if(document.visibilityState==='visible'){if(isHome)installHomeQuickSearch();if(isTrader)updateTraderFocus()}},4000);
})();
