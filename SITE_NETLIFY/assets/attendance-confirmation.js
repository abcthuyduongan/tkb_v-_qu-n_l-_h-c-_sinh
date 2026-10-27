/* Only explicit teacher actions confirm attendance. Automatic rows stay separate. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),context=()=>window.TranPhuReportsContext?.();
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let saving=false,refreshKey='';
 function paint(){
  const c=context(),box=$('attendanceConfirmation');if(!box)return;box.hidden=!c?.session;if(box.hidden)return;
  const auto=(c.automaticAttendance||[]).filter(a=>a.session_id===c.session.id).length;
  const count=c.attendance.filter(a=>a.session_id===c.session.id).length;
  $('attendanceConfirmationText').textContent=count+' lượt đã được giáo viên xác nhận. '+(auto?auto+' lượt Có mặt — tự động, chờ xác nhận.':'Các học sinh chưa điểm danh vẫn chờ giáo viên xác nhận.');
  const clock=window.TranPhuAutoLesson?.getStatus(),today=clock?.schoolToday||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const owns=c.demo||c.session.teacher_id===c.userId;
  $('markRest').hidden=!owns;$('markRest').disabled=saving||!owns||c.session.lesson_date!==today||clock?.canWrite===false;
  $('attendanceHistory').hidden=c.demo||!owns&&!c.homeroomClasses.includes(c.session.class_code);
 }
 $('attendanceHistory').onclick=async()=>{
  const c=context(),id=c?.session?.id;if(!id)return;const body=document.createElement('div');body.innerHTML='<p role="status">Đang tải lịch sử…</p>';
  window.TranPhuDialog.content({title:'100 thay đổi điểm danh gần nhất',content:body});
  try{const r=await c.client.rpc('v4_attendance_history',{sess:id});if(r.error)throw r.error;
   const labels={present:'Có mặt',absent:'Vắng',late:'Muộn',excused:'Có phép'};
   const value=v=>!v?'Chưa điểm danh':(labels[v.status]||v.status)+(v.source==='automatic'?' · Tự động, chờ xác nhận':'')+(v.note?' · '+v.note:'');
   body.innerHTML=(r.data||[]).map(h=>'<div class="historyItem"><strong>'+esc(h.full_name)+'</strong><small>'+esc(h.teacher_name)+' · '+esc(new Date(h.changed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))+'</small><p>Trước: '+esc(value(h.old_value))+'</p><p>Sau: '+esc(value(h.new_value))+'</p></div>').join('')||'<p>Chưa có lịch sử từ khi cập nhật chức năng.</p>';
  }catch(error){body.textContent=error.message||'Chưa đọc được lịch sử.';}
 };
 document.addEventListener('tranphu:lesson-render',paint);
 document.addEventListener('tranphu:lesson-status',e=>{
  paint();const c=context(),key=c?.session?.id+'|'+e.detail?.state;
  if(!c?.demo&&e.detail?.state==='elapsed'&&key!==refreshKey){refreshKey=key;window.TranPhuReloadAttendance?.().catch(()=>{$('attendanceConfirmationText').textContent='Chưa cập nhật được trạng thái điểm danh. Bấm Làm mới để thử lại.';});}
 });
})();
