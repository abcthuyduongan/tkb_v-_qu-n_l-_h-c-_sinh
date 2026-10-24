/* One persisted session; embedded pages share the parent client and refresh timer. */
((root)=>{'use strict';
 const cfg=root.TKB_CONFIG;if(!cfg||!root.supabase)return;
 let parentAuth=null;
 try{if(root.parent!==root&&root.parent.location.origin===root.location.origin&&root.parent.TKB_CONFIG?.supabaseUrl===cfg.supabaseUrl&&root.parent.TKB_CONFIG?.supabaseAnonKey===cfg.supabaseAnonKey)parentAuth=root.parent.TkbAuth||null;}catch{/* A different origin must manage its own session. */}
 const client=parentAuth?.client||root.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const auth={client,profile:null,session:null,status:'checking',error:null};root.TkbAuth=auth;
 const cleanups=[];
 auth.subscribe=callback=>{const result=client.auth.onAuthStateChange(callback);const subscription=result.data?.subscription;if(subscription)cleanups.push(()=>subscription.unsubscribe());return result;};
 root.addEventListener('pagehide',event=>{if(!event.persisted)for(const cleanup of cleanups.splice(0))cleanup();});
 const announce=()=>root.dispatchEvent(new CustomEvent('tkb:auth',{detail:{signedIn:!!auth.session,teacher:auth.profile,status:auth.status}}));
 if(parentAuth){
  const copy=()=>{auth.session=parentAuth.session;auth.profile=parentAuth.profile;auth.status=parentAuth.status;auth.error=parentAuth.error;announce();};
  root.parent.addEventListener('tkb:auth',copy);cleanups.push(()=>root.parent.removeEventListener('tkb:auth',copy));
  auth.ready=parentAuth.ready.then(copy);auth.retry=async()=>{await parentAuth.retry();copy();};return;
 }
 let revision=0;
 async function refresh(session,force=false){
  const current=++revision,previous=auth.session?.user?.id||'',next=session?.user?.id||'';let profile=previous===next?auth.profile:null;
  if(session?.user&&(force||previous!==next||!profile)){const r=await client.from('v4_teachers').select('teacher_code,teacher_name').eq('user_id',session.user.id).maybeSingle();if(!r.error)profile=r.data;}
  if(current!==revision)return;
  const changed=previous!==next||JSON.stringify(profile)!==JSON.stringify(auth.profile)||auth.status==='checking'||auth.status==='error';
  auth.session=session;auth.profile=profile;auth.status=session?'signed-in':'signed-out';auth.error=null;if(changed||force)announce();
 }
 auth.retry=async()=>{try{const r=await client.auth.getSession();if(r.error)throw r.error;await refresh(r.data?.session||null);}catch(error){auth.status='error';auth.error=error;announce();}};
 auth.ready=auth.retry();
 auth.subscribe((event,session)=>{if(['INITIAL_SESSION','SIGNED_IN','SIGNED_OUT','TOKEN_REFRESHED','USER_UPDATED'].includes(event))setTimeout(()=>refresh(session,event==='USER_UPDATED'),0);});
})(window);
