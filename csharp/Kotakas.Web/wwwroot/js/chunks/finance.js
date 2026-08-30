(()=>{
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const typeLabel=t=>({admin_adjustment:'Admin bakiye işlemi',local_test_topup:'Sanal bakiye yükleme',local_test_withdrawal:'Sanal bakiye çekim',paid_sale_request:'Ücretli ilan',escrow_fund:'Emanet fonu',listing_escrow_fund:'İlan emanet fonu',escrow_refund:'Emanet iadesi',listing_refund:'İlan iadesi',escrow_release:'Satış ödemesi',settlement_release:'Satış ödemesi',listing_settlement_release:'İlan satış ödemesi',dispute_refund:'Anlaşmazlık iadesi',dispute_release:'Anlaşmazlık ödemesi'}[t]||t||'Bakiye hareketi');

  function ledgerHtml(entries,empty='Henüz bakiye hareketi yok.'){
    if(!entries?.length)return `<div class="empty">${empty}</div>`;
    return `<div class="tablewrap"><table class="table"><thead><tr><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Bakiye</th></tr></thead><tbody>${entries.map(x=>`<tr><td>${formatDate(x.createdAt)}</td><td><strong>${esc(typeLabel(x.type))}</strong><div class="meta">${esc(x.reason||'')}</div></td><td style="font-weight:900;${Number(x.amountTry)>=0?'color:#78efb0':'color:#ff9b9b'}">${Number(x.amountTry)>=0?'+':''}${money(x.amountTry)}</td><td>${money(x.afterTry)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  async function enhanceUserFinance(){
    if(!ME)return;
    try{
      const h=await api('/api/wallet/history?take=30');
      if(location.pathname.toLowerCase().endsWith('/dashboard.html')){
        let card=$('#walletHistoryCard');if(!card){card=document.createElement('div');card.id='walletHistoryCard';card.className='v5-card';card.style.marginTop='14px';const layout=$('.v5-layout');layout?.parentNode?.insertBefore(card,layout.nextSibling)}
        if(card)card.innerHTML=`<div class="v5-card-head"><div><h3>Bakiye hareketlerim</h3><p>Her para girişi/çıkışı kayıt altında tutulur.</p></div><a class="btn ghost sm" href="/wallet.html">Cüzdan Merkezi</a></div>${ledgerHtml(h.entries)}`;
      }
      if(location.pathname.toLowerCase().endsWith('/trader.html')){
        const w=await api('/api/wallet');let card=$('#traderWalletHistoryCard');if(!card){card=document.createElement('div');card.id='traderWalletHistoryCard';card.className='v5-card';card.style.marginTop='14px';const offer=$('#myOffers')?.closest('.v5-card');offer?.parentNode?.insertBefore(card,offer)}
        if(card)card.innerHTML=`<div class="v5-card-head"><div><h3>Pazarcı bakiyesi</h3><p>Satış, emanet ve admin bakiye hareketlerin.</p></div><div class="spacer"></div><strong style="font-size:24px;color:var(--teal)">${money(w.balanceTry)}</strong><a class="btn ghost sm" href="/wallet.html">Cüzdan</a></div>${ledgerHtml((h.entries||[]).slice(0,15))}`;
      }
    }catch{}
  }

  async function enhanceAdminFinance(){
    if(!ME||(ME.role!=='admin_owner'&&ME.role!=='admin_full')||!location.pathname.toLowerCase().endsWith('/admin.html'))return;
    try{
      const [s,l]=await Promise.all([api('/api/admin/finance/summary'),api('/api/admin/finance/ledger?take=250')]);
      const pane=$('#pane-finance');if(!pane)return;
      let summary=$('#adminFinanceSummary');if(!summary){summary=document.createElement('div');summary.id='adminFinanceSummary';pane.querySelector('.v5-card-head')?.insertAdjacentElement('afterend',summary)}
      summary.innerHTML=`<div class="v5-statgrid" style="margin:12px 0"><div class="v5-stat green"><div class="top"><span>İşlem Hacmi</span></div><strong>${money(s.completedVolumeTry)}</strong><span>${s.completedDeals||0} tamamlanan işlem</span></div><div class="v5-stat gold"><div class="top"><span>Platform Komisyonu</span></div><strong>${money(s.platformCommissionTry)}</strong><span>Tamamlanan işlemler</span></div><div class="v5-stat purple"><div class="top"><span>Aktif Emanet</span></div><strong>${money(s.activeEscrowTry)}</strong><span>Henüz sonuçlanmayan para</span></div><div class="v5-stat"><div class="top"><span>Kullanıcı Bakiyeleri</span></div><strong>${money(s.userWalletTotalTry)}</strong><span>${s.disputedDeals||0} anlaşmazlık</span></div></div>`;
      let ledger=$('#adminFinanceLedger');if(!ledger){ledger=document.createElement('div');ledger.id='adminFinanceLedger';ledger.style.marginTop='18px';pane.append(ledger)}
      const entries=l.entries||[];ledger.innerHTML=`<div class="v5-card-head"><div><h3>Son bakiye hareketleri</h3><p>Admin işlemleri, emanet, iade ve satış ödemeleri.</p></div></div>${entries.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Kullanıcı</th><th>Tarih</th><th>İşlem</th><th>Tutar</th><th>Son Bakiye</th></tr></thead><tbody>${entries.map(x=>`<tr><td><strong>${esc(x.user)}</strong><div class="meta">${esc(x.email||'')}</div></td><td>${formatDate(x.createdAt)}</td><td>${esc(typeLabel(x.type))}<div class="meta">${esc(x.reason||'')}</div></td><td style="font-weight:900;${Number(x.amountTry)>=0?'color:#78efb0':'color:#ff9b9b'}">${Number(x.amountTry)>=0?'+':''}${money(x.amountTry)}</td><td>${money(x.afterTry)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Henüz finans hareketi yok.</div>'}`;
    }catch{}
  }

  setTimeout(()=>{enhanceUserFinance();enhanceAdminFinance()},500);
  setTimeout(()=>{enhanceUserFinance();enhanceAdminFinance()},1100);
})();
