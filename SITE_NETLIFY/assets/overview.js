/* A small role-scoped overview. Server RPCs enforce every scope independently. */
(()=>{'use strict';window.TranPhuOverviewLoaded=true;
 const $=id=>document.getElementById(id),context=()=>window.TranPhuReportsContext?.();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let scope='own',days=1,revision=0,limit=12,filter='pending',lastUser='';
 function setup(){
  const c=context(),visible=!!c&&!$('appView').hidden;$('openOverview').hidden=!visible;if(!visible){lastUser='';revision++;$('overviewResult').replaceChildren();return;}
  const user=(c.demo?'demo':c.userId)+'|'+c.admin+'|'+c.schoolViewer;if(user!==lastUser){lastUser=user;scope=c.admin?'school':'own';days=1;$('overviewPeriod').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.days==='1')));}
  const scopes=[...(!c.admin?[['own','Tiết của tôi']]:[]),...(c.homeroomClasses.length?[['homeroom','Lớp chủ nhiệm']]:[]),...(c.admin||c.schoolViewer?[['school','Toàn trường']]:[])];
  $('overviewScope').innerHTML=scopes.map(([k,v])=>'<button type="button" data-scope="'+k+'" aria-pressed="'+(k===scope)+'">'+v+'</button>').join('');
 }
 function demo(c){const s=c.session;return {completion:s?[{...s,teacher_id:c.userId,teacher_name:c.profile?.teacher_name,expected:c.students.filter(s=>s.active!==false).length,confirmed:c.attendance.length,automatic_present:0,attendance_state:c.attendance.length>=c.students.filter(s=>s.active!==false).length&&c.attendance.length?'confirmed':'pending',review_confirmed:window.TranPhuLessonReview?.demoRows.has(s.id)||false,can_write:true}]:[],scheduled_today:[],server_today:day()};}
 async function refresh(){
  setup();if($('overviewPage').hidden||$('appView').hidden)return;const c=context(),current=++revision;limit=12;
  $('overviewResult').textContent='Đang tải tổng quan…';$('overviewResult').setAttribute('aria-busy','true');
  const to=day(),d=new Date(to+'T12:00:00Z');if(days===7)d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const from=days===1?to:d.toISOString().slice(0,10);
  try{let data;if(c.demo)data=demo(c);else{const [r,activity]=await Promise.all([c.client.rpc('v4_overview',{y:c.year,d1:from,d2:to,scope_kind:scope}),c.admin?c.client.rpc('v4_account_activity_summary'):Promise.resolve({data:null})]);if(r.error)throw r.error;if(activity.error)throw activity.error;data=r.data;if(c.admin)data.account_activity=activity.data||[];}
   if(current!==revision)return;draw(data,c,from,to);
  }catch(error){if(current===revision){$('overviewResult').innerHTML='<p role="alert">Chưa tải được tổng quan. Kiểm tra kết nối hoặc cập nhật chức năng trên máy chủ, rồi bấm Làm mới.</p>';}}
  finally{if(current===revision)$('overviewResult').setAttribute('aria-busy','false');}
 }
 function draw(data,c,from,to){
  const rows=data.completion||[],scheduled=data.scheduled_today||[],pending=rows.filter(r=>r.attendance_state!=='confirmed'),review=rows.filter(r=>!r.review_confirmed),confirmed=rows.length-pending.length;
  const auto=rows.reduce((n,s)=>n+Number(s.automatic_present||0),0),notOpened=scheduled.filter(s=>!s.opened);
  const cards=[['all',days===1?'Tiết theo lịch hôm nay':'Tiết đã mở',days===1?scheduled.length:rows.length],['confirmed','Đã xác nhận điểm danh',confirmed],['pending','Chờ xác nhận điểm danh',pending.length],['review','Chưa có nhận định',review.length]];
  const daily=new Map();for(let d=from;d<=to;){daily.set(d,{all:0,done:0});const next=new Date(d+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);d=next.toISOString().slice(0,10);}for(const r of rows){const v=daily.get(r.lesson_date);if(v){v.all++;if(r.attendance_state==='confirmed')v.done++;}}
  const max=Math.max(1,...[...daily.values()].map(v=>v.all));
  const accounts=data.account_activity||[],recent=accounts.filter(a=>a.last_seen&&Date.parse(a.last_seen)>=Date.now()-7*86400000).length,unknown=accounts.filter(a=>!a.last_seen).length;
  const root=$('overviewResult');root.innerHTML='<div class="report-dashboard"><div class="rd-stats">'+cards.map(([k,label,n])=>'<button type="button" class="rd-stat" data-overview-filter="'+k+'" aria-pressed="'+(k===filter)+'"><span>'+label+'</span><strong>'+n+'</strong><small>tiết</small></button>').join('')+'</div><p class="rd-data-note">'+rows.length+' tiết đã mở · '+auto+' lượt Có mặt tự động, chờ xác nhận. Dữ liệu cũ chưa đủ sĩ số được ghi là chưa xác định.</p>'+
   '<section class="rd-panel"><h3>Hoàn thành điểm danh</h3><div class="overview-chart">'+[...daily].map(([date,v])=>'<div><div class="overview-bar" role="img" aria-label="'+esc(date)+': '+v.done+'/'+v.all+' tiết đã xác nhận"><span style="height:'+v.all/max*100+'%"><i style="height:'+(v.all?v.done/v.all*100:0)+'%"></i></span></div><small>'+date.slice(8,10)+'/'+date.slice(5,7)+'</small></div>').join('')+'</div><p class="rd-unit">Xanh: đã xác nhận · Nền nhạt: tổng tiết đã mở.</p></section>'+
   '<section class="rd-panel overview-tasks" aria-live="polite"></section>'+(notOpened.length?'<section class="rd-panel"><h3>Tiết theo lịch chưa mở hôm nay ('+notOpened.length+')</h3>'+(scope==='own'?notOpened.map(s=>'<p>Lớp '+esc(s.class_code)+' · Tiết '+s.period_no+' · '+esc(s.subject)+' — Chưa thực hiện điểm danh</p>').join('')+'<button type="button" data-overview-home>Vào Đánh giá</button>':[...new Set(notOpened.map(s=>s.class_code))].map(cls=>'<div class="overview-task"><div><strong>Lớp '+esc(cls)+'</strong><small>'+notOpened.filter(s=>s.class_code===cls).length+' tiết chưa mở theo TKB hôm nay</small></div><button type="button" data-overview-class="'+esc(cls)+'">Xem báo cáo</button></div>').join(''))+'<p class="rd-unit">Đối chiếu TKB đang áp dụng hôm nay; không tự tạo tiết hoặc điểm danh.</p></section>':'')+
   (c.admin?'<section class="rd-panel"><h3>Hoạt động tài khoản</h3><p>'+accounts.length+' tài khoản · '+recent+' truy cập trong 7 ngày · '+(accounts.length-recent-unknown)+' lâu chưa truy cập · '+unknown+' chưa có lịch sử.</p><button type="button" data-overview-accounts>Mở quản lý tài khoản</button></section>':'')+'</div>';
  function tasks(){const list=filter==='confirmed'?rows.filter(r=>r.attendance_state==='confirmed'):filter==='review'?review:filter==='all'?rows:pending;
   const title=filter==='review'?'Tiết chưa có nhận định':filter==='confirmed'?'Tiết đã xác nhận':filter==='all'?'Các tiết đã mở':'Tiết cần xác nhận điểm danh';
   if(scope==='school'){
    const groups=new Map();for(const s of list){if(!groups.has(s.class_code))groups.set(s.class_code,{lessons:0,pending:0,review:0,absent:0,auto:0});const g=groups.get(s.class_code);g.lessons++;g.pending+=s.attendance_state!=='confirmed'?1:0;g.review+=!s.review_confirmed?1:0;g.absent+=Number(s.absent||0)+Number(s.excused||0);g.auto+=Number(s.automatic_present||0);}
    root.querySelector('.overview-tasks').innerHTML='<h3>'+title+' · '+groups.size+' lớp</h3>'+([...groups].slice(0,limit).map(([cls,g])=>'<div class="overview-task"><div><strong>Lớp '+esc(cls)+' · '+g.lessons+' tiết</strong><small>'+g.pending+' tiết chưa xác nhận · '+g.review+' tiết chưa nhận định</small><small>'+g.absent+' lượt vắng/có phép đã xác nhận · '+g.auto+' lượt có mặt tự động chờ xác nhận</small></div><button type="button" data-overview-class="'+esc(cls)+'">Xem báo cáo</button></div>').join('')||'<p>Không có lớp thuộc nhóm này.</p>')+(groups.size>limit?'<button type="button" data-overview-more>Xem thêm</button>':'');return;
   }
   root.querySelector('.overview-tasks').innerHTML='<h3>'+title+' ('+list.length+')</h3>'+(list.length?list.slice(0,limit).map(s=>'<div class="overview-task"><div><strong>Lớp '+esc(s.class_code)+' · Tiết '+s.period_no+' · '+esc(s.subject)+'</strong><small>'+esc(s.lesson_date)+' · '+esc(s.teacher_name||'')+'</small><small>'+(s.attendance_state==='legacy_unknown'?'Chưa xác định sĩ số lịch sử':s.attendance_state==='empty'?'Chưa có học sinh trong danh sách lúc mở tiết':s.confirmed+'/'+s.expected+' học sinh đã xác nhận')+(s.automatic_present?' · '+s.automatic_present+' có mặt tự động, chờ xác nhận':'')+'</small></div><button type="button" '+(scope==='own'?'data-overview-lesson="'+esc(s.id)+'"':'data-overview-class="'+esc(s.class_code)+'"')+'>'+(scope==='own'?(s.can_write?'Mở tiết':'Xem tiết'):'Xem báo cáo')+'</button></div>').join(''):'<p>Không có tiết thuộc nhóm này trong khoảng đã chọn.</p>')+(list.length>limit?'<button type="button" data-overview-more>Xem thêm</button>':'');
  }tasks();
  root.onclick=async e=>{const b=e.target.closest('button');if(!b)return;try{
   if(b.dataset.overviewFilter){filter=b.dataset.overviewFilter;limit=12;root.querySelectorAll('[data-overview-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.overviewFilter===filter)));tasks();}
   else if(b.hasAttribute('data-overview-more')){limit+=12;tasks();}
   else if(b.dataset.overviewLesson)await window.TranPhuOpenSavedLesson(b.dataset.overviewLesson);
   else if(b.dataset.overviewClass)await window.TranPhuOpenClassReport(b.dataset.overviewClass,scope==='school');
   else if(b.hasAttribute('data-overview-home'))window.TranPhuGoToEvaluation();
   else if(b.hasAttribute('data-overview-accounts'))$('openTeacherAccounts').click();
  }catch(error){root.querySelector('.overview-tasks').append(Object.assign(document.createElement('p'),{textContent:error.message,role:'alert'}));}};
 }
 $('openOverview').onclick=()=>window.TranPhuOpenOverview();$('refreshOverview').onclick=refresh;
 $('overviewScope').onclick=e=>{const b=e.target.closest('[data-scope]');if(b){scope=b.dataset.scope;refresh();}};
 $('overviewPeriod').onclick=e=>{const b=e.target.closest('[data-days]');if(b){days=Number(b.dataset.days);$('overviewPeriod').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));refresh();}};
 new MutationObserver(refresh).observe(document.body,{attributes:true,attributeFilter:['data-page']});
 new MutationObserver(setup).observe($('appView'),{attributes:true,attributeFilter:['hidden']});
 window.addEventListener('focus',()=>{if(!$('overviewPage').hidden)refresh();});setup();
})();
