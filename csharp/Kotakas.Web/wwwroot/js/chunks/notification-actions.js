(()=>{
  if(!location.pathname.toLowerCase().endsWith('/notifications.html'))return;

  function actionFor(n){
    const text=`${n.title||''} ${n.body||''}`.toLocaleLowerCase('tr-TR');
    if(text.includes('acil item')||text.includes('acil alım'))return{label:'⚡ Acil Satışı Aç',href:'/urgent-sell.html'};
    if(text.includes('güvenli işlem')||text.includes('teslim')||text.includes('işlem tamamlandı')||text.includes('teklifin kabul edildi')||text.includes('anlaşmazlık'))return{label:'🤝 İşlemleri Aç',href:'/deals.html'};
    if(text.includes('bakiye')||text.includes('ödeme')||text.includes('emanet'))return{label:'💳 Cüzdanı Aç',href:'/wallet.html'};
    if(text.includes('yeni teklif')||text.includes('teklif süresi')||text.includes('satış talebi'))return{label:'📋 Paneli Aç',href:typeof panelHref==='function'?panelHref():'/dashboard.html'};
    if(text.includes('doğrulama'))return{label:'🛡️ Hesabımı Aç',onclick:'kOpenAccount()'};
    if(text.includes('destek'))return{label:'💬 Desteği Aç',href:'/support.html'};
    return null;
  }

  async function enhance(){
    if(!ME||!$('#notificationsList'))return;
    try{
      const d=await api('/api/notifications'),rows=d.notifications||[],cards=$$('#notificationsList .listitem');
      cards.forEach((card,i)=>{
        if(card.querySelector('.notification-action'))return;
        const a=actionFor(rows[i]||{});if(!a)return;
        const wrap=document.createElement('div');wrap.className='actions notification-action';wrap.style.marginTop='10px';
        wrap.innerHTML=a.href?`<a class="btn sm ghost" href="${a.href}">${a.label}</a>`:`<button class="btn sm ghost" onclick="${a.onclick}">${a.label}</button>`;
        card.append(wrap);
      });
    }catch{}
  }

  const base=typeof renderNotifications==='function'?renderNotifications:null;
  if(base)renderNotifications=async function(){await base();await enhance()};
  setTimeout(enhance,700);setTimeout(enhance,1500);
})();
