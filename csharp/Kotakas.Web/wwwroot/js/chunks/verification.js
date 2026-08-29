(()=>{
  const p=location.pathname.toLowerCase();

  function ensureRequestModal(){
    let modal=$('#verificationModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='verificationModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox"><div class="modalhead"><div><h3>🛡️ Hesap Doğrulama Talebi</h3><div class="meta">KOTAKAS hesabın için yönetim incelemesi iste.</div></div><button class="x" onclick="closeModal('verificationModal')">✕</button></div><form id="verificationForm"><div class="notice">KOTAKAS bu adımda kimlik belgesi fotoğrafı saklamaz. Gerekli kontrol yönetim tarafından manuel yürütülür. İletişim numarası veya sosyal medya adresi yazma.</div><div class="field"><label>Not <span class="meta">(isteğe bağlı, en fazla 300 karakter)</span></label><textarea id="verificationNote" maxlength="300" rows="4" placeholder="Doğrulama talebinle ilgili kısa not..."></textarea></div><button class="btn teal full">Talebi Gönder</button></form></div>`;
    document.body.appendChild(modal);
    $('#verificationForm',modal)?.addEventListener('submit',async e=>{
      e.preventDefault();const btn=e.target.querySelector('button');if(btn)btn.disabled=true;
      try{await api('/api/verification/account-request',{method:'POST',body:{note:$('#verificationNote')?.value||''}});closeModal('verificationModal');toast('Hesap doğrulama talebin admin incelemesine gönderildi.');setTimeout(renderDashboardVerification,250)}catch(err){const map={account_already_verified:'Hesabın zaten doğrulanmış.',verification_already_pending:'Bekleyen doğrulama talebin zaten var.',invalid_verification_note:'Not geçersiz veya iletişim bilgisi içeriyor.'};toast(map[err.data?.error]||'Doğrulama talebi gönderilemedi.')}finally{if(btn)btn.disabled=false}
    });
    return modal;
  }
  window.openVerificationRequest=()=>{if(!ME){location.href='/login.html';return}ensureRequestModal().classList.add('open')};

  async function renderDashboardVerification(){
    if(!p.endsWith('/dashboard.html')||!ME)return;
    let d;try{d=await api('/api/verification/me')}catch{return}
    const profile=$('.v5-profilebar');if(profile){const text=profile.querySelector('div:nth-child(2) span');if(text)text.textContent=`${ME.role==='trader'?'Pazarcı':'Standart kullanıcı'} • Hesap aktif${d.userVerified?' • 🛡️ Doğrulandı':''}`}
    const aside=$('.v5-layout aside');if(!aside)return;
    let card=$('#accountVerificationCard');if(!card){card=document.createElement('div');card.id='accountVerificationCard';card.className='v5-card';card.style.marginBottom='12px';const tip=aside.querySelector('.v5-tip');aside.insertBefore(card,tip||null)}
    const r=d.request;
    if(d.userVerified)card.innerHTML='<div class="v5-card-head"><div><h3>🛡️ Hesap Doğrulandı</h3><p>Yönetim onaylı hesap rozeti aktif.</p></div><span class="pill green">DOĞRULANDI</span></div><div class="notice">Bu rozet hesap doğrulama incelemesinin tamamlandığını gösterir. Pazarcı doğrulaması ayrı bir süreçtir.</div>';
    else if(r?.status==='pending')card.innerHTML=`<div class="v5-card-head"><div><h3>🛡️ Hesap Doğrulama</h3><p>Talebin yönetim incelemesinde.</p></div><span class="pill gold">BEKLİYOR</span></div><div class="meta">Talep: ${formatDate(r.createdAt)}</div>`;
    else{const rejected=r?.status==='rejected';card.innerHTML=`<div class="v5-card-head"><div><h3>🛡️ Hesap Doğrulama</h3><p>${rejected?'Önceki talebin onaylanmadı. Yeniden başvurabilirsin.':'Hesabına yönetim doğrulama rozeti ekleyebilirsin.'}</p></div><span class="pill ${rejected?'red':'purple'}">${rejected?'ONAYLANMADI':'DOĞRULANMADI'}</span></div>${rejected&&r.adminNote?`<div class="notice" style="margin-bottom:8px">${esc(r.adminNote)}</div>`:''}<button class="btn sm teal" onclick="openVerificationRequest()">${rejected?'Yeniden Başvur':'Doğrulama Talebi Aç'}</button>`}
  }

  function addAdminVerificationPane(){
    if(!p.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_'))return;
    const side=$('.sidebar');if(side&&!side.querySelector('[data-pane="verifications"]')){const a=document.createElement('a');a.href='#';a.className='adminNav';a.dataset.pane='verifications';a.textContent='🛡️ Doğrulamalar';const support=side.querySelector('[data-pane="support"]');side.insertBefore(a,support||null);a.addEventListener('click',e=>{e.preventDefault();$$('.adminNav').forEach(x=>x.classList.remove('active'));a.classList.add('active');$$('.adminPane').forEach(x=>x.style.display='none');$('#pane-verifications').style.display='';loadAdminVerifications()})}
    const host=$('#pane-users')?.parentElement;if(host&&!$('#pane-verifications')){const pane=document.createElement('div');pane.id='pane-verifications';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML='<div class="v5-card-head"><div><h3>Hesap Doğrulamaları</h3><p>Genel hesap doğrulama talepleri. Kimlik belgesi bu sistemde saklanmaz.</p></div><div class="spacer"></div><select id="verificationStatusFilter" class="input"><option value="pending">Bekleyen</option><option value="approved">Onaylanan</option><option value="rejected">Reddedilen</option><option value="all">Tümü</option></select></div><div id="adminVerificationList" class="list"></div>';host.append(pane);$('#verificationStatusFilter')?.addEventListener('change',loadAdminVerifications)}
  }

  async function loadAdminVerifications(){
    const box=$('#adminVerificationList');if(!box)return;try{const status=$('#verificationStatusFilter')?.value||'pending',d=await api(`/api/admin/verifications/?status=${encodeURIComponent(status)}`),rows=d.requests||[];box.innerHTML=rows.length?rows.map(x=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.user?.displayName||'Kullanıcı')}</div><div class="meta">${esc(x.user?.email||'')} • ${formatDate(x.createdAt)}</div></div><div class="spacer"></div><span class="pill ${x.status==='approved'?'green':x.status==='rejected'?'red':'gold'}">${esc(x.status)}</span></div>${x.note?`<div class="notice" style="margin-top:8px">${esc(x.note)}</div>`:''}${x.status==='pending'?`<div class="actions"><button class="btn sm green" onclick="decideVerification(${Number(x.id)},'approved')">Onayla</button><button class="btn sm red" onclick="decideVerification(${Number(x.id)},'rejected')">Reddet</button></div>`:''}${x.adminNote?`<div class="meta" style="margin-top:7px">Admin notu: ${esc(x.adminNote)}</div>`:''}</div>`).join(''):'<div class="empty">Bu filtrede doğrulama talebi yok.</div>'}catch{box.innerHTML='<div class="empty">Doğrulama talepleri yüklenemedi.</div>'}
  }
  window.decideVerification=async(id,decision)=>{const note=prompt(decision==='approved'?'Onay notu (isteğe bağlı):':'Red nedeni (kullanıcıya gösterilir):','')??null;if(note===null)return;try{await api(`/api/admin/verifications/${id}/decision`,{method:'POST',body:{decision,adminNote:note}});toast('Doğrulama talebi güncellendi.');await loadAdminVerifications()}catch{toast('Doğrulama kararı uygulanamadı.')}};

  async function decorateAdminUsers(){
    if(!p.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_'))return;try{const d=await api('/api/admin/users'),users=d.users||[],rows=$$('#adminUsers tr');rows.forEach((tr,i)=>{const u=users[i];if(!u||tr.querySelector('.verify-account-state'))return;const first=tr.querySelector('td');if(first&&u.userVerified){const b=document.createElement('span');b.className='pill green verify-account-state';b.style.marginLeft='5px';b.textContent='🛡️';first.append(b)}if(u.userVerified&&(ME.role==='admin_owner'||ME.role==='admin_full')){const cell=tr.lastElementChild;if(cell){const btn=document.createElement('button');btn.className='btn sm ghost verify-account-state';btn.style.marginLeft='4px';btn.textContent='Doğrulamayı Kaldır';btn.onclick=async()=>{if(!confirm('Bu hesabın doğrulama rozetini kaldırmak istiyor musun?'))return;try{await api(`/api/admin/verifications/users/${u.id}/revoke`,{method:'POST'});toast('Doğrulama kaldırıldı.');setTimeout(()=>location.reload(),250)}catch{toast('Doğrulama kaldırılamadı.')}};cell.append(btn)}}})}catch{}
  }

  async function boot(){
    if(!ME)await loadMe();updateNav();
    if(p.endsWith('/dashboard.html'))await renderDashboardVerification();
    if(p.endsWith('/admin.html')){setTimeout(()=>{addAdminVerificationPane();decorateAdminUsers()},550);setTimeout(()=>{addAdminVerificationPane();decorateAdminUsers()},1200)}
  }
  boot();
})();
