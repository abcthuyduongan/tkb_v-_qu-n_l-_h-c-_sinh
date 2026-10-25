/* Context in the title bar comes from the selected timetable and school calendar. */
(()=>{'use strict';
 // Reserve the actual fixed navigation height, including role labels and safe area.
 const nav=document.getElementById('nav');
 function syncNavInset(){if(!nav)return;const h=getComputedStyle(nav).position==='fixed'&&matchMedia('(max-width:1179px)').matches?Math.ceil(nav.getBoundingClientRect().height):0;document.documentElement.style.setProperty('--tp-bottom-nav-height',h+'px');}
 if(nav&&typeof ResizeObserver!=='undefined')new ResizeObserver(syncNavInset).observe(nav);
 window.addEventListener('resize',syncNavInset);syncNavInset();
 const target=document.getElementById('pageContext'),frame=document.getElementById('schoolTimetableFrame');if(!target)return;
 let calendar=null,calendarKey='',calendarRequest=0,observedDoc=null,pending;
 const currentDay=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');};
 function draw(top,bottom,title=''){target.hidden=!top&&!bottom;target.replaceChildren();if(top){const strong=document.createElement('strong');strong.textContent=top;target.append(strong);}if(bottom){const small=document.createElement('small');small.textContent=bottom;target.append(small);}target.title=title;}
 async function getCalendar(c){
  const key=[c.demo,c.year].join('|');if(calendarKey===key)return;calendarKey=key;const request=++calendarRequest;calendar=c.demo?c.demoCalendar:null;
  if(!c.demo&&c.client){try{const result=await c.client.from('tkb_school_calendars').select('*').eq('school_year',c.year).maybeSingle();if(request!==calendarRequest)return;calendar=result.error?null:result.data;}catch(error){calendar=null;}}
  refresh();
 }
 function watchFrame(){const doc=frame?.contentDocument;if(!doc||doc===observedDoc)return;observedDoc=doc;const root=doc.getElementById('versionName');if(root)new MutationObserver(queue).observe(root,{childList:true,subtree:true,characterData:true});}
 function queue(){clearTimeout(pending);pending=setTimeout(refresh,40);}
 function refresh(){
  const c=window.TranPhuReportsContext?.();if(!c||document.getElementById('appView').hidden){target.hidden=true;return;}
  const page=document.body.dataset.page;
  if(page==='timetable'){watchFrame();const version=frame?.contentDocument?.getElementById('versionName')?.textContent.trim();draw(version||'','');return;}
  if(page==='home'||page==='class'){
   getCalendar(c);let week=null,status='missing';try{if(calendar){const current=window.SchoolCalendar.current(calendar,currentDay());week=current.week;status=current.status;}}catch(error){status='invalid';}
   const weekday=new Intl.DateTimeFormat('vi-VN',{weekday:'long',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
   draw(week?'Tuần PPCT '+week:status==='break'?'Nghỉ giữa tuần':status==='before'||status==='after'?'Ngoài tuần học':'Tuần PPCT —',weekday,week?'Theo lịch năm học của trường':status==='missing'?'Chưa có cấu hình tuần PPCT cho năm học này':'Theo lịch năm học của trường');return;
  }
  if(page==='students'){const cls=document.getElementById('studentManagerClass')?.value;draw(cls?'Lớp '+cls:'','');}
  else if(page==='homeroom')draw(c.classCode?'Lớp '+c.classCode:'','');
  else if(page==='progress')draw(document.getElementById('reportClass')?.value?'Lớp '+document.getElementById('reportClass').value:c.admin?'Toàn trường':'',document.getElementById('reportRange')?.selectedOptions[0]?.textContent||'');
  else draw('','');
 }
 frame?.addEventListener('load',queue);new MutationObserver(queue).observe(document.body,{attributes:true,attributeFilter:['data-page']});
 new MutationObserver(queue).observe(document.getElementById('appView'),{attributes:true,attributeFilter:['hidden']});
 for(const id of ['classSelect','reportClass','reportRange','studentManagerClass'])document.getElementById(id)?.addEventListener('change',queue);
 window.addEventListener('focus',queue);setInterval(queue,60000);refresh();
 window.TranPhuHeader={refresh};
})();
