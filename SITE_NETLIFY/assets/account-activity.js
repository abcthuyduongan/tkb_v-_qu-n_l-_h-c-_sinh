/* Session presence only; no passwords, tokens, IP addresses or student content logged. */
(()=>{'use strict';
 let last=0,pending=false;
 async function record(){
  const c=window.TranPhuReportsContext?.();
  if(pending||document.hidden||!c?.userId||c.demo||document.getElementById('appView')?.hidden||Date.now()-last<180000)return;
  pending=true;last=Date.now();try{await c.client.rpc('v4_record_account_visit');}catch{}finally{pending=false;}
 }
 const app=document.getElementById('appView');if(app)new MutationObserver(record).observe(app,{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('focus',record);document.addEventListener('visibilitychange',record);document.addEventListener('pointerdown',record,{passive:true});document.addEventListener('keydown',record,{passive:true});record();
})();
