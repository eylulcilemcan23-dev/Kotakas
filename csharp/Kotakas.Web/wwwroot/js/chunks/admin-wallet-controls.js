(()=>{
  const isAdminFinance=()=>location.pathname.toLowerCase().endsWith('/admin.html')&&(ME?.role==='admin_owner'||ME?.role==='admin_full');
  const parseTry=text=>{
    const s=String(text||'').replace(/[^0-9,.-]/g,'').trim();
    if(!s)return 0;
    const normalized=s.includes(',')?s.replace(/\./g,'').replace(',','.') : s;
    const n=Number(normalized);
    return Number.isFinite(n)?n:0;
  };
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const amountPrompt=(title,initial='')=>{
    const raw=prompt(title,initial);
    if(raw===null)return null;
    const n=Number(String(raw).trim().replace(/\./g,'').replace(',','.'));
    return Number.isFinite(n)?n:NaN;
  };

  function decorate(){
    if(!isAdminFinance())return;
    const body=document.querySelector('#adminWallets');
    if(!body)return;
    body.querySelectorAll('tr').forEach(row=>{
      if(row.querySelector('.walletAdminControls'))return;
      const legacy=row.querySelector('.walletAdjust');
      if(!legacy)return;
      const cell=legacy.closest('td');
      if(!cell)return;
      const id=legacy.dataset.id||'';
      const name=legacy.dataset.name||row.children[0]?.textContent?.trim()||'Kullanıcı';
      legacy.remove();
      const wrap=document.createElement('div');
      wrap.className='walletAdminControls';
      wrap.style.cssText='display:flex;gap:6px;flex-wrap:wrap;min-width:300px';
      wrap.innerHTML=`<button class="btn sm green walletAdminAction" data-action="add" data-id="${id}" data-name="${esc(name)}">+ Ekle</button><button class="btn sm ghost walletAdminAction" data-action="subtract" data-id="${id}" data-name="${esc(name)}">− Düş</button><button class="btn sm teal walletAdminAction" data-action="set" data-id="${id}" data-name="${esc(name)}">Ayarla</button><button class="btn sm red walletAdminAction" data-action="zero" data-id="${id}" data-name="${esc(name)}">Sıfırla</button>`;
      cell.appendChild(wrap);
    });
  }

  async function applyChange(btn){
    const row=btn.closest('tr');
    const balanceCell=row?.children?.[2];
    const current=parseTry(balanceCell?.textContent);
    const name=btn.dataset.name||'Kullanıcı';
    const action=btn.dataset.action;
    let delta=0;
    let reason='Admin bakiye işlemi';

    if(action==='add'){
      const amount=amountPrompt(`${name} için eklenecek bakiye (₺):`);
      if(amount===null)return;
      if(!Number.isFinite(amount)||amount<=0)return toast('0’dan büyük geçerli bir tutar gir.');
      delta=amount;
      reason=prompt('İşlem nedeni:','Admin bakiye ekleme')||'Admin bakiye ekleme';
    }else if(action==='subtract'){
      const amount=amountPrompt(`${name} bakiyesinden düşülecek tutar (₺):`);
      if(amount===null)return;
      if(!Number.isFinite(amount)||amount<=0)return toast('0’dan büyük geçerli bir tutar gir.');
      if(amount>current)return toast('Kullanıcının bakiyesi bu tutardan düşük.');
      delta=-amount;
      reason=prompt('İşlem nedeni:','Admin bakiye düşme')||'Admin bakiye düşme';
    }else if(action==='set'){
      const target=amountPrompt(`${name} yeni bakiyesi kaç ₺ olsun?`,String(current).replace('.',','));
      if(target===null)return;
      if(!Number.isFinite(target)||target<0)return toast('Bakiye 0 veya daha büyük olmalı.');
      delta=target-current;
      if(Math.abs(delta)<0.005)return toast('Bakiye zaten bu tutarda.');
      reason=prompt('İşlem nedeni:','Admin bakiye ayarlama')||'Admin bakiye ayarlama';
    }else if(action==='zero'){
      if(current<=0)return toast('Bakiye zaten 0 ₺.');
      if(!confirm(`${name} bakiyesi ${money(current)}. Bakiyeyi 0 ₺ yapmak istiyor musun?\n\nHareket kaydı silinmez; güvenlik için işlem geçmişinde kalır.`))return;
      delta=-current;
      reason='Admin bakiye sıfırlama';
    }else return;

    try{
      btn.disabled=true;
      const result=await api(`/api/admin/wallets/${btn.dataset.id}/adjust`,{method:'POST',body:{amountTry:delta,reason}});
      if(balanceCell)balanceCell.textContent=money(result.balanceTry);
      toast(action==='zero'?'Bakiye sıfırlandı.':'Bakiye güncellendi.');
      setTimeout(()=>location.reload(),450);
    }catch(err){
      toast(err?.data?.error==='insufficient_balance'?'Yetersiz bakiye.':(err?.data?.error||'Bakiye işlemi başarısız.'));
      btn.disabled=false;
    }
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('.walletAdminAction');
    if(!btn)return;
    e.preventDefault();
    e.stopPropagation();
    applyChange(btn);
  });

  const observer=new MutationObserver(decorate);
  const start=()=>{
    if(!isAdminFinance())return;
    const body=document.querySelector('#adminWallets');
    if(body)observer.observe(body,{childList:true,subtree:true});
    decorate();
  };
  setTimeout(start,250);
  setTimeout(decorate,700);
  setTimeout(decorate,1400);
})();
