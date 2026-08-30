(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/admin.html'))return;
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';

  async function render(){
    if(!ME||(ME.role!=='admin_owner'&&ME.role!=='admin_full'))return;
    const pane=$('#pane-finance');if(!pane)return;
    try{
      const r=await api('/api/admin/market-rate/');
      let card=$('#adminMarketRateCard');
      if(!card){card=document.createElement('div');card.id='adminMarketRateCard';card.className='v5-card';card.style.margin='14px 0';pane.prepend(card)}
      const auto=r.mode!=='manual';
      card.innerHTML=`<div class="v5-card-head"><div><h3>📡 Canlı GB Kuru</h3><p>KOTAKAS işlem ve emanet hesaplarında kullanılan 1 GB/TL değeri.</p></div><div class="spacer"></div><span class="pill ${auto?'green':'gold'}">${auto?'OTOMATİK KOPAZAR':'MANUEL'}</span></div>
      <div class="v5-statgrid" style="margin:12px 0"><div class="v5-stat green"><div class="top"><span>Etkin kur</span></div><strong>${money(r.effectiveTryPerGb)}</strong><span>1 GB</span></div><div class="v5-stat"><div class="top"><span>Kopazar Satın Al</span></div><strong>${money(r.sourceBuyTryPerGb)}</strong><span>10M × 10</span></div><div class="v5-stat gold"><div class="top"><span>Kopazar Bize Sat</span></div><strong>${money(r.sourceSellTryPerGb)}</strong><span>10M × 10</span></div><div class="v5-stat purple"><div class="top"><span>Son güncelleme</span></div><strong style="font-size:15px">${r.updatedAt?esc(formatDate(r.updatedAt)):'Henüz çekilmedi'}</strong><span>${esc(r.sourceName||'Kopazar ZERO')}</span></div></div>
      <div class="actions" style="align-items:end;flex-wrap:wrap"><button class="btn sm teal" type="button" onclick="kotakasRateAuto()">↻ Otomatik Kopazar</button><div class="field" style="margin:0;min-width:210px"><label>Manuel 1 GB / TL</label><input id="manualGbTryRate" inputmode="decimal" placeholder="Örn. 425,00" value="${auto?'':Number(r.effectiveTryPerGb||0)}"></div><button class="btn sm ghost" type="button" onclick="kotakasRateManual()">Manuel Uygula</button><span class="meta">Otomatik mod 5 dakikada bir Zero fiyatını yeniler. Kaynak kesilirse son başarılı kur korunur.</span></div>`;
    }catch{}
  }

  window.kotakasRateAuto=async()=>{
    try{await api('/api/admin/market-rate/',{method:'PUT',body:{mode:'auto'}});toast('Kopazar otomatik GB kuru aktif.');setTimeout(render,250)}catch(err){toast(err.data?.error||'Otomatik kur açılamadı.')}
  };
  window.kotakasRateManual=async()=>{
    const raw=$('#manualGbTryRate')?.value||'';
    const rate=Number(String(raw).replace(/\./g,'').replace(',','.'));
    if(!Number.isFinite(rate)||rate<=0)return toast('Geçerli bir 1 GB / TL kuru gir.');
    try{await api('/api/admin/market-rate/',{method:'PUT',body:{mode:'manual',manualTryPerGb:rate}});toast('Manuel GB kuru aktif.');setTimeout(render,250)}catch(err){toast(err.data?.error||'Manuel kur kaydedilemedi.')}
  };

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe()}catch{}
    setTimeout(render,500);setTimeout(render,1300);
  }
  boot();
})();
