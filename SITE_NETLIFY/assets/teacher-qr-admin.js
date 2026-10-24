(()=>{
const sb=window.TkbAdminClient,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const section=document.createElement('section');section.className='admin-card';section.innerHTML='<h2>Bảng QR giáo viên</h2><p>Mỗi mã giáo viên có một QR cho tất cả môn. Gán mã giáo viên cố định trong từng tài liệu trước khi in.</p><label class="field">Năm học<input id="qrSchoolYear" value="2026-2027"></label><button id="previewTeacherQr" class="secondary-btn">Xem trước danh sách QR</button><button id="printAllTeacherQr" class="primary-btn" disabled>In / lưu PDF bảng QR</button><p id="teacherQrMessage" role="status"></p><div id="qrPreview"></div>';$('adminWorkspace').append(section);
const sheet=document.createElement('section');sheet.className='teacher-qr-sheet';document.body.append(sheet);let preparedYear='';
async function readAll(table,query){const result=[];for(let offset=0;;offset+=1000){const {data,error}=await query(sb.from(table).select('*')).range(offset,offset+999);if(error)throw error;result.push(...data);if(data.length<1000)return result;}}
$('qrSchoolYear').oninput=()=>{$('printAllTeacherQr').disabled=true;};
$('previewTeacherQr').onclick=async()=>{const button=$('previewTeacherQr');button.disabled=true;$('printAllTeacherQr').disabled=true;try{
 await window.requireTkbAdmin();const year=$('qrSchoolYear').value.trim();if(!/^\d{4}-\d{4}$/.test(year))throw Error('Năm học dùng dạng 2026-2027.');
 const plans=await readAll('tkb_plans',q=>q.eq('published',true).eq('school_year',year).order('id'));
 const teachers=new Map();for(const p of plans){const id=p.teacher_id||String(p.teacher_name).trim().toLocaleLowerCase('vi').normalize('NFC').replace(/[^\p{L}\p{N}]/gu,'');if(teachers.has(id)&&teachers.get(id)!==p.teacher_name)throw Error('Mã '+id+' được gán cho hai tên khác nhau. Kiểm tra trước khi in.');teachers.set(id,p.teacher_name);}
 preparedYear=year;const rows=[...teachers].sort((a,b)=>a[1].localeCompare(b[1],'vi'));
 $('qrPreview').innerHTML=rows.map(([id,name])=>'<p>'+esc(id)+' · '+esc(name)+'</p>').join('');
 $('teacherQrMessage').textContent=rows.length+' giáo viên có QR. Danh sách lấy từ tài liệu đã công bố; giáo viên chưa có tài liệu chưa có QR.';
 sheet.innerHTML='<header><h1>MÃ QR PHỤ LỤC 3</h1><p>TH & THCS TRẦN PHÚ · '+esc(year)+'</p></header><div class="teacher-qr-grid">'+rows.map(([id,name])=>{const u=new URL('/',location.origin);u.searchParams.set('mode','pdf');u.searchParams.set('id',id);u.searchParams.set('year',year);const qr=qrcode(0,'M');qr.addData(u.href);qr.make();return '<article class="teacher-qr-card"><div class="teacher-qr-code">'+qr.createSvgTag({cellSize:5,margin:24,scalable:true})+'</div><h2>'+esc(name)+'</h2><p>'+esc(id)+' · Quét xem tất cả môn</p></article>';}).join('')+'</div>';
 $('printAllTeacherQr').disabled=!rows.length;
 }catch(e){$('teacherQrMessage').textContent=e.message;}finally{button.disabled=false;}};
$('printAllTeacherQr').onclick=async()=>{try{await window.requireTkbAdmin();if(preparedYear!==$('qrSchoolYear').value.trim())throw Error('Xem trước lại danh sách.');document.body.classList.add('printing-teacher-qr');window.addEventListener('afterprint',()=>document.body.classList.remove('printing-teacher-qr'),{once:true});window.print();}catch(e){$('teacherQrMessage').textContent=e.message;}};
(window.TkbAuth?.subscribe||((callback)=>sb.auth.onAuthStateChange(callback)))((_event,session)=>{if(!session){sheet.innerHTML='';$('qrPreview').innerHTML='';$('printAllTeacherQr').disabled=true;document.body.classList.remove('printing-teacher-qr');}});
})();
