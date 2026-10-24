/* Reuse existing timetable/admin functionality inside the signed-in portal. */
((root)=>{'use strict';
 const embedded=root.parent!==root;
 if(embedded){const style=document.createElement('style');style.textContent='.topbar .brand,.topbar .admin-login-btn,.topbar #teacherWorkspaceLink,.site-footer,.admin-page .topbar{display:none!important}.topbar{min-height:0;justify-content:flex-end;padding:8px 12px;background:transparent;border:0}.page-shell,.admin-shell{max-width:none;margin:0;padding:12px}.schedule-document{box-shadow:none}';document.head.append(style);}
 if(location.pathname.startsWith('/tra-cuu/')){
  root.TkbAuth?.ready.then(async()=>{
   const current=await root.TkbAuth.client.auth.getSession();
   if(!current.data?.session){root.top.location.replace('/');return;}
   if(!embedded){const url=new URL('/',location.origin);url.search=location.search;url.searchParams.set('page','schoolTimetable');location.replace(url);return;}
  });
 }
})(window);
