/* Account-scoped encrypted snapshots and a durable, replayable teacher outbox. No tokens are stored here. */
(()=>{'use strict';
 const rawFetch=window.fetch.bind(window),DB='tranphu-teacher-offline-v1',origin=window.TKB_CONFIG?.supabaseUrl||location.origin;
 const uuid=()=>crypto.randomUUID?.()||'10000000-1000-4000-8000-100000000000'.replace(/[018]/g,c=>(Number(c)^crypto.getRandomValues(new Uint8Array(1))[0]&15>>Number(c)/4).toString(16)),clone=value=>JSON.parse(JSON.stringify(value)),owner=uuid();
 let connection,context=()=>null,uid='',scopeVersion=0,working=null,healthy=navigator.onLine!==false,storageError='',storageUnavailable=false,stale=false,updateReady=false,wake,painting=false;
 const inFlight=new Set(),channel=typeof BroadcastChannel==='function'?new BroadcastChannel('tranphu-private-sync'):null;
 const account=()=>origin+'|'+uid;
 const timeout=(promise,ms,message='Kết nối quá lâu. Đang giữ dữ liệu trên thiết bị.')=>{let timer;return Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(Object.assign(Error(message),{name:'TimeoutError',retryable:true})),ms))]).finally(()=>clearTimeout(timer));};
 const retryable=error=>!!error?.retryable||[408,429].includes(error?.status)||error?.status>=500||/fetch|network|offline|timeout|timed out|abort|kết nối|quá lâu/i.test(error?.message||'');
 async function timedFetch(input,options={}){
  const abort=new AbortController(),upstream=options.signal,onAbort=()=>abort.abort(upstream.reason),timer=setTimeout(()=>abort.abort(),8000);
  if(upstream?.aborted)abort.abort();else upstream?.addEventListener('abort',onAbort,{once:true});
  try{const response=await (window.fetch===timedFetch?rawFetch:window.fetch.bind(window))(input,{...options,signal:abort.signal}),body=await response.arrayBuffer(),headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');healthy=response.status<500;paint();return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers});}
  catch(error){healthy=false;paint();throw Object.assign(Error(error.name==='AbortError'?'Kết nối quá lâu. Dữ liệu chưa gửi vẫn được giữ.':'Chưa kết nối được máy chủ.'),{retryable:true,name:error.name});}
  finally{clearTimeout(timer);upstream?.removeEventListener('abort',onAbort);}
 }
 function open(){
  if(connection)return connection;
  connection=timeout(new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{for(const name of ['cache','queue','keys','leases'])r.result.createObjectStore(name);};r.onsuccess=()=>{storageUnavailable=false;r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Bộ nhớ đang được mở ở tab khác.'));}),1800,'Không mở được bộ nhớ lưu tạm.').catch(error=>{connection=null;storageUnavailable=true;storageError=error.message;paint();throw error;});
  return connection;
 }
 async function request(store,mode,action){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=action(tx.objectStore(store));let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không lưu được dữ liệu trên thiết bị.'));});}
 async function keyFor(who){
  if(!crypto.subtle)throw Error('Trình duyệt chưa hỗ trợ bộ nhớ mã hóa; cần mở ứng dụng qua HTTPS.');
  let key=await request('keys','readonly',s=>s.get(who));if(key)return key;
  const generated=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),db=await open();
  return new Promise((resolve,reject)=>{const tx=db.transaction('keys','readwrite'),s=tx.objectStore('keys'),r=s.get(who);r.onsuccess=()=>{key=r.result||generated;if(!r.result)s.put(key,who);};tx.oncomplete=()=>resolve(key);tx.onerror=()=>reject(tx.error);});
 }
 async function seal(value,who){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFor(who);return {iv,cipher:await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)))};}
 async function unseal(row,who){if(!row||row.account!==who)return null;const key=await keyFor(who);return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv},key,row.cipher)));}
 async function cachePut(name,value){if(!uid)return;const who=account(),version=scopeVersion;try{const encrypted=await seal(value,who);if(who!==account()||version!==scopeVersion)return;await request('cache','readwrite',s=>s.put({...encrypted,account:who,at:Date.now()},who+'|'+name));}catch(error){storageError=error.message;paint();throw error;}}
 async function cacheGet(name){if(!uid)return null;const who=account(),version=scopeVersion;try{const result=await unseal(await request('cache','readonly',s=>s.get(who+'|'+name)),who);if(result&&(name==='portal'||name.startsWith('class:')||name.startsWith('personal-week:'))){const keys=await request('cache','readonly',s=>s.getAllKeys()),ids=new Set(keys.filter(k=>String(k).startsWith(who+'|withdrawn:')).map(k=>String(k).slice((who+'|withdrawn:').length))),target=name==='portal'?result.state:result;if(target){const before=(target.obs||target.observations||[]).length;for(const field of ['obs','observations','openAlerts'])if(Array.isArray(target[field]))target[field]=target[field].filter(o=>!ids.has(o.id));if(before!==(target.obs||target.observations||[]).length&&Object.hasOwn(target,'daily')){target.daily=null;target.dailyError='Trạng thái cần cập nhật sau điều chỉnh ghi nhận.';}}}return who===account()&&version===scopeVersion?result:null;}catch(error){storageError=error.message;paint();return null;}}
 async function cacheRemove(name){if(uid)await request('cache','readwrite',s=>s.delete(account()+'|'+name));}
 async function list(){if(!uid)return [];const who=account(),rows=await request('queue','readonly',s=>s.getAll());const decoded=await Promise.all(rows.filter(r=>r.account===who).map(r=>unseal(r,who)));if(who!==account())return [];return decoded.filter(Boolean).sort((a,b)=>a.createdAt-b.createdAt||a.order-b.order);}
 async function putOp(op){const who=origin+'|'+op.userId,encrypted=await seal(op,who);await request('queue','readwrite',s=>s.put({...encrypted,account:who,id:op.id,state:op.state,createdAt:op.createdAt},op.id));channel?.postMessage({account:who});paint();}
 async function begin(kind,lesson,payload={},base=null){
  if(!uid)throw Error('Cần đăng nhập đúng tài khoản trước khi lưu.');
  const operations=await list();if(operations.length>=2000)throw Error('Bộ nhớ có quá nhiều bản ghi chờ. Mở danh sách để xử lý trước.');
  const op={id:uuid(),kind,studentName:context()?.studentName?.(payload.student_id)||'',userId:uid,lesson:clone(lesson),payload:clone(payload),base:clone(base),state:'held',createdAt:Date.now(),order:performance.now(),heldUntil:Date.now()+20000,attempts:0};
  await putOp(op);inFlight.add(op.id);return op;
 }
 async function ack(op,result,{emit=false}={}){
  const who=origin+'|'+op.userId,encrypted=await seal(result,who),removed=result.withdrawnObservation,withdrawn=removed?await seal(removed,who):null,db=await open();
  await new Promise((resolve,reject)=>{const tx=db.transaction(['queue','cache'],'readwrite');tx.objectStore('queue').delete(op.id);tx.objectStore('cache').put({...encrypted,account:who,at:Date.now()},who+'|ack:'+op.id);if(withdrawn)tx.objectStore('cache').put({...withdrawn,account:who,at:Date.now()},who+'|withdrawn:'+removed.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
  inFlight.delete(op.id);channel?.postMessage({account:who,ackId:op.id});if(emit&&uid===op.userId)window.dispatchEvent(new CustomEvent('tranphu:sync-applied',{detail:{op,result}}));paint();
 }
 async function defer(op,error){inFlight.delete(op.id);op.state=retryable(error)?'pending':'blocked';op.error=retryable(error)?'Chưa có kết nối ổn định; sẽ tự gửi lại.':String(error?.message||'Cần kiểm tra lại bản ghi.').slice(0,400);op.nextTryAt=Date.now()+1000;await putOp(op);schedule(1500);}
 async function run(kind,lesson,payload,base,write,{queue=false}={}){
  let op;
  try{op=await begin(kind,lesson,payload,base);}catch(error){if(queue||!healthy||navigator.onLine===false)throw error;storageError='Không lưu được dự phòng trên thiết bị; chỉ gửi trực tiếp khi có mạng.';paint();return {result:await write({id:uuid()})};}
  if(queue||!healthy||navigator.onLine===false){await defer(op,{retryable:true});return {pending:true,op};}
  try{const result=await write(op);await ack(op,result);return {result,op};}
  catch(error){await defer(op,error);if(retryable(error))return {pending:true,op};throw error;}
 }
 function currentIdentity(){return window.TkbAuth?.cachedUser?.()?.id||window.TkbAuth?.session?.user?.id||null;}
 const checked=async query=>{const r=await query;if(r.error)throw Object.assign(r.error,{status:r.status});return r.data;};
 async function ensureLesson(op,client){
  const l=op.lesson;
  let row=await checked(client.from('v4_sessions').select('*').eq('school_year',l.school_year).eq('class_code',l.class_code).eq('lesson_date',l.lesson_date).eq('period_no',l.period_no).maybeSingle());
  if(!row){
   const day=await checked(client.rpc('v4_school_today'));if(String(day).slice(0,10)!==l.lesson_date)throw Error('Đã qua ngày học: bản ghi được giữ lại, không tự ghi bù.');
   const value={id:l.id,school_year:l.school_year,class_code:l.class_code,lesson_date:l.lesson_date,period_no:l.period_no,subject:l.subject,timetable_version_id:l.timetable_version_id||null,source:l.source,override_reason:l.override_reason||'',teacher_id:op.userId};
   const r=await client.from('v4_sessions').insert(value).select('*').single();
   if(r.error?.code==='23505')row=await checked(client.from('v4_sessions').select('*').eq('school_year',l.school_year).eq('class_code',l.class_code).eq('lesson_date',l.lesson_date).eq('period_no',l.period_no).single());else if(r.error)throw Object.assign(r.error,{status:r.status});else row=r.data;
  }
  if(row.teacher_id!==op.userId||row.subject!==l.subject)throw Error('Tiết học thuộc giáo viên khác hoặc nội dung đã thay đổi. Cần kiểm tra lại.');
  return row;
 }
 const sameAttendance=(a,b)=>!!a&&!!b&&a.status===b.status&&(a.note||'')===(b.note||'');
 async function resolvedBase(base){if(!base?.previousOperation)return base;const previous=await cacheGet('ack:'+base.previousOperation);if(!previous){const pending=await request('queue','readonly',s=>s.get(base.previousOperation));if(!pending)throw Error('Bản ghi trước đã được bỏ; cần đối chiếu lại nội dung đang lưu.');throw Object.assign(Error('Đang chờ bản ghi trước đó.'),{dependency:true});}return previous.attendance||previous.review||previous.attendanceRows?.find(row=>row.student_id===base.student_id)||null;}
 async function apply(op,client,serverDay){
  const session=await ensureLesson(op,client),sess=session.id,l=op.lesson,p=op.payload;
  const canWrite=()=>{if(l.lesson_date!==serverDay||session.ended_at)throw Error('Tiết đã khóa hoặc qua ngày học; giữ lại để kiểm tra, không tự ghi bù.');};
  if(op.kind==='open')return {session};
  if(op.kind==='attendance'){
   const base=await resolvedBase(op.base),actual=await checked(client.from('v4_attendance').select('*').eq('session_id',sess).eq('student_id',p.student_id).maybeSingle());
   if(sameAttendance(actual,p)&&actual.updated_by===op.userId)return {session,attendance:actual};
   canWrite();
   if(actual&&(!base||!sameAttendance(actual,base)||base.updated_at&&actual.updated_at!==base.updated_at)||!actual&&base)throw Error('Điểm danh đã thay đổi ở nơi khác. Bản trên máy được giữ để đối chiếu.');
   const value={session_id:sess,student_id:p.student_id,status:p.status,note:p.note||'',updated_by:op.userId};
   let query=actual?client.from('v4_attendance').update({status:value.status,note:value.note,updated_by:op.userId}).eq('session_id',sess).eq('student_id',p.student_id).eq('status',actual.status).eq('note',actual.note).eq('updated_at',actual.updated_at):client.from('v4_attendance').upsert(value,{onConflict:'session_id,student_id',ignoreDuplicates:true});
   const rows=await checked(query.select('*'));if(!rows?.length)throw Error('Điểm danh vừa đổi ở nơi khác. Làm mới để đối chiếu.');return {session,attendance:rows[0]};
  }
  if(op.kind==='observation'){
   const value={...p,id:op.id,session_id:sess,created_by:op.userId,observed_at:new Date(op.createdAt).toISOString()};
   const existing=await checked(client.from('v4_observations').select('*').eq('id',op.id).maybeSingle());
   if(existing){if(existing.created_by!==op.userId||existing.student_id!==value.student_id||existing.session_id!==sess||existing.category!==value.category||existing.behavior_code!==value.behavior_code||existing.note!==value.note||existing.is_alert!==value.is_alert||(existing.attention_kind||null)!==(value.attention_kind||null))throw Error('Mã bản ghi đã được dùng cho nội dung khác.');return {session,observation:existing};}
   canWrite();try{return {session,observation:await checked(client.from('v4_observations').insert(value).select('*').single())};}catch(error){if(error.code==='23505'){const old=await checked(client.rpc('v4_withdrawn_observations',{sess}));const removed=(old||[]).find(o=>o.id===op.id);if(removed)return {session,withdrawnObservation:removed};}throw error;}
  }
  if(op.kind==='withdrawal'){canWrite();return {session,withdrawnObservation:await checked(client.rpc('v4_withdraw_observation',{obs:p.id,reason:p.reason,expected_at:p.expected_at}))};}
  if(op.kind==='review'){
   const base=await resolvedBase(op.base),actual=await checked(client.from('v4_lesson_reviews').select('*').eq('session_id',sess).maybeSingle());
   if(actual&&(actual.detail_note??actual.note??'')===p.content&&(actual.rating||null)===(p.rating_code||null))return {session,review:actual};
   canWrite();if((actual?.confirmed_at||null)!==(base?.confirmed_at||null))throw Error('Nhận định đã thay đổi ở nơi khác. Bản đang nhập được giữ lại.');
   return {session,review:await checked(client.rpc('v4_save_quick_review',{sess,rating_code:p.rating_code,content:p.content,expected_at:base?.confirmed_at||null}))};
  }
  if(op.kind==='confirm'){
   const expected=[];for(const row of p.expected_rows){const value=await resolvedBase(row.previousOperation?{previousOperation:row.previousOperation}:row);if(value)expected.push(value);}
   const actual=await checked(client.from('v4_attendance').select('*').eq('session_id',sess)),state=await checked(client.rpc('v4_attendance_state',{sess})),active=await checked(client.from('v4_students').select('id').eq('school_year',l.school_year).eq('class_code',l.class_code).eq('active',true));
   const roster=[...new Set([...(state.roster_ids||[]),...active.map(s=>s.id)])].sort();
   if(JSON.stringify(roster)!==JSON.stringify([...p.roster_ids].sort()))throw Error('Danh sách học sinh đã thay đổi. Cần xem lại trước khi xác nhận cả tiết.');
   for(const row of expected){const other=actual.find(a=>a.student_id===row.student_id);if(!sameAttendance(other,row)||row.updated_at&&other.updated_at!==row.updated_at)throw Error('Điểm danh đã đổi; cần đối chiếu trước khi xác nhận.');}
   if(actual.some(row=>!expected.some(e=>e.student_id===row.student_id)&&(row.status!=='present'||row.note||row.updated_by!==op.userId)))throw Error('Có thay đổi điểm danh khác; bản xác nhận được giữ để kiểm tra.');
   if(roster.every(id=>actual.some(row=>row.student_id===id)))return {session,attendanceRows:actual};
   canWrite();await checked(client.rpc('v4_confirm_attendance',{sess,expected_rows:actual.map(a=>({student_id:a.student_id,status:a.status,note:a.note,updated_at:a.updated_at}))}));return {session,attendanceRows:await checked(client.from('v4_attendance').select('*').eq('session_id',sess))};
  }
  throw Error('Loại bản ghi không được hỗ trợ khi ngoại tuyến.');
 }
 async function lease(){const db=await open(),who=account();return new Promise((resolve,reject)=>{let acquired=false;const tx=db.transaction('leases','readwrite'),s=tx.objectStore('leases'),r=s.get(who);r.onsuccess=()=>{if(!r.result||r.result.until<Date.now()||r.result.owner===owner){s.put({owner,until:Date.now()+45000},who);acquired=true;}};tx.oncomplete=()=>resolve(acquired);tx.onerror=()=>reject(tx.error);});}
 async function flush({force=false}={}){
  if(working)return working;if(!uid||navigator.onLine===false||currentIdentity()!==uid)return;
  const userId=uid;
  working=(async()=>{try{
   const pending=await list();if(!pending.some(op=>!inFlight.has(op.id)&&(op.state!=='held'||op.heldUntil<=Date.now())&&(force||op.state!=='blocked'&&(!op.nextTryAt||op.nextTryAt<=Date.now()))))return;
   if(!await lease())return;
   const client=window.TkbAuth?.client,session=await timeout(client.auth.getSession(),10000);if(session.error)throw session.error;if(session.data?.session?.user?.id!==userId)return;
   const serverDay=String(await checked(client.rpc('v4_school_today'))).slice(0,10);healthy=true;
   for(const op of await list()){
    if(uid!==userId||currentIdentity()!==userId||navigator.onLine===false)break;
    if(op.state==='blocked'&&!force||inFlight.has(op.id)||op.state==='held'&&op.heldUntil>Date.now()||!force&&op.nextTryAt>Date.now())continue;
    if(!await lease())break;
    try{const result=await apply(op,client,serverDay);await ack(op,result,{emit:true});}
    catch(error){if(error.dependency){op.state='pending';op.error='Đang chờ bản ghi trước của cùng học sinh/tiết.';await putOp(op);continue;}op.attempts++;op.error=retryable(error)?'Chưa có kết nối ổn định; sẽ tự gửi lại.':String(error.message||'Cần kiểm tra bản ghi.').slice(0,400);op.state=retryable(error)?'pending':'blocked';op.nextTryAt=Date.now()+Math.min(60000,2000*2**Math.min(op.attempts,5));await putOp(op);if(retryable(error)){healthy=false;break;}}
   }
  }catch(error){if(retryable(error))healthy=false;else storageError=error.message||'Chưa kiểm tra được đồng bộ.';}
  finally{const who=origin+'|'+userId;try{const db=await open();await new Promise(resolve=>{const tx=db.transaction('leases','readwrite'),s=tx.objectStore('leases'),r=s.get(who);r.onsuccess=()=>{if(r.result?.owner===owner)s.delete(who);};tx.oncomplete=resolve;tx.onerror=resolve;});}catch{}working=null;paint();}})();
  return working;
 }
 function schedule(ms=3000){clearTimeout(wake);wake=setTimeout(()=>{flush();schedule(15000);},ms);}
 async function showQueue(){
  let rows=[];try{rows=await list();}catch{}const body=document.createElement('div');
  body.innerHTML='<p>'+String(storageError||(!healthy||navigator.onLine===false?'Đang dùng bản lưu; ứng dụng tự kết nối và gửi lại khi có mạng.':stale?'Ứng dụng đang tự kiểm tra dữ liệu mới.':'Kết nối ổn định. Đồng bộ chạy tự động.')).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</p><p>Chỉ bản ghi được máy chủ xác nhận mới tính là đã lưu. Bản lỗi hoặc quá ngày vẫn giữ trên thiết bị.</p>';
  for(const op of rows){const item=document.createElement('section');item.className='offline-queue-row';const p=document.createElement('p');p.textContent='Lớp '+op.lesson.class_code+' · Tiết '+op.lesson.period_no+' · '+op.lesson.lesson_date+' · '+({open:'Mở tiết',attendance:'Điểm danh',observation:'Nhận xét',withdrawal:'Thu hồi ghi nhận',review:'Nhận định tiết',confirm:'Xác nhận điểm danh'}[op.kind]||op.kind);if(op.studentName)p.textContent+=' · '+op.studentName;item.append(p);const desired=document.createElement('p');desired.textContent=({present:'Có mặt',absent:'Vắng',late:'Muộn',excused:'Có phép'}[op.payload.status]||op.payload.behavior_code||'')+' '+(op.payload.reason||op.payload.note||op.payload.content||'');item.append(desired);const note=document.createElement('small');note.textContent=op.error||'Đang chờ gửi';item.append(note);const remove=document.createElement('button');remove.type='button';remove.className='btn outline';remove.textContent='Bỏ bản ghi';remove.disabled=op.state==='held';remove.onclick=async()=>{if(!await window.TranPhuDialog.confirm({title:'Bỏ bản ghi chưa gửi?',message:'Thao tác này xóa bản lưu tạm đang chọn trên thiết bị.',confirmLabel:'Bỏ bản ghi',tone:'warning'}))return;await request('queue','readwrite',s=>s.delete(op.id));item.remove();channel?.postMessage({account:account()});paint();};item.append(remove);body.append(item);}
  const actions=document.createElement('div');actions.className='actions';const send=document.createElement('button');send.type='button';send.className='btn primary';send.textContent='Thử gửi lại';send.hidden=!rows.length&&healthy&&!stale;send.onclick=()=>{window.dispatchEvent(new Event('tranphu:retry-connection'));flush({force:true});};
  const download=document.createElement('button');download.type='button';download.className='btn outline';download.textContent='Tải bản sao';download.hidden=!rows.length;download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:1,exportedAt:new Date().toISOString(),records:rows},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Ban_ghi_chua_gui_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};actions.append(send,download);if(updateReady){const reload=document.createElement('button');reload.className='btn outline';reload.textContent='Mở bản mới';reload.onclick=async()=>{await context()?.beforeReload?.();location.reload();};actions.append(reload);}body.append(actions);window.TranPhuDialog?.content({title:'Bản ghi lưu trên thiết bị',content:body});
 }
 async function paint(){
  if(painting)return;painting=true;
  try{const app=document.getElementById('appView'),header=document.querySelector('.bar .barlinks');if(!app||!header)return;let slot=document.getElementById('connectionStatus');
   if(!slot){slot=document.createElement('span');slot.id='connectionStatus';slot.className='header-connection-slot';const button=document.createElement('button');button.id='pendingSyncButton';button.type='button';button.className='connection-indicator';button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0M12 20h.01"/><path class="connection-slash" d="m3 3 18 18"/></svg>';button.onclick=showQueue;slot.append(button);header.prepend(slot);}
   const who=account();let rows=[];try{if(uid&&!storageUnavailable)rows=await list();}catch{}
   if(who!==account()){queueMicrotask(paint);return;}
   const button=slot.querySelector('button'),blocked=rows.filter(r=>r.state==='blocked').length,ok=healthy&&navigator.onLine!==false&&!stale&&!storageError&&!blocked;
   slot.hidden=app.hidden||!uid;button.dataset.state=ok?'green':'red';
   const status=storageError||(!healthy||navigator.onLine===false?'Chưa kết nối. Dữ liệu được giữ trên thiết bị.':stale?'Đang tự kiểm tra kết nối và dữ liệu mới.':blocked?'Có bản ghi cần xử lý.':'Kết nối ổn định.');
   const label=status+(rows.length?' '+rows.length+' bản chờ gửi.':'')+(updateReady?' Bản ứng dụng mới đã tải sẵn.':'');button.title=label;button.setAttribute('aria-label',label);
   window.dispatchEvent(new CustomEvent('tranphu:outbox-changed',{detail:{rows}}));
  }finally{painting=false;}
 }

 async function clearSnapshots(userId){if(!userId)return;if(userId===uid)scopeVersion++;const who=origin+'|'+userId,db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction('cache','readwrite'),s=tx.objectStore('cache'),r=s.openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;if(cursor.value.account===who&&!String(cursor.key).includes('|ack:')&&!String(cursor.key).includes('|withdrawn:'))cursor.delete();cursor.continue();};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
 function configure(id,getContext){if(uid!==(id||''))scopeVersion++;uid=id||'';if(getContext)context=getContext;paint();schedule(1200);}
 channel?.addEventListener('message',async event=>{if(event.data?.account!==account())return;paint();if(event.data.ackId){const result=await cacheGet('ack:'+event.data.ackId);if(result?.session)window.dispatchEvent(new CustomEvent('tranphu:sync-applied',{detail:{op:{lesson:result.session,userId:uid},result}}));}});
 window.addEventListener('online',()=>{healthy=true;paint();flush({force:true});window.dispatchEvent(new Event('tranphu:retry-connection'));});window.addEventListener('offline',()=>{healthy=false;paint();});
 window.addEventListener('focus',()=>{paint();flush();});document.addEventListener('visibilitychange',()=>{if(!document.hidden){paint();flush();}});
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='TRANPHU_UPDATE_READY'){updateReady=true;paint();}});
 window.TranPhuOffline=Object.freeze({timedFetch,timeout,retryable,configure,cacheGet,cachePut,cacheRemove,list,run,flush,paint,clearSnapshots,shouldQueue:()=>!healthy||navigator.onLine===false,setStale:value=>{stale=value;paint();},networkOk:()=>{healthy=true;storageError='';paint();}});
})();
