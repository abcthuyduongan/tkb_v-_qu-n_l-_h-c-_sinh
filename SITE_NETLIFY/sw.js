const CACHE='tranphu-shell-v64-session-recovery';
const EXTRA='/assets/responsive.css?v=45';
const SHELL=['/','/index.html','/assets/styles.css?v=61','/assets/upgrade.css?v=1','/assets/app.js?v=46','/vendor/supabase.js','/assets/auth.js?v=64','/assets/tkb-config.js','/assets/tkb-integration.js?v=45','/assets/data-store.js?v=45','/assets/school-calendar.js?v=45','/assets/ppct-model.js','/assets/pdf-qr.js','/vendor/qrcode.js','/assets/icon.svg','/manifest.webmanifest'];
const OPTIONAL=['/vendor/xlsx.js','/assets/students/student-boy.png','/assets/students/student-girl.png'];
SHELL.push('/assets/teacher-lesson-plan.js?v=62','/assets/lesson-review.css?v=62','/assets/lesson-review.js?v=61');
SHELL.push('/assets/teacher-identity.js?v=57','/assets/teacher-accounts.css?v=61','/assets/teacher-accounts.js?v=64','/assets/demo-snapshot.js?v=54','/assets/report-jobs.js?v=60','/assets/report-worker.js?v=60','/assets/portal-tokens.css?v=62','/assets/lazy-assets.js?v=54','/assets/school-year.js?v=54','/assets/class-review-grid.css?v=61','/assets/class-review-grid.js?v=61','/assets/portal-context.js?v=54','/assets/auto-lesson.js?v=54','/assets/portal-dialogs.css?v=61','/assets/portal-dialogs.js?v=61','/assets/portal-responsive.css?v=61','/assets/class-report-export.js?v=61','/assets/class-reports.js?v=61','/assets/portal-timetable.css?v=63','/assets/portal-timetable.js?v=63','/assets/portal-header.css?v=64',EXTRA,'/giao-vien/v4.js?v=64','/giao-vien/v4.css?v=48','/giao-vien/reference.css?v=61','/tra-cuu/','/assets/embedded-view.js');
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&/^(tranphu-shell-|tkb-shell-v)/.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 const key=['/','/index.html'].includes(u.pathname)?'/':u.pathname+u.search;
 if(!SHELL.includes(key)&&!OPTIONAL.includes(key))return;
 // Fresh shell online, cached static files only when the network is unavailable.
 // Auth, REST/RPC and student records are never cached here.
 e.respondWith(fetch(e.request,{cache:'no-store'}).then(async response=>{
  if(response.ok){const cache=await caches.open(CACHE);await cache.put(key,response.clone());}
  return response;
 }).catch(async()=>await caches.match(key)||Response.error()));
});
