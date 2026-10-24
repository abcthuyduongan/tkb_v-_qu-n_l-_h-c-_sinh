/* Keep the original timetable renderer; place its actions in the portal title bar. */
(()=>{'use strict';
 const frame=document.getElementById('schoolTimetableFrame');
 const share=document.getElementById('timetableShare'),print=document.getElementById('timetablePrint');
 if(!frame||!share||!print)return;
 const observers=new WeakMap();
 function theme(target){
  const doc=target.contentDocument;if(!doc?.querySelector('.page-shell,.admin-shell'))return;
  doc.documentElement.classList.add('portal-embedded');
  doc.documentElement.classList.toggle('portal-management',!!window.TranPhuReportsContext?.().admin);
  if(!doc.getElementById('portalFrameTokens')){const tokens=doc.createElement('link');tokens.id='portalFrameTokens';tokens.rel='stylesheet';tokens.href='/assets/portal-tokens.css?v=62';doc.head.append(tokens);}
  if(!doc.getElementById('portalFrameTheme')){const css=doc.createElement('link');css.id='portalFrameTheme';css.rel='stylesheet';css.href='/assets/portal-timetable.css?v=63';doc.head.append(css);}
  if(!observers.has(doc)){const content=doc.querySelector('.page-shell,.admin-shell');const resize=()=>{if(!target.getClientRects().length)return;const h=Math.ceil(content.getBoundingClientRect().height+16);if(h>0&&target.style.height!==h+'px'){target.style.minHeight='0';target.style.height=h+'px';}};const observer=new ResizeObserver(resize);observer.observe(content);observers.set(doc,observer);resize();}
  if(target===frame){share.disabled=!doc.getElementById('shareBtn');print.disabled=!doc.getElementById('printBtn');}
 }
 for(const target of [frame,document.getElementById('timetableAdminFrame')].filter(Boolean)){target.addEventListener('load',()=>theme(target));theme(target);}
 function notify(message){const node=document.getElementById('toast');node.textContent=message;node.classList.add('show');setTimeout(()=>{if(node.textContent===message)node.classList.remove('show');},3500);}
 share.addEventListener('click',async()=>{
  const doc=frame.contentDocument;if(!doc)return;
  const url=new URL('/',location.origin);url.searchParams.set('page','timetable');
  for(const [key,id] of [['mode','viewSelect'],['id','entitySelect'],['version','versionSelect']]){const value=doc.getElementById(id)?.value;if(value&&value!=='demo')url.searchParams.set(key,value);}
  try{if(navigator.share)await navigator.share({title:doc.title,text:'Thời khóa biểu Trần Phú',url:url.href});else{await navigator.clipboard.writeText(url.href);notify('Đã sao chép liên kết TKB');}}
  catch(error){if(error.name!=='AbortError')notify('Chưa thể chia sẻ. Vui lòng thử lại.');}
 });
 print.addEventListener('click',()=>frame.contentDocument?.getElementById('printBtn')?.click());
})();
