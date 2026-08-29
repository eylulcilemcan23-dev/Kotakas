(()=>{
  if(!ME)return;
  const p=location.pathname.toLowerCase();
  if(!p.endsWith('/dashboard.html')&&!p.endsWith('/trader.html')&&!p.endsWith('/admin.html'))return;

  function ensureModal(){
    let modal=$('#sessionsModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='sessionsModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:720px"><div class="modalhead"><div><h3>🔐 Açık Oturumlarım</h3><div class="meta">Hesabına giriş yapılmış cihazlar.</div></div><button class="x" onclick="closeModal('sessionsModal')">✕</button></div><div class="actions" style="margin-bottom:12px"><button class="btn sm red" id="revokeOtherSessions">Diğer Tüm Cihazlardan Çıkış Yap</button></div><div id="sessionsList" class="list"><div class="empty">Yükleniyor...</div></div></div>`;
    document.body.append(modal);
    $('#revokeOtherSessions',modal)?.addEventListener('click',async()=>{
      if(!confirm('Bu cihaz dışındaki tüm açık oturumlar kapatılsın mı?'))return;
      try{const d=await api('/api/account/sessions/revoke-others',{method:'POST'});toast(`${Number(d.revoked||0)} oturum kapatıldı.`);await loadSessions()}catch{toast('Oturumlar kapatılamadı.')}
    });
    return modal;
  }

  window.revokeDeviceSession=async id=>{
    if(!confirm('Bu cihazın oturumu kapatılsın mı?'))return;
    try{const d=await api(`/api/account/sessions/${encodeURIComponent(id)}`,{method:'DELETE'});if(d.currentSessionRevoked){location.href='/login.html?session=revoked';return}toast('Cihaz oturumu kapatıldı.');await loadSessions()}catch{toast('Oturum kapatılamadı.')}
  };

  window.loadSessions=async()=>{
    const modal=ensureModal(),box=$('#sessionsList',modal);
    try{const d=await api('/api/account/sessions'),rows=d.sessions||[];box.innerHTML=rows.length?rows.map(s=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${s.current?'🟢 ':''}${esc(s.deviceLabel||'Cihaz')}</div><div class="meta">${esc(s.ipHint||'—')} • Son aktivite ${formatDate(s.lastSeenAt)} • İlk giriş ${formatDate(s.createdAt)}</div></div><div class="spacer"></div>${s.current?'<span class="pill green">BU CİHAZ</span>':`<button class="btn sm red" onclick="revokeDeviceSession('${esc(s.deviceId)}')">Çıkış Yaptır</button>`}</div></div>`).join(''):'<div class="empty">Açık oturum bulunamadı.</div>'}catch{box.innerHTML='<div class="empty">Oturumlar yüklenemedi.</div>'}
  };

  window.openSessions=async()=>{const modal=ensureModal();openModal('sessionsModal');await loadSessions()};
  setTimeout(()=>{
    const actions=$('.v5-head .head-actions');if(actions&&!actions.querySelector('.sessions-btn')){const b=document.createElement('button');b.className='btn ghost sessions-btn';b.textContent='🔐 Oturumlarım';b.onclick=openSessions;actions.prepend(b)}
  },500);
})();
