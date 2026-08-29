(() => {
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  if (!['/item.html','/trader.html','/dashboard.html'].includes(path)) return;
  const esc = (value='') => String(value).replace(/[&<>"']/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[char]));
  let presets = null;
  let inboxBusy = false;

  function listingId() {
    const id = new URLSearchParams(location.search).get('id');
    return id && /^\d+$/.test(id) ? id : null;
  }

  async function api(url, options={}) {
    const response = await fetch(url,{...options,headers:{Accept:'application/json',...(options.headers||{})}});
    const data = await response.json().catch(()=>({}));
    return {response,data};
  }

  async function getPresets() {
    if (presets) return presets;
    const {response,data}=await api('/api/listing-questions/presets');
    presets=response.ok?data:{questions:{},answers:{}};
    return presets;
  }

  function closeModal() { document.querySelector('#presetQuestionModal')?.remove(); }

  async function sendQuestion(code,id,button) {
    button.disabled=true;
    const {response,data}=await api('/api/listing-questions',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listingId:id,questionCode:code}),
    });
    if (response.status===401) { location.href=`/login.html?next=${encodeURIComponent(location.pathname+location.search)}`; return; }
    if (!response.ok) {
      const messages={self_question_not_allowed:'Kendi ilanına soru gönderemezsin.',too_many_pending_questions:'Bu ilan için çok fazla bekleyen sorun var.',preset_questions_temporarily_unavailable:'Hazır soru sistemi staging doğrulaması tamamlanana kadar kapalı.'};
      alert(messages[data.error]||'Soru şu anda gönderilemedi.');
      button.disabled=false;
      return;
    }
    alert('Hazır sorun satıcıya iletildi. Serbest mesajlaşma kapalıdır.');
    closeModal();
    renderMyQuestions(true);
  }

  async function openModal(id) {
    closeModal();
    const data=await getPresets();
    const overlay=document.createElement('div');
    overlay.id='presetQuestionModal';
    overlay.className='preset-modal';
    overlay.innerHTML=`<div class="preset-modal-card"><div class="preset-modal-head"><div><small>GÜVENLİ İLETİŞİM</small><h3>Satıcıya hazır soru sor</h3></div><button type="button" class="btn ghost" data-close-preset>✕</button></div><p>WhatsApp, Instagram, telefon veya serbest mesaj yok. Satış KOTAKAS içinde kalır.</p><div class="preset-question-buttons">${Object.entries(data.questions||{}).map(([code,text])=>`<button type="button" class="btn" data-preset-question="${esc(code)}">${esc(text)}</button>`).join('')}<button type="button" class="btn primary" data-go-offer>Fiyat için teklif göndermek istiyorum</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close-preset]')?.addEventListener('click',closeModal);
    overlay.addEventListener('click',(event)=>{if(event.target===overlay)closeModal();});
    overlay.querySelectorAll('[data-preset-question]').forEach((button)=>button.addEventListener('click',()=>sendQuestion(button.dataset.presetQuestion,id,button)));
    overlay.querySelector('[data-go-offer]')?.addEventListener('click',()=>{
      closeModal();
      const offerButton=document.querySelector('[data-offer-listing]');
      if (offerButton) offerButton.click(); else alert('Teklif alanı hazırlanıyor. Birkaç saniye sonra tekrar deneyebilirsin.');
    });
  }

  async function renderMyQuestions(force=false) {
    if (path!=='/item.html') return;
    const id=listingId();
    const shell=document.querySelector('#itemDetailRoot');
    if(!id||!shell) return;
    const old=shell.querySelector('[data-my-preset-questions]');
    if(old&&!force)return;
    const {response,data}=await api(`/api/listing-questions/mine?listingId=${encodeURIComponent(id)}&limit=20`);
    if(!response.ok)return;
    old?.remove();
    const items=Array.isArray(data.questions)?data.questions:[];
    if(!items.length)return;
    const anchor=shell.querySelector('.item-accordion-card')||shell.lastElementChild;
    anchor?.insertAdjacentHTML('beforebegin',`<section class="item-detail-card" data-my-preset-questions><div class="item-section-title"><div><small>GÜVENLİ İLETİŞİM</small><h2>Satıcıya Sordukların</h2></div></div><div class="preset-history">${items.map((item)=>`<div class="preset-history-row"><strong>${esc(item.question)}</strong><span>${item.answer?esc(item.answer):'Satıcı yanıtı bekleniyor'}</span></div>`).join('')}</div></section>`);
  }

  async function answerQuestion(id,select,button) {
    const code=select.value;
    if(!code)return;
    button.disabled=true;
    const {response,data}=await api(`/api/listing-questions/${encodeURIComponent(id)}/answer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answerCode:code})});
    if(!response.ok) alert(data.error==='preset_questions_temporarily_unavailable'?'Hazır yanıt sistemi staging doğrulamasını bekliyor.':'Yanıt gönderilemedi.');
    await renderInbox(true);
  }

  async function renderInbox(force=false) {
    if(!['/trader.html','/dashboard.html'].includes(path)||inboxBusy)return;
    const main=document.querySelector('main.main');
    if(!main)return;
    const old=main.querySelector('[data-preset-inbox]');
    if(old&&!force)return;
    inboxBusy=true;
    try{
      const [{response,data},presetData]=await Promise.all([api('/api/listing-questions/inbox?limit=50'),getPresets()]);
      if(!response.ok)return;
      const items=Array.isArray(data.questions)?data.questions:[];
      old?.remove();
      const card=document.createElement('section');
      card.className='card full';
      card.dataset.presetInbox='1';
      card.innerHTML=`<div class="page-title" style="margin-bottom:12px"><div><h3>Satıcıya Sor</h3><p>Serbest sohbet kapalı. Yalnızca KOTAKAS hazır soruları ve hazır yanıtları kullanılır.</p></div><span class="badge ${items.some(i=>i.status==='pending')?'yellow':'green'}">${items.filter(i=>i.status==='pending').length} bekleyen</span></div>${items.length?`<div class="list">${items.map((item)=>`<div class="list-item"><div style="flex:1"><strong>${esc(item.listingTitle||`İlan #${item.listingId}`)}</strong><span>${esc(item.question)}</span>${item.answer?`<span>Yanıt: ${esc(item.answer)}</span>`:''}</div>${item.status==='pending'?`<div class="preset-answer"><select data-answer-select="${esc(item.id)}"><option value="">Hazır yanıt seç</option>${Object.entries(presetData.answers||{}).map(([code,text])=>`<option value="${esc(code)}">${esc(text)}</option>`).join('')}</select><button class="btn success" type="button" data-answer-question="${esc(item.id)}">Yanıtla</button></div>`:'<span class="badge green">Yanıtlandı</span>'}</div>`).join('')}</div>`:'<div class="empty">Bekleyen hazır soru yok.</div>'}`;
      main.appendChild(card);
      card.querySelectorAll('[data-answer-question]').forEach((button)=>button.addEventListener('click',()=>answerQuestion(button.dataset.answerQuestion,card.querySelector(`[data-answer-select="${button.dataset.answerQuestion}"]`),button)));
    } finally { inboxBusy=false; }
  }

  document.addEventListener('click',(event)=>{
    const button=event.target.closest?.('[data-seller-question]');
    if(!button||path!=='/item.html')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id=listingId();
    if(id)openModal(id);
  },true);

  const observer=new MutationObserver(()=>{renderMyQuestions();renderInbox();});
  window.addEventListener('DOMContentLoaded',()=>{
    const app=document.querySelector('#app');
    if(app)observer.observe(app,{childList:true,subtree:true});
    setTimeout(()=>{renderMyQuestions();renderInbox();},250);
  });
})();
