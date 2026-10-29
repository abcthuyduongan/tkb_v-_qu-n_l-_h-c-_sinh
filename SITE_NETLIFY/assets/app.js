(() => {
  const cfg = window.TKB_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    document.body.innerHTML = '<main style="padding:30px;font-family:system-ui"><h2>Thiếu cấu hình Supabase</h2><p>Kiểm tra assets/tkb-config.js</p></main>';
    return;
  }
  const DAYS = [
    {no:2,label:'THỨ 2',full:'Thứ Hai'},{no:3,label:'THỨ 3',full:'Thứ Ba'},
    {no:4,label:'THỨ 4',full:'Thứ Tư'},{no:5,label:'THỨ 5',full:'Thứ Năm'},
    {no:6,label:'THỨ 6',full:'Thứ Sáu'},{no:7,label:'THỨ 7',full:'Thứ Bảy'}
  ];
  const el = id => document.getElementById(id);
  const state = {mode:'class', versions:[], version:null, entries:[], assignments:[], calendars:[], classes:[], teachers:[], selected:null, fromCache:false};
  let followingCurrent=!new URL(location.href).searchParams.has('version')||new URL(location.href).searchParams.get('follow')==='current';
  let snapshot=null,pendingManifest=null,deferredKey=null,syncBusy=false,checkBusy=false,display='subject',week=1,weekIsManual=false,reportSubject='',plans=[],mapped=[],mappingIssues=[];

  const confirmPortal=async(message,options={})=>window.TranPhuDialog?window.TranPhuDialog.confirm({...options,message}):window.confirm(message);
  const alertPortal=async(message,options={})=>window.TranPhuDialog?window.TranPhuDialog.alert({...options,message}):window.alert(message);
  function toast(message){
    if(window.TranPhuDialog)return window.TranPhuDialog.toast(message);
    const t=el('toast'); t.textContent=message; t.classList.add('show');
    clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
  }
  function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
  function formatDateISO(iso){if(!iso)return ''; const [y,m,d]=iso.split('-'); return `${d} tháng ${m} năm ${y}`;}
  function formatShortDate(iso){if(!iso)return '';const [y,m,d]=iso.split('-').map(Number);return `${d}/${m}/${y}`;}
  function lessonDayLabel(day){try{const info=calendar()&&SchoolCalendar.weeks(calendar())[week-1];if(!info)return {name:day.full,date:''};const iso=SchoolCalendar.iso(SchoolCalendar.date(info.start)+(day.no-2)*86400000);return {name:day.full,date:formatShortDate(iso)};}catch(e){return {name:day.full,date:''};}}
  function compactTeacher(name=''){const p=name.trim().split(/\s+/); return p.length?p[p.length-1]:'';}
  // Identity keys retain Vietnamese diacritics: Thanh and Thành are different teachers.
  function normalized(value=''){return String(value).trim().toLocaleLowerCase('vi').normalize('NFC').replace(/[^\p{L}\p{N}]/gu,'')}
  function folded(value=''){return String(value).trim().toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'')}
  function buildTeacherNameMap(entries,assignments){
    return window.TranPhuTeacherIdentity.nameMap(entries,assignments);
  }
  function enrichTeacherNames(entries,assignments){
    if(!assignments.length)return entries;
    const names=buildTeacherNameMap(entries,assignments);return entries.map(r=>{const homeroom=assignments.find(t=>String(t.homeroom_class||'').toUpperCase()===String(r.class_code||'').toUpperCase())?.teacher_name||r.homeroom_teacher;return{...r,teacher_name:names.get(normalized(r.teacher_code))||r.teacher_name,homeroom_teacher:homeroom}})
  }

  function versionRank(v){
    const year=Number((v.school_year||'').match(/\d{4}/)?.[0]||0);
    const semester=Number((v.semester||'').match(/\d+/)?.[0]||0);
    return [year,semester,Number(v.version_no)||0,new Date(v.published_at||0).getTime()];
  }
  function uniqueVersions(list){const seen=new Set();return [...list||[]].sort((a,b)=>Number(b.is_active)-Number(a.is_active)||String(b.published_at||'').localeCompare(String(a.published_at||''))).filter(v=>{const key=`${String(v.school_year||'').replace(/[^0-9]/g,'')}|${v.semester}|${Number(v.version_no)||0}`;if(seen.has(key))return false;seen.add(key);return true})}
  function newestVersion(list){return [...list].sort((a,b)=>{const x=versionRank(a),y=versionRank(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return y[i]-x[i]}return 0})[0]||null}
  const versionTitle=v=>'Số '+(Number(v.version_no)||'—');
  function versionLabel(v){const label=v.is_active?' — đang áp dụng':newestVersion(state.versions)?.id===v.id?' — số cao nhất':'';return `${v.school_year||'Năm học'} · ${v.semester||'Học kỳ'} · ${versionTitle(v)}${label}`}
  function buildVersionSelect(){const sorted=[...state.versions].sort((a,b)=>{const x=versionRank(a),y=versionRank(b);for(let i=0;i<x.length;i++){if(x[i]!==y[i])return y[i]-x[i]}return 0});el('versionSelect').innerHTML=sorted.map(v=>`<option value="${esc(v.id)}">${esc(versionLabel(v))}</option>`).join('');if(state.version)el('versionSelect').value=state.version.id}
  function calendar(){return state.calendars.find(c=>normalized(c.school_year)===normalized(state.version?.school_year));}
  function weekStatus(){try{return calendar()?SchoolCalendar.current(calendar()):{status:'missing',week:null};}catch(e){return {status:'invalid',week:null,error:e.message};}}
  function automaticWeek(){return weekStatus().week||1;}
  function currentVersion(list){let integration=window.TkbIntegration;try{integration=integration||window.parent.TkbIntegration;}catch{}return integration?.liveVersion(list)||null;}

  async function loadData(){
    setSync('Đang mở dữ liệu trên máy…');
    try{snapshot=await TkbStore.get();}catch(e){setSync('Không mở được bộ nhớ thiết bị: '+e.message,'warn');}
    if(snapshot){applySnapshot(snapshot);const requested=new URL(location.href).searchParams.get('version'),target=requested?state.versions.find(v=>v.id===requested):currentVersion(state.versions);if(target&&target.id!==state.version.id&&navigator.onLine)try{await install(await TkbStore.manifest(),target,{quiet:true});}catch(e){setSync(e.message+' Bản đang xem có thể đã cũ.','warn');}checkUpdates(false);return;}
    try{const m=await TkbStore.manifest();if(!m.versions.length){el('emptyState').hidden=false;setSync('Chưa có TKB công bố');return;}
      const q=new URL(location.href).searchParams,v=m.versions.find(v=>v.id===q.get('version'))||currentVersion(m.versions);if(!v)throw Error('Chưa có TKB được quản trị xác nhận áp dụng.');await install(m,v,{quiet:true});
    }catch(e){setSync('Chưa có bản lưu. Cần mạng để tải lần đầu. '+e.message,'warn');el('emptyState').hidden=false;}
  }

  async function loadVersion(version,updateUrl=true){
    if(!version||syncBusy)return;followingCurrent=!!version.is_active;
    if(snapshot?.version.id===version.id){buildVersionSelect();return;}
    if(!await confirmPortal('Khi tải thành công, bản TKB đang lưu trên thiết bị sẽ được thay thế.',{title:'Chuyển bản thời khóa biểu?',confirmLabel:'Tải bản TKB'})){buildVersionSelect();return;}
    try{const m=await TkbStore.manifest();await install(m,version);}catch(e){setSync('Chưa thay dữ liệu: '+e.message,'warn');buildVersionSelect();}
  }
  function applySnapshot(value){
    snapshot=value;state.version=value.version;state.versions=uniqueVersions(value.manifest.versions);state.assignments=value.assignments;state.calendars=value.calendars||value.manifest.calendars||[];
    state.entries=enrichTeacherNames(value.entries,value.assignments);plans=value.plans||[];const old=state.selected?.id;
    deriveEntities();buildVersionSelect();buildLessonMap();applyQueryOrDefault(old);el('emptyState').hidden=true;
    el('savedInfo').textContent='Bản trên máy · '+new Date(value.savedAt).toLocaleString('vi-VN');
    setSync(navigator.onLine?'Đang kiểm tra bản mới…':'Ngoại tuyến · Chưa kiểm tra bản mới','ok');
    if(!value.manifest.ready)toast('TKB đã sẵn sàng. Quản trị cần cài bảng PPCT để dùng bài học và PDF.');
  }
  async function install(m,v,{quiet=false}={}){
    if(syncBusy)return;syncBusy=true;el('acceptUpdate').disabled=true;el('versionSelect').disabled=true;
    setSync('Đang tải bản mới; bản cũ vẫn được giữ…');
    try{const value=await TkbStore.download(m,v.id);applySnapshot(value);showVersionStatus(value.manifest);pendingManifest=null;el('updateNotice').hidden=true;
      const u=new URL(location.href);u.searchParams.set('version',v.id);if(followingCurrent)u.searchParams.set('follow','current');else u.searchParams.delete('follow');(location.protocol==='about:'?null:history.replaceState(null,'',u));if(!quiet)toast('Đã chuyển sang bản mới và thay bản cũ trên máy.');
      navigator.storage?.persist?.().catch(()=>{});
    }finally{syncBusy=false;el('acceptUpdate').disabled=false;el('versionSelect').disabled=false;}
  }
  async function checkUpdates(manual){
    if(syncBusy||checkBusy)return;checkBusy=true;
    try{const m=await TkbStore.manifest();if(!snapshot){const v=currentVersion(m.versions);if(v)await install(m,v,{quiet:!manual});else setSync('Chưa có TKB được quản trị xác nhận áp dụng');return;}
      if(m.key!==snapshot.manifest.key){const live=currentVersion(m.versions);if(!manual&&!weekIsManual&&live&&(followingCurrent||state.version.id===live.id)){await install(m,live,{quiet:true});return;}pendingManifest=m;el('updateNotice').hidden=!manual&&deferredKey===m.key;const newer=!!live&&live.id!==state.version.id||m.versions.find(v=>v.id===state.version.id)?.updated_at!==state.version.updated_at;const message=newer?'TKB đang áp dụng đã được quản trị cập nhật. Bạn có cập nhật không?':'Đã có dữ liệu PPCT/PDF mới. Bạn có cập nhật không?';el('updateNotice').querySelector('strong').textContent=message;setSync(newer?'TKB đang áp dụng đã thay đổi':'Đã có dữ liệu mới','warn');}
      else{pendingManifest=null;el('updateNotice').hidden=true;showVersionStatus(m);if(manual)toast(currentVersion(m.versions)?.id===state.version.id?'Đang xem TKB hiện hành.':'Bạn đang xem bản lưu; có thể chuyển về TKB hiện hành.');}
    }catch(e){if(manual)toast('Không kiểm tra được cập nhật. Tiếp tục dùng dữ liệu đã lưu.');setSync(navigator.onLine?'Chưa kiểm tra được bản mới':'Ngoại tuyến · Chưa kiểm tra bản mới','warn');}
    finally{checkBusy=false;}
  }

  function deriveEntities(){
    const classMap=new Map(),teacherMap=new Map();
    for(const a of state.assignments){const teacherId=normalized(a.teacher_name);if(teacherId&&!teacherMap.has(teacherId))teacherMap.set(teacherId,{id:teacherId,label:String(a.teacher_name).trim().normalize('NFC')})}
    for(const r of state.entries){
      if(r.class_code&&!classMap.has(r.class_code))classMap.set(r.class_code,{id:r.class_code,label:`Lớp ${r.class_code}`,homeroom:r.homeroom_teacher||''});
      else if(r.class_code&&!classMap.get(r.class_code).homeroom&&r.homeroom_teacher)classMap.get(r.class_code).homeroom=r.homeroom_teacher;
      if(r.teacher_name){const teacherId=normalized(r.teacher_name);if(teacherId&&!teacherMap.has(teacherId))teacherMap.set(teacherId,{id:teacherId,label:String(r.teacher_name).trim().normalize('NFC')})}
    }
    state.classes=[...classMap.values()].sort((a,b)=>a.id.localeCompare(b.id,'vi',{numeric:true}));
    state.teachers=[...teacherMap.values()].sort((a,b)=>a.label.localeCompare(b.label,'vi'));
  }

  function setMode(mode,selectedId=null){
    if(window.TkbPublicLookup&&!['class','teacher'].includes(mode)){mode='class';selectedId=null;}
    state.mode=mode;
    if(mode==='teaching')display='lesson';
    el('viewSelect').value=mode;el('entityField').hidden=mode==='pccm';
    const displaySwitch=el('subjectMode').closest('.segmented');if(displaySwitch)displaySwitch.hidden=mode==='teaching';
    el('entityLabel').textContent=mode==='class'?'Chọn lớp':'Chọn giáo viên';
    el('lessonControls').hidden=!['class','teacher','teaching'].includes(mode);
    el('searchInput').placeholder=mode==='class'?'Gõ 6A, 7C, 8B…':mode==='teacher'?'Gõ tên giáo viên…':'Tìm giáo viên hoặc môn dạy…';
    updateDisplayControls();
    if(mode==='pccm'){state.selected=null;render();updateModeUrl();return}
    buildSelect();
    const list=entityList();
    selectEntity(selectedId||list[0]?.id||null,true);
  }
  function updateModeUrl(){const u=new URL(location.href);u.searchParams.set('mode',state.mode);u.searchParams.delete('id');(location.protocol==='about:'?null:history.replaceState(null,'',u));remember();}

  const planIdentity=p=>p.teacher_id||normalized(p.teacher_name);
  function entityList(){
    if(state.mode==='class')return state.classes;
    if(['pdf','ppct'].includes(state.mode)){const map=new Map();for(const p of relevantPlans()){const id=planIdentity(p);map.set(id,{id,label:p.teacher_name+(p.teacher_id?' · '+p.teacher_id:'')});}return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'vi'));}
    return state.teachers;
  }
  function buildSelect(){
    const list=entityList();
    el('entitySelect').innerHTML=list.map(x=>`<option value="${esc(x.id)}">${esc(x.label)}</option>`).join('');
  }
  function selectEntity(id,updateUrl=true){
    const list=entityList();
    state.selected=list.find(x=>x.id===id)||list.find(x=>normalized(x.label.split(' · ')[0])===id)||list[0]||null;if(!state.selected)return;
    el('entitySelect').value=state.selected.id;render();
    if(updateUrl){const u=new URL(location.href);u.searchParams.set('mode',state.mode);u.searchParams.set('id',state.selected.id);(location.protocol==='about:'?null:history.replaceState(null,'',u));}remember();
  }
  function applyQueryOrDefault(fallbackId=null){const q=new URL(location.href).searchParams,shared=window.TkbIntegration?.read()||{};let saved={};try{saved=JSON.parse(localStorage.getItem('tkb_view_preferences')||'{}');}catch(e){}
    const mode=['class','teacher','teaching','pccm','ppct','pdf'].includes(q.get('mode')||saved.mode)?q.get('mode')||saved.mode:'class';
    display=!window.TkbPublicLookup&&saved.display==='lesson'?'lesson':'subject';week=automaticWeek();weekIsManual=false;el('lessonWeek').value=week;updateDisplayControls();const own=window.TkbAuth?.profile,ownRow=own&&state.entries.find(row=>row.teacher_code===own.teacher_code);
    if(!q.has('mode')&&!q.has('id')&&ownRow)setMode('teacher',normalized(ownRow.teacher_name));else setMode(mode,q.get('id')||(mode==='class'?shared.classCode:null)||fallbackId||saved.id);}
  function remember(){try{localStorage.setItem('tkb_view_preferences',JSON.stringify({mode:state.mode,id:state.selected?.id,display,week}));}catch(e){}
 const integration=window.TkbIntegration;if(!integration)return;const row=rowsForSelected()[0];
 const context={versionId:state.version?.id||'',classCode:state.mode==='class'?state.selected?.id||'':'',teacherCode:state.mode==='teacher'?row?.teacher_code||'':''};integration.remember(context);
 const href=integration.teacherUrl(context);if(el('openClassWorkspace'))el('openClassWorkspace').href=href;
 const account=window.TkbAuth?.profile,link=el('teacherWorkspaceLink');if(link){link.href=account?'/giao-vien/?page=timetable&view=mine':href;link.title=account?`TKB của ${account.teacher_name}`:'Đăng nhập giáo viên';link.setAttribute('aria-label',link.title);} 
 if(el('openClassWorkspace'))el('openClassWorkspace').hidden=!['class','teacher'].includes(state.mode);
 }
  function rowsForSelected(){if(!state.selected)return[];return state.mode==='class'?state.entries.filter(r=>r.class_code===state.selected.id):state.entries.filter(r=>normalized(r.teacher_name)===state.selected.id);}

  function render(){
    if(!state.version)return;
    const v=state.version,rows=rowsForSelected();
    const status=weekStatus(),labels={before:'Chưa bắt đầu năm học',after:'Đã kết thúc năm học',break:'Đang nghỉ giữa các tuần học',missing:'Chưa có cấu hình tuần học',invalid:'Cấu hình tuần học chưa hợp lệ'},warning=el('scheduleWarnings');
    const issues=mappingIssues.filter(x=>state.mode==='class'?x.classes.includes(state.selected?.id):x.teacher===state.selected?.id||x.teacher===normalized(state.selected?.label?.split(' · ')[0]));
    warning.textContent=[!weekIsManual&&status.status!=='teaching'?labels[status.status]:'',...new Set(issues.map(x=>x.message))].filter(Boolean).join('\n');warning.hidden=!warning.textContent;
    el('latestVersionBtn').hidden=currentVersion(state.versions)?.id===v.id;
    el('plansDocument').hidden=true;
    if(['ppct','pdf','teaching'].includes(state.mode)){el('scheduleDocument').hidden=true;el('assignmentDocument').hidden=true;el('plansDocument').hidden=false;if(state.mode==='teaching')renderTeachingReport();else renderPlans();return;}
    if(state.mode==='pccm'){el('scheduleDocument').hidden=true;el('assignmentDocument').hidden=false;renderAssignments(el('searchInput').value);return}
    if(!state.selected)return;el('scheduleDocument').hidden=false;el('assignmentDocument').hidden=true;
    el('versionName').textContent=versionTitle(v);el('effectiveDate').textContent=display==='lesson'?`Tuần đang thực hiện: Tuần ${week}`:(v.effective_date?`(Thực hiện từ ngày ${formatDateISO(v.effective_date)})`:'');
    el('entityTitle').textContent=state.mode==='class'?`Lớp ${state.selected.id}`:`Giáo viên ${state.selected.label}`;
    if(state.mode==='class')el('sideInfo').textContent=state.selected.homeroom?`GVCN: ${state.selected.homeroom}`:'';
    else{const cn=state.classes.find(c=>c.homeroom===state.selected.label);el('sideInfo').textContent=cn?`GVCN lớp ${cn.id}`:'';}
    const upd=v.updated_at||v.published_at;el('lastUpdated').textContent=upd?`Cập nhật: ${new Date(upd).toLocaleString('vi-VN')}`:'';
    el('printGeneratedAt').textContent=`Tra cứu lúc ${new Date().toLocaleString('vi-VN')}`;
    renderDesktop(rows);renderMobile(rows);
    document.title=`TKB ${state.mode==='class'?state.selected.id:state.selected.label} | TH & THCS Trần Phú`;
  }

  function renderAssignments(query=''){
    const q=safeSearch(query),items=state.assignments.filter(a=>!q||safeSearch(`${a.teacher_name} ${a.duty||''} ${a.homeroom_class||''} ${a.teaching_assignment||''}`).includes(q));
    el('assignmentTitle').textContent=`${state.version.school_year||''} · ${state.version.semester||''}`;
    el('assignmentVersion').textContent=versionTitle(state.version);
    el('assignmentList').innerHTML=items.map(a=>`<article class="assignment-card"><div class="assignment-person"><span>${a.ordinal||''}</span><div><strong>${esc(a.teacher_name)}</strong><small>${esc([a.duty,a.homeroom_class?`CN ${a.homeroom_class}`:''].filter(Boolean).join(' · '))}</small></div>${a.period_count?`<b>${a.period_count} tiết</b>`:''}</div><p>${esc(a.teaching_assignment||'—')}</p></article>`).join('')||'<div class="empty-inline">Không có dữ liệu phân công phù hợp.</div>';
    document.title=`PCCM ${versionTitle(state.version)} | TH & THCS Trần Phú`;
  }
  function safeSearch(value=''){return folded(value)}

  // PPCT often uses the full curriculum name while the timetable uses a short label.
  // Keep identity matching strict for teachers/classes, but accept known subject aliases.
  function subjectKey(value=''){
    const key=folded(value),aliases={tinhoc:'tin'};
    return aliases[key]||key;
  }

  function findCell(rows,day,period){return rows.find(r=>Number(r.day_no)===day&&Number(r.period_no)===period)}
  function cellText(r,day,period){
    if(display==='lesson'&&!weekIsManual&&weekStatus().status!=='teaching')return{main:'—',sub:'Ngoài tuần học hoặc chưa cấu hình lịch',off:true};
    if(!r||folded(r.status)==='nghi'||folded(r.subject)==='nghi')return{main:'',sub:'',off:true};
    if(display==='lesson'){
      const hit=mapped.filter(x=>x.item.Tuan===week&&x.item.Thu===day&&x.item.TietTKB===period&&normalized(x.item.Lop)===normalized(r.class_code)&&(x.doc.auto_teacher||isAutoTeacher(x.doc.teacher_name)||normalized(x.doc.teacher_name)===normalized(r.teacher_name))&&subjectKey(x.doc.subject)===subjectKey(r.subject));
      if(hit.length===1){const x=hit[0];return {main:x.lesson.TenBai,sub:`Tiết PPCT ${x.item.TietPPCT} · ${r.subject} · ${r.class_code}`,off:false,url:pdfUrl(x.doc.pdf_url,x.lesson.TrangPDF)};}
      return {main:hit.length>1?'Cần đối chiếu bài học':'Chưa có bài học',sub:`${r.subject} · ${r.class_code}`,off:false};
    }
    return state.mode==='class'?{main:r.subject||'',sub:'',off:false}:{main:`${r.subject||''} · ${r.class_code||''}`,sub:'',off:false};
  }
  function renderDesktop(rows){
    let h='<div class="desktop-grid">'+DAYS.map(d=>`<div class="day-head">${d.label}</div>`).join('');
    for(let p=1;p<=5;p++)for(const d of DAYS){const t=cellText(findCell(rows,d.no,p),d.no,p);h+=`<div class="schedule-cell ${display==='lesson'?'lesson-cell':''} ${t.off?'off':''} ${p===5?'last-row':''}"><div class="main">${t.url?`<a class="lesson-link" target="_blank" rel="noopener" href="${esc(t.url)}">${esc(t.main)}</a>`:esc(t.main)}</div>${t.sub?`<div class="lesson-note">${esc(t.sub)}</div>`:''}</div>`}
    el('desktopSchedule').innerHTML=h+'</div>';
  }
  function renderMobile(rows){
    if(display==='lesson'){
      let body='';
      for(const d of DAYS)for(let p=1;p<=5;p++){
        const t=cellText(findCell(rows,d.no,p),d.no,p),dayLabel=lessonDayLabel(d);
        body+=`<tr class="${t.off?'off':''}">${p===1?`<th rowspan="5" scope="rowgroup"><span>${esc(dayLabel.name)}</span>${dayLabel.date?`<small>(${esc(dayLabel.date)})</small>`:''}</th>`:''}<td class="lesson-period">Tiết ${p}</td><td><strong>${t.url?`<a class="lesson-link" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.main||'')}</a>`:esc(t.main||'')}</strong>${t.sub?`<small>${esc(t.sub)}</small>`:''}</td></tr>`;
      }
      el('mobileSchedule').innerHTML=`<div class="lesson-mobile-table"><table><thead><tr><th>Ngày</th><th>Tiết</th><th>Bài học</th></tr></thead><tbody>${body}</tbody></table></div>`;
      return;
    }
    el('mobileSchedule').innerHTML=DAYS.map(d=>{
      let rs='';for(let p=1;p<=5;p++){const t=cellText(findCell(rows,d.no,p),d.no,p);rs+=`<div class="period-row ${t.off?'off':''}"><div class="period-badge">Tiết ${p}</div><div class="period-content"><strong>${t.url?`<a class="lesson-link" href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.main)}</a>`:esc(t.main||'')}</strong>${t.sub?`<small>${esc(t.sub)}</small>`:''}</div></div>`}
      return `<article class="day-card"><h4>${d.full}</h4>${rs}</article>`;
    }).join('');
  }
  function showVersionStatus(m){const latest=currentVersion(m.versions)?.id===state.version?.id;setSync(latest?'TKB hiện hành':'Đang xem TKB không hiện hành',latest?'ok':'warn');}
  function setSync(text,kind=''){const s=el('syncState');s.textContent=text;s.className=`status-chip ${kind}`;}
  function search(){
    const q=safeSearch(el('searchInput').value),box=el('searchResults');
    if(state.mode==='pccm'){box.hidden=true;renderAssignments(q);return}
    if(['ppct','pdf'].includes(state.mode)){box.hidden=true;renderPlans();return;}
    if(!q){box.hidden=true;box.innerHTML='';return}
    const list=entityList().filter(x=>safeSearch(x.id+' '+x.label).includes(q)).slice(0,8);
    box.innerHTML=list.length?list.map(x=>`<button class="search-result" data-id="${esc(x.id)}"><strong>${esc(x.label)}</strong>${state.mode==='class'&&x.homeroom?`<small>GVCN: ${esc(x.homeroom)}</small>`:''}</button>`).join(''):'<div class="search-result"><small>Không tìm thấy</small></div>';box.hidden=false;
  }

  const pdfUrl=(value,page)=>TkbQr.url(value,page);
  function relevantPlans(){return plans.filter(p=>p.school_year.replace(/\D/g,'')===String(new URL(location.href).searchParams.get('year')||state.version?.school_year).replace(/\D/g,''));}
  function expandedClasses(classCodes=[]){
    const available=state.classes.map(c=>c.id),result=[];
    for(const raw of classCodes){
      const token=String(raw||'').trim(),grade=token.match(/^(?:kh[oố]i\s*)?(\d+)$/i)?.[1];
      const matches=grade?available.filter(cls=>String(cls).match(/^\d+/)?.[0]===grade):available.filter(cls=>normalized(cls)===normalized(token));
      result.push(...(matches.length?matches:[token]));
    }
    return [...new Set(result.filter(Boolean))];
  }
  const isAutoTeacher=value=>normalized(value)===normalized('Tự động theo TKB');
  const isGradeScope=value=>/^(?:kh[oố]i\s*)?\d+$/i.test(String(value||'').trim());
  function activePlans(){const seen=new Set(),result=[];for(const p of relevantPlans().sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id))){const autoTeacher=isAutoTeacher(p.teacher_name)||p.class_codes.some(isGradeScope);for(const cls of expandedClasses(p.class_codes)){const k=[subjectKey(p.subject),normalized(cls)].join('|');if(!seen.has(k)){seen.add(k);result.push({...p,class_codes:[cls],auto_teacher:autoTeacher});}}}return result;}
  function buildLessonMap(){mapped=[];mappingIssues=[];for(const p of activePlans()){const entries=state.entries.filter(r=>(p.auto_teacher||normalized(r.teacher_name)===normalized(p.teacher_name))&&subjectKey(r.subject)===subjectKey(p.subject)&&p.class_codes.some(c=>normalized(c)===normalized(r.class_code)));const result=CurriculumModel.join(p,p.lessons,entries);mappingIssues.push(...result.issues.map(message=>({teacher:planIdentity(p),classes:p.class_codes,message:p.subject+': '+message})));if(!entries.length)mappingIssues.push({teacher:planIdentity(p),classes:p.class_codes,message:p.subject+': Không tìm được tiết TKB phù hợp.'});for(const item of result.schedule){const lesson=p.lessons.find(l=>l.MaBai===item.MaBai);if(lesson)mapped.push({doc:p,item,lesson});}}}
  function planBelongsToSelectedTeacher(p){if(planIdentity(p)===state.selected?.id||normalized(p.teacher_name)===state.selected?.id)return true;if((!isAutoTeacher(p.teacher_name)&&!p.class_codes.some(isGradeScope))||!state.selected)return false;const classes=expandedClasses(p.class_codes);return state.entries.some(r=>normalized(r.teacher_name)===normalized(state.selected.label.split(' · ')[0])&&subjectKey(r.subject)===subjectKey(p.subject)&&classes.some(c=>normalized(c)===normalized(r.class_code)));}
  function planLabel(p){const grades=[...new Set(p.class_codes.map(c=>String(c).match(/\d+/)?.[0]).filter(Boolean))];return p.subject+(grades.length?' · Khối '+grades.join(', '):'');}
  function renderTeachingReport(){
    const all=mapped.filter(x=>x.item.Tuan===week&&planBelongsToSelectedTeacher(x.doc));
    const subjects=[...new Set(all.map(x=>x.doc.subject))].sort((a,b)=>a.localeCompare(b,'vi'));if(!subjects.includes(reportSubject))reportSubject=subjects[0]||'';
    el('reportSubjectField').hidden=false;el('reportSubject').innerHTML=subjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');el('reportSubject').value=reportSubject;
    const info=calendar()?SchoolCalendar.weeks(calendar())[week-1]:null,base=info?SchoolCalendar.date(info.start):null;
    const rows=all.filter(x=>!reportSubject||x.doc.subject===reportSubject).sort((a,b)=>a.item.Thu-b.item.Thu||a.item.TietTKB-b.item.TietTKB||String(a.item.Lop).localeCompare(String(b.item.Lop),'vi'));
    const day=x=>{if(base===null)return DAYS.find(d=>d.no===x.item.Thu)?.full||'';const iso=SchoolCalendar.iso(base+(x.item.Thu-2)*86400000);return `${DAYS.find(d=>d.no===x.item.Thu)?.full||''} · ${formatDateISO(iso)}`;};
    el('plansTitle').textContent=`Lịch báo giảng · Tuần ${week} · ${state.selected?.label||''}`;
    el('plansList').innerHTML=rows.length?`<div class="ppct-table teaching-report"><table class="preview-table"><thead><tr><th>Ngày dạy</th><th>Tiết</th><th>Lớp</th><th>Môn</th><th>Tiết PPCT</th><th>Tên bài</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(day(x))}</td><td>${x.item.TietTKB}</td><td>${esc(x.item.Lop)}</td><td>${esc(x.doc.subject)}</td><td>${x.item.TietPPCT}</td><td>${esc(x.lesson.TenBai)}</td></tr>`).join('')}</tbody></table></div>`:'<p>Tuần này chưa có bài dạy phù hợp.</p>';
  }
  function renderPlans(){const q=safeSearch(el('searchInput').value),mine=relevantPlans().filter(planBelongsToSelectedTeacher);el('plansTitle').textContent=(state.mode==='pdf'?'Phụ lục 3 · PDF và mã QR':'Toàn bộ phân phối chương trình')+' · '+(state.selected?.label||'');el('reportSubjectField').hidden=true;
    if(state.mode==='pdf'){el('plansList').innerHTML=mine.filter(p=>!q||safeSearch([p.subject,p.class_codes.join(','),p.version_label,p.id].join(' ')).includes(q)).map(p=>`<article class="plan-card"><h3>${esc(planLabel(p))}</h3><p>${esc(p.school_year)} · ${esc(p.version_label)} · ${esc(p.id)}</p><p>PDF gốc trực tuyến · Không lưu ngoại tuyến</p><a class="primary-btn" href="${esc(pdfUrl(p.pdf_url))}" target="_blank" rel="noopener">Mở PDF</a> <button class="secondary-btn" data-qr="${esc(p.id)}">Mã QR</button></article>`).join('')||'<p>Chưa có PDF phù hợp được công bố.</p>';el('plansList').querySelectorAll('[data-qr]').forEach(b=>b.onclick=()=>{const p=mine.find(p=>p.id===b.dataset.qr);TkbQr.open(p.pdf_url,[p.teacher_name,p.subject,p.school_year,p.version_label].join(' · '));});return;}
    const grouped=new Map();for(const p of activePlans().filter(planBelongsToSelectedTeacher)){if(!grouped.has(p.id))grouped.set(p.id,{...p,class_codes:[]});grouped.get(p.id).class_codes.push(...p.class_codes);}
    const rows=[...grouped.values()].flatMap(p=>CurriculumModel.expand(p,p.lessons)).sort((a,b)=>a.doc.subject.localeCompare(b.doc.subject,'vi')||a.doc.id.localeCompare(b.doc.id)||a.period-b.period).filter(x=>!q||(/^\d+$/.test(q)?x.period===Number(q):safeSearch([x.doc.subject,x.doc.class_codes.join(','),x.lesson.TenBai].join(' ')).includes(q)));
    el('plansList').innerHTML='<p>Mỗi dòng là một tiết PPCT. Tuần là kế hoạch dự kiến; các ngày nghỉ và dạy bù cần đối chiếu.</p><div class="ppct-table"><table class="preview-table"><thead><tr><th>Môn</th><th>Tiết PPCT</th><th>Tên bài</th><th>Tuần</th><th>PDF</th></tr></thead><tbody>'+rows.map(x=>`<tr><td>${esc(planLabel(x.doc))}</td><td>${x.period}</td><td>${esc(x.lesson.TenBai)}</td><td>${esc(x.lesson.Tuan||'Chưa có')}</td><td><a target="_blank" rel="noopener" href="${esc(pdfUrl(x.doc.pdf_url,x.lesson.TrangPDF))}">Mở PDF</a></td></tr>`).join('')+'</tbody></table></div>'+(!rows.length?'<p>Chưa có bài học phù hợp.</p>':'');
  }
  function updateDisplayControls(){el('subjectMode').setAttribute('aria-pressed',String(display==='subject'));el('lessonMode').setAttribute('aria-pressed',String(display==='lesson'));el('weekControls').hidden=display!=='lesson'&&state.mode!=='teaching';el('weekPrev').disabled=week<=1;el('weekNext').disabled=week>=37;}
  for(const mode of ['subject','lesson'])el(mode+'Mode').onclick=()=>{display=mode;updateDisplayControls();remember();render();};
  async function changeWeek(value,manual=true){if(syncBusy)return;week=Math.max(1,Math.min(37,Math.floor(Number(value)||1)));weekIsManual=manual;
    try{if(calendar()){const target=manual?SchoolCalendar.weeks(calendar())[week-1].start:SchoolCalendar.today(),v=SchoolCalendar.version(state.versions,target,state.version.school_year);if(!v)throw Error('Chưa có TKB có hiệu lực cho tuần này.');if(v.id!==state.version.id){const chosen=week;if(!navigator.onLine)throw Error('Cần mạng để tải TKB của tuần này.');await install(await TkbStore.manifest(),v);week=chosen;weekIsManual=manual;}}}
    catch(e){el('desktopSchedule').innerHTML='';el('mobileSchedule').innerHTML='';setSync(e.message,'warn');return;}
    el('lessonWeek').value=week;updateDisplayControls();remember();render();}
  el('lessonWeek').onchange=e=>changeWeek(e.target.value);el('weekPrev').onclick=()=>changeWeek(week-1);el('weekNext').onclick=()=>changeWeek(week+1);
  el('currentWeek').onclick=()=>changeWeek(automaticWeek(),false);el('reportSubject').onchange=e=>{reportSubject=e.target.value;renderTeachingReport();};
  el('checkUpdate').onclick=()=>checkUpdates(true);el('deferUpdate').onclick=()=>{deferredKey=pendingManifest?.key;el('updateNotice').hidden=true;toast('Tiếp tục dùng bản đang lưu.');};
  el('refreshAllData').onclick=async()=>{if(!await confirmPortal('Xóa dữ liệu TKB, PCCM, PPCT và giao diện cũ đang lưu trên thiết bị, sau đó tải lại toàn bộ bản mới.',{title:'Tải lại toàn bộ dữ liệu?',confirmLabel:'Xóa và tải lại',tone:'warning'}))return;const button=el('refreshAllData');button.disabled=true;setSync('Đang xóa bộ nhớ đệm và chuẩn bị tải bản mới…','warn');try{await TkbStore.purge();if('serviceWorker'in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(r=>r.unregister()));}const u=new URL(location.href);u.searchParams.set('_refresh',Date.now());location.replace(u.href);}catch(e){button.disabled=false;setSync('Không xóa được bộ nhớ đệm: '+e.message,'warn');}};
  el('acceptUpdate').onclick=async()=>{try{const m=await TkbStore.manifest(),v=currentVersion(m.versions);if(v)await install(m,v);else toast('Chưa có TKB được quản trị xác nhận áp dụng.');}catch(e){setSync('Không cập nhật được; vẫn giữ bản cũ. '+e.message,'warn');}};
  el('storageInfo').onclick=()=>alertPortal('Thiết bị giữ 1 bộ dữ liệu TKB, PCCM và PPCT ('+(new Blob([JSON.stringify(snapshot)]).size/1048576).toFixed(2)+' MB), cùng giao diện ngoại tuyến. PDF không lưu ngoại tuyến. Trình duyệt có thể giải phóng dữ liệu khi thiếu dung lượng hoặc khi bạn xóa dữ liệu duyệt web.');
  window.addEventListener('focus',()=>{if(!document.hidden&&navigator.onLine)checkUpdates(false);});
  window.addEventListener('online',()=>checkUpdates(false));window.addEventListener('offline',()=>setSync('Ngoại tuyến · Chưa kiểm tra bản mới','warn'));document.addEventListener('visibilitychange',()=>{if(!document.hidden&&navigator.onLine)checkUpdates(false);});setInterval(()=>{if(document.hidden||window.frameElement?.closest('[hidden]'))return;if(navigator.onLine)checkUpdates(false);if(!weekIsManual){const current=automaticWeek();if(current!==week)changeWeek(current,false);}},120000);
  document.addEventListener('click',e=>{const a=e.target.closest('a');if(a&&a.href.startsWith('https://drive.google.com/')&&!navigator.onLine){e.preventDefault();toast('PDF cần kết nối mạng để mở.');}});
  el('viewSelect').addEventListener('change',e=>setMode(e.target.value,state.mode!=='class'&&e.target.value!=='class'?state.selected?.id:null));
  el('optionsToggle').addEventListener('click',()=>{const panel=el('advancedFilters'),open=panel.hidden;panel.hidden=!open;el('optionsToggle').setAttribute('aria-expanded',String(open))});
  el('versionSelect').addEventListener('change',e=>loadVersion(state.versions.find(v=>v.id===e.target.value)));
  el('latestVersionBtn').addEventListener('click',()=>loadVersion(currentVersion(state.versions)));
  el('entitySelect').addEventListener('change',e=>selectEntity(e.target.value));el('searchInput').addEventListener('input',search);
  el('searchResults').addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;selectEntity(b.dataset.id);el('searchInput').value='';el('searchResults').hidden=true;});
  document.addEventListener('click',e=>{if(!e.target.closest('.search-field'))el('searchResults').hidden=true});
  el('openClassWorkspace').addEventListener('click',event=>{if(parent!==window){event.preventDefault();parent.postMessage({type:'tranphu:attendance',classCode:state.mode==='class'?state.selected?.id:'',versionId:state.version?.id},new URL('/',document.baseURI).origin);}});
  el('printBtn').addEventListener('click',()=>window.print());
  el('shareBtn').addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:document.title,text:'Tra cứu thời khóa biểu',url:location.href});else{await navigator.clipboard.writeText(location.href);toast('Đã sao chép liên kết')}}catch(e){}});
  if(!cfg.offlineTest&&'serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
  window.addEventListener('tkb:auth',()=>{if(state.entries.length)applyQueryOrDefault(state.selected?.id);});
  window.addEventListener('tkb:published',async()=>{if(!syncBusy){try{const m=await TkbStore.manifest(),v=currentVersion(m.versions);if(v)await install(m,v);}catch(error){setSync('Chưa cập nhật được TKB: '+error.message,'warn')}}});
  loadData();
})();
