(()=>{
  if(document.getElementById('kLiveSupport'))return;

  const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=v=>{try{return new Date(v).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}catch{return ''}};
  let currentUser=null;
  const isAdmin=()=>!!currentUser&&String(currentUser.role||'').startsWith('admin_');
  const root=document.createElement('div');
  root.id='kLiveSupport';root.className='k-live-support';
  root.innerHTML=`<div class="k-live-support-panel" role="dialog" aria-label="KOTAKAS Canlı Sohbet">
    <div class="k-live-support-head">
      <span class="k-live-support-avatar">💬</span>
      <div><strong data-live-title>KOTAKAS Canlı Sohbet</strong><span data-live-sub><i class="k-live-support-dot"></i>Temsilci bağlantısı</span></div>
      <button class="k-live-support-close" type="button" aria-label="Sohbeti kapat">×</button>
    </div>
    <div class="k-live-support-body" data-live-body><div class="k-live-support-state"><strong>Yükleniyor…</strong>Canlı sohbet hazırlanıyor.</div></div>
  </div>
  <button class="k-live-support-toggle" type="button" aria-label="Canlı sohbeti aç" aria-expanded="false"><span class="ico">💬</span><span class="label">Canlı Sohbet</span><span class="k-live-support-badge" data-live-badge></span></button>`;
  document.body.appendChild(root);

  const body=root.querySelector('[data-live-body]');
  const title=root.querySelector('[data-live-title]');
  const sub=root.querySelector('[data-live-sub]');
  const toggle=root.querySelector('.k-live-support-toggle');
  const close=root.querySelector('.k-live-support-close');
  const badge=root.querySelector('[data-live-badge]');
  let activeUserTicket=null;
  let activeAdminTicket=null;
  let adminTickets=[];
  let refreshing=false;

  function setSub(text){if(sub)sub.innerHTML=`<i class="k-live-support-dot"></i>${safe(text)}`}
  function scrollBottom(){const list=root.querySelector('.k-live-chat-list');if(list)list.scrollTop=list.scrollHeight}
  function openChat(){root.classList.add('open');toggle?.setAttribute('aria-expanded','true');toggle?.setAttribute('aria-label','Canlı sohbeti kapat');refresh(true)}
  function closeChat(){root.classList.remove('open');toggle?.setAttribute('aria-expanded','false');toggle?.setAttribute('aria-label','Canlı sohbeti aç')}
  toggle?.addEventListener('click',()=>root.classList.contains('open')?closeChat():openChat());
  close?.addEventListener('click',closeChat);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeChat()});

  async function ensureMe(){
    try{currentUser=(await api('/api/me')).user||null}catch{currentUser=null}
    return currentUser;
  }

  function loginState(){
    title.textContent='KOTAKAS Canlı Sohbet';setSub('Temsilci bağlantısı');
    body.innerHTML=`<div class="k-live-support-state"><strong>Temsilciyle canlı sohbet</strong>Mesaj göndermek ve temsilci yanıtlarını takip etmek için hesabına giriş yap.<br><br><a href="/login.html">🔐 Giriş Yap →</a></div>`;
  }

  function messageRows(ticket,adminView=false){
    const rows=[];
    if(ticket?.message)rows.push({role:'user',message:ticket.message,createdAt:ticket.createdAt});
    (ticket?.replies||[]).forEach(r=>rows.push({role:String(r.senderRole||'').toLowerCase()==='admin'?'agent':'user',message:r.message,createdAt:r.createdAt}));
    return rows.map(r=>`<div class="k-live-msg ${r.role}"><span class="who">${r.role==='agent'?'KOTAKAS Temsilcisi':adminView?'Kullanıcı':'Sen'}</span>${safe(r.message)}<span class="time">${safe(fmt(r.createdAt))}</span></div>`).join('');
  }

  function composeHtml(placeholder='Mesajını yaz…'){
    return `<form class="k-live-chat-compose" data-live-compose><textarea name="message" maxlength="1000" minlength="2" required placeholder="${safe(placeholder)}"></textarea><button class="k-live-chat-send" type="submit" title="Gönder">➤</button></form>`;
  }

  function bindCompose(handler){
    const form=root.querySelector('[data-live-compose]');
    const textarea=form?.querySelector('textarea');
    if(!form||!textarea)return;
    form.addEventListener('submit',async e=>{e.preventDefault();const message=textarea.value.trim();if(message.length<2)return;const btn=form.querySelector('button');btn.disabled=true;try{await handler(message);textarea.value=''}finally{btn.disabled=false;textarea.focus()}});
    textarea.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();form.requestSubmit()}});
  }

  async function startUserChat(message){
    const d=await api('/api/support',{method:'POST',body:{subject:'[CANLI DESTEK] Canlı Sohbet',message,priority:'normal'}});
    activeUserTicket=Number(d?.ticket?.id||d?.ticket?.Id||0)||null;
    await loadUserChat(true);
  }

  async function sendUserMessage(message){
    if(!activeUserTicket)return startUserChat(message);
    await api(`/api/support/${activeUserTicket}/reply`,{method:'POST',body:{message}});
    await loadUserChat(true);
  }

  async function loadUserChat(forceBottom=false){
    try{
      const d=await api('/api/support/mine');
      const chats=(d.tickets||[]).filter(t=>String(t.subject||'').startsWith('[CANLI DESTEK]'));
      const t=chats[0]||null;
      activeUserTicket=t?Number(t.id):null;
      title.textContent='KOTAKAS Temsilcisi';
      setSub(t?'Mesajlar birkaç saniyede yenilenir':'Temsilciye bağlan');
      if(!t){
        body.innerHTML=`<div class="k-live-support-state"><strong>Nasıl yardımcı olabiliriz?</strong>Mesajını yaz; KOTAKAS temsilcisi bu sohbet üzerinden yanıtlasın.</div>${composeHtml('Temsilciye mesajını yaz…')}`;
        bindCompose(startUserChat);return;
      }
      body.innerHTML=`<div class="k-live-chat-list">${messageRows(t)}${!(t.replies||[]).some(r=>String(r.senderRole).toLowerCase()==='admin')?'<div class="k-live-msg agent"><span class="who">Sistem</span>Mesajın temsilci sırasına alındı. Yanıt geldiğinde burada görünecek.</div>':''}</div>${composeHtml(t.status==='closed'?'Yeni mesaj gönderirsen sohbet tekrar açılır':'Mesajını yaz…')}`;
      bindCompose(sendUserMessage);if(forceBottom)requestAnimationFrame(scrollBottom);
    }catch{body.innerHTML='<div class="k-live-support-state"><strong>Sohbet yüklenemedi</strong>Bağlantıyı kontrol edip tekrar dene.</div>'}
  }

  async function fetchAdminTickets(){
    const d=await api('/api/admin/support-center/tickets?q='+encodeURIComponent('[CANLI DESTEK]')+'&status=all&priority=all');
    adminTickets=(d.tickets||[]).filter(t=>String(t.subject||'').startsWith('[CANLI DESTEK]'));
    const openCount=adminTickets.filter(t=>t.status!=='closed').length;
    badge.textContent=openCount?String(openCount):'';badge.classList.toggle('show',openCount>0);
    return adminTickets;
  }

  function renderAdminList(){
    title.textContent='Canlı Sohbet Gelen Kutusu';setSub('Temsilci paneli');
    if(!adminTickets.length){body.innerHTML='<div class="k-live-support-state"><strong>Bekleyen sohbet yok</strong>Yeni kullanıcı sohbetleri burada görünecek.</div>';return}
    body.innerHTML=`<div class="k-live-admin-list">${adminTickets.map(t=>`<button type="button" class="k-live-admin-chat" data-admin-chat="${Number(t.id)}"><strong>#${Number(t.id)} • ${safe(t.userName||'Kullanıcı')}</strong><span>${safe(t.status==='closed'?'Kapalı':t.status==='in_progress'?'Görüşülüyor':'Yeni sohbet')} • ${Number(t.replyCount||0)} mesaj</span></button>`).join('')}</div>`;
    root.querySelectorAll('[data-admin-chat]').forEach(b=>b.addEventListener('click',()=>{activeAdminTicket=Number(b.dataset.adminChat);loadAdminDetail(true)}));
  }

  async function loadAdminList(){
    try{await fetchAdminTickets();renderAdminList()}catch{body.innerHTML='<div class="k-live-support-state"><strong>Sohbetler yüklenemedi</strong>Tekrar deneyin.</div>'}
  }

  async function sendAdminMessage(message){
    if(!activeAdminTicket)return;
    await api(`/api/admin/support-center/tickets/${activeAdminTicket}/reply`,{method:'POST',body:{message,close:false}});
    await loadAdminDetail(true);await fetchAdminTickets();
  }

  async function loadAdminDetail(forceBottom=false){
    if(!activeAdminTicket)return loadAdminList();
    try{
      const d=await api(`/api/admin/support-center/tickets/${activeAdminTicket}`);const t=d.ticket;
      if(!t){activeAdminTicket=null;return loadAdminList()}
      title.textContent=t.userName||'Canlı Sohbet';setSub('KOTAKAS temsilcisi olarak yanıtlıyorsun');
      body.innerHTML=`<div style="padding:9px 12px;border-bottom:1px solid #2d2f3d"><button type="button" class="k-live-admin-back" data-admin-back>← Sohbetler</button></div><div class="k-live-chat-list">${messageRows(t,true)}</div>${composeHtml('Kullanıcıya yanıt yaz…')}`;
      root.querySelector('[data-admin-back]')?.addEventListener('click',()=>{activeAdminTicket=null;renderAdminList()});
      bindCompose(sendAdminMessage);if(forceBottom)requestAnimationFrame(scrollBottom);
    }catch{body.innerHTML='<div class="k-live-support-state"><strong>Sohbet açılamadı</strong>Tekrar deneyin.</div>'}
  }

  async function refresh(forceBottom=false){
    if(refreshing)return;refreshing=true;
    try{
      await ensureMe();
      if(!currentUser){loginState();return}
      if(isAdmin()){
        if(activeAdminTicket)await loadAdminDetail(forceBottom);else await loadAdminList();
      }else await loadUserChat(forceBottom);
    }finally{refreshing=false}
  }

  setTimeout(()=>refresh(false),350);
  setInterval(()=>{if(root.classList.contains('open'))refresh(false);else if(isAdmin())fetchAdminTickets().catch(()=>{})},3500);
})();
