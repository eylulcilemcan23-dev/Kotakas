(()=>{
  function stars(n){const x=Math.max(0,Math.min(5,Math.round(Number(n)||0)));return '★'.repeat(x)+'☆'.repeat(5-x)}

  window.submitTraderReview=async(dealId,starsValue)=>{
    const box=$('#dealReviewBox'),comment=$('#dealReviewComment',box)?.value||'';
    try{await api(`/api/deals/${dealId}/review`,{method:'POST',body:{stars:starsValue,comment}});toast('Değerlendirmen kaydedildi.');setTimeout(()=>location.reload(),300)}catch(err){const code=err.data?.error;toast(code==='review_already_exists'?'Bu işlem zaten değerlendirildi.':code==='invalid_review_comment'?'Yorumda iletişim bilgisi kullanılamaz ve en fazla 200 karakter olmalı.':'Değerlendirme kaydedilemedi.')}};

  async function enhanceDealReview(){
    if(!ME)return;
    try{
      const d=await api('/api/deals'),deals=d.deals||[],id=Number(new URLSearchParams(location.search).get('id')||0),deal=deals.find(x=>x.id===id)||deals[0];
      if(!deal||!$('#dealDetail'))return;
      const s=await api(`/api/deals/${deal.id}/review-status`);let box=$('#dealReviewBox');if(box)box.remove();
      box=document.createElement('div');box.id='dealReviewBox';box.className='v5-card';box.style.marginTop='14px';
      if(s.review){box.innerHTML=`<div class="v5-card-head"><div><h3>İşlem değerlendirmesi</h3><p>Bu işlem için puanın kaydedildi.</p></div></div><div style="font-size:24px;color:#ffd791">${stars(s.review.stars)}</div>${s.review.comment?`<div class="notice" style="margin-top:10px">${esc(s.review.comment)}</div>`:''}`}
      else if(s.canReview){box.innerHTML=`<div class="v5-card-head"><div><h3>Pazarcıyı değerlendir</h3><p>Yalnız tamamlanmış gerçek işlemler puanlanabilir.</p></div></div><div class="actions" style="gap:6px;margin:10px 0">${[1,2,3,4,5].map(x=>`<button class="btn sm ghost" onclick="submitTraderReview(${deal.id},${x})">${x} ★</button>`).join('')}</div><div class="field"><label>Kısa yorum (isteğe bağlı)</label><textarea id="dealReviewComment" maxlength="200" placeholder="Teslimat, iletişim ve işlem deneyimi..."></textarea></div>`}
      else return;
      $('#dealDetail').append(box);
    }catch{}
  }

  async function applyTraderTrust(){
    if(!ME||ME.role!=='trader')return;
    try{
      const d=await api(`/api/trust/traders/${ME.id}`),t=d.trader||{};
      const profile=$('.v5-profilebar div:nth-child(2) span');if(profile)profile.textContent=t.reviewCount?`⭐ ${Number(t.rating).toFixed(1)} • ${t.reviewCount} değerlendirme • ${t.completedDeals} tamamlanan işlem`:`Yeni pazarcı • ${t.completedDeals||0} tamamlanan işlem • Henüz değerlendirme yok`;
      $$('.v5-mini').forEach(card=>{const label=card.querySelector('span')?.textContent||'',strong=card.querySelector('strong');if(!strong)return;if(label.includes('Pazarcı puanı'))strong.textContent=t.reviewCount?`${Number(t.rating).toFixed(1)} / 5.0`:'Henüz puan yok';if(label.includes('Ortalama cevap')){strong.textContent='—';card.querySelector('span').textContent='Cevap süresi ölçümü yakında';}if(label.includes('Başarılı işlem oranı')){strong.textContent=t.completedDeals||0;card.querySelector('span').textContent='Tamamlanan gerçek işlem';}});
    }catch{}
  }

  async function applyHomeTrust(){
    try{const d=await api('/api/trust/traders'),rows=d.traders||[],cards=$$('#traderShowcase .trader-mini');cards.forEach((card,i)=>{const t=rows[i];if(!t)return;const span=card.querySelector('span');if(span)span.innerHTML=`<i class="online"></i>${t.reviewCount?`⭐ ${Number(t.rating).toFixed(1)} • ${t.reviewCount} yorum • `:''}${t.completedDeals||0} tamamlanan işlem`;});}catch{}
  }

  const baseDeals=typeof renderDeals==='function'?renderDeals:null;if(baseDeals)renderDeals=async function(){await baseDeals();await enhanceDealReview()};
  const baseTrader=typeof renderTrader==='function'?renderTrader:null;if(baseTrader)renderTrader=async function(){await baseTrader();await applyTraderTrust()};
  const baseHome=typeof renderHome==='function'?renderHome:null;if(baseHome)renderHome=async function(){await baseHome();await applyHomeTrust()};
})();
