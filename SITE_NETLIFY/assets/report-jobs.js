/* Build files outside the UI thread; cancellation destroys the worker and its payload. */
(()=>{'use strict';
 function start(kind,data,onPhase){
  let worker,settled=false,resolveResult,rejectResult;
  const promise=new Promise((resolve,reject)=>{resolveResult=resolve;rejectResult=reject;});
  const finish=(error,value)=>{if(settled)return;settled=true;worker?.terminate();if(error)rejectResult(error);else resolveResult(value);};
  try{worker=new Worker('/assets/report-worker.js?v=76');worker.onmessage=event=>{const m=event.data;if(m.error)finish(Error(m.error));else if(m.done)finish(null,m.output);else if(m.phase)onPhase?.(m.phase);};worker.onerror=()=>finish(Error('Không tạo được tệp báo cáo. Kiểm tra kết nối và thử lại.'));worker.postMessage({kind,data});}catch(error){finish(error);}
  return {promise,cancel:()=>finish(new DOMException('Đã hủy xuất báo cáo','AbortError'))};
 }
 function save(output){if(!(output?.blob instanceof Blob)||!output.filename)throw Error('Tệp báo cáo không hợp lệ');const url=URL.createObjectURL(output.blob),a=document.createElement('a');a.href=url;a.download=output.filename;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 window.TranPhuReportJobs=Object.freeze({start,save});
})();
