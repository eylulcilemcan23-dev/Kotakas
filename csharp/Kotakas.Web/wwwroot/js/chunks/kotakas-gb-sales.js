(()=>{
  const path=location.pathname.toLowerCase();
  const safe=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const gb=n=>`${Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:0,maximumFractionDigits:2})} GB`;
  const tl=n=>`${Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})} ₺`;
  const statusText=s=>({pending_payment:'ÖDEME BEKLİYOR',payment_received:'ÖDEME ALINDI / GB TESLİM BEKLİYOR',completed:'TAMAMLANDI',cancelled:'İPTAL'})[s]||String(s||'').toUpperCase();

  function addStyle(){
    if(document.getElementById('kGbSaleStyle'))return;
    const s=document.createElement('style');s.id='kGbSaleStyle';s.textContent=`
      .k-gb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.k-gb-card{border:1px solid rgba(255,255,255,.10);border-radius:17px;background:linear-gradient(145deg,#151d2f,#0d1220);padding:18px;box-shadow:0 15px 35px rgba(0,0,0,.18)}.k-gb-card h2,.k-gb-card h3{margin:0;color:#fff}.k-gb-server{display:flex;align-items:center;justify-content:space-between;gap:10px}.k-gb-server .coin{width:45px;height:45px;border-radius:14px;display:grid;place-items:center;background:rgba(255,200,70,.12);border:1px solid rgba(255,200,70,.22);font-size:23px}.k-gb-meta{color:#8fa0bd;font-size:12px;margin-top:5px}.k-gb-price{font-size:27px;font-weight:950;color:#29e1cf;margin:16px 0 4px}.k-gb-available{font-size:13px;color:#ffd781;font-weight:800}.k-gb-orderbox{margin-top:15px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}.k-gb-orderbox label{display:block;color:#aeb9cd;font-size:11px;font-weight:850;margin-bottom:5px}.k-gb-orderbox input{width:100%;box-sizing:border-box}.k-gb-presets{display:flex;gap:6px;margin:7px 0}.k-gb-presets button{flex:1}.k-gb-total{display:flex;justify-content:space-between;align-items:center;margin:10px 0;color:#aeb9cd}.k-gb-total strong{color:#fff;font-size:20px}.k-gb-card .btn.full{width:100%}.k-gb-orders{margin-top:18px}.k-gb-status{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:10px;font-weight:950;background:rgba(255,255,255,.08)}.k-gb-status.pending_payment{color:#ffd781}.k-gb-status.payment_received{color:#73e6ff}.k-gb-status.completed{color:#65efba}.k-gb-status.cancelled{color:#ff819b}.k-gb-admin-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:16px}.k-gb-admin-card{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.025)}.k-gb-admin-card .big{font-size:23px;font-weight:950;color:#fff}.k-gb-admin-card small{color:#8fa0bd}.k-gb-admin-controls{display:grid;grid-template-columns:1fr .8fr auto;gap:8px;align-items:end;margin-top:10px}.k-gb-admin-controls .field{margin:0}.k-gb-on{color:#67efc1}.k-gb-off{color:#ff9aad}
      @media(max-width:900px){.k-gb-grid,.k-gb-admin-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.k-gb-grid,.k-gb-admin-grid,.k-gb-admin-controls{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function installLinks(){
    const center=document.querySelector('.k-shell-center');
    if(center&&!center.querySelector('[data-k-gb-link]')){
      const a=document.createElement('a');a.href='/gb.html';a.dataset.kGbLink='1';a.title='GB Al';a.innerHTML='💰 <span>GB Al</span>';center.prepend(a);
    }
    document.querySelectorAll('#kShellDrawer .k-drawer-group').forEach((g,i)=>{
      if(i===0&&!g.querySelector('[data-k-gb-link]')){
        const a=document.createElement('a');a.href='/gb.html';a.dataset.kGbLink='1';a.textContent='💰 GB Al';g.prepend(a);
      }
    });
    const legacy=document.getElementById('mobileNav');if(legacy&&!legacy.querySelector('[data-k-gb-link]')){const a=document.createElement('a');a.href='/gb.html';a.dataset.kGbLink='1';a.textContent='GB Al';legacy.prepend(a)}
    const gold=document.querySelector('.kp-promo-side.gold a');if(gold){gold.href='/gb.html';gold.textContent='GB Satın Al'}
  }

  function offerCard(o){
    const max=Math.max(0,Number(o.availableGb||0));
    const id=`kGbQty_${safe(o.serverCode).replace(/[^a-z0-9_-]/gi,'')}`;
    return `<article class="k-gb-card"><div class="k-gb-server"><div><h2>${safe(o.serverCode)}</h2><div class="k-gb-meta">KOTAKAS hazır GB stoğu</div></div><div class="coin">💰</div></div><div class="k-gb-price">${tl(o.salePriceTry)} <small style="font-size:12px;color:#8fa0bd">/ 1 GB</small></div><div class="k-gb-available">Hazır: ${gb(max)}</div><div class="k-gb-orderbox"><label>Kaç GB almak istiyorsun?</label><input id="${id}" type="number" min="0.1" max="${max}" step="0.1" value="${Math.min(1,max)}" oninput="kGbRecalc('${id}',${Number(o.salePriceTry)})"><div class="k-gb-presets"><button type="button" class="btn sm ghost" onclick="kGbPreset('${id}',1,${Number(o.salePriceTry)},${max})">1 GB</button><button type="button" class="btn sm ghost" onclick="kGbPreset('${id}',5,${Number(o.salePriceTry)},${max})">5 GB</button><button type="button" class="btn sm ghost" onclick="kGbPreset('${id}',${max},${Number(o.salePriceTry)},${max})">Tümü</button></div><div class="k-gb-total"><span>Toplam</span><strong id="${id}_total">${tl(Math.min(1,max)*Number(o.salePriceTry))}</strong></div><button class="btn teal full" onclick="kGbOrder('${safe(o.serverCode)}','${id}',${max})">Sipariş Oluştur</button></div></article>`;
  }

  window.kGbRecalc=(id,price)=>{const i=document.getElementById(id),t=document.getElementById(id+'_total');if(i&&t)t.textContent=tl(Number(i.value||0)*Number(price||0))};
  window.kGbPreset=(id,value,price,max)=>{const i=document.getElementById(id);if(!i)return;i.value=Math.min(Number(value||0),Number(max||0));window.kGbRecalc(id,price)};

  window.kGbOrder=async(server,id,max)=>{
    if(typeof ME==='undefined'||!ME){location.href='/login.html?returnUrl='+encodeURIComponent('/gb.html');return}
    const input=document.getElementById(id);const qty=Number(String(input?.value||0).replace(',','.'));
    if(!qty||qty<.1||qty>Number(max)){toast('Geçerli bir GB miktarı gir.');return}
    if(!confirm(`${server} sunucusunda ${gb(qty)} için sipariş oluşturulsun mu?`))return;
    try{const d=await api('/api/kotakas-gb-sales/orders',{method:'POST',body:{serverCode:server,quantityGb:qty}});toast(`GB siparişi açıldı: ${tl(d.totalTry)} ödeme bekleniyor.`);await renderGbPage()}
    catch(err){const e=err.data?.error;toast(e==='insufficient_gb_stock'?'Yeterli hazır GB stoğu kalmadı.':e==='gb_sale_closed'?'Bu sunucuda GB satışı şu an kapalı.':e||'GB siparişi oluşturulamadı.')}
  };

  window.kGbCancelMine=async id=>{if(!confirm('Ödeme yapılmadıysa siparişi iptal edip GB rezervini bırakmak istiyor musun?'))return;try{await api(`/api/kotakas-gb-sales/orders/${id}/cancel`,{method:'POST'});toast('GB siparişi iptal edildi.');await renderGbPage()}catch(err){toast(err.data?.error||'Sipariş iptal edilemedi.')}};

  async function renderMine(){
    if(typeof ME==='undefined'||!ME)return '';
    try{const d=await api('/api/kotakas-gb-sales/orders/mine'),rows=d.orders||[];if(!rows.length)return '';
      return `<div class="v5-card k-gb-orders"><div class="v5-card-head"><div><h3>💰 GB Siparişlerim</h3><p>Ödeme ve oyun içi GB teslim durumunu buradan takip et.</p></div></div><div class="tablewrap"><table class="table"><thead><tr><th>Server</th><th>Miktar</th><th>Toplam</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${safe(o.serverCode)}</td><td>${gb(o.quantityGb)}</td><td>${tl(o.totalTry)}</td><td><span class="k-gb-status ${safe(o.status)}">${statusText(o.status)}</span></td><td>${o.status==='pending_payment'?`<button class="btn sm ghost" onclick="kGbCancelMine(${o.id})">İptal</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>`
    }catch{return ''}
  }

  async function renderGbPage(){
    if(!path.endsWith('/gb.html'))return;addStyle();const root=document.getElementById('kotakasGbSaleRoot');if(!root)return;
    try{const d=await api('/api/kotakas-gb-sales'),offers=d.offers||[];const mine=await renderMine();root.innerHTML=`<div class="k-stock-head"><div><span class="k-stock-badge">KOTAKAS GB MARKET</span><h2>Hazır GB Stokları</h2><p>Stoktan miktar seç, siparişi oluştur, ödeme onayından sonra oyun içinde teslim al.</p></div></div><div class="k-gb-grid">${offers.length?offers.map(offerCard).join(''):'<div class="v5-card" style="grid-column:1/-1"><div class="empty">Şu an satışa açık GB stoğu yok. Admin satış fiyatını açtığında burada görünecek.</div></div>'}</div>${mine}`}
    catch{root.innerHTML='<div class="v5-card"><div class="empty">GB satış bilgileri yüklenemedi.</div></div>'}
  }
  window.renderGbPage=renderGbPage;

  function ensureAdminPane(){
    if(!path.endsWith('/admin.html'))return null;addStyle();const sidebar=document.querySelector('.sidebar'),section=document.querySelector('.v5-layout>section');if(!sidebar||!section)return null;
    let nav=document.getElementById('adminKotakasGbSaleNav');if(!nav){nav=document.createElement('a');nav.id='adminKotakasGbSaleNav';nav.className='adminNav';nav.href='#';nav.dataset.pane='kotakas-gb-sales';nav.textContent='💰 GB Satışları';document.getElementById('adminKotakasStockNav')?.after(nav)||sidebar.append(nav)}
    let pane=document.getElementById('pane-kotakas-gb-sales');if(!pane){pane=document.createElement('div');pane.id='pane-kotakas-gb-sales';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>KOTAKAS GB Satışları</h3><p>GB satış fiyatını belirle, rezervleri ve müşteri siparişlerini yönet.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="renderAdminGbSales()">Yenile</button></div><div id="adminKotakasGbSalesBody"></div>`;section.append(pane)}
    if(!nav.dataset.bound){nav.dataset.bound='1';nav.addEventListener('click',e=>{e.preventDefault();document.querySelectorAll('.adminPane').forEach(x=>x.style.display='none');document.querySelectorAll('.adminNav').forEach(x=>x.classList.remove('active'));pane.style.display='block';nav.classList.add('active');renderAdminGbSales()})}
    return pane;
  }

  window.renderAdminGbSales=async()=>{
    ensureAdminPane();const box=document.getElementById('adminKotakasGbSalesBody');if(!box)return;
    try{const d=await api('/api/admin/kotakas-gb-sales'),offers=d.offers||[],orders=d.orders||[];
      box.innerHTML=`<h3 class="k-stock-section-title">💰 GB Stok & Satış Ayarı</h3><div class="k-gb-admin-grid">${offers.length?offers.map(o=>`<div class="k-gb-admin-card"><div class="k-gb-server"><div><strong>${safe(o.serverCode)}</strong><small style="display:block">${o.isActive?'<span class="k-gb-on">SATIŞ AÇIK</span>':'<span class="k-gb-off">SATIŞ KAPALI</span>'}</small></div><div class="coin">💰</div></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px"><div><small>Fiziksel</small><div class="big">${gb(o.balanceGb)}</div></div><div><small>Rezerve</small><div class="big">${gb(o.reservedGb)}</div></div><div><small>Hazır</small><div class="big">${gb(o.availableGb)}</div></div></div><div class="k-gb-admin-controls"><div class="field"><label>1 GB Satış Fiyatı (TL)</label><input id="kGbPrice_${safe(o.serverCode)}" type="number" min="0" step="0.01" value="${Number(o.salePriceTry||0)}"></div><div class="field"><label>Satış</label><select id="kGbActive_${safe(o.serverCode)}"><option value="1" ${o.isActive?'selected':''}>Açık</option><option value="0" ${!o.isActive?'selected':''}>Kapalı</option></select></div><button class="btn teal" onclick="adminSaveGbSale('${safe(o.serverCode)}')">Kaydet</button></div></div>`).join(''):'<div class="v5-card"><div class="empty">GB kasasında henüz stok yok. Item satışı sonrası gelen GB burada oluşur.</div></div>'}</div>
        <h3 class="k-stock-section-title">🤝 GB Siparişleri</h3><div class="tablewrap"><table class="table"><thead><tr><th>Müşteri</th><th>Server</th><th>Miktar</th><th>Tutar</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr><td>${safe(o.buyerName||o.buyerEmail||'Kullanıcı')}<small style="display:block">${safe(o.buyerEmail||'')}</small></td><td>${safe(o.serverCode)}</td><td>${gb(o.quantityGb)}</td><td>${tl(o.totalTry)}</td><td><span class="k-gb-status ${safe(o.status)}">${statusText(o.status)}</span></td><td>${o.status==='pending_payment'?`<button class="btn sm teal" onclick="adminGbPaymentReceived(${o.id},${Number(o.totalTry)})">✓ Ödeme Alındı</button> <button class="btn sm ghost" onclick="adminGbSaleCancel(${o.id})">İptal</button>`:o.status==='payment_received'?`<button class="btn sm teal" onclick="adminGbDelivered(${o.id},${Number(o.quantityGb)})">✓ GB Teslim Edildi</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="6">Henüz GB siparişi yok.</td></tr>'}</tbody></table></div>`;
    }catch{box.innerHTML='<div class="empty">GB satış paneli yüklenemedi.</div>'}
  };

  window.adminSaveGbSale=async server=>{const price=Number(document.getElementById('kGbPrice_'+server)?.value||0),active=document.getElementById('kGbActive_'+server)?.value==='1';try{await api('/api/admin/kotakas-gb-sales/'+encodeURIComponent(server),{method:'PATCH',body:{salePriceTry:price,isActive:active}});toast(`${server} GB satış ayarı kaydedildi.`);renderAdminGbSales()}catch(err){toast(err.data?.error||'GB satış ayarı kaydedilemedi.')}};
  window.adminGbPaymentReceived=async(id,total)=>{if(!confirm(`${tl(total)} ödeme gerçekten alındı mı?`))return;try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/payment-received`,{method:'POST'});toast('Ödeme onaylandı. GB oyun içinde teslim edilebilir.');renderAdminGbSales()}catch(err){toast(err.data?.error||'Ödeme onaylanamadı.')}};
  window.adminGbDelivered=async(id,qty)=>{if(!confirm(`${gb(qty)} müşteriye oyun içinde gerçekten teslim edildi mi? Onaylanınca GB kasasından düşecek.`))return;try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/complete`,{method:'POST'});toast('GB teslim edildi; stoktan düşüldü ve sipariş tamamlandı.');renderAdminGbSales()}catch(err){toast(err.data?.error||'GB teslimi tamamlanamadı.')}};
  window.adminGbSaleCancel=async id=>{if(!confirm('Ödeme alınmadı. Sipariş iptal edilip GB rezervi serbest bırakılsın mı?'))return;try{await api(`/api/admin/kotakas-gb-sales/orders/${id}/cancel`,{method:'POST'});toast('GB siparişi iptal edildi.');renderAdminGbSales()}catch(err){toast(err.data?.error||'Sipariş iptal edilemedi.')}};

  function init(){addStyle();installLinks();if(path.endsWith('/gb.html'))renderGbPage();if(path.endsWith('/admin.html'))ensureAdminPane()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,250));else setTimeout(init,250);
  let tries=0;const linkTimer=setInterval(()=>{installLinks();if(++tries>30)clearInterval(linkTimer)},300);
  const observer=new MutationObserver(()=>requestAnimationFrame(installLinks));observer.observe(document.documentElement,{childList:true,subtree:true});
})();
