/* Accessible shared dialogs. Callers await the result before changing any data. */
(()=>{'use strict';
 if(window.TranPhuDialog)return;
 // Accessing the parent API is protected by the browser's same-origin policy,
 // including the demo's inherited-origin about:srcdoc frame.
 try{if(window.parent!==window&&window.parent.TranPhuDialog){window.TranPhuDialog=window.parent.TranPhuDialog;return;}}catch(error){}
 let sequence=0,tail=Promise.resolve(),deferredInstallPrompt=null;
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;});
 const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=String(text);return e;};
 const asOptions=value=>typeof value==='string'?{message:value}:{...(value||{})};
 const focusable=dialog=>[...dialog.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href],[tabindex]')].filter(e=>!e.disabled&&e.tabIndex>=0&&e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');
 function containFocus(dialog,event){
  if(event.key!=='Tab')return;
  const items=focusable(dialog),first=items[0],last=items.at(-1);
  if(!first){event.preventDefault();dialog.focus();return;}
  if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
 }
 // DOM content only: callers keep validation/submission and close after success.
 // Native showModal makes the background inert, including nested confirmations.
 function content(options={}){
  const supplied=options.content;
  if(!supplied||![1,11].includes(supplied.nodeType))throw new TypeError('Dialog content must be a DOM element or DocumentFragment');
  const id='tp-content-'+(++sequence),trigger=options.returnFocus||document.activeElement,dialog=node('dialog','tp-dialog tp-content-dialog');
  dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby',id+'-title');dialog.tabIndex=-1;
  const header=node('header','tp-dialog-header'),title=node('h2','tp-dialog-title',options.title||'Thông tin'),closeButton=node('button','tp-dialog-button tp-dialog-close','Đóng');
  title.id=id+'-title';closeButton.type='button';closeButton.setAttribute('aria-label','Đóng hộp thoại');header.append(title,closeButton);
  const body=node('div','tp-dialog-body tp-dialog-content');body.append(supplied);dialog.append(header,body);
  if(options.description){const description=node('p','tp-dialog-description',options.description);description.id=id+'-description';body.prepend(description);dialog.setAttribute('aria-describedby',description.id);}
  let settled=false,busy=false,resolve;const result=new Promise(done=>resolve=done);
  const close=value=>{if(settled)return;settled=true;if(dialog.open)dialog.close();dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});try{options.onClose?.(value);}finally{resolve(value);}};
  const focus=target=>{const element=typeof target==='string'?dialog.querySelector(target):target;(element&&dialog.contains(element)?element:focusable(dialog)[0]||dialog).focus({preventScroll:true});};
  const setBusy=value=>{busy=!!value;dialog.setAttribute('aria-busy',String(busy));closeButton.disabled=busy;};
  closeButton.addEventListener('click',()=>{if(!busy)close(false);});
  dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy&&options.closeOnEscape!==false)close(false);});
  dialog.addEventListener('close',()=>close(false));dialog.addEventListener('keydown',event=>containFocus(dialog,event));
  document.body.append(dialog);dialog.showModal();focus(options.initialFocus);
  return Object.freeze({dialog,body,result,close,setBusy,focus});
 }
 function icon(tone){
  const box=node('span','tp-dialog-icon');box.setAttribute('aria-hidden','true');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');
  const path=document.createElementNS(svg.namespaceURI,'path');
  path.setAttribute('d',tone==='success'?'m6 12 4 4 8-9':tone==='danger'||tone==='warning'?'M12 8v5m0 3v.1M10.2 4.5 2.7 18a1.2 1.2 0 0 0 1 1.8h16.6a1.2 1.2 0 0 0 1-1.8L13.8 4.5a2 2 0 0 0-3.6 0Z':'M12 10v7m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z');
  svg.append(path);box.append(svg);return box;
 }
 function open(kind,options){return new Promise(resolve=>{
  const id='tp-dialog-'+(++sequence),trigger=document.activeElement,dialog=node('dialog','tp-dialog');
  const tone=['info','success','warning','danger'].includes(options.tone)?options.tone:'info';dialog.dataset.tone=tone;
  dialog.setAttribute('aria-modal','true');dialog.setAttribute('role',kind==='alert'?'alertdialog':'dialog');
  dialog.setAttribute('aria-labelledby',id+'-title');dialog.setAttribute('aria-describedby',id+'-description');
  const body=node('div','tp-dialog-body'),title=node('h2','tp-dialog-title',options.title||(kind==='confirm'?'Xác nhận thao tác':kind==='prompt'?'Bổ sung ghi chú':'Thông báo'));
  title.id=id+'-title';const description=node('p','tp-dialog-description',options.message||'');description.id=id+'-description';
  body.append(icon(tone),title,description);let field;
  if(options.details)body.append(node('p','tp-dialog-details',options.details));
  if(kind==='prompt'){
   const label=node('label','tp-dialog-label',options.label||'Ghi chú (không bắt buộc)');field=node('textarea','tp-dialog-input');
   field.id=id+'-input';field.rows=3;field.maxLength=Number(options.maxLength)||600;field.value=String(options.defaultValue||'');field.placeholder=String(options.placeholder||'');label.htmlFor=field.id;body.append(label,field);
  }
  const actions=node('div','tp-dialog-actions'),cancel=node('button','tp-dialog-button tp-dialog-cancel',options.cancelLabel||(kind==='prompt'?'Bỏ qua':'Hủy'));
  const primary=node('button','tp-dialog-button tp-dialog-primary',options.confirmLabel||(kind==='alert'?'Đã hiểu':kind==='prompt'?'Lưu ghi chú':'Xác nhận'));
  cancel.type=primary.type='button';if(kind!=='alert')actions.append(cancel);else actions.classList.add('tp-dialog-actions-single');actions.append(primary);dialog.append(body,actions);
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;if(dialog.open)dialog.close();dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});resolve(value);};
  const cancelled=kind==='prompt'?null:false;
  cancel.addEventListener('click',()=>finish(cancelled));primary.addEventListener('click',()=>finish(kind==='prompt'?field.value:true));
  dialog.addEventListener('cancel',event=>{event.preventDefault();finish(cancelled);});dialog.addEventListener('close',()=>finish(cancelled));
  dialog.addEventListener('keydown',event=>containFocus(dialog,event));
  document.body.append(dialog);dialog.showModal();(kind==='prompt'?field:kind==='alert'?primary:cancel).focus({preventScroll:true});
 });}
 function request(kind,value){const options=asOptions(value),result=tail.then(()=>open(kind,options));tail=result.catch(()=>{});return result;}
 function inferTone(message){return /^(Lỗi|Không thể|Không lưu|Không tải)|thất bại/i.test(message)?'error':/^(Đã |Nhập danh sách thành công)|thành công/i.test(message)?'success':'info';}
 function decorateToast(e,tone){if(!e)return;e.classList.add('tp-toast');e.dataset.tone=tone||inferTone(e.textContent||'');e.dataset.tpToastMessage=e.textContent||'';e.setAttribute('role',e.dataset.tone==='error'?'alert':'status');e.setAttribute('aria-live',e.dataset.tone==='error'?'assertive':'polite');e.setAttribute('aria-atomic','true');}
 function toast(message,options={}){
  let e=document.getElementById('toast');if(!e){e=node('div','toast');e.id='toast';document.body.append(e);}
  e.textContent=String(message);decorateToast(e,options.tone||inferTone(String(message)));e.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove('show'),Number(options.duration)||(e.dataset.tone==='error'?6000:3900));
 }
 const watch=()=>{const e=document.getElementById('toast');if(!e)return;decorateToast(e);new MutationObserver(()=>{if(e.dataset.tpToastMessage!==e.textContent)decorateToast(e);}).observe(e,{childList:true,characterData:true,subtree:true});};
 function escapeText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function openFeedback(options={}){
  let defaultName=options.name||'';
  let defaultRole=options.role||'';
  try{
   const c=window.TkbAuth?.profile;
   if(c?.teacher_name)defaultName=c.teacher_name;
   if(c?.teacher_name&&!defaultRole)defaultRole='Giáo viên';
   if(c?.subjects)defaultRole='GV '+(Array.isArray(c.subjects)?c.subjects.join(', '):c.subjects);
  }catch(e){}
  const form=node('form','tp-feedback-form');
  form.innerHTML=`
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px">
    <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Họ và tên
     <input id="tpFbName" type="text" maxlength="80" placeholder="Tên của bạn (hoặc để trống)" value="${escapeText(defaultName)}" style="padding:8px 10px;border:1px solid var(--tp-border,#d3d7de);border-radius:8px;font:inherit">
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Vai trò / Lớp
     <input id="tpFbRole" type="text" maxlength="80" placeholder="VD: GV Toán, PHHS lớp 9A…" value="${escapeText(defaultRole)}" style="padding:8px 10px;border:1px solid var(--tp-border,#d3d7de);border-radius:8px;font:inherit">
    </label>
   </div>
   <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:10px">
    <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Chủ đề
     <select id="tpFbCategory" style="padding:8px 10px;border:1px solid var(--tp-border,#d3d7de);border-radius:8px;font:inherit;background:var(--tp-surface,#fff)">
      <option value="feature">💡 Đề xuất tính năng mới</option>
      <option value="timetable">📅 Góp ý Thời khóa biểu</option>
      <option value="bug">🐛 Báo lỗi / Sự cố phần mềm</option>
      <option value="other">💬 Ý kiến đóng góp khác</option>
     </select>
    </label>
    <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600">Liên hệ lại (SĐT / Zalo / Email)
     <input id="tpFbContact" type="text" maxlength="100" placeholder="Không bắt buộc" style="padding:8px 10px;border:1px solid var(--tp-border,#d3d7de);border-radius:8px;font:inherit">
    </label>
   </div>
   <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;margin-bottom:12px">Nội dung góp ý <span style="color:#e02424">*</span>
    <textarea id="tpFbContent" required rows="4" maxlength="2000" placeholder="Mời bạn nhập chi tiết ý kiến đóng góp cho ban quản trị…" style="padding:8px 10px;border:1px solid var(--tp-border,#d3d7de);border-radius:8px;font:inherit;resize:vertical"></textarea>
   </label>
   <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center">
    <button type="button" id="tpFbCancel" class="btn outline" style="min-height:38px;padding:6px 14px;border-radius:8px">Hủy</button>
    <button type="submit" id="tpFbSubmit" class="btn primary" style="min-height:38px;padding:6px 16px;border-radius:8px;background:var(--tp-primary,#075cc2);color:#fff">Gửi góp ý</button>
   </div>
   <p id="tpFbMsg" class="note" style="margin:8px 0 0;color:#e02424;font-size:13px" hidden></p>
  `;
  const modal=content({
   title:'Góp ý & Đề xuất cho Quản trị',
   content:form,
   description:'Ý kiến của bạn sẽ được chuyển trực tiếp tới Ban quản trị nhà trường để nâng cao chất lượng phần mềm.'
  });
  const cancelBtn=form.querySelector('#tpFbCancel');
  if(cancelBtn)cancelBtn.onclick=()=>modal.close(false);
  form.onsubmit=async(event)=>{
   event.preventDefault();
   const contentVal=(form.querySelector('#tpFbContent')?.value||'').trim();
   const msg=form.querySelector('#tpFbMsg');
   if(contentVal.length<5){
    if(msg){msg.textContent='Vui lòng nhập nội dung góp ý từ 5 ký tự.';msg.hidden=false;}
    return;
   }
   const nameVal=(form.querySelector('#tpFbName')?.value||'').trim();
   const roleVal=(form.querySelector('#tpFbRole')?.value||'').trim();
   const catVal=form.querySelector('#tpFbCategory')?.value||'feature';
   const contactVal=(form.querySelector('#tpFbContact')?.value||'').trim();
   const submitBtn=form.querySelector('#tpFbSubmit');
   if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Đang gửi…';}
   modal.setBusy(true);
   try{
    const cfg=window.TKB_CONFIG||{};
    const sb=window.TkbAuth?.client||(window.supabase?.createClient&&cfg.supabaseUrl?window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null);
    if(!sb)throw new Error('Không thể kết nối máy chủ.');
    const {error}=await sb.rpc('v4_submit_feedback',{
     p_sender_name:nameVal||null,
     p_sender_role:roleVal||null,
     p_contact_info:contactVal||null,
     p_category:catVal,
     p_content:contentVal
    });
    if(error)throw error;
    modal.close(true);
    toast('Cảm ơn bạn! Ý kiến đóng góp đã được chuyển tới Ban quản trị.',{tone:'success'});
   }catch(err){
    modal.setBusy(false);
    if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Gửi góp ý';}
    if(msg){msg.textContent='Chưa gửi được: '+(err.message||'Lỗi mạng');msg.hidden=false;}
   }
  };
 }
 function promptInstall(){
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(isStandalone){
   toast('Ứng dụng đã được cài đặt và đang chạy ở chế độ toàn màn hình.',{tone:'info'});
   return;
  }
  if(deferredInstallPrompt){
   deferredInstallPrompt.prompt();
   deferredInstallPrompt.userChoice.then(choiceResult=>{
    if(choiceResult&&choiceResult.outcome==='accepted'){
     toast('Đang cài đặt ứng dụng ra màn hình chính...',{tone:'success'});
    }
    deferredInstallPrompt=null;
   }).catch(()=>{});
   return;
  }
  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  const wrap=node('div','tp-install-guide');
  wrap.style.cssText='font-size:14px;line-height:1.6;color:var(--tp-text,#1f2937)';
  if(isIOS){
   wrap.innerHTML='<div style="text-align:center;margin-bottom:16px"><img src="/assets/apple-touch-icon.png" width="72" height="72" style="border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.15)" alt="Icon App"><h3 style="margin:10px 0 4px;font-size:16px;color:var(--tp-primary,#075cc2)">Cài đặt trên iPhone / iPad</h3><p style="color:var(--tp-muted,#6b7280);font-size:13px;margin:0">Mở toàn màn hình, truy cập tức thì như ứng dụng tải từ App Store</p></div><ol style="padding-left:20px;margin:0 0 16px"><li style="margin-bottom:10px">Nhấn vào nút <strong>Chia sẻ</strong> <span style="font-size:16px">⎋</span> <em>(biểu tượng hình vuông có mũi tên chỉ lên ở thanh đáy Safari)</em>.</li><li style="margin-bottom:10px">Cuộn xuống danh sách tùy chọn và nhấn <strong>"Thêm vào MH chính"</strong> <em>(Add to Home Screen)</em>.</li><li>Nhấn <strong>"Thêm"</strong> <em>(Add)</em> ở góc trên bên phải để tạo biểu tượng truy cập.</li></ol><div style="text-align:right"><button type="button" class="btn primary tp-dialog-btn-done" style="width:100%">Đã hiểu</button></div>';
  } else {
   wrap.innerHTML='<div style="text-align:center;margin-bottom:16px"><img src="/assets/icon-192.png" width="72" height="72" style="border-radius:16px;box-shadow:0 4px 12px rgba(0,0,0,0.15)" alt="Icon App"><h3 style="margin:10px 0 4px;font-size:16px;color:var(--tp-primary,#075cc2)">Cài đặt ứng dụng</h3><p style="color:var(--tp-muted,#6b7280);font-size:13px;margin:0">Tạo lối tắt ra màn hình chính điện thoại hoặc máy tính</p></div><ul style="padding-left:20px;margin:0 0 16px"><li style="margin-bottom:10px"><strong>Trên Android (Chrome/Cốc Cốc):</strong> Bấm menu <strong>3 chấm (⋮)</strong> ở góc trên → chọn <strong>"Cài đặt ứng dụng"</strong> hoặc <strong>"Thêm vào màn hình chính"</strong>.</li><li><strong>Trên Máy tính (Chrome/Edge):</strong> Bấm biểu tượng <strong>Cài đặt</strong> ở góc phải thanh địa chỉ (URL) hoặc menu 3 chấm → <strong>Ứng dụng</strong> → <strong>Cài đặt trang web này</strong>.</li></ul><div style="text-align:right"><button type="button" class="btn primary tp-dialog-btn-done" style="width:100%">Đã hiểu</button></div>';
  }
  const modal=content({
   title:'Cài đặt biểu tượng Màn hình chính',
   content:wrap,
   description:'Truy cập thuận tiện với 1 lần chạm như ứng dụng di động'
  });
  const doneBtn=wrap.querySelector('.tp-dialog-btn-done');
  if(doneBtn)doneBtn.onclick=()=>modal.close(true);
 }
 document.addEventListener('click',event=>{
  const fbTrigger=event.target.closest('[data-action="feedback"], #openFeedbackBtn');
  if(fbTrigger){event.preventDefault();openFeedback();return;}
  const installTrigger=event.target.closest('[data-action="install-app"], #installAppBtn, #openInstallAppFooterBtn');
  if(installTrigger){event.preventDefault();promptInstall();return;}
 });
 window.TranPhuDialog=Object.freeze({confirm:options=>request('confirm',options),alert:options=>request('alert',options),prompt:options=>request('prompt',options),content,toast,openFeedback,promptInstall});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
