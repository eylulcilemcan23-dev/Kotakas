(async()=>{
  for(const src of ['/js/chunks/core.js','/js/chunks/marketplace.js','/js/chunks/deals.js','/js/chunks/admin-init.js']){
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  }
})().catch(()=>console.error('KOTAKAS arayüz dosyaları yüklenemedi.'));
