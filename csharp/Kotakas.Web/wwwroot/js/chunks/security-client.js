(()=>{
  if(typeof window.api!=='function')return;
  const baseApi=window.api;
  const inflight=new Map();
  const unsafe=m=>!['GET','HEAD','OPTIONS'].includes(m);
  const critical=(path,method)=>{
    if(!unsafe(method))return false;
    const p=String(path).toLowerCase();
    return p==='/api/sale-requests'||p==='/api/listings'||p==='/api/payments/paid-listing/checkout'||p==='/api/payments/paid-listing/create-request'||
      (p.includes('/api/listings/')&&p.endsWith('/buy'))||
      (p.includes('/api/listing-price-offers/')&&p.endsWith('/purchase'))||
      (p.includes('/api/offers/')&&p.endsWith('/accept'))||
      (p.includes('/api/deals/')&&(p.endsWith('/confirm')||p.endsWith('/cancel')||p.endsWith('/dispute')||p.endsWith('/delivered')))||
      p.includes('/api/admin/wallet');
  };
  const uuid=()=>window.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const bodyKey=body=>{try{return typeof body==='string'?body:JSON.stringify(body??null)}catch{return String(body??'')}};

  window.api=function(path,opt={}){
    const method=String(opt.method||'GET').toUpperCase();
    const isUnsafe=unsafe(method);
    const fingerprint=isUnsafe?`${method}:${path}:${bodyKey(opt.body)}`:'';
    if(isUnsafe&&inflight.has(fingerprint))return inflight.get(fingerprint);

    const headers={...(opt.headers||{})};
    if(isUnsafe)headers['X-KOTAKAS-CSRF']='1';
    if(critical(path,method)&&!headers['Idempotency-Key'])headers['Idempotency-Key']=uuid();
    const next={...opt,method,headers};
    const promise=baseApi(path,next).catch(err=>{
      const code=err?.data?.error;
      if(code==='duplicate_request')toast('Bu işlem zaten gönderildi. Ekran yenileniyor.');
      else if(code==='rate_limit_exceeded')toast('Çok hızlı işlem yapıldı. Kısa süre sonra tekrar dene.');
      else if(code==='csrf_validation_failed')toast('Güvenlik doğrulaması başarısız. Sayfayı yenile.');
      else if(code==='session_revoked'){toast('Bu cihazın oturumu kapatılmış.');setTimeout(()=>location.href='/login.html?session=revoked',600)}
      throw err;
    });
    if(isUnsafe){
      inflight.set(fingerprint,promise);
      promise.finally(()=>setTimeout(()=>{if(inflight.get(fingerprint)===promise)inflight.delete(fingerprint)},1800)).catch(()=>{});
    }
    return promise;
  };
})();
