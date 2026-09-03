(()=>{
  const path=location.pathname.toLowerCase();
  const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gb=n=>`${Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2})} GB`;
  const statusText=s=>({pending_gb:'GB BEKLENİYOR',gb_received:'GB ALINDI / TESLİM BEKLİYOR',completed:'TAMAMLANDI',cancelled:'İPTAL'})[s]||String(s||'').toUpperCase();

  function addStyle(){
    if(document.getElementById('kKotakasStockStyle'))return;
    const s=document.createElement('style');s.id='kKotakasStockStyle';s.textContent=`
      .k-stock-shell{margin:0 0 18px}.k-stock-head{display:flex;gap:12px;align-items:end;margin-bottom:12px}.k-stock-head h2{margin:0;color:#fff}.k-stock-head p{margin:4px 0 0;color:#94a2bc}.k-stock-badge{font-size:11px;font-weight:950;color:#72f6d5;border:1px solid rgba(73,238,200,.28);background:rgba(73,238,200,.08);padding:5px 8px;border-radius:999px}
      .k-stock-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.k-stock-card{overflow:hidden;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:linear-gradient(180deg,#151c2c,#0d121f)}.k-stock-img{height:150px;background:radial-gradient(circle at 25% 20%,rgba(255,40,90,.22),transparent 40%),#0d111c;display:flex;align-items:center;justify-content:center;overflow:hidden}.k-stock-img img{width:100%;height:100%;object-fit:cover}.k-stock-placeholder{font-size:44px;opacity:.75}.k-stock-body{padding:14px}.k-stock-body h3{margin:0 0 5px;color:#fff}.k-stock-meta{font-size:12px;color:#8fa0bd}.k-stock-price{font-size:24px;font-weight:950;color:#28e4d3;margin:10px 0}.k-stock-profit{font-size:11px;color:#ffd791}.k-stock-actions{display:flex;gap:8px;margin-top:12px}.k-stock-actions .btn{flex:1}
      .k-stock-admin-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.k-stock-stat{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}.k-stock-stat span{display:block;color:#8fa0bd;font-size:11px;font-weight:900;text-transform:uppercase}.k-stock-stat strong{display:block;color:#fff;font-size:23px;margin-top:5px}.k-stock-form{display:grid;grid-template-columns:1.3fr .65fr .65fr .65fr .55fr 1.2fr auto;gap:8px;align-items:end;margin-bottom:15px}.k-stock-form .field{margin:0}.k-stock-section-title{margin:18px 0 8px;color:#fff}.k-stock-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:900;background:rgba(255,255,255,.08)}.k-stock-status.pending_gb{color:#ffd791}.k-stock-status.gb_received{color:#73e6ff}.k-stock-status.completed{color:#66f2bf}.k-stock-status.cancelled{color:#ff839d}
      @media(max-width:1000px){.k-stock-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.k-stock-form{grid-template-columns:repeat(2,minmax(0,1fr))}.k-stock-form button{grid-column:1/-1}.k-stock-admin-summary{grid-template-columns:1fr 1fr}}
      @media(max-width:620px){.k-stock-grid,.k-stock-admin-summary,.k-stock-form{grid-template-columns:1fr}.k-stock-img{height:180px}}
    `;document.head.appendChild(s);
  }

  function stockCard(x){
    const img=x.imageUrl?`<img src="${safe(x.imageUrl)}" alt="${safe(x.itemName)}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=&quot;k-stock-placeholder&quot;>🗡️</div>'">`:'<div class="k-stock-placeholder">🗡️</div>';
    return `<article class="k-stock-card"><div class="k-stock-img">${img}</div><div class="k-stock-body"><span class="k-stock-badge">KOTAKAS STOĞU</span><h3>${safe(x.itemName)}</h3><div class="k-stock-meta">${safe(x.serverCode)} • Hazır stok: ${x.availableStock}</div><div class="k-stock-price">${gb(x.salePriceGb)}</div><div class="k-stock-meta">Ödeme site bakiyesiyle değil, oyun içinde GB teslimiyle yapılır.</div><div class="k-stock-actions"><button class="btn teal" onclick="buyKotakasStock(${x.id},'${safe(x.itemName).replace(/'/g,'&#39;')}',${Number(x.salePriceGb)})">GB ile Satın Al</button></div></div></article>`;
  }

  async function initBuy(){
    const grid=document.getElementById('buyListings');if(!grid)return;addStyle();
    const head=document.querySelector('.pagehead h1');if(head)head.textContent='KOTAKAS Item Pazarı';
    const desc=document.querySelector('.pagehead p');if(desc)desc.textContent='KOTAKAS stoğundaki itemleri ve pazarcı ilanlarını GB fiyatıyla incele.';
    const notice=document.querySelector('.notice');if(notice)notice.innerHTML='🛡️ <strong>KOTAKAS stok itemlerinde kullanıcı bakiyesi yok.</strong> Sipariş ver, GB’yi oyun içinde KOTAKAS yetkilisine teslim et; admin onayından sonra item teslim edilir.';
    let root=document.getElementById('kotakasStockPublic');if(!root){root=document.createElement('section');root.id='kotakasStockPublic';root.className='k-stock-shell';grid.before(root)}
    try{
      const d=await api('/api/kotakas-stock');const items=d.items||[];
      root.innerHTML=`<div class="k-stock-head"><div><span class="k-stock-badge">KOTAKAS DOĞRUDAN SATIŞ</span><h2>KOTAKAS Item Stoğu</h2><p>Bu itemler pazarcı ilanı değil, doğrudan KOTAKAS stoğundadır.</p></div></div><div class="k-stock-grid">${items.length?items.map(stockCard).join(''):'<div class="v5-card" style="grid-column:1/-1"><div class="empty">Şu an KOTAKAS stoğunda satışta item yok.</div></div>'}</div><div id="kotakasMyOrders" style="margin-top:14px"></div>`;
      if(typeof ME!=='undefined'&&ME)await renderMyOrders();
    }catch{root.innerHTML='<div class="v5-card"><div class="empty">KOTAKAS stoğu yüklenemedi.</div></div>'}
  }

  window.buyKotakasStock=async(id,name,price)=>{
    if(typeof ME==='undefined'||!ME){location.href='/login.html?returnUrl='+encodeURIComponent('/buy.html');return}
    if(!confirm(`${name} için ${gb(price)} sipariş oluşturulsun mu? GB oyun içinde KOTAKAS'a teslim edilecek.`))return;
    try{const d=await api(`/api/kotakas-stock/${id}/order`,{method:'POST',body:{quantity:1}});toast(`Sipariş açıldı: ${gb(d.totalGb)} GB teslimi bekleniyor.`);await initBuy()}
    catch(err){toast(err.data?.error==='insufficient_stock'?'Bu item için hazır stok kalmadı.':err.data?.error||'Sipariş oluşturulamadı.')}
  };

  async function renderMyOrders(){
    const box=document.getElementById('kotakasMyOrders');if(!box)return;
    try{const d=await api('/api/kotakas-stock/orders/mine');const rows=d.orders||[];box.innerHTML=rows.length?`<div class="v5-card"><div class="v5-card-head"><div><h3>KOTAKAS Siparişlerim</h3><p>GB teslimi ve item teslim durumunu buradan izle.</p></div></div><div class="tablewrap"><table class="table"><thead><tr><th>Item</th><th>Server</th><th>Tutar</th><th>Durum</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${safe(o.itemName)}</td><td>${safe(o.serverCode)}</td><td>${gb(o.totalGb)}</td><td><span class="k-stock-status ${safe(o.status)}">${statusText(o.status)}</span></td></tr>`).join('')}</tbody></table></div></div>`:''}catch{}
  }

  function ensureAdminPane(){
    if(!path.endsWith('/admin.html'))return null;addStyle();const sidebar=document.querySelector('.sidebar'),section=document.querySelector('.v5-layout>section');if(!sidebar||!section)return null;
    let nav=document.getElementById('adminKotakasStockNav');if(!nav){nav=document.createElement('a');nav.id='adminKotakasStockNav';nav.className='adminNav';nav.href='#';nav.dataset.pane='kotakas-stock';nav.textContent='🏦 KOTAKAS Stok';document.getElementById('adminPackageNav')?.after(nav)||sidebar.append(nav)}
    let pane=document.getElementById('pane-kotakas-stock');if(!pane){pane=document.createElement('div');pane.id='pane-kotakas-stock';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>KOTAKAS Item Stoğu & GB Kasası</h3><p>Kendi aldığımız itemleri GB ile satışa çıkar ve gelen GB stoğunu takip et.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="renderAdminKotakasStock()">Yenile</button></div><div id="adminKotakasStockBody"></div>`;section.append(pane)}
    if(!nav.dataset.stockBound){nav.dataset.stockBound='1';nav.addEventListener('click',e=>{e.preventDefault();document.querySelectorAll('.adminPane').forEach(x=>x.style.display='none');document.querySelectorAll('.adminNav').forEach(x=>x.classList.remove('active'));pane.style.display='block';nav.classList.add('active');renderAdminKotakasStock()})}
    return pane;
  }

  window.renderAdminKotakasStock=async()=>{
    ensureAdminPane();const box=document.getElementById('adminKotakasStockBody');if(!box)return;
    try{
      const d=await api('/api/admin/kotakas-stock'),items=d.items||[],orders=d.orders||[],stocks=d.gbStock||[];
      const totalItems=items.reduce((s,x)=>s+Number(x.stock||0),0),reserved=items.reduce((s,x)=>s+Number(x.reserved||0),0);
      const gbCards=stocks.length?stocks.map(x=>`<div class="k-stock-stat"><span>${safe(x.serverCode)} GB STOĞU</span><strong>${gb(x.balanceGb)}</strong></div>`).join(''):'<div class="k-stock-stat"><span>ZERO GB STOĞU</span><strong>0 GB</strong></div>';
      box.innerHTML=`<div class="k-stock-admin-summary"><div class="k-stock-stat"><span>Toplam Item</span><strong>${totalItems}</strong></div><div class="k-stock-stat"><span>Rezerve</span><strong>${reserved}</strong></div>${gbCards}</div>
        <form class="k-stock-form" onsubmit="adminAddKotakasStock(event)"><div class="field"><label>Item</label><input id="ksItem" placeholder="Iron Bow +8" required></div><div class="field"><label>Server</label><input id="ksServer" value="ZERO" required></div><div class="field"><label>Alış GB</label><input id="ksBuy" type="number" min="0" step="0.01" value="0"></div><div class="field"><label>Satış GB</label><input id="ksSale" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Stok</label><input id="ksStock" type="number" min="1" value="1" required></div><div class="field"><label>Item resim URL</label><input id="ksImage" placeholder="İsteğe bağlı"></div><button class="btn teal">＋ Stoğa Ekle</button></form>
        <h3 class="k-stock-section-title">📦 Item Stoğu</h3><div class="tablewrap"><table class="table"><thead><tr><th>Item</th><th>Alış</th><th>Satış</th><th>Kâr</th><th>Stok</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${items.length?items.map(x=>`<tr><td><strong>${safe(x.itemName)}</strong><small style="display:block">${safe(x.serverCode)}</small></td><td>${gb(x.buyPriceGb)}</td><td>${gb(x.salePriceGb)}</td><td>${gb(x.profitGb)}</td><td>${x.stock} <small>(${x.reserved} rezerve)</small></td><td>${safe(x.status)}</td><td><button class="btn sm ghost" onclick="adminEditKotakasStock(${x.id},${Number(x.salePriceGb)},${Number(x.stock)},'${safe(x.status)}')">Düzenle</button></td></tr>`).join(''):'<tr><td colspan="7">Henüz KOTAKAS stoğu yok.</td></tr>'}</tbody></table></div>
        <h3 class="k-stock-section-title">🤝 KOTAKAS Item Siparişleri</h3><div class="tablewrap"><table class="table"><thead><tr><th>Müşteri</th><th>Item</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr><td>${safe(o.buyerName||o.buyerEmail||'Kullanıcı')}<small style="display:block">${safe(o.buyerEmail||'')}</small></td><td>${safe(o.itemName)}<small style="display:block">${safe(o.serverCode)}</small></td><td>${gb(o.totalGb)}</td><td><span class="k-stock-status ${safe(o.status)}">${statusText(o.status)}</span></td><td>${o.status==='pending_gb'?`<button class="btn sm teal" onclick="adminKotakasGbReceived(${o.id},${Number(o.totalGb)})">✓ GB Teslim Alındı</button> <button class="btn sm ghost" onclick="adminKotakasOrderCancel(${o.id})">İptal</button>`:o.status==='gb_received'?`<button class="btn sm teal" onclick="adminKotakasComplete(${o.id})">✓ Item Teslim Edildi</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="5">Henüz KOTAKAS item siparişi yok.</td></tr>'}</tbody></table></div>`;
    }catch(err){box.innerHTML='<div class="empty">KOTAKAS stok bilgileri yüklenemedi.</div>'}
  };

  window.adminAddKotakasStock=async e=>{e.preventDefault();try{await api('/api/admin/kotakas-stock',{method:'POST',body:{itemName:document.getElementById('ksItem').value,serverCode:document.getElementById('ksServer').value,buyPriceGb:Number(document.getElementById('ksBuy').value||0),salePriceGb:Number(document.getElementById('ksSale').value||0),stock:Number(document.getElementById('ksStock').value||1),imageUrl:document.getElementById('ksImage').value||''}});toast('Item KOTAKAS stoğuna eklendi.');renderAdminKotakasStock()}catch(err){toast(err.data?.error||'Item stoğa eklenemedi.')}};
  window.adminEditKotakasStock=async(id,price,stock,status)=>{const p=prompt('Yeni satış fiyatı (GB):',price);if(p===null)return;const s=prompt('Yeni stok:',stock);if(s===null)return;const st=prompt('Durum: active / paused / sold_out',status);if(st===null)return;try{await api(`/api/admin/kotakas-stock/${id}`,{method:'PATCH',body:{salePriceGb:Number(String(p).replace(',','.')),stock:Number(s),status:st}});toast('Stok güncellendi.');renderAdminKotakasStock()}catch(err){toast(err.data?.error||'Stok güncellenemedi.')}};
  window.adminKotakasGbReceived=async(id,total)=>{if(!confirm(`${gb(total)} oyun içinde gerçekten teslim alındı mı? Onaylanınca KOTAKAS GB stoğuna eklenecek.`))return;try{await api(`/api/admin/kotakas-stock/orders/${id}/gb-received`,{method:'POST'});toast('GB alındı; GB stoğuna eklendi. Item teslimini yapabilirsin.');renderAdminKotakasStock()}catch(err){toast(err.data?.error||'GB teslimi onaylanamadı.')}};
  window.adminKotakasComplete=async id=>{if(!confirm('Item müşteriye oyun içinde teslim edildi mi?'))return;try{await api(`/api/admin/kotakas-stock/orders/${id}/complete`,{method:'POST'});toast('Item teslim edildi, işlem tamamlandı.');renderAdminKotakasStock()}catch(err){toast(err.data?.error||'İşlem tamamlanamadı.')}};
  window.adminKotakasOrderCancel=async id=>{if(!confirm('GB henüz alınmadı. Sipariş iptal edilip stok rezervi bırakılsın mı?'))return;try{await api(`/api/admin/kotakas-stock/orders/${id}/cancel`,{method:'POST'});toast('Sipariş iptal edildi, stok tekrar açıldı.');renderAdminKotakasStock()}catch(err){toast(err.data?.error||'Sipariş iptal edilemedi.')}};

  function init(){if(path.endsWith('/buy.html'))initBuy();if(path.endsWith('/admin.html'))ensureAdminPane()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,150));else setTimeout(init,150);
})();
