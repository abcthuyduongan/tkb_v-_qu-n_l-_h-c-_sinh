/* Optional portal tools load once when requested; the teaching/auth path stays eager. */
(()=>{'use strict';
 const scripts=new Map(),styles=new Map(),attempts=new Map();
 const wait=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Công cụ chưa tải xong. Kiểm tra kết nối rồi thử lại.')),8000);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
 function script(url,ready){
  if(ready())return Promise.resolve();
  if(!scripts.has(url)){
   const attempt=attempts.get(url)||0,request=url+(attempt?'&retry='+attempt:'');
   const pending=import(request).then(()=>{if(!ready())throw Error('Công cụ chưa sẵn sàng. Vui lòng thử lại.');}).catch(error=>{if(scripts.get(url)===pending){scripts.delete(url);attempts.set(url,attempt+1);}throw Error('Chưa tải được công cụ. Kiểm tra kết nối rồi thử lại.',{cause:error});});
   scripts.set(url,pending);
  }
  // A slow import remains shared until it settles; retry never evaluates two copies.
  return wait(scripts.get(url));
 }
 function style(url){
  if(!styles.has(url)){
   const pending=new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=url;link.onload=()=>resolve();link.onerror=()=>{link.remove();styles.delete(url);reject(Error('Chưa tải được giao diện công cụ. Kiểm tra kết nối rồi thử lại.'));};document.head.append(link);});
   styles.set(url,pending);
  }
  return wait(styles.get(url));
 }
 const students=()=>Promise.all([style('/assets/student-management.css?v=70'),script('/assets/student-management.js?v=70',()=>!!window.TranPhuStudents)]);
 const admin=()=>Promise.all([style('/assets/admin-workspace.css?v=93'),script('/assets/admin-workspace.js?v=93',()=>!!window.TranPhuAdminWorkspace)]);
 const exporter=()=>script('/assets/class-report-export.js?v=76',()=>!!window.TranPhuReportExport);
 window.TranPhuFeatures=Object.freeze({students,admin,exporter});
})();
