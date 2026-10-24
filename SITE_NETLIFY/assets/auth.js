/* One persisted Supabase session across public timetable, teacher and admin pages. */
((root)=>{'use strict';
 const cfg=root.TKB_CONFIG;
 if(!cfg||!root.supabase)return;
 const client=root.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
 });
 const auth={client,profile:null,session:null};root.TkbAuth=auth;
 let revision=0;
 async function refresh(session){
  const current=++revision;auth.session=session;let profile=null;
  if(session?.user){const r=await client.from('v4_teachers').select('teacher_code,teacher_name').eq('user_id',session.user.id).maybeSingle();if(!r.error)profile=r.data;}
  if(current!==revision)return;
  auth.profile=profile;auth.session=session;
  root.dispatchEvent(new CustomEvent('tkb:auth',{detail:{signedIn:!!session,teacher:profile}}));
 }
 auth.ready=client.auth.getSession().then(r=>refresh(r.data?.session||null));
 client.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setTimeout(()=>refresh(session),0);});
})(window);
