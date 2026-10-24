(function(root){
  const periods=value=>String(value).split(',').flatMap(part=>{
    const [a,b=a]=part.trim().split('-').map(Number);
    if(!Number.isInteger(a)||!Number.isInteger(b)||a<1||b<a||b>2000)return [];
    return Array.from({length:b-a+1},(_,i)=>a+i);
  });
  const expand=(doc,lessons)=>lessons.flatMap(lesson=>periods(lesson.TietPPCT).map(period=>({doc,lesson,period})));
  const groupKey=d=>JSON.stringify([d.subject.trim().toLowerCase(),d.classes.split(/[,;]/).map(x=>x.trim().toLowerCase()).sort()]);
  const groups=docs=>{
    const map=new Map();for(const d of docs){const k=groupKey(d);if(!map.has(k))map.set(k,[]);map.get(k).push(d);}
    return [...map.values()].map(g=>g.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id)));
  };
  const calendar=(bundles,week)=>{
    const slots=new Map();
    for(const {doc,lessons,schedule=[]}of bundles)for(const item of schedule){
      if(Number(item.Tuan)!==week)continue;
      const lesson=lessons.find(l=>l.MaBai===item.MaBai&&periods(l.TietPPCT).includes(Number(item.TietPPCT)));
      if(!lesson)continue;
      const key=[item.Buoi,item.TietTKB,item.Thu].join('|');
      if(!slots.has(key))slots.set(key,[]);slots.get(key).push({doc,lesson,item});
    }
    return slots;
  };
  // Allocate only explicitly planned weeks. A multi-week lesson is distributed in
  // PPCT order over the recurring slots of the timetable version the user selected.
  function join(doc,lessons,entries){
    const schedule=[],issues=[],slots=entries.filter(r=>r.status!=='Nghỉ'&&r.subject!=='Nghỉ')
      .sort((a,b)=>Number(a.day_no)-Number(b.day_no)||Number(a.period_no)-Number(b.period_no));
    const classes=[...new Set(slots.map(r=>r.class_code))];
    const plan=lessons.map(lesson=>({lesson,weeks:/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(String(lesson.Tuan||'').trim())?periods(lesson.Tuan).filter(n=>n<=53):[]}));
    for(const p of plan)if(!p.weeks.length)issues.push('Bài '+p.lesson.MaBai+' chưa có tuần dự kiến dạng số.');
    const counts=new Map();for(const {lesson}of plan)for(const p of periods(lesson.TietPPCT))counts.set(p,(counts.get(p)||0)+1);
    if([...counts.values()].some(n=>n>1))return {schedule:[],issues:['Có tiết PPCT trùng giữa các bài trong '+doc.id+'. Cần chỉnh danh mục trước khi ghép lịch.']};
    for(const cls of classes){
      const classSlots=slots.filter(s=>s.class_code===cls),occupied=new Set();
      const items=plan.flatMap(p=>periods(p.lesson.TietPPCT).map(period=>({...p,period}))).sort((a,b)=>a.period-b.period);
      for(const item of items){
        if(!item.weeks.length)continue;
        let placed=false;
        for(const week of [...item.weeks].sort((a,b)=>a-b)){
          for(const slot of classSlots){const k=[week,slot.day_no,slot.period_no].join('|');if(occupied.has(k))continue;
            occupied.add(k);schedule.push({MaTaiLieu:doc.id,MaBai:item.lesson.MaBai,TietPPCT:item.period,Tuan:week,Thu:Number(slot.day_no),Buoi:'SANG',TietTKB:Number(slot.period_no),Lop:cls});placed=true;break;}
          if(placed)break;
        }
        if(!placed)issues.push(cls+': tiết PPCT '+item.period+' không đủ ô lịch trong tuần '+item.lesson.Tuan+'.');
      }
    }
    return {schedule,issues:[...new Set(issues)]};
  }
  const api={periods,expand,groups,calendar,join};
  if(typeof module!=='undefined')module.exports=api;else root.CurriculumModel=api;
})(typeof window==='undefined'?globalThis:window);
