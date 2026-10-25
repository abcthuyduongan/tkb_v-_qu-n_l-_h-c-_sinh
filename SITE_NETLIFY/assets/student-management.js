/* Roster maintenance. All writes are authorized again by the database RPC. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const M={key:'',cls:'',rows:[],busy:false,mutating:false,revision:0};
 const context=()=>window.TranPhuStudentsContext?.();
 const key=c=>[c?.user?.id||'demo',c?.demo,c?.admin,c?.year,(c?.homeroomClasses||[]).join('|')].join(':');
 const allowed=c=>!!c&&(c.admin||c.homeroomClasses.includes(M.cls));
 const search=v=>String(v||'').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d');
 const expected=s=>({full_name:s.full_name,gender:s.gender,birth_date:s.birth_date||null,active:s.active});
 const message=(text,error=false)=>{const el=$('studentManagerMessage');el.hidden=!text;el.textContent=text;el.className=error?'student-manager-message error':'student-manager-message';el.setAttribute('role',error?'alert':'status');};
 function errorText(error){
  const text=String(error?.message||'');
  if(error?.code==='PGRST202'||/schema cache|does not exist|Offline schema does not include RPC/i.test(text))return 'Chức năng quản lý học sinh chưa được cập nhật trên máy chủ. Vui lòng liên hệ quản trị.';
  if(error?.code==='42501'||/không có quyền/i.test(text))return 'Bạn không còn quyền quản lý lớp này. Hãy làm mới danh sách hoặc liên hệ quản trị.';
  if(/^(Mã học sinh đã có|Mã, họ tên|Ngày sinh chưa hợp lệ|Năm học hoặc lớp|Thông tin đã được|Không tìm thấy học sinh|Không được thay mã|Hãy khôi phục)/.test(text))return text;
  return 'Chưa kết nối được dịch vụ học sinh. Dữ liệu trên màn hình chưa được xác nhận; vui lòng thử lại.';
 }
 async function readAll(query){const rows=[];for(let start=0;start<50000;start+=1000){const r=await query().range(start,start+999);if(r.error)throw r.error;rows.push(...r.data||[]);if((r.data||[]).length<1000)return rows;}throw new Error('Student list too large');}
 function controls(){const c=context(),locked=M.busy||M.mutating;for(const id of ['studentManagerClass','studentManagerStatus','studentManagerSearch','refreshStudents'])$(id).disabled=locked;$('studentManagerClass').disabled=locked||!$('studentManagerClass').options.length;$('addStudent').disabled=locked||!M.cls||!allowed(c);document.querySelectorAll('#studentDirectory button').forEach(b=>b.disabled=locked);$('studentDirectory').setAttribute('aria-busy',String(locked));}
 function draw(){
  const active=$('studentManagerStatus').value==='active',q=search($('studentManagerSearch').value.trim());
  const rows=M.rows.filter(s=>!!s.active===active&&(!q||search(s.full_name).includes(q)||search(s.student_code).includes(q)));
  const total=M.rows.filter(s=>s.active).length,removed=M.rows.length-total;
  $('studentManagerCount').textContent=M.cls?`Lớp ${M.cls} · ${total} đang học · ${removed} đã xóa khỏi danh sách`:'';
  $('studentDirectory').innerHTML=rows.map(s=>`<article class="managed-student" data-student-row="${esc(s.id)}"><div class="managed-student-info"><h3>${esc(s.full_name)}</h3><p>${esc(s.student_code)} · ${esc(s.gender)}${s.birth_date?' · '+esc(s.birth_date.split('-').reverse().join('/')):''}</p></div><div class="managed-student-actions">${s.active?`<button type="button" class="btn outline" data-student-action="edit" data-student-id="${esc(s.id)}" aria-label="Sửa thông tin ${esc(s.full_name)}">Sửa</button><button type="button" class="btn outline student-remove" data-student-action="remove" data-student-id="${esc(s.id)}" aria-label="Xóa khỏi danh sách ${esc(s.full_name)}">Xóa khỏi danh sách</button>`:`<button type="button" class="btn outline" data-student-action="restore" data-student-id="${esc(s.id)}" aria-label="Khôi phục ${esc(s.full_name)}">Khôi phục</button>`}</div></article>`).join('')||`<div class="student-manager-empty">${M.busy?'Đang tải danh sách…':!M.cls?'Chưa có lớp để quản lý.':q?'Không tìm thấy học sinh phù hợp.':active?'Lớp chưa có học sinh đang học.':'Chưa có học sinh bị xóa khỏi danh sách.'}</div>`;
  controls();
 }
 async function load(){
  const c=context(),cls=M.cls,revision=++M.revision;if(!allowed(c)||!cls){M.rows=[];M.busy=false;draw();return;}
  M.busy=true;M.rows=[];message('');draw();
  try{const rows=c.demo?c.demoStudents.filter(s=>s.school_year===c.year&&s.class_code===cls):await readAll(()=>c.client.from('v4_students').select('id,school_year,class_code,student_code,full_name,gender,birth_date,active').eq('school_year',c.year).eq('class_code',cls).order('full_name').order('id'));
   if(revision!==M.revision||key(context())!==key(c)||M.cls!==cls)return;M.rows=rows;
  }catch(error){if(revision===M.revision)message(errorText(error),true);}finally{if(revision===M.revision){M.busy=false;draw();window.TranPhuHeader?.refresh();}}
 }
 async function open(){
  const c=context();if(!c)return;const nextKey=key(c);if(nextKey!==M.key){M.key=nextKey;M.cls='';M.rows=[];$('studentManagerSearch').value='';$('studentManagerStatus').value='active';}
  let classes=c.admin?[...c.classes]:[...c.homeroomClasses];
  if(c.admin&&!c.demo){try{const rows=await readAll(()=>c.client.from('v4_students').select('class_code').eq('school_year',c.year).order('class_code').order('id'));if(key(context())!==nextKey)return;classes.push(...rows.map(s=>s.class_code));}catch(error){message(errorText(error),true);}}
  classes=[...new Set(classes)].sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
  if(!classes.includes(M.cls))M.cls=classes.includes(c.classCode)?c.classCode:classes[0]||'';
  $('studentManagerClass').innerHTML=classes.map(cls=>`<option value="${esc(cls)}">Lớp ${esc(cls)}</option>`).join('');$('studentManagerClass').value=M.cls;await load();
 }
 async function afterWrite(c,cls,row){
  M.rows=M.rows.filter(s=>s.id!==row.id).concat(row).sort((a,b)=>a.full_name.localeCompare(b.full_name,'vi'));draw();
  document.dispatchEvent(new CustomEvent('tranphu:roster-changed',{detail:{year:c.year,classCode:cls}}));
  try{await window.TranPhuRosterChanged?.({year:c.year,cls,row});}
  catch{message('Đã lưu học sinh. Chưa làm mới được sơ đồ lớp; vui lòng làm mới trang trước khi tiếp tục đánh giá.',true);}
 }
 function editor(row){
  const c=context(),cls=M.cls;if(M.busy||M.mutating||!allowed(c)||!cls)return;
  const old=row?expected(row):null,content=document.createElement('div');content.className='student-editor';
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  content.innerHTML=`<p class="student-form-context">Lớp ${esc(cls)}</p><form id="studentEditorForm"><div class="student-form-grid"><label>Mã học sinh<input id="studentCodeInput" maxlength="50" autocomplete="off" required value="${esc(row?.student_code||'')}" ${row?'readonly':''}></label><label>Họ và tên<input id="studentNameInput" minlength="2" maxlength="120" autocomplete="off" required value="${esc(row?.full_name||'')}"></label><label>Giới tính<select id="studentGenderInput">${['Chưa rõ','Nam','Nữ','Khác'].map(g=>`<option ${g===(row?.gender||'Chưa rõ')?'selected':''}>${g}</option>`).join('')}</select></label><label>Ngày sinh <span>(không bắt buộc)</span><input id="studentBirthInput" type="date" min="1900-01-01" max="${today}" value="${esc(row?.birth_date||'')}"></label></div><p id="studentEditorMessage" role="alert" hidden></p><div class="student-editor-actions"><button type="button" class="btn outline" id="cancelStudentEditor">Hủy</button><button type="submit" class="btn primary" id="saveStudent">Lưu học sinh</button></div></form>`;
  const modal=window.TranPhuDialog.content({title:row?'Sửa thông tin học sinh':'Thêm học sinh',content,initialFocus:row?'#studentNameInput':'#studentCodeInput'}),form=content.querySelector('form');
  content.querySelector('#cancelStudentEditor').onclick=()=>modal.close(false);
  form.onsubmit=async event=>{
   event.preventDefault();if(M.mutating||!form.reportValidity())return;
   const code=$('studentCodeInput').value.trim(),name=$('studentNameInput').value.trim(),sex=$('studentGenderInput').value,born=$('studentBirthInput').value||null;
   const note=$('studentEditorMessage');note.hidden=true;
   if(name.length<2||!code){note.textContent='Nhập mã và họ tên học sinh hợp lệ.';note.hidden=false;return;}
   if(key(context())!==key(c)||!allowed(context())){note.textContent='Quyền quản lý đã thay đổi. Hãy đóng và làm mới danh sách.';note.hidden=false;return;}
   M.mutating=true;modal.setBusy(true);form.querySelectorAll('input,select,button').forEach(e=>e.disabled=true);controls();
   try{let saved;
    if(c.demo){if(!row&&M.rows.some(s=>s.student_code.toLocaleLowerCase()===code.toLocaleLowerCase()))throw new Error('Mã học sinh đã có trong năm học; hãy kiểm tra cả danh sách đã xóa');saved={...row,id:row?.id||'demo-student-'+Date.now(),school_year:c.year,class_code:cls,student_code:code,full_name:name,gender:sex,birth_date:born,active:true};}
    else{const result=await c.client.rpc('v4_save_student',{y:c.year,c:cls,code,fullname:name,sex,born,student:row?.id||null,expected:old});if(result.error)throw result.error;saved=result.data;}
    $('studentManagerStatus').value='active';$('studentManagerSearch').value='';await afterWrite(c,cls,saved);modal.close(true);window.TranPhuDialog.toast(row?'Đã cập nhật học sinh.':'Đã thêm học sinh.');
   }catch(error){note.textContent=errorText(error);note.hidden=false;}
   finally{M.mutating=false;modal.setBusy(false);form.querySelectorAll('input,select,button').forEach(e=>e.disabled=false);controls();if(!modal.dialog.isConnected)$('addStudent').focus({preventScroll:true});}
  };
 }
 async function changeActive(row,on){
  const c=context(),cls=M.cls;if(M.busy||M.mutating||!allowed(c))return;
  M.mutating=true;controls();
  try{
   const accepted=await window.TranPhuDialog.confirm({title:on?'Khôi phục học sinh?':'Xóa học sinh khỏi danh sách?',message:on?`${row.full_name} sẽ trở lại danh sách đang học của lớp ${cls}. GVCN cần xếp lại chỗ ngồi.`:`${row.full_name} sẽ được gỡ khỏi danh sách đang học và chỗ ngồi. Lịch sử điểm danh, nhận xét được giữ lại; có thể khôi phục khi cần.`,confirmLabel:on?'Khôi phục':'Xóa khỏi danh sách',tone:on?'info':'warning'});
   if(!accepted)return;
   if(key(context())!==key(c)||!allowed(context()))throw new Error('Không có quyền quản lý học sinh lớp này');
   let saved;if(c.demo)saved={...row,active:on};else{const result=await c.client.rpc('v4_set_student_active',{y:c.year,c:cls,student:row.id,enabled:on});if(result.error)throw result.error;saved=result.data;}
   await afterWrite(c,cls,saved);window.TranPhuDialog.toast(on?'Đã khôi phục học sinh.':'Đã xóa khỏi danh sách đang học.');
  }catch(error){message(errorText(error),true);}finally{M.mutating=false;controls();$('refreshStudents').focus({preventScroll:true});}
 }
 $('addStudent').onclick=()=>editor();$('refreshStudents').onclick=load;$('studentManagerClass').onchange=()=>{M.cls=$('studentManagerClass').value;$('studentManagerSearch').value='';load();};$('studentManagerStatus').onchange=draw;$('studentManagerSearch').oninput=draw;
 $('studentDirectory').onclick=event=>{const b=event.target.closest('[data-student-action]');if(!b)return;const row=M.rows.find(s=>s.id===b.dataset.studentId);if(!row)return;if(b.dataset.studentAction==='edit')editor(row);else changeActive(row,b.dataset.studentAction==='restore');};
 window.TranPhuStudents=Object.freeze({open});
})();
