(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (path !== '/admin.html') return;
  const money = new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY'});
  const esc=(value='')=>String(value).replace(/[&<>"']/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
  let busy=false;

  async function api(url,options={}){
    const response=await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
    const data=await response.json().catch(()=>({}));
    return {response,data};
  }

  async function submit(form){
    const button=form.querySelector('button[type="submit"]');
    const fields=new FormData(form);
    button.disabled=true;
    const {response,data}=await api('/api/admin/finance/wallet-adjustments',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        target:fields.get('target'),direction:fields.get('direction'),amount:fields.get('amount'),reason:fields.get('reason'),
      }),
    });
    if(!response.ok){
      const messages={user_not_found:'Kullanıcı bulunamadı.',insufficient_available_balance:'Kullanıcının kullanılabilir bakiyesi bu düşüm için yetersiz.',invalid_wallet_adjustment:'Tutar veya açıklama geçersiz.',wallet_adjustment_temporarily_unavailable:'Bakiye yönetimi staging migrationı ve finans yazma iznini bekliyor.'};
      alert(messages[data.error]||'Bakiye işlemi tamamlanamadı.');
      button.disabled=false;
      return;
    }
    alert(`Bakiye işlemi kaydedildi. Yeni kullanılabilir bakiye: ${money.format(data.adjustment.availableBalance)}`);
    form.reset();
    button.disabled=false;
    render(true);
  }

  async function render(force=false){
    if(busy)return;
    const main=document.querySelector('main.main');
    if(!main)return;
    const old=main.querySelector('[data-admin-wallet-adjust]');
    if(old&&!force)return;
    busy=true;
    try{
      const {response,data}=await api('/api/admin/finance/wallet-adjustments?limit=10');
      if(response.status===401||response.status===403)return;
      old?.remove();
      const card=document.createElement('section');
      card.className='card full';
      card.dataset.adminWalletAdjust='1';
      if(!response.ok){
        card.innerHTML='<h3>Manuel Bakiye Yönetimi</h3><div class="notice">Bu bölüm staging veritabanı migrationı ve finans yazma izni açıldığında kullanılacak.</div>';
        main.querySelector('.grid')?.appendChild(card);
        return;
      }
      const items=Array.isArray(data.adjustments)?data.adjustments:[];
      card.innerHTML=`<div class="page-title" style="margin-bottom:14px"><div><h3>Manuel Bakiye Yönetimi</h3><p>Yalnızca Ana Yönetici ve Tam Yetkili. Her işlem kalıcı finans kaydı ve audit izi bırakır.</p></div></div><form class="form admin-wallet-form"><div class="field"><label>Kullanıcı ID veya e-posta</label><input name="target" required placeholder="Örn. 123 veya kullanici@mail.com"></div><div class="field"><label>İşlem</label><select name="direction"><option value="credit">Bakiye Ekle</option><option value="debit">Bakiyeden Düş</option></select></div><div class="field"><label>Tutar</label><input name="amount" type="number" min="0.01" max="1000000" step="0.01" required></div><div class="field"><label>Sebep</label><input name="reason" minlength="5" maxlength="200" required placeholder="Örn. Havale yüklemesi / düzeltme"></div><button class="btn primary" type="submit">İşlemi Kaydet</button></form><h3 style="margin-top:20px">Son Manuel Bakiye İşlemleri</h3><div class="list">${items.length?items.map((item)=>`<div class="list-item"><div><strong>Kullanıcı #${esc(item.userId)}</strong><span>${esc(item.reason)} · Yönetici #${esc(item.actorId)}</span></div><strong>${item.amount>=0?'+':''}${esc(money.format(item.amount))}</strong></div>`).join(''):'<div class="empty">Henüz manuel bakiye işlemi yok.</div>'}</div>`;
      main.querySelector('.grid')?.appendChild(card);
      card.querySelector('form')?.addEventListener('submit',(event)=>{event.preventDefault();submit(event.currentTarget);});
    } finally{busy=false;}
  }

  const observer=new MutationObserver(()=>render());
  window.addEventListener('DOMContentLoaded',()=>{
    const app=document.querySelector('#app');
    if(app)observer.observe(app,{childList:true,subtree:true});
    setTimeout(render,300);
  });
})();
