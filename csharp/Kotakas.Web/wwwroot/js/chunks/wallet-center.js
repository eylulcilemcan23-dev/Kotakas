(()=>{
  if(!location.pathname.toLowerCase().endsWith('/wallet.html'))return;
  const localPreview=['127.0.0.1','localhost','::1'].includes(location.hostname.toLowerCase());
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const date=v=>{try{return typeof formatDate==='function'?formatDate(v):new Date(v).toLocaleString('tr-TR')}catch{return ''}};
  const typeLabel=t=>({
    admin_adjustment:'Admin bakiye işlemi',local_test_topup:'Sanal bakiye yükleme',local_test_withdrawal:'Sanal bakiye çekim',paid_sale_request:'Ücretli satış talebi',
    escrow_fund:'Emanet fonu',listing_escrow_fund:'İlan emanet fonu',escrow_refund:'Emanet iadesi',listing_refund:'İlan iadesi',
    escrow_release:'Satış ödemesi',settlement_release:'Satış ödemesi',listing_settlement_release:'İlan satış ödemesi',dispute_refund:'Anlaşmazlık iadesi',dispute_release:'Anlaşmazlık ödemesi'
  }[t]||t||'Bakiye hareketi');
  let entries=[];
  let filter='all';

  const activeDeal=x=>['funded','seller_delivered','disputed'].includes(String(x.status||'').toLowerCase());
  const inFilter=x=>filter==='all'||(filter==='in'&&Number(x.amountTry)>=0)||(filter==='out'&&Number(x.amountTry)<0)||(filter==='escrow'&&String(x.type||'').toLowerCase().includes('escrow'));

  function renderLedger(){
    const root=$('#walletLedger');if(!root)return;
    const rows=entries.filter(inFilter);
    if(!rows.length){root.innerHTML='<div class="empty">Bu filtrede bakiye hareketi yok.</div>';return}
    root.innerHTML=`<div class="tablewrap"><table class="table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Önce</th><th>Sonra</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${date(x.createdAt)}</td><td><strong>${esc(typeLabel(x.type))}</strong><div class="meta">${esc(x.reason||'')}</div></td><td style="font-weight:900;${Number(x.amountTry)>=0?'color:#78efb0':'color:#ff9b9b'}">${Number(x.amountTry)>=0?'+':''}${money(x.amountTry)}</td><td>${money(x.beforeTry)}</td><td>${money(x.afterTry)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderWithdraw(balance){
    const box=$('#walletWithdrawBox');if(!box)return;
    if(localPreview){
      box.innerHTML=`<div class="notice" style="margin:0 0 12px"><strong>YEREL TEST MODU</strong><br>Bu işlem gerçek banka transferi yapmaz; sadece çekim sonrası bakiye ve hareket kaydını test eder.</div><form id="walletWithdrawForm" onsubmit="walletTestWithdraw(event)"><div class="field"><label>Çekilecek sanal tutar</label><input name="amountTry" type="number" min="10" max="5000" step="10" placeholder="Örn. 500" required></div><div class="meta" style="margin-bottom:10px">Kullanılabilir bakiye: <strong>${money(balance)}</strong></div><button class="btn ghost full">− Sanal Bakiye Çek</button></form>`;
    }else{
      box.innerHTML='<div class="empty">Gerçek bakiye çekimi ödeme sağlayıcısı ve banka/IBAN doğrulaması tamamlandığında açılacak. Şimdilik para çekimi kapalıdır.</div>';
    }
  }

  window.walletTestWithdraw=async e=>{
    e.preventDefault();
    const amount=Number(new FormData(e.target).get('amountTry')||0);
    if(!Number.isFinite(amount)||amount<10||amount>5000)return toast('10 ₺ ile 5.000 ₺ arasında tutar gir.');
    if(!confirm(`${money(amount)} sanal bakiye çekilsin mi?`))return;
    try{
      const d=await api('/api/account/test-wallet-withdraw',{method:'POST',body:{amountTry:amount}});
      toast(`${money(d.withdrawnTry)} sanal çekim tamamlandı.`);
      if(typeof refreshHeaderWallet==='function')refreshHeaderWallet();
      await loadWalletCenter();
    }catch(err){
      const code=err.data?.error;
      if(code==='wallet_balance_insufficient')toast(`Bakiye yetersiz. Mevcut: ${money(err.data?.balanceTry)}`);
      else if(code==='local_preview_only')toast('Sanal çekim yalnız yerel önizlemede çalışır.');
      else toast('Bakiye çekilemedi.');
    }
  };

  window.loadWalletCenter=async()=>{
    try{
      if(!ME&&typeof loadMe==='function')await loadMe();
      if(!ME){location.href='/login.html?returnUrl=%2Fwallet.html';return}
      if(String(ME.role||'').startsWith('admin_')){location.href='/admin.html';return}
      const [w,h,d]=await Promise.all([api('/api/wallet'),api('/api/wallet/history?take=100'),api('/api/deals').catch(()=>({deals:[]}))]);
      entries=h.entries||[];
      const deals=d.deals||[];
      const active=deals.filter(activeDeal);
      const activeEscrow=active.reduce((sum,x)=>sum+Number(x.escrowTry||0),0);
      const completed=deals.filter(x=>String(x.status||'').toLowerCase()==='completed').length;
      const since=Date.now()-30*24*60*60*1000;
      const net30=entries.filter(x=>new Date(x.createdAt).getTime()>=since).reduce((sum,x)=>sum+Number(x.amountTry||0),0);
      const summary=$('#walletCenterSummary');
      if(summary)summary.innerHTML=`<div class="v5-stat green"><div class="top"><span>Kullanılabilir Bakiye</span></div><strong>${money(w.balanceTry)}</strong><span>Alım veya çekim için kullanılabilir</span></div><div class="v5-stat purple"><div class="top"><span>Aktif Emanet</span></div><strong>${money(activeEscrow)}</strong><span>${active.length} devam eden güvenli işlem</span></div><div class="v5-stat gold"><div class="top"><span>30 Gün Net Hareket</span></div><strong>${net30>=0?'+':''}${money(net30)}</strong><span>Giriş ve çıkışların toplamı</span></div><div class="v5-stat"><div class="top"><span>Tamamlanan İşlem</span></div><strong>${completed}</strong><span>Güvenle kapanan işlemler</span></div>`;
      renderWithdraw(Number(w.balanceTry||0));renderLedger();
    }catch(err){
      $('#walletLedger').innerHTML='<div class="empty">Cüzdan bilgileri yüklenemedi.</div>';toast('Cüzdan bilgileri alınamadı.');
    }
  };

  function bind(){
    $('#walletLedgerFilters')?.addEventListener('click',e=>{
      const b=e.target.closest('[data-wallet-filter]');if(!b)return;
      filter=b.dataset.walletFilter||'all';
      $$('#walletLedgerFilters [data-wallet-filter]').forEach(x=>{x.classList.toggle('teal',x===b);x.classList.toggle('ghost',x!==b)});
      renderLedger();
    });
  }
  setTimeout(()=>{bind();loadWalletCenter()},500);
})();
