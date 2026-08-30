(()=>{
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const gb=n=>Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2})+' GB';
  const path=location.pathname.toLowerCase();
  let buyRows=[];

  function ensureExperienceCss(){
    if(document.querySelector('link[href="/assets/listing-experience.css"]'))return;
    const l=document.createElement('link');l.rel='stylesheet';l.href='/assets/listing-experience.css';document.head.append(l);
  }

  async function ensureMe(){try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}}
  const listingUrl=id=>`/listing.html?id=${encodeURIComponent(id)}`;
  window.openListingDetail=id=>{location.href=listingUrl(id)};
  window.shareListing=async(id,itemEncoded)=>{const title=decodeURIComponent(itemEncoded||'KOTAKAS ilanı'),url=`${location.origin}${listingUrl(id)}`;try{if(navigator.share)await navigator.share({title:`${title} • KOTAKAS`,url});else{await navigator.clipboard.writeText(url);toast('İlan bağlantısı kopyalandı.')}}catch{}};
  window.scrollListingQuickContact=()=>document.querySelector('#listingQuickContact')?.scrollIntoView({behavior:'smooth',block:'start'});

  function itemIcon(name){const n=String(name||'').toLowerCase();if(n.includes('bow'))return '🏹';if(n.includes('staff')||n.includes('woe'))return '🪄';if(n.includes('dagger')||n.includes('shard'))return '🗡️';if(n.includes('belt'))return '🧿';if(n.includes('earring'))return '💎';if(n.includes('ring'))return '💍';if(n.includes('shield'))return '🛡️';return '⚔️'}

  function historyBars(rows,current){
    const list=(rows||[]).length?rows:[{priceGb:current,createdAt:new Date().toISOString()}];
    const values=list.map(x=>Number(x.priceGb||0));const max=Math.max(...values,1),min=Math.min(...values,0),span=Math.max(max-min,1);
    return list.slice(-24).map(x=>{const value=Number(x.priceGb||0),h=38+((value-min)/span)*94;return `<div class="listing-history-bar" style="height:${h}px" data-label="${gb(value)}"></div>`}).join('');
  }

  function offerBlock(o){if(!o)return '';const status=String(o.status||'').toUpperCase();const action=o.status==='accepted'?`<button class="btn teal" onclick="purchaseAcceptedPriceOffer(${o.id})">Kabul Edilen Fiyattan Satın Al</button>`:'';return `<div class="notice" style="margin-top:12px"><strong>Fiyat teklifin: ${gb(o.offerGbPerUnit)} / adet • ${o.quantity} adet</strong><div class="actions" style="margin-top:8px"><span class="pill purple">${esc(status)}</span>${action}</div></div>`}

  async function renderListingPage(){
    if(!path.endsWith('/listing.html'))return;
    ensureExperienceCss();await ensureMe();
    const id=Number(new URLSearchParams(location.search).get('id')||0);if(!id){$('#listingHero').innerHTML='<div class="empty">Geçersiz ilan.</div>';return}
    try{
      const [d,cfg,all]=await Promise.all([api(`/api/listings/${id}/details`),api('/api/public/market-config').catch(()=>({gbTryRate:0})),api('/api/listings').catch(()=>({listings:[]}))]);
      const x=d.listing,rate=Number(cfg.gbTryRate||0),tryPrice=Number(x.priceGb||0)*rate,own=!!ME&&ME.id===x.sellerUserId,canBuy=!!ME&&!own&&x.status==='active'&&Number(x.stock)>0;
      document.title=`${x.itemName} • KOTAKAS`;$('#listingBreadcrumb').textContent=`KOTAKAS / Item Al / ${x.serverCode} / ${x.itemName}`;
      const guest=`<a class="btn teal" href="/login.html">Giriş Yapıp Satın Al</a>`;
      const actions=!ME?guest:own?'<button class="btn ghost" disabled>Kendi İlanınız</button>':`<button class="btn teal" ${canBuy?'':'disabled'} onclick="buyListing(${x.id},${Number(x.stock)},'${esc(x.itemName).replaceAll("'","\\'")}',${Number(x.priceGb)})">🛒 Güvenli Satın Al</button><button class="btn ghost" onclick="promptListingPriceOffer(${x.id},${Number(x.priceGb)},${Number(x.stock)})">💬 Fiyat Teklifi Ver</button><button class="btn ghost" onclick="scrollListingQuickContact()">⚡ Satıcıya Sor</button>`;
      $('#listingHero').innerHTML=`<div class="listing-hero-grid"><div class="v5-card listing-item-showcase"><span class="pill green">● Çevrimiçi İlan</span><div class="listing-item-orb">${itemIcon(x.itemName)}</div><div><h2>${esc(x.itemName)}</h2><div class="muted">${esc(x.serverCode)} • Stok ${x.stock}</div></div><div class="actions"><span class="pill purple">SELL</span><span class="pill ${x.status==='active'?'green':'gold'}">${esc(String(x.status).toUpperCase())}</span></div></div><div class="v5-card listing-main-card"><div class="listing-topline"><div><span class="pill purple">${esc(x.serverCode)}</span> <span class="pill">Stok ${x.stock}</span><h1 style="margin:10px 0 0">${esc(x.itemName)}</h1></div><div class="spacer"></div><button class="btn sm ghost" onclick="shareListing(${x.id},'${encodeURIComponent(x.itemName)}')">↗ Paylaş</button></div><div class="listing-price">${gb(x.priceGb)}</div><div class="listing-price-try">${rate>0?`Yaklaşık ${money(tryPrice)} / adet`:'TL kuru henüz ayarlanmamış'}</div><div class="listing-seller"><div class="listing-seller-avatar">✓</div><div class="listing-seller-meta"><strong>${esc(x.sellerName)}</strong><span>⭐ ${Number(x.traderRating||0).toFixed(1)} • ${x.traderReviews||0} değerlendirme • ${x.traderCompletedDeals||0} başarılı işlem</span></div><div class="spacer"></div><span class="pill green">Doğrulanmış Pazarcı</span></div><div class="listing-action-grid">${actions}</div>${!own?offerBlock(d.myOffer):''}<div class="grid3" style="margin-top:18px"><div class="v5-stat"><span>İlan tarihi</span><strong style="font-size:15px">${formatDate(x.createdAt)}</strong></div><div class="v5-stat green"><span>Favori</span><strong>${x.favoriteCount||0}</strong></div><div class="v5-stat purple"><span>Stok</span><strong>${x.stock}</strong></div></div></div></div>`;
      $('#listingWarning').innerHTML=`<div class="listing-section listing-warning"><strong>🛡️ KOTAKAS Güvenli İşlem Uyarısı</strong>Ödemeyi veya iletişimi KOTAKAS dışına taşımayın. WhatsApp, Instagram, telefon, IBAN veya farklı bir ödeme yöntemi isteyen kişilere işlem yapmayın. Tutar güvenli satın almada önce emanet bakiyeye alınır.</div>`;
      $('#listingStats').innerHTML=`<div class="v5-card listing-section"><div class="v5-card-head"><div><h3>📈 Fiyat İstatistiği</h3><p>İlanın kayıtlı fiyat değişimleri.</p></div><div class="spacer"></div><span class="pill purple">Son ${Math.max((d.priceHistory||[]).length,1)} kayıt</span></div><div class="listing-history-bars">${historyBars(d.priceHistory,x.priceGb)}</div></div>`;
      $('#listingSafety').innerHTML=`<div class="v5-card listing-section"><div class="v5-card-head"><div><h3>🔐 Bu Ürünü Nasıl Güvenli Alırsınız?</h3><p>KOTAKAS emanet ödeme akışı.</p></div></div><div class="listing-safe-steps"><div class="listing-safe-step"><div style="font-size:28px">🛒</div><b>1. Sipariş Ver</b><span>İlanı satın al veya kabul edilmiş tekliften işlemi başlat.</span></div><div class="listing-safe-step"><div style="font-size:28px">🔒</div><b>2. Ödeme Kilitlenir</b><span>Tutar pazarcıya gitmez; KOTAKAS emanet bakiyesinde tutulur.</span></div><div class="listing-safe-step"><div style="font-size:28px">🎮</div><b>3. Itemi Teslim Al</b><span>Oyunda teslimatı gerçekleştir ve hazır mesajlarla durumu bildir.</span></div><div class="listing-safe-step"><div style="font-size:28px">✅</div><b>4. Onayla</b><span>Itemi aldıktan sonra onay ver; ödeme pazarcıya aktarılır.</span></div></div></div>`;
      const related=(all.listings||[]).filter(r=>r.sellerUserId===x.sellerUserId&&Number(r.id)!==Number(x.id)&&r.status==='active').slice(0,4);
      $('#listingRelated').innerHTML=related.length?`<div class="listing-section"><div class="v5-card-head"><div><h3>Satıcının Diğer İlanları</h3><p>${esc(x.sellerName)} tarafından yayınlanan diğer aktif SELL ilanları.</p></div></div><div class="listing-related-grid">${related.map(r=>`<div class="v5-card listing-related-card"><div class="itemtitle">${esc(r.itemName)}</div><div class="meta">${esc(r.serverCode)} • Stok ${r.stock}</div><div class="price" style="margin:12px 0">${gb(r.priceGb)}</div><a class="btn sm teal full" href="${listingUrl(r.id)}">İncele</a></div>`).join('')}</div></div>`:'';
      await renderListingQuickContact(id,x.sellerUserId);
    }catch(err){$('#listingHero').innerHTML=`<div class="v5-card"><div class="empty">İlan yüklenemedi. ${esc(err.data?.error||'')}</div></div>`}
  }

  async function renderListingQuickContact(listingId,sellerUserId){
    const box=$('#listingQuickContact');if(!box)return;
    if(!ME){box.innerHTML='<div class="v5-card quick-contact-wrap"><div class="v5-card-head"><div><h3>⚡ Satıcıya Sor</h3><p>Serbest sohbet yerine güvenli hazır sorular kullanılır.</p></div></div><a class="btn teal" href="/login.html">Giriş Yap ve Soru Sor</a></div>';return}
    if(ME.id===sellerUserId){await renderSellerListingThreads(listingId,box);return}
    box.innerHTML='<div class="v5-card quick-contact-wrap"><div class="empty">Hızlı soru alanı yükleniyor...</div></div>';
    try{
      const d=await api(`/api/listings/${listingId}/quick-contact`),messages=d.messages||[],questions=d.questions||{};
      box.innerHTML=`<div class="v5-card quick-contact-wrap"><div class="v5-card-head"><div><h3>⚡ Satıcıya Sor</h3><p>Telefon/WhatsApp paylaşmadan yalnız hazır sorularla güvenli iletişim.</p></div><div class="spacer"></div><span class="pill green">Serbest sohbet kapalı</span></div><div class="quick-contact-messages">${messages.length?messages.map(m=>`<div class="quick-contact-msg ${m.senderUserId===ME.id?'me':''}">${esc(m.messageText)}<small>${m.senderRole==='seller'?'Pazarcı':'Siz'} • ${formatDate(m.createdAt)}</small></div>`).join(''):'<div class="empty">Henüz soru yok. Aşağıdan hazır bir soru seç.</div>'}</div><div class="quick-contact-buttons">${Object.entries(questions).map(([code,text])=>`<button class="btn sm ghost" onclick="sendListingQuickContact(${listingId},'${code}')">${esc(text)}</button>`).join('')}</div></div>`;
    }catch{box.innerHTML='<div class="v5-card quick-contact-wrap"><div class="empty">Hızlı soru alanı yüklenemedi.</div></div>'}
  }

  async function renderSellerListingThreads(listingId,box){
    try{
      const d=await api('/api/listing-quick-contact/mine'),rows=(d.messages||[]).filter(x=>Number(x.listingId)===Number(listingId)&&x.sellerUserId===ME.id),answers=d.answers||{};
      const groups=groupThreads(rows);const selected=new URLSearchParams(location.search).get('buyer');
      let selectedHtml='';
      if(selected&&groups.some(g=>g.buyerUserId===selected)){
        const t=await api(`/api/listings/${listingId}/quick-contact?buyerUserId=${encodeURIComponent(selected)}`),msgs=t.messages||[];
        selectedHtml=`<div class="quick-contact-messages">${msgs.map(m=>`<div class="quick-contact-msg ${m.senderUserId===ME.id?'me':''}">${esc(m.messageText)}<small>${m.senderRole==='seller'?'Siz':'Alıcı'} • ${formatDate(m.createdAt)}</small></div>`).join('')}</div><div class="quick-contact-buttons">${Object.entries(answers).map(([code,text])=>`<button class="btn sm ghost" onclick="sendListingQuickContact(${listingId},'${code}','${selected}')">${esc(text)}</button>`).join('')}</div>`;
      }
      box.innerHTML=`<div class="v5-card quick-contact-wrap"><div class="v5-card-head"><div><h3>⚡ Bu İlanın Hızlı Soruları</h3><p>Alıcıların hazır sorularını yanıtla. Serbest mesajlaşma kapalıdır.</p></div><div class="spacer"></div><span class="pill ${groups.some(g=>g.unanswered)?'gold':'green'}">${groups.filter(g=>g.unanswered).length} yanıt bekliyor</span></div>${groups.length?groups.map(g=>`<div class="quick-contact-thread" data-unanswered="${g.unanswered?'1':'0'}"><div class="itemhead"><div><strong>${esc(g.buyerName)}</strong><div class="meta">${esc(g.latest.messageText)} • ${formatDate(g.latest.createdAt)}</div></div><div class="spacer"></div><a class="btn sm ${g.unanswered?'teal':'ghost'}" href="${listingUrl(listingId)}&buyer=${encodeURIComponent(g.buyerUserId)}">${g.unanswered?'Yanıtla':'Geçmiş'}</a></div></div>`).join(''):'<div class="empty">Bu ilana henüz soru gelmedi.</div>'}${selectedHtml}</div>`;
    }catch{box.innerHTML='<div class="v5-card quick-contact-wrap"><div class="empty">Hızlı sorular yüklenemedi.</div></div>'}
  }

  function groupThreads(rows){
    const map=new Map();
    for(const r of rows){const key=`${r.listingId}|${r.buyerUserId}`;let g=map.get(key);if(!g){g={listingId:r.listingId,buyerUserId:r.buyerUserId,buyerName:r.buyerName,latest:r,rows:[]};map.set(key,g)}g.rows.push(r);if(new Date(r.createdAt)>new Date(g.latest.createdAt))g.latest=r}
    return [...map.values()].map(g=>({...g,unanswered:g.latest.senderRole==='buyer'})).sort((a,b)=>new Date(b.latest.createdAt)-new Date(a.latest.createdAt));
  }

  window.sendListingQuickContact=async(listingId,code,buyerUserId=null)=>{
    try{await api(`/api/listings/${listingId}/quick-contact`,{method:'POST',body:{code,buyerUserId}});toast(buyerUserId?'Hazır yanıt gönderildi.':'Sorun pazarcıya gönderildi.');if(path.endsWith('/listing.html')){const d=await api(`/api/listings/${listingId}/details`);await renderListingQuickContact(listingId,d.listing.sellerUserId)}else setTimeout(renderPanelQuickContact,150)}catch(err){const map={quick_message_too_fast:'Aynı mesajı çok hızlı tekrar gönderdin.',quick_question_only:'Yalnız hazır sorular kullanılabilir.',quick_answer_only:'Yalnız hazır yanıtlar kullanılabilir.',buyer_thread_required:'Yanıtlanacak alıcı konuşması bulunamadı.'};toast(map[err.data?.error]||'Hızlı mesaj gönderilemedi.')}};

  async function renderPanelQuickContact(){
    if(!ME||(!path.endsWith('/dashboard.html')&&!path.endsWith('/trader.html')))return;
    try{
      const d=await api('/api/listing-quick-contact/mine'),all=d.messages||[],isTrader=ME.role==='trader',rows=all.filter(x=>isTrader?x.sellerUserId===ME.id:x.buyerUserId===ME.id),groups=groupThreads(rows).slice(0,8);
      document.querySelector('#panelQuickContactCenter')?.remove();
      const card=document.createElement('div');card.id='panelQuickContactCenter';card.className='v5-card seller-question-center';
      if(isTrader){
        card.innerHTML=`<div class="v5-card-head"><div><h3>⚡ Alıcı Hızlı Soruları</h3><p>İlanlarına gelen güvenli hazır sorular.</p></div><div class="spacer"></div><span class="pill ${groups.some(g=>g.unanswered)?'gold':'green'}">${groups.filter(g=>g.unanswered).length} bekleyen</span></div>${groups.length?groups.map(g=>`<div class="quick-contact-thread" data-unanswered="${g.unanswered?'1':'0'}"><div class="itemhead"><div><strong>${esc(g.latest.listing?.itemName||'İlan')} • ${esc(g.buyerName)}</strong><div class="meta">${esc(g.latest.messageText)} • ${formatDate(g.latest.createdAt)}</div></div><div class="spacer"></div><a class="btn sm ${g.unanswered?'teal':'ghost'}" href="${listingUrl(g.listingId)}&buyer=${encodeURIComponent(g.buyerUserId)}">${g.unanswered?'Yanıtla':'Aç'}</a></div></div>`).join(''):'<div class="empty">Henüz hızlı soru yok.</div>'}`;
      }else{
        card.innerHTML=`<div class="v5-card-head"><div><h3>⚡ Satıcı Yanıtları</h3><p>İlanlara gönderdiğin hazır sorular ve pazarcı yanıtları.</p></div></div>${groups.length?groups.map(g=>`<div class="quick-contact-thread"><div class="itemhead"><div><strong>${esc(g.latest.listing?.itemName||'İlan')}</strong><div class="meta">${g.latest.senderRole==='seller'?'Pazarcı: ':'Siz: '}${esc(g.latest.messageText)} • ${formatDate(g.latest.createdAt)}</div></div><div class="spacer"></div><a class="btn sm ghost" href="${listingUrl(g.listingId)}">İlana Git</a></div></div>`).join(''):'<div class="empty">Henüz satıcıya soru göndermedin.</div>'}`;
      }
      const anchor=document.querySelector(isTrader?'#traderProCenter':'#userProCenter')||document.querySelector('main .container section')||document.querySelector('main .container');anchor?.insertAdjacentElement('afterend',card);
    }catch{}
  }

  function injectBuyFilters(){
    if(!path.endsWith('/buy.html'))return;ensureExperienceCss();const box=$('#buyListings');if(!box||$('#buyProTools'))return;
    api('/api/listings').then(d=>{buyRows=d.listings||[];const servers=[...new Set(buyRows.map(x=>x.serverCode).filter(Boolean))].sort();const tools=document.createElement('div');tools.id='buyProTools';tools.className='v5-card buy-pro-tools';tools.innerHTML=`<input id="buyFilterQ" placeholder="Item veya pazarcı ara..."><select id="buyFilterServer"><option value="all">Tüm Serverlar</option>${servers.map(s=>`<option>${esc(s)}</option>`).join('')}</select><select id="buyFilterStock"><option value="all">Tüm Stoklar</option><option value="available">Stokta olanlar</option><option value="multi">2+ stok</option></select><select id="buyFilterSort"><option value="new">En Yeniler</option><option value="low">En Düşük Fiyat</option><option value="high">En Yüksek Fiyat</option><option value="name">İsme Göre</option></select>`;box.before(tools);['buyFilterQ','buyFilterServer','buyFilterStock','buyFilterSort'].forEach(id=>$('#'+id)?.addEventListener(id==='buyFilterQ'?'input':'change',applyBuyFilters));setTimeout(decorateBuyPriceData,250)}).catch(()=>{});
  }

  function decorateBuyPriceData(){const map=new Map(buyRows.map(x=>[Number(x.id),x]));$$('#buyListings [data-listing-id]').forEach(card=>{const x=map.get(Number(card.dataset.listingId));if(x){card.dataset.price=x.priceGb;card.dataset.stock=x.stock;card.dataset.seller=(x.sellerName||'').toLowerCase()}});applyBuyFilters()}
  function applyBuyFilters(){const box=$('#buyListings');if(!box)return;const q=($('#buyFilterQ')?.value||'').trim().toLowerCase(),server=$('#buyFilterServer')?.value||'all',stock=$('#buyFilterStock')?.value||'all',sort=$('#buyFilterSort')?.value||'new';let cards=$$('#buyListings [data-listing-id]');cards.forEach(c=>{const matchesQ=!q||(c.dataset.item||'').includes(q)||(c.dataset.seller||'').includes(q),matchesServer=server==='all'||c.dataset.server===server,matchesStock=stock==='all'||(stock==='available'&&Number(c.dataset.stock)>0)||(stock==='multi'&&Number(c.dataset.stock)>=2);c.style.display=matchesQ&&matchesServer&&matchesStock?'':'none'});cards=cards.filter(c=>c.style.display!=='none');cards.sort((a,b)=>sort==='low'?Number(a.dataset.price)-Number(b.dataset.price):sort==='high'?Number(b.dataset.price)-Number(a.dataset.price):sort==='name'?(a.dataset.item||'').localeCompare(b.dataset.item||'','tr'):Number(b.dataset.listingId)-Number(a.dataset.listingId));cards.forEach(c=>box.append(c))}

  async function boot(){await ensureMe();if(path.endsWith('/listing.html'))await renderListingPage();if(path.endsWith('/buy.html')){setTimeout(injectBuyFilters,350);setTimeout(()=>{injectBuyFilters();decorateBuyPriceData()},900)}if(path.endsWith('/dashboard.html')||path.endsWith('/trader.html')){setTimeout(renderPanelQuickContact,1100);setTimeout(renderPanelQuickContact,2100)}}
  boot();
})();
