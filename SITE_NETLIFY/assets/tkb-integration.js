/* Shared public timetable context. Never contains student records or permissions. */
((root)=>{'use strict';
 const key='tranphu-timetable-context-v1',channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('tranphu-timetable-events'):null;
 const fields=['classCode','teacherCode','versionId','date'];
 function clean(value){const out={};for(const name of fields)if(typeof value?.[name]==='string'&&value[name].length<=100)out[name]=value[name];return out;}
 function read(){try{return clean(JSON.parse(localStorage.getItem(key)||'{}'))}catch{return {}}}
 function remember(value){const next=clean({...read(),...value});try{localStorage.setItem(key,JSON.stringify(next))}catch{}return next;}
 function query(){const p=new URL(location.href).searchParams;return clean({classCode:p.get('class'),teacherCode:p.get('teacher'),versionId:p.get('version'),date:p.get('date')});}
 function teacherUrl(value={}){const c=clean(value),u=new URL('/giao-vien/',location.origin);u.searchParams.set('page','timetable');for(const [field,param] of [['classCode','class'],['teacherCode','teacher'],['versionId','version'],['date','date']])if(c[field])u.searchParams.set(param,c[field]);return u.pathname+u.search;}
 function publicUrl(value={}){const c=clean(value),u=new URL('/',location.origin);u.searchParams.set('mode',c.classCode?'class':'teacher');if(c.classCode)u.searchParams.set('id',c.classCode);if(c.versionId)u.searchParams.set('version',c.versionId);if(c.teacherCode&&!c.classCode)u.searchParams.set('teacher',c.teacherCode);return u.pathname+u.search;}
 function liveVersion(list){const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),live=(list||[]).filter(x=>x.is_active&&x.status!=='draft'&&x.status!=='archived'&&x.effective_date&&x.effective_date<=day);return live.length===1?live[0]:null;}

 function receive(data){if(data?.type==='published')root.dispatchEvent(new CustomEvent('tkb:published',{detail:clean(data)}));}
 function announce(value){const data={type:'published',...clean(value)};channel?.postMessage(data);receive(data);try{localStorage.setItem('tranphu-timetable-change',JSON.stringify({...data,stamp:Date.now()}))}catch{}}
 if(channel)channel.onmessage=e=>receive(e.data);
 root.addEventListener('storage',e=>{if(e.key==='tranphu-timetable-change')try{receive(JSON.parse(e.newValue))}catch{}});
 root.TkbIntegration={read,remember,query,teacherUrl,publicUrl,liveVersion,announce};
})(window);
