(async()=>{
  const scripts=['/js/chunks/core.js','/js/chunks/marketplace.js','/js/chunks/payments.js','/js/chunks/management.js','/js/chunks/deals.js','/js/chunks/admin-init.js'];
  for(const src of scripts){
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }
})().catch(()=>console.error('KOTAKAS arayüz dosyaları yüklenemedi.'));
