(()=>{
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const localPreview=['127.0.0.1','localhost','::1'].includes(location.hostname.toLowerCase());

  function ensureStyle(){
    if($('#walletHeaderStyle'))return;
    const s=document.createElement('style');s.id='walletHeaderStyle';s.textContent=`
      .wallet-nav-wrap{display:inline-flex;align-items:center;gap:6px;margin-right:8px;vertical-align:middle}
      .wallet-nav-balance,.wallet-nav-add{border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.045);color:inherit;padding:7px 10px;font:inherit;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
      .wallet-nav-balance{color:#dffefa}.wallet-nav-add{background:rgba(0,214,201,.14);border-color:rgba(0,214,201,.32);color:#56f5ea}
      .wallet-nav-balance:hover,.wallet-nav-add:hover{transform:translateY(-1px);border-color:rgba(0,214,201,.5)}
      .wallet-topup-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0}
      .wallet-topup-grid button{min-height:48px}
      .wallet-topup-note{padding:12px;border:1px solid rgba(0,214,201,.2);background:rgba(0,214,201,.055);border-radius:12px;font-size:12px;line-height:1.5;color:var(--muted,#9bb0ba)}
      @media(max-width:980px){.wallet-nav-balance{display:none}.wallet-nav-wrap{margin-right:2px}.wallet-nav-add{padding:7px 8px;font-size:11px}}
      @media(max-width:700px){.wallet-nav-wrap{display:none}}
    `;document.head.appendChild(s);
  }

  function ensureModal(){
    let modal=$('#walletTopupModal');if(modal)return modal;
    modal=document.createElement('div');modal.id='walletTopupModal';modal.className='modal';
    modal.innerHTML=`<div class="modalbox" style="max-width:430px"><div class="modalhead"><div><h3>💳 Bakiye Ekle</h3><div class="meta">KOTAKAS cüzdan bakiyesi</div></div><button class="x" onclick="closeWalletTopup()">✕</button></div><div id="walletTopupBody"></div></div>`;
    document.body.appendChild(modal);return modal;
  }

  function renderModal(){
    const body=$('#walletTopupBody');if(!body)return;
    if(localPreview){
      body.innerHTML=`<div class="wallet-topup-note"><strong style="color:#56f5ea">YEREL TEST MODU</strong><br>Bu para gerçek değildir. Sadece kullanıcı → emanet → pazarcı ödeme akışını test etmek için sanal bakiye ekler.</div><div class="wallet-topup-grid"><button class="btn ghost" onclick="addLocalWalletBalance(100)">+ 100 ₺</button><button class="btn ghost" onclick="addLocalWalletBalance(500)">+ 500 ₺</button><button class="btn teal" onclick="addLocalWalletBalance(1000)">+ 1.000 ₺</button><button class="btn teal" onclick="addLocalWalletBalance(5000)">+ 5.000 ₺</button></div><div class="field"><label>Özel tutar (10–5.000 ₺)</label><input id="walletCustomTopup" type="number" min="10" max="5000" step="10" placeholder="Örn. 2500"></div><button class="btn teal full" onclick="addLocalWalletBalance(Number($('#walletCustomTopup')?.value||0))">Sanal Bakiye Ekle</button>`;
    }else{
      body.innerHTML=`<div class="wallet-topup-note"><strong>Gerçek bakiye yükleme</strong><br>Ödeme sağlayıcısı ve canlı ortam ayarları tamamlandığında bu butondan kart/ödeme yöntemiyle bakiye yükleme açılacak. Şimdilik yalnız yerel önizlemede sanal bakiye kullanılabilir.</div>`;
    }
  }

  function injectHeader(){
    ensureStyle();
    $$('.navlinks [data-auth]').forEach(auth=>{
      if($('.wallet-nav-wrap',auth))return;
      const wrap=document.createElement('span');wrap.className='wallet-nav-wrap';
      wrap.innerHTML=`<button class="wallet-nav-balance" type="button" onclick="openWalletTopup()" title="KOTAKAS Bakiyesi">💳 <span data-header-wallet>0,00 ₺</span></button><button class="wallet-nav-add" type="button" onclick="openWalletTopup()">＋ Bakiye Ekle</button>`;
      auth.insertBefore(wrap,auth.firstChild);
    });
  }

  window.refreshHeaderWallet=async()=>{
    if(!ME||String(ME.role||'').startsWith('admin_'))return null;
    try{const d=await api('/api/wallet');$$('[data-header-wallet]').forEach(x=>x.textContent=money(d.balanceTry));return d}catch{return null}
  };
  window.openWalletTopup=()=>{const m=ensureModal();renderModal();m.classList.add('open')};
  window.closeWalletTopup=()=>$('#walletTopupModal')?.classList.remove('open');
  window.addLocalWalletBalance=async amount=>{
    amount=Number(amount||0);if(!Number.isFinite(amount)||amount<10||amount>5000)return toast('10 ₺ ile 5.000 ₺ arasında tutar gir.');
    try{
      const d=await api('/api/account/test-wallet-topup',{method:'POST',body:{amountTry:amount}});
      $$('[data-header-wallet]').forEach(x=>x.textContent=money(d.balanceTry));
      if($('#dashBalance'))$('#dashBalance').textContent=money(d.balanceTry);
      toast(`${money(amount)} sanal bakiye eklendi.`);closeWalletTopup();
    }catch(err){
      if(err.data?.error==='local_preview_only')toast('Sanal bakiye yalnız yerel önizlemede kullanılabilir.');
      else toast(err.data?.error||'Bakiye eklenemedi.');
    }
  };

  async function boot(){
    try{if(!ME&&typeof loadMe==='function')await loadMe();if(typeof updateNav==='function')updateNav()}catch{}
    if(!ME||String(ME.role||'').startsWith('admin_'))return;
    injectHeader();await refreshHeaderWallet();
    setInterval(()=>{if(document.visibilityState==='visible'&&!document.querySelector('.modal.open'))refreshHeaderWallet()},15000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshHeaderWallet()});
  }
  setTimeout(boot,120);
})();
