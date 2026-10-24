/* Same-origin demonstration only; no inline script and no pupil data/API. */
(()=>{'use strict';
 if(parent===window||parent.location.origin!==new URL(document.baseURI).origin||parent.TranPhuDemoSnapshot?.version?.id!=='demo')throw Error('Dữ liệu mẫu chưa sẵn sàng.');
 const value=JSON.parse(JSON.stringify(parent.TranPhuDemoSnapshot));
 window.TkbStore={get:async()=>value,put:async()=>{},manifest:async()=>value.manifest,download:async()=>value,clear:async()=>{},purge:async()=>{}};
})();

