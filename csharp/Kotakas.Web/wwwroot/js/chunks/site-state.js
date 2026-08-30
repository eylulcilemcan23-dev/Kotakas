(()=>{
  const path=location.pathname.toLowerCase();
  let SITE_STATE=null;

  function toneStyle(tone){
    if(tone==='warning')return'background:#3a2d12;border-color:#816321;color:#ffe9a8';
    if(tone==='success')return'background:#123a29;border-color:#276444;color:#c8ffdd';
    return'background:#102b36;border-color:#23566a;color:#d8f8ff';
  }

  function renderBanner(state){
    let el=$('#siteGlobalBanner');
    const maintenance=!!state.maintenanceEnabled,announcement=!!state.announcementEnabled&&String(state.announcementText||'').trim();
    if(!maintenance&&!announcement){el?.remove();return}
    if(!el){el=document.createElement('div');el.id='siteGlobalBanner';el.style.cssText='border-bottom:1px solid;padding:10px 14px;font-size:12px;font-weight:800;text-align:center;position:relative;z-index:30';const header=$('.site-header');header?.insertAdjacentElement('afterend',el)}
    if(maintenance){el.setAttribute('style',el.getAttribute('style')+';background:#3b1518;border-color:#7a2f35;color:#ffd4d7');el.innerHTML=`🛠️ <strong>BAKIM MODU:</strong> ${esc(state.maintenanceMessage||'KOTAKAS kısa süreli bakımda.')} <span style="opacity:.7">• Görüntüleme açık, kullanıcı işlemleri geçici olarak durduruldu.</span>`;document.body.classList.add('maintenance-mode')}
    else{el.setAttribute('style','border-bottom:1px solid;padding:10px 14px;font-size:12px;font-weight:800;text-align:center;position:relative;z-index:30;'+toneStyle(state.announcementTone));el.innerHTML=`📢 ${esc(state.announcementText)}`;document.body.classList.remove('maintenance-mode')}
  }

  async function loadState(){
    try{SITE_STATE=await api('/api/site-state');renderBanner(SITE_STATE);return SITE_STATE}catch{return null}
  }

  function ensureAdminPane(){
    if(!path.endsWith('/admin.html')||!ME||(ME.role!=='admin_owner'&&ME.role!=='admin_full'))return;
    const side=$('.sidebar'),host=$('#pane-users')?.parentElement;if(!side||!host)return;
    if(!side.querySelector('[data-pane="sitecontrol"]')){
      const a=document.createElement('a');a.href='#';a.className='adminNav';a.dataset.pane='sitecontrol';a.textContent='📣 Site Kontrolü';a.addEventListener('click',()=>setTimeout(loadAdminSiteState,0));side.append(a)
    }
    if(!$('#pane-sitecontrol')){
      const pane=document.createElement('div');pane.id='pane-sitecontrol';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`
        <div class="v5-card-head"><div><h3>📣 Site Kontrolü</h3><p>Duyuru bandı ve gerçek server-side bakım modu.</p></div><div class="spacer"></div><span class="pill purple">OWNER / FULL</span></div>
        <form id="siteStateForm">
          <div class="grid3">
            <div class="field"><label>Duyuru</label><select id="siteAnnouncementEnabled"><option value="false">Kapalı</option><option value="true">Açık</option></select></div>
            <div class="field"><label>Duyuru tipi</label><select id="siteAnnouncementTone"><option value="info">Bilgi</option><option value="warning">Uyarı</option><option value="success">Başarı / Kampanya</option></select></div>
            <div class="field"><label>Duyuru metni</label><input id="siteAnnouncementText" maxlength="240" placeholder="Örn. Bu hafta ZERO işlemlerinde kampanya..."></div>
          </div>
          <div class="notice" style="margin:12px 0">Duyuru yalnız üst bantta görünür; kullanıcı işlemlerini durdurmaz.</div>
          <div class="grid3">
            <div class="field"><label>Bakım Modu</label><select id="siteMaintenanceEnabled"><option value="false">Kapalı</option><option value="true">Açık</option></select></div>
            <div class="field" style="grid-column:span 2"><label>Bakım mesajı</label><input id="siteMaintenanceMessage" maxlength="300" placeholder="KOTAKAS kısa süreli bakımda..."></div>
          </div>
          <div class="v5-tip" style="margin:10px 0"><strong style="display:block;color:#e3fffd">🛠️ Bakım modu ne yapar?</strong>Normal kullanıcı ve pazarcıların POST/PUT/PATCH/DELETE API işlemlerini server tarafında durdurur. Admin işlemleri, giriş/çıkış, sağlık kontrolü ve iyzico callback açık kalır.</div>
          <button class="btn teal">Site Ayarlarını Kaydet</button>
        </form>
        <div id="adminPerformanceBox" style="margin-top:20px"></div>`;
      host.append(pane);
      $('#siteStateForm')?.addEventListener('submit',saveAdminSiteState)
    }
  }

  window.loadAdminSiteState=async()=>{
    ensureAdminPane();
    try{
      const s=await api('/api/admin/site-state/');
      $('#siteAnnouncementEnabled').value=String(!!s.announcementEnabled);$('#siteAnnouncementTone').value=s.announcementTone||'info';$('#siteAnnouncementText').value=s.announcementText||'';$('#siteMaintenanceEnabled').value=String(!!s.maintenanceEnabled);$('#siteMaintenanceMessage').value=s.maintenanceMessage||'';
      if(typeof window.refreshPanelInsights==='function')setTimeout(()=>window.refreshPanelInsights(),0)
    }catch(err){toast(err.data?.error||'Site ayarları yüklenemedi.')}
  };

  async function saveAdminSiteState(e){
    e.preventDefault();
    const maintenanceEnabled=$('#siteMaintenanceEnabled').value==='true';
    if(maintenanceEnabled&&!confirm('Bakım modu açılırsa normal kullanıcı ve pazarcıların işlem yapan API istekleri duracak. Devam?'))return;
    try{
      const d=await api('/api/admin/site-state/',{method:'PUT',body:{announcementEnabled:$('#siteAnnouncementEnabled').value==='true',announcementText:$('#siteAnnouncementText').value||'',announcementTone:$('#siteAnnouncementTone').value||'info',maintenanceEnabled,maintenanceMessage:$('#siteMaintenanceMessage').value||''}});
      SITE_STATE=d.state;renderBanner(SITE_STATE);toast(maintenanceEnabled?'Bakım modu açıldı.':'Site ayarları kaydedildi.');
    }catch(err){toast(err.data?.error||'Site ayarları kaydedilemedi.')}
  }

  async function boot(){await loadState();ensureAdminPane();if(path.endsWith('/admin.html'))setTimeout(ensureAdminPane,700)}
  boot();setInterval(()=>{if(document.visibilityState==='visible')loadState()},60000);
})();
