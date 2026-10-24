/* Local optional libraries: deduplicated, retryable and loaded only on demand. */
(()=>{'use strict';let excelPromise;
 function excel(){if(window.XLSX?.utils&&window.XLSX?.CFB)return Promise.resolve(window.XLSX);if(excelPromise)return excelPromise;
 excelPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/xlsx.js';script.async=true;let done=false;const finish=error=>{if(done)return;done=true;clearTimeout(timer);if(error){script.remove();excelPromise=null;reject(error);}else resolve(window.XLSX);};const timer=setTimeout(()=>finish(Error('Tải công cụ Excel quá lâu. Vui lòng thử lại.')),20000);script.onload=()=>finish(window.XLSX?.utils&&window.XLSX?.CFB?null:Error('Công cụ Excel chưa sẵn sàng. Vui lòng thử lại.'));script.onerror=()=>finish(Error('Không tải được công cụ Excel. Kiểm tra mạng và thử lại.'));document.head.append(script);});return excelPromise;
 }
 window.TranPhuAssets=Object.freeze({excel});
})();
