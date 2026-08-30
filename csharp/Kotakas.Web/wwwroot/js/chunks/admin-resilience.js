(()=>{
  const onAdmin=()=>location.pathname.toLowerCase().endsWith('/admin.html');
  const isAdmin=()=>ME&&String(ME.role||'').startsWith('admin_');
  const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function ensureAdminUsers(){
    if(!onAdmin()) return;
    try{
      if(!ME&&typeof loadMe==='function') await loadMe();
      if(!isAdmin()) return;
      const body=document.querySelector('#adminUsers');
      if(!body||body.children.length) return;
      const data=await api('/api/admin/users');
      const users=Array.isArray(data?.users)?data.users:[];
      if(!users.length){
        body.innerHTML='<tr><td colspan="5">Henüz listelenecek hesap yok.</td></tr>';
        return;
      }
      body.innerHTML=users.map(u=>`<tr>
        <td>${html(u.displayName||'-')}</td>
        <td>${html(u.email||'-')}</td>
        <td><select class="input afRole" data-id="${html(u.id)}">
          <option value="user">user</option><option value="trader">trader</option><option value="admin_limited">admin_limited</option><option value="admin_full">admin_full</option><option value="admin_owner">admin_owner</option>
        </select></td>
        <td><span class="pill ${u.active?'green':'red'}">${u.active?'Aktif':'Pasif'}</span></td>
        <td><button class="btn sm ghost afActive" data-id="${html(u.id)}" data-active="${u.active}">${u.active?'Askıya Al':'Aktif Et'}</button> <button class="btn sm teal afSaveRole" data-id="${html(u.id)}">Rolü Kaydet</button> <button class="btn sm ghost afResetPass" data-id="${html(u.id)}" data-name="${html(u.displayName||u.email||'Kullanıcı')}">Şifre Sıfırla</button></td>
      </tr>`).join('');
      document.querySelectorAll('.afRole').forEach(sel=>{
        const u=users.find(x=>String(x.id)===String(sel.dataset.id));
        if(u) sel.value=u.role;
      });
      body.dataset.resilient='1';
    }catch(err){
      const body=document.querySelector('#adminUsers');
      if(body&&!body.children.length) body.innerHTML='<tr><td colspan="5">Üye listesi yüklenemedi. Sayfayı yenileyip tekrar dene.</td></tr>';
      console.error('KOTAKAS admin kullanıcı yedek yükleyicisi:',err);
    }
  }

  document.addEventListener('click',async e=>{
    const body=document.querySelector('#adminUsers[data-resilient="1"]');
    if(!body||!body.contains(e.target)) return;
    const save=e.target.closest('.afSaveRole');
    const active=e.target.closest('.afActive');
    const reset=e.target.closest('.afResetPass');
    try{
      if(save){
        const sel=body.querySelector(`.afRole[data-id="${CSS.escape(save.dataset.id)}"]`);
        await api(`/api/admin/users/${encodeURIComponent(save.dataset.id)}/role`,{method:'PATCH',body:{role:sel.value}});
        toast('Rol güncellendi.');
      }
      if(active){
        await api(`/api/admin/users/${encodeURIComponent(active.dataset.id)}/active`,{method:'PATCH',body:{active:active.dataset.active!=='true'}});
        toast('Hesap durumu güncellendi.');
        setTimeout(()=>location.reload(),250);
      }
      if(reset){
        const temp=prompt(`${reset.dataset.name} için geçici şifre (en az 8 karakter):`);
        if(temp===null) return;
        if(temp.length<8) return toast('Şifre en az 8 karakter olmalı.');
        await api(`/api/admin/users/${encodeURIComponent(reset.dataset.id)}/password-reset`,{method:'POST',body:{temporaryPassword:temp}});
        toast('Geçici şifre ayarlandı.');
      }
    }catch(err){toast(err?.data?.error||'İşlem başarısız.');}
  });

  setTimeout(ensureAdminUsers,700);
  setTimeout(ensureAdminUsers,1600);
  window.refreshAdminUsersFallback=ensureAdminUsers;
})();
