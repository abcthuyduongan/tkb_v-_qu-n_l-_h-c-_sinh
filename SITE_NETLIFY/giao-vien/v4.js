/* TH&THCS Tran Phu V4 – phần mới; không sửa JS TKB cũ. */
(()=>{'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cfg=window.TKB_CONFIG||{},sb=window.TkbAuth?.client||window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
// School date/time is fixed to Vietnam, regardless of the phone's time-zone setting.
const schoolClock=()=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const defaultSchoolTimes=()=>[['07:15','08:00'],['08:00','08:45'],['08:55','09:40'],['09:40','10:25'],['10:30','11:15']].map(([start_time,end_time],i)=>({period_no:i+1,start_time,end_time}));
const periodAt=(minutes,times)=>times.find(x=>{const toMinutes=t=>{const[a,b]=t.split(':').map(Number);return a*60+b};return minutes>=toMinutes(x.start_time)&&minutes<toMinutes(x.end_time)});
const dateLocal=()=>{const p=schoolClock();return `${p.year}-${p.month}-${p.day}`};
const schoolDateOf=value=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
const tkbDay=ymd=>{let d=new Date(String(ymd).slice(0,10)+'T12:00:00Z').getUTCDay();return d===0?8:d+1;};
const demoAllowed=cfg.offlineTest===true||cfg.enableDemo===true||location.protocol==='about:';
let authGeneration=0,portalOpening=null,loginLanding=false,loginConfirmed=false;
const confirmedAuthKey='tranphu-auth-confirmed-v1',tkbCacheKey='tranphu-active-tkb-cache-v1';
const readConfirmedUser=()=>{try{return localStorage.getItem(confirmedAuthKey)||'';}catch{return '';}};
const isLoginConfirmed=uid=>loginConfirmed||(!!uid&&readConfirmedUser()===uid);
const setLoginConfirmed=uid=>{loginConfirmed=!!uid;try{if(uid)localStorage.setItem(confirmedAuthKey,uid);else localStorage.removeItem(confirmedAuthKey);}catch{}};
const translateAuthError=e=>{const m=String(e?.message||e||'');if(/invalid login credentials/i.test(m))return 'Sai tên đăng nhập hoặc mật khẩu. Vui lòng kiểm tra lại.';if(/email not confirmed/i.test(m))return 'Tài khoản chưa được kích hoạt.';if(/rate limit|too many requests/i.test(m))return 'Đăng nhập quá nhiều lần. Vui lòng đợi ít phút rồi thử lại.';if(/failed to fetch|networkerror|load failed/i.test(m))return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng Internet và thử lại.';return m||'Đăng nhập thất bại';};
const S={offlineMode:false,serverDay:'',cacheVerifiedAt:0,pendingOps:[],rotation:null,rotationSaving:false,classDataKey:'',manualLesson:false,lessonPlan:null,yearIssue:'',daily:null,dailyError:'',demo:false,user:null,profile:null,admin:false,schoolViewer:false,access:[],year:'2026-2027',cls:'',period:1,subject:'',date:dateLocal(),session:null,mode:'attendance',groupPage:0,selected:null,students:[],seats:[],layout:[4,4,4,4],layoutConfirmed:false,tkbAssignments:[],registeredTeachers:[],attendance:[],automaticAttendance:[],obs:[],openAlerts:[],actions:[],support:[],behaviors:[],times:[],teacherNames:{},tkb:[],tkbVersion:null,importRows:[],reportRows:[],reportTotals:[],reportAttendance:[],renderPage:'home'};
const Offline=window.TranPhuOffline;
let clientChangeRevision=0,cacheSaving=false,cacheSaveAgain=false,cachedVerification=null;
const portalFields=['attendanceReadAt','attendanceReadKey','user','profile','admin','schoolViewer','access','year','cls','period','subject','date','mode','students','seats','layout','layoutConfirmed','rotation','attendance','automaticAttendance','sessionRosterIds','session','teacherNames','times','behaviors','tkb','tkbVersion','tkbAssignments','lessonPlan','classDataKey','manualLesson','registeredTeachers','daily','dailyError'];
function offlineScope(op){const l=op.lesson,x=S.session;return !!x&&l.school_year===x.school_year&&l.class_code===x.class_code&&l.lesson_date===x.lesson_date&&Number(l.period_no)===Number(x.period_no);}
function lessonEnvelope(lesson=S.session){return {id:lesson.id,school_year:lesson.school_year||S.year,class_code:lesson.class_code||S.cls,lesson_date:lesson.lesson_date||S.date,period_no:lesson.period_no||S.period,subject:lesson.subject||S.subject,timetable_version_id:lesson.timetable_version_id||null,source:lesson.source||'tkb',override_reason:lesson.override_reason||'',teacher_id:S.user?.id};}
function configureOffline(){if(!Offline||S.demo||!S.user?.id)return;Offline.configure(S.user.id,()=>({studentName:id=>S.students.find(student=>student.id===id)?.full_name||'',beforeReload:async()=>{await persistStudentDraft();await window.TranPhuSaveReviewDraft?.();await savePortalCache();}}));}
async function savePortalCache(){
 if(!Offline||S.demo||!S.user?.id||!S.ready)return;if(cacheSaving){cacheSaveAgain=true;return;}cacheSaving=true;
 try{configureOffline();const state=Object.fromEntries(portalFields.map(k=>[k,S[k]]));state.user={id:S.user.id,email:S.user.email,app_metadata:{force_password_change:!!S.user.app_metadata?.force_password_change}};state.obs=S.obs.filter(o=>schoolDateOf(o.observed_at)===S.serverDay||S.openAlerts.some(a=>a.id===o.id));state.openAlerts=S.openAlerts;
  await Offline.cachePut('portal',{format:1,savedAt:Date.now(),verifiedAt:S.cacheVerifiedAt,serverDay:S.serverDay,state});
 }catch{/* Storage failure is shown by the shared connection bar. */}finally{cacheSaving=false;if(cacheSaveAgain){cacheSaveAgain=false;queueMicrotask(savePortalCache);}}
}
async function saveClassCache(){if(!Offline||S.demo||!S.user?.id)return;try{configureOffline();await Offline.cachePut('class:'+S.year+'|'+S.cls,{students:S.students,seats:S.seats,layout:S.layout,layoutConfirmed:S.layoutConfirmed,rotation:S.rotation,obs:S.obs.filter(o=>schoolDateOf(o.observed_at)===S.serverDay||S.openAlerts.some(a=>a.id===o.id)),openAlerts:S.openAlerts,daily:S.daily,serverDay:S.serverDay,savedAt:Date.now()});}catch{}}
async function saveLessonCache(){if(!Offline||S.demo||!S.session||S.session.teacher_id!==S.user?.id)return;try{configureOffline();await Offline.cachePut('lesson:'+S.session.id,{session:S.session,attendance:S.attendance,automaticAttendance:S.automaticAttendance,sessionRosterIds:S.sessionRosterIds});await savePortalCache();}catch{}}
async function refreshPending(){if(Offline&&!S.demo)try{S.pendingOps=await Offline.list();}catch{}}
function pendingAttendance(id){const op=[...S.pendingOps].reverse().find(o=>offlineScope(o)&&(o.kind==='attendance'&&o.payload.student_id===id||o.kind==='confirm'&&o.payload.roster_ids.includes(id)));if(!op||op.kind==='attendance')return op;const expected=op.payload.expected_rows.find(r=>r.student_id===id),prior=S.pendingOps.find(o=>o.id===expected?.previousOperation),row=prior?.payload||expected||S.attendance.find(a=>a.student_id===id);return {...op,payload:{student_id:id,status:row?.status||'present',note:row?.note||''}};}
function canQueueHere(){if(S.admin||!S.user?.id||!S.access.some(a=>a.school_year===S.year&&a.class_code===S.cls))throw Error('Tài khoản không có quyền ghi nhận lớp này.');if(S.offlineMode&&(S.serverDay!==dateLocal()||Date.now()-S.cacheVerifiedAt>86400000))throw Error('Bản lưu chưa được xác minh cho ngày học hôm nay. Kết nối lại trước khi mở hoặc ghi tiết mới.');}
async function durableChange(kind,lesson,payload,base,write){
 if(!Offline)return {result:await write({id:crypto.randomUUID()})};canQueueHere();configureOffline();
 const pendingLesson=kind!=='open'&&(S.session?._pending||S.pendingOps.some(op=>op.kind==='open'&&offlineScope(op)));const pendingDependency=!!base?.previousOperation||kind==='confirm'&&payload.expected_rows.some(r=>r.previousOperation);
 const result=await Offline.run(kind,lesson,payload,base,async op=>{const result=await write(op);if(!result.session||result.session.school_year!==lesson.school_year||result.session.class_code!==lesson.class_code||result.session.lesson_date!==lesson.lesson_date||Number(result.session.period_no)!==Number(lesson.period_no))result.session={...lesson};return result;},{queue:S.offlineMode||pendingLesson||pendingDependency});clientChangeRevision++;await refreshPending();return result;
}
function draftKey(){return S.session&&S.selected?'draft:'+S.session.id+'|'+S.selected+'|'+S.mode:null;}
let draftWrites=Promise.resolve();
async function persistStudentDraft(){if(!Offline||S.demo||!S.user?.id)return;const key=draftKey();if(!key)return;const note=$('obsNote')||$('attNote');if(!note)return;try{const value={note:note.value,behavior:chosenBehavior,alert:!!$('obsAlert')?.checked};draftWrites=draftWrites.catch(()=>{}).then(()=>Offline.cachePut(key,value));await draftWrites;}catch{}}
async function restoreStudentDraft(){if(!Offline||S.demo)return;const key=draftKey(),student=S.selected,mode=S.mode;if(!key)return;const draft=await Offline.cacheGet(key);if(!draft||draftKey()!==key||S.selected!==student||S.mode!==mode)return;const note=mode==='observe'?$('obsNote'):$('attNote');if(note&&!note.value&&draft.note)note.value=draft.note;if(mode==='observe'&&draft.behavior&&!chosenBehavior){const button=[...document.querySelectorAll('#studentPanel [data-behavior]')].find(b=>b.dataset.behavior===draft.behavior.join('|'));if(button){chosenBehavior=draft.behavior;if($('obsAlert'))$('obsAlert').checked=!!draft.alert;}}}
async function removeStudentDraft(){if(Offline&&!S.demo&&draftKey())try{const key=draftKey();await draftWrites;await Offline.cacheRemove(key);}catch{}}
async function restoreCachedPortal(){
 if(!Offline||S.demo||S.ready)return false;const user=window.TkbAuth?.cachedUser?.();if(!user?.id||!isLoginConfirmed(user.id)||user.app_metadata?.force_password_change)return false;
 Offline.configure(user.id);const cached=await Offline.cacheGet('portal');if(!cached||cached.state?.user?.id!==user.id||Date.now()-cached.verifiedAt>7*86400000)return false;
 Object.assign(S,cached.state,{user,offlineMode:true,serverDay:cached.serverDay,cacheVerifiedAt:cached.verifiedAt||0,ready:true,demo:false,support:[],pendingOps:[]});configureOffline();await refreshPending();
 if(S.session){const mode=S.mode;advanceAttendanceStage();S.mode=mode;}$('logout').hidden=false;$('who').textContent=S.profile?.teacher_name||'Giáo viên';$('modeLabel').hidden=true;authView('app');renderHomeSelectors();
 const query=new URL(location.href).searchParams,page=query.get('page')||(S.session?'class':'overview');await showPage(page==='class'&&!S.session?'home':page);Offline.setStale(true);return true;
}
async function verifyCachedPortal(){
 if(cachedVerification||!Offline||!S.offlineMode)return cachedVerification;const generation=authGeneration,uid=S.user?.id;
 cachedVerification=(async()=>{try{
  await Offline.timeout(window.TkbAuth.ready,10000);const auth=await Offline.timeout(sb.auth.getSession(),10000);if(auth.error)throw auth.error;
  if(auth.data?.session?.user?.id!==uid)throw Error('Cần đăng nhập lại đúng tài khoản.');const verified=await Offline.timeout(sb.auth.getUser(),10000);if(verified.error)throw verified.error;
  if(verified.data.user?.app_metadata?.force_password_change){await Offline.clearSnapshots(uid);S.ready=false;authView('password');window.TranPhuAccounts?.requirePasswordChange(verified.data.user);return;}
  const [a,p,gr,ti,br,tr,sr,day,tkb]=await Promise.all([sb.rpc('v4_admin'),sb.from('v4_teachers').select('*').eq('user_id',uid).maybeSingle(),sb.from('v4_class_access').select('school_year,class_code,role').eq('user_id',uid),sb.from('v4_lesson_times').select('*').order('period_no'),sb.from('v4_behaviors').select('*').order('sort_order').order('id'),sb.from('v4_teachers').select('user_id,teacher_name,teacher_code'),sb.rpc('v4_school_report_access'),sb.rpc('v4_school_today'),fetchTimetableData()]);
  for(const r of [a,p,gr,ti,br,tr,day])if(r.error)throw r.error;if(generation!==authGeneration||S.user?.id!==uid)return;
  const lost=S.access.some(old=>!gr.data?.some(now=>now.school_year===old.school_year&&now.class_code===old.class_code));if(lost)await Offline.clearSnapshots(uid);
  Object.assign(S,tkb,{user:verified.data.user,admin:!!a.data,schoolViewer:!sr.error&&sr.data===true,profile:p.data||S.profile,access:gr.data||[],times:ti.data||[],behaviors:br.data||[],registeredTeachers:tr.data||[],teacherNames:Object.fromEntries((tr.data||[]).map(t=>[t.user_id,t.teacher_name])),serverDay:String(day.data).slice(0,10),cacheVerifiedAt:Date.now(),offlineMode:false});
  if(!S.admin&&S.cls&&!S.access.some(r=>r.school_year===S.year&&r.class_code===S.cls)){S.session=null;S.students=[];S.seats=[];S.attendance=[];S.obs=[];S.openAlerts=[];S.cls='';showPage(S.schoolViewer?'overview':'home');}
  applyRoleNavigation();Offline.setStale(false);Offline.networkOk();await savePortalCache();await Offline.flush({force:true});
  window.dispatchEvent(new Event('tranphu:cache-verified'));if(S.cls&&['class','homeroom','students','outside','home','alerts'].includes(S.renderPage))await refreshClassInBackground();else if(S.renderPage==='home'&&!S.manualLesson){autoLesson();renderHomeSelectors();}
 }catch(error){Offline.setStale(true);if(!Offline.retryable(error)&&(/jwt|token|session|đăng nhập/i.test(error.message||'')||error.status===401)){await Offline.clearSnapshots(uid).catch(()=>{});Offline.configure('');setLoginConfirmed('');S.ready=false;authView('login');$('loginMsg').textContent='Cần đăng nhập lại để đồng bộ; bản ghi trên máy vẫn được giữ.';}}
 finally{cachedVerification=null;}})();return cachedVerification;
}
async function refreshClassInBackground(){
 if(S.demo||S.offlineMode||!S.cls)return;const session=S.session,uid=S.user?.id,change=clientChangeRevision,cls=S.cls,y=S.year;
 try{const [students,layout,seats,obs,alerts,rotation,daily,att,state]=await Promise.all([
  sb.from('v4_students').select('*').eq('school_year',y).eq('class_code',cls).order('full_name'),sb.from('v4_layouts').select('desk_counts,is_confirmed,updated_at').eq('school_year',y).eq('class_code',cls).maybeSingle(),sb.from('v4_seats').select('*').eq('school_year',y).eq('class_code',cls),sb.from('v4_observations').select('*').eq('school_year',y).eq('class_code',cls).order('observed_at',{ascending:false}).limit(800),readAll(sb.rpc('v4_open_alerts',{y,c:cls})),readRotation(y,cls),sb.rpc('v4_daily_learning',{y,c:cls}),session?sb.from('v4_attendance').select('*').eq('session_id',session.id):{data:[]},session?sb.rpc('v4_attendance_state',{sess:session.id}):{data:null}]);
  if([students,layout,seats,obs,att,state].some(r=>r.error)||clientChangeRevision!==change||S.user?.id!==uid||S.cls!==cls||S.year!==y||S.session?.id!==session?.id)return;
  S.students=students.data||[];S.seats=seats.data||[];S.layout=layout.data?.desk_counts||[4,4,4,4];S.layoutConfirmed=layout.data?.is_confirmed===true;S.rotation=rotation.ready&&layout.data&&Date.parse(rotation.layout_updated_at)!==Date.parse(layout.data.updated_at)?{ready:false}:rotation;S.obs=obs.data||[];S.openAlerts=alerts;if(!daily.error){S.daily=daily.data;S.dailyError='';}else S.dailyError='Chưa cập nhật được trạng thái. Kiểm tra kết nối và thử lại.';paintDailyLearning();
  if(session){S.attendance=att.data||[];S.automaticAttendance=state.data?.automatic||[];S.sessionRosterIds=state.data?.roster_ids||[];S.attendanceReadAt=Date.now();S.attendanceReadKey=lessonContextKey();S.serverDay=String(state.data?.server_today||S.serverDay).slice(0,10);const mode=S.mode,advanced=advanceAttendanceStage();if(document.activeElement?.matches('input,textarea'))S.mode=mode;if(S.renderPage==='class'){if(advanced&&S.mode!==mode)renderClass();else renderClassMap();}await saveLessonCache();}
  if(S.renderPage==='homeroom'&&!document.querySelector('#rotationSettings :focus'))renderHomeroom();if(S.renderPage==='students'&&!document.activeElement?.matches('input,textarea'))renderStudentDirectory();await saveClassCache();await savePortalCache();
 }catch{/* Cached content and durable edits remain visible. */}
}
window.addEventListener('tranphu:outbox-changed',event=>{if(S.demo||!S.ready)return;S.pendingOps=event.detail.rows;if(S.renderPage==='class')renderClassMap();});
window.addEventListener('tranphu:sync-applied',async event=>{
 const {op,result}=event.detail;if(S.demo||S.user?.id!==op.userId)return;clientChangeRevision++;
 const saved=await Offline.cacheGet('lesson:'+result.session.id)||{session:result.session,attendance:[],automaticAttendance:[],sessionRosterIds:[]};saved.session=result.session;
 if(result.attendance)saved.attendance=saved.attendance.filter(a=>a.student_id!==result.attendance.student_id).concat(result.attendance);if(result.attendanceRows)saved.attendance=result.attendanceRows;
 await Offline.cachePut('lesson:'+result.session.id,saved);if(result.withdrawnObservation&&!offlineScope(op))await window.TranPhuApplyWithdrawal?.(result.withdrawnObservation);if(op.lesson.id!==result.session.id)await Offline.cachePut('lesson:'+op.lesson.id,saved);
 if(offlineScope(op)){
  S.session=result.session;if(result.attendance)S.attendance=S.attendance.filter(a=>a.student_id!==result.attendance.student_id).concat(result.attendance);if(result.attendanceRows)S.attendance=result.attendanceRows;
  if(result.observation&&!await Offline.cacheGet('withdrawn:'+result.observation.id)&&!S.obs.some(o=>o.id===result.observation.id))S.obs.unshift(result.observation);if(result.withdrawnObservation)await window.TranPhuApplyWithdrawal?.(result.withdrawnObservation);
  await refreshPending();const mode=S.mode,advanced=advanceAttendanceStage();if(document.activeElement?.matches('input,textarea'))S.mode=mode;if(S.renderPage==='class'){if(advanced&&!document.activeElement?.matches('input,textarea'))renderClass();else renderClassMap();}
  paintBehaviorChoices();refreshObservationHistory();document.dispatchEvent(new Event('tranphu:lesson-render'));await saveLessonCache();if(result.review)window.dispatchEvent(new CustomEvent('tranphu:review-synced',{detail:result.review}));
 }
});
setInterval(()=>{if(S.ready&&!S.demo&&!document.hidden&&navigator.onLine!==false&&(S.offlineMode||Offline?.shouldQueue())){S.offlineMode=true;verifyCachedPortal();}},30000);
window.addEventListener('tranphu:retry-connection',()=>{if(S.ready&&!S.demo&&(S.offlineMode||Offline?.shouldQueue())){S.offlineMode=true;verifyCachedPortal();}else Offline?.flush({force:true});});
const confirmPortal=async(message,options={})=>{if(confirmPortal.pending)return false;confirmPortal.pending=true;try{return window.TranPhuDialog?await window.TranPhuDialog.confirm({...options,message}):window.confirm(message);}finally{confirmPortal.pending=false;}};
const promptPortal=async(message,options={})=>window.TranPhuDialog?window.TranPhuDialog.prompt({...options,message}):window.prompt(message,options.defaultValue||'');
const toast=(msg,tone)=>{if(window.TranPhuDialog)return window.TranPhuDialog.toast(msg,{tone});let e=$('toast');e.textContent=msg;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),3900)};
const fail=e=>{console.error(e);toast('Lỗi: '+(e?.message||String(e)),'error')};
const mockNames=['Nguyễn Văn An','Trần Thị Bình','Lê Thị Chi','Phạm Văn Dũng','Đỗ Thị Hà','Hoàng Văn Hùng','Vũ Thị Lan','Ngô Văn Nhân','Bùi Thị Nga','Trần Văn Phúc','Phạm Văn Quân','Lê Thị Trang','Nguyễn Văn Tuấn','Hoàng Thị Vy','Lý Thị Yến','Trần Văn Khoa','Đặng Văn Long','Mai Thị Mai','Lê Văn Nam','Nguyễn Thị Oanh','Phạm Văn Phát','Vũ Thị Quỳnh','Đinh Văn Sơn','Trương Thị Thảo','Nguyễn Văn Tiến','Đỗ Thị Trâm','Hoàng Văn Việt','Vũ Thị Vân','Lê Văn Xuân','Ngô Thị Hòa','Trần Văn Kiệt','Nguyễn Thị Nhi'];
function demoSeed(role='gvcn'){S.demo=true;S.demoCalendar={school_year:S.year,semester1_start:'2026-09-07',semester2_start:'2027-01-18',week_overrides:{}};S.demoRole=role;S.admin=role==='admin';S.teacherNames={demo:'Giáo viên xem thử'};S.profile={teacher_name:role==='gvbm'?'Giáo viên bộ môn xem thử':role==='admin'?'Quản trị xem thử':'GVCN xem thử',teacher_code:'DEMO'};S.access=[{school_year:S.year,class_code:'8A',role:role==='gvbm'?'gvbm':'gvcn'},{school_year:S.year,class_code:'8B',role:'gvbm'}];S.students=mockNames.map((full_name,i)=>({id:'demo'+i,student_code:'HS'+String(i+1).padStart(3,'0'),school_year:S.year,class_code:'8A',full_name,gender:/Thị/.test(full_name)?'Nữ':'Nam',active:true}));S.layout=[4,4,4,4];S.layoutConfirmed=true;S.rotation={ready:true,config:window.TranPhuSeatingRotation.empty(),revision:0,layout_updated_at:'demo:0',desk_counts:[...S.layout],is_confirmed:true,server_today:S.date};S.seats=S.students.map((s,i)=>({school_year:S.year,class_code:'8A',student_id:s.id,group_no:Math.floor(i/8)+1,desk_no:Math.floor((i%8)/2)+1,seat_no:i%2+1}));S.cls='8A';S.period=3;S.subject='Toán';S.session={id:'demo-session',school_year:S.year,class_code:'8A',period_no:3,lesson_date:S.date,subject:'Toán',teacher_id:'demo',ended_at:null};S.attendance=[];S.obs=[{id:'demo-alert',student_id:'demo1',school_year:S.year,class_code:'8A',category:'health',behavior_code:'Đau bụng',note:'Cần theo dõi từ tiết trước',observed_at:new Date().toISOString(),created_by:'demo',is_alert:true},{id:'demo-alert2',student_id:'demo3',school_year:S.year,class_code:'8A',category:'concern',behavior_code:'Nói chuyện riêng',note:'Ghi nhận tiết trước',observed_at:new Date().toISOString(),created_by:'demo',is_alert:true}];S.openAlerts=S.obs.filter(o=>o.is_alert);S.actions=[];S.support=[];S.times=defaultSchoolTimes();S.tkb=Array.from({length:6},(_,day)=>[1,3,5].map(period=>({day_no:day+2,period_no:period,class_code:'8A',subject:period===3?'Toán':'Hoạt động lớp',teacher_code:'DEMO'}))).flat();S.tkbVersion=null;}
async function init(real=true,{landing=false,user:sessionUser=null}={}){const initialQuery=new URL(location.href).searchParams,initialPage=initialQuery.get('page')||(initialQuery.has('mode')?'schoolTimetable':null);const generation=authGeneration;S.ready=false;if(real){S.offlineMode=false;let user=sessionUser;if(!user){const{data,error}=await sb.auth.getUser();if(error||!data?.user)throw Error('Phiên đăng nhập không hợp lệ');user=data.user;}S.user=user;setLoginConfirmed(user.id);if(user.app_metadata?.force_password_change){setTimeout(()=>window.TranPhuAccounts?.requirePasswordChange(user),0);return;}let [a,p,gr,ti,br,tr,,sr]=await Promise.all([sb.rpc('v4_admin'),sb.from('v4_teachers').select('*').eq('user_id',user.id).maybeSingle(),sb.from('v4_class_access').select('school_year,class_code,role').eq('user_id',user.id),sb.from('v4_lesson_times').select('*').order('period_no'),sb.from('v4_behaviors').select('*').order('sort_order').order('id'),sb.from('v4_teachers').select('user_id,teacher_name,teacher_code'),loadTimetable(),sb.rpc('v4_school_report_access')]);for(let r of [a,p,gr,ti,br,tr])if(r.error)throw r.error;if(generation!==authGeneration)return;S.admin=!!a.data;S.schoolViewer=!sr.error&&sr.data===true;S.profile=p.data||{teacher_name:user.email,teacher_code:''};S.access=gr.data||[];S.times=ti.data||[];S.behaviors=br.data||[];S.registeredTeachers=tr.data||[];S.teacherNames=Object.fromEntries((tr.data||[]).map(x=>[x.user_id,x.teacher_name]));if(!S.admin&&!S.access.length&&!p.data)throw Error('Tài khoản chưa được cấp lớp. Liên hệ quản trị viên.');setSchoolYear();S.cls=S.access[0]?.class_code||[...new Set(S.tkb.map(r=>r.class_code))][0]||'';S.date=dateLocal();autoLesson();const context={...window.TkbIntegration?.read(),...window.TkbIntegration?.query()};if(context.classCode&&classChoices().includes(context.classCode))S.cls=context.classCode;const own=landing||new URL(location.href).searchParams.get('view')==='mine'||!initialPage;S.timetableMode=own?'teacher':context.classCode?'class':'teacher';S.timetableEntity=own?(S.profile?.teacher_code||''):(context.classCode||context.teacherCode||S.profile?.teacher_code||'');if(!(landing||!initialPage||['timetable','schoolTimetable','timetableAdmin'].includes(initialPage)))await loadClassData();}
 $('logout').hidden=S.demo;$('who').textContent=S.profile?.teacher_name||'Giáo viên';if($('teacherGreeting'))$('teacherGreeting').textContent=S.profile?.teacher_name||'Giáo viên';$('modeLabel').textContent=S.demo?('XEM THỬ – '+(S.demoRole==='admin'?'QUẢN TRỊ':S.demoRole==='gvbm'?'GV BỘ MÔN':'GVCN')):cfg.offlineTest?'THỬ NGHIỆM OFFLINE':'';$('modeLabel').hidden=!(S.demo||cfg.offlineTest);$('modeLabel').className='pill '+(S.demo||cfg.offlineTest?'gray':'green');$('adminTab').hidden=!S.admin;$('homeroomTab').hidden=!(S.demo||S.access.some(a=>a.role==='gvcn'));$('lessonDate').value=S.date;let resumed=false;if(real&&!S.admin&&(landing||!initialPage||['home','class'].includes(initialPage)))resumed=await resumeLesson();S.openOwnTimetable=real&&!S.admin&&!resumed&&(landing||!initialPage);if(real&&generation!==authGeneration)return;S.ready=true;authView('app');renderHomeSelectors();const requestedPage=resumed?'class':initialPage|| (real?'overview':'home');showPage(['overview','timetable','students','progress','home','admin','class','alerts','outside','homeroom','more','schoolTimetable','timetableAdmin'].includes(requestedPage)?requestedPage:'home');}
const lessonPointerKey=()=>S.user?.id?'tranphu-lesson-pointer:'+S.user.id:null;
function readLessonPointer(){try{const value=JSON.parse(localStorage.getItem(lessonPointerKey())||'null');return value&&typeof value.id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id)&&value.day===S.date&&value.year===S.year&&['attendance','observe'].includes(value.mode)?value:null;}catch{return null;}}
function rememberLesson(){if(S.demo||!S.session||S.session.teacher_id!==S.user?.id||S.session.lesson_date!==S.date)return;const pointer={id:S.session.id,day:S.date,year:S.year,mode:S.mode};try{localStorage.setItem(lessonPointerKey(),JSON.stringify(pointer));}catch{/* Resume still reads the verified server session when browser storage is unavailable. */}}
async function resumeLesson(){
 if(S.admin)return false;
 if(!window.TranPhuSchoolYear.isCanonical(S.year))return false;
 const day=await sb.rpc('v4_school_today');if(day.error)throw day.error;S.date=String(day.data).slice(0,10);S.serverDay=S.date;
 const pointer=readLessonPointer();
 const query=()=>sb.from('v4_sessions').select('*').eq('teacher_id',S.user.id).eq('school_year',S.year).eq('lesson_date',S.date).is('ended_at',null);
 let row=null;if(pointer){const r=await query().eq('id',pointer.id).maybeSingle();if(r.error)throw r.error;row=r.data;}
 if(!row){const r=await query().order('created_at',{ascending:false}).limit(1).maybeSingle();if(r.error)throw r.error;row=r.data;}
 if(!row||!S.access.some(a=>a.school_year===row.school_year&&a.class_code===row.class_code))return false;
 S.cls=row.class_code;S.period=row.period_no;S.subject=row.subject;await loadClassData();S.session=row;await loadAttendance();
 if(pointer?.id===row.id)S.mode=pointer.mode;S.groupPage=0;S.selected=null;rememberLesson();return true;
}
async function fetchTimetableData(force=false){
 if(S.demo)return;
 const result=await sb.from('tkb_versions').select('id,school_year,version_name,version_no,effective_date,is_active,status,published_at,updated_at').eq('status','published').eq('is_active',true).order('published_at',{ascending:false}).limit(1).maybeSingle();
 if(result.error)throw result.error;const version=result.data;
 if(!version){try{localStorage.removeItem(tkbCacheKey);}catch{}return {tkbVersion:null,tkb:[],tkbAssignments:[]};}
 let entries,assignments,cached;try{cached=JSON.parse(localStorage.getItem(tkbCacheKey)||'null');}catch{}if(!force&&cached?.version?.id===version.id&&cached?.version?.updated_at&&cached.version.updated_at===version.updated_at&&Array.isArray(cached.entries)&&Array.isArray(cached.assignments)){entries=cached.entries;assignments=cached.assignments;}else
 try{
  [entries,assignments]=await Promise.all([
   readAll(sb.from('tkb_entries').select('day_no,period_no,class_code,subject,teacher_code,teacher_name,status').eq('version_id',version.id).order('id')),
   readAll(sb.from('tkb_assignments').select('teacher_name,homeroom_class,teaching_assignment').eq('version_id',version.id).order('id'))]);
  try{localStorage.setItem(tkbCacheKey,JSON.stringify({version,entries,assignments}));}catch{}
 }catch(error){
  try{const cached=JSON.parse(localStorage.getItem(tkbCacheKey)||'null');if(cached?.version?.id===version.id&&Array.isArray(cached.entries)&&Array.isArray(cached.assignments)){entries=cached.entries;assignments=cached.assignments;}else throw error;}catch{throw error;}
 }
 return {tkbVersion:version,tkb:window.TranPhuTeacherIdentity.enrich(entries,assignments),tkbAssignments:assignments,tkbPreview:null};
}
async function loadTimetable(force=false){if(S.demo)return;Object.assign(S,await fetchTimetableData(force));}
function setSchoolYear(){const raw=S.tkbVersion?.school_year||S.access[0]?.school_year||'2026-2027';try{S.year=window.TranPhuSchoolYear.normalize(raw);S.yearIssue=S.tkbVersion&&raw!==S.year?'Năm học TKB đang lưu “'+raw+'”. Quản trị cần chuẩn hóa thành '+S.year+' trước khi đồng bộ và vào tiết.':'';}catch(error){S.year='';S.yearIssue='Năm học của TKB chưa hợp lệ. Quản trị cần kiểm tra cấu hình.';}}
function lessonClassChoices(){return S.demo?['8A']:[...new Set(S.access.filter(a=>a.school_year===S.year).map(a=>a.class_code))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));}
function sessionTimes(){const morning=+schoolClock().hour<12;return S.times.filter(t=>(+t.start_time.slice(0,2)<12)===morning);}
function teachingPlan(){return window.TranPhuTeacherLessonPlan.resolve({entries:S.tkb,teacherCode:S.profile?.teacher_code||'',times:S.times,hasVersion:S.demo||!!S.tkbVersion,effectiveDate:S.tkbVersion?.effective_date||''});}
function autoLesson(){if(S.manualLesson)return;S.lessonPlan=teachingPlan();const hit=S.lessonPlan.selected;if(hit){S.cls=hit.class_code;S.period=hit.period_no;S.subject=hit.subject;S.date=hit.lesson_date;}else{S.cls='';S.period=0;S.subject='';S.date=dateLocal();}}
let homeRefreshPending=false;
async function refreshAutomaticHome(){if(!S.ready||S.renderPage!=='home'||S.manualLesson||homeRefreshPending)return;homeRefreshPending=true;try{autoLesson();renderHomeSelectors();if(S.cls&&S.classDataKey!==S.year+'|'+S.cls){await loadClassData();if(S.renderPage==='home'){renderHomeAlerts();renderDailyHandoff();}}}catch(error){fail(error)}finally{homeRefreshPending=false;}}
function classChoices(){if(S.demo)return ['8A'];const assigned=S.access.filter(a=>a.school_year===S.year).map(a=>a.class_code);return [...new Set((S.admin?S.tkb.map(x=>x.class_code):assigned).concat(assigned))].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));}
function supportTarget(){return {year:S.year,cls:S.renderPage==='progress'?$('reportClass')?.value||S.cls:S.cls};}
function canSupport(){if(S.renderPage==='progress'&&window.TranPhuReports?.isSchoolMode?.())return false;const t=supportTarget();return !S.admin&&S.access.some(a=>a.class_code===t.cls&&a.school_year===t.year&&a.role==='gvcn')}
function canEditLayout(){return S.admin||S.access.some(a=>a.class_code===S.cls&&a.school_year===S.year&&a.role==='gvcn')}
function activeStudents(){const ids=S.renderPage==='class'&&S.session?S.sessionRosterIds||[]:[];return S.students.filter(x=>x.active!==false||ids.includes(x.id))}
function lessonParticipants(){const ids=S.sessionRosterIds||[];return S.students.filter(x=>x.active!==false||ids.includes(x.id))}
// Only a successful save/load can advance the stage. Rendering or returning
// to attendance must never override the teacher's chosen tab.
const attendanceStage={key:'',complete:false};
function lessonContextKey(){return S.session?JSON.stringify([S.session.id,S.year,S.cls,S.session.lesson_date,S.session.period_no]):'';}
function currentAttendance(){
 const active=new Set(lessonParticipants().map(s=>s.id)),byStudent=new Map();
 for(const row of S.attendance)if(active.has(row.student_id)&&Object.hasOwn(attLabels,row.status)&&(!row.session_id||row.session_id===S.session?.id))byStudent.set(row.student_id,row);
 return [...byStudent.values()];
}
function advanceAttendanceStage(){
 const key=lessonContextKey();if(!key)return false;
 if(attendanceStage.key!==key){attendanceStage.key=key;attendanceStage.complete=false;S.mode='attendance';}
 const active=new Set(lessonParticipants().map(s=>s.id)),recorded=new Set(currentAttendance().map(row=>row.student_id));
 const complete=active.size>0&&[...active].every(id=>recorded.has(id)),transition=complete&&!attendanceStage.complete;
 attendanceStage.complete=complete;
 if(transition){S.mode='observe';chosenBehavior=null;}
 return transition;
}
let classLoadRevision=0;
let rotationReadRevision=0;
async function readRotation(y,c){
 try{const result=await sb.rpc('v4_get_seating_rotation',{y,c});if(result.error||!result.data?.server_today)return {ready:false};return {...result.data,ready:true};}catch{return {ready:false};}
}
function rotationProjection(){
 const api=window.TranPhuSeatingRotation;
 const config=S.rotation?.ready&&S.layoutConfirmed?S.rotation.config:api.empty();
 return api.project(S.layout,S.seats,config,S.rotation?.server_today||S.date);
}
function classroomGroupOrder(){return S.renderPage==='homeroom'?S.layout.map((_,i)=>i+1):rotationProjection().order;}
function paintRotationNotice(){
 const node=$('classRotationNotice');if(!node)return;
 node.hidden=!!S.rotation?.ready&&!S.rotation.config?.enabled;
 node.textContent=!S.rotation?.ready?'Chưa kiểm tra được luân chuyển. Đang hiển thị sơ đồ gốc; bấm Làm mới để kiểm tra.':!S.layoutConfirmed?'Luân chuyển đang tạm dừng: cần chốt lại sơ đồ gốc.':(()=>{const plan=rotationProjection();return 'Luân chuyển tuần từ '+plan.week.split('-').reverse().join('/')+(plan.steps?' · '+plan.steps+' lần chuyển':' · Chưa đến tuần bắt đầu');})();
}
async function refreshRotationState({render=false}={}){
 if(!S.cls||S.rotationSaving||!S.demo&&Offline&&Offline.shouldQueue())return;
 const y=S.year,c=S.cls,ticket=++rotationReadRevision;
 let state;
 if(S.demo){
  const old=S.rotation||{config:window.TranPhuSeatingRotation.empty(),revision:0};
  const changed=JSON.stringify(old.desk_counts)!==JSON.stringify(S.layout);
  const config=changed?window.TranPhuSeatingRotation.empty():{...old.config,enabled:!!old.config.enabled&&S.layoutConfirmed};
  state={ready:true,config,revision:old.revision+1,layout_updated_at:'demo:'+(old.revision+1),desk_counts:[...S.layout],is_confirmed:S.layoutConfirmed,server_today:S.date};
 }else state=await readRotation(y,c);
 if(ticket!==rotationReadRevision||y!==S.year||c!==S.cls)return;
 if(state.ready&&state.desk_counts&&(JSON.stringify(state.desk_counts)!==JSON.stringify(S.layout)||state.is_confirmed!==S.layoutConfirmed))state={ready:false};
 S.rotation=state;
 if(render&&S.renderPage==='class'){renderClassMap();paintRotationNotice();}
 if(render&&S.renderPage==='homeroom')renderRotationSettings();
}
async function saveRotationConfig(config,expected){if(!S.demo&&Offline?.shouldQueue())throw Error('Cần kết nối để thay đổi sơ đồ và quy luật.');
 if(S.seatingLoading)throw Error('Đang tải sơ đồ lớp. Vui lòng chờ.');
 if(!canEditLayout())throw Error('Chỉ GVCN hoặc quản trị được cấu hình luân chuyển.');
 if(S.rotationSaving)throw Error('Đang lưu quy luật. Vui lòng chờ.');
 const y=S.year,c=S.cls;S.rotationSaving=true;++rotationReadRevision;
 try{
  let state;
  if(S.demo){if(expected.revision!==S.rotation.revision)throw Error('Quy luật đã thay đổi. Làm mới rồi thử lại.');state={...S.rotation,config:structuredClone(config),revision:S.rotation.revision+1,layout_updated_at:'demo:'+(S.rotation.revision+1)};}
  else{const result=await sb.rpc('v4_save_seating_rotation',{y,c,p_config:config,p_expected_revision:expected.revision,p_expected_layout_updated_at:expected.layout_updated_at});if(result.error)throw result.error;state={...result.data,ready:true};}
  if(y===S.year&&c===S.cls){S.rotation=state;clientChangeRevision++;await saveClassCache();await savePortalCache();if(S.renderPage==='homeroom')renderRotationSettings();if(S.renderPage==='class'){renderClassMap();paintRotationNotice();}}
  toast('Đã lưu quy luật luân chuyển lớp '+c);
 }finally{S.rotationSaving=false;}
}
function renderRotationSettings(){
 if(S.seatingLoading)return;const year=S.year,classCode=S.cls;
 const label=$('rotationSavedState');if(label)label.textContent=!S.rotation?.ready?'Chưa tải được':S.rotation.config?.enabled?'Đang bật':'Đang tắt';
 window.TranPhuSeatingRotation.mount($('rotationSettings'),{year:S.year,classCode:S.cls,layout:S.layout,seats:S.seats,students:activeStudents(),confirmed:S.layoutConfirmed,state:S.rotation,onSave:(config,expected)=>{if(S.seatingLoading||S.year!==year||S.cls!==classCode)throw Error('Lớp đã thay đổi hoặc đang tải. Mở lại quy luật của lớp cần sửa.');return saveRotationConfig(config,expected);},onRefresh:async()=>{if(S.seatingLoading||S.year!==year||S.cls!==classCode)return;try{await loadClassData();renderHomeroom();}catch(error){fail(error);}}});
}
async function loadClassData(){if(!S.cls||!window.TranPhuSchoolYear.isCanonical(S.year))return;if(S.demo){if(S.cls!=='8A'){S.cls='8A'}return;}if(Offline&&(S.offlineMode||navigator.onLine===false)){configureOffline();const cached=await Offline.cacheGet('class:'+S.year+'|'+S.cls);if(!cached)throw Error('Lớp này chưa được tải về thiết bị. Kết nối mạng và mở lớp một lần trước.');Object.assign(S,cached,{classDataKey:S.year+'|'+S.cls,session:null,support:[]});return;}const y=S.year,c=S.cls,revision=++classLoadRevision,dailyPromise=refreshDailyLearning();let [st,layout,seats,obs,actions,support,openAlerts,rotation]=await Promise.all([sb.from('v4_students').select('*').eq('school_year',y).eq('class_code',c).order('full_name'),sb.from('v4_layouts').select('desk_counts,is_confirmed,updated_at').eq('school_year',y).eq('class_code',c).maybeSingle(),sb.from('v4_seats').select('*').eq('school_year',y).eq('class_code',c),sb.from('v4_observations').select('*').eq('school_year',y).eq('class_code',c).order('observed_at',{ascending:false}).limit(800),Promise.resolve({data:[]}),sb.from('v4_support_logs').select('*').eq('school_year',y).eq('class_code',c).order('created_at',{ascending:false}).limit(250),readAll(sb.rpc('v4_open_alerts',{y,c})),readRotation(y,c)]);for(let x of [st,layout,seats,obs,actions,support])if(x.error)throw x.error;if(revision!==classLoadRevision||S.year!==y||S.cls!==c)return;S.rotation=rotation;if(rotation.ready&&layout.data&&Date.parse(rotation.layout_updated_at)!==Date.parse(layout.data.updated_at))S.rotation={ready:false};S.students=st.data||[];S.layout=layout.data?.desk_counts||[4,4,4,4];S.layoutConfirmed=layout.data?.is_confirmed===true;S.seats=seats.data||[];S.obs=obs.data||[];S.openAlerts=openAlerts;S.classDataKey=y+'|'+c;S.support=support.data||[];S.actions=[];S.attendance=[];S.automaticAttendance=[];S.sessionRosterIds=[];S.session=null;await dailyPromise;paintDailyLearning();await saveClassCache();await savePortalCache();}
function renderHomeLessonSummary(){
 const target=$('homeLessonSummary');if(!target)return;
 if(S.manualLesson){const time=S.times.find(t=>+t.period_no===+$('periodSelect').value);$('currentLessonTitle').textContent='Tiết bổ sung';target.innerHTML=`<span class="lessonSubject">${esc($('subject').value||'Chọn môn học')}</span><span class="lessonClock">${time?esc(time.start_time.slice(0,5)+' – '+time.end_time.slice(0,5)):''}</span>`;const allowed=S.demo||S.access.some(a=>a.school_year===S.year&&a.class_code===$('classSelect').value);$('lessonAvailability').textContent=!sessionTimes().length?'Trường không dạy buổi chiều.':!allowed?'Tài khoản chưa được phân công đánh giá lớp này.':'';$('startLesson').hidden=!sessionTimes().length;$('startLesson').disabled=!!S.yearIssue||!allowed||!$('periodSelect').value;$('startLesson').innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#i-play"/></svg>Bắt đầu tiết bổ sung';return;}
 const plan=teachingPlan();S.lessonPlan=plan;const selected=plan.slots.find(row=>row.class_code===S.cls&&row.period_no===S.period)||plan.selected,next=selected||plan.next;
 $('currentLessonTitle').textContent=selected?(selected.start<=+schoolClock().hour*60+(+schoolClock().minute)&&selected.end>+schoolClock().hour*60+(+schoolClock().minute)?'Tiết học hiện tại':selected.end<=+schoolClock().hour*60+(+schoolClock().minute)?'Tiết đã chọn':'Tiết dạy gần nhất'):plan.title;
 target.innerHTML=selected?`<span class="lessonSubject">Tiết ${next.period_no} · Lớp ${esc(next.class_code)} · ${esc(next.subject)}</span><span class="lessonClock">${esc(next.start_time+' – '+next.end_time)}</span>`:'';
 $('lessonAvailability').textContent=(plan.message?plan.message+' ':'')+(next&&!selected?'Tiết gần nhất: '+window.TranPhuTeacherLessonPlan.dateLabel(next.lesson_date)+' · Tiết '+next.period_no+' · Lớp '+next.class_code+' · '+next.subject+' · '+next.start_time+' – '+next.end_time:next&&next.lesson_date!==dateLocal()?window.TranPhuTeacherLessonPlan.dateLabel(next.lesson_date):'');
 $('advancedLesson').hidden=!selected;
 $('lessonHint').hidden=!S.yearIssue;$('lessonHint').textContent=S.yearIssue;
 const access=S.demo||selected&&S.access.some(a=>a.school_year===S.year&&a.class_code===selected.class_code);
 $('startLesson').hidden=!selected;$('startLesson').disabled=!selected||!!S.yearIssue||!access;
 if(selected&&!access)$('lessonAvailability').textContent='Chưa có quyền đánh giá lớp này. Quản trị cần đồng bộ phân công.';
 $('startLesson').innerHTML='<svg class="ui-icon" aria-hidden="true"><use href="#i-play"/></svg>'+(selected?'Vào tiết '+selected.period_no:'Chưa có tiết để bắt đầu')+'<span class="button-arrow">→</span>';
}
function renderHomeSelectors(){
 const plan=teachingPlan(),rows=plan.slots;let classes=S.manualLesson?lessonClassChoices():[...new Set(rows.map(r=>r.class_code))];
 $('classSelect').innerHTML=classes.map(c=>`<option value="${esc(c)}" ${c===S.cls?'selected':''}>${esc(c)}</option>`).join('');$('classSelect').value=S.cls;
 const periods=S.manualLesson?sessionTimes().map(t=>+t.period_no):[...new Set(rows.filter(r=>r.class_code===S.cls).map(r=>r.period_no))];
 $('periodSelect').innerHTML=periods.map(n=>`<option value="${n}" ${n===S.period?'selected':''}>Tiết ${n}</option>`).join('');$('periodSelect').value=String(S.period);
 $('lessonSelection').hidden=S.manualLesson?!periods.length:!rows.length;$('classSelect').disabled=!classes.length;$('periodSelect').disabled=!periods.length;
 $('lessonDate').value=S.date;$('subject').value=S.subject;refreshSourceHint();renderHomeAlerts();renderDailyHandoff();
 const reminders=$('homeReminders');if(reminders)reminders.hidden=!S.cls;
}
function pageAllowed(page){
 if(page==='overview')return true;
 if(S.admin)return ['admin','homeroom','timetable','schoolTimetable','timetableAdmin','progress','students','more'].includes(page);
 if(page==='progress')return true;
 if(page==='students')return S.access.some(a=>a.school_year===S.year&&a.role==='gvcn');
 if(['outside','admin','more','timetableAdmin'].includes(page))return false;
 if(page==='homeroom')return S.access.some(a=>a.school_year===S.year&&a.role==='gvcn');
 return ['home','timetable','class','alerts','schoolTimetable'].includes(page);
}
function applyRoleNavigation(){
 document.querySelectorAll('#nav [data-page],[data-goto]').forEach(el=>{const page=el.dataset.page||el.dataset.goto;el.hidden=!pageAllowed(page)||(page==='alerts'&&!S.admin)||(el.id==='homeroomTab'&&S.admin);});
 // The reminder bell and contextual links remain available for health/unusual cases.
 document.querySelectorAll('.header-alert,.reminder-more').forEach(el=>el.hidden=S.admin);
 const nav=$('nav');if(nav)nav.setAttribute('aria-label',S.admin?'Chức năng quản trị':'Chức năng giáo viên');if(nav)nav.style.setProperty('--primary-nav-count',String([...nav.children].filter(el=>!el.hidden).length));
}
let navigationRevision=0,overviewLoad;
function loadOverview(){if(window.TranPhuOverviewLoaded)return Promise.resolve();if(overviewLoad)return overviewLoad;overviewLoad=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/assets/overview.js?v=92';const timer=setTimeout(()=>{script.remove();overviewLoad=null;reject(Error('Tải Tổng quan quá lâu. Hãy thử lại.'));},10000);script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();overviewLoad=null;reject(Error('Chưa tải được Tổng quan. Kiểm tra mạng và thử lại.'));};document.head.append(script);});return overviewLoad;}

async function showPage(page){const navigation=++navigationRevision;if(page==='schoolTimetable')page='timetable';if(page==='overview'){try{await loadOverview();}catch(error){toast(error.message);page='home';}if(navigation!==navigationRevision)return;}applyRoleNavigation();if(!pageAllowed(page))page=S.admin?'admin':'home';if(['admin','students'].includes(page)){const featureOwner=String(S.user?.id||'')+'|'+S.demo;try{if(!window.TranPhuFeatures)throw Error('Chưa tải được công cụ. Kiểm tra kết nối rồi thử lại.');await window.TranPhuFeatures[page==='admin'?'admin':'students']();if(navigation!==navigationRevision||featureOwner!==String(S.user?.id||'')+'|'+S.demo||!pageAllowed(page))return;}catch(error){if(navigation===navigationRevision)fail(error);return;}}if(page==='home'){S.manualLesson=false;$('lessonSource').value='tkb';autoLesson();}if(page==='homeroom'&&!S.cls)S.cls=classChoices()[0]||'';if(page==='homeroom'&&!canEditLayout())S.cls=S.access.find(a=>a.school_year===S.year&&a.role==='gvcn')?.class_code||'';else if(!S.cls&&['admin','progress','outside','alerts','students'].includes(page))S.cls=classChoices()[0]||'';if(!S.demo&&S.cls&&!['overview','timetable','timetableAdmin'].includes(page)&&(page!=='progress'||window.TranPhuReportScope?.wantsClass()!==false)&&S.classDataKey!==S.year+'|'+S.cls){try{await loadClassData();if(navigation!==navigationRevision)return;renderHomeSelectors();}catch(error){fail(error);return;}}S.renderPage=page;window.TkbIntegration?.remember({classCode:S.cls||'',versionId:S.tkbVersion?.id||'',teacherCode:S.profile?.teacher_code||''});const route=new URL(location.href);route.searchParams.set('page',page);if(S.cls)route.searchParams.set('class',S.cls);if(S.tkbVersion)route.searchParams.set('version',S.tkbVersion.id);if(location.protocol!=='about:')history.replaceState(null,'',route);document.body.dataset.page=page;document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!==page+'Page');document.querySelectorAll('#nav [data-page]').forEach(e=>{const active=e.dataset.page===page||(page==='class'&&e.dataset.page==='home')||(page==='students'&&e.dataset.page===(S.admin?'admin':'homeroom'));e.classList.toggle('on',active);if(active)e.setAttribute('aria-current','page');else e.removeAttribute('aria-current');});const ov=$('openOverview');if(ov){ov.classList.toggle('on',page==='overview');if(page==='overview')ov.setAttribute('aria-current','page');else ov.removeAttribute('aria-current');}let titles={overview:'Tổng quan',home:'Đánh giá tiết học',class:'Đánh giá tiết học',alerts:'Các trường hợp cần lưu ý',progress:S.schoolViewer?'Báo cáo':S.admin?'Báo cáo':S.access.some(a=>a.school_year===S.year&&a.role==='gvcn')?'Báo cáo lớp':'Đánh giá theo tuần',outside:'Ghi nhận ngoài tiết',homeroom:'Sắp chỗ ngồi',admin:'Quản trị',timetable:'Thời khóa biểu',students:'Quản lý học sinh',more:'Chức năng khác',schoolTimetable:'TKB toàn trường',timetableAdmin:'Quản lý TKB, PCCM và PPCT'};$('pageTitle').textContent=titles[page]||'Trần Phú';$('subtitle').textContent=S.year;$('subtitle').hidden=true;if(page==='home')renderHomeSelectors();if(page==='class')renderClass();if(page==='alerts')renderAlerts();if(page==='homeroom')renderHomeroom();if(page==='progress'){renderReportPicker();if(window.TranPhuReportScope?.wantsClass()!==false)renderSupport();}if(page==='outside')renderOutside();if(page==='admin'){renderTimes();renderBehaviorAdmin();renderTkbSync();refreshSyncDetails();renderSupport();setupAdminAccordion();window.TranPhuAdminWorkspace?.refresh();}if(page==='timetable')renderTeacherTimetable();if(page==='timetableAdmin'&&!$('timetableAdminFrame').getAttribute('src'))$('timetableAdminFrame').src='/admin.html?embed=1';if(page==='students')renderStudentDirectory();if(page==='more')renderMore();savePortalCache();Offline?.paint();}
async function renderTeacherTimetable(){
 const frame=$('schoolTimetableFrame');if(!frame||frame.dataset.loading||frame.getAttribute('src')||frame.srcdoc||location.protocol==='about:')return;
 frame.dataset.loading='true';
 try{
  const query=new URLSearchParams(location.search),own=S.tkb.find(t=>t.teacher_code===S.profile?.teacher_code);
  const ownId=(own?.teacher_name||S.profile?.teacher_name||'').toLocaleLowerCase('vi').normalize('NFC').replace(/[^\p{L}\p{N}]/gu,''),mode=S.admin?(query.get('mode')||'class'):S.openOwnTimetable?'teacher':query.get('mode')||'teacher',id=S.admin?(query.get('id')||S.cls||''):S.openOwnTimetable?ownId:query.get('id')||ownId;S.openOwnTimetable=false;
  const url='/tra-cuu/?embed=1&mode='+encodeURIComponent(mode)+'&id='+encodeURIComponent(id);
  if(!S.demo){frame.src=url;return;}
  const stamp=new Date().toISOString(),version={id:'demo',school_year:S.year,version_name:'Số 1',version_no:1,effective_date:'2026-09-05',published_at:stamp,updated_at:stamp,status:'published',is_active:true};
  const snapshot={version,entries:S.tkb.map((t,i)=>({...t,id:i,teacher_name:S.profile.teacher_name})),assignments:[],plans:[],calendars:[S.demoCalendar],savedAt:stamp,manifest:{versions:[version],plans:[],calendars:[S.demoCalendar],ready:true,key:'demo'}};
  window.TranPhuDemoSnapshot=snapshot;
  const fake='<script src="/assets/demo-snapshot.js?v=54"><\/script>';
  let html=await(await fetch('/tra-cuu/')).text();
  html=html.replace(/<script src="\/assets\/(?:auth\.js[^" ]*|embedded-view\.js|tkb-integration\.js[^" ]*)"[^>]*><\/script>/g,'').replace(/<script src="\/assets\/data-store\.js[^" ]*"[^>]*><\/script>/,fake);
  html=html.replace('</head>','<style>.topbar .brand,.admin-login-btn,#teacherWorkspaceLink,.site-footer{display:none!important}.topbar{min-height:0;justify-content:flex-end;background:transparent}.page-shell{max-width:none;margin:0;padding:12px}</style></head>');
  frame.srcdoc=html;
 }catch(error){fail(error)}finally{delete frame.dataset.loading;}
}
async function openAttendanceFromTimetable(event){
 const frame=$('schoolTimetableFrame');if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.type!=='tranphu:attendance')return;
 if(S.admin)return;const cls=event.data.classCode||S.cls;if(!classChoices().includes(cls))return toast('Bạn chưa được phân công lớp này');
 try{const ownToday=S.tkb.filter(t=>t.class_code===cls&&t.day_no===tkbDay(dateLocal())&&t.teacher_code===S.profile?.teacher_code);const lesson=ownToday.find(t=>t.period_no===S.period)||ownToday[0];if(!S.demo&&!lesson)return toast('Bạn chưa có tiết được phân công ở lớp này hôm nay. Liên hệ quản trị để cập nhật TKB.');S.cls=cls;S.selected=null;S.groupPage=0;if(lesson){S.period=lesson.period_no;S.subject=lesson.subject}await loadClassData();renderHomeSelectors();S.sourceSuggested=true;$('lessonSource').value='tkb';$('overrideReason').value='';refreshSourceHint();showPage('home');}catch(error){fail(error)}
}
window.addEventListener('message',openAttendanceFromTimetable);
let integrationRefreshing=null;
function refreshIntegratedTimetable({quiet=false}={}){
 if(S.demo){renderTeacherTimetable();return Promise.resolve();}if(!S.ready||!S.user)return Promise.resolve();if(integrationRefreshing)return integrationRefreshing;
 integrationRefreshing=(async()=>{const prior={...Object.fromEntries(portalFields.map(k=>[k,S[k]])),obs:S.obs,openAlerts:S.openAlerts};
 try{if(quiet){await persistStudentDraft();await window.TranPhuSaveReviewDraft?.();}const previous=S.session;await loadTimetable(true);const access=await sb.from('v4_class_access').select('school_year,class_code,role').eq('user_id',S.user.id);if(access.error)throw access.error;S.access=access.data||[];setSchoolYear();
 const available=classChoices();if(!available.includes(S.cls))S.cls=available[0]||'';if(S.renderPage==='home'&&!S.manualLesson)autoLesson();
 S.students=[];S.obs=[];S.openAlerts=[];S.support=[];S.seats=[];S.attendance=[];S.automaticAttendance=[];S.sessionRosterIds=[];S.session=null;
 if(S.cls)await loadClassData();
 if(previous&&previous.school_year===S.year&&previous.class_code===S.cls&&S.access.some(x=>x.school_year===S.year&&x.class_code===S.cls)){S.session=previous;await loadAttendance();}
 const child=$('schoolTimetableFrame')?.contentWindow;if(child)child.dispatchEvent(new child.CustomEvent('tkb:published'));
 $('homeroomTab').hidden=!S.access.some(x=>x.school_year===S.year&&x.role==='gvcn');renderHomeSelectors();showPage(S.renderPage);if(!quiet)toast('Đã cập nhật TKB và phân công');
 }catch(error){if(quiet){if(S.user?.id===prior.user?.id&&S.year===prior.year&&S.cls===prior.cls)Object.assign(S,prior,{offlineMode:true});Offline?.setStale(true);console.warn('Chưa cập nhật TKB ở nền',error.message);}else fail(error)}finally{integrationRefreshing=null;}
 })();return integrationRefreshing;
}
let integrationChecking=false;
async function checkIntegratedVersion(){
 if(S.offlineMode||Offline?.shouldQueue()||!S.ready||!S.user||S.demo||integrationChecking||integrationRefreshing)return;integrationChecking=true;
 try{const [v,a]=await Promise.all([sb.from('tkb_versions').select('id,updated_at').eq('status','published').eq('is_active',true).maybeSingle(),sb.from('v4_class_access').select('school_year,class_code,role').eq('user_id',S.user.id)]);
 if(v.error)throw v.error;if(a.error)throw a.error;const key=rows=>JSON.stringify(rows.map(x=>[x.school_year,x.class_code,x.role].join('|')).sort());
 if(v.data?.id!==S.tkbVersion?.id||v.data?.updated_at!==S.tkbVersion?.updated_at||key(a.data||[])!==key(S.access))await refreshIntegratedTimetable({quiet:true});
 }catch(error){console.warn('Chưa kiểm tra được TKB',error.message)}finally{integrationChecking=false;}
}
function renderStudentDirectory(){window.TranPhuStudents?.open();}
window.TranPhuStudentsContext=()=>({demo:S.demo,admin:S.admin,user:S.user,year:S.year,classCode:S.cls,classes:classChoices(),homeroomClasses:[...new Set(S.access.filter(a=>a.school_year===S.year&&a.role==='gvcn').map(a=>a.class_code))],client:sb,demoStudents:S.students});
window.TranPhuRosterChanged=async({year,cls,row})=>{
 if(S.year!==year||S.cls!==cls)return;
 if(S.demo){S.students=S.students.filter(s=>s.id!==row.id).concat(row);S.seats=S.seats.filter(s=>S.students.some(st=>st.id===s.student_id&&st.active));S.layoutConfirmed=false;if(S.selected===row.id&&!row.active)S.selected=null;return;}
 const old=S.students.find(st=>st.id===row.id);S.students=S.students.filter(st=>st.id!==row.id).concat(row);S.seats=S.seats.filter(seat=>activeStudents().some(st=>st.id===seat.student_id));if(!old||old.active!==row.active)S.layoutConfirmed=false;if(S.selected===row.id&&!row.active)S.selected=null;
 const current=S.cls,y=S.year;
 const responses=await Promise.all([sb.from('v4_students').select('*').eq('school_year',y).eq('class_code',current).order('full_name'),sb.from('v4_seats').select('*').eq('school_year',y).eq('class_code',current),sb.from('v4_layouts').select('desk_counts,is_confirmed,updated_at').eq('school_year',y).eq('class_code',current).maybeSingle()]);
 for(const r of responses)if(r.error)throw r.error;
 if(S.cls!==current||S.year!==y)return;
 S.students=responses[0].data||[];S.seats=responses[1].data||[];S.layout=responses[2].data?.desk_counts||S.layout;S.layoutConfirmed=responses[2].data?.is_confirmed===true;
 if(S.selected&&!activeStudents().some(st=>st.id===S.selected))S.selected=null;
 await refreshDailyLearning();
};
function renderMore(){applyRoleNavigation();}
function actionMap(){const map=new Map();for(let a of [...S.actions].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)))map.set(a.observation_id,a);return map;}
function unresolved(){return S.openAlerts.filter(o=>activeStudents().some(st=>st.id===o.student_id)&&o.is_alert&&(o.category==='health'||(o.category==='concern'&&o.attention_kind==='unusual')));}
const dailyPresentation={clear:{css:'neutral',label:'Bình thường'},noted:{css:'notice',label:'Cần lưu ý'},attention:{css:'attention',label:'Cần chú ý đặc biệt'},highlight:{css:'highlight',label:'Tích cực'},outstanding:{css:'outstanding',label:'Xuất sắc'},unknown:{css:'unknown',label:'Chưa tải trạng thái'}};
function dailyState(id){const row=S.daily?.school_year===S.year&&S.daily?.class_code===S.cls&&S.daily?.school_today===dateLocal()?S.daily.students?.find(x=>x.student_id===id):null;return dailyPresentation[row?.state]||dailyPresentation.unknown;}
function dailyTag(id){return `<span class="dayStateLabel" title="Trạng thái học tập hôm nay">${esc(dailyState(id).label)}</span>`;}
function healthTag(id){return unresolved().some(o=>o.student_id===id&&o.category==='health')?'<span class="observationTag">Sức khỏe</span>':'';}
function demoDaily(){const actions=actionMap(),students=activeStudents().map(st=>{const notes=S.obs.filter(o=>o.student_id===st.id&&['positive','concern'].includes(o.category)&&schoolDateOf(o.observed_at)===dateLocal()),positive=notes.filter(o=>o.category==='positive'),concern=notes.filter(o=>o.category==='concern'),attention=concern.some(o=>o.is_alert&&o.attention_kind==='unusual'&&actions.get(o.id)?.action!=='resolved'),outstanding=positive.some(o=>String(o.behavior_code).trim().toLocaleLowerCase('vi-VN')==='xuất sắc');return {student_id:st.id,state:attention?'attention':concern.length?'noted':outstanding?'outstanding':positive.length?'highlight':'clear'};});return {school_year:S.year,class_code:S.cls,school_today:dateLocal(),students,lesson_handoffs:[]};}
let dailyRevision=0;
async function refreshDailyLearning({force=false}={}){if(!force&&!S.demo&&Offline&&(S.offlineMode||Offline.shouldQueue())){paintDailyLearning();return;}if(!S.cls||!window.TranPhuSchoolYear.isCanonical(S.year))return;const y=S.year,c=S.cls,revision=++dailyRevision;try{const result=S.demo?{data:demoDaily()}:await sb.rpc('v4_daily_learning',{y,c});if(result.error)throw Object.assign(result.error,{status:result.status});if(revision!==dailyRevision||y!==S.year||c!==S.cls)return;S.daily=result.data;S.dailyError='';}catch(error){if(revision!==dailyRevision||y!==S.year||c!==S.cls)return;if(!Offline?.retryable(error))S.daily=null;S.dailyError=Offline?.retryable(error)?'Chưa cập nhật được dữ liệu. Kiểm tra kết nối và thử lại.':error.message||'Kiểm tra kết nối và thử lại.';}paintDailyLearning();}
function paintDailyLearning(){document.querySelectorAll('#classMap [data-student]').forEach(button=>{if(!button.dataset.student)return;for(const name of Object.values(dailyPresentation))button.classList.remove('day-state-'+name.css);const state=dailyState(button.dataset.student);button.classList.add('day-state-'+state.css);let label=button.querySelector('.dayStateLabel');if(label)label.textContent=state.label;});renderDailyHandoff();}
function handoffGroups(row){
 if(!Array.isArray(row.learning_groups))return '<p class="muted handoff-detail-status" role="status">Chưa có dữ liệu chi tiết cho tiết này. Quản trị cần cập nhật hệ thống.</p>';
 const groups=row.learning_groups.filter(g=>['positive','concern'].includes(g.category)&&Array.isArray(g.students)&&g.students.length);
 if(!groups.length)return '';
 return '<dl class="handoff-groups">'+groups.map(g=>{const names=[...new Map(g.students.map(st=>[st.student_id,st])).values()].map(st=>esc(st.full_name||st.student_code||'Học sinh'));return `<div class="handoff-group ${g.category==='positive'?'positive':'concern'}"><dt>${esc(g.behavior_code||'Ghi nhận')}<small>${names.length} học sinh</small></dt><dd>${names.join(', ')}</dd></div>`;}).join('')+'</dl>';
}
function handoffRow(row,open){
 const teacher=row.source==='teacher',source=teacher?'Giáo viên đã xác nhận':'Tổng hợp hệ thống';
 const preview=teacher?row.note||'':`${Number(row.positive)||0} lượt tích cực · ${Number(row.concern)||0} lượt cần cải thiện`;
 const detailNote=teacher?row.note:(Number(row.positive)||Number(row.concern)?'Giáo viên chưa xác nhận nhận định chung. Các ghi nhận đã lưu được tổng hợp bên dưới.':'Chưa có ghi nhận học tập riêng được lưu cho tiết này.');
 return `<details class="dailyHandoffRow lesson-history-row" data-handoff-session="${esc(row.session_id)}" ${open?'open':''}><summary><span class="handoff-slot">Tiết ${Number(row.period_no)} · ${esc(row.subject||'Chưa rõ môn')}<small>${esc(row.teacher_name||'Chưa rõ giáo viên')}</small></span><span class="handoff-row-source ${teacher?'teacher':'system'}">${source}</span><span class="handoff-preview">${esc(preview)}</span></summary><div class="handoff-detail"><p class="handoff-review-note">${esc(detailNote||'Chưa có dữ liệu được ghi nhận.')}</p>${handoffGroups(row)}</div></details>`;
}
function renderDailyHandoff(){
 const valid=S.daily?.school_year===S.year&&S.daily?.class_code===S.cls&&S.daily?.school_today===dateLocal();
 const selected=S.lessonPlan?.slots?.find(row=>row.class_code===S.cls&&row.period_no===S.period);
 for(const id of ['homeDailyHandoff','classDailyHandoff']){
  const target=$(id);if(!target)continue;const home=id==='homeDailyHandoff';
  const cutoff=home?(S.date===dateLocal()&&(selected||S.manualLesson)?Number(S.period):0):(S.session?.lesson_date===dateLocal()?Number(S.session.period_no):0);
  target.hidden=S.admin||!S.cls||!cutoff;
  if(target.hidden){target.replaceChildren();continue;}
  const wasOpen=target.open,opened=new Set([...target.querySelectorAll('[data-handoff-session][open]')].map(e=>e.dataset.handoffSession));
  const focused=target.contains(document.activeElement)?document.activeElement.closest('[data-handoff-session]')?.dataset.handoffSession:null;
  const refreshFocused=target.contains(document.activeElement)&&!!document.activeElement.closest('[data-refresh-daily]');
  const restoreFocus=()=>{if(refreshFocused)target.querySelector('[data-refresh-daily]')?.focus({preventScroll:true});else if(focused)for(const detail of target.querySelectorAll('[data-handoff-session]'))if(detail.dataset.handoffSession===focused)detail.querySelector('summary')?.focus({preventScroll:true});};
  let heading=home?'<div class="lesson-history-heading"><h3>Các tiết trước của lớp</h3><span>Lớp '+esc(S.cls)+' · Hôm nay</span><button type="button" class="btn outline" data-refresh-daily aria-label="Cập nhật các tiết trước của lớp">Làm mới</button></div>':'<summary>Các tiết trước của lớp hôm nay <small>'+esc(S.cls)+'</small></summary>';
  if(S.dailyError){if(!home)target.open=true;const notice=`<div class="handoff-read-error"><p role="alert">${home?'Chưa tải được các tiết trước. Kiểm tra kết nối và thử lại.':esc(S.dailyError)}</p><button type="button" class="btn outline" data-refresh-daily>Thử lại</button></div>`;if(!valid){target.innerHTML=heading+notice;if(!home)target.open=true;restoreFocus();continue;}heading+=notice+(valid?'<p class="muted">Đang dùng trạng thái đã lưu trên thiết bị.</p>':'');}
  if(!valid){target.innerHTML=heading+'<p class="handoff-empty" role="status">'+(S.offlineMode||Offline?.shouldQueue()?'Chưa có bản lưu cho hôm nay. Kết nối để tải các tiết trước.':'Đang tải các tiết trước…')+'</p>';continue;}
  const rows=(S.daily.lesson_handoffs||[]).filter(row=>row.class_code===S.cls&&row.lesson_date===dateLocal()&&Number(row.period_no)<cutoff&&row.stage==='final').sort((a,b)=>Number(a.period_no)-Number(b.period_no)||String(a.session_id).localeCompare(String(b.session_id)));
  target.innerHTML=heading+(rows.length?rows.map(row=>handoffRow(row,opened.has(row.session_id))).join(''):'<p class="handoff-empty">Chưa có tiết trước đã kết thúc trong hôm nay.</p>');
  if(!home)target.open=wasOpen||!!S.dailyError;
  restoreFocus();
 }
}
function avatar(g){
 const f=g==='Nữ',m=g==='Nam',name=f?'Học sinh nữ':m?'Học sinh nam':'Học sinh';
 if(f||m)return `<img class="genderAvatar studentCharacter studentFace" src="/assets/students/student-face-${f?'girl':'boy'}.webp" width="44" height="44" alt="${name}" loading="lazy" decoding="async">`;
 return `<svg class="genderAvatar" viewBox="0 0 56 56" role="img" aria-label="${name}" focusable="false" xmlns="http://www.w3.org/2000/svg">
 <circle cx="28" cy="28" r="27" fill="${f?'#fce1ef':m?'#dcedff':'#e4eaf1'}"/>
 ${f?'<path d="M14 40V22C14 10 22 7 28 7s14 3 14 15v18l-9 6H23Z" fill="#49342f"/>':m?'<path d="M17 22q-2-15 12-15 14 0 12 16l-4-7-7 2-9-2Z" fill="#43322a"/>':'<path d="M16 23q-1-15 12-15t12 15" fill="#58463b"/>'}
 <path d="M7 55q1-18 21-18t21 18" fill="${f?'#d5679f':m?'#276bbd':'#6b809b'}"/>
 <path d="M22 36h12v8l-6 4-6-4Z" fill="#efb894"/>
 <ellipse cx="28" cy="26" rx="12" ry="15" fill="#f7c9a6"/>
 <path d="M16 21q1-14 14-13 9 0 11 13-6-7-14-4-4 1-11 4Z" fill="#49342f"/>
 <circle cx="23" cy="27" r="1.4" fill="#35313c"/><circle cx="33" cy="27" r="1.4" fill="#35313c"/>
 <path d="M25 33q3 3 6 0" fill="none" stroke="#ad6770" stroke-width="1.8" stroke-linecap="round"/>
 ${m?'<path d="m23 42 5 6 5-6v14H23Z" fill="#e9f5ff"/>':'<path d="m23 44 5 5 5-5" stroke="#fff" stroke-width="2" fill="none"/>'}
 </svg>`;
}
function studentName(s){return s?.full_name?.trim()||'Trống'}
function attFor(id){const pending=pendingAttendance(id);return pending?{...pending.payload,_pending:true,_opId:pending.id,_blocked:pending.state==='blocked'}:S.attendance.find(a=>a.student_id===id)}
function attendanceLabel(id){const row=attFor(id);return row?(attLabels[row.status]||'Chưa điểm danh')+(row._pending?(row._blocked?' · Cần xử lý':' · Chờ gửi'):''):(S.automaticAttendance||[]).some(a=>a.session_id===S.session?.id&&a.student_id===id)?'Có mặt · Tự động, chờ xác nhận':'Chưa điểm danh';}
const attLabels={present:'✓ Có mặt',absent:'✕ Vắng',late:'◷ Muộn',excused:'◈ Có phép'};
function groupsPerPage(){const target=$(S.renderPage==='class'?'classMap':'seatingEditor'),available=target?.clientWidth||window.innerWidth;return available>=1080?4:available>=560?2:1}
function groupIndexes(){const n=groupsPerPage(),total=S.layout.length;S.groupPage=Math.max(0,Math.min(total-1,S.groupPage));const start=Math.floor(S.groupPage/n)*n;return classroomGroupOrder().slice(start,start+n)}
function mapHtml(edit=false){
 const target=$(edit?'seatingEditor':'classMap');target.classList.remove('classroom-depth');target.classList.add('classroom-compact');target.classList.toggle('attendance-view',!edit&&S.mode==='attendance');
 const projection=edit?null:rotationProjection(),mapSeats=projection?.seats||S.seats,order=edit?S.layout.map((_,i)=>i+1):projection.order;const visible=groupIndexes();target.style.setProperty('--classroom-group-count',visible.length);
 const tabs='<div class="classroom-group-tabs" role="group" aria-label="Chọn tổ">'+order.map((g,i)=>`<button type="button" data-group-index="${i}" aria-pressed="${visible.includes(g)}">Tổ ${g}</button>`).join('')+'</div>';
 const floor=visible.map(g=>{
  const count=Number(S.layout[g-1]||4);
  const desks=Array.from({length:count},(_,i)=>count-i).map(d=>{
   const seats=[1,2].map(pos=>{
    const match=mapSeats.find(s=>s.group_no===g&&s.desk_no===d&&s.seat_no===pos),student=activeStudents().find(x=>x.id===match?.student_id),att=student&&attFor(student.id),state=student&&dailyState(student.id);
    const cls=student?'seat day-state-'+state.css+(att?' att-'+att.status:'')+(student.id===S.selected?' selected':''):'seat empty';
    const content=student?`<span class="studentIdentity"><span class="avatar">${avatar(student.gender)}</span><span class="studentName">${esc(studentName(student))}</span></span>${edit?'':`<span class="status">${esc(attendanceLabel(student.id))}</span>${dailyTag(student.id)+healthTag(student.id)}`}`:'＋ Trống';
    return `<button class="${cls}" type="button" data-seat="${g}:${d}:${pos}" data-student="${student?.id||''}">${content}</button>`;
   }).join('');
   return `<div class="desk" data-desk="${d}"><span hidden>Bàn ${d}</span>${seats}</div><div class="deskNum">Bàn ${d} · 2 chỗ</div>`;
  }).join('');
  return `<section class="group"><h3>Tổ ${g} · ${count} bàn${!edit&&S.rotation?.config?.enabled?' · Dãy '+(order.indexOf(g)+1):''}</h3><div class="endClass">CUỐI LỚP ↑</div>${desks}</section>`;
 }).join('')+`<div class="mainTeacherDesk"><svg class="ui-icon" aria-hidden="true"><use href="#i-board"/></svg> BÀN GIÁO VIÊN – ĐẦU LỚP</div>`;
 return edit?tabs+'<div class="seating-view-tools"><p>Sơ đồ gốc · Bàn 1 ở dưới, gần giáo viên</p><button type="button" id="focusSeatingFront" class="btn outline">Đầu lớp ↓</button></div><div id="seatingViewport" class="classroom-viewport seating-viewport" tabindex="0" role="region" aria-label="Sơ đồ xếp chỗ: bàn đầu ở dưới, cuộn lên để xem cuối lớp"><div id="seatingFloor" class="classroom-floor">'+floor+'</div></div><p class="classroom-direction">↑ Cuộn lên xem cuối lớp · Bàn đầu ở dưới</p>':tabs+'<div id="classroomViewport" class="classroom-viewport" tabindex="0" role="region" aria-label="Sơ đồ lớp: bàn đầu ở dưới, cuộn lên để xem bàn phía sau"><div class="classroom-floor">'+floor+'</div></div><p class="classroom-direction">↑ Cuộn lên xem bàn phía sau · Bàn đầu ở dưới</p>';
}

const studentSearchKey=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
function renderStudentSearch(){
 const target=$('studentSearchResults'),query=studentSearchKey($('studentSearch').value);
 if(!query){target.hidden=true;target.innerHTML='';return;}
 const found=activeStudents().filter(s=>studentSearchKey(s.full_name).includes(query)||studentSearchKey(s.student_code).includes(query)).slice(0,10);
 target.hidden=false;target.innerHTML=found.map(s=>`<button type="button" class="searchResult" role="option" data-search-student="${esc(s.id)}">${avatar(s.gender)} <span>${esc(s.full_name)}<small>${esc(s.student_code||'')}</small></span></button>`).join('')||'<p class="muted">Không tìm thấy học sinh phù hợp.</p>';
}
function rosterHtml(){
 return `<div class="rosterFallback"><b>Danh sách học sinh</b><div class="rosterGrid">${activeStudents().map(st=>{
  const att=attFor(st.id),state=dailyState(st.id);
  const label=attendanceLabel(st.id);
  return `<button type="button" class="rosterStudent day-state-${state.css}" data-student="${esc(st.id)}"><span class="avatar">${avatar(st.gender)}</span><span class="rosterName">${esc(st.full_name)}</span><small class="attendanceTag">${esc(label)}</small>${dailyTag(st.id)}${healthTag(st.id)}</button>`;
 }).join('')}</div></div>`;
}
const classroomPositions=new Map();
function renderClassMap({revealStudent=false}={}){
 const old=$('classroomViewport');if(old?.clientHeight&&old.dataset.positionReady==='true')classroomPositions.set(old.dataset.positionKey,Math.max(0,old.scrollHeight-old.clientHeight-old.scrollTop));
 const pending=!S.layoutConfirmed,target=$('classMap');target.classList.toggle('rosterMode',pending);
 if(pending)target.classList.remove('classroom-depth','classroom-compact','attendance-view');
 target.innerHTML=pending?rosterHtml():mapHtml();
 const viewport=$('classroomViewport');if(!viewport)return;
 const key=lessonContextKey()+'|'+groupIndexes().join(',')+'|'+S.layout.join(',')+'|'+(S.rotation?.revision||0)+'|'+rotationProjection().steps;viewport.dataset.positionKey=key;
 viewport.addEventListener('scroll',()=>{if(viewport.dataset.positionReady==='true')classroomPositions.set(key,Math.max(0,viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop));},{passive:true});
 requestAnimationFrame(()=>{
  if(!viewport.isConnected||!viewport.clientHeight)return;
  viewport.scrollTop=viewport.scrollHeight-viewport.clientHeight-(classroomPositions.get(key)||0);
  viewport.dataset.positionReady='true';
  if(revealStudent){const student=[...viewport.querySelectorAll('[data-student]')].find(el=>el.dataset.student===S.selected);if(student){const a=student.getBoundingClientRect(),b=viewport.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom)viewport.scrollTop+=a.top-b.top-(viewport.clientHeight-a.height)/2;}}
 });
}
function studentOrder(){
 const students=activeStudents(),plan=rotationProjection(),seated=[...plan.seats].sort((a,b)=>plan.order.indexOf(a.group_no)-plan.order.indexOf(b.group_no)||a.desk_no-b.desk_no||a.seat_no-b.seat_no).map(seat=>students.find(student=>student.id===seat.student_id)).filter(Boolean);
 return S.layoutConfirmed?[...new Map([...seated,...students].map(student=>[student.id,student])).values()]:students;
}
function moveStudent(delta){
 const order=studentOrder(),index=order.findIndex(student=>student.id===S.selected),next=order[index+delta];if(!next)return;
 S.selected=next.id;chosenBehavior=null;const seat=S.seats.find(row=>row.student_id===next.id);if(seat)S.groupPage=classroomGroupOrder().indexOf(seat.group_no);
 renderClass({revealStudent:true});
}
function renderClass({revealStudent=false}={}){paintRotationNotice();$('classPage').dataset.classMode=S.mode;if(S.demo)S.daily=demoDaily();rememberLesson();renderDailyHandoff();if(!S.cls){$('classMap').innerHTML='<div class="box">Chưa có lớp được phân quyền.</div>';return;}$('lessonLabel').textContent=`Lớp ${S.cls} · Tiết ${S.period}`;$('lessonClass').textContent=`${S.subject||'Chưa xác định môn'} · ${S.date}`;document.querySelectorAll('#classMode button').forEach(b=>{b.classList.toggle('on',b.dataset.mode===S.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===S.mode));});let statuses=['present','absent','late','excused'],recorded=currentAttendance(),activeCount=new Set(activeStudents().map(s=>s.id)).size;$('attendanceStats').innerHTML=`<div class="stat"><b>${activeCount}</b><small>Sĩ số</small></div>`+statuses.map(a=>`<div class="stat"><b>${recorded.filter(x=>x.status===a).length}</b><small>${attLabels[a]}</small></div>`).join('')+`<div class="stat"><b>${Math.max(0,activeCount-recorded.length)}</b><small>Chưa xác nhận</small></div>`;
 const pending=!S.layoutConfirmed;let notice=$('layoutNotice');notice.hidden=!pending;notice.textContent=pending?'Lớp chưa có sơ đồ chỗ ngồi, đang hiển thị danh sách học sinh.':'';renderClassMap({revealStudent});renderStudentPanel();const locked=!!S.session&&(S.session._readOnly||S.session.lesson_date!==dateLocal());$('markRest').disabled=locked;document.dispatchEvent(new Event('tranphu:lesson-render'));if(locked){notice.hidden=false;notice.textContent=S.session._readOnly?'Tiết này chỉ được xem lại theo quyền và trạng thái máy chủ.':'Tiết ngày trước đã khóa, chỉ được xem lại';document.querySelectorAll('#studentPanel [data-att],#studentPanel [data-behavior],#studentPanel [data-edit-obs],#studentPanel #saveObs,#studentPanel textarea,#studentPanel input').forEach(el=>el.disabled=true);}}
function renderStudentPanel(){if(!S.demo)setTimeout(restoreStudentDraft,0);const panel=$('studentPanel'),key=S.selected+'|'+S.mode;if(panel.dataset.studentKey!==key)panel.scrollTop=0;panel.dataset.studentKey=key;let s=S.students.find(x=>x.id===S.selected);$('studentPanel').classList.toggle('open',!!s);$('studentBackdrop').hidden=!(s&&window.innerWidth<=700);if(!s){$('studentPanel').innerHTML='<h2>Chọn học sinh</h2><p class="muted">Chạm tên học sinh để điểm danh hoặc nhận xét.</p>';return;}const order=studentOrder(),index=order.findIndex(student=>student.id===s.id);let info=`<div class="student-panel-heading"><button type="button" class="btn closePanel" aria-label="Đóng chi tiết học sinh" data-close-panel>✕ Đóng</button><div class="studentHeader"><span class="avatar">${avatar(s.gender)}</span><div><h2 style="margin:0">${esc(s.full_name)}</h2><p class="muted" style="margin:0">${esc(s.student_code)} · ${esc(s.gender)}</p></div></div><div class="student-stepper" role="group" aria-label="Chọn học sinh theo thứ tự từ bàn đầu"><button type="button" class="btn outline" data-student-step="-1" ${index<=0?'disabled':''}>← Trước</button><span>${index+1} / ${order.length}</span><button type="button" class="btn outline" data-student-step="1" ${index>=order.length-1?'disabled':''}>Tiếp →</button></div></div>`;
 if(S.mode==='attendance'){$('studentPanel').innerHTML=info+`<h3>Trạng thái điểm danh</h3><div class="choicegrid">${Object.entries(attLabels).map(([status,label])=>`<button type="button" class="btn outline ${attFor(s.id)?.status===status?'sel':''}" aria-pressed="${attFor(s.id)?.status===status}" data-att="${status}">${label}</button>`).join('')}</div><label>Ghi chú<input id="attNote" placeholder="Ví dụ: đến muộn 5 phút" value="${esc(attFor(s.id)?.note||'')}"></label>`;return}
 let positive=['Tích cực phát biểu','Chủ động giúp bạn','Hoàn thành nhiệm vụ','Hợp tác nhóm','Tiến bộ rõ rệt','Xuất sắc'];let concern=['Dấu hiệu bất thường','Không tập trung','Nói chuyện riêng','Không ghi bài','Chưa hợp tác','Chọc ghẹo bạn','Chưa làm bài','Mất trật tự'];let health=['Đau bụng','Đau đầu','Mệt','Cần theo dõi sức khỏe'];let all=S.behaviors.length?S.behaviors.filter(b=>b.active).map(b=>[b.category,b.behavior_code]):[...positive.map(x=>['positive',x]),...concern.map(x=>['concern',x]),...health.map(x=>['health',x])];$('studentPanel').innerHTML=info+`<h3>Nhận xét nhanh</h3><div class="behavior-categories" role="group" aria-label="Nhóm nhận xét"><button type="button" data-behavior-category="positive" aria-pressed="false">★ Tích cực</button><button type="button" data-behavior-category="concern" aria-pressed="false">! Cần hỗ trợ</button><button type="button" data-behavior-category="health" aria-pressed="false">✚ Sức khỏe</button></div><div class="behaviors">${all.map(([cat,b])=>`<button type="button" data-behavior="${esc(cat)}|${esc(b)}" data-category="${esc(cat)}" aria-pressed="false">${cat==='positive'?'🌟':cat==='health'?'⚕️':'⚠️'} ${esc(b)}</button>`).join('')}</div><label>Ghi chú (không bắt buộc)<textarea id="obsNote" rows="2" maxlength="600" placeholder="Ghi sự kiện cụ thể, tránh gắn nhãn học sinh."></textarea></label><label class="checkline" style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="obsAlert" style="width:auto;min-height:auto"> Dấu hiệu bất thường cần lưu ý</label><div class="observation-save"><p id="chosenBehaviorLabel" role="status">Chạm để lưu ngay · Có thể chọn nhiều nhận xét</p><button type="button" id="saveObs" class="btn primary wide" hidden disabled>Lưu nhận xét</button></div><h3>Ghi nhận gần đây</h3><div class="studentHistory">${S.pendingOps.filter(o=>o.kind==='observation'&&o.payload.student_id===s.id&&offlineScope(o)).map(o=>`<div class="pending-history"><b>${esc(o.payload.behavior_code)}</b><p>${esc(o.payload.note||'')}</p><small>Đã lưu trên thiết bị · ${o.state==='blocked'?'Cần xử lý':'Chờ gửi'}</small></div>`).join('')}${S.obs.filter(o=>o.student_id===s.id).slice(0,8).map(o=>`<div class="historyItem"><div><b>${o.category==='health'?'⚕️':o.category==='positive'?'★':'⚠️'} ${esc(o.behavior_code)}</b><small>${new Date(o.observed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · ${esc(S.teacherNames[o.created_by]||'Giáo viên')}</small><p>${esc(o.note||'Không có ghi chú')}${o.edited_at?' (đã chỉnh sửa)':''}</p></div>${((S.demo||o.created_by===S.user?.id)&&schoolDateOf(o.observed_at)===dateLocal())?`<button class="btn outline" data-edit-obs="${esc(o.id)}">Sửa</button>`:''}${(S.demo||o.edited_at)?`<button class="btn outline" data-history-obs="${esc(o.id)}">Lịch sử</button>`:''}</div>`).join('')||'<p class="muted">Chưa có ghi nhận.</p>'}</div>`;paintBehaviorChoices();}
function refreshSourceHint(){
 const node=$('lessonSource'),reason=$('manualReasonWrap');if(!node||!reason)return;
 reason.hidden=node.value==='tkb';
 const date=$('lessonDate').value,period=Number($('periodSelect').value),cls=$('classSelect').value;
 const day=date?tkbDay(date):null;
 const match=S.tkb.find(t=>t.day_no===day&&t.period_no===period&&t.class_code===cls&&t.teacher_code===S.profile?.teacher_code);
 if(match&&node.value==='tkb'&&!document.activeElement?.isSameNode($('subject'))) $('subject').value=match.subject;
 $('sourceHint').textContent='';$('sourceHint').hidden=!$('sourceHint').textContent;renderHomeLessonSummary();renderDailyHandoff();
}
async function editObservation(id){
 const o=S.obs.find(x=>x.id===id);if(!o)return;if(schoolDateOf(o.observed_at)!==dateLocal())return toast('Ghi nhận ngày trước đã khóa, chỉ được xem lại');
 if(!S.demo&&o.created_by!==S.user?.id)return toast('Không được sửa ghi nhận của giáo viên khác');
 const body=document.createElement('div');body.innerHTML=`<p class="muted">${esc(o.behavior_code)} – ${new Date(o.observed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</p><label>Nội dung ghi chú<textarea id="editObservationNote" maxlength="600">${esc(o.note||'')}</textarea></label><p id="editObservationMessage" role="alert"></p><div class="actions"><button type="button" class="btn outline" id="cancelEditObservation">Hủy</button><button type="button" class="btn primary" id="confirmEditObservation">Lưu chỉnh sửa</button></div>`;
 const ui=window.TranPhuDialog.content({title:'Sửa ghi chú của tôi',content:body,initialFocus:'#editObservationNote'});
 body.querySelector('#cancelEditObservation').onclick=()=>{if(ui.dialog.getAttribute('aria-busy')!=='true')ui.close(false);};
 body.querySelector('#confirmEditObservation').onclick=async event=>{if(event.currentTarget.disabled)return;const button=event.currentTarget,note=body.querySelector('#editObservationNote').value.trim();button.disabled=true;ui.setBusy(true);
  try{if(!S.demo){const r=await sb.from('v4_observations').update({note}).eq('id',id).select('*').single();if(r.error)throw r.error;Object.assign(o,r.data);}else{o.note=note;o.edited_at=new Date().toISOString();}
   const al=S.openAlerts.find(x=>x.id===id);if(al)Object.assign(al,o);ui.close(true);renderStudentPanel();document.querySelector('[data-edit-obs="'+id+'"]')?.focus();renderHomeAlerts();toast('Đã lưu ghi chú và lịch sử chỉnh sửa');
  }catch(e){body.querySelector('#editObservationMessage').textContent=e.message||'Chưa lưu được ghi chú';}finally{button.disabled=false;ui.setBusy(false);}
 };
}
async function showObservationEditHistory(id){
 const o=S.obs.find(x=>x.id===id);if(!o)return;const body=document.createElement('div');body.innerHTML=`<p class="muted">${esc(o.behavior_code)} · ${esc(S.students.find(x=>x.id===o.student_id)?.full_name||'Học sinh')}</p><div id="historyEditItems" role="status" aria-busy="true">Đang tải...</div><div class="actions"><button type="button" class="btn primary" id="closeEditHistory">Đóng</button></div>`;
 const ui=window.TranPhuDialog.content({title:'Lịch sử chỉnh sửa',content:body,initialFocus:'#closeEditHistory'});body.querySelector('#closeEditHistory').onclick=()=>ui.close(false);
 try{if(S.demo){body.querySelector('#historyEditItems').textContent='Bản xem thử không lưu lịch sử trên máy chủ.';return;}const r=await sb.rpc('v4_observation_edit_history',{ob:id});if(r.error)throw r.error;
  body.querySelector('#historyEditItems').innerHTML=(r.data||[]).map(h=>`<div class="historyItem"><small>${new Date(h.changed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</small><p><b>Nội dung trước khi sửa:</b> ${esc(h.old_note||'(không có ghi chú)')}</p></div>`).join('')||'<p class="muted">Chưa có lần chỉnh sửa nào.</p>';
 }catch(e){body.querySelector('#historyEditItems').textContent='Không thể xem lịch sử: '+(e.message||String(e));}finally{body.querySelector('#historyEditItems').setAttribute('aria-busy','false');}
}
async function startLesson(){try{if(S.admin)throw Error('Tài khoản quản trị không có chức năng đánh giá học sinh. Hãy dùng tài khoản giáo viên.');if(S.yearIssue)throw Error(S.yearIssue);if(!S.manualLesson&&!S.demo){const plan=teachingPlan();if(!plan.slots.some(r=>r.class_code===$('classSelect').value&&r.period_no===+$('periodSelect').value))throw Error(plan.title+'. '+plan.message);}S.cls=$('classSelect').value;S.period=Number($('periodSelect').value);S.date=$('lessonDate').value;S.subject=$('subject').value.trim()||'Chưa xác định';if(!S.cls||!S.date)throw Error('Chọn lớp và ngày');if(S.date!==dateLocal())throw Error('Chỉ được ghi nhận tiết học trong ngày hiện tại');
 const source=$('lessonSource').value, override_reason=$('overrideReason').value.trim();
 const jsday=tkbDay(S.date);
 const expected=S.tkb.find(t=>t.day_no===jsday&&t.period_no===S.period&&t.class_code===S.cls&&t.teacher_code===S.profile?.teacher_code&&t.subject===S.subject);
 if(!S.demo&&source==='tkb'&&!expected)throw Error('Không khớp TKB giáo viên. Hãy kiểm tra tiết học hoặc liên hệ quản trị cập nhật phân công.');
 if(!S.demo&&source!=='tkb'&&override_reason.length<10)throw Error('Vui lòng ghi lý do chọn thủ công ít nhất 10 ký tự.');if(S.demo){const previous=lessonContextKey();S.session={id:'demo-session',school_year:S.year,class_code:S.cls,period_no:S.period,lesson_date:S.date,subject:S.subject,teacher_id:'demo'};if(previous!==lessonContextKey())S.attendance=[];attendanceStage.key='';attendanceStage.complete=false;advanceAttendanceStage();renderClass();showPage('class');return;}await loadClassData();const entry={id:crypto.randomUUID(),school_year:S.year,class_code:S.cls,period_no:S.period,lesson_date:S.date,subject:S.subject,timetable_version_id:S.tkbVersion?.id==null?null:String(S.tkbVersion.id),teacher_id:S.user.id,source,override_reason};const saved=await durableChange('open',entry,{},null,async()=>{let r=await sb.from('v4_sessions').insert(entry).select('*').single();if(r.error?.code==='23505')r=await sb.from('v4_sessions').select('*').eq('school_year',entry.school_year).eq('class_code',entry.class_code).eq('lesson_date',entry.lesson_date).eq('period_no',entry.period_no).single();if(r.error)throw Object.assign(r.error,{status:r.status});if(r.data.teacher_id!==S.user.id)throw Error('Tiết đã được giáo viên khác tạo. Liên hệ quản trị để kiểm tra phân công.');if(r.data.ended_at)throw Error('Tiết đã kết thúc. Có thể xem báo cáo nhưng không thể ghi thêm.');return {session:r.data};});S.session=saved.pending?{...entry,_pending:true}:saved.result.session;attendanceStage.key='';attendanceStage.complete=false;await loadAttendance();renderClass();showPage('class');await saveLessonCache();}catch(e){fail(e)}}
async function loadAttendance(){if(S.demo){advanceAttendanceStage();return;}if(Offline&&(S.offlineMode||navigator.onLine===false)){const cached=await Offline.cacheGet('lesson:'+S.session.id);S.attendance=cached?.attendance||[];S.automaticAttendance=cached?.automaticAttendance||[];S.sessionRosterIds=cached?.sessionRosterIds||[];await refreshPending();advanceAttendanceStage();return;}const key=lessonContextKey();const [r,state]=await Promise.all([sb.from('v4_attendance').select('*').eq('session_id',S.session.id),sb.rpc('v4_attendance_state',{sess:S.session.id})]);if(r.error)throw r.error;if(state.error)throw state.error;if(key!==lessonContextKey())return;S.attendance=r.data||[];S.automaticAttendance=state.data?.automatic||[];S.sessionRosterIds=state.data?.roster_ids||[];S.attendanceReadAt=Date.now();S.attendanceReadKey=lessonContextKey();advanceAttendanceStage();S.serverDay=String(state.data?.server_today||S.serverDay).slice(0,10);await saveLessonCache();}
// Serialize this page's attendance intents; conditional writes detect another tab's edits.
let attendanceWrites=Promise.resolve();
let attendanceIntent=0;
async function saveAttendance(status,{noteOnly=false}={}){
 if(S.session&&S.session.lesson_date!==dateLocal())return toast('Tiết ngày trước đã khóa, chỉ được xem lại');
 const student=activeStudents().find(x=>x.id===S.selected);if(!student||!S.session)return toast('Chưa chọn học sinh hoặc chưa bắt đầu tiết');
 if(!Object.hasOwn(attLabels,status))return;
 const key=lessonContextKey(),user=S.user?.id,sessionId=S.session.id,note=$('attNote')?.value||'',intent=++attendanceIntent;toast('Đang lưu điểm danh…','info');
 const work=async()=>{
  if(key!==lessonContextKey()||user!==S.user?.id)throw Error('Tiết học hoặc tài khoản đã thay đổi. Hãy kiểm tra lại điểm danh.');
  const previous=attFor(student.id);if(previous?._blocked)throw Error('Bản điểm danh trước đang xung đột. Mở bản chờ gửi để đối chiếu hoặc bỏ bản cũ trước khi lưu lại.');const value={session_id:sessionId,student_id:student.id,status:noteOnly?(previous?.status||status):status,note,updated_by:S.demo?'demo':user};
  let saved=value;
  if(!S.demo){
   const base=previous?previous._pending?{previousOperation:previous._opId,student_id:student.id}:{student_id:previous.student_id,status:previous.status,note:previous.note,updated_at:previous.updated_at}:null;
   const persisted=await durableChange('attendance',lessonEnvelope(),{student_id:student.id,status:value.status,note},base,async()=>{
   let query;
   if(previous&&!previous._pending){
    query=sb.from('v4_attendance').update(noteOnly?{note,updated_by:user}:{status,note,updated_by:user}).eq('session_id',sessionId).eq('student_id',student.id);
    for(const field of ['status','note','updated_at'])if(previous[field]!==undefined)query=previous[field]===null?query.is(field,null):query.eq(field,previous[field]);
   }else query=sb.from('v4_attendance').upsert(value,{onConflict:'session_id,student_id',ignoreDuplicates:true});
   const result=await query.select('*');if(result.error)throw Object.assign(result.error,{status:result.status});
   saved=result.data?.[0];
   if(!saved){
    // A retry after a lost response may already have committed exactly this intent.
    const latest=await sb.from('v4_attendance').select('*').eq('session_id',sessionId).eq('student_id',student.id).maybeSingle();if(latest.error)throw latest.error;
    if(latest.data?.note===note&&(noteOnly||latest.data?.status===status))saved=latest.data;
    else throw Error('Điểm danh đã thay đổi ở nơi khác. Ghi chú đang nhập được giữ lại; hãy đối chiếu và làm mới trước khi lưu lại.');
   }
    return {session:S.session,attendance:saved};
   });
   if(persisted.pending){if(key===lessonContextKey()&&S.renderPage==='class'&&S.selected===student.id&&!noteOnly){if(window.innerWidth<=700)S.selected=null;renderClass();}await savePortalCache();return toast('Đã lưu trên thiết bị · Chờ gửi điểm danh: '+student.full_name);}
   saved=persisted.result.attendance;
  }
  if(key!==lessonContextKey()||user!==S.user?.id)return;
  S.attendance=S.attendance.filter(x=>x.student_id!==student.id).concat(saved);await saveLessonCache();S.automaticAttendance=(S.automaticAttendance||[]).filter(x=>x.student_id!==student.id);
  // Note blur must not replace the focused panel or swallow the subsequent status click.
  if(noteOnly)return toast('Đã lưu ghi chú: '+student.full_name);
  if(intent!==attendanceIntent||S.renderPage!=='class'||S.selected!==student.id||($('attNote')&&$('attNote').value!==note))return;
  const advanced=advanceAttendanceStage();if(window.innerWidth<=700&&!advanced)S.selected=null;
  renderClass();toast(advanced?'Đã điểm danh đủ. Chuyển sang nhận xét.':'Đã lưu điểm danh: '+student.full_name);
 };
 const pending=attendanceWrites.then(work);attendanceWrites=pending.catch(error=>{fail(error);});
 return attendanceWrites;
}
async function markRest(){
 if(markRest.saving)return;
 if(S.session&&S.session.lesson_date!==dateLocal())return toast('Tiết ngày trước đã khóa, chỉ được xem lại');
 if(!S.session)return toast('Cần bắt đầu tiết học trước khi điểm danh');
 if(!activeStudents().length)return toast('Lớp chưa có học sinh đang học để điểm danh');
 const key=lessonContextKey(),recorded=new Set(currentAttendance().map(row=>row.student_id));
 let remaining=[...new Map(activeStudents().map(s=>[s.id,s])).values()].filter(s=>!recorded.has(s.id));
 if(!remaining.length)return toast('Tất cả đã được xác nhận');
 if(!await confirmPortal(`${remaining.length} học sinh chưa điểm danh sẽ được xác nhận có mặt.`,{title:'Xác nhận học sinh có mặt',confirmLabel:'Xác nhận có mặt',details:`Lớp ${S.cls} · Tiết ${S.period} · ${S.date}`}))return;
 if(key!==lessonContextKey())return toast('Tiết học đã thay đổi, vui lòng kiểm tra lại');
 try{
  if(!S.demo){markRest.saving=true;$('markRest').disabled=true;try{await window.TranPhuConfirmAttendance();}finally{markRest.saving=false;$('markRest').disabled=S.session?.lesson_date!==dateLocal();}return;}
  await attendanceWrites;
  if(key!==lessonContextKey())throw Error('Tiết học đã thay đổi, vui lòng kiểm tra lại');
  // Re-read after the dialog: another successful action may have recorded a child.
  const confirmed=new Set(currentAttendance().map(row=>row.student_id));remaining=remaining.filter(s=>activeStudents().some(active=>active.id===s.id)&&!confirmed.has(s.id));
  if(!remaining.length)return toast('Tất cả đã được xác nhận');
  let rows=remaining.map(s=>({session_id:S.session.id,student_id:s.id,status:'present',note:'',updated_by:S.demo?'demo':S.user.id}));
  if(!S.demo){let r=await sb.from('v4_attendance').upsert(rows,{onConflict:'session_id,student_id',ignoreDuplicates:true});if(r.error)throw r.error;
   const loaded=await sb.from('v4_attendance').select('*').eq('session_id',S.session.id);if(loaded.error)throw loaded.error;rows=loaded.data||[];}
  if(key!==lessonContextKey())return toast('Đã lưu điểm danh cho tiết trước. Vui lòng kiểm tra tiết hiện tại.');
  const ids=new Set(rows.map(row=>row.student_id));S.attendance=S.attendance.filter(row=>!ids.has(row.student_id)).concat(rows);
  const advanced=advanceAttendanceStage();renderClass();toast(advanced?'Đã điểm danh đủ. Chuyển sang nhận xét.':`Đã lưu ${rows.length} học sinh có mặt`);
 }catch(e){fail(e)}
}
let chosenBehavior=null;
const pendingObservations=new Map();
async function insertObservationOnce(value){
 const key=JSON.stringify(value);let id=value.id||pendingObservations.get(key);if(!id){id=crypto.randomUUID();pendingObservations.set(key,id);}
 let result=await sb.from('v4_observations').insert({...value,id}).select('*').single();
 if(result.error?.code==='23505')result=await sb.from('v4_observations').select('*').eq('id',id).eq('created_by',S.user.id).single();
 if(result.error)throw Object.assign(result.error,{status:result.status});pendingObservations.delete(key);return result.data;
}
const quickObservationWrites=new Set();let observationRefreshTimer;
function refreshObservationHistory(){if(S.mode!=='observe'||!S.selected)return;const original=$('studentPanel').querySelector('.studentHistory');if(!original)return;const holder=document.createElement('div');holder.innerHTML=S.pendingOps.filter(o=>o.kind==='observation'&&o.payload.student_id===S.selected&&offlineScope(o)).map(o=>`<div class="pending-history"><b>${esc(o.payload.behavior_code)}</b><p>${esc(o.payload.note||'')}</p><small>${o.state==='blocked'?'Cần xử lý':'Đã lưu trên thiết bị · Chờ gửi'}</small></div>`).join('')+S.obs.filter(o=>o.student_id===S.selected).slice(0,8).map(o=>`<div class="historyItem"><div><b>${esc(o.behavior_code)}</b><p>${esc(o.note||'Không có ghi chú')}</p></div>${(S.demo||o.created_by===S.user?.id)&&schoolDateOf(o.observed_at)===dateLocal()?`<button type="button" class="btn outline" data-edit-obs="${esc(o.id)}">Sửa</button>`:''}${S.demo||o.edited_at?`<button type="button" class="btn outline" data-history-obs="${esc(o.id)}">Lịch sử</button>`:''}</div>`).join('');original.replaceChildren(...holder.childNodes);}

function behaviorRecord(studentId,category,code){return S.obs.find(o=>o.session_id===S.session?.id&&o.student_id===studentId&&o.category===category&&o.behavior_code===code)||S.pendingOps.find(o=>o.kind==='observation'&&offlineScope(o)&&o.payload.student_id===studentId&&o.payload.category===category&&o.payload.behavior_code===code);}
function paintBehaviorChoices(){document.querySelectorAll('#studentPanel [data-behavior]').forEach(b=>{const [category,code]=b.dataset.behavior.split('|'),record=behaviorRecord(S.selected,category,code),busy=quickObservationWrites.has(lessonContextKey()+'|'+S.selected+'|'+b.dataset.behavior);b.classList.toggle('sel',!!record);b.setAttribute('aria-pressed',String(!!record));b.disabled=busy||!!record;b.title=busy?'Đang lưu':record?(record.payload?(record.state==='blocked'?'Cần xử lý':'Đã lưu trên thiết bị · Chờ gửi'):'Đã ghi nhận trong tiết này'):'Chạm để lưu ngay';});}
async function saveObservation(){
 if(!S.session||S.session.lesson_date!==dateLocal())return toast('Cần mở tiết trong ngày để ghi nhận');
 const student=S.students.find(x=>x.id===S.selected);if(!student||!chosenBehavior)return;
 const [category,behavior_code]=chosenBehavior,lesson={...S.session},lessonKey=lessonContextKey(),uid=S.user?.id,writeKey=lessonKey+'|'+student.id+'|'+category+'|'+behavior_code;
 if(quickObservationWrites.has(writeKey)||behaviorRecord(student.id,category,behavior_code))return;
 const note=$('obsNote')?.value.trim()||'',alert=category==='health'||category==='concern'&&!!$('obsAlert')?.checked;
 const value={student_id:student.id,school_year:lesson.school_year,class_code:lesson.class_code,session_id:lesson.id,category,behavior_code,note,is_alert:alert,attention_kind:category==='concern'&&alert?'unusual':null,created_by:S.demo?'demo':uid};
 quickObservationWrites.add(writeKey);paintBehaviorChoices();
 try{
  const saved=S.demo?{result:{observation:{...value,id:'demo-obs-'+Date.now()+'-'+Math.random().toString(36).slice(2),observed_at:new Date().toISOString()}}}:await durableChange('observation',lessonEnvelope(lesson),value,null,async op=>({session:lesson,observation:await insertObservationOnce({...value,id:op.id})}));
  if(uid!==S.user?.id||lessonKey!==lessonContextKey())return;
  if(!saved.pending){const v=saved.result.observation;S.obs=S.obs.filter(x=>x.id!==v.id);S.obs.unshift(v);if(v.is_alert){S.openAlerts=S.openAlerts.filter(x=>x.id!==v.id);S.openAlerts.unshift(v);}}
  if(S.selected===student.id&&$('chosenBehaviorLabel'))$('chosenBehaviorLabel').textContent=behavior_code+' · '+(saved.pending?'Đã lưu trên thiết bị · Chờ gửi':'Đã lưu');
  await savePortalCache();clearTimeout(observationRefreshTimer);if(!saved.pending&&!S.demo)observationRefreshTimer=setTimeout(()=>{if(uid===S.user?.id&&lessonKey===lessonContextKey())refreshDailyLearning({force:true});},750);renderClassMap();refreshObservationHistory();document.dispatchEvent(new Event('tranphu:lesson-render'));
 }catch(e){fail(e);}finally{quickObservationWrites.delete(writeKey);paintBehaviorChoices();}
}
function alertRows(){return unresolved().map(o=>{let s=S.students.find(x=>x.id===o.student_id),a=actionMap().get(o.id);return `<div class="alertRow ${o.category==='health'?'health':''}"><div class="left"><b>${o.category==='health'?'⚕️':'⚠️'} ${esc(s?.full_name||'Học sinh')}</b><div><b>${esc(o.behavior_code)}</b> · ${esc(o.note)}</div><small class="muted">${new Date(o.observed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · ${esc(S.teacherNames[o.created_by]||'Giáo viên được phân công')} · ${a?.action==='monitoring'?'Đang theo dõi':'Chưa xử lý'}</small></div><div><button class="btn outline" data-action="monitoring" data-obs="${o.id}">Theo dõi</button><button class="btn green" data-action="resolved" data-obs="${o.id}">Đã ổn</button></div></div>`}).join('')||'<p class="muted">Không có cảnh báo đang mở cho lớp này.</p>'}
function renderHomeAlerts(){const list=unresolved();if($('homeAlertCount'))$('homeAlertCount').textContent=String(new Set(list.map(o=>o.student_id)).size);$('homeAlerts').innerHTML=list.length?`<div class="homeAlertList">${list.slice(0,5).map(o=>{let st=S.students.find(x=>x.id===o.student_id);return `<div class="homeAlertItem ${o.category==='health'?'health':'concern'}"><b>${esc(st?.full_name||'Học sinh')}</b><span>${esc(o.behavior_code)}</span></div>`}).join('')}</div>`:'<p class="muted">Không có trường hợp cần theo dõi.</p>';}
function renderAlerts(){$('alertList').innerHTML=alertRows()}
async function alertAction(oId,action){try{let note='';if(action==='resolved'){if(!await confirmPortal('Thông tin theo dõi trường hợp này sẽ được lưu trong lịch sử.',{title:'Kết thúc theo dõi?',confirmLabel:'Kết thúc theo dõi'}))return;note=await promptPortal('Ghi ngắn gọn tình trạng khi kết thúc theo dõi.',{title:'Ghi chú kết thúc theo dõi',cancelLabel:'Bỏ qua',confirmLabel:'Lưu ghi chú'})??'';}let v={observation_id:oId,action,acted_by:S.demo?'demo':S.user.id,note};if(!S.demo){let r=await sb.from('v4_alert_actions').insert(v).select('*').single();if(r.error)throw r.error;v=r.data;}else{v.id='demo-action-'+Date.now();v.created_at=new Date().toISOString();}S.actions.unshift(v);if(action==='resolved')S.openAlerts=S.openAlerts.filter(x=>x.id!==oId);await refreshDailyLearning();renderAlerts();renderHomeAlerts();if(S.renderPage==='class')renderClass();toast(action==='resolved'?'Đã xác nhận kết thúc cảnh báo':'Tiếp tục theo dõi');}catch(e){fail(e)}}
const seatingPositions=new Map();
function rememberSeatingPosition(){const viewport=$('seatingViewport');if(viewport?.clientHeight&&viewport.dataset.positionReady==='true')seatingPositions.set(viewport.dataset.positionKey,Math.max(0,viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop));}
function renderSeatingMap(){
 rememberSeatingPosition();$('seatingEditor').innerHTML=mapHtml(true);const viewport=$('seatingViewport');if(!viewport)return;
 const key=[S.user?.id||'demo',S.demo,S.year,S.cls,groupIndexes().join(','),S.layout.join(',')].join('|');viewport.dataset.positionKey=key;
 viewport.addEventListener('scroll',()=>{if(viewport.dataset.positionReady==='true')seatingPositions.set(key,Math.max(0,viewport.scrollHeight-viewport.clientHeight-viewport.scrollTop));},{passive:true});
 $('focusSeatingFront').onclick=()=>viewport.scrollTo({top:viewport.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 requestAnimationFrame(()=>{if(!viewport.isConnected||!viewport.clientHeight)return;viewport.scrollTop=viewport.scrollHeight-viewport.clientHeight-(seatingPositions.get(key)||0);viewport.dataset.positionReady='true';});
}
function renderHomeroom(){if(S.seatingLoading)return;renderRotationSettings();const picker=$('seatingClass');picker.closest('label').hidden=!S.admin;picker.innerHTML=classChoices().map(c=>`<option value="${esc(c)}">Lớp ${esc(c)}</option>`).join('');picker.value=S.cls;if(!canEditLayout()){$('seatingEditor').innerHTML='<p>Bạn không có quyền xếp chỗ của lớp này.</p>';return;}$('layoutStatus').textContent=S.layoutConfirmed?'Đã chốt – Dùng chung':'Chưa chốt';$('layoutStatus').className='pill '+(S.layoutConfirmed?'green':'red');$('confirmLayout').disabled=S.layoutConfirmed;$('confirmLayout').hidden=S.layoutConfirmed;$('deskControls').innerHTML=`<div class="deskControl groupCountControl"><b>${S.layout.length} tổ</b><button type="button" class="btn outline" data-group-change="-1" ${S.layout.length<=1?'disabled':''} aria-label="Bớt một tổ">− Tổ</button><button type="button" class="btn outline" data-group-change="1" ${S.layout.length>=12?'disabled':''} aria-label="Thêm một tổ">＋ Tổ</button></div>`+S.layout.map((n,i)=>`<div class="deskControl"><b>Tổ ${i+1}: ${n} bàn</b><button class="btn outline" data-resize="${i+1}:-1">−</button><button class="btn outline" data-resize="${i+1}:1">＋</button></div>`).join('');renderSeatingMap();let occupied=new Set(S.seats.map(x=>x.student_id));$('unseated').innerHTML=activeStudents().filter(x=>!occupied.has(x.id)).map(s=>`<span>${avatar(s.gender)} ${esc(s.full_name)}</span>`).join('')||'<span>Tất cả học sinh đã được xếp chỗ</span>';renderSupport();}
let supportRevision=0,supportData={key:'',students:[],logs:[]},supportFormKey='';const supportDrafts=new Map(),supportSaves=new Set();
document.addEventListener('tranphu:report-scope',()=>renderSupport());
async function renderSupport(){
 const el=$('supportSection');if(!el)return;const revision=++supportRevision;el.hidden=!canSupport();if(el.hidden)return;
 if(el.parentElement!==$('progressPage')){el.open=false;$('progressPage').append(el);}
 const target=supportTarget(),key=target.year+'|'+target.cls,button=$('saveSupport');button.disabled=true;
 if(supportFormKey!==key){if(supportFormKey)supportDrafts.set(supportFormKey,{student:$('supportStudent').value,type:$('supportType').value,content:$('supportContent').value,review:$('supportReview').value});const draft=supportDrafts.get(key);$('supportContent').value=draft?.content||'';$('supportReview').value=draft?.review||'';$('supportType').value=draft?.type||'trao_doi_hs';supportFormKey=key;}
 try{
  if(supportData.key!==key){
   $('supportStudent').innerHTML='';$('supportHistory').textContent='Đang tải nhật ký hỗ trợ…';
   let students,logs;if(S.demo){students=S.students.filter(st=>st.class_code===target.cls);logs=S.support.filter(row=>row.class_code===target.cls);}
   else{const [st,history]=await Promise.all([sb.from('v4_students').select('id,full_name,active').eq('school_year',target.year).eq('class_code',target.cls).order('full_name'),sb.from('v4_support_logs').select('*').eq('school_year',target.year).eq('class_code',target.cls).order('created_at',{ascending:false}).limit(100)]);if(st.error)throw st.error;if(history.error)throw history.error;students=st.data;logs=history.data;}
   if(revision!==supportRevision)return;supportData={key,students,logs};
  }
  const previous=$('supportStudent').value||supportDrafts.get(key)?.student;
  $('supportStudent').innerHTML=supportData.students.filter(st=>st.active!==false).map(st=>`<option value="${esc(st.id)}" ${previous===st.id?'selected':''}>${esc(st.full_name)}</option>`).join('');
  $('supportHistory').innerHTML=supportData.logs.slice(0,30).map(x=>`<div class="historyItem"><div><b>${esc(supportData.students.find(st=>st.id===x.student_id)?.full_name||'Học sinh')} · ${esc(({trao_doi_hs:'Trao đổi học sinh',lien_he_ph:'Liên hệ phụ huynh',bien_phap:'Biện pháp hỗ trợ',theo_doi:'Theo dõi kết quả'})[x.activity_type]||'Hỗ trợ')}</b><small>${new Date(x.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}${x.follow_up_on?' · Theo dõi lại: '+esc(x.follow_up_on):''}</small><p>${esc(x.content)}</p></div></div>`).join('')||'<p class="muted">Chưa có nhật ký hỗ trợ.</p>';
  button.disabled=supportSaves.has(key)||!supportData.students.some(st=>st.active!==false);
 }catch(error){if(revision!==supportRevision)return;$('supportHistory').textContent='Chưa tải được nhật ký hỗ trợ. Vui lòng mở lại Báo cáo lớp để thử lại.';fail(error);}
}
async function saveSupport(){
 if(!canSupport())return toast('Chỉ GVCN được ghi nhật ký hỗ trợ học sinh');const target=supportTarget(),key=target.year+'|'+target.cls;
 const student_id=$('supportStudent').value,activity_type=$('supportType').value,content=$('supportContent').value.trim(),follow_up_on=$('supportReview').value||null;
 if(key!==supportData.key||!supportData.students.some(st=>st.id===student_id&&st.active!==false)||content.length<5)return toast('Chọn học sinh và nhập nội dung tối thiểu 5 ký tự');
 if(supportSaves.has(key))return;supportSaves.add(key);const button=$('saveSupport');button.disabled=true;
 try{let v={school_year:target.year,class_code:target.cls,student_id,activity_type,content,follow_up_on,created_by:S.demo?'demo':S.user.id};if(!S.demo){const r=await sb.from('v4_support_logs').insert(v).select('*').single();if(r.error)throw r.error;v=r.data;}else{v.id='demo-support-'+Date.now();v.created_at=new Date().toISOString();}
  if(supportData.key===key)supportData.logs.unshift(v);if(supportFormKey===key&&$('supportContent').value.trim()===content){$('supportContent').value='';supportDrafts.delete(key);}if(supportTarget().year+'|'+supportTarget().cls===key)await renderSupport();toast('Đã lưu nhật ký hỗ trợ của GVCN');
 }catch(error){fail(error)}finally{supportSaves.delete(key);if(supportData.key===key)button.disabled=!supportData.students.some(st=>st.active!==false);}
}

function renderBehaviorAdmin(){if(!S.admin)return;const t=$('behaviorAdminList');if(!t)return;t.innerHTML=S.behaviors.map(b=>`<div class="historyItem"><span>${esc(b.category==='positive'?'★ Tích cực':b.category==='concern'?'⚠ Cần hỗ trợ':'⚕ Sức khỏe')} · ${esc(b.behavior_code)}</span><button class="btn ${b.active?'outline':'subtle'}" data-toggle-behavior="${b.id}">${b.active?'Đang dùng':'Đã ẩn'}</button></div>`).join('')||'<p class="muted">Chế độ demo: dùng danh mục mẫu.</p>';}
async function addBehavior(){if(!S.admin)return;let behavior_code=$('behaviorLabel').value.trim(),category=$('behaviorCategory').value;if(behavior_code.length<2)return toast('Nhập nội dung hành vi');try{let v={category,behavior_code,active:true};if(!S.demo){let r=await sb.from('v4_behaviors').insert(v).select('*').single();if(r.error)throw r.error;v=r.data;}else{v.id=Date.now();}S.behaviors.push(v);$('behaviorLabel').value='';renderBehaviorAdmin();toast('Đã thêm danh mục nhận xét');}catch(e){fail(e)}}
async function toggleBehavior(id){if(!S.admin)return;let b=S.behaviors.find(x=>String(x.id)===String(id));if(!b)return;try{if(!S.demo){let r=await sb.from('v4_behaviors').update({active:!b.active}).eq('id',b.id).select('*').single();if(r.error)throw r.error;Object.assign(b,r.data);}else b.active=!b.active;renderBehaviorAdmin();toast('Đã cập nhật danh mục');}catch(e){fail(e)}}
async function confirmLayout(){if(!S.demo&&Offline?.shouldQueue())return toast('Cần kết nối để thay đổi sơ đồ và quy luật.');
 if(S.seatingLoading)return toast('Đang tải sơ đồ lớp. Vui lòng chờ.');if(!canEditLayout())return toast('Chỉ GVCN hoặc quản trị được chốt sơ đồ');
 const seated=new Set(S.seats.map(s=>s.student_id));const remaining=activeStudents().filter(st=>!seated.has(st.id));
 if(remaining.length)return toast(`Còn ${remaining.length} học sinh chưa xếp chỗ`);
 try{if(!S.demo){const r=await sb.rpc('v4_confirm_layout',{y:S.year,c:S.cls});if(r.error)throw r.error;}
  S.layoutConfirmed=true;await refreshRotationState();clientChangeRevision++;await saveClassCache();await savePortalCache();renderHomeroom();toast('Đã chốt sơ đồ. Giáo viên bộ môn có thể sử dụng.');
 }catch(e){fail(e)}
}
async function changeGroupCount(delta){if(!S.demo&&Offline?.shouldQueue())return toast('Cần kết nối để thay đổi sơ đồ và quy luật.');
 if(S.seatingLoading)return;if(!canEditLayout())return toast('Chỉ GVCN hoặc quản trị được thay đổi số tổ');
 const count=S.layout.length+delta;if(count<1||count>12)return;
 const removed=S.seats.filter(x=>x.group_no>count);
 if(removed.length&&!await confirmPortal(`Bớt tổ sẽ đưa ${removed.length} học sinh về danh sách chưa xếp.`,{title:'Bớt tổ trong sơ đồ?',confirmLabel:'Bớt tổ',tone:'warning'}))return;
 try{if(!S.demo){const r=await sb.rpc('v4_set_group_count',{y:S.year,c:S.cls,n:count});if(r.error)throw r.error;}
 S.layout=count<S.layout.length?S.layout.slice(0,count):S.layout.concat(4);
 S.seats=S.seats.filter(x=>x.group_no<=count);S.layoutConfirmed=false;S.groupPage=Math.min(S.groupPage,count-1);await refreshRotationState();clientChangeRevision++;await saveClassCache();await savePortalCache();renderHomeroom();toast(`Đã cập nhật ${count} tổ. Cần chốt lại sơ đồ.`);
 }catch(e){fail(e)}
}
async function resizeDesk(g,delta){if(!S.demo&&Offline?.shouldQueue())return toast('Cần kết nối để thay đổi sơ đồ và quy luật.');if(S.seatingLoading)return;if(!canEditLayout())return;let n=Number(S.layout[g-1])+delta;if(n<1||n>20)return toast('Mỗi tổ từ 1–20 bàn');let removed=S.seats.filter(s=>s.group_no===g&&s.desk_no>n);if(removed.length&&!await confirmPortal(`Bớt bàn sẽ đưa ${removed.length} học sinh về danh sách chưa xếp.`,{title:'Bớt bàn trong tổ?',confirmLabel:'Bớt bàn',tone:'warning'}))return;try{if(!S.demo){let r=await sb.rpc('v4_set_desks',{y:S.year,c:S.cls,g,n});if(r.error)throw r.error;}S.layout[g-1]=n;S.layoutConfirmed=false;S.seats=S.seats.filter(s=>!(s.group_no===g&&s.desk_no>n));await refreshRotationState();clientChangeRevision++;await saveClassCache();await savePortalCache();renderHomeroom();toast('Đã cập nhật số bàn tổ '+g);}catch(e){fail(e)}}
async function seatClick(str){if(!S.demo&&Offline?.shouldQueue())return toast('Cần kết nối để thay đổi sơ đồ và quy luật.');
 if(S.seatingLoading)return;
 if(!canEditLayout())return;const[g,d,seat]=str.split(':').map(Number),current=S.seats.find(x=>x.group_no===g&&x.desk_no===d&&x.seat_no===seat),old=S.students.find(x=>x.id===current?.student_id),occupied=new Set(S.seats.map(x=>x.student_id)),available=activeStudents().filter(x=>!occupied.has(x.id));
 const body=document.createElement('div');body.innerHTML=`<p class="muted">Chỗ ${seat} · ${esc(old?.full_name||'Đang trống')}</p><label>Chọn học sinh<select id="seatStudentPick">${old?'<option value="__keep__">Giữ nguyên chỗ hiện tại</option>':''}<option value="">— Để trống chỗ này —</option>${available.map(x=>`<option value="${esc(x.id)}">${esc(x.full_name)}</option>`).join('')}</select></label><p id="seatSaveMessage" role="alert"></p><div class="actions"><button type="button" class="btn outline" id="cancelSeat">Hủy</button><button type="button" class="btn primary" id="saveSeat">Lưu vị trí</button></div>`;
 const ui=window.TranPhuDialog.content({title:`Xếp chỗ – Tổ ${g}, Bàn ${d}`,content:body,initialFocus:'#seatStudentPick'});body.querySelector('#cancelSeat').onclick=()=>{if(ui.dialog.getAttribute('aria-busy')!=='true')ui.close(false);};
 body.querySelector('#saveSeat').onclick=async event=>{if(event.currentTarget.disabled)return;const button=event.currentTarget,picked=body.querySelector('#seatStudentPick').value;if(picked==='__keep__'){ui.close(false);return;}const studentId=picked||null;
  if(studentId&&S.seats.some(x=>x.student_id===studentId)){body.querySelector('#seatSaveMessage').textContent='Học sinh đã có chỗ ngồi. Hãy chọn học sinh chưa xếp chỗ.';return;}
  button.disabled=true;ui.setBusy(true);try{if(!S.demo){const r=await sb.rpc('v4_assign_seat',{y:S.year,c:S.cls,g,d,s:seat,st:studentId});if(r.error)throw r.error;}
   if(studentId)S.seats=S.seats.filter(x=>x.student_id!==studentId);S.seats=S.seats.filter(x=>!(x.group_no===g&&x.desk_no===d&&x.seat_no===seat));if(studentId)S.seats.push({school_year:S.year,class_code:S.cls,group_no:g,desk_no:d,seat_no:seat,student_id:studentId});S.layoutConfirmed=false;await refreshRotationState();ui.close(true);renderHomeroom();document.querySelector('#seatingEditor [data-seat="'+str+'"]')?.focus({preventScroll:true});toast('Đã lưu chỗ ngồi');
  }catch(e){body.querySelector('#seatSaveMessage').textContent=e.message||'Chưa lưu được vị trí';}finally{button.disabled=false;ui.setBusy(false);}
 };
}
function renderOutside(){
 $('outsideClass').innerHTML=classChoices().map(c=>`<option value="${esc(c)}" ${c===S.cls?'selected':''}>${esc(c)}</option>`).join('');
 $('outsideStudent').innerHTML=activeStudents().map(x=>`<option value="${esc(x.id)}">${esc(x.full_name)}</option>`).join('');
}
async function saveOutside(){if(!S.admin)return toast('Chức năng dành cho quản trị viên');try{
 let studentId=$('outsideStudent').value,activity=$('outsideActivity').value.trim(),behavior_code=$('outsideBehavior').value.trim(),category=$('outsideCategory').value;
 if(!studentId||!activity||!behavior_code)throw Error('Cần chọn học sinh, hoạt động và hành vi cụ thể');
 let v={student_id:studentId,school_year:S.year,class_code:S.cls,session_id:null,category,activity_context:activity,behavior_code,note:$('outsideNote').value.trim(),is_alert:category==='health'||(category==='concern'&&$('outsideAlert').checked),attention_kind:category==='concern'&&$('outsideAlert').checked?'unusual':null,created_by:S.demo?'demo':S.user.id};
 if(!S.demo){v=await insertObservationOnce(v);}else{v.id='demo-out-'+Date.now();v.observed_at=new Date().toISOString();}
 S.obs=S.obs.filter(x=>x.id!==v.id);S.obs.unshift(v);if(v.is_alert){S.openAlerts=S.openAlerts.filter(x=>x.id!==v.id);S.openAlerts.unshift(v);}$('outsideBehavior').value='';$('outsideNote').value='';$('outsideAlert').checked=false;await refreshDailyLearning();toast('Đã lưu ghi nhận hoạt động ngoài tiết');
 }catch(e){fail(e)}}
function renderReportPicker(){if(window.TranPhuReports)return window.TranPhuReports.open();let end=S.date;let start=new Date(S.date+'T12:00:00');start.setDate(start.getDate()-30);let z=n=>String(n).padStart(2,'0');$('reportFrom').value=`${start.getFullYear()}-${z(start.getMonth()+1)}-${z(start.getDate())}`;$('reportTo').value=end;$('reportStudent').innerHTML='<option value="">Toàn lớp</option>'+activeStudents().map(s=>`<option value="${s.id}">${esc(s.full_name)}</option>`).join('');}
async function makeReport(){if(!S.admin)return toast('Chức năng dành cho quản trị viên');try{let start=$('reportFrom').value,end=$('reportTo').value,stu=$('reportStudent').value;if(!start||!end||start>end)throw Error('Chọn khoảng ngày hợp lệ');let ob=[],sessions=[];if(S.demo){ob=S.obs.filter(o=>o.observed_at.slice(0,10)>=start&&o.observed_at.slice(0,10)<=end);sessions=S.session?[S.session]:[];}else{let next=new Date(end+'T00:00:00+07:00');next.setUTCDate(next.getUTCDate()+1);let q=sb.from('v4_observations').select('*').eq('school_year',S.year).eq('class_code',S.cls).gte('observed_at',new Date(start+'T00:00:00+07:00').toISOString()).lt('observed_at',next.toISOString());let r=await readAll(q);ob=r;let q2=sb.from('v4_sessions').select('id,lesson_date').eq('school_year',S.year).eq('class_code',S.cls).gte('lesson_date',start).lte('lesson_date',end);sessions=await readAll(q2);}if(stu)ob=ob.filter(o=>o.student_id===stu);let by=new Map();for(let o of ob){let s=S.students.find(x=>x.id===o.student_id);let name=s?.full_name||o.student_id;let k=JSON.stringify([o.student_id,o.category,o.behavior_code]);by.set(k,(by.get(k)||0)+1)}S.reportRows=[...by].map(([key,count])=>{let[id,category,behavior]=JSON.parse(key),name=S.students.find(st=>st.id===id)?.full_name||id;return {id,name,category,behavior,count}});S.reportAttendance=[];
if(S.demo){S.reportAttendance=activeStudents().map(st=>{let a=S.attendance.filter(x=>x.student_id===st.id);return {student_id:st.id,total_sessions:sessions.length,confirmed:a.length,present:a.filter(x=>x.status==='present').length,absent:a.filter(x=>x.status==='absent').length,late:a.filter(x=>x.status==='late').length,excused:a.filter(x=>x.status==='excused').length};});}
else{let r=await sb.rpc('v4_attendance_report',{y:S.year,c:S.cls,d1:start,d2:end});if(r.error)throw r.error;S.reportAttendance=r.data||[];}
if(stu)S.reportAttendance=S.reportAttendance.filter(x=>x.student_id===stu);
S.reportTotals=[{name:'Số tiết đã mở trên ứng dụng',count:sessions.length},{name:'Lần ghi nhận tích cực',count:ob.filter(o=>o.category==='positive').length},{name:'Lần ghi nhận cần cải thiện',count:ob.filter(o=>o.category==='concern').length},{name:'Lần ghi nhận sức khỏe',count:ob.filter(o=>o.category==='health').length}];let html=`<div class="statgrid">${S.reportTotals.map(x=>`<div class="stat"><b>${x.count}</b><small>${esc(x.name)}</small></div>`).join('')}</div><div class="tableScroller"><table class="reportTable"><thead><tr><th>Học sinh</th><th>Nhóm</th><th>Nội dung</th><th>Số ghi nhận</th></tr></thead><tbody>${S.reportRows.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.category==='positive'?'Tích cực':x.category==='health'?'Sức khỏe':'Cần cải thiện'}</td><td>${esc(x.behavior)}</td><td>${x.count}</td></tr>`).join('')}</tbody></table></div>`;html+=`<h3>Điểm danh theo số tiết có ghi nhận</h3><div class="tableScroller"><table class="reportTable"><thead><tr><th>Mã học sinh</th><th>Học sinh</th><th>Số tiết mở</th><th>Đã xác nhận</th><th>Có mặt</th><th>Vắng</th><th>Muộn</th><th>Có phép</th></tr></thead><tbody>${S.reportAttendance.map(x=>`<tr><td>${esc(S.students.find(st=>st.id===x.student_id)?.student_code||x.student_id)}</td><td>${esc(S.students.find(st=>st.id===x.student_id)?.full_name||x.student_id)}</td><td>${x.total_sessions}</td><td>${x.confirmed}</td><td>${x.present}</td><td>${x.absent}</td><td>${x.late}</td><td>${x.excused}</td></tr>`).join('')}</tbody></table></div>`;
$('reportResult').innerHTML=reportVisuals(stu)+studentTimeline(stu,ob)+html;for(const id of ['exportReport','printReport'])$(id).disabled=false;toast('Đã tổng hợp báo cáo');}catch(e){fail(e)}}
function studentTimeline(studentId,observations){
 if(!studentId)return '';
 const entries=observations.filter(o=>o.student_id===studentId).map(o=>({date:o.observed_at,label:o.behavior_code,note:o.note,by:S.teacherNames[o.created_by]||'Giáo viên được phân công'}));
 const from=$('reportFrom').value,to=$('reportTo').value;
 if(canSupport())for(const item of S.support.filter(x=>x.student_id===studentId)){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.created_at));if(day>=from&&day<=to)entries.push({date:item.created_at,label:'Nhật ký hỗ trợ của GVCN',note:item.content,by:S.teacherNames[item.created_by]||'GVCN'});}
 entries.sort((a,b)=>new Date(b.date)-new Date(a.date));
 return `<h3>Nhật ký học sinh trong kỳ</h3><div class="studentTimeline">${entries.slice(0,100).map(e=>`<article><small>${esc(new Date(e.date).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))} · ${esc(e.by)}</small><b>${esc(e.label)}</b><p>${esc(e.note||'Không có ghi chú')}</p></article>`).join('')||'<p class="muted">Chưa có ghi nhận trong kỳ đã chọn.</p>'}</div>`;
}
function reportVisuals(studentId){
 const student=S.students.find(x=>x.id===studentId),sum=key=>S.reportAttendance.reduce((n,row)=>n+Number(row[key]||0),0);
 const attendance=[['Có mặt',sum('present'),'#119c74'],['Vắng',sum('absent'),'#e34d63'],['Muộn',sum('late'),'#e8a127'],['Có phép',sum('excused'),'#6c65d8']];
 const observations=S.reportTotals.slice(1).map((x,i)=>[x.name,x.count,['#168f78','#e8a127','#d85170'][i]]);
 const chart=(title,rows)=>{const max=Math.max(1,...rows.map(x=>x[1]));return `<section class="reportChart"><h3>${title}</h3><div class="chartRows">${rows.map(([label,value,color])=>`<div class="chartRow"><span>${esc(label)}</span><div class="chartTrack"><div style="width:${Math.max(0,value/max*100)}%;background:${color}"></div></div><b>${value}</b></div>`).join('')}</div></section>`};
 return `${student?`<div class="reportStudentHeader">${avatar(student.gender)}<span><b>${esc(student.full_name)}</b><small>${esc(student.student_code)} · Lớp ${esc(S.cls)} · ${esc(student.gender)}</small></span></div>`:''}<div class="reportCharts">${chart('Lượt điểm danh đã xác nhận',attendance)}${chart('Lượt ghi nhận trong kỳ',observations)}</div>`;
}
async function readAll(query){let all=[];for(let i=0;i<20;i++){let r=await query.range(i*1000,(i+1)*1000-1);if(r.error)throw r.error;all.push(...r.data);if(r.data.length<1000)return all;}throw Error('Dữ liệu quá lớn; hãy rút ngắn khoảng thời gian trước khi tổng hợp.');}
function exportReportExcel(){if(!S.admin)return;
 if(!S.reportTotals.length)return toast('Cần tổng hợp trước');
 if(!window.XLSX?.utils?.book_new)return exportReport();
 const safe=v=>{let val=String(v??'');return /^[=+\-@\t\r]/.test(val)?"'"+val:val;};
 const book=window.XLSX.utils.book_new();
 const summary=[['BÁO CÁO HỌC SINH - TRẦN PHÚ'],['Lớp',S.cls],['Năm học',S.year],
  ['Từ ngày',$('reportFrom').value],['Đến ngày',$('reportTo').value],[],['Chỉ tiêu','Số lượng'],
  ...S.reportTotals.map(x=>[safe(x.name),Number(x.count)||0])];
 const remarks=[['Mã học sinh','Học sinh','Nhóm','Hành vi','Số ghi nhận'],
  ...S.reportRows.map(x=>[safe(S.students.find(st=>st.id===x.student_id)?.student_code||''),safe(x.name),safe(x.category),safe(x.behavior),Number(x.count)||0])];
 const attendance=[['Mã học sinh','Học sinh','Số tiết mở','Đã xác nhận','Có mặt','Vắng','Muộn','Có phép'],
  ...S.reportAttendance.map(x=>{let st=S.students.find(v=>v.id===x.student_id);return [safe(st?.student_code||''),safe(st?.full_name||''),Number(x.total_sessions)||0,Number(x.confirmed)||0,Number(x.present)||0,Number(x.absent)||0,Number(x.late)||0,Number(x.excused)||0]})];
 for(const [name,rows] of [['Tong_hop',summary],['Ghi_nhan',remarks],['Diem_danh',attendance]]){
  let sheet=window.XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols']=rows[0].map((_,col)=>({wch:Math.max(14,Math.min(45,Math.max(...rows.slice(0,50).map(r=>String(r[col]??'').length))+2))}));
  window.XLSX.utils.book_append_sheet(book,sheet,name);
 }
 const filename='Bao_cao_'+String(S.cls).replace(/[^0-9A-Za-z_-]/g,'_')+'_'+dateLocal()+'.xlsx';
 window.XLSX.writeFile(book,filename);
}
function exportReport(){if(!S.admin)return;if(!S.reportTotals.length)return toast('Cần tổng hợp trước');function cell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}let reportRows=[['Học sinh','Nhóm','Nội dung','Số lần'],...S.reportRows.map(x=>[x.name,x.category,x.behavior,x.count]),[],['ĐIỂM DANH'],['Học sinh','Số tiết mở','Đã xác nhận','Có mặt','Vắng','Muộn','Có phép'],...S.reportAttendance.map(x=>[S.students.find(st=>st.id===x.student_id)?.full_name||x.student_id,x.total_sessions,x.confirmed,x.present,x.absent,x.late,x.excused])];let lines=reportRows.map(row=>row.map(cell).join(','));let blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Bao_cao_${S.cls}_${dateLocal()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
let previewRows=[],importReadRevision=0;
async function parseExcel(f){const readRevision=++importReadRevision,importYear=S.year;previewRows=[];$('applyImport').disabled=true;$('excelPreview').textContent='Đang kiểm tra tệp…';try{if(!window.XLSX)await window.TranPhuAssets.excel();}catch(error){fail(error);return;}let reader=new FileReader();reader.onerror=()=>{if(readRevision===importReadRevision)$('excelPreview').textContent='Không đọc được tệp. Chọn lại tệp để thử.';};reader.onload=()=>{if(readRevision!==importReadRevision||importYear!==S.year)return;try{let wb=window.XLSX.read(reader.result,{type:'array',cellDates:true}),rows=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});if(rows.length>1500)throw Error('Tối đa 1500 dòng mỗi lần');let norm=s=>String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');let field=(r,k)=>Object.entries(r).find(([h])=>norm(h)===k)?.[1]||'';previewRows=rows.map((r,i)=>{let code=String(field(r,'ma hoc sinh')).trim(),name=String(field(r,'ho va ten')).trim(),genderRaw=norm(field(r,'gioi tinh')),gender=genderRaw==='nam'?'Nam':genderRaw==='nu'?'Nữ':genderRaw==='khac'?'Khác':genderRaw==='chua ro'?'Chưa rõ':'',cls=String(field(r,'lop')).trim().toUpperCase(),birth=field(r,'ngay sinh'),bd='';if(birth instanceof Date&&!isNaN(birth)){bd=`${birth.getFullYear()}-${String(birth.getMonth()+1).padStart(2,'0')}-${String(birth.getDate()).padStart(2,'0')}`;}else if(typeof birth==='string'&&birth.trim()){let x=birth.trim(),m=x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);bd=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:x;}let calendarOk=!bd||(/^\d{4}-\d{2}-\d{2}$/.test(bd)&&!Number.isNaN(Date.parse(bd))&&new Date(bd+'T12:00:00Z').toISOString().slice(0,10)===bd);let errors=[!code?'Thiếu mã học sinh':'',!name?'Thiếu họ tên':'',!gender?'Giới tính không hợp lệ':'',!cls?'Thiếu lớp':'',!calendarOk?'Ngày sinh không hợp lệ':''].filter(Boolean),invalid=errors.length>0;return {student_code:code,full_name:name,gender,school_year:S.year,class_code:cls,birth_date:bd||null,active:true,line:Number.isInteger(r.__rowNum__)?r.__rowNum__+1:i+2,invalid,errors};});let dup=new Set(),seen=new Set();previewRows.forEach(x=>{let k=x.student_code.toLowerCase();if(seen.has(k))dup.add(k);seen.add(k)});previewRows.forEach(x=>{if(dup.has(x.student_code.toLowerCase())){x.invalid=true;x.errors.push('Trùng mã trong tệp');}});$('excelPreview').innerHTML=`<p>${previewRows.length} dòng, ${previewRows.filter(x=>x.invalid).length} dòng lỗi.</p><table class="previewTable"><thead><tr><th>Dòng</th><th>Mã HS</th><th>Họ tên</th><th>Giới tính</th><th>Lớp</th><th>Ngày sinh</th><th>Trạng thái</th></tr></thead><tbody>${previewRows.map(x=>`<tr><td>${x.line}</td><td>${esc(x.student_code)}</td><td>${esc(x.full_name)}</td><td>${esc(x.gender)}</td><td>${esc(x.class_code)}</td><td>${esc(x.birth_date||'')}</td><td style="color:${x.invalid?'#bd2828':'#168451'}">${x.invalid?esc(x.errors.join('; ')):'Hợp lệ'}</td></tr>`).join('')}</tbody></table>`;$('applyImport').disabled=previewRows.length===0||previewRows.some(x=>x.invalid);toast('Đã đọc Excel – kiểm tra bảng xem trước');}catch(e){fail(e)}};reader.readAsArrayBuffer(f);}
async function applyImport(){
 if(applyImport.saving)return;if(!S.admin)return toast('Chỉ quản trị được nhập Excel');if(!previewRows.length||previewRows.some(x=>x.invalid))return toast('Tệp chưa hợp lệ');if(Offline?.shouldQueue())return toast('Cần kết nối để nhập danh sách học sinh');
 const revision=importReadRevision,userId=S.user?.id,year=S.year,pack=previewRows.map(({line,invalid,errors,...x})=>x);applyImport.saving=true;$('applyImport').disabled=true;$('studentExcel').disabled=true;
 try{if(!await confirmPortal(`Nhập hoặc cập nhật ${pack.length} học sinh từ tệp đã kiểm tra.`,{title:'Nhập danh sách học sinh?',confirmLabel:'Nhập danh sách'}))return;if(revision!==importReadRevision||!S.admin||S.user?.id!==userId||S.year!==year)throw Error('Tệp hoặc tài khoản đã thay đổi. Kiểm tra lại trước khi nhập.');if(Offline?.shouldQueue())throw Error('Cần kết nối để nhập danh sách học sinh');if(S.demo)return toast('Chế độ xem thử: không ghi vào dữ liệu thật');const r=await sb.rpc('v4_import_students',{rows:pack});if(r.error)throw r.error;$('excelPreview').textContent='Đã nhập thành công '+pack.length+' học sinh.';previewRows=[];toast('Nhập danh sách thành công');await loadClassData();}catch(e){fail(e);}finally{applyImport.saving=false;$('studentExcel').disabled=false;$('applyImport').disabled=!previewRows.length||previewRows.some(x=>x.invalid);}
}
function renderTkbSync(){
 const target=$('tkbSyncPreview');if(!target||!S.admin)return;
 if(S.demo){target.textContent='Chế độ thử: dữ liệu TKB không được đồng bộ.';$('syncTkb').disabled=true;return;}
 if(!S.tkbVersion){S.syncSummary=null;target.textContent='Chưa có TKB đã công bố.';$('syncTkb').disabled=true;return;}
 const model=window.TranPhuTeacherIdentity.syncSummary(S.tkb,S.tkbAssignments,S.registeredTeachers);S.syncSummary=model;
 const list=(items,issue=false)=>`<ul class="syncPeople">${items.map(x=>`<li><div><b>${esc(x.label)}</b>${x.teacher_code?`<small>Mã ${esc(x.teacher_code)}</small>`:''}</div><span>${esc(issue?x.reason:[x.subjects?.join(', '),x.homeroom_class?'GVCN '+x.homeroom_class:''].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`;
 target.innerHTML=`<div class="syncHeading"><b>${esc(S.tkbVersion.version_name||'TKB đang công bố')}</b><span>${model.teachingTeachers} giáo viên có tiết · ${model.classes.length} lớp</span></div><div class="syncMetrics"><div><b>${model.people.length}</b><span>Giáo viên trong PCCM</span></div><div><b>${model.linked.length}/${model.people.length}</b><span>Đã liên kết tài khoản</span></div><div><b>${model.linkedHomerooms}/${model.homeroomClasses}</b><span>GVCN đã liên kết</span></div></div>${model.issues.length?`<details class="syncIssues" open><summary>${model.issues.length} trường hợp dữ liệu cần đối chiếu</summary>${list(model.issues,true)}</details>`:''}${model.pending.length?`<details class="syncPending"><summary>${model.pending.length} giáo viên chưa có tài khoản liên kết</summary>${list(model.pending)}</details><p class="muted">Danh sách này tính mỗi giáo viên một lần. Giáo viên chỉ xem TKB có thể chưa cần tài khoản quản lý học sinh.</p>`:!model.issues.length?'<p class="syncOk">Danh sách giáo viên đã được liên kết tài khoản.</p>':''}`;
 $('syncTkb').disabled=true;

}
let syncPreviewRevision=0;
async function refreshSyncDetails(){
 if(S.demo||!sb||!S.admin)return;
 let target=$('syncDetails');if(!target){target=document.createElement('div');target.id='syncDetails';target.className='syncPreview';($('syncTkb').closest('.syncActions')||$('syncTkb')).insertAdjacentElement('afterend',target);}
 const revision=++syncPreviewRevision;S.tkbPreview=null;$('syncTkb').disabled=true;target.textContent='Đang đối chiếu quyền trên máy chủ...';
 try{const r=await sb.rpc('v4_preview_published_tkb');if(r.error)throw r.error;const preview=r.data;if(revision!==syncPreviewRevision)return;S.tkbPreview=preview;
 const teacher=id=>S.registeredTeachers.find(x=>x.user_id===id)?.teacher_name||id;
 const rows=(items,manual=false)=>items.map(x=>`<div class="permissionRow"><span><b>${esc(teacher(x.user_id))}</b> · ${esc(x.class_code)} · ${x.role==='gvcn'?'GVCN':'GVBM'}</span>${manual?`<button type="button" class="btn outline" data-revoke-manual="${esc(x.user_id)}" data-year="${esc(x.school_year)}" data-class="${esc(x.class_code)}" data-job="${esc(x.role)}">Thu hồi quyền này</button>`:''}</div>`).join('')||'<p class="muted">Không có.</p>';
 target.innerHTML=`<h3>Đối chiếu quyền trước khi áp dụng</h3><p>${esc(preview.version_name||'Chưa có phiên bản')} · ${esc(preview.school_year||'')}</p>${preview.reason?`<p class="syncWarning">${esc(preview.reason)}</p>`:''}${preview.partial?'<p class="syncPartial">Chỉ áp dụng tài khoản đã xác minh. Chưa thu hồi quyền cũ khi còn tài khoản chưa liên kết.</p>':''}${!preview.sync_mode&&S.syncSummary?.pending.length?'<p class="syncWarning">Cần cập nhật SQL/07_CAP_NHAT_DONG_BO_TAI_KHOAN.sql để đồng bộ riêng phần tài khoản đã liên kết.</p>':''}<details><summary>Thêm ${(preview.added||[]).length} quyền</summary>${rows(preview.added||[])}</details><details><summary>Thu hồi ${(preview.removed||[]).length} quyền tự động</summary>${rows(preview.removed||[])}</details><details><summary>${(preview.manual||[]).length} quyền thủ công cần rà soát</summary>${rows(preview.manual||[],true)}</details>`;
 $('syncTkb').disabled=!preview.ready||!!S.syncSummary?.issues.length;$('syncTkb').textContent=preview.partial?'Đồng bộ tài khoản đã liên kết':'Xác nhận đồng bộ';
 target.onclick=async e=>{const button=e.target.closest('[data-revoke-manual]');if(!button)return;
 if(!await confirmPortal(`Thu hồi quyền ${button.dataset.job.toUpperCase()} lớp ${button.dataset.class}. Hãy đối chiếu phân công trước khi tiếp tục.`,{title:'Thu hồi quyền giáo viên?',confirmLabel:'Thu hồi quyền',tone:'danger'}))return;
 button.disabled=true;try{const result=await sb.from('v4_class_access').delete().eq('user_id',button.dataset.revokeManual).eq('school_year',button.dataset.year).eq('class_code',button.dataset.class).eq('role',button.dataset.job).select('user_id');if(result.error)throw result.error;if(!result.data?.length)throw Error('Quyền đã thay đổi. Hãy đối chiếu lại.');toast('Đã thu hồi quyền và lưu lịch sử');await refreshSyncDetails();}catch(error){button.disabled=false;fail(error)}};
 }catch(error){if(revision!==syncPreviewRevision)return;target.textContent='Chưa đối chiếu được quyền: '+(error.message||String(error));}
}
async function syncTkb(){if(!S.admin||S.demo)return;const preview=S.tkbPreview;if(!preview?.ready)return toast('Cần đối chiếu quyền thành công trước khi đồng bộ');if(!await confirmPortal(`Thêm ${preview.added.length} quyền và thu hồi ${preview.removed.length} quyền tự động từ TKB ${preview.version_name}.`,{title:'Áp dụng phân công từ TKB?',confirmLabel:'Áp dụng phân công'}))return;
 try{const r=await sb.rpc('v4_apply_tkb_preview',{expected_version:preview.version_id});if(r.error)throw r.error;
  if(!r.data?.applied){toast('Chưa đồng bộ: '+(r.data?.reason||'Cần đối chiếu tài khoản'));await refreshSyncDetails();return;}
  toast(r.data.partial?`Đã đồng bộ tài khoản liên kết: thêm ${r.data.added||0} quyền. Các tài khoản còn lại đang chờ.`:`Đã đồng bộ: thêm ${r.data.added||0}, gỡ ${r.data.removed||0} quyền cũ.`);

  window.TkbIntegration?.announce({versionId:preview.version_id});await refreshIntegratedTimetable();renderTkbSync();await refreshSyncDetails();
 }catch(e){fail(e)}
}
function renderTimes(){const box=$('periodTimes'),key=[S.user?.id||'demo',S.demo,S.year].join('|');if(box.dataset.context===key&&[...box.querySelectorAll('input')].some(input=>input.value!==input.defaultValue))return;box.dataset.context=key;box.innerHTML=(S.times.length?S.times:defaultSchoolTimes()).map(r=>`<div><b>Tiết ${r.period_no}</b><div class="gridTwo smallgap"><label>Bắt đầu<input type="time" data-time="${r.period_no}:start" value="${r.start_time.slice(0,5)}"></label><label>Kết thúc<input type="time" data-time="${r.period_no}:end" value="${r.end_time.slice(0,5)}"></label></div></div>`).join('')}
async function saveTimes(){if(!S.admin)return;let payload=(S.times.length?S.times:defaultSchoolTimes()).map(r=>({period_no:r.period_no,start_time:document.querySelector(`[data-time="${r.period_no}:start"]`).value,end_time:document.querySelector(`[data-time="${r.period_no}:end"]`).value}));if(payload.some(x=>!x.start_time||!x.end_time||x.start_time>=x.end_time))return toast('Giờ bắt đầu phải trước giờ kết thúc');if(payload.some((a,i)=>payload.some((b,j)=>i<j&&a.start_time<b.end_time&&b.start_time<a.end_time)))return toast('Khung giờ các tiết không được chồng nhau');try{if(!S.demo){let r=await sb.from('v4_lesson_times').upsert(payload);if(r.error)throw r.error;}S.times=payload;for(const row of payload)for(const part of ['start','end']){const input=document.querySelector('[data-time="'+row.period_no+':'+part+'"]');if(input)input.defaultValue=row[part+'_time'];}renderHomeLessonSummary();toast('Đã lưu khung giờ tiết học')}catch(e){fail(e)}}
function authView(view,error=''){
 $('loginView').hidden=view!=='login';$('appView').hidden=view!=='app';$('openOverview').hidden=view!=='app';const gate=$('sessionGate');if(!gate)return;
 gate.hidden=['login','app'].includes(view);$('sessionGateText').textContent=view==='error'?'Chưa mở được ứng dụng':view==='password'?'Đặt mật khẩu riêng để tiếp tục':'Đang mở ứng dụng…';
 $('sessionGateError').hidden=!error;$('sessionGateError').textContent=error;$('retrySession').hidden=view!=='error';$('leaveSession').hidden=!['error','password'].includes(view);
}
async function restorePortal(){
 if(!loginConfirmed&&!readConfirmedUser()){authView('login');return;}
 if(portalOpening)return portalOpening;
 const generation=authGeneration;authView('checking');
 portalOpening=(async()=>{try{
  if(await restoreCachedPortal()){verifyCachedPortal();return;}
  if(!sb){authView('login');return;}
  await (Offline?Offline.timeout(window.TkbAuth?.ready,10000):window.TkbAuth?.ready);if(window.TkbAuth?.status==='error')await (Offline?Offline.timeout(window.TkbAuth.retry(),10000):window.TkbAuth.retry());
  const result=await (Offline?Offline.timeout(sb.auth.getSession(),10000):sb.auth.getSession());if(generation!==authGeneration)return;if(result.error)throw result.error;
  const user=result.data?.session?.user;
  if(!user||!isLoginConfirmed(user.id)){setLoginConfirmed('');authView('login');return;}
  setLoginConfirmed(user.id);
  if(user?.app_metadata?.force_password_change){authView('password');setTimeout(()=>window.TranPhuAccounts?.requirePasswordChange(user),0);return;}
  await init(true,{landing:loginLanding,user});loginLanding=false;configureOffline();S.cacheVerifiedAt=Date.now();const school=await sb.rpc('v4_school_today');if(!school.error)S.serverDay=String(school.data).slice(0,10);await savePortalCache();Offline?.flush();
 }catch(error){if(generation===authGeneration)authView('error',translateAuthError(error)||'Chưa tải được dữ liệu. Vui lòng thử lại.');}finally{portalOpening=null;}})();
 return portalOpening;
}
function authHandlers(){
 $('teacherLoginForm').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('login');if(button.disabled)return;button.disabled=true;$('loginMsg').textContent='';
  try{if(!sb)throw Error('Chưa nạp cấu hình Supabase');const result=await sb.auth.signInWithPassword({email:window.TranPhuTeacherIdentity.loginEmail($('email').value),password:$('password').value});if(result.error)throw result.error;$('password').value='';setLoginConfirmed(result.data?.user?.id||result.data?.session?.user?.id||'confirmed');loginLanding=!new URL(location.href).searchParams.has('page');await restorePortal();}
  catch(error){authView('login');$('loginMsg').textContent=translateAuthError(error);}finally{button.disabled=false;}
 });
 $('retrySession').onclick=()=>restorePortal();$('leaveSession').onclick=async()=>{setLoginConfirmed('');await sb?.auth.signOut();authView('login');};
 $('demo').onclick=async()=>{if(!demoAllowed)return;demoSeed($('demoRole')?.value||'gvcn');await init(false);};$('logout').onclick=async()=>{setLoginConfirmed('');await sb.auth.signOut();location.reload();};
}

function appHandlers(){document.querySelectorAll('#nav [data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.goto)));$('classSelect').onchange=async()=>{S.cls=$('classSelect').value;if(!S.manualLesson){const row=teachingPlan().slots.find(r=>r.class_code===S.cls);S.period=row?.period_no||0;S.subject=row?.subject||'';renderHomeSelectors();}S.selected=null;S.groupPage=0;refreshSourceHint();try{await loadClassData();$('periodSelect').onchange();window.TkbIntegration?.remember({classCode:S.cls,versionId:S.tkbVersion?.id||''});renderHomeAlerts()}catch(e){fail(e)}};$('lessonSource').onchange=()=>{S.sourceSuggested=false;S.manualLesson=$('lessonSource').value==='thu_cong';if(S.manualLesson){S.cls=lessonClassChoices().includes(S.cls)?S.cls:lessonClassChoices()[0]||'';S.period=S.period||S.times[0]?.period_no||1;S.date=dateLocal();}else autoLesson();renderHomeSelectors();refreshSourceHint()};$('periodSelect').onchange=()=>{S.period=Number($('periodSelect').value);let day=tkbDay($('lessonDate').value||S.date);let row=S.tkb.find(t=>t.class_code===S.cls&&t.day_no===day&&t.period_no===S.period&&t.teacher_code===S.profile?.teacher_code);if(row){$('subject').value=row.subject;S.subject=row.subject}if(S.sourceSuggested){const any=S.tkb.find(t=>t.class_code===S.cls&&t.day_no===day&&t.period_no===S.period);$('lessonSource').value=row?'tkb':'thu_cong';if(any&&!row){$('subject').value=any.subject;S.subject=any.subject}}refreshSourceHint()};$('lessonDate').onchange=()=>{$('periodSelect').onchange();};$('subject').onchange=refreshSourceHint;$('studentSearch').oninput=renderStudentSearch;
$('studentSearchResults').onclick=e=>{
 const b=e.target.closest('[data-search-student]');if(!b||saveObservation.saving)return;
 const id=b.dataset.searchStudent,seat=S.seats.find(x=>x.student_id===id),count=window.innerWidth<=700?1:window.innerWidth<=1100?2:4;
 if(seat)S.groupPage=classroomGroupOrder().indexOf(seat.group_no);
 S.selected=id;chosenBehavior=null;$('studentSearch').value='';renderStudentSearch();renderClass({revealStudent:true});
};
$('startLesson').onclick=startLesson;document.querySelectorAll('#classMode button').forEach(b=>b.onclick=()=>{persistStudentDraft();S.mode=b.dataset.mode;chosenBehavior=null;renderClass();savePortalCache()});$('classMap').onclick=e=>{if(saveObservation.saving)return;const group=e.target.closest('[data-group-index]');if(group){S.groupPage=Number(group.dataset.groupIndex);renderClassMap();$('classMap').querySelector('[data-group-index="'+S.groupPage+'"]')?.focus({preventScroll:true});return;}let b=e.target.closest('[data-student]');if(!b)return;if(!b.dataset.student)return;S.selected=b.dataset.student;chosenBehavior=null;renderClass({revealStudent:true});};document.addEventListener('keydown',event=>{if(event.key==='Escape'&&S.renderPage==='class'&&S.selected&&!document.querySelector('dialog[open]')&&!saveObservation.saving){S.selected=null;renderClass();}});$('studentBackdrop').onclick=()=>{S.selected=null;renderClass();};$('studentPanel').addEventListener('input',persistStudentDraft);$('studentPanel').onchange=e=>{if(e.target.id==='attNote'&&S.selected){const cur=attFor(S.selected);if(cur?.status)saveAttendance(cur.status,{noteOnly:true});}};$('studentPanel').onclick=e=>{if(saveObservation.saving)return;const step=e.target.closest('[data-student-step]');if(step)return moveStudent(Number(step.dataset.studentStep));const category=e.target.closest('[data-behavior-category]');if(category){const active=category.getAttribute('aria-pressed')!=='true';document.querySelectorAll('[data-behavior-category]').forEach(button=>button.setAttribute('aria-pressed',String(active&&button===category)));document.querySelectorAll('#studentPanel [data-category]').forEach(button=>button.hidden=active&&button.dataset.category!==category.dataset.behaviorCategory);return;}if(e.target.closest('[data-close-panel]')){S.selected=null;renderClass();return;}let edit=e.target.closest('[data-edit-obs]');if(edit){editObservation(edit.dataset.editObs);return;}let history=e.target.closest('[data-history-obs]');if(history){showObservationEditHistory(history.dataset.historyObs);return;}let a=e.target.closest('[data-att]');if(a)return saveAttendance(a.dataset.att);let b=e.target.closest('[data-behavior]');if(b){chosenBehavior=b.dataset.behavior.split('|');saveObservation();return;}if(e.target.closest('#saveObs'))saveObservation();};$('focusClassFront').onclick=()=>{const viewport=$('classroomViewport');if(viewport)viewport.scrollTo({top:viewport.scrollHeight,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};$('markRest').onclick=markRest;$('refreshClass').onclick=async()=>{try{if(!S.demo){let sess=S.session;await loadClassData();S.session=sess;await loadAttendance()}renderClass();toast('Đã làm mới dữ liệu')}catch(e){fail(e)}};document.addEventListener('click',e=>{let b=e.target.closest('[data-action][data-obs]');if(b)alertAction(b.dataset.obs,b.dataset.action)});$('deskControls').onclick=e=>{const group=e.target.closest('[data-group-change]');if(group)return changeGroupCount(Number(group.dataset.groupChange));let b=e.target.closest('[data-resize]');if(b){let[g,d]=b.dataset.resize.split(':').map(Number);resizeDesk(g,d)}};$('seatingEditor').onclick=e=>{const group=e.target.closest('[data-group-index]');if(group){S.groupPage=Number(group.dataset.groupIndex);renderHomeroom();$('seatingEditor').querySelector('[data-group-index="'+S.groupPage+'"]')?.focus({preventScroll:true});return;}let b=e.target.closest('[data-seat]');if(b)seatClick(b.dataset.seat)};let classroomWidth=window.innerWidth;window.addEventListener('resize',()=>{if(window.innerWidth===classroomWidth)return;classroomWidth=window.innerWidth;if(S.renderPage==='class')renderClass();if(S.renderPage==='homeroom')renderHomeroom()});$('outsideClass').onchange=async()=>{S.cls=$('outsideClass').value;try{await loadClassData();renderOutside();renderHomeAlerts();}catch(e){fail(e)}};$('outsideCategory').onchange=()=>{$('outsideAlert').checked=false;$('outsideAlert').closest('label').hidden=$('outsideCategory').value!=='concern';};$('outsideCategory').onchange();$('saveOutside').onclick=saveOutside;$('makeReport').onclick=makeReport;$('exportReport').onclick=exportReportExcel;$('printReport').onclick=()=>{if(!S.admin)return;if(!S.reportTotals.length)return toast('Cần tổng hợp trước');let w=window.open('','_blank');if(!w)return toast('Cho phép mở cửa sổ in');w.document.write(`<!doctype html><meta charset="utf-8"><title>Báo cáo ${esc(S.cls)}</title><style>body{font:15px Arial;padding:25px}th,td{padding:8px;border:1px solid #999}table{border-collapse:collapse;width:100%}</style><h2>Báo cáo ghi nhận – ${esc(S.cls)}</h2><p>Từ ${esc($('reportFrom').value)} đến ${esc($('reportTo').value)}</p><p>${S.reportTotals.map(x=>`${esc(x.name)}: ${x.count}`).join(' · ')}</p><table><tr><th>Mã học sinh</th><th>Học sinh</th><th>Nhóm</th><th>Nội dung</th><th>Số lần</th></tr>${S.reportRows.map(x=>`<tr><td>${esc(S.students.find(st=>st.id===x.id)?.student_code||x.id)}</td><td>${esc(x.name)}</td><td>${esc(x.category)}</td><td>${esc(x.behavior)}</td><td>${x.count}</td></tr>`).join('')}</table><h2>Điểm danh</h2><table><tr><th>Mã học sinh</th><th>Học sinh</th><th>Số tiết mở</th><th>Đã xác nhận</th><th>Có mặt</th><th>Vắng</th><th>Muộn</th><th>Có phép</th></tr>${S.reportAttendance.map(x=>`<tr><td>${esc(S.students.find(st=>st.id===x.student_id)?.student_code||x.student_id)}</td><td>${esc(S.students.find(st=>st.id===x.student_id)?.full_name||x.student_id)}</td><td>${x.total_sessions}</td><td>${x.confirmed}</td><td>${x.present}</td><td>${x.absent}</td><td>${x.late}</td><td>${x.excused}</td></tr>`).join('')}</table><p>Ghi nhận là minh chứng hỗ trợ giáo viên, không tự động xếp loại học sinh.</p>`);w.document.close();w.print()};$('studentExcel').onchange=e=>{const p=$('adminImportPanel');if(p)p.open=true;if(e.target.files[0])parseExcel(e.target.files[0]);};$('applyImport').onclick=applyImport;$('saveTimes').onclick=saveTimes;$('syncTkb').onclick=syncTkb;$('seatingClass').onchange=async()=>{const cls=$('seatingClass').value;if(!S.admin||!classChoices().includes(cls))return;rememberSeatingPosition();const picker=$('seatingClass'),revision=(picker.requestRevision||0)+1;picker.requestRevision=revision;S.cls=cls;S.groupPage=0;S.seatingLoading=true;$('seatingEditor').inert=$('deskControls').inert=$('rotationSettings').inert=true;$('seatingEditor').textContent='Đang tải sơ đồ lớp '+cls+'…';$('layoutStatus').textContent='Đang tải…';$('confirmLayout').disabled=true;try{await loadClassData();if(revision!==picker.requestRevision)return;S.seatingLoading=false;$('seatingEditor').inert=$('deskControls').inert=$('rotationSettings').inert=false;renderHomeroom();window.TranPhuHeader?.refresh();}catch(error){if(revision===picker.requestRevision){$('seatingEditor').textContent='Chưa tải được sơ đồ. Chọn lại lớp để thử lại.';fail(error)}}};$('confirmLayout').onclick=confirmLayout;$('saveSupport').onclick=saveSupport;$('addBehavior').onclick=addBehavior;$('behaviorAdminList').onclick=e=>{let b=e.target.closest('[data-toggle-behavior]');if(b)toggleBehavior(b.dataset.toggleBehavior)};}
let rotationRefreshTime=0;
async function refreshWeeklyRotation(){if(!S.ready||S.demo||document.hidden||!['class','homeroom'].includes(S.renderPage)||S.rotationSaving||S.seatingLoading||Date.now()-rotationRefreshTime<30000)return;rotationRefreshTime=Date.now();await refreshRotationState({render:true});}
window.addEventListener('focus',refreshWeeklyRotation);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshWeeklyRotation();});setInterval(refreshWeeklyRotation,60000);
window.TranPhuAdminContext=()=>S.admin?{year:S.year,version:S.tkbVersion,summary:S.syncSummary,preview:S.tkbPreview,yearIssue:S.yearIssue,syncError:S.syncError,demo:S.demo}:null;
window.TranPhuAccountsContext=()=>({demo:S.demo,admin:S.admin,user:S.user,year:S.year,profile:S.profile,client:sb});
window.TranPhuResumeAccount=()=>init(true,{landing:true});
async function refreshAdminSync(){if(!S.admin||S.demo)return;try{S.registeredTeachers=await readAll(sb.from('v4_teachers').select('user_id,teacher_name,teacher_code').order('user_id'));S.teacherNames=Object.fromEntries(S.registeredTeachers.map(x=>[x.user_id,x.teacher_name]));await loadTimetable(true);S.syncError='';renderTkbSync();await refreshSyncDetails();}catch(error){S.syncError='Chưa cập nhật được đối chiếu. Kết quả trước đó có thể đã thay đổi.';$('syncTkb').disabled=true;window.TranPhuAdminWorkspace?.refresh();fail(error);}}
window.addEventListener('tranphu:accounts-updated',refreshAdminSync);$('refreshAdminSync').onclick=refreshAdminSync;$('syncAccountsLink').onclick=()=>$('openTeacherAccounts').click();
window.addEventListener('tranphu:profile-updated',async event=>{if(!S.user||S.demo)return;try{const r=await sb.from('v4_teachers').select('user_id,teacher_code,teacher_name').eq('user_id',event.detail.userId).maybeSingle();if(r.error)throw r.error;if(r.data){S.teacherNames[r.data.user_id]=r.data.teacher_name;if(r.data.user_id===S.user.id){S.profile={...S.profile,...r.data};$('who').textContent=r.data.teacher_name;}}}catch(error){fail(error)}});
window.TranPhuRefreshReportAccess=async()=>{
 if(S.demo)return;
 const r=await sb.from('v4_class_access').select('school_year,class_code,role').eq('user_id',S.user.id);
 if(r.error)throw r.error;S.access=r.data||[];const role=await sb.rpc('v4_school_report_access');S.schoolViewer=!role.error&&role.data===true;applyRoleNavigation();
};
window.TranPhuReloadAttendance=async()=>{if(!S.session||S.demo||S.offlineMode||navigator.onLine===false||S.attendanceReadKey===lessonContextKey()&&Date.now()-S.attendanceReadAt<30000)return;const key=lessonContextKey(),r=await sb.rpc('v4_attendance_state',{sess:S.session.id});if(r.error)throw r.error;if(key!==lessonContextKey())return;S.automaticAttendance=r.data?.automatic||[];S.sessionRosterIds=r.data?.roster_ids||[];document.querySelectorAll('#classMap [data-student]').forEach(b=>{const label=b.querySelector('.status,.attendanceTag');if(label)label.textContent=attendanceLabel(b.dataset.student);});document.dispatchEvent(new Event('tranphu:lesson-render'));};

let adminAccordionReady=false;
function setupAdminAccordion(){
  if(adminAccordionReady)return;
  adminAccordionReady=true;
  const panels=document.querySelectorAll('.adminPanels > details');
  const tabButtons=document.querySelectorAll('[data-admin-panel]');
  function activatePanel(panelId,shouldScroll=true){
    panels.forEach(p=>{
      if(p.id===panelId){
        p.open=true;
        if(shouldScroll){try{p.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){p.scrollIntoView(true);}}
      }else{
        p.open=false;
      }
    });
    tabButtons.forEach(btn=>{
      const active=btn.dataset.adminPanel===panelId;
      btn.classList.toggle('on',active);
      btn.setAttribute('aria-pressed',String(active));
    });

  }
  tabButtons.forEach(btn=>{
    btn.addEventListener('click',()=>{
      const targetId=btn.dataset.adminPanel;
      const targetPanel=document.getElementById(targetId);
      if(targetPanel&&targetPanel.open){
        targetPanel.open=false;
        btn.classList.remove('on');
        btn.setAttribute('aria-pressed','false');
      }else{
        activatePanel(targetId,true);
      }
    });
  });
  panels.forEach(p=>{
    p.addEventListener('toggle',()=>{
      if(p.open){
        panels.forEach(other=>{if(other!==p)other.open=false;});
        tabButtons.forEach(btn=>{
          const active=btn.dataset.adminPanel===p.id;
          btn.classList.toggle('on',active);
          btn.setAttribute('aria-pressed',String(active));
        });
        if(p.id==='adminFeedbackPanel')loadAdminFeedback();
      }else{
        const btn=document.querySelector(`[data-admin-panel="${p.id}"]`);
        if(btn){btn.classList.remove('on');btn.setAttribute('aria-pressed','false');}
      }
    });
  });
  $('refreshAdminFeedback')?.addEventListener('click',loadAdminFeedback);
  $('adminFeedbackFilter')?.addEventListener('change',loadAdminFeedback);
}

let feedbackReadRevision=0;
async function loadAdminFeedback(){
  const revision=++feedbackReadRevision,userId=S.user?.id,year=S.year;const current=()=>revision===feedbackReadRevision&&S.admin&&S.user?.id===userId&&S.year===year;
  const listEl=$('adminFeedbackList');
  if(!listEl)return;
  const filterSelect=$('adminFeedbackFilter');
  const statusFilter=filterSelect?filterSelect.value:'pending';
  listEl.textContent='Đang nạp danh sách góp ý…';const readBadge=$('adminFeedbackBadge');if(readBadge)readBadge.dataset.verified='false';window.TranPhuAdminWorkspace?.refresh();
  try{
    if(S.demo){
      listEl.innerHTML='<p class="note" style="padding:16px;text-align:center">Chế độ xem thử: Không có dữ liệu góp ý thật.</p>';
      return;
    }
    const {data,error}=await sb.rpc('v4_get_feedback',{p_status:null});
    if(!current())return;
    if(error)throw error;
    const allRows=data||[];
    const rows=statusFilter?allRows.filter(r=>r.status===statusFilter):allRows;
    const badge=$('adminFeedbackBadge');
    const pendingCount=allRows.filter(r=>r.status==='pending').length;if(badge){badge.dataset.verified='true';badge.dataset.count=String(pendingCount);}
    if(badge){badge.textContent=`${pendingCount} mới`;badge.hidden=pendingCount===0;}
    if(!rows.length){
      listEl.innerHTML='<p class="note" style="padding:16px;text-align:center">Không có góp ý nào trong trạng thái này.</p>';
      return;
    }
    const categoryLabels={feature:'💡 Đề xuất tính năng',timetable:'📅 Góp ý TKB',bug:'🐛 Báo lỗi / Sự cố',other:'💬 Ý kiến khác'};
    const statusLabels={pending:'<span class="pill amber">Chờ xử lý</span>',reviewed:'<span class="pill blue">Đã tiếp nhận</span>',resolved:'<span class="pill green">Đã giải quyết</span>'};
    listEl.innerHTML=rows.map(r=>`
      <div class="box feedback-item" data-id="${esc(r.id)}" style="margin-bottom:12px;padding:14px;border:1px solid var(--tp-border,#d3d7de);border-radius:10px;background:var(--tp-surface,#fff)">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <div>
            <strong style="font-size:15px">${esc(r.sender_name||'Người dùng')}</strong>
            <span class="muted" style="margin-left:8px;font-size:13px">${esc(r.sender_role||'')}</span>
            ${r.contact_info?`<div class="muted" style="font-size:12px;margin-top:2px">Liên hệ: ${esc(r.contact_info)}</div>`:''}
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="pill gray">${categoryLabels[r.category]||'Góp ý'}</span>
            ${statusLabels[r.status]||'Không xác định'}
            <small class="muted" style="margin-left:6px">${new Date(r.created_at).toLocaleString('vi-VN')}</small>
          </div>
        </div>
        <p style="margin:8px 0;font-size:14px;line-height:1.5;white-space:pre-wrap;color:var(--tp-text,#1a202c)">${esc(r.content)}</p>
        <div class="actions" style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end">
          ${r.status==='pending'?`<button type="button" class="btn outline small" data-feedback-action="reviewed" data-id="${esc(r.id)}">Đã tiếp nhận</button>`:''}
          ${r.status!=='resolved'?`<button type="button" class="btn primary small" data-feedback-action="resolved" data-id="${esc(r.id)}">Đã giải quyết</button>`:''}
        </div>
      </div>
    `).join('');
    listEl.querySelectorAll('button[data-feedback-action]').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        const fbId=btn.dataset.id;
        const newStatus=btn.dataset.feedbackAction;
        btn.disabled=true;
        try{
          const {error:updErr}=await sb.rpc('v4_update_feedback',{p_id:fbId,p_status:newStatus});
          if(updErr)throw updErr;
          if(window.TranPhuDialog)window.TranPhuDialog.toast('Đã cập nhật trạng thái góp ý.',{tone:'success'});
          await loadAdminFeedback();
        }catch(e){if(!current())return;
          btn.disabled=false;
          if(window.TranPhuDialog)window.TranPhuDialog.toast('Lỗi cập nhật: '+(e.message||'Thất bại'),{tone:'error'});
        }
      });
    });
  }catch(err){if(!current())return;if(readBadge)readBadge.dataset.verified='false';window.TranPhuAdminWorkspace?.refresh();
    listEl.innerHTML=`<p class="note" style="color:var(--tp-danger,#e02424)">Không tải được danh sách góp ý: ${esc(err.message||'Lỗi mạng')}</p>`;
  }
}
window.TranPhuQueueWithdrawal=async(row,reason)=>durableChange('withdrawal',lessonEnvelope(),{id:row.id,student_id:row.student_id,behavior_code:row.behavior_code,reason,expected_at:row.edited_at||row.observed_at},null,async()=>{const r=await sb.rpc('v4_withdraw_observation',{obs:row.id,reason,expected_at:row.edited_at||row.observed_at});if(r.error)throw Object.assign(r.error,{status:r.status});return {session:S.session,withdrawnObservation:r.data};});
window.TranPhuApplyWithdrawal=async row=>{if(!row||row.created_by!==S.user?.id)return;const owner=S.user.id;await Offline?.cachePut('withdrawn:'+row.id,row);if(S.user?.id!==owner)return;await Offline?.cacheRemove('class:'+row.school_year+'|'+row.class_code);if(S.user?.id!==owner)return;if(row.school_year!==S.year||row.class_code!==S.cls){window.dispatchEvent(new Event('tranphu:observation-changed'));return;}S.obs=S.obs.filter(o=>o.id!==row.id);S.openAlerts=S.openAlerts.filter(o=>o.id!==row.id);clientChangeRevision++;S.daily=null;S.dailyError='Đang cập nhật trạng thái sau điều chỉnh ghi nhận.';await refreshDailyLearning({force:true});if(S.user?.id!==owner)return;await saveClassCache();await savePortalCache();renderClassMap();refreshObservationHistory();paintBehaviorChoices();document.dispatchEvent(new Event('tranphu:lesson-render'));window.dispatchEvent(new Event('tranphu:observation-changed'));};
window.TranPhuTodayContext=()=>({...window.TranPhuReportsContext?.(),serverDay:S.serverDay,access:S.access});
window.TranPhuGoToEvaluation=()=>showPage('home');
window.TranPhuOpenClassReport=async(cls,school)=>{await showPage('progress');const audience=document.querySelector('#reportAudience [data-school="'+String(!!school)+'"]');if(audience&&school!==window.TranPhuReports?.isSchoolMode?.())audience.click();$('reportClass').value=cls;$('reportClass').dispatchEvent(new Event('change',{bubbles:true}));await window.TranPhuReports.make();};
window.TranPhuOpenOverview=()=>showPage('overview').catch(fail);
let savedLessonOpenRevision=0;
window.TranPhuOpenSavedLesson=async(id,{mode=null}={})=>{
 if(S.demo)return toast('Mở tiết thật để xử lý điểm danh.');const revision=++savedLessonOpenRevision,userId=S.user?.id;
 await persistStudentDraft();await window.TranPhuSaveReviewDraft?.();if(Offline&&(S.offlineMode||navigator.onLine===false)){const saved=await Offline.cacheGet('lesson:'+id),lesson=saved?.session;if(!lesson||lesson.teacher_id!==userId||lesson.lesson_date!==S.serverDay||Date.now()-S.cacheVerifiedAt>86400000||!S.access.some(a=>a.school_year===lesson.school_year&&a.class_code===lesson.class_code))return toast('Chưa có bản tiết đã xác minh trên thiết bị. Kết nối để mở lần đầu.');S.year=lesson.school_year;S.cls=lesson.class_code;S.date=lesson.lesson_date;S.period=lesson.period_no;S.subject=lesson.subject;await loadClassData();S.session=lesson;S.selected=null;await loadAttendance();if(mode)S.mode=mode;await showPage('class');return;}const r=await sb.from('v4_sessions').select('*').eq('id',id).eq('teacher_id',userId).single();if(revision!==savedLessonOpenRevision||S.user?.id!==userId)return;if(r.error)return fail(r.error);
 const status=await sb.rpc('v4_session_status',{sess:id});if(revision!==savedLessonOpenRevision||S.user?.id!==userId)return;if(status.error)return fail(status.error);const state=Array.isArray(status.data)?status.data[0]:status.data;
 S.cls=r.data.class_code;S.year=r.data.school_year;S.date=r.data.lesson_date;S.period=r.data.period_no;S.subject=r.data.subject;await loadClassData();if(revision!==savedLessonOpenRevision||S.user?.id!==userId)return;S.session={...r.data,_readOnly:state?.can_write!==true};S.selected=null;S.groupPage=0;await loadAttendance();if(mode)S.mode=mode;await showPage('class');
};
window.TranPhuConfirmAttendance=async()=>{
 if(!S.session)return;if(S.pendingOps.some(op=>op.kind==='confirm'&&offlineScope(op)))return toast('Xác nhận cả tiết đã lưu trên thiết bị và đang chờ gửi.');const key=lessonContextKey();await attendanceWrites;if(key!==lessonContextKey())throw Error('Tiết học đã thay đổi, vui lòng kiểm tra lại');
 const expected=S.attendance.filter(a=>a.session_id===S.session.id).map(a=>({student_id:a.student_id,status:a.status,note:a.note,updated_at:a.updated_at}));
 for(const student of activeStudents()){const pending=pendingAttendance(student.id);if(pending){const index=expected.findIndex(a=>a.student_id===student.id);if(index>=0)expected.splice(index,1);expected.push({student_id:student.id,previousOperation:pending.id});}}
 const payload={expected_rows:expected,roster_ids:[...new Set(activeStudents().map(student=>student.id))]};
 const saved=await durableChange('confirm',lessonEnvelope(),payload,null,async()=>{const r=await sb.rpc('v4_confirm_attendance',{sess:S.session.id,expected_rows:expected});if(r.error)throw Object.assign(r.error,{status:r.status});const rows=await sb.from('v4_attendance').select('*').eq('session_id',S.session.id);if(rows.error)throw Object.assign(rows.error,{status:rows.status});return {session:S.session,attendanceRows:rows.data||[]};});
 if(key!==lessonContextKey())return;if(saved.pending){await savePortalCache();return toast('Đã lưu trên thiết bị · Chờ gửi xác nhận cả tiết.');}await loadAttendance();renderClass();toast('Đã xác nhận điểm danh cả tiết.');
};
window.TranPhuQueueLessonReview=async(payload,base)=>{if(window.TranPhuPendingReview?.()?.state==='blocked')throw Error('Nhận định trước cần xử lý trong danh sách bản chờ gửi.');return durableChange('review',lessonEnvelope(),payload,base,async()=>{const r=await sb.rpc('v4_save_quick_review',{sess:S.session.id,rating_code:payload.rating_code,content:payload.content,expected_at:base?.confirmed_at||null});if(r.error)throw Object.assign(r.error,{status:r.status});return {session:S.session,review:r.data};});};
window.TranPhuPendingReview=()=>[...S.pendingOps].reverse().find(op=>op.kind==='review'&&offlineScope(op));

window.TranPhuReportsContext=()=>({canSupport:canSupport(),demo:S.demo,demoCalendar:S.demoCalendar,year:S.year,classCode:S.cls,admin:S.admin,schoolViewer:S.schoolViewer,schoolClasses:[...new Set(S.tkb.map(t=>t.class_code))].sort(),classes:classChoices(),homeroomClasses:S.access.filter(a=>a.school_year===S.year&&a.role==='gvcn').map(a=>a.class_code),students:S.students,observations:S.obs,attendance:S.attendance,automaticAttendance:S.automaticAttendance,session:S.session,teacherNames:S.teacherNames,profile:S.profile,times:S.times,client:sb,userId:S.user?.id,offlineMode:S.offlineMode,pendingOps:S.pendingOps,mode:S.mode,teachingToday:teachingPlan().slots});
(window.TkbAuth?.subscribe||((callback)=>sb?.auth.onAuthStateChange(callback)))((event,session)=>{if(event==='SIGNED_OUT'){const previousUser=S.user?.id;Offline?.clearSnapshots(previousUser).catch(()=>{});Offline?.configure('');setLoginConfirmed('');const wasReady=S.ready;authGeneration++;S.ready=false;S.pendingOps=[];S.selected=null;S.user=null;S.profile=null;S.schoolViewer=false;S.session=null;S.access=[];if(wasReady&&!S.demo)location.reload();else if(!S.demo)authView('login');}else if(!S.demo&&S.user?.id&&session?.user?.id&&session.user.id!==S.user.id){setLoginConfirmed(session.user.id);authGeneration++;location.reload();}else if(event==='SIGNED_IN'&&loginConfirmed&&session?.user&&!S.ready&&!S.demo)setTimeout(()=>restorePortal(),0);});window.addEventListener('online',()=>{if(S.offlineMode)verifyCachedPortal();if(!S.ready&&!S.demo&&!$('retrySession')?.hidden)restorePortal();});if(cfg.supabaseUrl&&/^https?:$/.test(location.protocol))navigator.serviceWorker?.register('/sw.js').then(registration=>registration.update()).catch(console.warn);authHandlers();$('demo').hidden=!demoAllowed;const demoLabel=$('demoRole')?.closest('label');if(demoLabel)demoLabel.hidden=!demoAllowed;appHandlers();if($('timetableMode'))$('timetableMode').onchange=()=>{S.timetableMode=$('timetableMode').value;S.timetableEntity='';renderTeacherTimetable();};if($('timetableEntity'))$('timetableEntity').onchange=()=>{S.timetableEntity=$('timetableEntity').value;renderTeacherTimetable();window.TkbIntegration?.remember({classCode:S.timetableMode==='class'?S.timetableEntity:S.cls,teacherCode:S.timetableMode==='teacher'?S.timetableEntity:S.profile?.teacher_code||'',versionId:S.tkbVersion?.id||''});};if($('refreshTimetable'))$('refreshTimetable').onclick=refreshIntegratedTimetable;window.addEventListener('tkb:published',refreshIntegratedTimetable);window.addEventListener('focus',()=>{checkIntegratedVersion();refreshAutomaticHome();if(S.ready&&['home','class'].includes(S.renderPage))refreshDailyLearning();});window.addEventListener('tranphu:lesson-review-saved',refreshDailyLearning);document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkIntegratedVersion();refreshAutomaticHome();}});setInterval(()=>{if(!document.hidden){checkIntegratedVersion();refreshAutomaticHome();if(S.ready&&['home','class'].includes(S.renderPage))refreshDailyLearning();if(S.session&&S.session.lesson_date!==dateLocal()&&S.renderPage==='class')renderClass();}},60000);if($('timetableDate')){$('timetableDate').value=S.date;$('timetableDate').onchange=renderTeacherTimetable;}document.addEventListener('change',e=>{if(e.target.id==='reportClass')renderSupport();});document.addEventListener('click',async e=>{if(e.target.closest('[data-refresh-daily]')){await refreshDailyLearning({force:true});return;}const student=e.target.closest('[data-profile-student]');if(student){window.TranPhuReportScope?.choose(S.access.some(a=>a.school_year===S.year&&a.class_code===S.cls&&a.role==='gvcn')?'homeroom':'classes');await showPage('progress');if(window.TranPhuReports){$('reportClass').value=S.cls;$('reportClass').dispatchEvent(new Event('change',{bubbles:true}));$('reportStudent').value=student.dataset.profileStudent;window.TranPhuReports.make();}else{$('reportStudent').value=student.dataset.profileStudent;makeReport();}}const shift=e.target.closest('[data-week-shift]');if(shift&&$('timetableDate')){const date=new Date(($('timetableDate').value||dateLocal())+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+7*Number(shift.dataset.weekShift));$('timetableDate').value=date.toISOString().slice(0,10);renderTeacherTimetable();}});$('lessonDate').value=S.date;restorePortal();
})();
