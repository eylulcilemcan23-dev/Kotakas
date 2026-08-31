(()=>{
  const isHome=['/','/index.html'].includes(location.pathname.toLowerCase());
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';

  function moveTrustBand(){
    if(!isHome)return;
    const promo=document.querySelector('.kp-promo-grid');
    const trust=document.querySelector('.kp-trust-band');
    if(!promo||!trust)return;
    trust.classList.add('kp-trust-compact');
    if(promo.nextElementSibling!==trust)promo.insertAdjacentElement('afterend',trust);
  }

  function addPopularCta(){
    if(!isHome)return;
    document.querySelectorAll('#kpPopularGames .kp-game-tile.k-cover').forEach(card=>{
      if(card.querySelector('.k-cover-cta'))return;
      const cta=document.createElement('span');
      cta.className='k-cover-cta';
      cta.textContent='Pazara Git →';
      card.appendChild(cta);
    });
  }

  async function addProfileBalance(){
    if(!window.ME||String(ME.role||'').startsWith('admin_'))return;
    const btn=document.querySelector('.kp-shell-main .k-profile-btn');
    const name=btn?.querySelector('.k-profile-name');
    if(!btn||!name)return;
    if(!name.querySelector('.k-profile-name-line')){
      const current=name.textContent.trim();
      name.textContent='';
      const line=document.createElement('span');line.className='k-profile-name-line';line.textContent=current;
      const bal=document.createElement('small');bal.className='k-profile-wallet-mini';bal.dataset.profileWallet='';bal.textContent='Bakiye: …';
      bal.title='Bakiye panelini aç';
      bal.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();
        if(typeof window.kOpenWallet==='function')window.kOpenWallet();
        else location.href='/wallet.html';
      });
      name.append(line,bal);
    }
    try{
      const d=await api('/api/wallet');
      document.querySelectorAll('[data-profile-wallet]').forEach(x=>x.textContent='Bakiye: '+money(d.balanceTry));
    }catch{}
  }

  function bootHome(){
    moveTrustBand();
    addPopularCta();
    if(!isHome)return;
    const target=document.getElementById('kpPopularGames');
    if(target){
      const mo=new MutationObserver(()=>addPopularCta());
      mo.observe(target,{childList:true,subtree:true});
      setTimeout(()=>mo.disconnect(),7000);
    }
  }

  setTimeout(bootHome,180);
  setTimeout(addProfileBalance,450);
  setTimeout(addProfileBalance,1200);
  setInterval(()=>{if(document.visibilityState==='visible')addProfileBalance()},20000);
})();
