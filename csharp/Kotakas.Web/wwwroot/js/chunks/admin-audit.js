(()=>{
  if(!location.pathname.toLowerCase().endsWith('/admin.html'))return;

  function bind(nav){if(nav.dataset.auditBound)return;nav.dataset.auditBound='1';nav.addEventListener('click',e=>{e.preventDefault();$$('.adminNav').forEach(x=>x.classList.remove('active'));nav.classList.add('active');$$('.adminPane').forEach(x=>x.style.display='none');const p=$('#pane-'+nav.dataset.pane);if(p)p.style.display='';if(nav.dataset.pane==='audit')loadAdminAudit()})}

  function ensurePane(){
    if(!ME||!(ME.role==='admin_owner'||ME.role==='admin_full'))return;
    const side=$('.sidebar'),host=$('#pane-users')?.parentElement;if(!side||!host)return;
    if(!side.querySelector('[data-pane="audit"]')){const a=document.createElement('a');a.className='adminNav';a.dataset.pane='audit';a.href='#';a.textContent='🧾 Admin İşlem Kayıtları';const security=side.querySelector('[data-pane="security"]');side.insertBefore(a,security||null)}
    if(!$('#pane-audit')){const pane=document.createElement('div');pane.id='pane-audit';pane.className='v5-card adminPane';pane.style.display='none';pane.innerHTML=`<div class="v5-card-head"><div><h3>🧾 Admin Audit Kayıtları</h3><p>Admin yazma işlemleri gövde içeriği kaydedilmeden izlenir.</p></div><div class="spacer"></div><button class="btn sm teal" onclick="loadAdminAudit()">Yenile</button></div><div class="grid3" style="margin-bottom:12px"><div class="field"><label>Endpoint / Admin ara</label><input id="auditQ" placeholder="wallets, disputes, admin ID..."></div><div class="field"><label>Method</label><select id="auditMethod"><option value="all">Tümü</option><option>POST</option><option>PATCH</option><option>PUT</option><option>DELETE</option></select></div><div class="field"><label>Kayıt</label><select id="auditLimit"><option>100</option><option selected>250</option><option>500</option></select></div></div><div class="actions" style="margin-bottom:12px"><button class="btn sm teal" onclick="loadAdminAudit()">Filtrele</button></div><div class="tablewrap"><table class="table"><thead><tr><th>Zaman</th><th>Admin</th><th>Method</th><th>Endpoint</th><th>Sonuç</th></tr></thead><tbody id="adminAuditRows"></tbody></table></div><div class="notice" style="margin-top:12px">Güvenlik için istek gövdeleri kaydedilmez; geçici şifre, ödeme veya kişisel form verileri audit log'a yazılmaz.</div>`;host.append(pane)}
    $$('.adminNav').forEach(bind);
  }

  window.loadAdminAudit=async()=>{const qs=new URLSearchParams({q:$('#auditQ')?.value||'',method:$('#auditMethod')?.value||'all',limit:$('#auditLimit')?.value||'250'});try{const d=await api('/api/admin/audit/?'+qs),rows=d.events||[],body=$('#adminAuditRows');if(!body)return;body.innerHTML=rows.length?rows.map(x=>`<tr><td>${formatDate(x.createdAt)}</td><td>${esc(x.adminName||'Admin')}<div class="meta">${esc(x.adminEmail||x.adminUserId||'')}</div></td><td><span class="pill ${x.method==='DELETE'?'red':x.method==='POST'?'green':'purple'}">${esc(x.method)}</span></td><td><code>${esc(x.path)}</code></td><td><span class="pill ${Number(x.statusCode)<400?'green':'red'}">${Number(x.statusCode)}</span></td></tr>`).join(''):'<tr><td colspan="5">Audit kaydı yok.</td></tr>'}catch{toast('Audit kayıtları yüklenemedi.')}};

  async function init(){if(!ME)await loadMe();if(!ME)return;ensurePane()}
  setTimeout(init,550);setTimeout(ensurePane,1200);
})();
