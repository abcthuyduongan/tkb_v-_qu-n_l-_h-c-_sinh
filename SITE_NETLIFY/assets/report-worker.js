/* Private report payload exists only for this short-lived worker; no storage or API. */
self.window=self;
self.onmessage=event=>{
 try{self.postMessage({phase:'loading'});importScripts('/vendor/xlsx.js','/assets/class-report-export.js?v=76');self.postMessage({phase:'building'});const {kind,data}=event.data;if(!['xlsx','word'].includes(kind))throw Error('Loại tệp không hợp lệ');const output=self.TranPhuReportExport[kind](data);self.postMessage({done:true,output});}
 catch(error){self.postMessage({error:error.message||'Chưa tạo được báo cáo. Vui lòng thử lại.'});}
};
