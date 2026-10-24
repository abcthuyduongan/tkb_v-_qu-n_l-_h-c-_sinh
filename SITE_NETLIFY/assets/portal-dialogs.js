/* Accessible shared dialogs. Callers await the result before changing any data. */
(()=>{'use strict';
 if(window.TranPhuDialog)return;
 // Accessing the parent API is protected by the browser's same-origin policy,
 // including the demo's inherited-origin about:srcdoc frame.
 try{if(window.parent!==window&&window.parent.TranPhuDialog){window.TranPhuDialog=window.parent.TranPhuDialog;return;}}catch(error){}
 let sequence=0,tail=Promise.resolve();
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
 window.TranPhuDialog=Object.freeze({confirm:options=>request('confirm',options),alert:options=>request('alert',options),prompt:options=>request('prompt',options),content,toast});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
