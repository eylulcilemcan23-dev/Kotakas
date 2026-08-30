(()=>{
  const KEY='kotakas.cart.v1';
  const path=location.pathname.toLowerCase();
  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const gb=n=>Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2})+' GB';
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(x)?x:[]}catch{return []}};
  const write=rows=>{localStorage.setItem(KEY,JSON.stringify(rows));paintCount();if(path.endsWith('/basket.html'))renderBasket()};
  const ids=()=>new Set(read().map(x=>Number(x.id)));

  async function getDetails(id){
    try{const d=await api(`/api/listings/${Number(id)}/details`);return d?.listing||null}catch{return null}
  }

  window.kAddListingToCart=async id=>{
    id=Number(id||0);if(!id)return;
    const rows=read();
    if(rows.some(x=>Number(x.id)===id)){toast?.('Bu ilan zaten sepetinde.');paintCount();return}
    const x=await getDetails(id);
    if(!x){toast?.('İlan bilgisi alınamadı.');return}
    if(String(x.status||'').toLowerCase()!=='active'||Number(x.stock||0)<=0){toast?.('Bu ilan artık satışta değil.');return}
    rows.push({id:Number(x.id),itemName:String(x.itemName||'Item'),serverCode:String(x.serverCode||''),priceGb:Number(x.priceGb||0),stock:Number(x.stock||0),sellerName:String(x.sellerName||''),addedAt:new Date().toISOString()});
    write(rows);
    toast?.('Ürün sepete eklendi.');
  };

  window.kRemoveCartItem=id=>write(read().filter(x=>Number(x.id)!==Number(id)));
  window.kClearCart=()=>{if(!read().length)return;if(confirm('Sepetteki tüm ürünler kaldırılsın mı?'))write([])};
  window.kCartBuy=async id=>{
    if(typeof ME==='undefined'||!ME){location.href='/login.html';return}
    const x=await getDetails(id);
    if(!x){toast?.('İlan bilgisi alınamadı.');return}
    if(String(x.status||'').toLowerCase()!=='active'||Number(x.stock||0)<=0){toast?.('Bu ilan artık satışta değil.');await renderBasket();return}
    if(typeof window.buyListing==='function')return window.buyListing(Number(x.id),Number(x.stock),String(x.itemName||'Item'),Number(x.priceGb||0));
    location.href=`/listing.html?id=${encodeURIComponent(x.id)}`;
  };

  function paintCount(){
    const count=read().length;
    document.querySelectorAll('[data-cart-count]').forEach(x=>{x.textContent=String(count);x.style.display=count?'grid':'none'});
  }

  function cartButton(){return `<a class="k-cart-button" href="/basket.html" title="Sepetim" aria-label="Sepetim"><span class="k-cart-icon">🛒</span><span class="k-cart-label">Sepetim</span><b data-cart-count style="display:${read().length?'grid':'none'}">${read().length}</b></a>`}

  function patchHeader(){
    document.querySelectorAll('.k-wallet-pill').forEach(x=>x.remove());
    const right=document.querySelector('.k-shell-right');
    if(right&&!right.querySelector('.k-cart-button')){
      const notif=right.querySelector('.k-icon-btn');
      if(notif)notif.insertAdjacentHTML('beforebegin',cartButton());else right.insertAdjacentHTML('afterbegin',cartButton());
    }
    const guest=document.querySelector('.k-shell-guest');
    if(guest&&!guest.querySelector('.k-cart-button'))guest.insertAdjacentHTML('beforeend',cartButton());
    paintCount();
  }

  function drawerBottom(){return `<div class="k-drawer-store-actions" data-store-actions>
    <a href="/urgent-sell.html">🤝 <b>Bize Sat</b></a>
    <a href="/sell.html">▣ <b>İlan Ekle</b></a>
    <a class="wallet" href="/wallet.html">BAKİYE YÜKLE</a>
  </div>`}

  function patchDrawer(){
    const d=document.getElementById('kShellDrawer');if(!d)return;
    d.querySelector('[data-store-actions]')?.remove();
    d.insertAdjacentHTML('beforeend',drawerBottom());
  }

  function footerHtml(){return `<div class="container k-store-footer-grid">
      <div class="k-store-footer-brand"><a class="k-shell-logo" href="/"><span class="ko">KO</span><span class="tak">TAKAS</span></a><p>Oyun dünyasının güvenli item, karakter ve oyun parası pazaryeri. Emanet ödeme ve kayıtlı işlem akışı KOTAKAS içinde kalır.</p><div class="k-store-social"><span>●</span><span>●</span><span>●</span><span>●</span></div></div>
      <div><h4>HUKUKİ</h4><a href="/terms.html">Kullanım Koşulları</a><a href="/rules.html">İşlem Kuralları</a><a href="/privacy.html">Gizlilik / KVKK</a><a href="/cookies.html">Çerez Politikası</a></div>
      <div><h4>DESTEK</h4><a href="/support.html">Destek Sistemi</a><a href="/contact.html">İletişim</a><a href="/trader-apply.html">Pazarcı Başvurusu</a><a href="/reports.html">Sorun Bildir</a></div>
      <div><h4>KNIGHT ONLINE</h4><a href="/market.html?game=knight-online">Knight Online GB</a><a href="/buy.html?game=knight-online">Knight Online Item</a><a href="/ring-sell.html?game=knight-online">Knight Online Karakter</a><a href="/urgent-sell.html?game=knight-online">Bize Sat</a></div>
      <div><h4>RISE ONLINE</h4><a href="/market.html?game=rise-online">Rise Online Gold</a><a href="/buy.html?game=rise-online">Rise Online Item</a><a href="/ring-sell.html?game=rise-online">Rise Online Karakter</a></div>
      <div><h4>POPÜLER OYUNLAR</h4><a href="/market.html?game=valorant">Valorant VP</a><a href="/market.html?game=pubg-mobile">PUBG Mobile UC</a><a href="/market.html?game=mobile-legends">Mobile Legends</a><a href="/market.html?game=metin2">Metin2</a></div>
    </div>
    <div class="container k-store-support-row"><a href="/support.html">💬 KOTAKAS Destek Merkezi <small>İşlem ve hesap desteği</small></a></div>
    <div class="k-store-footer-bottom"><div class="container"><span>🔒 Emanet Ödeme</span><span>🛡️ Güvenli İşlem</span><span>✓ Doğrulanmış Pazarcılar</span><span class="spacer"></span><b>© 2026 KOTAKAS</b></div></div>`}

  function patchFooter(){
    if(path.endsWith('/admin.html'))return;
    const f=document.querySelector('footer');if(!f||f.dataset.storeFooter==='1')return;
    f.dataset.storeFooter='1';f.className='k-store-footer';f.innerHTML=footerHtml();
  }

  function extractListingId(card){
    const link=card.querySelector('a[href*="listing.html?id="]');
    if(link){try{return Number(new URL(link.href,location.origin).searchParams.get('id')||0)}catch{}}
    const direct=card.querySelector('[onclick*="buyListing("]');
    const m=direct?.getAttribute('onclick')?.match(/buyListing\(\s*(\d+)/);if(m)return Number(m[1]);
    const open=card.querySelector('[onclick*="openListingDetail("]');
    const m2=open?.getAttribute('onclick')?.match(/openListingDetail\(\s*(\d+)/);return m2?Number(m2[1]):0;
  }

  function decorateBuyCards(){
    const root=document.getElementById('buyListings');if(!root)return;
    root.querySelectorAll('.v5-card,.card,.kp-product-card,.listitem').forEach(card=>{
      if(card.dataset.cartDecorated==='1')return;
      const id=extractListingId(card);if(!id)return;
      card.dataset.cartDecorated='1';
      const target=card.querySelector('.actions')||card.querySelector('.kp-product-price')||card;
      target.insertAdjacentHTML('beforeend',`<button type="button" class="btn ghost sm k-add-cart" onclick="kAddListingToCart(${id})">🛒 Sepete Ekle</button>`);
    });
  }

  async function decorateListingPage(){
    if(!path.endsWith('/listing.html'))return;
    const id=Number(new URLSearchParams(location.search).get('id')||0);if(!id)return;
    const grid=document.querySelector('.listing-action-grid');if(!grid||grid.querySelector('.k-add-cart'))return;
    grid.insertAdjacentHTML('beforeend',`<button type="button" class="btn ghost k-add-cart" onclick="kAddListingToCart(${id})">🛒 Sepete Ekle</button>`);
  }

  async function renderBasket(){
    const box=document.getElementById('kBasketContent');if(!box)return;
    const raw=read();
    if(!raw.length){box.innerHTML=`<div class="k-basket-card k-basket-empty"><div>🛒</div><strong>Sepetiniz Boş</strong><span>Henüz sepetinize ürün eklemediniz.</span><a class="btn teal" href="/buy.html">Item Pazarına Git</a></div>`;paintCount();return}
    box.innerHTML='<div class="k-basket-card k-basket-loading">Sepet güncel fiyat ve stoklarla kontrol ediliyor...</div>';
    const cfg=await api('/api/public/market-config').catch(()=>({gbTryRate:0}));
    const details=await Promise.all(raw.map(async r=>({saved:r,current:await getDetails(r.id)})));
    const active=details.filter(x=>x.current&&String(x.current.status||'').toLowerCase()==='active'&&Number(x.current.stock||0)>0);
    const totalGb=active.reduce((s,x)=>s+Number(x.current.priceGb||0),0);const rate=Number(cfg.gbTryRate||0);
    const rows=details.map(({saved,current})=>{
      const x=current||saved;const ok=!!current&&String(current.status||'').toLowerCase()==='active'&&Number(current.stock||0)>0;
      const changed=!!current&&Number(saved.priceGb)!==Number(current.priceGb);
      return `<article class="k-basket-item ${ok?'':'disabled'}"><div class="k-basket-item-icon">⚔️</div><div class="k-basket-item-main"><strong>${safe(x.itemName||saved.itemName)}</strong><span>${safe(x.serverCode||saved.serverCode)} • ${safe(x.sellerName||saved.sellerName||'Pazarcı')} • Stok ${Number(x.stock||0)}</span>${changed?`<em>Fiyat güncellendi: ${gb(saved.priceGb)} → ${gb(x.priceGb)}</em>`:''}${!ok?'<em>Bu ilan artık aktif değil.</em>':''}</div><div class="k-basket-item-price"><strong>${gb(x.priceGb)}</strong>${rate>0?`<span>≈ ${money(Number(x.priceGb||0)*rate)}</span>`:''}</div><div class="k-basket-item-actions">${ok?`<button class="btn teal sm" onclick="kCartBuy(${Number(x.id||saved.id)})">Güvenli Satın Al</button>`:''}<a class="btn ghost sm" href="/listing.html?id=${Number(x.id||saved.id)}">İlanı Aç</a><button class="btn ghost sm" onclick="kRemoveCartItem(${Number(saved.id)})">Kaldır</button></div></article>`;
    }).join('');
    box.innerHTML=`<div class="k-basket-layout"><section><div class="k-basket-card"><div class="k-basket-title"><strong>🛒 Sepetim</strong><span>${raw.length} ürün</span><button class="btn ghost sm" onclick="kClearCart()">Sepeti Temizle</button></div><div class="k-basket-list">${rows}</div></div></section><aside class="k-basket-card k-basket-summary"><h3>Sipariş Özeti</h3><div><span>Aktif ürün</span><b>${active.length}</b></div><div><span>Toplam</span><b>${gb(totalGb)}</b></div>${rate>0?`<div class="total"><span>Yaklaşık TL</span><b>${money(totalGb*rate)}</b></div>`:''}<p>Her ilan KOTAKAS emanet sistemiyle ayrı güvenli işlem olarak başlatılır. Stok ve fiyat satın alma anında tekrar doğrulanır.</p><a class="btn ghost full" href="/buy.html">Alışverişe Devam Et</a></aside></div>`;
    paintCount();
  }

  function tick(){patchHeader();patchDrawer();patchFooter();decorateBuyCards();decorateListingPage();paintCount()}
  document.addEventListener('click',e=>{if(e.target.closest('.k-shell-menu'))setTimeout(()=>{patchDrawer();patchHeader()},80)});
  window.addEventListener('storage',e=>{if(e.key===KEY){paintCount();if(path.endsWith('/basket.html'))renderBasket()}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tick,80)});
  [250,700,1400,2600,4200,7000].forEach(ms=>setTimeout(tick,ms));
  if(path.endsWith('/basket.html'))setTimeout(renderBasket,900);
})();
