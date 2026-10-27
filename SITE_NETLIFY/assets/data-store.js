/* Public data only. One atomic IndexedDB snapshot; never cache PDF bytes. */
window.TkbStore=(()=>{
  const DB='tranphu-public-v1',STORE='snapshot',channel='BroadcastChannel'in window?new BroadcastChannel('tranphu-data-control'):null;let connection;
  channel?.addEventListener('message',async e=>{if(e.data!=='close-database')return;try{const db=await connection;db?.close();}catch(_){}connection=null;});
  const open=()=>connection||(connection=new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
  async function get(){const db=await open();return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get('current');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}
  async function put(value){
    const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Không lưu được dữ liệu.'));});
    // Remove only caches owned by the former public TKB app after durable commit.
    try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key?.startsWith('tkb_public_cache_'))localStorage.removeItem(key);}
    if('caches'in window)for(const name of await caches.keys())if(/^tkb-shell-v/.test(name))await caches.delete(name);}catch(e){console.warn('Không dọn được bộ nhớ TKB cũ',e);}
  }
  async function clear(){const db=await open();await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function purge(){
    channel?.postMessage('close-database');
    try{const db=await open();db.close();}catch(e){}connection=null;
    await new Promise(resolve=>setTimeout(resolve,200));
    await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(DB);r.onsuccess=resolve;r.onblocked=()=>reject(Error('Dữ liệu đang được dùng ở tab khác. Hãy đóng các tab thời khóa biểu khác rồi thử lại.'));r.onerror=()=>reject(r.error);});
    try{for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key==='tkb_view_preferences'||key?.startsWith('tkb_public_cache_'))localStorage.removeItem(key);}}catch(e){}
    if('caches'in window)for(const name of await caches.keys())if(/^(tranphu-shell-|tkb-shell-v)/.test(name))await caches.delete(name);
  }
  async function read(table,params){
    const cfg=window.TKB_CONFIG,all=[];
    for(let offset=0;offset<100000;offset+=1000){
      const url=new URL('/rest/v1/'+table,cfg.supabaseUrl);url.search=new URLSearchParams({...params,limit:1000,offset});
      const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),20000);
      try{
        const r=await fetch(url,{headers:{apikey:cfg.supabaseAnonKey,Authorization:'Bearer '+cfg.supabaseAnonKey},signal:abort.signal,cache:'no-store'});
        if(!r.ok){const info=await r.json().catch(()=>({}));const error=Error(info.message||'Lỗi tải dữ liệu '+r.status);error.code=info.code;throw error;}
        const rows=await r.json();if(!Array.isArray(rows))throw Error('Dữ liệu trả về không hợp lệ.');all.push(...rows);if(rows.length<1000)return all;
      }finally{clearTimeout(timer);}
    }throw Error('Dữ liệu vượt giới hạn.');
  }
  async function manifest(){
    let ready=true;const [versions,plans,calendars]=await Promise.all([read('tkb_versions',{select:'id,version_name,version_no,school_name,school_year,semester,effective_date,is_active,published_at,updated_at',status:'eq.published',order:'id.asc'}),read('tkb_plans',{select:'id,updated_at',published:'eq.true',order:'id.asc'}).catch(e=>{if(!['PGRST205','42P01'].includes(e.code))throw e;ready=false;return [];}),read('tkb_school_calendars',{select:'school_year,semester1_start,semester2_start,week_overrides,updated_at',order:'school_year.asc'}).catch(e=>{if(!['PGRST205','42P01'].includes(e.code))throw e;return [];})]);



    return {versions,plans,calendars,ready,key:JSON.stringify([versions.map(v=>[v.id,v.updated_at,v.is_active]),plans,calendars,ready])};
  }
  async function download(expected,selected){
    const version=expected.versions.find(v=>v.id===selected);if(!version)throw Error('TKB đã được thu hồi. Kiểm tra cập nhật lại.');
    const [entries,assignments,plans]=await Promise.all([
      read('tkb_entries',{select:'id,day_no,period_no,class_code,subject,teacher_code,teacher_name,homeroom_teacher,status',version_id:'eq.'+version.id,order:'id.asc'}),
      read('tkb_assignments',{select:'id,ordinal,teacher_name,duty,homeroom_class,teaching_assignment,period_count',version_id:'eq.'+version.id,order:'id.asc'}),
      expected.ready?read('tkb_plans',{select:'*',published:'eq.true',order:'id.asc'}):Promise.resolve([])]);
    const after=await manifest();if(after.key!==expected.key)throw Error('Dữ liệu thay đổi trong lúc tải. Bản cũ vẫn được giữ; hãy kiểm tra cập nhật lại.');
    if(!entries.length||entries.some(r=>!Number.isInteger(Number(r.day_no))||r.day_no<2||r.day_no>7||!Number.isInteger(Number(r.period_no))||r.period_no<1||r.period_no>5||typeof r.class_code!=='string'||typeof r.subject!=='string')||plans.some(p=>!Array.isArray(p.lessons)||!Array.isArray(p.class_codes)||!p.class_codes.every(c=>typeof c==='string')||typeof p.school_year!=='string'||typeof p.created_at!=='string'||typeof p.teacher_name!=='string'||typeof p.subject!=='string'||!TkbQr.url(p.pdf_url)||p.lessons.some(l=>!l||typeof l.MaBai!=='string'||typeof l.TenBai!=='string'||!CurriculumModel.periods(l.TietPPCT).length)))throw Error('Dữ liệu mới không hợp lệ, chưa thay bản cũ.');
    const value={format:2,manifest:after,version,entries,assignments,plans,calendars:after.calendars||[],savedAt:new Date().toISOString()};
    await put(value);return value;
  }
  return {get,put,clear,purge,manifest,download,read};
})();
