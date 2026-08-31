(()=>{
  if(document.getElementById('kLiveSupport'))return;
  const root=document.createElement('div');
  root.id='kLiveSupport';root.className='k-live-support';
  const logged=!!window.ME;
  root.innerHTML=`<div class="k-live-support-panel" role="dialog" aria-label="KOTAKAS Canlı Destek">
    <div class="k-live-support-head"><span class="k-live-support-avatar">💬</span><div><strong>KOTAKAS Canlı Destek</strong><span><i class="k-live-support-dot"></i>Destek merkezi aktif</span></div></div>
    <div class="k-live-support-copy">Sorununu veya işlem talebini güvenli şekilde ilet. Destek yanıtlarını KOTAKAS içinden takip edebilirsin.</div>
    <div class="k-live-support-actions">
      <a class="k-live-support-primary" href="/support.html">💬 Destek Talebi Aç</a>
      ${logged?'<a class="k-live-support-secondary" href="/support.html#mySupportTickets">📨 Mesajlarımı Gör</a>':'<a class="k-live-support-secondary" href="/login.html">🔐 Giriş Yap</a>'}
    </div>
  </div><button class="k-live-support-toggle" type="button" aria-label="Canlı desteği aç" aria-expanded="false"><span class="ico">💬</span><span class="label">Canlı Destek</span></button>`;
  document.body.appendChild(root);
  const btn=root.querySelector('.k-live-support-toggle');
  btn?.addEventListener('click',()=>{const open=root.classList.toggle('open');btn.setAttribute('aria-expanded',open?'true':'false');btn.setAttribute('aria-label',open?'Canlı desteği kapat':'Canlı desteği aç')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')root.classList.remove('open')});
})();
