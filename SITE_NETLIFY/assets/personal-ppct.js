/* Published curriculum is a plan reference, never a claim about the lesson actually taught. */
(()=>{'use strict';
 const TTL=30000,cache=new Map(),pending=new Map();let scope='',modelPromise,modelAttempt=0;
 const norm=value=>String(value??'').trim().normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}\p{N}]/gu,'');
 const folded=value=>norm(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const subject=value=>({tinhoc:'tin'}[folded(value)]||folded(value));
 const year=value=>String(value??'').replace(/\D/g,'');
 const grade=value=>String(value??'').trim().match(/^(?:kh[oố]i\s*)?(\d+)$/i)?.[1];
 const contains=(doc,cls)=>Array.isArray(doc.class_codes)&&doc.class_codes.some(code=>norm(code)===norm(cls)||grade(code)&&grade(code)===String(cls).match(/^\d+/)?.[0]);
 const automatic=doc=>norm(doc.teacher_name)===norm('Tự động theo TKB')||doc.class_codes.some(code=>grade(code));
 const teacher=(doc,c)=>automatic(doc)||(doc.teacher_id?String(doc.teacher_id)===String(c.profile?.teacher_code):norm(doc.teacher_name)===norm(c.profile?.teacher_name));
 const key=c=>[c.client?.supabaseUrl||window.TKB_CONFIG?.supabaseUrl||location.origin,c.userId,c.year,c.profile?.teacher_code,c.timetableVersion?.id,[...(c.classes||[])].sort().join(','),[...(c.homeroomClasses||[])].sort().join(',')].join('|');
 const bounded=promise=>window.TranPhuOffline?.timeout?window.TranPhuOffline.timeout(promise,8000):new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('PPCT chưa tải xong.')),8000);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 async function read(query){const r=await bounded(query);if(r.error)throw r.error;return r.data;}
 function models(){if(window.CurriculumModel&&window.SchoolCalendar)return Promise.resolve();if(!modelPromise){const retry=modelAttempt?'retry='+modelAttempt:'';modelPromise=Promise.all([window.CurriculumModel?null:import('/assets/ppct-model.js'+(retry?'?'+retry:'')),window.SchoolCalendar?null:import('/assets/school-calendar.js?v=45'+(retry?'&'+retry:''))]).then(()=>{if(!window.CurriculumModel||!window.SchoolCalendar)throw Error('Chưa đọc được công cụ PPCT.');}).catch(error=>{modelPromise=null;modelAttempt++;throw error;});}return bounded(modelPromise);}
 async function sources(c,{force,isCurrent}){
  const id=key(c);if(scope!==id){scope=id;cache.clear();pending.clear();}
  if(pending.has(id))return pending.get(id);
  const saved=cache.get(id);if(!force&&saved&&Date.now()-saved.at<TTL)return saved.value;
  const task=Promise.all([
   read(c.client.from('tkb_plans').select('id,teacher_name,teacher_id,school_year,subject,class_codes,version_label,lessons,published,deleted_at,created_at,updated_at').eq('school_year',c.year).eq('published',true).is('deleted_at',null).order('id')),
   read(c.client.from('tkb_school_calendars').select('school_year,semester1_start,semester2_start,week_overrides,updated_at').eq('school_year',c.year))
  ]).then(([plans,calendars])=>{const value={plans:(plans||[]).filter(p=>p.published===true&&!p.deleted_at&&year(p.school_year)===year(c.year)),calendars:calendars||[]};if(scope===id&&isCurrent())cache.set(id,{at:Date.now(),value});return value;}).finally(()=>{if(pending.get(id)===task)pending.delete(id);});
  pending.set(id,task);return task;
 }
 function reference(status,notice,extra={}){return {status,source:'plan',notice,...extra};}
 function withRows(report,assign,ppct_state,ppct_notice){return {...report,sessions:(report.sessions||[]).map(s=>({...s,ppct:assign(s)})),scheduled:(report.scheduled||[]).map(s=>({...s,ppct:assign(s)})),ppct_state,ppct_notice};}
 async function enrich(report,c,{force=false,isCurrent=()=>true}={}){
  if(!report||!c?.userId||!c.client||c.demo)return report;
  const initial=key(c),current=()=>isCurrent()&&key(c)===initial;
  try{
   const [{plans,calendars}]=await Promise.all([sources(c,{force,isCurrent:current}),models()]);if(!current())return report;
   const all=[...(report.sessions||[]),...(report.scheduled||[])],versionOf=s=>String(s.timetable_version_id||s.version_id||''),known=String(c.timetableVersion?.id||'');
   const histories=[...new Set(all.filter(s=>s.source!=='thu_cong'&&!s.source_missing&&s.version?.id&&versionOf(s)&&versionOf(s)!==known).map(versionOf))];
   let history=[],historyError=false;
   if(histories.length){try{history=await read(c.client.from('tkb_entries').select('version_id,day_no,period_no,class_code,subject,teacher_code,teacher_name,status').in('version_id',histories).eq('teacher_code',c.profile?.teacher_code||''));}catch{historyError=true;}if(!current())return report;}
   const calendarsForYear=calendars.filter(cal=>year(cal.school_year)===year(c.year)),calendar=calendarsForYear.length===1?calendarsForYear[0]:null,mapping=new Map();
   let matches=0,available=0,missing=0,errors=0;
   const assign=s=>{
    const docs=plans.filter(p=>subject(p.subject)===subject(s.subject)&&contains(p,s.class_code));
    if(!docs.length){missing++;return reference('missing','Chưa có PPCT đã công bố phù hợp với môn và lớp này.');}
    const candidates=docs.filter(p=>teacher(p,c)).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||String(b.id).localeCompare(String(a.id)));
    const doc=candidates[0]||docs[0],meta={documentId:doc.id,versionLabel:doc.version_label||'',updatedAt:doc.updated_at||''};
    const unmapped=notice=>{available++;return reference('available',notice,meta);};
    if(!candidates.length)return unmapped('Đã có PPCT cho lớp/môn; cần đối chiếu giáo viên phụ trách.');
    if(!calendar)return unmapped('Đã có PPCT; cần lịch tuần học của năm học để đối chiếu bài.');
    let week;try{week=window.SchoolCalendar.current(calendar,s.lesson_date).week;}catch{return unmapped('Đã có PPCT; lịch tuần học cần được kiểm tra.');}
    if(!week)return unmapped('Đã có PPCT; ngày này nằm ngoài tuần học đã cấu hình.');
    if(s.source==='thu_cong'||s.source_missing||!versionOf(s))return unmapped('Đã có PPCT; tiết này chưa có nguồn TKB để đối chiếu bài theo kế hoạch.');
    const id=versionOf(s),entries=(id===known?c.timetableEntries||[]:history||[]).filter(e=>String(e.version_id||known)===id&&e.teacher_code===c.profile?.teacher_code&&norm(e.class_code)===norm(s.class_code)&&subject(e.subject)===subject(s.subject));
    if(!entries.length){if(historyError&&id!==known){errors++;return reference('error','Đã có PPCT; chưa tải được TKB gắn với tiết để đối chiếu.',meta);}return unmapped('Đã có PPCT; chưa tìm được ô TKB gắn với tiết này.');}
    const mapKey=[doc.id,id,s.class_code].join('|');let result=mapping.get(mapKey);
    if(!result){result=window.CurriculumModel.join(doc,Array.isArray(doc.lessons)?doc.lessons:[],entries);mapping.set(mapKey,result);}
    const day=new Date(s.lesson_date+'T12:00:00Z').getUTCDay(),hits=result.schedule.filter(item=>Number(item.Tuan)===week&&Number(item.Thu)===(day===0?8:day+1)&&Number(item.TietTKB)===Number(s.period_no)&&norm(item.Lop)===norm(s.class_code));
    if(hits.length!==1)return unmapped(hits.length>1?'Đã có PPCT; cần đối chiếu các bài trùng ô lịch.':'Đã có PPCT; chưa đối chiếu được bài vào tiết này.');
    const hit=hits[0],lesson=doc.lessons.find(l=>l.MaBai===hit.MaBai);if(!lesson?.TenBai)return unmapped('Đã có PPCT; danh mục bài cần được kiểm tra.');
    matches++;return reference('matched','Bài theo PPCT đang công bố; chưa phải xác nhận bài thực tế đã dạy.',{...meta,period:Number(hit.TietPPCT),title:lesson.TenBai,week,lessonId:hit.MaBai,timetableVersionId:id});
   };
   const output=withRows(report,assign,'ready','');
   output.ppct_state=errors?'partial':'ready';
   output.ppct_notice=matches?'PPCT hiển thị theo kế hoạch đã công bố, không thay xác nhận bài thực tế đã dạy.':available?'Đã có PPCT; mở chi tiết tiết học để xem phần cần đối chiếu.':missing?'Chưa có PPCT đã công bố phù hợp trong các tiết đang xem.':'Không có tiết cần đối chiếu PPCT.';
   return output;
  }catch{
   if(!current())return report;
   return withRows(report,()=>reference('error','Chưa tải được PPCT. Thử Làm mới khi có kết nối.'),'error','Chưa tải được PPCT; dữ liệu đánh giá vẫn được giữ.');
  }
 }
 window.TranPhuPersonalPpct=Object.freeze({enrich});
})();
