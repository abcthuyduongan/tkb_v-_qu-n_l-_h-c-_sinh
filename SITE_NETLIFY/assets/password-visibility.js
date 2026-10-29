/* Keep password visibility local to each input, including account dialogs. */
(()=>{'use strict';
 const eye='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="password-eye-slash" d="m4 4 16 16"/></svg>';
 let sequence=0;
 function setVisible(input,button,visible){
  input.type=visible?'text':'password';button.setAttribute('aria-pressed',String(visible));
  button.setAttribute('aria-label',visible?'Ẩn mật khẩu':'Hiện mật khẩu');button.title=visible?'Ẩn mật khẩu':'Hiện mật khẩu';
 }
 function enhance(root){
  const inputs=[...(root.matches?.('input[type="password"]')?[root]:[]),...root.querySelectorAll('input[type="password"]')];
  for(const input of inputs){
   if(input.closest('.password-control'))continue;
   if(!input.id)input.id='password-field-'+(++sequence);
   const wrapper=document.createElement('span');wrapper.className='password-control';
   const button=document.createElement('button');button.type='button';button.className='password-toggle';button.innerHTML=eye;
   button.setAttribute('aria-controls',input.id);setVisible(input,button,false);
   input.before(wrapper);wrapper.append(input,button);
   button.addEventListener('click',()=>{const start=input.selectionStart,end=input.selectionEnd;setVisible(input,button,input.type==='password');input.focus({preventScroll:true});if(start!==null)input.setSelectionRange(start,end);});
  }
 }
 function hideAll(){document.querySelectorAll('.password-control').forEach(wrapper=>setVisible(wrapper.querySelector('input'),wrapper.querySelector('button'),false));}
 enhance(document);
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)enhance(node);}).observe(document.body,{childList:true,subtree:true});
 document.addEventListener('submit',hideAll,true);
 window.addEventListener('blur',hideAll);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hideAll();});
})();
