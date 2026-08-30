(()=>{
  const path=location.pathname.toLowerCase();
  if(!path.endsWith('/dashboard.html')&&!path.endsWith('/trader.html'))return;
  const money=n=>Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₺';
  const statusLabel=s=>({funded:'Emanet hazır • satıcı teslim edecek',seller_delivered:'Teslim bildirildi • alıcı onayı bekleniyor',disputed:'Anlaşmazlık • admin incelemesi'}[String(s||'').toLowerCase()]||s||'Devam ediyor');
  const sellerId=d=>d.flow==='request_offer'?d.userId:d.traderUserId;
  const buyerId=d=>d.flow==='request_offer'?d.traderUserId:d.userId;
  const isActive=d=>['funded','seller_delivered','disputed'].includes(String(d.status||'').toLowerCase());

  function actionHtml(d){
    const me=String(ME?.id||''),status=String(d.status||'').toLowerCase();
    if(status==='funded'&&String(sellerId(d))===me)return `<button class="btn teal" onclick="panelDealDelivered(${d.id})">✅ Itemi Teslim Ettim</button>`;
    if(status==='seller_delivered'&&String(buyerId(d))===me)return `<button class="btn teal" onclick="panelDealConfirm(${d.id})">✅ Teslim Aldım / Ödemeyi Bırak</button>`;
    if(status==='disputed')return '<a class="btn gold" href="/support.html">⚖️ Destek / Anlaşmazlık</a>';
    return '<a class="btn ghost" href="/deals.html">İşlem Detayı</a>';
  }

  async function render(){
    if(!ME&&typeof loadMe==='function')await loadMe();if(!ME)return;
    try{
      const d=await api('/api/deals'),rows=(d.deals||[]).filter(isActive);let root=$('#panelActiveDealCenter');
      if(!rows.length){root?.remove();return}
      const x=rows[0];
      if(!root){root=document.createElement('section');root.id='panelActiveDealCenter';root.className='v5-card';root.style.cssText='margin:0 0 14px;border-color:rgba(0,214,201,.3);background:linear-gradient(135deg,rgba(0,214,201,.07),rgba(92,70,200,.05))';const head=$('.v5-head');head?.insertAdjacentElement('afterend',root)}
      root.innerHTML=`<div class="v5-card-head"><div><h3>⚡ Aktif Güvenli İşlem${rows.length>1?` <span class="pill purple">+${rows.length-1}</span>`:''}</h3><p>İşlemi başka sayfa aramadan buradan ilerlet.</p></div><a class="btn ghost sm" href="/deals.html">Tüm İşlemler</a></div><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.serverCode)} • ${Number(x.priceGb||0).toLocaleString('tr-TR',{maximumFractionDigits:2})} GB • ${statusLabel(x.status)}</div></div><div class="spacer"></div><div style="text-align:right"><strong style="color:var(--teal);font-size:18px">${money(x.escrowTry||x.grossTry)}</strong><div class="meta">${Number(x.escrowTry||0)>0?'emanette':'işlem tutarı'}</div></div></div><div class="actions" style="margin-top:12px">${actionHtml(x)}${String(x.status||'').toLowerCase()!=='disputed'?`<button class="btn red" onclick="panelDealDispute(${x.id})">Sorun Bildir</button>`:''}</div>`;
    }catch{}
  }

  window.panelDealDelivered=async id=>{if(!confirm('Itemi oyunda teslim ettiğini onaylıyor musun?'))return;try{await api(`/api/deals/${id}/delivered`,{method:'POST'});toast('Teslim bildirimi gönderildi. Alıcı onayı bekleniyor.');await render()}catch{toast('Teslim bildirimi yapılamadı.')}};
  window.panelDealConfirm=async id=>{if(!confirm('Itemi teslim aldın mı? Onaydan sonra emanet satıcıya aktarılır.'))return;try{const d=await api(`/api/deals/${id}/confirm`,{method:'POST'});toast(`İşlem tamamlandı. ${money(d.deal?.sellerNetTry||0)} satıcı bakiyesine aktarıldı.`);if(typeof refreshHeaderWallet==='function')refreshHeaderWallet();await render()}catch{toast('Teslim onayı yapılamadı.')}};
  window.panelDealDispute=async id=>{if(!confirm('Bu işlem için anlaşmazlık açılsın mı? Emanet para admin incelemesine kadar tutulur.'))return;try{await api(`/api/deals/${id}/dispute`,{method:'POST'});toast('Anlaşmazlık açıldı ve emanet korumaya alındı.');await render()}catch{toast('Anlaşmazlık açılamadı.')}};

  setTimeout(render,650);setTimeout(render,1500);
  window.refreshPanelActiveDeals=render;
})();
