(()=>{
  if(window.__kotakasAccountDrawerWheelFix)return;
  window.__kotakasAccountDrawerWheelFix=true;

  document.addEventListener('wheel',e=>{
    const target=e.target instanceof Element?e.target:null;
    const drawer=target?.closest?.('.k-account-drawer.open');
    if(!drawer)return;

    const max=Math.max(0,drawer.scrollHeight-drawer.clientHeight);
    if(max<=0)return;

    const before=drawer.scrollTop;
    const next=Math.max(0,Math.min(max,before+e.deltaY));
    drawer.scrollTop=next;

    if(next!==before){
      e.preventDefault();
      e.stopPropagation();
    }
  },{capture:true,passive:false});
})();
