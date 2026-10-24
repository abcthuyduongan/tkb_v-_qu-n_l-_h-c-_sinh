/* A teacher's current teaching session and nearest lesson from the published timetable. */
((root)=>{'use strict';
 const zone='Asia/Ho_Chi_Minh';
 const dayParts=now=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const addDays=(date,count)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);};
 const dayNo=date=>{const n=new Date(date+'T12:00:00Z').getUTCDay();return n===0?8:n+1;};
 const minutes=value=>{const m=String(value||'').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+(+m[2]):null;};
 const dateLabel=date=>new Intl.DateTimeFormat('vi-VN',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric',timeZone:zone}).format(new Date(date+'T12:00:00Z'));
 function resolve({entries=[],teacherCode='',times=[],now=Date.now(),effectiveDate='',hasVersion=true}={}){
  const clock=dayParts(now),today=clock.year+'-'+clock.month+'-'+clock.day,time=+clock.hour*60+(+clock.minute),shift=time<720?'morning':'afternoon',shiftLabel=shift==='morning'?'buổi sáng':'buổi chiều';
  const timed=times.map(t=>({...t,start:minutes(t.start_time),end:minutes(t.end_time)})).filter(t=>t.start!==null&&t.end!==null&&t.start<t.end);
  const rows=entries.filter(e=>e.teacher_code===teacherCode&&teacherCode&&(!e.status||e.status==='Học')).map(e=>{const t=timed.find(t=>+t.period_no===+e.period_no);return t?{...e,period_no:+e.period_no,start_time:t.start_time.slice(0,5),end_time:t.end_time.slice(0,5),start:t.start,end:t.end,shift:t.start<720?'morning':'afternoon'}:null;}).filter(Boolean);
  const hasAfternoon=entries.some(e=>{const t=timed.find(t=>+t.period_no===+e.period_no);return t&&t.start>=720&&(!e.status||e.status==='Học');});
  const result={today,shift,shiftLabel,slots:[],current:null,next:null,selected:null,title:'Lịch dạy của bạn',message:'',state:'empty'};
  if(!hasVersion)return {...result,state:'unpublished',message:'Chưa có thời khóa biểu được công bố.'};
  if(!teacherCode)return {...result,state:shift==='afternoon'&&!hasAfternoon?'no-afternoon':'unlinked',title:shift==='afternoon'&&!hasAfternoon?'Trường không dạy buổi chiều':result.title,message:'Tài khoản chưa được liên kết với giáo viên trong TKB.'};
  if(!entries.some(e=>e.teacher_code===teacherCode&&(!e.status||e.status==='Học')))return {...result,state:shift==='afternoon'&&!hasAfternoon?'no-afternoon':'unassigned',title:shift==='afternoon'&&!hasAfternoon?'Trường không dạy buổi chiều':result.title,message:'Bạn chưa có tiết được phân công trong TKB đang công bố.'};
  if(!rows.length)return {...result,state:'unconfigured',message:'Chưa có khung giờ phù hợp cho các tiết dạy của bạn.'};
  const minimum=/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)?effectiveDate:today;
  const todayRows=today>=minimum?rows.filter(e=>+e.day_no===dayNo(today)):[];
  result.slots=todayRows.filter(e=>e.shift===shift).map(e=>({...e,lesson_date:today})).sort((a,b)=>a.start-b.start||a.class_code.localeCompare(b.class_code));
  const current=result.slots.filter(e=>e.start<=time&&time<e.end);
  if(current.length>1)return {...result,state:'conflict',message:'TKB có các tiết trùng giờ. Cần quản trị kiểm tra phân công.'};
  result.current=current[0]?{...current[0],lesson_date:today}:null;
  const from=today>minimum?today:minimum,candidates=[];
  for(let offset=0;offset<8;offset++){const date=addDays(from,offset);for(const row of rows)if(+row.day_no===dayNo(date)&&(date>today||row.start>=time||row.start<=time&&time<row.end))candidates.push({...row,lesson_date:date});}
  candidates.sort((a,b)=>a.lesson_date.localeCompare(b.lesson_date)||a.start-b.start||a.class_code.localeCompare(b.class_code));result.next=candidates[0]||null;
  if(shift==='afternoon'&&!hasAfternoon)return {...result,state:'no-afternoon',title:'Trường không dạy buổi chiều',message:todayRows.length?'':'Hôm nay bạn không có tiết.'};
  if(result.current)return {...result,state:'active',selected:result.current,title:'Tiết học hiện tại',message:''};
  if(result.next?.lesson_date===today&&result.next.shift===shift)return {...result,state:'upcoming',selected:result.next,title:'Tiết dạy gần nhất',message:'Hiện tại bạn đang trống tiết.'};
  if(!todayRows.length)return {...result,state:'no-today',title:'Hôm nay bạn không có tiết',message:''};
  if(!result.slots.length)return {...result,state:'no-session',title:'Bạn không có tiết trong '+shiftLabel,message:''};
  return {...result,state:'completed',title:'Bạn đã hết tiết dạy '+shiftLabel,message:''};
 }
 root.TranPhuTeacherLessonPlan=Object.freeze({resolve,dateLabel});
})(globalThis);
