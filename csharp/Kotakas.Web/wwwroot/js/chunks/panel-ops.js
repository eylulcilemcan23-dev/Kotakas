(()=>{
  const path=location.pathname.toLowerCase();
  const safe=(url,fallback={})=>api(url).catch(()=>fallback);
  const ageHours=v=>{
    const t=new Date(v||0).getTime();
    return Number.isFinite(t)&&t>0?Math.max(0,(Date.now()-t)/3600000):0;
  };
  const fmtAge=h=>h<1?`${Math.max(1,Math.round(h*60))} dk`:h<24?`${Math.round(h)} saat`:`${Math.floor(h/24)} gün ${Math.round(h%24)} saat`;
  const mini=(icon,title,body,action='',kind='')=>`<div class="v5-mini ${kind}" style="align-items:flex-start"><div class="micon">${icon}</div><div style="flex:1"><strong>${esc(title)}</strong><span>${body}</span>${action?`<div class="actions" style="margin-top:8px">${action}</div>`:''}</div></div>`;

  window.quickTraderStock=async(id,current,delta)=>{
    const next=Math.max(0,Number(current||0)+Number(delta||0));
    try{
      await api(`/api/listings/${Number(id)}`,{method:'PATCH',body:{stock:next}});
      toast(next===0?'Stok 0 oldu; ilan tükendi durumuna geçti.':`Stok ${next} olarak güncellendi.`);
      setTimeout(()=>location.reload(),260);
    }catch(err){toast(err.data?.error==='invalid_listing_update'?'Stok değeri geçersiz.':'Stok güncellenemedi.')}
  };

  window.quickTraderPrice=async(id,current)=>{
    const raw=prompt('Yeni SELL fiyatı (GB):',Number(current||0));
    if(raw===null)return;
    const price=Number(String(raw).replace(',','.'));
    if(!Number.isFinite(price)||price<=0)return toast('Geçerli bir GB fiyatı gir.');
    try{
      await api(`/api/listings/${Number(id)}`,{method:'PATCH',body:{priceGb:price}});
      toast('SELL fiyatı güncellendi ve fiyat geçmişine işlendi.');
      setTimeout(()=>location.reload(),260);
    }catch{toast('Fiyat güncellenemedi.')}
  };

  async function decorateTraderTable(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader')return;
    const table=$('#myTraderListingsCard tbody');
    if(!table)return;
    const d=await safe('/api/listings/mine',{listings:[]}),listings=d.listings||[],rows=$$('tr',table);
    listings.forEach((x,i)=>{
      const tr=rows[i];if(!tr)return;
      const cells=$$('td',tr);if(cells.length<5)return;
      const stock=Number(x.stock||0),status=String(x.status||'');
      if(!cells[2].querySelector('.ops-stock-mark')){
        cells[2].innerHTML=`<span class="ops-stock-mark">${stock}${status!=='cancelled'&&stock<=2?` <span class="pill ${stock<=1?'red':'gold'}">${stock<=0?'TÜKENDİ':stock===1?'KRİTİK':'AZ'}</span>`:''}</span>`;
      }
      const actionCell=cells[4];
      if(status==='cancelled'||actionCell.querySelector('.ops-fast-stock'))return;
      const fast=document.createElement('div');fast.className='actions ops-fast-stock';fast.style.cssText='margin-bottom:7px;gap:5px;flex-wrap:wrap';
      fast.innerHTML=`<button class="btn sm ghost" onclick="quickTraderStock(${Number(x.id)},${stock},-1)" ${stock<=0?'disabled':''}>−1 Stok</button><button class="btn sm teal" onclick="quickTraderStock(${Number(x.id)},${stock},1)">＋1 Stok</button><button class="btn sm ghost" onclick="quickTraderPrice(${Number(x.id)},${Number(x.priceGb||0)})">💰 Fiyat</button>`;
      actionCell.prepend(fast);
    });
  }

  async function decorateTraderOffers(){
    if(!path.endsWith('/trader.html')||!ME||ME.role!=='trader')return;
    const box=$('#listingNegotiationRows'),head=$('#listingNegotiations .v5-card-head');
    if(!box||!head)return;
    const d=await safe('/api/listing-price-offers/mine',{offers:[]}),offers=(d.offers||[]).filter(x=>x.role==='seller'),cards=$$('.listitem',box);
    const pending=offers.filter(x=>x.status==='pending'&&new Date(x.expiresAt).getTime()>Date.now());
    let badge=$('#opsOfferSummary',head);
    if(!badge){badge=document.createElement('span');badge.id='opsOfferSummary';badge.className='pill gold';head.append(badge)}
    const badgeText=`${pending.length} BEKLEYEN`;
    if(badge.textContent!==badgeText)badge.textContent=badgeText;
    offers.forEach((o,i)=>{
      const card=cards[i];if(!card||card.querySelector('.ops-offer-timer'))return;
      const left=Math.max(0,(new Date(o.expiresAt).getTime()-Date.now())/60000);
      const timer=document.createElement('div');timer.className='meta ops-offer-timer';timer.style.marginTop='7px';
      if(o.status==='pending')timer.innerHTML=left>0?`⏱ Teklifin yanıt süresi: <strong>${Math.ceil(left)} dk</strong>`:'⛔ Teklif süresi doldu.';
      else if(o.status==='accepted')timer.innerHTML=left>0?`✅ Kabul edildi • alıcının satın alma süresi yaklaşık <strong>${Math.ceil(left)} dk</strong>`:'⌛ Kabul süresi dolmuş olabilir.';
      else timer.textContent=`Durum: ${String(o.status||'').toUpperCase()}`;
      card.append(timer);
    });
  }

  async function userReviewFollowups(){
    if(!path.endsWith('/dashboard.html')||!ME||ME.role!=='user'||$('#userReviewFollowups'))return;
    const d=await safe('/api/deals',{deals:[]}),completed=(d.deals||[]).filter(x=>x.status==='completed').slice(0,8);
    if(!completed.length)return;
    const checks=await Promise.all(completed.map(async deal=>({deal,status:await safe(`/api/deals/${Number(deal.id)}/review-status`,{canReview:false})})));
    const waiting=checks.filter(x=>x.status?.canReview).slice(0,4);
    if(!waiting.length)return;
    const node=document.createElement('section');node.id='userReviewFollowups';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`<div class="v5-card-head"><div><h3>⭐ Değerlendirme Bekleyen İşlemler</h3><p>Tamamlanan gerçek işlemleri puanlamak pazarcı güven sistemini güçlendirir.</p></div><div class="spacer"></div><span class="pill gold">${waiting.length} BEKLİYOR</span></div><div class="v5-mini-list">${waiting.map(x=>mini('⭐',`#${Number(x.deal.id)} ${x.deal.itemName||'İşlem'}`,`${esc(x.deal.serverCode||'')} • tamamlandı`,`<a class="btn sm teal" href="/deals.html?id=${Number(x.deal.id)}">Değerlendir</a>`,'gold')).join('')}</div>`;
    const anchor=$('#userProCenter')||$('#userLevelCenter')||$('#userCommandCenter');
    if(anchor?.parentNode)anchor.parentNode.insertBefore(node,anchor.nextSibling);
  }

  async function adminResponseAging(){
    if(!path.endsWith('/admin.html')||!ME||!String(ME.role).startsWith('admin_')||$('#adminResponseAging'))return;
    const d=await safe('/api/admin/support-center/tickets',{tickets:[]}),open=(d.tickets||[]).filter(x=>x.status!=='closed').map(x=>({...x,wait:ageHours(x.updatedAt||x.createdAt)}));
    open.sort((a,b)=>{
      const pa=String(a.priority).toLowerCase()==='high'?1:0,pb=String(b.priority).toLowerCase()==='high'?1:0;
      return pb-pa||b.wait-a.wait;
    });
    const over8=open.filter(x=>x.wait>=8).length,over24=open.filter(x=>x.wait>=24).length,high=open.filter(x=>String(x.priority).toLowerCase()==='high').length,oldest=open[0]?.wait||0;
    const node=document.createElement('section');node.id='adminResponseAging';node.className='v5-card';node.style.marginTop='14px';
    node.innerHTML=`<div class="v5-card-head"><div><h3>⏱ Destek Yanıt Süresi Takibi</h3><p>Bu göstergeler resmi SLA değil; uzun bekleyen kayıtları operasyonel olarak öne çıkarır.</p></div><div class="spacer"></div><button class="btn sm ghost" onclick="panelOpenAdminPane('support')">Destek Merkezini Aç</button></div><div class="v5-statgrid"><div class="v5-stat ${over24?'gold':'green'}"><div class="top"><div class="ico">24H</div><span>24+ Saat</span></div><strong>${over24}</strong><span>çok uzun bekleyen</span></div><div class="v5-stat ${over8?'gold':'green'}"><div class="top"><div class="ico">8H</div><span>8+ Saat</span></div><strong>${over8}</strong><span>dikkat gerektiren</span></div><div class="v5-stat purple"><div class="top"><div class="ico">!</div><span>Yüksek Öncelik</span></div><strong>${high}</strong><span>açık kayıt</span></div><div class="v5-stat purple"><div class="top"><div class="ico">⏳</div><span>En Uzun Bekleme</span></div><strong style="font-size:18px">${open.length?fmtAge(oldest):'—'}</strong><span>son hareketten beri</span></div></div><div class="v5-card-head" style="margin-top:14px"><div><h3>Önce Bakılacak Kayıtlar</h3><p>Yüksek öncelik ve bekleme süresine göre sıralandı.</p></div></div><div class="v5-mini-list">${open.length?open.slice(0,5).map(x=>mini(x.wait>=24?'🚨':x.wait>=8?'⚠️':'🛟',`#${Number(x.id)} ${x.subject||'Destek kaydı'}`,`${esc(x.userName||'Kullanıcı')} • ${esc(String(x.priority||'normal').toUpperCase())} • son hareket ${fmtAge(x.wait)} önce`,`<button class="btn sm ${x.wait>=8?'teal':'ghost'}" onclick="panelOpenAdminPane('support')">Aç</button>`,x.wait>=8?'gold':'')).join(''):'<div class="empty">Açık destek kaydı yok.</div>'}</div>`;
    const anchor=$('#adminProCenter')||$('#adminCommandCenter')||$('#adminStats');
    if(anchor?.parentNode)anchor.parentNode.insertBefore(node,anchor.nextSibling);
  }

  let traderRefreshRunning=false;
  async function refreshTraderOps(){
    if(traderRefreshRunning||!path.endsWith('/trader.html'))return;
    traderRefreshRunning=true;
    try{await decorateTraderTable();await decorateTraderOffers()}finally{traderRefreshRunning=false}
  }

  async function boot(){
    if(!ME)await loadMe();
    if(!ME)return;
    if(path.endsWith('/trader.html'))await refreshTraderOps();
    else if(path.endsWith('/dashboard.html'))await userReviewFollowups();
    else if(path.endsWith('/admin.html'))await adminResponseAging();
  }

  setTimeout(boot,2100);
  setTimeout(()=>{if(path.endsWith('/trader.html'))refreshTraderOps();if(path.endsWith('/dashboard.html'))userReviewFollowups();if(path.endsWith('/admin.html'))adminResponseAging();},3600);
  setTimeout(()=>{if(path.endsWith('/trader.html'))refreshTraderOps();},6200);
})();
