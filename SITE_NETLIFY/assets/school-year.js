/* One input contract; database guards require the resulting canonical identifier. */
(()=>{'use strict';
 function normalize(value){const match=String(value??'').trim().match(/^(\d{4})\s*[-–—]\s*(\d{4})$/);if(!match||Number(match[2])!==Number(match[1])+1)throw Error('Năm học không hợp lệ. Nhập theo dạng 2026-2027.');return match[1]+'-'+match[2];}
 function isCanonical(value){try{return typeof value==='string'&&normalize(value)===value;}catch{return false;}}
 window.TranPhuSchoolYear=Object.freeze({normalize,isCanonical});
})();
