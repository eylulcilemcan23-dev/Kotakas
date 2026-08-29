(()=>{
  const parsePrice=v=>{const s=String(v??'').trim().replace(',','.');if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:NaN};
  const enc=v=>encodeURIComponent(String(v??''));

  async function loadWatches(){
    if(!ME)return null;
    try{return await api('/api/item-watches/')}catch{return null}
  }

  function watchHtml(w){
    const price=w.maxPriceGb==null?'Fiyat sınırı yok':`≤ ${fmtGB(w.maxPriceGb)}`;
    const best=w.bestPriceGb==null?'Şu an eşleşme yok':`En iyi: ${fmtGB(w.bestPriceGb)}`;
    const q=enc(w.query),server=enc(w.serverCode),max=w.maxPriceGb==null?'':String(w.maxPriceGb);
    return `<div class="listitem"><div class="itemhead"><div><div class="itemtitle">🎯 ${esc(w.query)}</div><div class="meta">${esc(w.serverCode)} • ${price} • ${best}</div></div><div class="spacer"></div><span class="pill ${Number(w.matchCount||0)>0?'green':'purple'}">${Number(w.matchCount||0)} eşleşme</span></div><div class="actions"><button class="btn sm teal" onclick="showItemWatchMatches(${Number(w.id)})">Eşleşmeleri Gör</button><button class="btn sm ghost" onclick="editItemWatch(${Number(w.id)},'${server}','${q}','${max}')">Düzenle</button><button class="btn sm ghost" onclick="removeItemWatch(${Number(w.id)})">Sil</button></div></div>`;
  }

  window.renderItemWatches=async()=>{
    if(!ME)return;
    const d=await loadWatches();if(!d)return;
    if($('#favWatchCount'))$('#favWatchCount').textContent=(d.watches||[]).length;
    const box=$('#itemWatchList');if(box)box.innerHTML=(d.watches||[]).length?(d.watches||[]).map(watchHtml).join(''):'<div class="empty">Henüz item alarmın yok. Aradığın itemi yukarıdan ekleyebilirsin.</div>';
  };

  window.removeItemWatch=async id=>{
    if(!confirm('Bu item alarmını silmek istiyor musun?'))return;
    try{await api(`/api/item-watches/${id}`,{method:'DELETE'});toast('Item alarmı silindi.');await renderItemWatches()}catch{toast('Item alarmı silinemedi.')}
  };

  window.editItemWatch=async(id,serverEncoded,queryEncoded,maxRaw)=>{
    const oldServer=decodeURIComponent(serverEncoded),oldQuery=decodeURIComponent(queryEncoded);
    const query=prompt('Takip edilecek item / arama:',oldQuery);if(query===null)return;
    const server=prompt('Server (ALL, ZERO, AGARTHA, PANDORA):',oldServer);if(server===null)return;
    const price=prompt('En fazla fiyat (GB). Fiyat sınırı istemiyorsan boş bırak:',maxRaw);if(price===null)return;
    const maxPriceGb=parsePrice(price);if(Number.isNaN(maxPriceGb))return toast('Geçerli GB fiyatı gir.');
    try{await api(`/api/item-watches/${id}`,{method:'PATCH',body:{serverCode:server,query,maxPriceGb}});toast('Item alarmı güncellendi.');await renderItemWatches()}catch(err){toast(err.data?.error||'Item alarmı güncellenemedi.')}
  };

  window.showItemWatchMatches=async id=>{
    try{
      const [wd,ld]=await Promise.all([api('/api/item-watches/'),api('/api/listings')]);const w=(wd.watches||[]).find(x=>Number(x.id)===Number(id));if(!w)return toast('Item alarmı bulunamadı.');
      const rows=(ld.listings||[]).filter(x=>(w.serverCode==='ALL'||x.serverCode===w.serverCode)&&String(x.itemName||'').toLocaleLowerCase('tr-TR').includes(String(w.query||'').toLocaleLowerCase('tr-TR'))&&(w.maxPriceGb==null||Number(x.priceGb)<=Number(w.maxPriceGb)));
      let modal=$('#itemWatchMatchModal');if(!modal){modal=document.createElement('div');modal.id='itemWatchMatchModal';modal.className='modal';modal.innerHTML='<div class="modalbox"><div class="modalhead"><h3 id="itemWatchMatchTitle">Eşleşen İlanlar</h3><button class="x" onclick="closeModal(\'itemWatchMatchModal\')">✕</button></div><div id="itemWatchMatchList" class="list"></div></div>';document.body.appendChild(modal)}
      $('#itemWatchMatchTitle').textContent=`${w.serverCode} • ${w.query}`;
      $('#itemWatchMatchList').innerHTML=rows.length?rows.map(x=>`<div class="listitem"><div class="itemhead"><div><div class="itemtitle">${esc(x.itemName)}</div><div class="meta">${esc(x.sellerName)} • Stok ${Number(x.stock||0)}</div></div><div class="spacer"></div><span class="pill gold">${fmtGB(x.priceGb)}</span></div><div class="actions"><button class="btn sm teal" onclick="buyListing(${Number(x.id)},${Number(x.stock)},'${enc(x.itemName)}',${Number(x.priceGb)})">Satın Al</button><button class="btn sm ghost" onclick="toggleFavorite('listing','${Number(x.id)}',this)">♡ Favoriye Al</button></div></div>`).join(''):'<div class="empty">Şu an bu alarma uyan aktif SELL ilanı yok.</div>';
      modal.classList.add('open');
    }catch{toast('Eşleşen ilanlar yüklenemedi.')}
  };

  async function boot(){
    const p=location.pathname.toLowerCase();if(!p.endsWith('/favorites.html'))return;
    if(!ME)await loadMe();if(!ME)return;
    const form=$('#itemWatchForm');
    form?.addEventListener('submit',async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));const maxPriceGb=parsePrice(data.maxPriceGb);if(Number.isNaN(maxPriceGb))return toast('Geçerli GB fiyatı gir.');try{await api('/api/item-watches/',{method:'POST',body:{serverCode:data.serverCode,query:data.query,maxPriceGb}});toast('Item alarmı kaydedildi.');e.target.reset();await renderItemWatches()}catch(err){const map={item_watch_limit_reached:'En fazla 20 item alarmı oluşturabilirsin.',invalid_item_watch_query:'Item adı geçersiz.',invalid_max_price:'GB fiyatı geçersiz.',invalid_server:'Server geçersiz.'};toast(map[err.data?.error]||'Item alarmı oluşturulamadı.')}});
    await renderItemWatches();
  }
  boot();
})();
