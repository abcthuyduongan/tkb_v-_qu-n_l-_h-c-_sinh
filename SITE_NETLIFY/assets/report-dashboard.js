/* Visual reports consume only the authorized report response. No extra data fetches. */
((root)=>{'use strict';
 const rows=v=>Array.isArray(v)?v:[],n=v=>Math.max(0,Number(v)||0),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>Number(v).toLocaleString('vi-VN'),short=d=>d.slice(8,10)+'/'+d.slice(5,7);
 const statuses=['present','late','absent','excused'],cats=['positive','concern','health'];
 function model(data={}){
  if(data.permissions?.aggregate!==true)return null;
  const health=data.permissions?.health===true,details=data.details_included!==false;
  const students=rows(data.students),sessions=rows(data.sessions),bySession=new Map(sessions.map(s=>[String(s.id),s]));
  const attendance=rows(data.attendance).filter(a=>bySession.has(String(a.session_id))&&statuses.includes(a.status));
  const observations=rows(data.observations).filter(o=>cats.includes(o.category)&&(health||o.category!=='health'));
  const counts=Object.fromEntries([...statuses,...cats].map(k=>[k,0]));
  const people=new Map(students.map(s=>[String(s.id),{...s,counts:Object.fromEntries([...statuses,...cats].map(k=>[k,details?0:n(s[k])]))}]));
  if(details){
   for(const a of attendance){counts[a.status]++;const p=people.get(String(a.student_id));if(p)p.counts[a.status]++;}
   for(const o of observations){counts[o.category]++;const p=people.get(String(o.student_id));if(p)p.counts[o.category]++;}
  }else for(const p of people.values())for(const k of [...statuses,...cats])counts[k]+=p.counts[k];
  if(!health){counts.health=0;for(const p of people.values())p.counts.health=0;}
  const daily=new Map();
  for(const s of sessions){const date=String(s.lesson_date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
   if(!daily.has(date))daily.set(date,{date,present:0,late:0,absent:0,excused:0,sessions:0});
   const day=daily.get(date);day.sessions++;if(!details)for(const k of statuses)day[k]+=n(s[k]);
  }
  if(details)for(const a of attendance){const day=daily.get(String(bySession.get(String(a.session_id)).lesson_date).slice(0,10));if(day)day[a.status]++;}
  const recorded=statuses.reduce((sum,k)=>sum+counts[k],0),rate=recorded?100*(counts.present+counts.late)/recorded:null;
  return {health,details,counts,people:[...people.values()],sessions,daily:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),recorded,rate};
 }
 function mount(container,data={},options={}){
  container.replaceChildren();const m=model(data);if(!m)return;
  let filter='concern',limit=12;
  const icon=name=>'<svg class="ui-icon" aria-hidden="true"><use href="#i-'+name+'"/></svg>';
  const total=m.counts.positive+m.counts.concern+m.counts.health,pct=total?m.counts.positive/total*100:0,end=total?(m.counts.positive+m.counts.concern)/total*100:0;
  const summaries=[['sessions','Số tiết đã mở',m.sessions.length,'tiết có trên ứng dụng','calendar'],['attendance','Tỷ lệ có mặt',m.rate===null?'—':m.rate.toFixed(1).replace('.',',')+'%','trên lượt đã điểm danh','check'],['positive','Ghi nhận tích cực',m.counts.positive,'lượt trong kỳ','star'],['concern','Học sinh cần hỗ trợ',m.people.filter(p=>p.counts.concern>0).length,'em · không đếm trùng','users']];
  // Bucket long reports by month, medium reports by Monday; keep every day in short ranges.
  const bucket=d=>{if(m.daily.length>45)return d.slice(0,7);if(m.daily.length>7){const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-(x.getUTCDay()+6)%7);return x.toISOString().slice(0,10);}return d;};
  const groups=new Map();for(const d of m.daily){const key=bucket(d.date);if(!groups.has(key))groups.set(key,{key,dates:[],present:0,late:0,absent:0,excused:0});const g=groups.get(key);g.dates.push(d.date);for(const k of statuses)g[k]+=d[k];}
  const chart=[...groups.values()],max=Math.max(1,...chart.map(d=>statuses.reduce((s,k)=>s+d[k],0)));
  const barLabel=k=>k.length===7?k.slice(5,7)+'/'+k.slice(0,4):short(k);
  container.className='report-dashboard';
  container.innerHTML='<div class="rd-stats">'+summaries.map(([key,label,value,unit,i])=>'<button type="button" class="rd-stat" data-rd-filter="'+key+'"><span>'+esc(label)+icon(i)+'</span><strong>'+esc(typeof value==='number'?fmt(value):value)+'</strong><small>'+esc(unit)+'</small></button>').join('')+'</div>'+
   '<p class="rd-data-note">'+(Array.isArray(data.completion)?fmt(rows(data.completion).reduce((n,s)=>n+Number(s.automatic_present||0),0))+' lượt Có mặt tự động, chờ xác nhận · '+rows(data.completion).filter(s=>s.attendance_state!=='confirmed').length+' tiết chưa xác nhận đầy đủ. ':'Trạng thái chờ xác nhận của cả tiết xem trong báo cáo lớp. ')+fmt(m.recorded)+' lượt đã điểm danh. Chưa xác định tỷ lệ hoàn thành do chưa đủ lịch sử sĩ số và số tiết phải học.</p>'+
   '<div class="rd-charts"><section class="rd-panel"><h3>Tình hình điểm danh</h3><p class="rd-unit">Lượt học sinh–tiết · '+(m.daily.length>45?'Theo tháng':m.daily.length>7?'Theo tuần':'Theo ngày có dữ liệu')+'</p><div class="rd-legend"><span class="rd-blue">Có mặt</span><span class="rd-amber">Đi muộn</span><span class="rd-rose">Vắng / có phép</span></div>'+
   (chart.length?'<div class="rd-plot"><div class="rd-axis">'+[max,Math.round(max/2),0].map(x=>'<span>'+fmt(x)+'</span>').join('')+'</div><div class="rd-bars" style="grid-template-columns:repeat('+chart.length+',minmax(32px,1fr))">'+chart.map((g,i)=>'<button type="button" data-rd-day="'+i+'" aria-label="'+esc(barLabel(g.key)+': '+g.present+' có mặt, '+g.late+' muộn, '+(g.absent+g.excused)+' vắng/có phép')+'"><span class="rd-stack"><span style="height:'+g.present/max*100+'%;background:var(--rd-blue)"></span><span style="height:'+g.late/max*100+'%;background:var(--rd-amber)"></span><span style="height:'+(g.absent+g.excused)/max*100+'%;background:var(--rd-rose)"></span></span><span>'+esc(barLabel(g.key))+'</span></button>').join('')+'</div></div>':'<p class="rd-empty">Chưa có tiết học trong khoảng đã chọn.</p>')+'</section>'+
   '<section class="rd-panel"><h3>Tổng hợp ghi nhận</h3><p class="rd-unit">Đếm theo lượt, không phải phân loại học sinh</p><div class="rd-observations"><div class="rd-donut" role="img" aria-label="'+esc(total+' lượt ghi nhận')+'" style="background:'+(total?'conic-gradient(var(--rd-purple) 0% '+pct+'%,var(--rd-amber) '+pct+'% '+end+'%,var(--rd-green) '+end+'% 100%)':'var(--tp-border)')+'"><div><strong>'+fmt(total)+'</strong><small>lượt ghi nhận</small></div></div><div class="rd-breakdown">'+[['positive','Tích cực'],['concern','Cần hỗ trợ'],...(m.health?[['health','Sức khỏe']]:[])].map(([k,label])=>'<button type="button" data-rd-filter="'+k+'"><span class="rd-'+k+'">'+label+'</span><b>'+fmt(m.counts[k])+'</b></button>').join('')+'</div></div>'+(m.health?'':'<p class="rd-unit">Không bao gồm thông tin sức khỏe ngoài phạm vi quyền.</p>')+'</section></div>'+
   '<div class="rd-filters">'+[['absences','Có vắng / có phép'],['late','Đi muộn'],['concern','Cần hỗ trợ'],...(m.health?[['health','Ghi nhận sức khỏe']]:[])].map(([k,label])=>'<button type="button" data-rd-filter="'+k+'" aria-pressed="false">'+label+' <b>'+fmt(m.people.filter(p=>k==='absences'?p.counts.absent+p.counts.excused>0:p.counts[k]>0).length)+'</b> em</button>').join('')+'</div><section class="rd-panel rd-details" aria-live="polite"></section>';
  const detail=container.querySelector('.rd-details');
  function table(headers,records){return '<div class="tableScroller"><table class="reportTable"><thead><tr>'+headers.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+records.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
  function show(dayIndex=null){
   container.querySelectorAll('.rd-filters button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.rdFilter===filter)));
   if(dayIndex!==null||filter==='sessions'){
    const g=dayIndex!==null?chart[dayIndex]:null,lessons=m.sessions.filter(s=>!g||g.dates.includes(String(s.lesson_date).slice(0,10)));
    detail.innerHTML='<h3>'+(g?'Điểm danh · '+esc(barLabel(g.key)):'Các tiết có trên ứng dụng')+'</h3>'+table(['Ngày','Lớp','Tiết','Môn','Lượt đã điểm danh','Chờ xác nhận'],lessons.slice(0,limit).map(s=>[esc(s.lesson_date),esc(s.class_code),esc(s.period_no),esc(s.subject),fmt(m.details?rows(data.attendance).filter(a=>String(a.session_id)===String(s.id)).length:statuses.reduce((v,k)=>v+n(s[k]),0)),(()=>{const state=rows(data.completion).find(r=>r.id===s.id);return state?state.expected===null?'Chưa xác định':fmt(state.missing)+' học sinh':'';})()]))+'<p class="rd-unit">'+lessons.length+' tiết. Số tiết đã mở không phải số tiết phải học.</p>'+(lessons.length>limit?'<button type="button" data-rd-more="'+(dayIndex??'sessions')+'">Xem thêm</button>':'');return;
   }
   const key=filter==='attendance'?'absences':filter,labels={absences:'Học sinh có vắng / có phép',late:'Học sinh đi muộn',positive:'Ghi nhận tích cực',concern:'Học sinh cần hỗ trợ',health:'Ghi nhận sức khỏe'};
   const count=p=>key==='absences'?p.counts.absent+p.counts.excused:p.counts[key],list=m.people.filter(p=>count(p)>0);
   detail.innerHTML='<h3>'+labels[key]+'</h3><p class="rd-unit">'+list.length+' học sinh · '+fmt(list.reduce((s,p)=>s+count(p),0))+' lượt</p>'+(!list.length?'<p>Chưa có ghi nhận trong khoảng đã chọn.</p>':table(['Học sinh','Lớp','Số lượt'],list.slice(0,limit).map(p=>['<strong>'+esc(p.full_name)+'</strong><small class="rd-student-code">'+esc(p.student_code)+'</small>',options.onClass?'<button type="button" data-rd-class="'+esc(p.class_code)+'">'+esc(p.class_code)+'</button>':esc(p.class_code),fmt(count(p))])))+'<p class="rd-unit">'+(key==='health'?'Ghi nhận sức khỏe không đồng nghĩa ốm hoặc nghỉ học.':key==='absences'?'Không tự suy nghỉ cả ngày hoặc cúp tiết từ lượt vắng.':'Một học sinh có thể có nhiều lượt ghi nhận.')+'</p>'+(list.length>limit?'<button type="button" data-rd-more="people">Xem thêm</button>':'');
  }
  container.onclick=e=>{const b=e.target.closest('button');if(!b||!container.contains(b))return;
   if(b.dataset.rdFilter){filter=b.dataset.rdFilter;limit=12;show();}
   else if(b.dataset.rdDay!==undefined){limit=12;show(Number(b.dataset.rdDay));}
   else if(b.dataset.rdMore){limit+=12;show(/^\d+$/.test(b.dataset.rdMore)?Number(b.dataset.rdMore):null);}
   else if(b.dataset.rdClass)options.onClass?.(b.dataset.rdClass);
  };show();
 }
 root.TranPhuReportDashboard=Object.freeze({model,mount});
})(typeof window==='undefined'?globalThis:window);
