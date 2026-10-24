/* Optional teacher confirmation; statistics never generate a grade. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),context=()=>window.TranPhuReportsContext?.();
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let key='',row=null,loading=false,saving=false,revision=0;const demoRows=new Map();
 function message(text){$('lessonReviewMessage').textContent=text;}
 function controls(c){const writable=!!c.session&&(c.demo||c.session.teacher_id===c.userId)&&c.session.lesson_date===today()&&window.TranPhuAutoLesson?.getStatus()?.canWrite!==false;
  $('lessonReviewNote').disabled=$('confirmLessonReview').disabled=!writable||loading||saving;
  $('lessonReviewState').textContent=row?'Đã xác nhận':'Chưa xác nhận';
  if(!writable)message('Nhận định chỉ được giáo viên của tiết xác nhận trong ngày học.');
 }
 function paint(){const c=context();if(!c)return;const panel=$('lessonReviewPanel');panel.hidden=!c.session||c.mode!=='observe';if(!c.session)return;
  const id=c.session.id,att=c.attendance.filter(a=>a.session_id===id),notes=c.observations.filter(o=>o.session_id===id);
  $('lessonReviewFacts').textContent=[new Set(att.map(a=>a.student_id)).size+'/'+c.students.filter(s=>s.active!==false).length+' đã điểm danh',att.filter(a=>a.status==='absent').length+' vắng',att.filter(a=>a.status==='late').length+' muộn',notes.filter(o=>o.category==='concern').length+' lượt cần cải thiện',notes.filter(o=>o.category==='positive').length+' lượt tích cực'].join(' · ');
  if(key!==id){key=id;row=null;revision++;const current=revision;loading=true;$('lessonReviewNote').value='';message('Đang đọc nhận định…');
   const read=c.demo?Promise.resolve({data:demoRows.get(id)||null}):c.client.from('v4_lesson_reviews').select('*').eq('session_id',id).maybeSingle();
   Promise.resolve(read).then(r=>{if(current!==revision)return;if(r.error)throw r.error;row=r.data;$('lessonReviewNote').value=row?.note||'';message(row?'Đã xác nhận lúc '+new Date(row.confirmed_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác nhận: hệ thống tổng hợp từ dữ liệu đã ghi để giáo viên tiết sau xem.');}).catch(e=>{if(current===revision)message(e.message||'Chưa đọc được nhận định.');}).finally(()=>{if(current===revision){loading=false;controls(context());}});
  }controls(c);
 }
 $('saveLessonReview').onsubmit=async e=>{e.preventDefault();if(saving||loading)return;const c=context(),id=c.session?.id,note=$('lessonReviewNote').value.trim();if(note.length<3)return message('Nhập nhận định từ 3 đến 1000 ký tự.');const current=revision;saving=true;controls(c);message('Đang lưu nhận định…');
  try{let saved;if(c.demo){if(c.session.lesson_date!==today())throw Error('Tiết ngày trước chỉ xem lại');saved={session_id:id,note,confirmed_at:new Date().toISOString(),teacher_name:c.profile.teacher_name};demoRows.set(id,saved);}else{const r=await c.client.rpc('v4_save_lesson_review',{sess:id,content:note});if(r.error)throw r.error;saved=r.data;}
   if(current===revision){row=saved;message('Đã xác nhận nhận định.');}window.dispatchEvent(new Event('tranphu:lesson-review-saved'));
  }catch(e){if(current===revision)message(e.message||'Chưa lưu được nhận định.');}finally{saving=false;if(current===revision)controls(context());}
 };
 document.addEventListener('tranphu:lesson-render',paint);document.addEventListener('tranphu:lesson-status',()=>{if(context())controls(context());});
 new MutationObserver(paint).observe(document.body,{attributes:true,attributeFilter:['data-page']});
 window.TranPhuLessonReview=Object.freeze({render:paint,demoRows});paint();
})();
