(function(root){
  const DAY=86400000;
  function date(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))throw Error('Ngày không hợp lệ: '+s);const n=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw Error('Ngày không hợp lệ: '+s);return n;}
  const iso=n=>new Date(n).toISOString().slice(0,10);
  function today(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
  function weeks(c){
    const a=date(c.semester1_start),b=date(c.semester2_start),o=c.week_overrides||{};
    if(Array.isArray(o)||typeof o!=='object'||Object.keys(o).some(k=>!/^([1-9]|[12]\d|3[0-7])$/.test(k)))throw Error('Mốc điều chỉnh chỉ nhận tuần 1–37.');
    if(o[1]&&date(o[1])!==a||o[20]&&date(o[20])!==b)throw Error('Tuần 1 và 20 phải trùng ngày bắt đầu học kỳ.');
    const out=[];
    for(let w=1;w<=37;w++){const start=w===1?a:w===20?b:o[w]?date(o[w]):date(out[w-2].start)+7*DAY;
      if(w>1&&start<date(out[w-2].start)+7*DAY)throw Error('Tuần '+w+' chồng hoặc đứng trước tuần '+(w-1)+'.');
      out.push({week:w,term:w<=19?1:2,start:iso(start),end:iso(start+6*DAY)});
    }return out;
  }
  function current(c,day=today()){const list=weeks(c),n=date(day),hit=list.find(w=>n>=date(w.start)&&n<=date(w.end));if(hit)return {...hit,status:'teaching'};return {week:null,status:n<date(list[0].start)?'before':n>date(list[36].end)?'after':'break'};}
  function version(list,day=today(),year){return list.filter(v=>v.effective_date&&v.effective_date<=day&&(!year||v.school_year.replace(/\D/g,'')===year.replace(/\D/g,''))).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||(Number(b.version_no)||0)-(Number(a.version_no)||0))[0]||null;}
  const api={date,iso,today,weeks,current,version};if(typeof module!=='undefined')module.exports=api;else root.SchoolCalendar=api;
})(typeof window==='undefined'?globalThis:window);
