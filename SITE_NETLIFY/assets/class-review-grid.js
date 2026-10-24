/* Read-only lesson facts. Colour describes saved records, never a student grade. */
(()=>{'use strict';
 const DAY=86400000,active=new WeakMap();
 const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;};
 const date=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Khoảng tuần không hợp lệ');const d=new Date(value+'T12:00:00Z');if(d.toISOString().slice(0,10)!==value)throw Error('Khoảng tuần không hợp lệ');return d;};
 const iso=d=>d.toISOString().slice(0,10),short=d=>d.slice(8,10)+'/'+d.slice(5,7),monday=value=>{const d=date(value);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);};
 const add=(value,n)=>iso(new Date(date(value).getTime()+n*DAY));
 const rows=value=>Array.isArray(value)?value:[];
 function mount(container,input={}){
  active.get(container)?.destroy();container.replaceChildren();
  const from=input.from,to=input.to,cls=String(input.classCode||'');
  if(!cls)return {destroy(){container.replaceChildren();}};
  if(date(from)>date(to))throw Error('Khoảng tuần không hợp lệ');
  const students=rows(input.students).filter(s=>s.class_code===cls),byStudent=new Map(students.map(s=>[String(s.id),s]));
  const sessions=rows(input.sessions).filter(s=>s.class_code===cls&&s.lesson_date>=from&&s.lesson_date<=to&&Number(s.period_no)>=1&&Number(s.period_no)<=5),bySession=new Map(sessions.map(s=>[String(s.id),s]));
  const inRange=value=>value&&String(value).slice(0,10)>=from&&String(value).slice(0,10)<=to;
  const allConcerns=rows(input.observations).filter(o=>o.category==='concern'&&byStudent.has(String(o.student_id))&&(!o.class_code||o.class_code===cls)&&(bySession.has(String(o.session_id))||(!o.session_id&&inRange(o.lesson_date||o.observed_at))));
  const concerns=allConcerns.filter(o=>bySession.has(String(o.session_id)));
  const attendance=rows(input.attendance).filter(a=>bySession.has(String(a.session_id))&&byStudent.has(String(a.student_id))&&['absent','late'].includes(a.status));
  const weeks=[];for(let start=monday(from);start<=to;start=add(start,7))weeks.push(start);
  const shell=node('section',undefined,'class-review'),tools=node('div',undefined,'class-review-week-tools'),label=node('label','Tuần xem'),select=node('select');select.dataset.reviewWeek='';select.setAttribute('aria-label','Tuần xem đánh giá');
  for(const start of weeks){const option=node('option',short(start)+' – '+short(add(start,5)));option.value=start;select.append(option);}
  label.append(select);const prev=node('button','←','class-review-week-shift'),next=node('button','→','class-review-week-shift');prev.type=next.type='button';prev.dataset.reviewWeekShift='-1';next.dataset.reviewWeekShift='1';prev.setAttribute('aria-label','Tuần trước');next.setAttribute('aria-label','Tuần sau');tools.append(label,prev,next);tools.hidden=weeks.length<=1;
  const legend=node('div',undefined,'class-review-legend');legend.append(node('span','Đã mở tiết','class-review-legend-recorded'),node('span','Có ghi nhận cần cải thiện','class-review-legend-concern'));
  const scroller=node('div',undefined,'class-review-scroll'),table=node('table',undefined,'class-review-grid'),caption=node('caption','Đánh giá các tiết học · Lớp '+cls),head=node('thead'),body=node('tbody');table.append(caption,head,body);scroller.append(table);
  const details=node('div',undefined,'class-review-details');details.setAttribute('aria-live','polite');details.hidden=true;
  shell.append(tools,legend,scroller,details);container.append(shell);
  const rosterOrder=new Map(students.map((s,i)=>[String(s.id),i]));
  const order=(a,b)=>(rosterOrder.get(String(a.student_id))??Infinity)-(rosterOrder.get(String(b.student_id))??Infinity)||String(a.observed_at||'').localeCompare(String(b.observed_at||''));
  function personLine(record){const s=byStudent.get(String(record.student_id));const line=node('p',undefined,'class-review-person');line.append(node('strong',s?.full_name||'Học sinh'));if(s?.student_code)line.append(node('small',s.student_code));return line;}
  function concernItem(record){const item=node('li');item.append(personLine(record),node('p',record.behavior_code||'Ghi nhận cần cải thiện'));if(record.note)item.append(node('p',record.note,'class-review-note'));if(record.teacher_name)item.append(node('small','Giáo viên: '+record.teacher_name));return item;}
  function showLesson(session,button){
   shell.querySelectorAll('[data-review-slot]').forEach(b=>b.setAttribute('aria-expanded','false'));button.setAttribute('aria-expanded','true');details.replaceChildren();
   const notes=concerns.filter(o=>String(o.session_id)===String(session.id)).sort(order),att=attendance.filter(a=>String(a.session_id)===String(session.id)).sort(order);
   const review=rows(input.lessonReviews).find(r=>String(r.session_id)===String(session.id));
   details.hidden=!notes.length&&!att.length&&!review;if(details.hidden)return;
   details.append(node('h3',short(session.lesson_date)+' · Tiết '+session.period_no+' · '+session.subject));
   if(review){const system=review.source==='system',block=node('section',undefined,system?'class-review-system-note':'class-review-teacher-note'),stage={in_progress:'Đang trong tiết',final:'Đã kết thúc tiết',unknown:'Chưa xác định giờ kết thúc'}[review.stage];block.append(node('h4',system?'Tổng hợp hệ thống':'Giáo viên đã xác nhận'));if(stage)block.append(node('small',stage));block.append(node('p',review.note,'class-review-note'));if(!system)block.append(node('small','Giáo viên: '+(review.teacher_name||session.teacher_name||'')));details.append(block);}
   if(notes.length){const block=node('section',undefined,'class-review-concerns'),list=node('ul');block.append(node('h4','Ghi nhận cần cải thiện'),node('p',notes.length+' ghi nhận · '+new Set(notes.map(o=>o.student_id)).size+' học sinh','class-review-fact-count'));notes.forEach(o=>list.append(concernItem(o)));block.append(list);details.append(block);}
   if(att.length){const block=node('section',undefined,'class-review-attendance'),list=node('ul');block.append(node('h4','Điểm danh'));for(const record of att){const item=node('li');item.append(personLine(record),node('p',record.status==='absent'?'Vắng':'Đến muộn'));if(record.note)item.append(node('p',record.note,'class-review-note'));list.append(item);}block.append(list);details.append(block);}
  }
  function drawWeek(){
   const start=select.value;head.replaceChildren();body.replaceChildren();details.replaceChildren();details.hidden=true;
   const headers=node('tr');const first=node('th','Tiết');first.scope='col';headers.append(first);
   for(let d=0;d<6;d++){const day=add(start,d),th=node('th',undefined,'class-review-day class-review-day-'+(d+2));th.scope='col';th.append(node('span','Thứ '+(d+2)),node('small',short(day)));headers.append(th);}head.append(headers);
   for(let p=1;p<=5;p++){
    const tr=node('tr'),heading=node('th',String(p));heading.scope='row';tr.append(heading);
    for(let d=0;d<6;d++){
     const day=add(start,d),cell=node('td');cell.dataset.reviewDate=day;cell.dataset.reviewPeriod=String(p);
     const session=sessions.find(s=>s.lesson_date===day&&Number(s.period_no)===p);
     if(session){
      const notes=concerns.filter(o=>String(o.session_id)===String(session.id)),att=attendance.filter(a=>String(a.session_id)===String(session.id)),count=notes.length+att.length,button=node('button',undefined,'class-review-slot '+(count?'class-review-slot--concern':'class-review-slot--recorded'));
      button.type='button';button.dataset.reviewSlot=day+':'+p;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Thứ '+(d+2)+', '+short(day)+', tiết '+p+', '+session.subject+(count?', '+count+' ghi nhận cần xem':', đã mở tiết'));
      button.append(node('span',session.subject,'class-review-subject'));if(count)button.append(node('small',count+' ghi nhận','class-review-slot-count'));
      button.title=[session.subject,session.teacher_name].filter(Boolean).join(' · ');button.addEventListener('click',()=>showLesson(session,button));cell.append(button);
     }else{cell.className='class-review-empty';cell.setAttribute('aria-label','Chưa có dữ liệu');}
     tr.append(cell);
    }body.append(tr);
   }
   const index=weeks.indexOf(start);prev.disabled=index<=0;next.disabled=index>=weeks.length-1;
  }
  select.addEventListener('change',drawWeek);prev.addEventListener('click',()=>{select.value=weeks[Math.max(0,weeks.indexOf(select.value)-1)];drawWeek();});next.addEventListener('click',()=>{select.value=weeks[Math.min(weeks.length-1,weeks.indexOf(select.value)+1)];drawWeek();});
  select.value=weeks[0];drawWeek();
  if(input.aggregateAllowed&&(allConcerns.length||attendance.length)){
   const aggregate=node('section',undefined,'class-review-aggregate');aggregate.append(node('h3','Cần cải thiện · '+short(from)+' – '+short(to)));
   const list=node('ul');for(const student of students){const own=allConcerns.filter(o=>String(o.student_id)===String(student.id)),att=attendance.filter(a=>String(a.student_id)===String(student.id));if(!own.length&&!att.length)continue;const item=node('li'),detail=node('details'),summary=node('summary');summary.append(node('strong',student.full_name),node('span',[own.length?own.length+' nhận xét':'',att.length?att.length+' vắng / muộn':''].filter(Boolean).join(' · '),'class-review-fact-count'));detail.append(summary);const records=node('ul');
    for(const record of own.sort((a,b)=>String(bySession.get(String(a.session_id))?.lesson_date||a.observed_at).localeCompare(String(bySession.get(String(b.session_id))?.lesson_date||b.observed_at)))){const lesson=bySession.get(String(record.session_id)),entry=concernItem(record);entry.prepend(node('small',lesson?short(lesson.lesson_date)+' · Tiết '+lesson.period_no+' · '+lesson.subject:short(String(record.lesson_date||record.observed_at).slice(0,10))+' · Ngoài tiết học'));records.append(entry);}
    for(const record of att){const lesson=bySession.get(String(record.session_id)),entry=node('li');entry.append(node('small',short(lesson.lesson_date)+' · Tiết '+lesson.period_no+' · '+lesson.subject),node('p',record.status==='absent'?'Vắng':'Đến muộn'));if(record.note)entry.append(node('p',record.note,'class-review-note'));records.append(entry);}detail.append(records);item.append(detail);list.append(item);}aggregate.append(list);shell.append(aggregate);
  }
  const api={destroy(){if(active.get(container)===api){container.replaceChildren();active.delete(container);}}};active.set(container,api);return api;
 }
 window.TranPhuClassReview=Object.freeze({mount});
})();
