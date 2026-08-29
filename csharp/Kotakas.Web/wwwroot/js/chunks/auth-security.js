(()=>{
  const path=location.pathname.toLowerCase();

  function loginEnhance(){
    if(!path.endsWith('/login.html'))return;
    const login=$('#loginForm'),register=$('#registerForm');
    const q=new URLSearchParams(location.search);
    if(q.get('email')==='confirmed')setTimeout(()=>toast('E-posta adresin doğrulandı. Giriş yapabilirsin.'),150);
    if(q.get('email')==='confirm_failed')setTimeout(()=>toast('Doğrulama bağlantısı geçersiz veya süresi dolmuş.'),150);
    if(q.get('password')==='reset')setTimeout(()=>toast('Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.'),150);
    if(q.get('session')==='revoked')setTimeout(()=>toast('Bu cihazdaki oturum kapatılmış.'),150);

    if(login&&!$('#forgotPasswordBtn')){
      const wrap=document.createElement('div');wrap.className='actions';wrap.style='justify-content:flex-end;margin:-4px 0 12px';
      wrap.innerHTML='<button id="forgotPasswordBtn" type="button" class="btn sm ghost">Şifremi unuttum</button>';
      login.querySelector('button[type="submit"],button:not([type])')?.before(wrap);
      $('#forgotPasswordBtn')?.addEventListener('click',async()=>{
        const current=login.querySelector('[name="email"]')?.value||'';
        const email=prompt('Şifre yenileme bağlantısı hangi e-postaya gönderilsin?',current);
        if(!email)return;
        try{const d=await api('/api/auth/forgot-password',{method:'POST',body:{email}});toast(d.emailDeliveryConfigured===false?'E-posta servisi henüz yapılandırılmadı.':'Hesap uygunsa şifre yenileme bağlantısı gönderildi.')}catch{toast('İstek gönderilemedi.')}
      });
    }

    login?.addEventListener('submit',async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const btn=e.target.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;
      const body=Object.fromEntries(new FormData(e.target));
      try{const d=await api('/api/login',{method:'POST',body});ME=d.user;location.href=panelHref()}
      catch(err){const code=err.data?.error;if(code==='email_not_confirmed'){toast('Önce e-posta adresini doğrula.');if(confirm('Doğrulama e-postası yeniden gönderilsin mi?'))await api('/api/auth/resend-confirmation',{method:'POST',body:{email:body.email}}).catch(()=>{});}else if(code==='account_temporarily_locked')toast('Çok fazla hatalı deneme. Hesap 15 dakika kilitlendi.');else toast('E-posta veya şifre hatalı.')}finally{if(btn)btn.disabled=false}
    },true);

    register?.addEventListener('submit',async e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const btn=e.target.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;
      const body=Object.fromEntries(new FormData(e.target));
      if(String(body.password||'').length<10||!/[0-9]/.test(String(body.password||''))){toast('Şifre en az 10 karakter ve en az 1 rakam içermeli.');if(btn)btn.disabled=false;return}
      try{const d=await api('/api/register',{method:'POST',body});if(d.requiresEmailConfirmation){toast('Hesap açıldı. E-postana gelen doğrulama bağlantısını kullan.');authTab('login');login.querySelector('[name="email"]').value=body.email||'';}else{ME=d.user;location.href='/dashboard.html'}}catch(err){toast(err.data?.error==='email_already_registered'?'Bu e-posta zaten kayıtlı.':'Kayıt oluşturulamadı.')}finally{if(btn)btn.disabled=false}
    },true);
  }

  function resetPage(){
    if(!path.endsWith('/reset-password.html'))return;
    const form=$('#resetPasswordForm'),q=new URLSearchParams(location.search),uid=q.get('uid')||'',token=q.get('token')||'';
    if(!uid||!token){$('#resetStatus').textContent='Şifre yenileme bağlantısı eksik veya geçersiz.';form?.querySelector('button')?.setAttribute('disabled','disabled');return}
    form?.addEventListener('submit',async e=>{
      e.preventDefault();const password=$('#newPassword')?.value||'',again=$('#newPasswordAgain')?.value||'';
      if(password!==again)return toast('Şifreler aynı değil.');if(password.length<10||!/[0-9]/.test(password))return toast('Şifre en az 10 karakter ve en az 1 rakam içermeli.');
      const btn=e.target.querySelector('button');if(btn)btn.disabled=true;
      try{await api('/api/auth/reset-password',{method:'POST',body:{userId:uid,token,newPassword:password}});location.href='/login.html?password=reset'}catch{toast('Bağlantı geçersiz veya süresi dolmuş.');if(btn)btn.disabled=false}
    });
  }

  loginEnhance();resetPage();
})();
