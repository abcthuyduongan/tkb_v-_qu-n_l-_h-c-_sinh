(() => {
  const cfg=window.TKB_CONFIG||{};
  const sb=window.TkbAuth?.client||supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  window.TkbAdminClient=sb;
  const el=id=>document.getElementById(id);
  const alertPortal=async message=>window.TranPhuDialog?window.TranPhuDialog.alert({title:'Chưa thể công bố TKB',message,tone:'danger'}):window.alert(message);
  let parsedRows=[],parsedAssignments=[],validationErrors=[],knownVersions=[],saving=false,focusedVersion='';

  function msg(target,text,kind=''){target.textContent=text;target.className=`form-message ${kind}`;}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function safe(v){return v==null?'':String(v).trim();}
  function canonicalYear(value){
    if(!window.TranPhuSchoolYear)throw Error('Chưa nạp bộ kiểm tra năm học. Hãy tải lại trang trước khi công bố.');
    return window.TranPhuSchoolYear.normalize(value);
  }
  function isSpreadsheetError(v){return /^#(?:NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|GETTING_DATA)$/i.test(safe(v));}
  function normalizeHeader(s){return safe(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
  function identityKey(s){return safe(s).toLocaleLowerCase('vi').normalize('NFC').replace(/[^\p{L}\p{N}]/gu,'');}
  function field(row,names){
    const map={};Object.keys(row).forEach(k=>map[normalizeHeader(k)]=row[k]);
    for(const n of names){const key=normalizeHeader(n);if(key in map)return map[key];}
    return '';
  }
  function parseNoiDung(txt){
    const s=safe(txt);if(!s||s==='Nghỉ')return{subject:s||'',teacher_code:''};
    const m=s.match(/^(.*?)\s*-\s*([^-]+)$/);return m?{subject:m[1].trim(),teacher_code:m[2].trim()}:{subject:s,teacher_code:''};
  }
  function normalizeRow(row){
    const content=parseNoiDung(field(row,['NoiDung','Nội dung']));
    const day=Number(field(row,['ThuSo','Thứ số','Thu','Thứ','day_no']));
    const period=Number(field(row,['Tiet','Tiết','period_no']));
    const classCode=safe(field(row,['Lop','Lớp','class_code']));
    const subject=safe(field(row,['Mon','Môn','subject']))||content.subject;
    const teacherCode=safe(field(row,['GVMa','GV Mã','teacher_code']))||content.teacher_code;
    const teacherName=safe(field(row,['GiaoVien','Giáo viên','teacher_name']));
    const homeroom=safe(field(row,['GVCN','homeroom_teacher']));
    const status=safe(field(row,['TrangThai','Trạng thái','status']))||(subject==='Nghỉ'?'Nghỉ':'Học');
    return{day_no:day,period_no:period,class_code:classCode,subject,teacher_code:teacherCode,teacher_name:teacherName,homeroom_teacher:homeroom,status};
  }
  function teacherLastName(name){const parts=safe(name).split(/\s+/);return identityKey(parts[parts.length-1]||'')}
  function assignmentHasClassSubject(assignment,subject,classCode){
    const subjectKey=normalizeHeader(subject),classKey=identityKey(classCode);
    if(!subjectKey||!classKey)return false;
    for(const part of safe(assignment).matchAll(/([^()]+)\(([^()]*)\)/g)){
      if(normalizeHeader(part[1])===subjectKey&&part[2].split(/[,;]/).some(code=>identityKey(code)===classKey))return true;
    }
    return false;
  }
  function resolveTeacherName(alias,subject,classCode,assignments){
    if(!window.TranPhuTeacherIdentity)throw Error('Chưa nạp bộ đối chiếu giáo viên. Hãy tải lại trang.');
    return window.TranPhuTeacherIdentity.resolve(alias,subject,classCode,assignments);
  }
  function parseClassSheet(wb,assignments=[]){
    const sheet=wb.Sheets.TKB_LOP_S;if(!sheet)return null;
    const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
    const headerIndex=grid.findIndex(r=>normalizeHeader(r[0])==='thu'&&normalizeHeader(r[1])==='tiet');
    if(headerIndex<0)return null;
    const headers=grid[headerIndex],classes=headers.slice(2).map(v=>safe(v).split(/\r?\n/)[0]);
    const homerooms=classes.map(classCode=>assignments.find(a=>safe(a.homeroom_class).toUpperCase()===classCode.toUpperCase())?.teacher_name||'');
    const rows=[];let day=0;
    for(let i=headerIndex+1;i<grid.length;i++){
      const r=grid[i],dayText=safe(r[0]),dayValue=Number(dayText);if(dayText&&Number.isInteger(dayValue))day=dayValue;
      const period=Number(r[1]);if(!Number.isInteger(period))continue;
      for(let j=2;j<headers.length;j++){
        const classCode=classes[j-2],content=safe(r[j]);if(!classCode||!content||isSpreadsheetError(content))continue;
        const parsed=parseNoiDung(content),isOff=normalizeHeader(content)==='nghi';if(isOff)continue;
        rows.push({day_no:day,period_no:period,class_code:classCode,subject:parsed.subject,teacher_code:parsed.teacher_code,teacher_name:resolveTeacherName(parsed.teacher_code,parsed.subject,classCode,assignments),homeroom_teacher:homerooms[j-2],status:'Học'});
      }
    }
    return rows;
  }
  function parseAssignmentSheet(wb){
    const sheet=wb.Sheets.PCCM||wb.Sheets.PCGD;if(!sheet)return[];
    const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
    const headerIndex=grid.findIndex(r=>normalizeHeader(r[0])==='tt'&&normalizeHeader(r[1])==='giaovien');
    if(headerIndex<0)return[];
    return grid.slice(headerIndex+1).map(r=>({
      ordinal:Number(r[0])||null,teacher_name:safe(r[1]),duty:safe(r[2]),homeroom_class:safe(r[3]),
      teaching_assignment:safe(r[4]),period_count:Number(r[5])||null
    })).filter(r=>r.teacher_name&&!isSpreadsheetError(r.teacher_name));
  }
  function validate(rows){
    validationErrors=[];const seen=new Set(),good=[];
    rows.forEach((r,i)=>{
      const errs=[];
      if(!Number.isInteger(r.day_no)||r.day_no<2||r.day_no>7)errs.push('Thứ phải từ 2 đến 7');
      if(!Number.isInteger(r.period_no)||r.period_no<1||r.period_no>5)errs.push('Tiết phải từ 1 đến 5');
      if(!r.class_code)errs.push('Thiếu lớp');if(!r.subject)errs.push('Thiếu môn/nội dung');
      const key=`${r.day_no}|${r.period_no}|${escapeHtml(r.class_code)}`;if(seen.has(key))errs.push('Trùng thứ-tiết-lớp');else seen.add(key);
      if(r.subject!=='Nghỉ'&&r.status!=='Nghỉ'&&!r.teacher_name)errs.push('Thiếu tên giáo viên');
      if(errs.length)validationErrors.push(`Dòng ${i+2}: ${errs.join(', ')}`);else good.push(r);
    });return good;
  }
  function summarize(){
    const valid=validate(parsedRows),classes=new Set(valid.map(r=>r.class_code)),teachers=new Set(valid.filter(r=>r.teacher_name).map(r=>r.teacher_name));
    el('validCount').textContent=valid.length;el('classCount').textContent=classes.size;el('teacherCount').textContent=teachers.size;el('errorCount').textContent=validationErrors.length;
    el('publishBtn').disabled=!valid.length||validationErrors.length>0;
    if(validationErrors.length){
      el('validationErrors').hidden=false;
      el('validationErrors').innerHTML='<b>Cần sửa trước khi công bố:</b><ul>'+validationErrors.slice(0,30).map(x=>`<li>${x}</li>`).join('')+'</ul>';
    }else el('validationErrors').hidden=true;
    el('previewBody').innerHTML=valid.slice(0,30).map(r=>`<tr><td>${r.day_no}</td><td>${r.period_no}</td><td>${escapeHtml(r.class_code)}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.teacher_name||'')}</td><td>${escapeHtml(r.homeroom_teacher||'')}</td></tr>`).join('')||'<tr><td colspan="6" class="muted center">Chưa có dữ liệu</td></tr>';
  }

  async function parseFile(file){
    if(saving)return;
    parsedRows=[];parsedAssignments=[];validationErrors=[];el('publishBtn').disabled=true;
    const ext=file.name.split('.').pop().toLowerCase();
    try{
      let rawRows=[];
      if(ext==='json'){
        const txt=await file.text(),data=JSON.parse(txt);rawRows=Array.isArray(data)?data:(data.rows||[]);
      }else if(ext==='csv'){
        const txt=await file.text(),wb=XLSX.read(txt,{type:'string'});rawRows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
      }else{
        const buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'});
        parsedAssignments=parseAssignmentSheet(wb);const classRows=parseClassSheet(wb,parsedAssignments);
        if(classRows){parsedRows=classRows;el('fileSummary').hidden=false;el('fileSummary').innerHTML=`<b>${escapeHtml(file.name)}</b> · ${parsedRows.length} tiết · ${parsedAssignments.length} giáo viên PCCM`;summarize();return}
        const sheetName=wb.SheetNames.find(n=>n.trim().toUpperCase()==='APP_TKB')||wb.SheetNames[0];rawRows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:''});
      }
      parsedRows=rawRows.map(normalizeRow).filter(r=>Boolean(r.subject)&&normalizeHeader(r.subject)!=='nghi'&&normalizeHeader(r.status)!=='nghi'&&![r.class_code,r.subject,r.teacher_code,r.teacher_name].some(isSpreadsheetError));
      el('fileSummary').hidden=false;el('fileSummary').innerHTML=`<b>${escapeHtml(file.name)}</b> · ${parsedRows.length} dòng được đọc`;summarize();
    }catch(err){el('fileSummary').hidden=false;el('fileSummary').textContent='Không đọc được file: '+err.message}
  }

  let authRevision=0,approvedUser='',checkedAt=0,pendingAuth=null,pendingUser='',currentUser='';
  const subscribe=callback=>window.TkbAuth?.subscribe?window.TkbAuth.subscribe(callback):sb.auth.onAuthStateChange(callback);
  function authGate(text,retry=false){el('adminAuthGate').hidden=false;el('adminAuthText').textContent=text;el('retryAdminSession').hidden=!retry;el('returnToPortal').hidden=!text;}
  function clearWorkspace(){el('adminWorkspace').hidden=true;el('adminWorkspace').inert=false;el('versionsList').innerHTML='';parsedRows=[];parsedAssignments=[];validationErrors=[];el('fileInput').value='';summarize();}
  window.requireTkbAdmin=async()=>{const{data,error}=await sb.rpc('is_tkb_admin');if(error)throw Error('Chưa kiểm tra được quyền quản trị. Vui lòng thử lại.');if(data!==true)throw Object.assign(Error('Tài khoản không có quyền quản trị.'),{permissionDenied:true});return true;};
  async function setSessionUI(session,{force=false}={}){
    const uid=session?.user?.id||'';
    if(uid!==currentUser){authRevision++;approvedUser='';checkedAt=0;clearWorkspace();currentUser=uid;}
    el('logoutBtn').hidden=!session;
    if(!session){authRevision++;el('adminAuthGate').hidden=true;el('loginCard').hidden=false;return;}
    el('loginCard').hidden=true;
    if(session.user.app_metadata?.force_password_change){clearWorkspace();authGate('Cần đặt mật khẩu riêng tại ứng dụng trước khi quản lý TKB.');return;}
    if(!force&&approvedUser===uid&&Date.now()-checkedAt<30000)return;
    if(pendingAuth&&pendingUser===uid)return pendingAuth;
    const revision=++authRevision;pendingUser=uid;if(approvedUser!==uid)authGate('Đang mở quản lý TKB…');
    const request=(async()=>{try{
      await window.requireTkbAdmin();if(revision!==authRevision)return;
      const first=approvedUser!==uid;approvedUser=uid;checkedAt=Date.now();el('adminAuthGate').hidden=true;el('adminWorkspace').inert=false;el('adminWorkspace').hidden=false;if(first)loadVersions();
    }catch(error){if(revision!==authRevision)return;if(error.permissionDenied){approvedUser='';clearWorkspace();authGate(error.message);}else{el('adminWorkspace').inert=true;authGate(error.message,true);}}
    finally{if(pendingAuth===request)pendingAuth=null;}})();pendingAuth=request;return request;
  }
  async function restoreAdminSession(force=false){try{await window.TkbAuth?.ready;const result=await sb.auth.getSession();if(result.error)throw result.error;await setSessionUI(result.data?.session||null,{force});}catch{el('loginCard').hidden=true;authGate('Chưa kiểm tra được phiên làm việc. Vui lòng thử lại.',true);}}
  function sessionCheck(){restoreAdminSession();subscribe((_event,session)=>setTimeout(()=>setSessionUI(session),0));}
  el('retryAdminSession').onclick=()=>restoreAdminSession(true);
  el('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();msg(el('loginMessage'),'Đang đăng nhập…');
    const{error}=await sb.auth.signInWithPassword({email:window.TranPhuTeacherIdentity.loginEmail(el('emailInput').value),password:el('passwordInput').value});
    if(error)msg(el('loginMessage'),error.message,'error');else msg(el('loginMessage'),'Đăng nhập thành công','ok');
  });
  el('logoutBtn').addEventListener('click',()=>sb.auth.signOut());

  const dz=el('dropZone'),fi=el('fileInput');
  fi.addEventListener('change',()=>fi.files[0]&&parseFile(fi.files[0]));
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover')}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragover')}));
  dz.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)parseFile(f)});

  const yearKey=value=>String(value||'').replace(/[\s–—-]/g,'');
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const versionTitle=v=>'TKB số '+(Number(v.version_no)||'—');
  function metadata(){
    if(!el('timetableMetadataForm').reportValidity())return null;
    const year=canonicalYear(el('schoolYearInput').value),n=Number(el('versionNoInput').value),date=el('effectiveDateInput').value;
    if(!Number.isInteger(n)||n<1||n>9999||!date)throw Error('Nhập số TKB và ngày áp dụng hợp lệ.');
    el('schoolYearInput').value=year;
    return{version_no:n,version_name:'Số '+n,school_name:el('schoolNameInput').value.trim()||'TH & THCS TRẦN PHÚ',school_year:year,semester:el('semesterInput').value,effective_date:date};
  }
  function friendlyError(error){const text=String(error?.message||'');if(error?.code==='PGRST202'||/does not exist|schema cache|Offline schema does not include RPC/i.test(text))return 'Cần cập nhật chức năng quản lý bản TKB trên máy chủ trước khi lưu (SQL28).';if(/^(Số TKB|TKB |Bản nháp|Chỉ |Cần |Nhập |Không |Dữ liệu|Dòng )/.test(text))return text;return 'Chưa lưu được TKB. Kiểm tra kết nối và thử lại; bản đang áp dụng được giữ nguyên.';}
  const confirmAction=options=>window.TranPhuDialog.confirm(options);
  async function publish(){
    if(saving)return;summarize();if(validationErrors.length||!parsedRows.length)return;
    let meta;try{meta=metadata();if(!meta)return;}catch(error){msg(el('publishMessage'),error.message,'error');return;}
    const imported=validate(parsedRows).map(row=>({...row})),assignments=parsedAssignments.map(row=>({...row}));
    saving=true;el('publishBtn').disabled=true;el('fileInput').disabled=true;el('timetableMetadataForm').querySelectorAll('input,select').forEach(field=>field.disabled=true);
    try{
      await window.requireTkbAdmin();
      const r=await sb.from('tkb_versions').select('id,version_no,school_year,semester,status,is_active,published_at,updated_at').eq('version_no',meta.version_no);
      if(r.error)throw r.error;
      const matches=(r.data||[]).filter(v=>yearKey(v.school_year)===yearKey(meta.school_year)&&String(v.semester||'').trim()===meta.semester);
      if(matches.length>1)throw Error('Số TKB đang trùng nhiều bản; cần đối chiếu trước khi nạp. Không tạo thêm bản trùng.');
      const old=matches[0];
      if(old&&(old.status!=='draft'||old.is_active||old.published_at))throw Error('Số TKB đã có và đã từng áp dụng. Hãy dùng số khác cho nội dung mới; sửa số/ngày tại bản đã lưu nếu cần đính chính.');
      if(old&&!await confirmAction({title:'Thay nội dung bản nháp?',message:`TKB số ${meta.version_no} đang là bản nháp. Nội dung của bản nháp này sẽ được thay bằng tệp vừa nạp; TKB đang áp dụng được giữ nguyên.`,confirmLabel:'Thay bản nháp'}))return;
      msg(el('publishMessage'),'Đang lưu bản nháp TKB…');
      const saved=await sb.rpc('v4_save_timetable_draft',{meta,entries:imported,assignments,target_version:old?.id||null,expected_updated:old?.updated_at||null});
      if(saved.error)throw saved.error;
      focusedVersion=saved.data.version.id;
      msg(el('publishMessage'),`Đã lưu TKB số ${meta.version_no}, áp dụng từ ${meta.effective_date.split('-').reverse().join('/')}. Chọn “Áp dụng TKB” ở bản đã lưu khi muốn sử dụng.`,'ok');
      parsedRows=[];parsedAssignments=[];el('fileInput').value='';el('fileSummary').hidden=true;el('versionNoInput').value='';el('effectiveDateInput').value='';await loadVersions();
    }catch(error){msg(el('publishMessage'),friendlyError(error),'error');}
    finally{saving=false;el('fileInput').disabled=false;el('timetableMetadataForm').querySelectorAll('input,select').forEach(field=>field.disabled=false);summarize();}
  }
  el('publishBtn').addEventListener('click',publish);

  let versionsRevision=0;
  function syncLabel(version,state,readError,live){
    if(version.status!=='published'&&!version.published_at&&!version.is_active)return '';
    if(!version.is_active)return '<small class="muted">Bản lưu · Không áp dụng phân công hiện tại</small>';
    const status=readError||live?.error?'unknown':live?.data?.partial?'pending':state?.status||'unknown',preview=live?.data;
    let text=status==='synced'?'Phân công đã đồng bộ':status==='pending'?'Phân công chờ đối chiếu':'Chưa kiểm tra được phân công';
    let reason=readError||live?.error?'Chưa đọc được đối chiếu hiện tại. Bấm Làm mới để thử lại.':state?.reason||'';
    if(preview&&!readError&&!live?.error){
     const changes=(preview.added||[]).length+(preview.removed||[]).length;
     if(preview.reason){text='Cần đối chiếu phân công';reason=preview.reason;}
     else if(preview.partial){text=changes?'Có tài khoản đã liên kết cần đồng bộ':'Các tài khoản đã liên kết đang khớp TKB';reason='Còn giáo viên chưa có tài khoản liên kết. Chỉ đồng bộ phần đã xác minh, chưa thu hồi quyền cũ.';}
     else if(changes){text='Có thay đổi phân công cần áp dụng';reason=`Thêm ${(preview.added||[]).length} · Thu hồi ${(preview.removed||[]).length} quyền tự động`;}
     else{text='Quyền đã khớp với TKB đang công bố';reason='';}
    }
    const action=preview?.reason||preview?.partial||(preview?.added||[]).length||(preview?.removed||[]).length||!preview;
    return `<div class="version-sync" data-sync-status="${escapeHtml(status)}" role="status"><small><strong>${escapeHtml(text)}</strong></small>${reason?`<small>${escapeHtml(reason)}</small>`:''}${state?.updated_at?`<small>Lần áp dụng gần nhất: ${escapeHtml(new Date(state.updated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}</small>`:''}${action?'<a class="secondary-btn" href="/?page=admin#syncTkb" target="_top">Đối chiếu phân công</a>':''}</div>`;
  }

  async function loadYearPreflight(revision,versions=[]){
    let notice=el('schoolYearPreflight');if(!notice){notice=document.createElement('div');notice.id='schoolYearPreflight';notice.className='form-message';el('versionsList').insertAdjacentElement('beforebegin',notice);}
    const{data,error}=await sb.rpc('v4_school_year_preflight');if(revision!==versionsRevision)return;
    notice.hidden=!error&&!data?.invalid_rows;
    if(error){notice.className='form-message error';notice.textContent='Chưa kiểm kê được năm học. Kiểm tra kết nối và bản cập nhật cơ sở dữ liệu trước khi chuyển dữ liệu cũ.';return;}
    const invalid=(data?.inventory||[]).filter(row=>!row.canonical);
    const current=versions.find(v=>v.is_active&&v.status==='published'),legacy=versions.filter(v=>!window.TranPhuSchoolYear.isCanonical(v.school_year));
    const legacyOnly=!!current&&window.TranPhuSchoolYear.isCanonical(current.school_year)&&invalid.every(row=>row.table==='tkb_versions')&&legacy.length===Number(data?.invalid_rows||0)&&legacy.every(v=>!v.is_active);
    notice.className='form-message '+(legacyOnly?'warning':'error');
    const heading=legacyOnly?`TKB đang dùng có năm học đúng chuẩn. Có ${legacy.length} phiên bản cũ cần đối chiếu.`:`Cần đối chiếu ${Number(data?.invalid_rows||0)} dòng có năm học chưa đúng chuẩn.`;
    notice.innerHTML=`<strong>${heading}</strong><details><summary>Xem kết quả kiểm kê</summary><ul>${invalid.map(row=>`<li>${escapeHtml(row.table)}: ${escapeHtml(row.school_year??'(trống)')} · ${Number(row.row_count)} dòng${row.canonical_candidate?' → '+escapeHtml(row.canonical_candidate):''}</li>`).join('')}</ul>${data?.variants?.length?'<p>Các cách viết năm học đang khác nhau. Không tự gộp phiên bản hoặc lịch sử học sinh.</p>':''}<p>Kết quả chỉ đọc. Chưa thay đổi năm học hoặc lịch sử học sinh.</p></details>`;
  }
  async function loadVersions(){
    const revision=++versionsRevision,versions=[],archiveWasOpen=!!el('versionsList').querySelector('.version-archive[open]');
    try{
      for(let start=0;start<10000;start+=1000){const r=await sb.from('tkb_versions').select('id,version_name,version_no,school_year,semester,effective_date,status,is_active,published_at,created_at,updated_at').order('id').range(start,start+999);if(r.error)throw r.error;versions.push(...r.data||[]);if((r.data||[]).length<1000)break;}
      if(revision!==versionsRevision)return;
      knownVersions=versions;
      const group=v=>yearKey(v.school_year)+'|'+String(v.semester||'').trim(),maximum=new Map(),counts=new Map();
      for(const v of versions){maximum.set(group(v),Math.max(maximum.get(group(v))||0,Number(v.version_no)||0));const k=group(v)+'|'+v.version_no;counts.set(k,(counts.get(k)||0)+1);}
      versions.sort((a,b)=>yearKey(b.school_year).localeCompare(yearKey(a.school_year))||String(b.semester).localeCompare(String(a.semester),'vi',{numeric:true})||Number(b.version_no)-Number(a.version_no)||String(b.created_at).localeCompare(String(a.created_at)));
      const ids=versions.map(v=>v.id),sync=ids.length?await sb.from('v4_tkb_sync_state').select('version_id,status,reason,updated_at').in('version_id',ids):{data:[]};
      if(revision!==versionsRevision)return;
      const states=new Map((sync.data||[]).map(state=>[state.version_id,state])),current=versions.find(v=>v.is_active),live=current?await sb.rpc('v4_preview_published_tkb'):null;
      if(revision!==versionsRevision)return;
      const item=v=>{
        const canonical=window.TranPhuSchoolYear.isCanonical(v.school_year),due=!!v.effective_date&&v.effective_date<=today(),reason=!canonical?'Cần đối chiếu năm học':!v.effective_date?'Cần nhập ngày áp dụng':!due?'Chưa đến ngày áp dụng':'',duplicate=(counts.get(group(v)+'|'+v.version_no)||0)>1;
        return `<div class="version-item" data-version-id="${escapeHtml(v.id)}" data-version-number="${Number(v.version_no)||0}"><div class="version-info"><strong>${escapeHtml(versionTitle(v))}</strong>${v.version_no===maximum.get(group(v))?'<span class="version-number-note">Số cao nhất trong học kỳ</span>':''}<small>${escapeHtml(v.school_year||'')} · ${escapeHtml(v.semester||'')} · Áp dụng từ ${v.effective_date?escapeHtml(v.effective_date.split('-').reverse().join('/')):'chưa nhập'}</small>${duplicate?'<small class="version-warning">Có nhiều bản cùng số; cần đối chiếu, không tự gộp dữ liệu.</small>':''}${v.version_name&&v.version_name!==('Số '+v.version_no)?`<small class="version-warning">Tên cũ: ${escapeHtml(v.version_name)} · Dùng “Sửa số / ngày” để xác nhận.</small>`:''}${!v.is_active?`<small>${v.status==='draft'?'Bản nháp · Chưa áp dụng':'Bản lưu'}${!due&&v.effective_date?' · Chờ ngày áp dụng':''}</small><details class="version-id"><summary>Thông tin bản lưu</summary><small>Mã: ${escapeHtml(v.id.slice(-8))} · Tạo ${escapeHtml(new Date(v.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}))}</small></details>`:''}${syncLabel(v,states.get(v.id),sync.error,v.is_active?live:null)}</div><div class="version-actions">${v.is_active?'<span class="badge active">Đang áp dụng</span>':`<button class="secondary-btn" data-activate="${escapeHtml(v.id)}" ${reason?'disabled title="'+escapeHtml(reason)+'"':''}>${reason||'Áp dụng TKB'}</button>`}<button type="button" class="secondary-btn" data-edit-version="${escapeHtml(v.id)}">Sửa số / ngày</button></div></div>`;
      };
      const other=versions.filter(v=>!v.is_active);
      el('versionsList').innerHTML=versions.length?(current?item(current):'<p>Chưa có TKB được quản trị xác nhận áp dụng.</p>')+(other.length?`<details class="version-archive" ${focusedVersion||archiveWasOpen?'open':''}><summary>${other.length} bản chờ / bản lưu · Sắp theo số TKB giảm dần</summary>${other.map(item).join('')}</details>`:''):'<div class="muted">Chưa có bản TKB nào.</div>';
      if(focusedVersion){el('versionsList').querySelector(`[data-version-id="${focusedVersion}"]`)?.scrollIntoView({block:'nearest',behavior:'auto'});focusedVersion='';}
      suggestNumber();await loadYearPreflight(revision,versions);
    }catch(error){if(revision===versionsRevision)el('versionsList').textContent='Chưa tải được các bản TKB. Bấm Làm mới để thử lại.';}
  }
  function suggestNumber(){if(el('versionNoInput').value)return;const same=knownVersions.filter(v=>yearKey(v.school_year)===yearKey(el('schoolYearInput').value)&&v.semester===el('semesterInput').value);el('versionNoInput').value=String(Math.max(0,...same.map(v=>Number(v.version_no)||0))+1);}
  el('schoolYearInput').addEventListener('change',()=>{el('versionNoInput').value='';suggestNumber();});el('semesterInput').addEventListener('change',()=>{el('versionNoInput').value='';suggestNumber();});
  function editMetadata(version){
    const content=document.createElement('div');content.className='timetable-metadata-editor';content.innerHTML=`<p>${escapeHtml(version.school_year||'')} · ${escapeHtml(version.semester||'')}</p><form id="editTkbMetadata"><label>TKB số<input id="editTkbNumber" type="number" min="1" max="9999" step="1" value="${Number(version.version_no)||1}" required></label><label>Ngày áp dụng<input id="editTkbDate" type="date" min="2000-01-01" max="2100-12-31" value="${escapeHtml(version.effective_date||'')}" required></label><p id="editTkbMessage" role="alert" hidden></p><button id="saveTkbMetadata" class="primary-btn" type="submit">Lưu thông tin</button></form>`;
    const field=id=>content.querySelector('#'+id);
    const modal=window.TranPhuDialog.content({title:'Sửa số / ngày áp dụng',content,initialFocus:'#editTkbNumber'});let busy=false;
    content.querySelector('form').onsubmit=async event=>{event.preventDefault();if(busy||!event.target.reportValidity())return;busy=true;modal.setBusy(true);field('saveTkbMetadata').disabled=true;field('editTkbMessage').hidden=true;
      try{const r=await sb.rpc('v4_set_timetable_metadata',{target_version:version.id,num:Number(field('editTkbNumber').value),applies:field('editTkbDate').value,expected_updated:version.updated_at});if(r.error)throw r.error;modal.close(true);focusedVersion=version.id;if(version.is_active)window.TkbIntegration?.announce({versionId:version.id});await loadVersions();msg(el('publishMessage'),'Đã cập nhật số và ngày áp dụng; nội dung TKB được giữ nguyên.','ok');}
      catch(error){field('editTkbMessage').textContent=friendlyError(error);field('editTkbMessage').hidden=false;}
      finally{busy=false;modal.setBusy(false);if(field('saveTkbMetadata'))field('saveTkbMetadata').disabled=false;}
    };
  }
  el('refreshVersionsBtn').addEventListener('click',loadVersions);
  window.addEventListener('tkb:published',()=>{if(approvedUser)loadVersions();});
  let activating=false;
  el('versionsList').addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit-version]');if(edit){const v=knownVersions.find(v=>v.id===edit.dataset.editVersion);if(v)editMetadata(v);return;}
    const b=e.target.closest('[data-activate]');if(!b||b.disabled||activating)return;const version=knownVersions.find(v=>v.id===b.dataset.activate);if(!version)return;
    activating=true;b.disabled=true;
    try{
      const current=await sb.from('tkb_versions').select('id,version_no').eq('is_active',true).maybeSingle();if(current.error)throw current.error;
      const lower=current.data&&Number(version.version_no)<Number(current.data.version_no)?' Bản này có số thấp hơn bản đang dùng.':'';
      if(!await confirmAction({title:'Áp dụng '+versionTitle(version)+'?',message:`Toàn trường sẽ sử dụng ${versionTitle(version)}, ngày áp dụng ${version.effective_date.split('-').reverse().join('/')}. Phân công giáo viên được đối chiếu và đồng bộ theo bản này.${lower}`,confirmLabel:'Xác nhận áp dụng'}))return;
      const applied=await sb.rpc('v4_activate_timetable',{target_version:version.id,expected_updated:version.updated_at,expected_current:current.data?.id||''});if(applied.error)throw applied.error;
      window.TkbIntegration?.announce({versionId:version.id});const sync=applied.data.sync;msg(el('publishMessage'),sync?.partial?'Đã áp dụng TKB và đồng bộ tài khoản đã liên kết; còn tài khoản đang chờ.':sync?.applied?'Đã áp dụng TKB và đồng bộ phân công.':'Đã áp dụng TKB. Phân công chờ đối chiếu: '+(sync?.reason||''),'ok');await loadVersions();
    }catch(error){await alertPortal(friendlyError(error));}finally{activating=false;if(b.isConnected)b.disabled=false;}
  });
  sessionCheck();
})();
