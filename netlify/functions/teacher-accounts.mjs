import '../../SITE_NETLIFY/assets/teacher-identity.js';

const response=(status,data)=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(data)});
const failure=(status,message,code,missing)=>Object.assign(new Error(message),{status,...(code?{safeCode:code}:{}),...(missing?{missing}: {})});
const password=name=>(String(name||'giaovien').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,122)||'giaovien')+'123456';
const limits=new Map();
export function createHandler({fetchImpl=fetch,config=process.env}={}){
 return async event=>{
  let createdId=null,adminToken=null,settings=null;
  try{
   if(event.httpMethod!=='POST')return response(405,{message:'Chỉ hỗ trợ POST.'});
   const headers=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
   const requestedURL=new URL(event.rawUrl||`https://${headers.host||'invalid'}/.netlify/functions/teacher-accounts`);
   const siteOrigin=new URL(config.PUBLIC_SITE_URL||config.URL||requestedURL.origin).origin;
   if(headers.origin&&headers.origin!==siteOrigin)throw failure(403,'Yêu cầu không cùng trang web.');
   const token=headers.authorization?.match(/^Bearer (.+)$/)?.[1];
   if(!token)throw failure(401,'Cần đăng nhập lại.');
   const missing=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].filter(name=>!String(config[name]||'').trim());
   if(missing.length)throw failure(503,'Dịch vụ tài khoản chưa được cấu hình trên máy chủ. Thiếu: '+missing.join(', ')+'.','ACCOUNT_SERVICE_CONFIG_MISSING',missing);
   let providerURL;try{providerURL=new URL(String(config.SUPABASE_URL).trim());}catch{throw failure(503,'Cấu hình SUPABASE_URL trên máy chủ chưa hợp lệ.','ACCOUNT_SERVICE_CONFIG_INVALID');}
   if(!['http:','https:'].includes(providerURL.protocol)||providerURL.username||providerURL.password||providerURL.search||providerURL.hash)throw failure(503,'Cấu hình SUPABASE_URL trên máy chủ chưa hợp lệ.','ACCOUNT_SERVICE_CONFIG_INVALID');
   settings={url:providerURL.href.replace(/\/$/,''),service:String(config.SUPABASE_SERVICE_ROLE_KEY).trim(),public:String(config.SUPABASE_ANON_KEY||config.SUPABASE_SERVICE_ROLE_KEY).trim()};
   const raw=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'{}';
   if(Buffer.byteLength(raw)>16384)throw failure(413,'Thông tin gửi lên quá dài.');
   let input;try{input=JSON.parse(raw);}catch{throw failure(400,'Dữ liệu không hợp lệ.');}
   if(!input||Array.isArray(input)||typeof input!=='object')throw failure(400,'Dữ liệu không hợp lệ.');
   const request=async(path,{method='GET',body,bearer=token,service=false}={})=>{
    const r=await fetchImpl(settings.url+path,{method,headers:{apikey:service?settings.service:settings.public,Authorization:'Bearer '+(service?settings.service:bearer),'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{throw failure(502,'Dịch vụ tài khoản trả về dữ liệu không hợp lệ.');}
    if(!r.ok){if(service&&[401,403].includes(r.status))throw failure(503,'Thông tin xác thực dịch vụ tài khoản trên máy chủ chưa hợp lệ. Quản trị cần kiểm tra cấu hình dịch vụ.','ACCOUNT_SERVICE_CONFIG_INVALID');const error=failure(r.status===401?401:r.status===403?403:r.status===422||r.status===409?409:400,r.status===401?'Phiên đăng nhập hoặc mật khẩu hiện tại không hợp lệ.':r.status===403?'Không có quyền thực hiện thao tác này.':r.status===422||r.status===409?'Email hoặc mã giáo viên đã tồn tại. Kiểm tra danh sách trước khi cấp lại.':'Không thực hiện được thao tác tài khoản. Kiểm tra thông tin và thử lại.');error.providerCode=data?.code||data?.error_code;throw error;}
    return data;
   };
   const rpc=(name,args)=>request('/rest/v1/rpc/'+name,{method:'POST',body:args});
   const identityData=await request('/auth/v1/user'),user=identityData?.user||identityData;
   if(!user?.id||!user.email)throw failure(401,'Cần đăng nhập lại.');
   if(!['status','create','reset','change_password'].includes(input.action))throw failure(400,'Thao tác không hợp lệ.');
   if(input.action==='status'){
    if(await rpc('v4_admin',{})!==true)throw failure(403,'Chỉ quản trị được kiểm tra dịch vụ tài khoản.');
    // This checks configuration presence and the caller only. It does not contact Auth Admin.
    return response(200,{ok:true,service_configured:true,can_manage_accounts:true,credentials_verified:false});
   }
   const rateKey=user.id+':'+String(input.action),now=Date.now(),recent=(limits.get(rateKey)||[]).filter(t=>now-t<900000);
   if(recent.length>=(input.action==='change_password'?8:100))throw failure(429,'Đã thao tác nhiều lần. Vui lòng thử lại sau.');recent.push(now);limits.set(rateKey,recent);
   const audit=async(action,target)=>{
    try{await request('/rest/v1/v4_teacher_account_events',{method:'POST',service:true,body:{actor_id:user.id,target_id:target,action}});return true;}catch{return false;}
   };
   if(input.action==='change_password'){
    if(typeof input.current_password!=='string'||!input.current_password||typeof input.new_password!=='string'||input.new_password.length<8||input.new_password.length>128||input.new_password===input.current_password)throw failure(400,'Nhập mật khẩu hiện tại và mật khẩu mới khác, từ 8 đến 128 ký tự.');
    let fresh;try{fresh=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:input.current_password}});}catch(error){if(error.status===400||error.status===401)throw failure(401,'Mật khẩu hiện tại không hợp lệ.');throw error;}
    if(fresh.user?.id!==user.id||!fresh.access_token)throw failure(401,'Mật khẩu hiện tại không hợp lệ.');
    try{
     // Validate service access before changing the password, so missing privileges do not create a partial reset.
     const latest=await request('/auth/v1/admin/users/'+encodeURIComponent(user.id),{service:true});
     await request('/auth/v1/user',{method:'PUT',bearer:fresh.access_token,body:{password:input.new_password,current_password:input.current_password}});
     await request('/auth/v1/admin/users/'+encodeURIComponent(user.id),{method:'PUT',service:true,body:{app_metadata:{...(latest.user||latest).app_metadata,force_password_change:false}}});
     const logged=await audit('password_changed',user.id);
     return response(200,{ok:true,email:user.email,audit_recorded:logged});
    }finally{await request('/auth/v1/logout?scope=local',{method:'POST',bearer:fresh.access_token}).catch(()=>{});}
   }
   if(!['create','reset'].includes(input.action))throw failure(400,'Thao tác không hợp lệ.');
   if(await rpc('v4_admin',{})!==true)throw failure(403,'Chỉ quản trị được cấp tài khoản hoặc cấp lại mật khẩu.');
   adminToken=token;
   if(input.action==='create'){
    if(input.school_viewer!==undefined&&typeof input.school_viewer!=='boolean')throw failure(400,'Quyền Ban Giám Hiệu không hợp lệ.');
    if(input.school_viewer===true)await rpc('v4_school_report_access',{});
    const username=String(input.username||'').trim().toLowerCase();
    if(!globalThis.TranPhuTeacherIdentity.validUsername(username))throw failure(400,'Tên đăng nhập gồm 3–40 ký tự không dấu: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
    const email=globalThis.TranPhuTeacherIdentity.loginEmail(username);
    const source=await rpc('v4_teacher_catalog',{y:input.year});
    const candidate=globalThis.TranPhuTeacherIdentity.catalog(source.entries,source.assignments).find(t=>t.teacher_code===input.teacher_code&&t.resolved);
    if(!candidate)throw failure(409,'Mã giáo viên chưa đối chiếu được với TKB/PCCM. Kiểm tra phân công trước khi cấp tài khoản.');
    const directory=await rpc('v4_teacher_directory',{y:input.year});
    if(directory.some(t=>t.teacher_code===candidate.teacher_code||t.username?.toLowerCase()===username))throw failure(409,'Tài khoản đã có trong danh sách. Dùng chức năng cấp lại mật khẩu nếu cần.');
    const temporary=password(candidate.teacher_name);
    const created=await request('/auth/v1/admin/users',{method:'POST',service:true,body:{email,password:temporary,email_confirm:true,app_metadata:{force_password_change:true},user_metadata:{name:candidate.teacher_name}}});
    createdId=(created.user||created).id;if(!createdId)throw failure(502,'Chưa xác nhận được tài khoản vừa tạo.');
    await rpc('v4_admin_link_teacher',{em:email,code:candidate.teacher_code,fullname:candidate.teacher_name});
    await rpc('v4_register_teacher_login',{target:createdId,login_name:username});
    if(input.school_viewer===true)await rpc('v4_set_school_report_role',{target:createdId,enabled:true,expected:false});
    const logged=await audit('account_created',createdId);createdId=null;
    return response(201,{ok:true,username,teacher_code:candidate.teacher_code,teacher_name:candidate.teacher_name,temporary_password:temporary,force_password_change:true,school_viewer:input.school_viewer===true,audit_recorded:logged});
   }
   const directory=await rpc('v4_teacher_directory',{y:input.year});
   const target=directory.find(t=>t.user_id===input.user_id);
   if(!target)throw failure(404,'Không có tài khoản giáo viên trong danh sách.');
   if(target.user_id===user.id)throw failure(400,'Dùng mục tự đổi mật khẩu cho tài khoản của bạn.');
   const currentData=await request('/auth/v1/admin/users/'+encodeURIComponent(target.user_id),{service:true}),current=currentData.user||currentData;
   const temporary=password(target.teacher_name);
   await request('/auth/v1/admin/users/'+encodeURIComponent(target.user_id),{method:'PUT',service:true,body:{password:temporary,app_metadata:{...current.app_metadata,force_password_change:true}}});
   const logged=await audit('password_reset',target.user_id);
   return response(200,{ok:true,username:target.username||current.email,teacher_name:target.teacher_name,teacher_code:target.teacher_code,temporary_password:temporary,force_password_change:true,audit_recorded:logged});
  }catch(error){
   if(createdId&&adminToken&&settings){try{await fetchImpl(settings.url+'/auth/v1/admin/users/'+encodeURIComponent(createdId),{method:'DELETE',headers:{apikey:settings.service,Authorization:'Bearer '+settings.service},signal:AbortSignal.timeout(12000)});}catch{/* The new unlinked identity remains visible to the Auth administrator for reconciliation. */}}
   return response(error.status||503,{message:error.status?error.message:'Dịch vụ tài khoản chưa phản hồi. Kiểm tra danh sách trước khi thử lại.',...(error.safeCode?{code:error.safeCode}:{}),...(error.missing?{missing:error.missing}: {})});
  }
 };
}
export const handler=createHandler();
