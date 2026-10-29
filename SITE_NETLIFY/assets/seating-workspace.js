/* Seating operations use a server snapshot and one atomic, repeatable command. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 const cell=seat=>[seat.group_no,seat.desk_no,seat.seat_no].join(':'),position=key=>{const [group_no,desk_no,seat_no]=key.split(':').map(Number);return {group_no,desk_no,seat_no};};
 const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').trim();
 let c,key='',snapshot=null,source=null,target=null,busy=false,reading=false,attempt=null,last=null,tab='unseated',serial=0,demoRevision=0;
 function current(){return c&&c.currentKey()===key&&document.body.dataset.page==='homeroom';}
 function student(id){return c.students().find(s=>s.id===id);}
 function seatOf(id){return c.seats().find(s=>s.student_id===id);}
 function label(where){const p=typeof where==='string'?position(where):where;return 'Tổ '+p.group_no+' · Bàn '+p.desk_no+' · Chỗ '+p.seat_no;}
 function message(text,error=false){$('seatingMessage').textContent=text;$('seatingMessage').classList.toggle('error',error);}
 function paintMap(){
  document.querySelectorAll('#seatingEditor [data-seat]').forEach(button=>{const on=!!source&&button.dataset.student===source;button.classList.toggle('seat-source',on);button.classList.toggle('seat-target',button.dataset.seat===target);button.setAttribute('aria-pressed',String(on));button.disabled=busy||reading||!snapshot;});
 }
 function paint(){
  if(!c)return;$('seatingRosterToggle').setAttribute('aria-expanded',String(!$('seatingRoster').hidden));const name=source?student(source)?.full_name:'',occupied=new Set(c.seats().map(s=>s.student_id));
  $('seatingCount').textContent=occupied.size+'/'+c.students().length+' học sinh';
  $('seatingSelection').hidden=!source&&!target;$('seatingSelection').textContent=name?name+' · Chọn ghế trống để chuyển hoặc học sinh khác để đổi chỗ.':'Chọn học sinh hoặc ghế trống để xếp chỗ.';
  $('seatingCancel').hidden=!source&&!target;$('seatingRemove').hidden=!source||!seatOf(source);$('seatingUndo').hidden=!last||!snapshot||snapshot.revision!==last.applied_revision;
  $('seatingSwapPanel').hidden=!source||!target||!c.seats().some(s=>cell(s)===target&&s.student_id!==source);
  if(!$('seatingSwapPanel').hidden){const other=c.seats().find(s=>cell(s)===target),old=seatOf(source);$('seatingSwapText').textContent=old?name+' ('+label(old)+') ↔ '+student(other.student_id)?.full_name+' ('+label(other)+')':name+' thay '+student(other.student_id)?.full_name+' tại '+label(other)+'. Học sinh được thay trở về Chưa xếp.';}
  $('seatingRetry').hidden=!attempt||busy;$('seatingRefresh').disabled=busy||reading;
  for(const id of ['seatingCancel','seatingRemove','seatingUndo','seatingSwap','seatingRetry','confirmLayout','seatingClass']){const e=$(id);if(e)e.disabled=busy||reading||(id==='confirmLayout'&&c.confirmed());}
  $('deskControls').inert=$('rotationSettings').inert=busy||reading;$('seatingWorkArea').setAttribute('aria-busy',String(busy||reading));
  paintRoster();paintMap();measure();
 }
 function paintRoster(){
  const query=norm($('seatingSearch').value),occupied=new Set(c.seats().map(s=>s.student_id));
  const list=c.students().filter(s=>(tab==='all'||!occupied.has(s.id))&&(!query||norm(s.full_name).includes(query)||norm(s.student_code).includes(query)));
  $('seatingRosterTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rosterTab===tab)));
  $('unseated').innerHTML=list.map(s=>{const where=seatOf(s.id);return '<button type="button" data-seating-student="'+esc(s.id)+'" aria-pressed="'+(s.id===source)+'" '+(busy||reading||!snapshot?'disabled':'')+'><strong>'+esc(s.full_name)+'</strong><small>'+esc(where?label(where):'Chưa xếp chỗ')+'</small></button>';}).join('')||'<p class="muted">'+(query?'Không tìm thấy học sinh.':tab==='all'?'Lớp chưa có học sinh.':'Tất cả học sinh đã có chỗ.')+'</p>';
 }
 function measure(){requestAnimationFrame(()=>{const v=$('seatingViewport');if(!v||!current()||$('homeroomPage').classList.contains('seating-expanded'))return;const bottom=(window.visualViewport?.height||innerHeight)-parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tp-bottom-nav-height')||0)-34;const height=Math.max(260,bottom-v.getBoundingClientRect().top-window.scrollY)+'px';if(v.style.getPropertyValue('--seating-map-height')!==height){const keep=c.mapOffset();v.dataset.positionReady='false';v.style.setProperty('--seating-map-height',height);requestAnimationFrame(()=>c.restoreMap(keep));}});}
 function demoSnapshot(){return {revision:'demo-'+demoRevision,desk_counts:c.layout(),is_confirmed:c.confirmed(),seats:c.seats().map(s=>({...s})),students:c.students()};}
 async function refresh(){
  if(busy||reading||!current())return;const request=++serial,owner=key,context=c;
  reading=true;paint();message('Đang đối chiếu sơ đồ…');
  try{
   if(!context.online())throw Error('Đang xem bản đã lưu. Cần kết nối để thay đổi sơ đồ.');
   const data=context.demo?demoSnapshot():await context.read();
   if(owner!==key||request!==serial||context.currentKey()!==owner)return;
   snapshot=data;attempt=null;source=target=null;if(last&&data.revision!==last.applied_revision)last=null;
   context.apply(data);message('');
  }catch(error){if(owner===key&&request===serial){snapshot=null;message(/function|schema cache|PGRST202/i.test(error.message||'')?'Chức năng chuyển/đổi chỗ cần được cập nhật trên máy chủ. Bạn vẫn xem được sơ đồ.':error.message||'Chưa đối chiếu được sơ đồ. Hãy thử lại.',true);}}
  finally{if(owner===key&&request===serial){reading=false;paint();}}
 }
 async function send(changes,undoOf=null){
  if(busy||reading||!current())return;if(!c.online())return message('Cần kết nối để lưu thay đổi chỗ ngồi.',true);
  if(!snapshot)return message('Làm mới sơ đồ trước khi đổi chỗ.',true);
  const owner=key,context=c,keep=context.mapOffset(),command=attempt||{p_action_id:crypto.randomUUID(),p_expected_revision:snapshot.revision,p_changes:changes,p_undo_of:undoOf};attempt=command;
  busy=true;paint();message('Đang lưu chỗ ngồi…');
  try{
   let data;
   if(context.demo){
    if(command.p_expected_revision!==snapshot.revision)throw Error('Sơ đồ đã thay đổi. Hãy làm mới.');
    const edits=undoOf?last?.before:changes;if(!edits)throw Error('Không còn thao tác để hoàn tác.');
    const seats=context.seats().filter(s=>!edits.some(x=>cell(x)===cell(s)));
    for(const edit of edits)if(edit.student_id)seats.push({...edit});
    data={...demoSnapshot(),seats,is_confirmed:false,revision:'demo-'+(++demoRevision),action_id:command.p_action_id,applied_revision:'demo-'+demoRevision,undoable:!undoOf};
   }else data=await context.write(command);
   if(owner!==key||context.currentKey()!==owner)return;
   const before=(command.p_changes||[]).map(x=>({...x,student_id:context.seats().find(s=>cell(s)===cell(x))?.student_id||null}));
   last=data.undoable?{action_id:data.action_id,applied_revision:data.applied_revision,before}:null;
   snapshot=data;attempt=null;source=target=null;if(innerWidth<=900)$('seatingRoster').hidden=true;context.apply(data);await context.saved();
   if(owner===key&&context.currentKey()===owner){message(undoOf?'Đã hoàn tác chỗ ngồi.':'Đã lưu chỗ ngồi · Cần chốt lại sơ đồ.');context.notice('Đã lưu chỗ ngồi');const focusCell=command.p_changes?.[0];if(focusCell)requestAnimationFrame(()=>document.querySelector('#seatingEditor [data-seat="'+cell(focusCell)+'"]')?.focus({preventScroll:true}));}
  }catch(error){if(owner===key&&context.currentKey()===owner)message((error.message||'Chưa nhận được xác nhận lưu.')+' Có thể thử lại đúng thao tác hoặc làm mới để đối chiếu.',true);}
  finally{if(owner===key){busy=false;paint();requestAnimationFrame(()=>requestAnimationFrame(()=>{if(owner===key)context.restoreMap(keep);}));}}
 }
 function chooseStudent(id,locate=true){
  if(busy||reading||attempt||!snapshot)return;if(!student(id))return;
  if(target&&!c.seats().some(s=>cell(s)===target)){
   const old=seatOf(id),edits=[{...position(target),student_id:id}];if(old)edits.unshift({...position(cell(old)),student_id:null});source=id;return send(edits);
  }
  source=id;target=null;if(seatOf(id)&&locate)c.locate(id);if(innerWidth<=900)$('seatingRoster').hidden=true;paint();
 }
 function seat(where){
  if(busy||reading||attempt||!snapshot)return;
  const occupant=c.seats().find(s=>cell(s)===where);
  if(!source){if(occupant)return chooseStudent(occupant.student_id,false);target=where;$('seatingRoster').hidden=false;message('Chọn học sinh cho '+label(where)+'.');$('seatingSearch').focus({preventScroll:true});paint();return;}
  const old=seatOf(source);if(old&&cell(old)===where){source=target=null;paint();return;}
  target=where;
  if(occupant){if(!old){target=null;message('Chọn ghế trống cho học sinh chưa xếp chỗ.',true);paint();return;}paint();$('seatingSwap').focus({preventScroll:true});return;}
  const changes=[{...position(where),student_id:source}];if(old)changes.unshift({...position(cell(old)),student_id:null});send(changes);
 }
 function bind(){
  $('seatingSearch').oninput=paintRoster;$('unseated').onclick=e=>{const b=e.target.closest('[data-seating-student]');if(b)chooseStudent(b.dataset.seatingStudent);};
  $('seatingRosterTabs').onclick=e=>{const b=e.target.closest('[data-roster-tab]');if(b){tab=b.dataset.rosterTab;paintRoster();}};
  $('seatingRosterToggle').onclick=()=>{$('seatingRoster').hidden=!$('seatingRoster').hidden;$('seatingRosterToggle').setAttribute('aria-expanded',String(!$('seatingRoster').hidden));measure();};
  $('seatingExpand').onclick=()=>{const keep=c.mapOffset();const on=$('homeroomPage').classList.toggle('seating-expanded');$('seatingExpand').textContent=on?'Thu gọn sơ đồ':'Mở rộng sơ đồ';$('seatingExpand').setAttribute('aria-pressed',String(on));document.body.classList.toggle('seating-focus',on);c.renderMap();paint();requestAnimationFrame(()=>requestAnimationFrame(()=>c.restoreMap(keep)));};
  $('seatingCancel').onclick=()=>{if(busy)return;source=target=null;message('');paint();};
  $('seatingRemove').onclick=()=>{const old=seatOf(source);if(old)send([{...position(cell(old)),student_id:null}]);};
  $('seatingUndo').onclick=()=>{if(last)send(null,last.action_id);};
  $('seatingSwap').onclick=()=>{const old=seatOf(source),other=c.seats().find(s=>cell(s)===target);if(!other)return;const changes=[{...position(target),student_id:source}];if(old)changes.unshift({...position(cell(old)),student_id:other.student_id});send(changes);};
  $('seatingRetry').onclick=()=>{if(attempt)send(attempt.p_changes,attempt.p_undo_of);};$('seatingRefresh').onclick=refresh;
  document.addEventListener('keydown',e=>{if(e.key!=='Escape'||!current()||busy||document.querySelector('dialog[open]'))return;if(source||target){source=target=null;message('');paint();}else if($('homeroomPage').classList.contains('seating-expanded'))$('seatingExpand').click();});
  new MutationObserver(()=>{if(document.body.dataset.page!=='homeroom'){document.body.classList.remove('seating-focus');$('homeroomPage').classList.remove('seating-expanded');$('seatingExpand').textContent='Mở rộng sơ đồ';$('seatingExpand').setAttribute('aria-pressed','false');source=target=null;}}).observe(document.body,{attributes:true,attributeFilter:['data-page']});
  addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
  document.addEventListener('tranphu:roster-changed',()=>{snapshot=null;last=null;if(current())refresh();});
 }
 function mount(context){
  c=context;if(!$('seatingWorkArea').dataset.bound){$('seatingWorkArea').dataset.bound='true';bind();$('seatingRoster').hidden=innerWidth<=900;$('seatingRosterToggle').setAttribute('aria-expanded',String(!$('seatingRoster').hidden));}
  if(key!==context.key){key=context.key;++serial;snapshot=null;source=target=null;attempt=last=null;busy=reading=false;$('seatingSearch').value='';}
  $('seatingRefresh').onclick=refresh;paint();if(!snapshot&&!reading&&!busy)refresh();
 }
 function invalidate(){snapshot=null;last=null;source=target=null;if(current())refresh();}
 function suspend(){snapshot=null;last=null;source=target=null;++serial;reading=false;paint();}
 window.TranPhuSeatingWorkspace=Object.freeze({mount,seat,paintMap,invalidate,suspend});
})();
