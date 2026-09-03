(()=>{
  const path=location.pathname.toLowerCase();
  const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gb=n=>`${Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:2})} GB`;
  const tl=n=>`${Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} ₺`;
  const statusText=s=>({pending_payment:'ÖDEME BEKLİYOR',payment_received:'ÖDEME ALINDI',completed:'TAMAMLANDI',cancelled:'İPTAL'})[s]||String(s||'').toUpperCase();

  function addStyle(){
    if(document.getElementById('kGbSimpleStyle'))return;
    const s=document.createElement('style');s.id='kGbSimpleStyle';s.textContent=`
      .kgbs-wrap{max-width:930px;margin:0 auto}.kgbs-title{margin-bottom:14px}.kgbs-title h2{margin:0 0 4px;color:#fff}.kgbs-title p{margin:0;color:#8fa0bd}
      .kgbs-card{border:1px solid rgba(255,255,255,.1);background:#111827;border-radius:15px;padding:18px;margin-bottom:14px}
      .kgbs-main{display:grid;grid-template-columns:1.1fr .8fr .9fr 1fr auto;gap:12px;align-items:end}
      .kgbs-label{font-size:10px;font-weight:900;color:#8291aa;text-transform:uppercase;margin-bottom:5px}.kgbs-value{font-size:20px;font-weight:950;color:#fff}.kgbs-price{color:#25dfcc}
      .kgbs-input{width:100%;box-sizing:border-box;height:42px}.kgbs-total{font-size:20px;font-weight:950;color:#fff;min-height:42px;display:flex;align-items:center}
      .kgbs-buy{height:42px;white-space:nowrap}.kgbs-note{margin-top:12px;padding-top:11px;border-top:1px solid rgba(255,255,255,.07);font-size:12px;color:#8fa0bd}
      .kgbs-orders{margin-top:16px}.kgbs-status{display:inline-flex;padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.07);font-size:10px;font-weight:900}.kgbs-status.pending_payment{color:#ffd77a}.kgbs-status.payment_received{color:#79dcff}.kgbs-status.completed{color:#67e6b8}.kgbs-status.cancelled{color:#ff8da4}
      .kgbs-admin-row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.025);margin-bottom:10px}.kgbs-admin-row strong{font-size:18px;color:#fff}.kgbs-admin-row small{display:block;color:#8493aa;margin-top:2px}.kgbs-open{color:#61e5b5!important}.kgbs-closed{color:#ff91a8!important}
      @media(max-width:820px){.kgbs-main{grid-template-columns:1fr 1fr}.kgbs-buy{grid-column:1/-1;width:100%}.kgbs-admin-row{grid-template-columns:1fr 1fr}.kgbs-admin-row .kgbs-toggle{grid-column:1/-1;width:100%}}
      @media(max-width:520px){.kgbs-main,.kgbs-admin-row{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function installLinks(){
    const center=document.querySelector('.k-shell-center');
    if(center&&!center.querySelector('[data-k-gb-link]')){const a=document.createElement('a');a.href='/gb.html';a.dataset.kGbLink='1';a.title='GB Al';a.innerHTML='💰 <span>GB Al</span>';center.prepend(a)}
    document.querySelectorAll('#kShellDrawer .k-drawer-group').forEach((g,i)=>{if(i===0&&!g.querySelector('[data-k-gb-link]')){const a=document.createElement('a');a.href='/gb.html';a.dataset.kGbLink='1';a.textContent='💰 GB Al';g.prepend(a)}});
    const gold=document.querySelector('.kp-promo-side.gold a');if(gold){gold.href='/gb.html';gold.textContent='GB Al'}
  }

  window.kGbSimpleCalc=(id,price)=>{const input=document.getElementById(id),out=document.getElementById(id+'_total');if(!input||!out)return;out.textContent=tl(Number(String(input.value||0).replace(',','.'))*Number(price||0))};

  window.kGbSimpleOrder=async(server,id,max)=>{
    if(typeof ME==='undefined'||!ME){location.href='/login.html?returnUrl='+encodeURIComponent('/gb.html');return}
    const input=document.getElementById(id);const qty=Number(String(input?.value||0).replace(',','.'));
    if(!qty||qty<.1||qty>Number(max)){toast(`En fazla ${gb(max)} sipariş verebilirsin.`);return}
    try{const d=await api('/api/kotakas-gb-sales/orders',{method:'POST',body:{serverCode:server,quantityGb:qty}});toast(`${gb(qty)} sipariş oluşturuldu. Toplam ${tl(d.totalTry)}.`);await renderGbPage()}catch(err){toast(err.data?.error==='insufficient_gb_stock'?'Yeterli GB stoğu yok.':err.data?.error==='gb_sale_closed'?'GB satışı şu an kapalı.':err.data?.error||'Sipariş oluşturulamadı.')}
  };

  window.kGbCancelMine=async id=>{try{await api(`/api/kotakas-gb-sales/orders/${id}/cancel`,{method:'POST'});toast('Sipariş iptal edildi.');await renderGbPage()}catch(err){toast(err.data?.error||'İptal edilemedi.')}};

  function offerRow(o){
    const max=Math.max(0,Number(o.availableGb||0)),price=Number(o.salePriceTry||0),id=`kgbs_${String(o.serverCode).replace(/[^a-z0-9_-]/gi,'')}`;
    const start=Math.min(1,max);
    return `<div class="kgbs-card"><div class="kgbs-main"><div><div class="kgbs-label">Server</div><div class="kgbs-value">${safe(o.serverCode)}</div></div><div><div class="kgbs-label">Hazır Stok</div><div class="kgbs-value">${gb(max)}</div></div><div><div class="kgbs-label">1 GB Fiyatı</div><div class="kgbs-value kgbs-price">${tl(price)}</div></div><div><div class="kgbs-label">Kaç GB?</div><input class="kgbs-input" id="${id}" type="number" min="0.1" max="${max}" step="0.1" value="${start}" oninput="kGbSimpleCalc('${id}',${price})"><div class="kgbs-label" style="margin-top:7px">Toplam</div><div class="kgbs-total" id="${id}_total">${tl(start*price)}</div></div><button class="btn teal kgbs-buy" onclick="kGbSimpleOrder('${safe(o.serverCode)}','${id}',${max})">Satın Al</button></div><div class="kgbs-note">Fiyat Kopazar'dan otomatik alınır. Ödeme onayından sonra GB oyun içinde teslim edilir.</div></div>`;
  }

  async function renderMine(){
    if(typeof ME==='undefined'||!ME)return '';
    try{const d=await api('/api/kotakas-gb-sales/orders/mine'),rows=(d.orders||[]).slice(0,10);if(!rows.length)return '';
      return `<div class="v5-card kgbs-orders"><div class="v5-card-head"><div><h3>Siparişlerim</h3></div></div><div class="tablewrap"><table class="table"><thead><tr><th>Server</th><th>GB</th><th>Toplam</th><th>Durum</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td>${safe(o.serverCode)}</td><td>${gb(o.quantityGb)}</td><td>${tl(o.totalTry)}</td><td><span class="kgbs-status ${safe(o.status)}">${statusText(o.status)}</span></td><td>${o.status==='pending_payment'?`<button class="btn sm ghost" onclick="kGbCancelMine(${o.id})">İptal</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`
    }catch{return ''}
  }

  async function renderGbPage(){
    if(!path.endsWith('/gb.html'))return;addStyle();const root=document.getElementById('kotakasGbSaleRoot');if(!root)return;
    try{const d=await api('/api/kotakas-gb-sales'),offers=d.offers||[],mine=await renderMine();root.innerHTML=`<div class="kgbs-wrap"><div class="kgbs-title"><h2>GB Al</h2><p>Server seç, miktarı yaz, toplamı gör.</p></div>${offers.length?offers.map(offerRow).join(''):'<div class="v5-card"><div class="empty">Şu an satışa açık GB yok.</div></div>'}${mine}</div>`}catch{root.innerHTML='<div class="v5-card"><div class="empty">GB bilgileri yüklenemedi.</div></div>'}
  }
  window.renderGbPage=renderGbPage;

  function ensureAdminPane(){
    if(!path.endsWith('/admin.html'))return null;addStyle();const sidebar=document.querySelector('.sidebar'),section=document.querySelector('.v5-layout>section');if(!sidebar||!section)return null;
    let nav=document.getElementById('adminKotakasGbSaleNav');if(!nav){nav=document.createElement('a');nav.id='adminKotakasGbSaleNav';nav.className='adminNav';nav.href='#';nav.dataset.pane='kotakas-gb-sales';nav.textContent='💰 GB Satışları';document.getElementById('adminKotakasStockNav')?.after(nav)||sidebar.append(nav)}
    let pane=document.getElementById('pane-kotakas-gb-sales');if(!pane){pane=document.createElement('div');pane.id='pane-kotakas-gb-sales';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>GB Satışları</h3><p>Stok ve Kopazar fiyatı tek ekranda.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="renderAdminGbSales()">Yenile</button></div><div id="adminKotakasGbSalesBody"></div>`;section.append(pane)}
    if(!nav.dataset.bound){nav.dataset.bound='1';nav.addEventListener('click',e=>{e.preventDefault();document.querySelectorAll('.adminPane').forEach(x=>x.style.display='none');document.querySelectorAll('.adminNav').forEach(x=>x.classList.remove('active'));pane.style.display='block';nav.classList.add('active');renderAdminGbSales()})}
    return pane;
  }

  window.adminToggleGbSale=async(server,price,active)=>{try{await api(`/api/admin/kotakas-gb-sales/${encodeURIComponent(server)}`,{method:'PATCH',body:{salePriceTry:Number(price||0),isActive:!!active}});toast(active?'GB satışı açıldı.':'GB satışı kapatıldı.');await renderAdminGbSales()}catch(err){toast(err.data?.error||'GB satış durumu değiştirilemedi.')}};
  window.adminGbPayment=async id=>{try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/payment-received`,{method:'POST'});toast('Ödeme alındı.');await renderAdminGbSales()}catch(err){toast(err.data?.error||'İşlem yapılamadı.')}};
  window.adminGbComplete=async id=>{try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/complete`,{method:'POST'});toast('GB teslim edildi, stok düşüldü.');await renderAdminGbSales()}catch(err){toast(err.data?.error||'Teslim tamamlanamadı.')}};
  window.adminGbCancel=async id=>{try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/cancel`,{method:'POST'});toast('Sipariş iptal edildi.');await renderAdminGbSales()}catch(err){toast(err.data?.error||'İptal edilemedi.')}};

  window.renderAdminGbSales=async()=>{
    ensureAdminPane();const box=document.getElementById('adminKotakasGbSalesBody');if(!box)return;
    try{const d=await api('/api/admin/kotakas-gb-sales'),offers=d.offers||[],orders=d.orders||[];
      const stock=offers.length?offers.map(o=>`<div class="kgbs-admin-row"><div><small>Server</small><strong>${safe(o.serverCode)}</strong></div><div><small>Stok</small><strong>${gb(o.balanceGb)}</strong></div><div><small>Rezerve</small><strong>${gb(o.reservedGb)}</strong></div><div><small>Kopazar / 1 GB</small><strong class="kgbs-price">${tl(o.salePriceTry)}</strong><small class="${o.isActive?'kgbs-open':'kgbs-closed'}">${o.isActive?'SATIŞ AÇIK':'SATIŞ KAPALI'}</small></div><button class="btn ${o.isActive?'ghost':'teal'} kgbs-toggle" onclick="adminToggleGbSale('${safe(o.serverCode)}',${Number(o.salePriceTry||0)},${!o.isActive})">${o.isActive?'Satışı Kapat':'Satışı Aç'}</button></div>`).join(''):'<div class="empty">Henüz GB stoğu yok.</div>';
      const orderRows=orders.length?orders.map(o=>`<tr><td>${safe(o.buyerName||o.buyerEmail||'Kullanıcı')}</td><td>${safe(o.serverCode)}</td><td>${gb(o.quantityGb)}</td><td>${tl(o.totalTry)}</td><td><span class="kgbs-status ${safe(o.status)}">${statusText(o.status)}</span></td><td>${o.status==='pending_payment'?`<button class="btn sm teal" onclick="adminGbPayment(${o.id})">Ödeme Alındı</button> <button class="btn sm ghost" onclick="adminGbCancel(${o.id})">İptal</button>`:o.status==='payment_received'?`<button class="btn sm teal" onclick="adminGbComplete(${o.id})">GB Teslim Edildi</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6">Henüz GB siparişi yok.</td></tr>';
      box.innerHTML=`<div style="margin:12px 0 18px">${stock}</div><h3 style="margin:0 0 10px">Gelen Siparişler</h3><div class="tablewrap"><table class="table"><thead><tr><th>Müşteri</th><th>Server</th><th>GB</th><th>Toplam</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${orderRows}</tbody></table></div>`;
    }catch(err){box.innerHTML='<div class="empty">GB paneli yüklenemedi.</div>'}
  };

  function init(){addStyle();installLinks();ensureAdminPane();renderGbPage()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
  setTimeout(installLinks,800);
})();