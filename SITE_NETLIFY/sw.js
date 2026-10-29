const CACHE='tranphu-shell-v98-workspaces';
const WORKSPACE_ASSETS=['/assets/seating-workspace.js?v=98','/assets/seating-workspace.css?v=98','/assets/report-workspace.css?v=98'];
const EXTRA='/assets/responsive.css?v=45';
const SHELL=['/','/index.html','/assets/styles.css?v=67','/assets/upgrade.css?v=1','/assets/app.js?v=92','/vendor/supabase.js','/assets/auth.js?v=92','/assets/tkb-config.js','/assets/tkb-integration.js?v=71','/assets/data-store.js?v=92','/assets/school-calendar.js?v=45','/assets/ppct-model.js','/assets/pdf-qr.js','/vendor/qrcode.js','/assets/icon.svg','/assets/icon-192.png','/assets/icon-512.png','/assets/apple-touch-icon.png','/manifest.webmanifest'];
SHELL.push(...WORKSPACE_ASSETS,'/assets/parent-report.js?v=81','/assets/action-layout.css?v=98','/assets/report-dashboard.css?v=98','/assets/report-dashboard.js?v=98','/assets/overview.js?v=98','/assets/attendance-confirmation.js?v=79','/assets/account-activity.js?v=77','/giao-vien/huong-dan.html');
SHELL.push('/assets/password-visibility.css?v=90','/assets/password-visibility.js?v=90');
SHELL.push('/assets/seating-rotation.js?v=91','/assets/seating-rotation.css?v=91');
SHELL.push('/assets/students/student-face-boy.webp','/assets/students/student-face-girl.webp');
SHELL.push('/assets/timetable-admin.css?v=71','/assets/student-management.js?v=70','/assets/student-management.css?v=70','/assets/classroom-scene.css?v=98','/assets/teacher-lesson-plan.js?v=62','/assets/lesson-review.css?v=79','/assets/lesson-review.js?v=95');
SHELL.push('/assets/teacher-identity.js?v=67','/assets/teacher-accounts.css?v=61','/assets/teacher-accounts.js?v=93','/assets/demo-snapshot.js?v=54','/assets/report-jobs.js?v=76','/assets/report-worker.js?v=76','/assets/portal-tokens.css?v=75','/assets/lazy-assets.js?v=54','/assets/school-year.js?v=54','/assets/class-review-grid.css?v=61','/assets/class-review-grid.js?v=61','/assets/portal-context.js?v=74','/assets/auto-lesson.js?v=92','/assets/portal-dialogs.css?v=61','/assets/portal-dialogs.js?v=87','/assets/portal-responsive.css?v=75','/assets/class-report-export.js?v=76','/assets/class-reports.js?v=98','/assets/portal-timetable.css?v=63','/assets/portal-timetable.js?v=75','/assets/portal-header.css?v=86',EXTRA,'/giao-vien/v4.js?v=98','/giao-vien/v4.css?v=48','/giao-vien/reference.css?v=75','/tra-cuu/','/assets/embedded-view.js');
SHELL.push('/assets/offline-runtime.js?v=95','/assets/offline-runtime.css?v=92');
SHELL.push('/assets/admin-workspace.css?v=93','/assets/admin-workspace.js?v=93');
SHELL.push('/assets/portal-features.js?v=98');
SHELL.push('/assets/teacher-review.js?v=95','/assets/teacher-review.css?v=95','/assets/observation-corrections.js?v=95','/assets/personal-ppct.js?v=97','/assets/personal-reports.js?v=98','/assets/personal-reports.css?v=98','/assets/report-scope.js?v=98','/assets/homeroom-evidence.js?v=98');
// Only application files enter Cache Storage. Private records use the account outbox, never HTTP caching.
const owned=name=>/^(tranphu-shell-|tkb-shell-v)/.test(name);
const staticPath=p=>/^\/(?:assets|giao-vien|vendor)\/[a-zA-Z0-9_.\/-]+\.(?:js|css|svg|png|webp|ico|woff2?)$/.test(p);
const usable=(key,response)=>response.ok&&(/\.js(?:\?|$)/.test(key)?/(?:java|ecma)script/i.test(response.headers.get('content-type')||''):/\.css(?:\?|$)/.test(key)?/text\/css/i.test(response.headers.get('content-type')||''):true);
async function network(input){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const response=await fetch(input,{cache:'no-store',signal:controller.signal}),body=await response.arrayBuffer(),headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,statusText:response.statusText,headers});}finally{clearTimeout(timer);}}
async function cached(key){const active=await caches.open(CACHE),found=await active.match(key);if(found)return found;for(const name of (await caches.keys()).filter(n=>owned(n)&&n!==CACHE).reverse()){const response=await(await caches.open(name)).match(key);if(response)return response;}}
async function updateAsset(key){
 const url=new URL(key,self.location.origin);
 // A version is the deployment contract. Never reuse a different query or an unversioned mutable file during an update.
 if(url.origin===self.location.origin&&staticPath(url.pathname)&&url.searchParams.size===1&&/^\d+$/.test(url.searchParams.get('v')||'')){
  const previous=await cached(url.pathname+url.search);if(previous&&usable(key,previous))return previous;
 }
 return network(key);
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const responses=await Promise.all(SHELL.map(async key=>{const response=await updateAsset(key);if(!usable(key,response))throw Error('Shell unavailable');return [key,response];}));
 const cache=await caches.open(CACHE),documents=[];
 for(const [key,response] of responses){if(response.headers.get('content-type')?.includes('text/html'))documents.push([key,response]);else await cache.put(key,response);}
 for(const [key,response] of documents)await cache.put(key,response);
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const older=(await caches.keys()).filter(n=>owned(n)&&n!==CACHE).sort((a,b)=>Number(b.match(/v(\d+)/)?.[1]||0)-Number(a.match(/v(\d+)/)?.[1]||0));
 await Promise.all(older.slice(1).map(n=>caches.delete(n)));await self.clients.claim();
})()));
async function refreshDocument(request,key){
 const response=await network(request);if(!response.ok)return response;
 const text=await response.clone().text(),old=await cached(key);if(old&&await old.clone().text()===text)return response;
 const urls=new Set();
 for(const match of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)){
  const url=new URL(match[1],self.location.origin);if(url.origin===self.location.origin&&staticPath(url.pathname)&&/\.(?:js|css)$/.test(url.pathname))urls.add(url.pathname+url.search);
 }
 if(urls.size>100)throw Error('Unexpected shell');
 const assets=await Promise.all([...urls].map(async url=>{const result=await updateAsset(url);if(!usable(url,result))throw Error('Incomplete update');return [url,result];}));
 const cache=await caches.open(CACHE);for(const [url,result] of assets)await cache.put(url,result);
 await cache.put(key,response.clone());
 if(old)for(const client of await self.clients.matchAll({type:'window'}))client.postMessage({type:'TRANPHU_UPDATE_READY'});
 return response;
}
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 const key=['/','/index.html','/giao-vien','/giao-vien/','/giao-vien/index.html'].includes(url.pathname)?'/':['/tra-cuu','/tra-cuu/','/tra-cuu/index.html'].includes(url.pathname)?'/tra-cuu/':url.pathname+url.search;
 const document=SHELL.includes(key)&&!staticPath(url.pathname),asset=staticPath(url.pathname);
 if(!document&&!asset)return;
 if(document){event.respondWith((async()=>{const previous=await cached(key);const fresh=refreshDocument(event.request,key);if(previous){event.waitUntil(fresh.catch(()=>{}));return previous;}try{return await fresh;}catch{return Response.error();}})());return;}
 event.respondWith((async()=>{const previous=await cached(key);if(previous)return previous;const response=await network(event.request);if(usable(key,response))await(await caches.open(CACHE)).put(key,response.clone());return response;})());
});
