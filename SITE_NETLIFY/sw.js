const CACHE='tranphu-shell-v89-short-navigation-labels';
const EXTRA='/assets/responsive.css?v=45';
const SHELL=['/','/index.html','/assets/styles.css?v=67','/assets/upgrade.css?v=1','/assets/app.js?v=71','/vendor/supabase.js','/assets/auth.js?v=64','/assets/tkb-config.js','/assets/tkb-integration.js?v=71','/assets/data-store.js?v=45','/assets/school-calendar.js?v=45','/assets/ppct-model.js','/assets/pdf-qr.js','/vendor/qrcode.js','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/apple-touch-icon.png','/manifest.webmanifest'];
SHELL.push('/assets/parent-report.js?v=81','/assets/action-layout.css?v=86','/assets/report-dashboard.css?v=79','/assets/report-dashboard.js?v=79','/assets/overview.js?v=88','/assets/attendance-confirmation.js?v=79','/assets/account-activity.js?v=77','/giao-vien/huong-dan.html');
const OPTIONAL=['/assets/students/student-face-boy.webp','/assets/students/student-face-girl.webp','/vendor/xlsx.js'];
SHELL.push('/assets/timetable-admin.css?v=71','/assets/student-management.js?v=70','/assets/student-management.css?v=70','/assets/classroom-scene.css?v=75','/assets/teacher-lesson-plan.js?v=62','/assets/lesson-review.css?v=79','/assets/lesson-review.js?v=79');
SHELL.push('/assets/teacher-identity.js?v=67','/assets/teacher-accounts.css?v=61','/assets/teacher-accounts.js?v=80','/assets/demo-snapshot.js?v=54','/assets/report-jobs.js?v=76','/assets/report-worker.js?v=76','/assets/portal-tokens.css?v=75','/assets/lazy-assets.js?v=54','/assets/school-year.js?v=54','/assets/class-review-grid.css?v=61','/assets/class-review-grid.js?v=61','/assets/portal-context.js?v=74','/assets/auto-lesson.js?v=54','/assets/portal-dialogs.css?v=61','/assets/portal-dialogs.js?v=87','/assets/portal-responsive.css?v=75','/assets/class-report-export.js?v=76','/assets/class-reports.js?v=86','/assets/portal-timetable.css?v=63','/assets/portal-timetable.js?v=75','/assets/portal-header.css?v=86',EXTRA,'/giao-vien/v4.js?v=88','/giao-vien/v4.css?v=48','/giao-vien/reference.css?v=75','/tra-cuu/','/assets/embedded-view.js');
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&/^(tranphu-shell-|tkb-shell-v)/.test(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);if(u.origin!==location.origin)return;
 const key=['/','/index.html','/giao-vien','/giao-vien/','/giao-vien/index.html'].includes(u.pathname)?'/':['/tra-cuu','/tra-cuu/','/tra-cuu/index.html'].includes(u.pathname)?'/tra-cuu/':u.pathname+u.search;
 if(!SHELL.includes(key)&&!OPTIONAL.includes(key))return;
 // Versioned static assets serve from cache first; HTML documents stay network-first.
 // Auth, REST/RPC and student records are never cached here.
 const immutable=u.search.startsWith('?v=')||u.pathname.startsWith('/vendor/')||OPTIONAL.includes(key);
 if(immutable){
  e.respondWith(caches.match(key).then(cached=>cached||fetch(e.request).then(async response=>{
   if(response.ok){const cache=await caches.open(CACHE);await cache.put(key,response.clone());}
   return response;
  })));
  return;
 }
 e.respondWith(fetch(e.request,{cache:'no-store'}).then(async response=>{
  if(response.ok){const cache=await caches.open(CACHE);await cache.put(key,response.clone());}
  return response;
 }).catch(async()=>await caches.match(key)||Response.error()));
});
