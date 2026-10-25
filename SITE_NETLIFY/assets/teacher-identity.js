/* Teacher identities keep Vietnamese diacritics. Subject/class evidence outranks homeroom. */
((root)=>{'use strict';
 const key=v=>String(v||'').trim().toLocaleLowerCase('vi').normalize('NFC').replace(/[^\p{L}\p{N}]/gu,'');
 const fold=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/[^a-z0-9]/g,'');
 const subject=v=>({congnghe:'cnghe',ngoaingu:'nngu',tienganh:'nngu',anh:'nngu',hdtn:'tnhn',trainghiemhuongnghiep:'tnhn'}[fold(v)]||fold(v));
 const validUsername=v=>typeof v==='string'&&/^[a-z][a-z0-9._-]{2,39}$/.test(v);
 function loginEmail(value){const name=String(value||'').trim().toLowerCase();if(name.includes('@'))return name;if(!validUsername(name))throw Error('Tên đăng nhập gồm 3–40 ký tự không dấu: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');return 'tp.'+name+'@accounts.tranphu.invalid';}
 const suggestUsername=name=>fold(name).slice(0,40);
 function assigned(work,mon,cls){return [...String(work||'').matchAll(/([^()]+)\(([^()]*)\)/g)].some(p=>subject(p[1])===subject(mon)&&p[2].split(/[,;]/).some(c=>key(c)===key(cls)));}
 function resolve(alias,mon,cls,assignments=[],savedName=''){
  const a=key(alias);if(!a)return '';
  let candidates=assignments.filter(t=>{const last=key(String(t.teacher_name||'').trim().split(/\s+/).pop());return a===key(t.teacher_name)||a===last||last&&(a.startsWith(last)||last.startsWith(a));});
  if(!candidates.length){const folded=fold(alias);candidates=assignments.filter(t=>fold(String(t.teacher_name||'').trim().split(/\s+/).pop())===folded);}
  if(!candidates.length&&savedName)candidates=assignments.filter(t=>key(t.teacher_name)===key(savedName));
  const exact=candidates.filter(t=>key(t.teacher_name)===a);if(exact.length===1)return exact[0].teacher_name;
  const teaching=candidates.filter(t=>assigned(t.teaching_assignment,mon,cls));
  const names=[...new Set((teaching.length?teaching:candidates).map(t=>t.teacher_name))];
  return names.length===1?names[0]:String(alias);
 }
 function nameMap(entries=[],assignments=[]){
  const codes=new Map();for(const e of entries){if(!e.teacher_code)continue;const k=key(e.teacher_code);if(!codes.has(k))codes.set(k,new Set());codes.get(k).add(resolve(e.teacher_code,e.subject,e.class_code,assignments,e.teacher_name));}
  const map=new Map();for(const [code,names] of codes)if(names.size===1){const name=[...names][0];if(assignments.some(t=>key(t.teacher_name)===key(name)))map.set(code,name);}return map;
 }
 function enrich(entries=[],assignments=[]){const map=nameMap(entries,assignments);return entries.map(e=>({...e,teacher_name:map.get(key(e.teacher_code))||resolve(e.teacher_code,e.subject,e.class_code,assignments,e.teacher_name)||e.teacher_name,homeroom_teacher:assignments.find(t=>key(t.homeroom_class)===key(e.class_code))?.teacher_name||e.homeroom_teacher}));}
 function catalog(entries=[],assignments=[]){
  const map=nameMap(entries,assignments),items=[];
  for(const code of [...new Set(entries.map(e=>e.teacher_code).filter(Boolean))]){const name=map.get(key(code)),own=entries.filter(e=>key(e.teacher_code)===key(code));items.push({teacher_code:code,teacher_name:name||'',subjects:[...new Set(own.map(e=>e.subject))].sort(),classes:[...new Set(own.map(e=>e.class_code))].sort(),homeroom_class:name?assignments.find(t=>key(t.teacher_name)===key(name))?.homeroom_class||'':'',resolved:!!name});}
  for(const t of assignments)if(!items.some(i=>key(i.teacher_name)===key(t.teacher_name)))items.push({teacher_code:'PCCM_'+(t.ordinal||key(t.teacher_name)),teacher_name:t.teacher_name,subjects:[],classes:[],homeroom_class:t.homeroom_class||'',resolved:true});
  return items.sort((a,b)=>a.teacher_name.localeCompare(b.teacher_name,'vi'));
 }
 function syncSummary(entries=[],assignments=[],accounts=[]){
  const teaching=entries.filter(e=>!e.status||e.status==='Học'),people=catalog(teaching,assignments),pending=[],issues=[],linked=[];
  for(const person of people){
   const matches=accounts.filter(a=>key(a.teacher_code)===key(person.teacher_code)||person.teacher_name&&key(a.teacher_name)===key(person.teacher_name));
   const unique=[...new Map(matches.map(a=>[a.user_id,a])).values()];
   const item={...person,label:person.teacher_name||person.teacher_code};
   if(!person.resolved){issues.push({...item,reason:'Chưa xác định được họ tên từ TKB/PCCM'});continue;}
   if(unique.length>1){issues.push({...item,reason:'Có nhiều tài khoản khớp giáo viên'});continue;}
   if(unique.length===1&&key(unique[0].teacher_name)!==key(person.teacher_name)){issues.push({...item,reason:'Tên tài khoản khác hồ sơ PCCM'});continue;}
   if(unique.length)linked.push({...item,user_id:unique[0].user_id});else pending.push(item);
  }
  const classes=[...new Set(teaching.map(e=>e.class_code).filter(Boolean))];
  const homes=new Map();for(const a of assignments)if(String(a.homeroom_class||'').trim()){const c=String(a.homeroom_class).trim();if(!homes.has(c))homes.set(c,new Set());homes.get(c).add(key(a.teacher_name));}
  for(const c of classes){const owners=homes.get(c);if(!owners?.size)issues.push({label:'Lớp '+c,reason:'PCCM chưa có giáo viên chủ nhiệm'});else if(owners.size>1)issues.push({label:'Lớp '+c,reason:'PCCM có nhiều giáo viên chủ nhiệm'});}
  return {people,pending,issues,linked,classes,teachingTeachers:new Set(teaching.map(e=>key(e.teacher_code)).filter(Boolean)).size,
   homeroomClasses:homes.size,linkedHomerooms:[...homes.values()].filter(names=>names.size===1&&linked.some(p=>names.has(key(p.teacher_name)))).length};
 }
 root.TranPhuTeacherIdentity=Object.freeze({key,subject,assigned,resolve,nameMap,enrich,catalog,syncSummary,validUsername,loginEmail,suggestUsername});
})(typeof window==='undefined'?globalThis:window);
