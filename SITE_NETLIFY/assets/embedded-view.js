/* Reuse existing timetable/admin functionality inside the signed-in portal. */
((root)=>{'use strict';
 const embedded=root.parent!==root;
 if(embedded){const style=document.createElement('style');style.textContent='.topbar .brand,.topbar .admin-login-btn,.topbar #teacherWorkspaceLink,.site-footer,.admin-page .topbar{display:none!important}.topbar{min-height:0;justify-content:flex-end;padding:8px 12px;background:transparent;border:0}.page-shell,.admin-shell{max-width:none;margin:0;padding:12px}.schedule-document{box-shadow:none}';document.head.append(style);}
 // Standalone lookup is public. Private pupil workflows remain in the authenticated portal.
 if(!embedded&&location.pathname.startsWith('/tra-cuu/')){
  root.TkbPublicLookup=true;
  for(const option of document.querySelectorAll('#viewSelect option'))if(!['class','teacher'].includes(option.value))option.remove();
  const url=new URL(location.href);if(!['class','teacher'].includes(url.searchParams.get('mode'))){url.searchParams.set('mode','class');url.searchParams.delete('id');}url.searchParams.delete('display');history.replaceState(null,'',url);
  document.querySelector('.admin-login-btn')?.remove();
  const link=document.getElementById('teacherWorkspaceLink');
  if(link){link.textContent='Đăng nhập';link.title='Đăng nhập';link.setAttribute('aria-label','Đăng nhập');}
  const style=document.createElement('style');style.textContent='#lessonControls{display:none!important}#openClassWorkspace{display:none!important}.top-actions #teacherWorkspaceLink{width:auto;padding:10px 14px;font-size:14px!important}';document.head.append(style);
 }
})(window);
