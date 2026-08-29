(()=>{
  const path=location.pathname.toLowerCase();
  $$('[data-user-name]').forEach(x=>{if(/demo|zeromarket/i.test(x.textContent||''))x.textContent='Hesabım'});
  $$('a[href$="support.html"],.support-fab').forEach(a=>{if(/canlı destek/i.test(a.textContent||''))a.textContent=a.classList.contains('support-fab')?'💬 Destek':'Destek Merkezi'});

  if(path.endsWith('/trader.html')){
    const profile=$('.v5-profilebar div:nth-child(2) span');if(profile)profile.textContent='Pazarcı performansı gerçek verilerden yükleniyor...';
    const status=$('.v5-profilebar .v5-status');if(status)status.textContent='● DURUM YÜKLENİYOR';
    const toggle=$('#onlineToggle');if(toggle)toggle.classList.remove('on');
    if($('#onlineText'))$('#onlineText').textContent='Teklif durumu yükleniyor...';
    const sub=$('.trader-toolbar div:nth-child(2) span');if(sub)sub.textContent='Kayıtlı pazarcı tercihin sunucudan okunuyor.';
    $$('.v5-mini').forEach(card=>{
      const label=card.querySelector('span'),strong=card.querySelector('strong');if(!label||!strong)return;
      if(label.textContent.includes('Pazarcı puanı')){strong.textContent='—';label.textContent='Gerçek pazarcı puanı'}
      else if(label.textContent.includes('Ortalama cevap')){strong.textContent='—';label.textContent='Gerçek ilk teklif süresi'}
      else if(label.textContent.includes('Başarılı işlem')){strong.textContent='—';label.textContent='Gerçek işlem başarı oranı'}
    });
  }
})();
