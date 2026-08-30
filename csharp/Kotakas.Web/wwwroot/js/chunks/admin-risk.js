(()=>{
  if(!location.pathname.toLowerCase().endsWith('/admin.html'))return;

  const canRisk=()=>ME&&(ME.role==='admin_owner'||ME.role==='admin_full');
  const money=v=>Number(v||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const sevClass=s=>s==='critical'?'red':s==='high'?'gold':s==='medium'?'purple':'green';
  const statusLabel=s=>({open:'AÇIK',reviewing:'İNCELENİYOR',resolved:'ÇÖZÜLDÜ',dismissed:'YOK SAYILDI',cleared:'OTOMATİK TEMİZ'}[s]||String(s||'').toUpperCase());

  function ensurePane(){
    const side=$('.sidebar'),host=$('#pane-users')?.parentElement;
    if(!side||!host||!canRisk())return;
    if(!side.querySelector('[data-pane="risk"]')){
      const a=document.createElement('a');
      a.href='#';a.className='adminNav';a.dataset.pane='risk';a.textContent='🛡️ Risk Merkezi';
      a.addEventListener('click',()=>setTimeout(loadAdminRisk,0));
      side.append(a);
    }
    if(!$('#pane-risk')){
      const pane=document.createElement('div');
      pane.id='pane-risk';pane.className='v5-card adminPane';pane.style.display='none';
      pane.innerHTML=`
        <div class="v5-card-head"><div><h3>🛡️ Finans ve İşlem Risk Merkezi</h3><p>Uyarılar otomatik para kesmez veya hesap kapatmaz; yönetici incelemesi ister.</p></div><div class="spacer"></div><button class="btn teal" onclick="runAdminRiskScan()">Şimdi Tara</button></div>
        <div id="riskSummary" class="v5-statgrid" style="margin-bottom:14px"></div>
        <div class="grid3 advanced-admin-filter" style="margin-bottom:12px">
          <div class="field"><label>Durum</label><select id="riskStatus"><option value="open">Açık</option><option value="reviewing">İncelenen</option><option value="all">Tümü</option><option value="resolved">Çözülen</option><option value="dismissed">Yok sayılan</option><option value="cleared">Otomatik temizlenen</option></select></div>
          <div class="field"><label>Önem</label><select id="riskSeverity"><option value="all">Tümü</option><option value="critical">Kritik</option><option value="high">Yüksek</option><option value="medium">Orta</option></select></div>
          <div class="field"><label>&nbsp;</label><button class="btn ghost" style="width:100%" onclick="loadAdminRisk()">Yenile</button></div>
        </div>
        <div id="riskSignals" class="list"><div class="empty">Risk verileri yükleniyor...</div></div>`;
      host.append(pane);
      $('#riskStatus')?.addEventListener('change',loadAdminRiskSignals);
      $('#riskSeverity')?.addEventListener('change',loadAdminRiskSignals);
    }
  }

  window.loadAdminRisk=async()=>{
    if(!canRisk())return;
    ensurePane();
    try{
      const [s]=await Promise.all([api('/api/admin/risk/summary'),loadAdminRiskSignals()]);
      const last=s.lastScanAt?formatDate(s.lastScanAt):'Henüz taranmadı';
      $('#riskSummary').innerHTML=`
        <div class="v5-stat"><div class="top"><div class="ico">🚨</div><span>Kritik</span></div><strong>${s.critical||0}</strong><span>Hemen incele</span></div>
        <div class="v5-stat gold"><div class="top"><div class="ico">⚠️</div><span>Yüksek</span></div><strong>${s.high||0}</strong><span>Yüksek risk</span></div>
        <div class="v5-stat purple"><div class="top"><div class="ico">🔎</div><span>İncelenen</span></div><strong>${s.reviewing||0}</strong><span>Yönetici kontrolünde</span></div>
        <div class="v5-stat green"><div class="top"><div class="ico">💳</div><span>Cüzdan Toplamı</span></div><strong style="font-size:20px">${money(s.walletTotalTry)}</strong><span>Escrow ${money(s.activeEscrowTry)}</span></div>
        <div class="notice" style="grid-column:1/-1"><strong>${esc(s.provider||'DB')}</strong> • Son bütünlük taraması: ${esc(last)} • Açık sinyal: <strong>${s.open||0}</strong>. Bu panel yalnız uyarı üretir; finansal işlem otomatik uygulanmaz.</div>`;
    }catch(err){
      $('#riskSignals').innerHTML='<div class="empty">Risk özeti yüklenemedi.</div>';
      toast(err.data?.error||'Risk merkezi yüklenemedi.');
    }
  };

  window.loadAdminRiskSignals=async()=>{
    if(!canRisk()||!$('#riskSignals'))return;
    const status=$('#riskStatus')?.value||'open',severity=$('#riskSeverity')?.value||'all';
    try{
      const qs=new URLSearchParams({status,severity,take:'300'});
      const d=await api('/api/admin/risk/signals?'+qs),rows=d.signals||[];
      $('#riskSignals').innerHTML=rows.length?rows.map(x=>{
        const name=x.user?.displayName||x.user?.DisplayName||x.user?.email||x.user?.Email||x.subjectUserId||'Sistem';
        const refs=[x.dealId?`İşlem #${x.dealId}`:'',x.walletLedgerId?`Ledger #${x.walletLedgerId}`:'',x.amountTry!=null?money(x.amountTry):''].filter(Boolean).join(' • ');
        const actions=(x.status==='open'||x.status==='reviewing')?`<div class="actions">
          ${x.status==='open'?`<button class="btn sm ghost" onclick="riskDecision(${x.id},'reviewing')">İncelemeye Al</button>`:''}
          <button class="btn sm green" onclick="riskDecision(${x.id},'resolved')">Çözüldü</button>
          <button class="btn sm ghost" onclick="riskDecision(${x.id},'dismissed')">Yok Say</button>
        </div>`:'';
        return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.title)}</div><div class="meta">${esc(name)} • ${esc(x.code)}${refs?' • '+esc(refs):''}</div></div><div class="spacer"></div><span class="pill ${sevClass(x.severity)}">${esc(String(x.severity||'').toUpperCase())}</span> <span class="pill ${x.status==='open'?'red':x.status==='reviewing'?'gold':'green'}">${esc(statusLabel(x.status))}</span></div><div class="meta" style="margin-top:8px">${esc(x.details||'')}</div><div class="meta" style="margin-top:5px">İlk: ${formatDate(x.firstDetectedAt)} • Son: ${formatDate(x.lastDetectedAt)}${x.resolutionNote?' • Not: '+esc(x.resolutionNote):''}</div>${actions}</div>`;
      }).join(''):'<div class="empty">Bu filtrede risk sinyali yok.</div>';
    }catch{
      $('#riskSignals').innerHTML='<div class="empty">Risk sinyalleri yüklenemedi.</div>';
    }
  };

  window.runAdminRiskScan=async()=>{
    if(!canRisk())return;
    try{
      toast('Finans ve işlem bütünlüğü taranıyor...');
      const r=await api('/api/admin/risk/scan',{method:'POST'});
      toast(`Tarama tamamlandı: ${r.findings||0} bulgu, ${r.added||0} yeni sinyal.`);
      await loadAdminRisk();
    }catch(err){toast(err.data?.status==='scan_already_running'?'Tarama zaten çalışıyor.':'Risk taraması tamamlanamadı.');}
  };

  window.riskDecision=async(id,status)=>{
    const note=prompt(status==='reviewing'?'İnceleme notu (isteğe bağlı):':status==='resolved'?'Çözüm notu:':'Yok sayma nedeni:','')??'';
    try{
      await api(`/api/admin/risk/signals/${id}`,{method:'PATCH',body:{status,note}});
      toast('Risk kaydı güncellendi.');
      await loadAdminRisk();
    }catch{toast('Risk kaydı güncellenemedi.');}
  };

  setTimeout(ensurePane,650);
  setTimeout(ensurePane,1200);
})();
