(()=>{
  const path=location.pathname.toLowerCase();
  const moneyGb=n=>Number(n||0).toLocaleString('tr-TR',{maximumFractionDigits:4})+' GB';
  const cleanMsg=s=>String(s||'').replace(/^\[(?:TEKLIF|KABUL|RED|TAMAMLANDI|HAZIR:[^\]]+)\]\s*/i,'');
  const statusText=s=>({open:'Admin teklifi bekleniyor',in_progress:'İşlem sürüyor',closed:'Tamamlandı'}[s]||s||'—');
  let userReady={};
  let adminReady={};

  function readyButtons(id,ready,admin=false){
    return Object.entries(ready||{}).map(([code,text])=>`<button class="btn sm ghost" type="button" onclick="${admin?'urgentAdminMessage':'urgentUserMessage'}(${Number(id)},'${esc(code)}')">${esc(text)}</button>`).join('');
  }

  function replyHtml(r){
    const admin=String(r.senderRole||'')==='admin';
    return `<div class="v5-mini" style="margin-top:8px;align-items:flex-start"><div class="micon">${admin?'⚙️':'👤'}</div><div><strong>${admin?'KOTAKAS':'Sen'}</strong><span>${esc(cleanMsg(r.message))}</span><div class="meta">${formatDate(r.createdAt)}</div></div></div>`;
  }

  async function createUrgentSale(e){
    e.preventDefault();
    if(!ME){location.href='/login.html?returnUrl='+encodeURIComponent('/urgent-sell.html');return}
    const body={
      itemName:$('#urgentItem')?.value||'',
      serverCode:$('#urgentServer')?.value||'ZERO',
      quantity:Number($('#urgentQty')?.value||1),
      askGb:Number(String($('#urgentAsk')?.value||'0').replace(',','.')),
      note:$('#urgentNote')?.value||''
    };
    try{
      await api('/api/urgent-sales',{method:'POST',body});
      toast('Acil satış talebin KOTAKAS adminlerine gönderildi.');
      e.target.reset();if($('#urgentServer'))$('#urgentServer').value='ZERO';if($('#urgentQty'))$('#urgentQty').value='1';
      await renderUrgentMine();
    }catch(err){
      const map={urgent_sale_already_open:'Zaten açık bir acil satış talebin var. Önce onu sonuçlandıralım.',invalid_urgent_sale:'Item, server ve istediğin GB fiyatını kontrol et.'};
      toast(map[err.data?.error]||err.data?.error||'Acil satış talebi gönderilemedi.');
    }
  }

  window.urgentUserDecision=async(id,action)=>{
    try{await api(`/api/urgent-sales/${id}/decision`,{method:'POST',body:{action}});toast(action==='accept'?'Teklif kabul edildi. Hazır işlem mesajları açıldı.':'Teklif reddedildi. Admin yeni fiyat verebilir.');await renderUrgentMine()}catch(err){toast(err.data?.error||'İşlem yapılamadı.')}
  };

  window.urgentUserMessage=async(id,code)=>{
    try{await api(`/api/urgent-sales/${id}/message`,{method:'POST',body:{code}});await renderUrgentMine()}catch(err){toast(err.data?.error||'Hazır mesaj gönderilemedi.')}
  };

  async function renderUrgentMine(){
    const box=$('#urgentMine');if(!box||!ME)return;
    try{
      const d=await api('/api/urgent-sales/mine');userReady=d.ready||{};const rows=d.sales||[];
      box.innerHTML=rows.length?rows.map(x=>{
        const hasOffer=Number(x.latestOfferGb||0)>0;
        const decision=hasOffer&&!x.accepted&&x.status!=='closed'?`<div class="actions" style="margin-top:10px"><button class="btn sm green" onclick="urgentUserDecision(${x.id},'accept')">✓ ${moneyGb(x.latestOfferGb)} Kabul Et</button><button class="btn sm red" onclick="urgentUserDecision(${x.id},'reject')">Reddet</button></div>`:'';
        const ready=x.accepted&&x.status==='in_progress'?`<div class="notice" style="margin-top:12px"><strong>Hazır işlem mesajları</strong><div class="actions" style="margin-top:8px">${readyButtons(x.id,userReady,false)}</div></div>`:'';
        return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">⚡ ${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${Number(x.quantity||1)} adet • Senin beklentin ${moneyGb(x.askGb)} • #${x.id}</div></div><div class="spacer"></div><span class="pill ${x.status==='closed'?'green':x.accepted?'purple':'gold'}">${esc(statusText(x.status))}</span></div>${x.note?`<div class="meta" style="margin-top:8px">Not: ${esc(x.note)}</div>`:''}${hasOffer?`<div class="v5-tip" style="margin-top:10px"><strong style="display:block;color:#e3fffd">KOTAKAS teklifimiz: ${moneyGb(x.latestOfferGb)}</strong>${x.accepted?'Teklif kabul edildi; teslim koordinasyonu hazır mesajlarla ilerler.':'Kabul edersen işlem koordinasyonu açılır.'}</div>`:'<div class="notice" style="margin-top:10px">Admin fiyat değerlendirmesi bekleniyor.</div>'}${decision}${ready}<div style="margin-top:12px">${(x.replies||[]).map(replyHtml).join('')}</div></div>`;
      }).join(''):'<div class="empty">Henüz acil item satış talebin yok.</div>';
    }catch{box.innerHTML='<div class="empty">Acil satışların yüklenemedi.</div>'}
  }

  function ensureAdminPane(){
    if(!path.endsWith('/admin.html')||!ME||!String(ME.role||'').startsWith('admin_'))return;
    const side=$('.sidebar'),host=$('#pane-users')?.parentElement;if(!side||!host)return;
    if(!side.querySelector('[data-pane="urgent-sales"]')){
      const a=document.createElement('a');a.href='#';a.className='adminNav';a.dataset.pane='urgent-sales';a.innerHTML='⚡ Acil Item Alım <span id="urgentAdminCount" class="notif-badge"></span>';
      a.addEventListener('click',e=>{e.preventDefault();$$('.adminNav').forEach(x=>x.classList.remove('active'));a.classList.add('active');$$('.adminPane').forEach(x=>x.style.display='none');$('#pane-urgent-sales').style.display='block';renderUrgentAdmin()});
      side.insertBefore(a,side.children[3]||null);
    }
    if(!$('#pane-urgent-sales')){
      const pane=document.createElement('div');pane.id='pane-urgent-sales';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>⚡ Acil Item Alım Masası</h3><p>Kullanıcı sıkıştığında itemi direkt KOTAKAS'a teklif eder. Fiyatı admin verir; serbest sohbet yoktur.</p></div><div class="spacer"></div><button class="btn sm ghost" type="button" onclick="renderUrgentAdmin()">↻ Yenile</button></div><div id="urgentAdminRows" class="list"><div class="empty">Yükleniyor...</div></div>`;host.append(pane)
    }
  }

  function adminSaleHtml(row){
    const x=row.sale||{},canPrice=ME&&(ME.role==='admin_owner'||ME.role==='admin_full'),hasOffer=Number(x.latestOfferGb||0)>0;
    const offerForm=x.status!=='closed'&&canPrice?`<div class="actions" style="margin-top:10px"><input id="urgentOffer_${x.id}" inputmode="decimal" placeholder="Teklif GB" value="${hasOffer?Number(x.latestOfferGb):''}" style="max-width:150px"><button class="btn sm teal" type="button" onclick="urgentAdminOffer(${x.id})">💰 Fiyat Ver</button></div>`:'';
    const ready=x.accepted&&x.status==='in_progress'?`<div class="notice" style="margin-top:12px"><strong>Teslim koordinasyonu</strong><div class="actions" style="margin-top:8px">${readyButtons(x.id,adminReady,true)}</div></div>`:'';
    const complete=x.accepted&&x.status!=='closed'&&canPrice?`<button class="btn sm green" onclick="urgentAdminComplete(${x.id})">✓ Alım Tamamlandı</button>`:'';
    return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">⚡ ${esc(x.itemName)} <span class="pill purple">${esc(x.serverCode)}</span></div><div class="meta">${esc(row.userName||'Kullanıcı')} • ${esc(row.userEmail||'')} • ${Number(x.quantity||1)} adet • Beklenti ${moneyGb(x.askGb)} • #${x.id}</div></div><div class="spacer"></div><span class="pill ${x.status==='closed'?'green':x.accepted?'purple':'gold'}">${esc(statusText(x.status))}</span></div>${x.note?`<div class="meta" style="margin-top:8px">Kullanıcı notu: ${esc(x.note)}</div>`:''}${hasOffer?`<div class="v5-tip" style="margin-top:10px"><strong style="display:block;color:#e3fffd">Son teklif: ${moneyGb(x.latestOfferGb)}</strong>${x.accepted?'Kullanıcı kabul etti. Teslim koordinasyonuna geçebilirsiniz.':'Kullanıcı kararı bekleniyor.'}</div>`:''}${offerForm}${ready}<div class="actions" style="margin-top:10px">${complete}</div><div style="margin-top:12px">${(x.replies||[]).map(replyHtml).join('')}</div></div>`;
  }

  window.renderUrgentAdmin=async()=>{
    ensureAdminPane();const box=$('#urgentAdminRows');if(!box)return;
    try{const d=await api('/api/admin/urgent-sales/');adminReady=d.ready||{};const rows=d.sales||[];const active=rows.filter(r=>r.sale?.status!=='closed').length;if($('#urgentAdminCount'))$('#urgentAdminCount').textContent=active?String(active):'';box.innerHTML=rows.length?rows.map(adminSaleHtml).join(''):'<div class="empty">Acil item satış talebi yok.</div>'}catch{box.innerHTML='<div class="empty">Acil alım kuyruğu yüklenemedi.</div>'}
  };

  window.urgentAdminOffer=async id=>{
    const price=Number(String($(`#urgentOffer_${id}`)?.value||'0').replace(',','.'));if(!price||price<=0)return toast('Geçerli bir GB fiyatı gir.');
    try{await api(`/api/admin/urgent-sales/${id}/offer`,{method:'POST',body:{priceGb:price}});toast('KOTAKAS teklifi kullanıcıya gönderildi.');await renderUrgentAdmin()}catch(err){toast(err.data?.error||'Teklif gönderilemedi.')}
  };
  window.urgentAdminMessage=async(id,code)=>{try{await api(`/api/admin/urgent-sales/${id}/message`,{method:'POST',body:{code}});await renderUrgentAdmin()}catch(err){toast(err.data?.error||'Hazır mesaj gönderilemedi.')}};
  window.urgentAdminComplete=async id=>{if(!confirm('Bu acil item alımı tamamlandı mı?'))return;try{await api(`/api/admin/urgent-sales/${id}/complete`,{method:'POST'});toast('Acil item alımı tamamlandı.');await renderUrgentAdmin()}catch(err){toast(err.data?.error||'İşlem kapatılamadı.')}};

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}
    if(path.endsWith('/urgent-sell.html')){
      if(!ME){location.href='/login.html?returnUrl='+encodeURIComponent('/urgent-sell.html');return}
      $('#urgentSaleForm')?.addEventListener('submit',createUrgentSale);await renderUrgentMine();
      setInterval(()=>{if(document.visibilityState==='visible')renderUrgentMine()},12000);
    }
    if(path.endsWith('/admin.html')){
      ensureAdminPane();setTimeout(ensureAdminPane,700);setTimeout(()=>{if($('#pane-urgent-sales')?.style.display!=='none')renderUrgentAdmin()},1200);
      setInterval(()=>{if(document.visibilityState==='visible'&&$('#pane-urgent-sales')?.style.display!=='none')renderUrgentAdmin()},12000);
    }
  }
  boot();
})();
