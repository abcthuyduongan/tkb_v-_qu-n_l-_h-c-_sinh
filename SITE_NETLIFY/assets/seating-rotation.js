/* One weekly projection shared by preview and teacher attendance. Reference seats never move. */
(function(root){'use strict';
 const DAY=86400000,mod=(n,m)=>(n%m+m)%m;
 const empty=()=>({enabled:false,start_date:null,horizontal:'none',horizontal_groups:[],vertical:{}});
 function day(value){const n=Date.parse(String(value)+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw Error('Ngày không hợp lệ');return n;}
 const iso=n=>new Date(n).toISOString().slice(0,10);
 const monday=value=>{const n=day(value);return iso(n-mod(new Date(n).getUTCDay()-1,7)*DAY);};
 const nextMonday=value=>iso(day(monday(value))+7*DAY);
 const display=value=>String(value||'').split('-').reverse().join('/');
 function project(layout,seats,config,date){
  const order=layout.map((_,i)=>i+1),rule=config||empty();
  let steps=0;
  if(rule.enabled&&rule.start_date){steps=Math.max(0,Math.floor((day(monday(date))-day(rule.start_date))/(7*DAY))+1);}
  const groups=[...new Set(rule.horizontal_groups||[])].filter(g=>Number.isInteger(g)&&g>=1&&g<=layout.length).sort((a,b)=>a-b);
  if(steps&&groups.length>=2&&['left','right'].includes(rule.horizontal)){
   const delta=rule.horizontal==='right'?1:-1;
   groups.forEach((group,i)=>{order[groups[mod(i+delta*steps,groups.length)]-1]=group;});
  }
  const positions=seats.map(seat=>{
   const n=Number(layout[seat.group_no-1]),direction=rule.vertical?.[seat.group_no],delta=direction==='up'?1:direction==='down'?-1:0;
   return {...seat,reference_desk_no:seat.desk_no,desk_no:steps&&delta&&n?mod(seat.desk_no-1+delta*steps,n)+1:seat.desk_no};
  });
  return {order,seats:positions,steps,week:monday(date)};
 }
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function mount(container,c){
  if(!container)return;
  const state=c.state,key=[c.year,c.classCode,state?.ready,state?.revision,state?.layout_updated_at,c.layout.join(','),c.confirmed].join('|');
  if(container.dataset.rotationKey===key)return;
  container.dataset.rotationKey=key;
  if(!state?.ready){container.innerHTML='<p class="rotation-message" role="status">Chưa tải được quy luật luân chuyển. Quản trị cần kiểm tra kết nối hoặc cập nhật chức năng.</p><button type="button" class="btn outline" data-rotation-retry>Thử lại</button>';container.querySelector('[data-rotation-retry]').onclick=c.onRefresh;return;}
  const rule=state.config||empty(),today=state.server_today,initialDate=rule.start_date||nextMonday(today);
  container.innerHTML=`<p class="rotation-intro">Mỗi tuần chuyển một dãy hoặc một hàng bàn theo vòng tròn. Tổ không chọn sẽ giữ dãy; hai học sinh cùng bàn chuyển cùng nhau.</p>
   <form class="rotation-form">
    <label class="rotation-enable"><input type="checkbox" name="enabled" ${rule.enabled?'checked':''}> Tự động luân chuyển hằng tuần</label>
    <div class="rotation-fields"><label>Thứ Hai bắt đầu chuyển<input type="date" name="start_date" value="${esc(initialDate)}" required></label><label>Hướng đổi dãy<select name="horizontal"><option value="none">Giữ nguyên dãy</option><option value="left">← Sang trái</option><option value="right">Sang phải →</option></select></label></div>
    <div class="rotation-groups"><div class="rotation-group-head"><span>Tổ</span><span>Đổi dãy</span><span>Hàng bàn trong tổ</span></div>${c.layout.map((count,i)=>{const g=i+1;return `<div class="rotation-group-row"><b>Tổ ${g}<small>${count} bàn</small></b><label class="rotation-group-check"><input type="checkbox" name="horizontal_group" value="${g}" ${(rule.horizontal_groups||[]).includes(g)?'checked':''} aria-label="Tổ ${g} tham gia đổi dãy"></label><label class="rotation-vertical"><span class="rotation-sr">Hướng chuyển hàng bàn tổ ${g}</span><select name="vertical_${g}"><option value="none">Giữ hàng bàn</option><option value="up">Dưới lên ↑</option><option value="down">Trên xuống ↓</option></select></label></div>`;}).join('')}</div>
    <p class="rotation-reference-note">Trái/phải tính theo sơ đồ, nhìn từ bàn giáo viên. Dưới lên: bàn đầu lên một hàng, bàn cuối vòng về đầu; trên xuống theo chiều ngược lại. Tuần bắt đầu chuyển một bước, mỗi thứ Hai tiếp theo thêm một bước.</p>
    <div class="rotation-preview-controls"><label>Xem trước tuần của ngày<input type="date" name="preview_date" value="${esc(today)}"></label><button type="button" class="btn outline" data-rotation-week="-1" aria-label="Xem trước tuần trước">← Tuần</button><button type="button" class="btn outline" data-rotation-week="1" aria-label="Xem trước tuần sau">Tuần →</button></div>
    <div class="rotation-preview" aria-live="polite"></div>
    <p class="rotation-message" role="status"></p><p class="rotation-approval" ${c.confirmed?'hidden':''}>Chốt đủ sơ đồ gốc trước khi bật luân chuyển. Thay tổ/bàn sẽ đặt lại quy luật; sửa chỗ hoặc danh sách học sinh sẽ tạm dừng.</p>
    <div class="rotation-save"><button type="submit" class="btn primary">Lưu quy luật</button><button type="button" class="btn outline" data-rotation-refresh>Làm mới</button><span>Điểm danh của mọi giáo viên dùng quy luật đã lưu.</span></div>
   </form>`;
  const form=container.querySelector('form'),field=name=>form.elements.namedItem(name),message=form.querySelector('.rotation-message'),save=form.querySelector('[type=submit]');
  field('horizontal').value=rule.horizontal||'none';c.layout.forEach((_,i)=>field('vertical_'+(i+1)).value=rule.vertical?.[i+1]||'none');
  function values(){return {enabled:field('enabled').checked,start_date:field('start_date').value||null,horizontal:field('horizontal').value,horizontal_groups:[...form.querySelectorAll('[name=horizontal_group]:checked')].map(input=>Number(input.value)),vertical:Object.fromEntries(c.layout.map((_,i)=>[i+1,field('vertical_'+(i+1)).value]))};}
  function validate(config){
   if(config.start_date&&monday(config.start_date)!==config.start_date)throw Error('Chọn ngày thứ Hai để bắt đầu chuyển.');
   if(!config.enabled)return;
   if(!c.confirmed)throw Error('Chốt đủ sơ đồ gốc trước khi bật luân chuyển.');
   if(!config.start_date)throw Error('Chọn thứ Hai bắt đầu chuyển.');
   if(config.horizontal!=='none'&&config.horizontal_groups.length<2)throw Error('Chọn ít nhất hai tổ để đổi dãy.');
   if(config.horizontal==='none'&&!Object.values(config.vertical).some(direction=>direction!=='none'))throw Error('Chọn hướng đổi dãy hoặc chuyển hàng bàn.');
  }
  function preview(){
   const target=form.querySelector('.rotation-preview');
   try{
    const config=values();validate(config);
    const result=project(c.layout,c.seats,config,field('preview_date').value||today),byId=new Map(c.students.map(student=>[student.id,student.full_name]));
    target.innerHTML='<h4>Tuần từ '+esc(display(result.week))+' · '+(result.steps?result.steps+' lần chuyển':'Sơ đồ gốc')+'</h4><p class="rotation-draft">Xem trước theo lựa chọn trong biểu mẫu; chỉ áp dụng sau khi lưu.</p><div class="rotation-preview-list">'+result.order.map((g,i)=>{
     const front=result.seats.filter(seat=>seat.group_no===g&&seat.desk_no===1).sort((a,b)=>a.seat_no-b.seat_no),source=front[0]?.reference_desk_no;
     return '<article><strong>Dãy '+(i+1)+' · Tổ '+g+'</strong><span>Bàn đầu'+(source?' ← bàn gốc '+source:'')+'</span><p>'+esc(front.map(seat=>byId.get(seat.student_id)||'Học sinh').join(' · ')||'Chỗ trống')+'</p></article>';
    }).join('')+'</div>';
    message.textContent='';save.disabled=false;
   }catch(error){target.replaceChildren();message.textContent=error.message;save.disabled=true;}
  }
  form.addEventListener('input',preview);form.addEventListener('change',preview);
  form.querySelectorAll('[data-rotation-week]').forEach(button=>button.onclick=()=>{field('preview_date').value=iso(day(monday(field('preview_date').value||today))+Number(button.dataset.rotationWeek)*7*DAY);preview();});
  form.querySelector('[data-rotation-refresh]').onclick=c.onRefresh;
  form.onsubmit=async event=>{
   event.preventDefault();if(save.disabled||form.getAttribute('aria-busy')==='true')return;
   const config=values();try{validate(config);}catch(error){message.textContent=error.message;return;}
   save.disabled=true;form.inert=true;form.setAttribute('aria-busy','true');message.textContent='Đang lưu quy luật…';
   try{await c.onSave(config,state);if(container.dataset.rotationKey===key)message.textContent='Đã lưu quy luật luân chuyển.';}
   catch(error){if(container.dataset.rotationKey===key)message.textContent=error.message||'Chưa lưu được quy luật. Hãy thử lại.';}
   finally{if(save.isConnected){save.disabled=false;form.inert=false;form.removeAttribute('aria-busy');}}
  };
  preview();
 }
 const api=Object.freeze({empty,monday,nextMonday,project,mount});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.TranPhuSeatingRotation=api;
})(typeof globalThis!=='undefined'?globalThis:this);
