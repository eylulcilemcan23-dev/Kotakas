(()=>{
  const attached=new WeakSet();
  const pathname=location.pathname.toLowerCase();
  const style=document.createElement('style');
  style.textContent='.ko-item-picker{position:relative;width:100%}.ko-item-picker input{width:100%;padding-left:50px!important}.ko-item-picker-preview{position:absolute;left:7px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:1px solid #194650;border-radius:9px;background:#071b22;display:grid;place-items:center;overflow:hidden;z-index:2}.ko-item-picker-preview img,.ko-item-option img{width:100%;height:100%;object-fit:contain}.ko-item-results{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:2500;background:#071a21;border:1px solid #18434c;border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.42);padding:6px;display:none;max-height:330px;overflow:auto}.ko-item-results.open{display:block}.ko-item-option{width:100%;border:0;background:transparent;color:#e9f7f8;display:flex;align-items:center;gap:10px;padding:8px;border-radius:9px;text-align:left;cursor:pointer}.ko-item-option:hover{background:#0d3038}.ko-item-option .pic{width:44px;height:44px;flex:0 0 44px;border-radius:9px;border:1px solid #1a4b55;background:#05151b;display:grid;place-items:center;overflow:hidden}.ko-item-option strong{display:block;font-size:13px}.ko-item-option small{display:block;color:#78a6ae;font-size:10px;margin-top:3px}.ko-item-empty{padding:12px;color:#78a6ae;font-size:11px;text-align:center}';
  document.head.appendChild(style);

  function normalize(value){return String(value||'').replace(/\s+/g,' ').trim().replace(/\s*\+\s*\d+\b.*$/i,'').replace(/\s*\((reverse|rebirth)[^)]*\)\s*$/i,'').trim()}
  function eligible(input){
    if(!(input instanceof HTMLInputElement)||input.type!=='text'||pathname.includes('ring-sell.html'))return false;
    const id=(input.id||'').toLowerCase();
    const ph=(input.placeholder||'').toLowerCase();
    return ['item','litem','urgentitem','marketsearch','itemsearch','searchitem'].includes(id)||ph.includes('item ara')||ph.includes('iron bow')||ph.includes('item adı');
  }
  function setPreview(box,url){
    box.replaceChildren();
    if(url){const img=document.createElement('img');img.src=url;img.alt='';box.appendChild(img)}else box.textContent='📦';
  }
  function addOption(list,item,input,preview){
    const btn=document.createElement('button');btn.type='button';btn.className='ko-item-option';
    const pic=document.createElement('span');pic.className='pic';
    if(item.iconUrl){const img=document.createElement('img');img.src=item.iconUrl;img.alt='';pic.appendChild(img)}else pic.textContent='📦';
    const text=document.createElement('span');
    const strong=document.createElement('strong');strong.textContent=item.name||'Item';
    const small=document.createElement('small');small.textContent=item.iconUrl?'Oyundaki item ikonu':'KO item sonucu';
    text.append(strong,small);btn.append(pic,text);
    btn.addEventListener('click',()=>{
      input.value=item.name||'';
      input.dataset.koItemName=item.name||'';
      input.dataset.koItemIcon=item.iconUrl||'';
      setPreview(preview,item.iconUrl||'');
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
      list.classList.remove('open');
    });
    list.appendChild(btn);
  }
  function attach(input){
    if(attached.has(input)||!eligible(input))return;
    attached.add(input);
    const holder=document.createElement('div');holder.className='ko-item-picker';
    input.parentNode.insertBefore(holder,input);holder.appendChild(input);
    const preview=document.createElement('div');preview.className='ko-item-picker-preview';preview.textContent='📦';
    const list=document.createElement('div');list.className='ko-item-results';
    holder.append(preview,list);
    let timer=0,seq=0;
    input.addEventListener('input',()=>{
      clearTimeout(timer);
      const query=input.value.trim();
      if(normalize(query).length<2){list.classList.remove('open');setPreview(preview,'');return}
      timer=setTimeout(async()=>{
        const current=++seq;
        list.replaceChildren();
        const loading=document.createElement('div');loading.className='ko-item-empty';loading.textContent='KO itemleri aranıyor...';list.appendChild(loading);list.classList.add('open');
        try{
          const response=await fetch('/api/public/item-icons/search?q='+encodeURIComponent(query),{credentials:'same-origin'});
          const data=response.ok?await response.json():{items:[]};
          if(current!==seq)return;
          const items=Array.isArray(data.items)?data.items:[];
          list.replaceChildren();
          if(!items.length){const empty=document.createElement('div');empty.className='ko-item-empty';empty.textContent='Eşleşen KO itemi bulunamadı.';list.appendChild(empty);return}
          items.forEach(item=>addOption(list,item,input,preview));
          const target=normalize(query).toLowerCase();
          const best=items.find(x=>normalize(x.name).toLowerCase()===target)||items[0];
          if(best&&best.iconUrl)setPreview(preview,best.iconUrl);
        }catch{
          if(current!==seq)return;
          list.replaceChildren();const empty=document.createElement('div');empty.className='ko-item-empty';empty.textContent='Item görselleri şu an yüklenemedi.';list.appendChild(empty);
        }
      },260);
    });
    input.addEventListener('focus',()=>{if(list.children.length)list.classList.add('open')});
    document.addEventListener('click',event=>{if(!holder.contains(event.target))list.classList.remove('open')});
  }
  function scan(){document.querySelectorAll('input[type="text"]').forEach(attach)}
  scan();setTimeout(scan,500);setTimeout(scan,1400);setTimeout(scan,2800);
})();
