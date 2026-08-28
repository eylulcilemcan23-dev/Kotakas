(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  let config = null;

  const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  async function getConfig() {
    if (config) return config;
    try {
      const response = await fetch('/api/public-config', { headers: { Accept: 'application/json' } });
      config = response.ok ? await response.json() : {};
    } catch {
      config = {};
    }
    return config;
  }

  function page(content) {
    const main = document.querySelector('main.main');
    if (main) main.innerHTML = content;
  }

  function authCard(title, body) {
    return `<div class="auth-wrap"><section class="auth-card"><h1>${esc(title)}</h1>${body}</section></div>`;
  }

  async function renderRegister() {
    const cfg = await getConfig();
    const ready = Boolean(cfg.registrationEnabled && cfg.userWritesEnabled);
    const google = cfg.googleEnabled ? '<a class="google-btn" href="/auth/google">Google ile devam et</a><div class="divider">veya</div>' : '';
    const status = ready ? '' : '<div class="notice">Yeni üyelik, staging veritabanı şeması doğrulanana kadar güvenlik için kapalı.</div>';
    page(authCard('Hesap Oluştur', `${status}${google}<form class="form" id="registerForm"><div class="field"><label>Ad / kullanıcı adı</label><input name="name" maxlength="120" autocomplete="name"></div><div class="field"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Şifre</label><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><div class="field"><label>Şifre tekrar</label><input name="password2" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><button class="btn primary" type="submit" ${ready ? '' : 'disabled'}>Kayıt Ol</button></form><p style="color:var(--muted);font-size:13px;margin-top:18px">Zaten hesabın var mı? <a href="/login.html">Giriş yap</a></p>`));

    document.querySelector('#registerForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ready) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      if (data.get('password') !== data.get('password2')) return alert('Şifreler aynı değil.');
      const submit = form.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const response = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name: data.get('name'), email: data.get('email'), password: data.get('password') }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'registration_failed');
        location.href = '/dashboard.html';
      } catch (error) {
        const message = error.message === 'email_already_registered' ? 'Bu e-posta zaten kayıtlı.' : 'Kayıt şu anda tamamlanamadı.';
        alert(message);
      } finally {
        if (submit) submit.disabled = false;
      }
    });
  }

  async function renderForgot() {
    const cfg = await getConfig();
    const ready = Boolean(cfg.passwordResetReady);
    const note = ready
      ? '<div class="sub">E-posta adresine tek kullanımlık sıfırlama bağlantısı gönderilecek.</div>'
      : '<div class="notice">Şifre sıfırlama e-posta teslim sistemi hazırlanıyor. Canlı hesaplara henüz dokunulmuyor.</div>';
    page(authCard('Şifremi Unuttum', `${note}<form class="form" id="forgotForm"><div class="field"><label>E-posta</label><input name="email" type="email" autocomplete="email" required></div><button class="btn primary" type="submit" ${ready ? '' : 'disabled'}>Sıfırlama Bağlantısı Gönder</button></form><p style="color:var(--muted);font-size:13px;margin-top:18px"><a href="/login.html">Giriş ekranına dön</a></p>`));
    document.querySelector('#forgotForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ready) return;
      const data = new FormData(event.currentTarget);
      await fetch('/api/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email') }),
      });
      alert('Eğer bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi.');
    });
  }

  async function renderReset() {
    const cfg = await getConfig();
    const token = new URLSearchParams(location.search).get('token') || '';
    const ready = Boolean(cfg.passwordResetReady && token);
    const note = ready ? '' : '<div class="notice">Bu sıfırlama bağlantısı şu anda kullanılamıyor veya sistem henüz aktif değil.</div>';
    page(authCard('Yeni Şifre Belirle', `${note}<form class="form" id="resetForm"><div class="field"><label>Yeni şifre</label><input name="password" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><div class="field"><label>Yeni şifre tekrar</label><input name="password2" type="password" minlength="10" maxlength="128" autocomplete="new-password" required></div><button class="btn primary" type="submit" ${ready ? '' : 'disabled'}>Şifreyi Güncelle</button></form><p style="color:var(--muted);font-size:13px;margin-top:18px"><a href="/login.html">Giriş ekranına dön</a></p>`));
    document.querySelector('#resetForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ready) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      if (data.get('password') !== data.get('password2')) return alert('Şifreler aynı değil.');
      const response = await fetch('/api/password-reset/confirm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: data.get('password') }),
      });
      if (!response.ok) return alert('Şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.');
      alert('Şifren güncellendi. Şimdi giriş yapabilirsin.');
      location.href = '/login.html';
    });
  }

  function addForgotLink() {
    if (path !== '/login.html') return;
    const card = document.querySelector('.auth-card');
    if (!card || card.querySelector('[data-forgot-link]')) return;
    const p = document.createElement('p');
    p.dataset.forgotLink = '1';
    p.style.cssText = 'color:var(--muted);font-size:13px;margin-top:10px';
    p.innerHTML = '<a href="/forgot-password.html">Şifremi unuttum</a>';
    card.appendChild(p);
  }

  const observer = new MutationObserver(() => {
    if (path === '/login.html') addForgotLink();
  });

  window.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
    setTimeout(async () => {
      if (path === '/register.html') await renderRegister();
      else if (path === '/forgot-password.html') await renderForgot();
      else if (path === '/reset-password.html') await renderReset();
      else if (path === '/login.html') addForgotLink();
    }, 50);
  });
})();
