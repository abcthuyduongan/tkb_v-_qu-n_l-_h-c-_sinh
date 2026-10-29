/* Read-only class reviews and homeroom reports. Database RPC enforces scope. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=()=>window.TranPhuReportsContext?.();
 const classVisible=()=>window.TranPhuReportScope?.wantsClass?.()!==false;
 const today=()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
 const day=s=>new Date(s+'T12:00:00Z'),iso=d=>d.toISOString().slice(0,10),label={week:'Tuần',month:'Tháng',semester:'Học kỳ',custom:'Khoảng ngày'};
 let result=null,stamp='',busy=false,exporting=false,exportJob=null,rangeRevision=0,requestRevision=0,queuedMake=false,schoolMode=false,renderPending=false;
 const reportMemories=new Map();let reportMemoryKey='';const memoryKey=c=>[c.userId,c.demo,c.year,schoolMode].join('|');function preserve(){if(reportMemoryKey&&$('reportFrom').value&&$('reportTo').value)reportMemories.set(reportMemoryKey,Object.fromEntries(['reportClass','reportRange','reportAnchor','reportMonth','reportTerm','reportFrom','reportTo'].map(id=>[id,$(id).value])));}
 function reportControls(){let row=$('reportControls');if(!row){row=document.createElement('div');row.id='reportControls';row.className='report-control-row';$('progressPage').querySelector('.report-toolbar').after(row);}return row;}
 function setupAudience(c){
  let box=$('reportAudience');if(!box){box=document.createElement('div');box.id='reportAudience';box.className='report-audience';reportControls().append(box);}
  box.hidden=!c.schoolViewer;if(!c.schoolViewer)schoolMode=false;
  box.innerHTML='<button type="button" data-school="false" aria-pressed="'+!schoolMode+'">Lớp được phân công</button><button type="button" data-school="true" aria-pressed="'+schoolMode+'">Ban Giám Hiệu</button>';
  box.onclick=e=>{const b=e.target.closest('[data-school]');if(!b)return;schoolMode=b.dataset.school==='true';stamp='';open();document.dispatchEvent(new Event('tranphu:report-scope')); };
 }
 function schoolYear(){const value=window.TranPhuSchoolYear?.normalize($('reportYear').value)??$('reportYear').value.trim();$('reportYear').value=value;return value;}
 function calendarDay(value){if(!value)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');}
 const category=c=>c==='positive'?'Tích cực':c==='health'?'Sức khỏe':'Cần hỗ trợ';
 function notify(text){const toast=$('toast');toast.textContent=text;toast.classList.add('show');setTimeout(()=>{if(toast.textContent===text)toast.classList.remove('show');},4000);}
 function scope(){const c=context();return {c,homeroom:c.homeroomClasses.includes($('reportClass').value),admin:c.admin||(c.schoolViewer&&schoolMode),school:c.schoolViewer&&schoolMode};}
 function invalidate(){$('parentReport').disabled=true;$('reportResult').setAttribute('aria-busy','false');exportJob?.cancel();result=null;renderPending=false;requestRevision++;$('exportReport').disabled=true;$('exportWord').disabled=true;$('printReport').disabled=true;$('reportResult').textContent='';}
 function studentOptions(students){const selected=$('reportStudent').value;$('reportStudent').innerHTML='<option value="">Tất cả học sinh</option>'+students.map(s=>`<option value="${escape(s.id)}">${escape(s.full_name)} · ${escape(s.student_code)}</option>`).join('');if(students.some(s=>s.id===selected))$('reportStudent').value=selected;}
 const monday=value=>{const d=day(value);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);};
 const addDays=(value,n)=>{const d=day(value);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
 const shortDate=value=>{const [y,m,d]=value.split('-');return d+'/'+m+'/'+y;};
 function fillWeeks(){
  const current=monday(today()),selected=monday($('reportAnchor').value||today()),year=Number(($('reportYear').value||'').slice(0,4))||Number(today().slice(0,4)),earliest=monday(year+'-01-01');
  const weeks=[];for(let date=current;date>=earliest&&weeks.length<106;date=addDays(date,-7))weeks.push(date);
  $('reportWeek').innerHTML=weeks.map(date=>`<option value="${date}">${shortDate(date)} – ${shortDate(addDays(date,6))}${date===current?' · Tuần này':''}</option>`).join('');
  $('reportWeek').value=weeks.includes(selected)?selected:weeks[0]||'';if($('reportWeek').value)$('reportAnchor').value=$('reportWeek').value;
  const index=weeks.indexOf($('reportWeek').value);$('reportWeekNext').disabled=index<=0;$('reportWeekPrev').disabled=index<0||index===weeks.length-1;
 }
 async function refreshAccess(){
  invalidate();$('makeReport').disabled=true;
  try{await window.TranPhuRefreshReportAccess?.();stamp='';open();}
  catch(error){showFailure(error);}
  finally{$('makeReport').disabled=false;}
 }
 function state(kind,title,message,action){
  const box=document.createElement('section');box.className='report-state report-state--'+kind+(kind==='error'?' report-error':'');box.setAttribute('role',kind==='error'?'alert':'status');
  const icon=document.createElement('span');icon.className='report-state-icon';icon.setAttribute('aria-hidden','true');icon.textContent=kind==='error'?'!':'i';
  const content=document.createElement('div');content.className='report-state-content';const heading=document.createElement('h3');heading.textContent=title;const detail=document.createElement('p');detail.textContent=message;content.append(heading,detail);
  const actions=document.createElement('div');actions.className='report-state-actions';
  if(action){const button=document.createElement('button');button.type='button';button.className='btn outline';button.textContent=action.label;button.onclick=action.run;actions.append(button);}
  if(kind!=='error'){const link=document.createElement('a');link.className='btn outline';link.href='/tra-cuu/?mode=teacher';link.textContent='Xem thời khóa biểu';actions.append(link);}
  content.append(actions);box.append(icon,content);$('reportResult').replaceChildren(box);$('reportResult').setAttribute('aria-busy','false');
 }
 function showFailure(error){
  const message=String(error.message||''),code=String(error.code||'');
  if(/quyền|permission|row.level|42501/i.test(message+' '+code)){state('access','Chưa có quyền xem lớp này','Lớp chưa được phân công cho tài khoản hoặc quyền vừa thay đổi. Liên hệ quản trị để kiểm tra phân công TKB.',{label:'Cập nhật quyền lớp',run:refreshAccess});return;}
  if(/chỉ xem đánh giá tuần hiện tại/i.test(message)){state('info','Chưa mở xem các tuần trước','Quản trị cần cập nhật chức năng xem lịch sử theo tuần trên máy chủ. Bạn vẫn có thể xem tuần hiện tại.',{label:'Về tuần này',run:()=>{$('reportAnchor').value=today();fillWeeks();setRange().then(make);}});return;}
  if(/đăng nhập|JWT|token|phiên|PGRST301|401/i.test(message+' '+code)){state('access','Cần kiểm tra lại phiên làm việc','Phiên đăng nhập chưa được xác nhận. Thử tải lại dữ liệu; nếu vẫn gặp thông báo này, đăng nhập lại bằng nút tài khoản.',{label:'Thử lại',run:make});return;}
  state('error','Chưa tải được đánh giá','Dịch vụ tạm thời chưa sẵn sàng. Kiểm tra kết nối và thử lại; các ghi nhận đã lưu không bị thay đổi.',{label:'Thử lại',run:make});
 }
 function noClass(){
  if(scope().admin||$('reportClass').value)return false;
  state('access','Chưa có lớp được phân công','Tài khoản đã đăng nhập nhưng chưa được cấp quyền lớp. Liên hệ quản trị để đồng bộ phân công từ thời khóa biểu.',{label:'Cập nhật quyền lớp',run:refreshAccess});
  $('makeReport').disabled=true;return true;
 }
 function updateScope(){
  const {c,admin,homeroom}=scope();$('parentReport').hidden=scope().school||!homeroom||c.admin;$('parentReport').disabled=!result;$('progressPage').querySelector('.report-actions').append($('parentReport'));
  let tabs=$('reportVisualTabs');if(!tabs){tabs=document.createElement('div');tabs.id='reportVisualTabs';tabs.className='report-visual-tabs';tabs.setAttribute('aria-label','Kỳ báo cáo');reportControls().append(tabs);tabs.innerHTML='<button type="button" data-kind="week">Tuần</button><button type="button" data-kind="month">Tháng</button><button type="button" data-kind="semester">Học kỳ</button>';tabs.onclick=async e=>{const b=e.target.closest('[data-kind]');if(!b)return;$('reportRange').value=b.dataset.kind;await setRange();await make();};}tabs.hidden=!(admin||homeroom);
  let extra=$('reportExtraFilters');if(!extra){extra=document.createElement('details');extra.id='reportExtraFilters';extra.className='report-extra-filters';const summary=document.createElement('summary');summary.textContent='Lọc thêm';extra.append(summary);const filters=$('progressPage').querySelector('.report-filters');filters.before(extra);extra.append(filters,$('reportRangeHint'));}const compact=admin||homeroom;if(extra.dataset.compact!==String(compact)){extra.open=!compact;extra.dataset.compact=String(compact);}extra.querySelector('summary').hidden=!compact;
  for(const option of $('reportRange').options)option.hidden=option.value==='custom'?!admin:option.value!=='week'&&!admin&&!homeroom;
  if($('reportRange').selectedOptions[0]?.hidden)$('reportRange').value='week';
  $('exportReport').hidden=$('exportWord').hidden=scope().school||!(admin||homeroom);$('progressPage').classList.toggle('teacher-week-view',!(admin||homeroom));for(const id of ['reportYear','reportRange','reportFrom','reportTo','reportStudent'])$(id).closest('label').hidden=!(admin||homeroom);if(!admin&&!homeroom){$('reportRange').value='week';$('reportStudent').value='';}$('printReport').hidden=scope().school||!(admin||homeroom);
  $('makeReport').textContent=admin||homeroom?'Xem':'Làm mới';$('makeReport').setAttribute('aria-label',admin||homeroom?'Xem báo cáo theo lựa chọn':'Làm mới đánh giá theo tuần');$('makeReport').hidden=!admin&&!c.classes.length;
  $('reportHeading').textContent=scope().school?'Ban Giám Hiệu · Báo cáo toàn trường':admin?'Báo cáo học sinh':homeroom?'Báo cáo lớp chủ nhiệm':'Đánh giá theo tuần';
  $('reportScope').hidden=$('reportClass').closest('label').hidden=!admin&&!c.classes.length;
  $('reportScope').textContent=$('reportClass').value?'Lớp '+$('reportClass').value:admin?'Toàn trường':'Chưa có lớp được phân công';
  $('reportYear').readOnly=!admin;$('reportStudent').disabled=admin&&!$('reportClass').value;if($('reportStudent').disabled)$('reportStudent').value='';
  studentOptions(c.students.filter(s=>!$('reportClass').value||s.class_code===$('reportClass').value));
 }
 async function setRange(){
  invalidate();const revision=++rangeRevision,kind=$('reportRange').value;
  $('reportVisualTabs')?.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===kind)));
  $('reportAnchorWrap').hidden=kind!=='week';$('reportMonthWrap').hidden=kind!=='month';$('reportTermWrap').hidden=kind!=='semester';
  $('reportFrom').readOnly=$('reportTo').readOnly=['week','month'].includes(kind);
  $('reportRangeHint').hidden=true;const teacher=!scope().admin&&!scope().homeroom;$('reportWeekWrap').hidden=!teacher||!context().classes.length;$('reportAnchorWrap').hidden=teacher||kind!=='week';if(teacher)fillWeeks();
  if(kind==='week'){const start=day($('reportAnchor').value||today());start.setUTCDate(start.getUTCDate()-((start.getUTCDay()+6)%7));const end=new Date(start);end.setUTCDate(end.getUTCDate()+6);$('reportFrom').value=iso(start);$('reportTo').value=iso(end);}
  if(kind==='month'){const month=$('reportMonth').value||today().slice(0,7);$('reportFrom').value=month+'-01';const end=day(month+'-01');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);$('reportTo').value=iso(end);}
  if(kind==='semester'){
   $('reportFrom').value='';$('reportTo').value='';
   try{const c=context();if(!c.demo){const r=await c.client.from('tkb_school_calendars').select('*').eq('school_year',schoolYear()).maybeSingle();if(r.error)throw r.error;if(revision!==rangeRevision)return;const weeks=r.data&&window.SchoolCalendar?.weeks(r.data).filter(w=>w.term===Number($('reportTerm').value));if(weeks?.length){$('reportFrom').value=weeks[0].start;$('reportTo').value=weeks.at(-1).end;return;}}}catch(error){console.warn('School calendar unavailable',error.message);notify(error.message);}
   if(revision!==rangeRevision)return;$('reportRangeHint').textContent='Chọn ngày bắt đầu và kết thúc học kỳ theo lịch của trường.';$('reportRangeHint').hidden=false;$('reportExtraFilters').open=true;
  }
 }
 function open(){
  const c=context();if(!c||!classVisible())return;
  setupAudience(c);
  const key=[c.userId,c.demo,c.admin,c.schoolViewer,schoolMode,c.year,c.classCode,c.homeroomClasses.join(','),c.classes.join(','),today()].join('|');
  if(key===stamp){if(renderPending&&result){renderPending=false;render();}return;}stamp=key;invalidate();
  $('reportYear').value=c.year;const reportClasses=schoolMode?c.schoolClasses:c.classes;$('reportClass').innerHTML=(scope().admin?'<option value="">Toàn trường</option>':'')+reportClasses.map(cls=>`<option value="${escape(cls)}">Lớp ${escape(cls)}</option>`).join('');
  const wanted=c.homeroomClasses[0]||c.classCode;$('reportClass').value=schoolMode?'':reportClasses.includes(wanted)?wanted:c.admin?'':reportClasses[0]||'';if(!scope().admin&&!reportClasses.length)$('reportClass').innerHTML='<option value="">Chưa có lớp được phân công</option>';$('reportClass').disabled=!scope().admin&&!reportClasses.length;
  reportMemoryKey=memoryKey(c);const saved=reportMemories.get(reportMemoryKey);$('reportAnchor').value=saved?.reportAnchor||today();$('reportMonth').value=saved?.reportMonth||today().slice(0,7);$('reportRange').value=saved?.reportRange||'week';if(saved){if([...$('reportClass').options].some(o=>o.value===saved.reportClass))$('reportClass').value=saved.reportClass;for(const id of ['reportTerm','reportFrom','reportTo'])if(saved[id])$(id).value=saved[id];}updateScope();$('makeReport').disabled=!scope().admin&&!$('reportClass').value;setRange().then(()=>{if(!noClass()&&!scope().admin&&!scope().homeroom)make();});
 }
 function demoReport(c,from,to){
  const cls=$('reportClass').value,students=c.students.filter(s=>!cls||s.class_code===cls),sessions=c.session&&c.session.lesson_date>=from&&c.session.lesson_date<=to?[{...c.session,class_code:c.classCode,teacher_name:c.profile?.teacher_name}]:[];
  const observations=c.observations.filter(o=>{const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(o.observed_at));return date>=from&&date<=to&&(!cls||o.class_code===cls);});
  return {lesson_reviews:[...(window.TranPhuLessonReview?.demoRows.values()||[])],attendance:c.attendance.filter(a=>sessions.some(s=>s.id===a.session_id)),students:students.map(st=>{const a=c.attendance.filter(a=>sessions.some(s=>s.id===a.session_id)&&a.student_id===st.id);const own=observations.filter(o=>o.student_id===st.id);return {...st,positive:own.filter(o=>o.category==='positive').length,concern:own.filter(o=>o.category==='concern').length,health:own.filter(o=>o.category==='health').length,total_sessions:sessions.length,confirmed:a.length,present:a.filter(x=>x.status==='present').length,absent:a.filter(x=>x.status==='absent').length,late:a.filter(x=>x.status==='late').length,excused:a.filter(x=>x.status==='excused').length};}),sessions,observations,details_included:true};
 }
 function scopedSessions(data,selected){if(!selected)return data.sessions;const cls=data.students.find(s=>s.id===selected)?.class_code;return data.sessions.filter(s=>s.class_code===cls).map(s=>{const attendance=(data.attendance||[]).filter(a=>a.session_id===s.id&&a.student_id===selected),notes=data.observations.filter(o=>o.session_id===s.id&&o.student_id===selected);return {...s,attendance_confirmed:attendance.length,present:attendance.filter(a=>a.status==='present').length,absent:attendance.filter(a=>a.status==='absent').length,late:attendance.filter(a=>a.status==='late').length,excused:attendance.filter(a=>a.status==='excused').length,positive:notes.filter(o=>o.category==='positive').length,concern:notes.filter(o=>o.category==='concern').length,health:notes.filter(o=>o.category==='health').length};});}
 function table(headers,rows){return `<div class="report-table-wrap tableScroller"><table class="reportTable"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}" class="muted">Chưa có dữ liệu trong khoảng đã chọn.</td></tr>`}</tbody></table></div>`;}
 function cDemoHealth(){return context()?.demo===true;}
 function render(){
  if(!result)return;const selected=$('reportStudent').value,data=result.data,students=data.students.filter(s=>!selected||s.id===selected),observations=data.observations.filter(o=>!selected||o.student_id===selected),attendance=(data.attendance||[]).filter(a=>!selected||a.student_id===selected),sessions=scopedSessions(data,selected),aggregateAllowed=data.permissions?.aggregate??(scope().admin||scope().homeroom);
  const summary=`<p class="report-period">${escape(result.classLabel)} · ${escape(result.periodLabel)} · ${escape(result.from)} → ${escape(result.to)}</p>`;
  $('reportResult').innerHTML=summary+'<div id="reportDashboardMount"></div><div id="homeroomStudentMount"></div><div id="classReviewMount"></div>';
  window.TranPhuReportDashboard?.mount($('reportDashboardMount'),{...data,students,sessions,observations,attendance,completion:selected?null:data.completion,permissions:{...data.permissions,aggregate:aggregateAllowed,health:data.permissions?.health===true||cDemoHealth()}},{onClass:scope().admin?async cls=>{$('reportClass').value=cls;updateScope();await make();}:null});
  const studentMount=$('homeroomStudentMount');if(scope().homeroom&&!scope().school&&!scope().c.admin)window.TranPhuHomeroomEvidence?.mount(studentMount,{...data,students,sessions,observations,attendance,teacherNames:context()?.teacherNames},{onStudent:id=>{$('reportStudent').value=id;render();}});
  const mount=$('classReviewMount');
  if(!data.range?.class_code&&!$('reportClass').value){
   if(aggregateAllowed){const issues=students.filter(st=>Number(st.concern||0)>0||Number(st.absent||0)>0||Number(st.late||0)>0);if(issues.length)mount.innerHTML='<h3>Tổng hợp nội dung cần cải thiện</h3>'+table(['Lớp','Mã HS','Học sinh','Ghi nhận cần cải thiện','Vắng','Muộn'],issues.map(st=>[escape(st.class_code),escape(st.student_code),escape(st.full_name),st.concern||0,st.absent||0,st.late||0]));}
  }else if(window.TranPhuClassReview){window.TranPhuClassReview.mount(mount,{from:result.from,to:result.to,classCode:$('reportClass').value,students,sessions,observations,attendance,aggregateAllowed,lessonReviews:selected?[]:(data.lesson_reviews||[])});}
  $('parentReport').disabled=scope().c.admin||!scope().homeroom||scope().school||$('reportRange').value!=='week';
  $('exportReport').disabled=false;$('exportWord').disabled=false;$('printReport').disabled=false;
  window._applyGvcnView?.();
 }
 async function make(){
  if(!classVisible())return;if(busy){queuedMake=true;return;}const c=context();if(noClass())return;if(!scope().admin&&!scope().homeroom){$('reportRange').value='week';await setRange();if(!classVisible())return;if(busy){queuedMake=true;return;}}const from=$('reportFrom').value,to=$('reportTo').value,kind=$('reportRange').value,cls=$('reportClass').value;
  if(!from||!to||from>to)return notify('Chọn khoảng ngày hợp lệ.');
  const revision=++requestRevision;busy=true;$('makeReport').disabled=true;result=null;$('exportReport').disabled=$('exportWord').disabled=$('printReport').disabled=true;$('reportResult').setAttribute('aria-busy','true');$('reportResult').textContent='Đang tải đánh giá…';
  try{const year=schoolYear();let data;if(c.demo)data=demoReport(c,from,to);else{const isSchool=scope().school,[r,completion,handoff]=await Promise.all([c.client.rpc(isSchool?'v4_school_report':'v4_class_report',{y:year,c:cls,d1:from,d2:to,range_kind:kind,include_details:!(scope().admin&&!cls)}),c.client.rpc('v4_report_completion',{y:year,c:cls,d1:from,d2:to,scope_kind:isSchool?'school':'class'}),cls&&!isSchool?c.client.rpc('v4_lesson_handoffs',{y:year,c:cls,d1:from,d2:to,range_kind:kind}):Promise.resolve({data:null})]);if(r.error)throw r.error;if(completion.error)throw completion.error;if(handoff.error)throw handoff.error;if(revision!==requestRevision)return;data=r.data;Object.assign(data,completion.data);if(cls&&!isSchool){const reviews=new Map((handoff.data||[]).map(row=>[String(row.session_id),row]));for(const row of data.lesson_reviews||[])if(!reviews.has(String(row.session_id)))reviews.set(String(row.session_id),row);data.lesson_reviews=[...reviews.values()];}}
   if(revision!==requestRevision||context()?.userId!==c.userId)return;data.students=data.students||[];data.sessions=data.sessions||[];data.observations=data.observations||[];
   studentOptions(data.students);result={data,from,to,classLabel:cls?'Lớp '+cls:'Toàn trường',periodLabel:kind==='semester'?$('reportTerm').selectedOptions[0].textContent:label[kind],schoolYear:$('reportYear').value};if(classVisible())render();else renderPending=true;
  }catch(error){if(revision===requestRevision)showFailure(error);}
  finally{busy=false;$('makeReport').disabled=!scope().admin&&!$('reportClass').value;if(revision===requestRevision)$('reportResult').setAttribute('aria-busy','false');if(queuedMake){queuedMake=false;setTimeout(make,0);}}

 }
 function exportData(){
  if(!result)throw Error('Cần tổng hợp trước');const selected=$('reportStudent').value,data=result.data,students=data.students.filter(s=>!selected||s.id===selected),observations=data.observations.filter(o=>!selected||o.student_id===selected),selectedClass=students[0]?.class_code,sessions=scopedSessions(data,selected);
  return {lessonReviews:selected?[]:(data.lesson_reviews||[]),aggregateAllowed:data.permissions?.aggregate??(scope().admin||scope().homeroom),deficienciesOnly:!!(scope().admin||scope().homeroom),rawAttendance:(data.attendance||[]).filter(a=>!selected||a.student_id===selected),detailsIncluded:data.details_included!==false,title:'BÁO CÁO HỌC SINH – TRẦN PHÚ',schoolYear:result.schoolYear,classLabel:selected?('Lớp '+selectedClass+' · '+students[0].full_name):result.classLabel,periodLabel:result.periodLabel,from:result.from,to:result.to,generatedAt:new Date().toISOString(),students,observations,sessions,attendance:students.map(s=>({...s,student_id:s.id})),totals:[{name:'Nội dung cần cải thiện',count:students.reduce((n,st)=>n+Number(st.concern||0),0)},{name:'Lượt vắng',count:students.reduce((n,st)=>n+Number(st.absent||0),0)},{name:'Lượt đi muộn',count:students.reduce((n,st)=>n+Number(st.late||0),0)}].filter(item=>item.count>0),contextNote:(data.permissions?.health===false?'Không bao gồm nội dung sức khỏe ngoài phạm vi quyền được cấp. ':'')+'Điểm danh tự động chờ xác nhận được thống kê riêng, không đưa vào tỷ lệ có mặt đã xác nhận. '+(selected?'Trạng thái chờ xác nhận của cả tiết xem trong báo cáo lớp. ':((data.completion||[]).reduce((n,s)=>n+Number(s.automatic_present||0),0))+' lượt có mặt tự động chờ xác nhận. ')+'Chỉ tính các tiết và ghi nhận trên ứng dụng. Chưa xác nhận không đồng nghĩa vắng. Sĩ số là danh sách hiện tại; số tiết mở là của lớp, không phải số tiết bắt buộc của từng học sinh. Không tự xếp loại học sinh.'+(data.details_included===false?' Báo cáo toàn trường chỉ gồm số liệu tổng hợp.':'')};
 }
 window.addEventListener('focus',()=>{if(!$('progressPage').hidden)open();});window.addEventListener('tranphu:lesson-review-saved',()=>{stamp='';invalidate();});window.addEventListener('tranphu:observation-changed',()=>{stamp='';invalidate();});$('makeReport').onclick=make;$('reportStudent').onchange=()=>{exportJob?.cancel();if(result)render();};
 $('reportClass').onchange=()=>{updateScope();setRange().then(()=>{if(!scope().admin&&!scope().homeroom)make();});};$('reportRange').onchange=setRange;$('reportAnchor').onchange=setRange;$('reportMonth').onchange=setRange;$('reportTerm').onchange=setRange;$('reportYear').onchange=()=>{invalidate();setRange();};
 $('reportWeek').onchange=()=>{$('reportAnchor').value=$('reportWeek').value;setRange().then(make);};
 const shiftWeek=amount=>{const select=$('reportWeek'),next=select.selectedIndex+amount;if(next<0||next>=select.options.length)return;select.selectedIndex=next;select.onchange();};
 $('reportWeekPrev').onclick=()=>shiftWeek(1);$('reportWeekNext').onclick=()=>shiftWeek(-1);$('reportWeekCurrent').onclick=()=>{$('reportAnchor').value=today();fillWeeks();setRange().then(make);};
 for(const id of ['reportFrom','reportTo'])$(id).onchange=()=>{rangeRevision++;invalidate();};
 async function downloadReport(kind){
  if(exporting)return;let data;try{data=exportData();if(kind==='word'&&!data.aggregateAllowed)return;}catch(error){notify(error.message);return;}
  if(scope().school||result?.data.permissions?.export===false||!scope().admin&&!scope().homeroom)return;const revision=requestRevision;exporting=true;$('exportReport').disabled=$('exportWord').disabled=true;
  const status=$('reportExportStatus'),cancel=$('cancelReportExport');if(status){status.hidden=false;status.textContent='Đang chuẩn bị tệp…';}if(cancel)cancel.hidden=false;
  try{if(window.Worker&&window.TranPhuReportJobs){exportJob=window.TranPhuReportJobs.start(kind,data,phase=>{if(status)status.textContent=phase==='building'?'Đang tạo tệp…':'Đang tải công cụ xuất…';});const output=await exportJob.promise;if(revision===requestRevision&&result)window.TranPhuReportJobs.save(output);}else{await window.TranPhuAssets?.excel();await window.TranPhuFeatures?.exporter();if(revision===requestRevision&&result)window.TranPhuReportExport[kind](data);}}
  catch(error){notify(error.name==='AbortError'?'Đã hủy xuất báo cáo.':error.message);}finally{exporting=false;exportJob=null;if(status)status.hidden=true;if(cancel)cancel.hidden=true;if(result){$('exportReport').disabled=false;$('exportWord').disabled=false;}}
 }
 if($('cancelReportExport'))$('cancelReportExport').onclick=()=>exportJob?.cancel();
 $('exportReport').onclick=()=>downloadReport('xlsx');$('exportWord').onclick=()=>downloadReport('word');
 // Print from the authorized result, never from the currently selected cell/week.
 // This includes the entire requested period and excludes health/positive records.
 function printContent(r){
  const students=new Map(r.students.map(s=>[String(s.id),s])),sessions=new Map(r.sessions.map(s=>[String(s.id),s]));
  const person=id=>{const s=students.get(String(id));return s?[s.student_code,s.full_name,s.class_code].filter(Boolean).map(escape).join(' · '):'';};
  let content='<h1>Báo cáo '+escape(r.classLabel)+'</h1><p>'+escape(r.schoolYear)+' · '+escape(r.periodLabel)+' · '+escape(r.from)+' → '+escape(r.to)+'</p>';
  const issues=r.students.filter(s=>Number(s.concern)>0||Number(s.absent)>0||Number(s.late)>0);
  if(issues.length)content+='<h2>Tổng hợp nội dung cần cải thiện</h2>'+table(['Học sinh','Nhận xét cần cải thiện','Vắng','Muộn'],issues.map(s=>[person(s.id),Number(s.concern)||0,Number(s.absent)||0,Number(s.late)||0]));
  if(r.lessonReviews?.length)content+='<h2>Nhận định chung tiết học</h2>'+table(['Tiết học','Nguồn','Trạng thái','Nội dung','Giáo viên xác nhận'],r.lessonReviews.map(v=>{const lesson=sessions.get(String(v.session_id)),system=v.source==='system',stage={in_progress:'Đang trong tiết',final:'Đã kết thúc tiết',unknown:'Chưa xác định giờ kết thúc'}[v.stage]||'';return [escape(lesson?lesson.lesson_date+' · Tiết '+lesson.period_no+' · '+lesson.subject:''),system?'Tổng hợp hệ thống':'Giáo viên đã xác nhận',escape(stage),escape(v.note),system?'':escape(v.teacher_name||lesson?.teacher_name||'')];}));const notes=r.observations.filter(o=>o.category==='concern');
  if(notes.length)content+='<h2>Ghi nhận cần cải thiện</h2>'+table(['Ngày / tiết','Học sinh','Nội dung','Giáo viên'],notes.map(o=>{const s=sessions.get(String(o.session_id));return [escape(s?s.lesson_date+' · Tiết '+s.period_no+' · '+s.subject:calendarDay(o.lesson_date||o.observed_at)+' · Ngoài tiết học'),person(o.student_id),[o.behavior_code,o.note].filter(Boolean).map(escape).join('<br>'),escape(o.teacher_name||s?.teacher_name||'')];}));
  const attendance=r.rawAttendance.filter(a=>['absent','late'].includes(a.status)&&sessions.has(String(a.session_id)));
  if(attendance.length)content+='<h2>Vắng và đi muộn</h2>'+table(['Ngày / tiết','Học sinh','Điểm danh','Ghi chú'],attendance.map(a=>{const s=sessions.get(String(a.session_id));return [escape(s.lesson_date+' · Tiết '+s.period_no+' · '+s.subject),person(a.student_id),a.status==='absent'?'Vắng':'Đến muộn',escape(a.note||'')];}));
  if(r.detailsIncluded===false)content+='<p>Báo cáo toàn trường chỉ gồm số liệu tổng hợp.</p>';
  return content;
 }
 $('parentReport').onclick=()=>{if(window.TranPhuParentReport)return window.TranPhuParentReport.open();const button=$('parentReport');button.disabled=true;const script=document.createElement('script');script.src='/assets/parent-report.js?v=81';script.onload=()=>{button.disabled=false;window.TranPhuParentReport.open();};script.onerror=()=>{script.remove();button.disabled=false;notify('Chưa tải được công cụ thông báo. Hãy thử lại.');};document.head.append(script);};
 $('printReport').onclick=()=>{if(!result)return;const r=exportData();if(!r.aggregateAllowed||scope().school||result.data.permissions?.export===false)return;const content=printContent(r),printWindow=window.open('','_blank');if(!printWindow)return notify('Cho phép mở cửa sổ để in báo cáo.');printWindow.document.write('<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Báo cáo Trần Phú</title><style>@page{size:A4;margin:15mm}body{font:12px Arial;color:#14284b}h1{font-size:20px}h2{font-size:15px;margin-top:22px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #aaa;padding:6px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{margin:8px 0}.tableScroller{overflow:visible;max-height:none}</style></head><body>'+content+'</body></html>');printWindow.document.close();printWindow.print();};
 document.addEventListener('tranphu:roster-changed',event=>{const change=event.detail;if(change?.year===$('reportYear').value&&(!$('reportClass').value||$('reportClass').value===change.classCode)){stamp='';invalidate();}});
  function setupGvcnViewTabs(){
  const container=$('gvcnReportTabs');
  if(!container)return;
  let activeView='all';
  function applyView(view){
   activeView=view;
   container.querySelectorAll('button[data-gvcn-view]').forEach(btn=>{
    const on=btn.dataset.gvcnView===view;
    btn.classList.toggle('on',on);
    btn.setAttribute('aria-pressed',String(on));
   });
   const dashMount=$('reportDashboardMount');
   const reviewMount=$('classReviewMount');const studentMount=$('homeroomStudentMount');if(studentMount)studentMount.hidden=!(view==='all'||view==='students');
   const supportSec=$('supportSection');
   const supportAllowed=context()?.canSupport===true;
   const supportTab=container.querySelector('[data-gvcn-view="support"]');
   if(supportTab)supportTab.hidden=!supportAllowed;
   if(dashMount)dashMount.style.display=(view==='all'||view==='stats')?'':'none';
   if(reviewMount)reviewMount.style.display=(view==='all'||view==='review')?'':'none';
   if(supportSec){
    supportSec.hidden=!supportAllowed||!(view==='all'||view==='support');
    if(view==='support'&&supportAllowed){
     supportSec.hidden=false;supportSec.open=true;
     try{supportSec.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){supportSec.scrollIntoView(true);}
    }
   }
  }
  container.querySelectorAll('button[data-gvcn-view]').forEach(btn=>{
   btn.addEventListener('click',()=>applyView(btn.dataset.gvcnView));
  });
  window._applyGvcnView=()=>applyView(activeView);window._applyGvcnViewTo=applyView;
 }
 setupGvcnViewTabs();
 window.TranPhuReports={open,make,preserve,isSchoolMode:()=>schoolMode,parentContext:()=>result&&!scope().c.admin&&scope().homeroom&&!scope().school&&$('reportRange').value==='week'?{...result,selected:$('reportStudent').value}:null};if(document.body.dataset.page==='progress')open();
})();
