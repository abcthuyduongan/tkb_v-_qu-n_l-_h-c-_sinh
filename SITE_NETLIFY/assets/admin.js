(() => {
  const cfg=window.TKB_CONFIG||{};
  const sb=window.TkbAuth?.client||supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  window.TkbAdminClient=sb;
  const el=id=>document.getElementById(id);
  const alertPortal=async message=>window.TranPhuDialog?window.TranPhuDialog.alert({title:'Chưa thể công bố TKB',message,tone:'danger'}):window.alert(message);
  let parsedRows=[],parsedAssignments=[],validationErrors=[];

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
    const day=Number(field(row,['ThuSo','Thứ số','Thu','Thứ']));
    const period=Number(field(row,['Tiet','Tiết']));
    const classCode=safe(field(row,['Lop','Lớp','class_code']));
    const subject=safe(field(row,['Mon','Môn','subject']))||content.subject;
    const teacherCode=safe(field(row,['GVMa','GV Mã','teacher_code']))||content.teacher_code;
    const teacherName=safe(field(row,['GiaoVien','Giáo viên','teacher_name']));
    const homeroom=safe(field(row,['GVCN','homeroom_teacher']));
    const status=safe(field(row,['TrangThai','Trạng thái','status']))||(subject==='Nghỉ'?'Nghỉ':'Học');
    return{day_no:day,period_no:period,class_code:classCode,subject,teacher_code:teacherCode,teacher_name:teacherName,homeroom_teacher:homeroom,status};
  }
  function metadataFromWorkbook(wb){
    const sheet=wb.Sheets.PCCM||wb.Sheets.PCGD||wb.Sheets.TKB_LOP_S||wb.Sheets[wb.SheetNames[0]];
    const grid=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false});
    const text=grid.flat().map(safe).filter(Boolean).join('\n');
    const first=safe(grid[0]?.[0]),schoolName=first.split(/\r?\n/)[0]||'TH & THCS TRẦN PHÚ';
    const year=text.match(/Năm\s*học\s*(\d{4}\s*[-–]\s*\d{4})/i)?.[1]?.replace(/–/g,'-');
    const semesterNo=Number(text.match(/Học\s*kỳ\s*(\d+)/i)?.[1]||1);
    const versionNo=Number(text.match(/(?:Số|LẦN)\s*(\d+)/i)?.[1]||1);
    const d=text.match(/(?:từ\s*)?ngày\s*(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/i);
    const effectiveDate=d?`${d[3]}-${String(d[2]).padStart(2,'0')}-${String(d[1]).padStart(2,'0')}`:'';
    return{schoolName,year:year||'',semesterNo,versionNo,effectiveDate};
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
  function applyMetadata(meta){
    if(meta.schoolName)el('schoolNameInput').value=meta.schoolName;
    if(meta.year)el('schoolYearInput').value=meta.year;
    el('semesterInput').value=`Học kỳ ${meta.semesterNo}`;
    el('versionNameInput').value=`Số ${meta.versionNo}`;
    if(meta.effectiveDate)el('effectiveDateInput').value=meta.effectiveDate;
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
        if(classRows){parsedRows=classRows;const meta=metadataFromWorkbook(wb);applyMetadata(meta);el('fileSummary').hidden=false;el('fileSummary').innerHTML=`<b>${escapeHtml(file.name)}</b> · Tự nhận ${escapeHtml(meta.year||'năm học')}, Học kỳ ${meta.semesterNo}, Số ${meta.versionNo} · ${parsedRows.length} tiết · ${parsedAssignments.length} giáo viên PCCM`;summarize();return}
        const sheetName=wb.SheetNames.find(n=>n.trim().toUpperCase()==='APP_TKB')||wb.SheetNames[0];rawRows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:''});
      }
      parsedRows=rawRows.map(normalizeRow).filter(r=>Boolean(r.subject)&&normalizeHeader(r.subject)!=='nghi'&&normalizeHeader(r.status)!=='nghi'&&![r.class_code,r.subject,r.teacher_code,r.teacher_name].some(isSpreadsheetError));
      el('fileSummary').hidden=false;el('fileSummary').innerHTML=`<b>${escapeHtml(file.name)}</b> · ${parsedRows.length} dòng được đọc`;summarize();
    }catch(err){el('fileSummary').hidden=false;el('fileSummary').textContent='Không đọc được file: '+err.message}
  }

  async function sessionCheck(){
    const{data:{session}}=await sb.auth.getSession();setSessionUI(session);
    sb.auth.onAuthStateChange((_event,session)=>setTimeout(()=>setSessionUI(session),0));
  }
  let authRevision=0;
  window.requireTkbAdmin=async()=>{const{data,error}=await sb.rpc('is_tkb_admin');if(error||data!==true)throw Error('Tài khoản không có quyền quản trị.');return true;};
  async function setSessionUI(session){const revision=++authRevision;el('adminWorkspace').hidden=true;el('loginCard').hidden=false;el('logoutBtn').hidden=!session;if(!session)return;try{await window.requireTkbAdmin();if(revision!==authRevision)return;el('loginCard').hidden=true;el('adminWorkspace').hidden=false;loadVersions();}catch(e){msg(el('loginMessage'),e.message,'error');}}
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

  async function publish(){
    summarize();if(validationErrors.length||!parsedRows.length)return;
    const valid=validate(parsedRows);
    let year;try{year=canonicalYear(el('schoolYearInput').value);el('schoolYearInput').value=year;}
    catch(error){msg(el('publishMessage'),error.message,'error');el('schoolYearInput').focus();return;}
    const meta={
      version_name:el('versionNameInput').value.trim()||'Số 1',
      version_no:Number(el('versionNameInput').value.match(/\d+/)?.[0]||1),
      school_name:el('schoolNameInput').value.trim()||'TH & THCS TRẦN PHÚ',
      school_year:year,semester:el('semesterInput').value.trim(),
      effective_date:el('effectiveDateInput').value||null,status:'draft',is_active:false
    };
    el('publishBtn').disabled=true;msg(el('publishMessage'),'Đang lưu dữ liệu lên Supabase…');
    const{data:duplicates,error:duplicateError}=await sb.from('tkb_versions').select('id').eq('school_year',meta.school_year).eq('semester',meta.semester).eq('version_no',meta.version_no);
    if(duplicateError){msg(el('publishMessage'),'Không kiểm tra được phiên bản cũ: '+duplicateError.message,'error');el('publishBtn').disabled=false;return}
    const{data:v,error:ve}=await sb.from('tkb_versions').insert(meta).select('id').single();
    if(ve){msg(el('publishMessage'),'Không tạo được phiên bản: '+ve.message,'error');el('publishBtn').disabled=false;return}
    const payload=valid.map(r=>({...r,version_id:v.id}));
    for(let i=0;i<payload.length;i+=400){
      const{error}=await sb.from('tkb_entries').insert(payload.slice(i,i+400));
      if(error){await sb.from('tkb_versions').delete().eq('id',v.id);msg(el('publishMessage'),'Lỗi khi lưu dữ liệu: '+error.message,'error');el('publishBtn').disabled=false;return}
    }
    const assignmentPayload=parsedAssignments.map(r=>({...r,version_id:v.id}));
    if(assignmentPayload.length){const{error}=await sb.from('tkb_assignments').insert(assignmentPayload);if(error){await sb.from('tkb_versions').delete().eq('id',v.id);msg(el('publishMessage'),'Lỗi khi lưu PCCM: '+error.message,'error');el('publishBtn').disabled=false;return}}
    const{data:current,error:currentError}=await sb.from('tkb_versions').select('id').eq('is_active',true).maybeSingle();
    if(currentError){msg(el('publishMessage'),currentError.message,'error');el('publishBtn').disabled=false;return}
    const{data:publication,error:publishError}=await sb.rpc('v4_publish_timetable',{target_version:v.id,expected_current:current?.id||'',sync_permissions:true});
    if(publishError){msg(el('publishMessage'),'Chưa công bố: '+publishError.message,'error');el('publishBtn').disabled=false;return}
    window.TkbIntegration?.announce({versionId:v.id});
    const syncNote=publication.sync?.applied?' Phân công đã đồng bộ.':' Phân công chờ đối chiếu: '+(publication.sync?.reason||'kiểm tra tài khoản');
    const oldIds=(duplicates||[]).map(x=>x.id).filter(id=>id!==v.id);let replaceNote='';
    if(oldIds.length){const{error:removeError}=await sb.from('tkb_versions').update({status:'archived',is_active:false}).in('id',oldIds);replaceNote=removeError?' Bản cũ chưa lưu trữ được: '+removeError.message:` Đã thay thế ${oldIds.length} bản trùng.`}
    msg(el('publishMessage'),`Đã công bố ${payload.length} dòng TKB và ${assignmentPayload.length} dòng PCCM.${replaceNote}${syncNote}`,'ok');parsedRows=[];parsedAssignments=[];summarize();loadVersions();
  }
  el('publishBtn').addEventListener('click',publish);

  let versionsRevision=0;
  function syncLabel(version,state,readError){
    if(version.status!=='published'&&!version.published_at&&!version.is_active)return '';
    const status=readError?'unknown':state?.status||'unknown';
    const text=status==='synced'?'Phân công đã đồng bộ':status==='pending'?'Phân công chờ đối chiếu':'Chưa xác định đồng bộ';
    const reason=readError?'Không đọc được trạng thái. Bấm Làm mới để thử lại; nếu vẫn lỗi, kiểm tra quyền quản trị và cập nhật cơ sở dữ liệu.':state?.reason||
      (status==='unknown'?'Phiên bản này chưa có kết quả đồng bộ được lưu.':'');
    const action=version.is_active&&status!=='synced'?'<small>Mở Quản trị → Đồng bộ TKB, đối chiếu tài khoản và quyền rồi áp dụng.</small><a class="secondary-btn" href="/?page=admin#syncTkb" target="_top">Đối chiếu phân công</a>':'';
    return `<div class="version-sync" data-sync-status="${escapeHtml(status)}" role="status"><small><strong>${escapeHtml(text)}</strong>${state?.updated_at&&!readError?' · '+escapeHtml(new Date(state.updated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})):''}</small>${reason?`<small>${escapeHtml(reason)}</small>`:''}${action}</div>`;
  }
  async function loadYearPreflight(revision){
    let notice=el('schoolYearPreflight');if(!notice){notice=document.createElement('div');notice.id='schoolYearPreflight';notice.className='form-message';el('versionsList').insertAdjacentElement('beforebegin',notice);}
    const{data,error}=await sb.rpc('v4_school_year_preflight');if(revision!==versionsRevision)return;
    notice.hidden=!error&&!data?.invalid_rows;
    if(error){notice.className='form-message error';notice.textContent='Chưa kiểm kê được năm học. Kiểm tra kết nối và bản cập nhật cơ sở dữ liệu trước khi chuyển dữ liệu cũ.';return;}
    notice.className='form-message error';
    const invalid=(data?.inventory||[]).filter(row=>!row.canonical);
    notice.innerHTML=`<strong>Cần đối chiếu ${Number(data?.invalid_rows||0)} dòng có năm học chưa đúng chuẩn.</strong><details><summary>Xem kết quả kiểm kê</summary><ul>${invalid.map(row=>`<li>${escapeHtml(row.table)}: ${escapeHtml(row.school_year??'(trống)')} · ${Number(row.row_count)} dòng${row.canonical_candidate?' → '+escapeHtml(row.canonical_candidate):''}</li>`).join('')}</ul>${data?.variants?.length?'<p>Có nhiều cách viết cùng một năm học; cần đối chiếu khóa và lịch sử trước khi hợp nhất.</p>':''}<p>Kết quả chỉ đọc. Chưa thay đổi năm học hoặc lịch sử học sinh.</p></details>`;
  }
  async function loadVersions(){
    const revision=++versionsRevision;
    const{data,error}=await sb.from('tkb_versions').select('id,version_name,school_year,semester,effective_date,status,is_active,published_at,created_at').order('created_at',{ascending:false}).limit(20);
    if(revision!==versionsRevision)return;
    if(error){el('versionsList').innerHTML=`<div class="muted">${escapeHtml(error.message)}</div>`;return}
    const versions=data||[],ids=versions.map(v=>v.id);
    const sync=ids.length?await sb.from('v4_tkb_sync_state').select('version_id,status,reason,updated_at').in('version_id',ids):{data:[]};
    if(revision!==versionsRevision)return;
    const states=new Map((sync.data||[]).map(state=>[state.version_id,state]));
    el('versionsList').innerHTML=versions.map(v=>`<div class="version-item" data-version-id="${escapeHtml(v.id)}"><div><strong>${escapeHtml(v.version_name||'Phiên bản')}</strong><small>${escapeHtml(v.school_year||'')} · ${escapeHtml(v.semester||'')} · áp dụng ${escapeHtml(v.effective_date||'—')}</small>${syncLabel(v,states.get(v.id),sync.error)}</div><div class="version-actions">${v.is_active?'<span class="badge active">Đang công bố</span>':`<button class="secondary-btn" data-activate="${escapeHtml(v.id)}">Kích hoạt</button>`}</div></div>`).join('')||'<div class="muted">Chưa có phiên bản nào.</div>';
    await loadYearPreflight(revision);
  }
  el('refreshVersionsBtn').addEventListener('click',loadVersions);
  el('versionsList').addEventListener('click',async e=>{
    const b=e.target.closest('[data-activate]');if(!b)return;const id=b.dataset.activate;
    const{data:current,error:readError}=await sb.from('tkb_versions').select('id').eq('is_active',true).maybeSingle();
    if(readError)return await alertPortal(readError.message);
    const{data,error}=await sb.rpc('v4_publish_timetable',{target_version:id,expected_current:current?.id||'',sync_permissions:true});
    if(error)await alertPortal(error.message);else{window.TkbIntegration?.announce({versionId:id});msg(el('publishMessage'),data.sync?.applied?'Đã kích hoạt và đồng bộ phân công.':'Đã kích hoạt. Phân công chờ đối chiếu: '+(data.sync?.reason||''),data.sync?.applied?'ok':'error');loadVersions();}
  });
  sessionCheck();
})();
