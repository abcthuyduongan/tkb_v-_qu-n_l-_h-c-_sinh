# Thực hiện đánh giá, báo cáo và tối ưu tải — 28–29/10/2026

Áp dụng kế hoạch KE_HOACH_DANH_GIA_LAI_VA_BAO_CAO_2026_10_28.md và quy trình PROMPT_2_SUA_THEO_KE_HOACH.md người dùng gửi. Chỉ một báo cáo này cho đợt sửa; kiểm bằng dữ liệu giả cục bộ. Chưa triển khai/SQL thật.

## P0 — Mở lại tiết trong hôm nay và thống nhất quyền ghi

Status: PASS.

Problem/evidence: test_teacher_schedule_home xác nhận14:00 ẩn toàn bộ lựa chọn tiết sáng và nút bắt đầu. Module teacher-lesson-plan chỉ đưa slots của ca hiện tại, chưa có danh sách đầy đủ tiết đã mở trong ngày. DB đã cho ghi tiết tự hết giờ trong ngày; do đó sửa lối vào, không tạo session mới. Baseline SQL giả còn xác nhận note UPDATE của tiết đóng thủ công vẫn lọt dù v4_check_lesson_writable=false.

Files: v4.js; teacher-review.js/css; hai HTML; SQL guard37/test phụ trách riêng. Dependency: Auth/RLS/session status, permission class, day server, existing reviews/audit/outbox.

Fix: mục Đánh giá lại hôm nay đọc own sessions trong ngày máy chủ, lọc lớp/môn/trạng thái; mở đúng ID, giữ nháp trước chuyển, chống phản hồi cũ; sửa guard note cho manual-ended. PASS: chiều mở/sửa tiết sáng giữ ID và dữ liệu, không ghi trùng; ngày trước/ngoại quyền/đóng thủ công chỉ đọc; six widths + regression.

Verification: test_today_review PASS (14:00 mở đúng tiết sáng, giữ điểm danh, lưu nhận xét/nhận định, không tạo tiết mới, read-only manual end,6 widths). Regression: test_overview_confirmation và test_previous_lessons PASS. SQL guard37 PASS17; same-day12, automatic-end26, lesson-reviews19, attendance-confirmation17 PASS. Giữ API mở tiết cũ mặc định, chỉ luồng hôm nay yêu cầu vào tab Nhận xét. Remaining risk: hosted/UAT chưa kiểm; mở tiết từ cache đã được P4 kiểm chứng.

## P1 — Điều chỉnh nhận xét có lịch sử
Status: PASS.
Problem/root cause: nhận xét nhanh chỉ sửa ghi chú, không có cách thu hồi ghi nhầm; xóa bản gốc làm mất minh chứng. Fix additive38: withdrawn_at/by/reason nullable, RPC own-author/day/class CAS/idempotent, restrictive RLS effective-only, note-only UPDATE grant, history RPC quyền riêng và filter definer reports/activity. Không đổi danh tính/xóa lịch sử/backfill. UI yêu cầu lý do, chỉ bỏ khỏi S.obs/chips/end-table sau biên nhận, có lịch sử thu hồi. Verification SQL38 PASS37 checks (withdrawal test), UI test_observation_corrections PASS. Regression UI interactions11/one-tap5/lesson-reviews4/daily-handoff5 PASS; SQL guards37 and reports agent verified. Remaining risk: offline/tombstone đã kiểm tại P4; hosted/UAT chưa kiểm. Files38, migrate fixture, observation-withdrawal.mjs, observation-corrections.js, v4/class-reports, HTML.

## P2 — Tuần cá nhân theo TKB/lớp/môn và PPCT
Status: PASS.
Problem/root cause: báo cáo lớp hiện trả nhiều giáo viên, menu GV bộ môn ẩn Báo cáo; không thể dùng payload rộng rồi gọi đó là phạm vi Tiết tôi dạy. Fix: RPC39 Security Invoker lọc auth.uid+quyền lớp tại máy chủ, session giữ version cũ; view TKB/lớp/môn. Không có session→bàiPPCT cố định trong schema hiện tại; hiển thị rõ Chưa liên kết PPCT, không suy từ tài liệu động. Chỉ đưa slot chưa mở khi bản active hiện tại đủ căn cứ, lịch cũ thiếu nguồn ghi rõ. PASS criteria: own-scope/no foreign/revoked/future denied, recorded missing-source giữ lại, source/PPCT honest, six-width UI và cách ly mode báo cáo lớp.

Verification P2: SQL personal-lesson-week PASS14; test_personal_reports PASS7 nhóm/six widths. Personal API không trả tiết/HS giáo viên khác, legacy thiếu version vẫn giữ, revoked/future/anon deny, missing PPCT hiển thị rõ. Nút Báo cáo GV bộ môn đã mở, report-scope chọn scope cá nhân/lớp/chủ nhiệm/toàn trường; không tải personal khi ẩn.

Files P2: SQL39, personal-reports.js/css, report-scope.js, v4.js, hai HTML và personal-lesson-week/test_personal_reports. Dependency: quyền lớp, session đã ghi, phiên bản TKB; Remaining risk: chưa có mapping PPCT bất biến, hosted/UAT chưa kiểm.

## P3 — Báo cáo GVCN và các vai trò
Status: PASS.
Problem/root cause: dashboard hiện đếm lượt, chưa có bảng HS phân biệt tiết/ngày và minh chứng nhiều môn; GVCN chưa có switch own/class. Fix homeroom-evidence dùng authorized report payload, riêng sức khỏe theo permission, số ngày có vắng tính distinct ngày, lặp lại tính distinct tiết/ngày; chi tiết giáo viên/môn/note và đường vào support/student report. Không suy xếp loại. test_homeroom_evidence PASS (2tiết/1ngày,2môn,scope,sixwidths). Regression: class_reports_ui9, exports7, report_dashboard_bgh, shared_controls6widths, parent_reports10, teacher_week_history2, role_menus5 PASS. Fixture menu cập nhật đúng sự kiện Reports được cấp cho GVBM, không bỏ kiểm quyền.

Files P3: homeroom-evidence.js, class-reports.js, report-scope.js và test_homeroom_evidence. Dependency: payload báo cáo đã phân quyền, ngày/tiết và thông tin môn/giáo viên; Remaining risk: cần GVCN/BGH nghiệm thu cách đọc minh chứng trên thiết bị thật.

## P4 — Đồng bộ, hồi quy và gói bàn giao
Status: PASS (kiểm chứng cục bộ). Giữ nháp/queue theo tiết, xung đột, khóa ngày và báo cáo/xuất nhất quán; kiểm UI, API/RLS, build/integrity/package trước kết luận FINAL LOCK. Baseline thấy cache ack cũ có thể giữ ghi nhận đã thu hồi; cần tombstone theo tài khoản/backend và chỉ số hiệu lực cập nhật sau biên nhận. Mục hôm nay cache-first nhưng mở tiết cần đường fallback cache đã xác minh. GóiSQL15/module37–39 đã kiểm89 checks và đồng bộ cùng frontendcache95 vào thư mục phát hành, hai ZIP và checksum. Không có triển khai thật.


Files P4: offline-runtime.js, v4.js, teacher-review.js, observation-corrections.js, personal-reports.js, report-scope.js, class-reports.js, sw.js, hai HTML; test_review_offline, run_suite, package_deploy_ready, test_deploy_package và deploy-package.mjs. Dependency: IndexedDB mã hóa, auth scope, ngày máy chủ, SQL37–39; Remaining risk: đồng bộ khi ứng dụng mở/mở lại, không hứa chạy nền khi trình duyệt đã đóng; hosted/UAT chưa kiểm.

## Cách dùng và cập nhật bản cục bộ

Đánh giá → Đánh giá lại hôm nay → chọn lớp/môn/trạng thái → Đánh giá lại. Giữ nguyên ID/điểm danh; chạm thêm nội dung, sửa ghi chú hoặc Thu hồi có lý do; cuối giờ xem bảng ghi nhận rồi xác nhận nhận định. Ghi nhận tự tổng hợp khác xác nhận giáo viên, Chờ gửi khác đã lưu máy chủ. Qua ngày Việt Nam chỉ đọc.

Báo cáo → Tiết tôi dạy: chọn tuần, Theo TKB hoặc Theo lớp/môn; dữ liệu riêng đúng chủ tiết. GVCN có Lớp chủ nhiệm và Theo học sinh để xem minh chứng nhiều môn, số tiết/ngày vắng, lặp lại theo tiết/ngày riêng; nhật ký/phụ huynh theo quyền. BGH/admin phạm vi đã cấp, không sửa thay tiết. Lịch chưa mở chỉ có khi bản active hiện tại đủ nguồn; tuần cũ không đoán ô TKB trống. Schema chưa có session→bàiPPCT bất biến nên hiển thị Chưa liên kết, không coi tài liệu động là bài đã dạy.

Bản nâng cấp cần SQL15/module37–39. Nếu đã có36:00 đọc hiện trạng→15→03; đang có35cũ:00→13→14→15→03; thấp hơn theo gợi ý preflight. Không chạy01 trên module có sẵn, không chạy mọi tệp SQL. Mã nguồn/gói chuẩn bị cục bộ; không chạy SQL thật. Lưu backup CSDL và frontend ở môi trường quản trị trước nâng cấp. Bản frontendcache94 trước sửa giữ trong KIEM_THU_MOI_NHAT/danh_gia_lai/cache94-rollback.zip; quay lại giao diện không đồng nghĩa hoàn tác dữ liệu thu hồi/audit.


## Regression Gate

Bộ93 bài tại KIEM_THU_MOI_NHAT/20261028T134308Z/summary.json (compact, không tạo log rời). Các ca đã sửa fixture có chủ đích: GVBM có menu Báo cáo (3→4 mục), GVCN thêm Theo học sinh (4→5 tab); SQL37 chặn note của tiết đóng thủ công, SQL38 note-only UPDATE chặn forged observed_at ngay ở quyền cột. Các assertion dữ liệu/ngày/RLS/audit vẫn giữ, ca bảo toàn backup so sánh số audit chính xác trước/sau thay vì magic count cũ.

Tĩnh:47 JS/MJS node--check, Python compile, HTML mirror bằng byte, tài nguyên nội bộ tồn tại, integrity16 tệp TKB PASS. Dự án HTML/CSS/JS thuần không có TypeScript/lint riêng; không bỏ qua cổng kiểm nào được cấu hình. Build thực tế qua scripts/verify-release.mjs và test_deploy_package PASS sau đồng bộ (checksum/layout/Function/Git CRLF). SQL deploy-package.mjs PASS89 checks ở derived SQL15, dùng PGlite/tài khoản giả.

P4 đã kiểm chuyên biệt: queue thu hồi giữ ghi nhận hiệu lực tới biên nhận; tombstone mã hóa theo backend/user ngăn snapshot và ack cũ khôi phục; cache read lọc tại lúc đọc, không chỉ xóa một lần; qua ngày giữ bản Cần xử lý, không tự ghi bù; mở đúng tiết đã xác minh từ cache. Đã sửa observer cập nhật nhãn lặp bằng chỉ ghi khi text thay đổi. Bộ lọc lớp được nhớ riêng tài khoản/năm/phạm vi, snapshot cá nhân cùng tài khoản/tuần vẫn giữ khi IDB không trả và API503, rời mục không tải ngầm. Các kiểm lại cuối được ghi ở phần chốt dưới đây.


## Chốt kiểm và giới hạn phát hành

- P0/P1/P2/P3/P4: PASS trong phạm vi mã nguồn và môi trường thử cục bộ. Không tự gắn PASS cho hosted/UAT.
- Regression Gate gộp: **93/93 PASS**. Lượt đủ20261028T134308Z đạt91/93; hai FAIL chỉ là fixture kỳ vọng menu/tab cũ, đã cập nhật đúng yêu cầu và kiểm lại PASS (test_previous_lessons9, test_feedback_and_ondemand3). Summary gốc giữ nguyên; **không phải full93 PASS một lượt**.
- Nguồn cuối kiểm lại PASS: observation_corrections, review_offline (có qua ngày và queue tiếng Việt/lý do), homeroom_evidence (có giữ Tháng qua đổi scope), personal_reports7, today_review, daily_handoff_reports5. Bao gồm tái hiện/khắc phục observer lặp và cache daily cũ; owner recheck sau await và read-time tombstone được rà độc lập.
- SQL focused: guard37 PASS17, withdrawal38 PASS37, personal-week39 PASS14; các SQL/RLS cũ và backup/audit qua fullgate. Gói SQL cài/nâng cấp/guard/idempotence/bảo toàn dữ liệu và quyền PASS89.
- Build/static:47 JS/MJS syntax, Python test compile, root/giao-vien HTML bằng byte, tài nguyên nội bộ tồn tại, integrity16tệp TKB PASS. Git/ZIP/checksum/Function import và buildverify PASS sau đồng bộ nguồn cuối. Không framework/TypeScript/lint riêng trong dự án này.
- Thay đổi ngoài scope: không sửa renderer TKB gốc/Auth architecture/khóa ngày; SQL chỉ additive37–39 và định nghĩa quyền/báo cáo liên quan; không liveSQL/push/deploy. Các fixture lỗi timestamp/closed note được cập nhật vì kiểm quyền nay chặn sớm hơn, không bỏ validation/denial/audit.

### Kết luận: NOT READY FOR FINAL LOCK trên hệ thống thật

Mã cục bộ và gói ứng viên đã đạt các kiểm nêu trên. Các phụ thuộc chưa thể xác minh trong môi trường này: chạy nâng cấp SQL15 trên môi trường thử hosted có backup và JWT thật, xác minh RLS/Functions/Auth khi deploy, nghiệm thu GV/GVCN/BGH trên thiết bị thực. Chưa chạy các thao tác thật vì quy ước dự án yêu cầu bước triển khai riêng. Không có blocker cục bộ còn mở tại thời điểm chốt.

Giới hạn nghiệp vụ đã ghi rõ: chưa có liên kết bất biến session→bài/tiếtPPCT; giao diện chỉ báo Chưa liên kết và không suy bài đã dạy. Tuần cũ chỉ hiển thị tiết đã ghi khi thiếu nguồn lịch chưa mở; không dựng lịch sử từ bản active mới. Đây là hành vi bảo toàn dữ liệu theo kế hoạch, không giả dữ liệu để testPASS.

## Chốt gói cục bộ — 29/10/2026

Đã đồng bộ96 tệp frontend nguồn vào release/TRAN_PHU_GIT_NETLIFY, giữ Function ngoài publish với duy nhất đổi import helper; hai HTML bằng byte. Gói đầy đủ171 tệp, gói SQL56 tệp; thư mục SQL riêng và SQL trong gói Git cùng nội dung. Hai ZIP20261027 giữ tên phát hành hiện hành, đã thay nội dung cache95 và tạo lại .sha256/CHECKSUMS.json. Hướng dẫn nâng cấp còn sót tuyến14→03 đã sửa thành14→15→03 trước bàn giao.

Verification cuối29/10:51 JS/MJS nguồn syntax,79 Python compile,449 hash nguồn,16 tệp TKB integrity và hash rollback94 PASS; test_deploy_package PASS (source bytes, hai ZIP/hash, không private key/tài khoản giả, Windows Git CRLF checkout/build); verify-release PASS170 checksum entries, mirror, private/public layout và Function import. SQL15 đã kiểm89 tình huống; không chạy CSDL thật. Manifest10 cập nhật nguồn95; clone GIT_DEPLOY_WORK giữ sạch. Bản rollbackcache94 được giữ; chỉ dọn ba thư mục staging sinh tự động sau đối chiếu SQL cuối. Không tạo báo cáo phụ cho đợt này.

## P5 — Tối ưu tải và truy vấn, 29/10/2026

Status: PASS (kiểm chứng cục bộ). Người dùng yêu cầu phân tích và tối ưu sau khi đối chiếu dung lượng. Giữ một báo cáo này; không triển khai/SQL thật.

Baseline: cache95 tải trực tiếp33 JS+20 CSS,813148byte chưa nén; gzip từng tệp ước tính241177byte, không phải transfer thực. Ba lượt Chrome desktop390px, SW/cache tắt, localhost Auth/PGlite giả và không throttle:55request tới login,74request tới overview,871940byte decoded. Không dùng ms localhost làm tuyên bố tốc độ trên mạng thật. Rollback95 giữ tại KIEM_THU_MOI_NHAT/performance_cache96/cache95-rollback.zip; số đo trong cùng thư mục measurements.json.

Problem/root cause đã tái hiện: mở Tiết tôi dạy gọi thêm3RPC lớp cũ (class_report/completion/handoffs) ngoài1RPC cá nhân, vì showPage gọi Reports.open trước observer chọn phạm vi. JS quản trị/roster/export được nạp dù chưa dùng; SW install tải lại cả78URL dù61URL phiên bản không đổi đã cache.

Phạm vi sửa: guard scope đồng bộ, dedup và reuse30s theo user/quyền/ngày/tuần với invalidation; loader tải công cụ phụ khi dùng và giữ Auth core; SW reuse đúng URL có phiên bản và MIME, vẫn network cho HTML/config không phiên bản, vẫn atomic/fallback8s. Giữ optionalSHELL để bảo toàn khả năng dùng bản đã tải khi offline; lazy giảm đường tải/thực thi trang, không hứa bỏ toàn bộ tải nền lần cài PWA đầu. Chưa đổi schema/kiến trúc/quyền/khóa ngày.

Files changed: v4.js, haiHTML, portal-features.js, class-reports.js/report-scope.js/personal-reports.js, sw.js; test_feature_loading.py, test_report_request_efficiency.py, offline/service-worker-cache.mjs và run_suite.py. Fixture page_fixture.py/ba bài standalone/hai renderer được cập nhật theo loader thật. PASS criteria: personal1RPC không3RPC thừa, pending/fresh/invalidations đúng; công cụ khi cần/retry/CSP/navigation an toàn; upgrade không tải lại exactversionasset, asset sai/HTMLthiếu không thay bản tốt; UI/core/offline/Auth/data/export regression PASS; đo lại và đồng bộ gói.

### Kết quả P5 và kiểm hồi quy

- Báo cáo cá nhân: thao tác mở giảm4RPC→1RPC; không còn3RPC lớp và không tải bảng học sinh/ghi nhận/sơ đồ lớp khi chỉ cần phạm vi cá nhân. Request pending được chia sẻ; quay lại trong30giây dùng kết quả cùng user/quyền/ngày/tuần. Làm mới, thu hồi, nhận định và roster-change vẫn invalidate; không nới quyền máy chủ. test_report_request_efficiency PASS11; personal7 và GVCN minh chứng PASS.
- Công cụ phụ: tải admin/roster/export khi dùng, chờ đủJS/CSS trước mở trang và kiểm lại navigation/user/quyền sauawait. Auth/accounts/report-jobs giữ sẵn. test_feature_loading PASS6, gồm dedup, importfail/retry, CSSfail không evaluate lạiJS, chuyển trang lúc tải chậm không bị response cũ đưa ngược lại, và fallback khôngWorker xuất workbook thật. Main export thông thường vẫn chạy trongWorker.
- SW: reuse exactURL có một queryversion số, MIME hợp lệ; unversionedHTML/config/vendor vẫn network khi cập nhật. Không cacheAuth/API/HS vàoHTTPcache. AtomicHTML/fallback8s giữ nguyên. NodeSW PASS12 và browser offline_resilience PASS5; upgrade95→96 khi cache95 đầy đủ tái dùng57/79URL, chỉ22URL cần tải. Tái dùng476522byte nguồn; cần633742byte nguồn, chưa nén. Lần cài PWA đầu vẫn tải toàn bộ shell ở nền để bảo toàn offline.
- Gate gộp: **96/96 PASS**. Lượt đủ KIEM_THU_MOI_NHAT/20261028T233830Z/summary.json đạt92/96. Ba FAIL standalone thiếu loader thật đã sửa fixture bằng routeasset cục bộ, nguyên source loader/import/CSS, giữ assertion; kiểm lại baseline54, data3, workbook3sheet PASS. FAIL teacher_week_history là lỗi thật: đổi danh sáchgrants làmreset lựa chọnUIclasses→mine; sửa resolve giữ lựa chọn hợp lệ theo user/năm, dataidentity vẫn theo quyền. Giữ nguyên test, kiểm lại2 nhóm PASS; thêm request11/personal7/homeroom PASS. Summary gốc giữ nguyên; **không phải full96 PASS một lượt**.
- Không disable test/bỏvalidation/ghi thật. Helperstandalone chuẩn hóa đườngasset và chặn ra ngoàiSITE; ba bài dùng module thật thay giả định công cụ có sẵn. Hai renderer chỉ cập nhật callsite/compile, chưa chạy tạo ảnh. Ghi nhận ngoài phạm vi: smoke_ui.py là script cũ đường dẫnROOT/Linux, không tronggate; không sửa trong đợt tối ưu.
- Tĩnh:52 JS/MJS,81 Python compile, haiHTML bằngbyte, integrity16 tệp TKB PASS. Cả39 hashSQLnguồn giữ nguyên từ95, nội dung SQLđónggói chỉ chuẩn hóaLF như generator hiện hành. Không migration/kiến trúc/Auth mới.

### Số đo tải P5

Đo3lượt trước/sau cùngChrome desktop390px, cache/SW tắt, localhost Auth/PGlite giả, không throttle. KIEM_THU_MOI_NHAT/performance_cache96/measurements.json giữbaseline/số cuối/cách đo; không phải benchmark mạng trường hoặc điện thoại yếu.

| Chỉ số | Cache95 | Cache96 |
|---|---:|---:|
| JS/CSS tải trực tiếp quaHTML | 33JS+20CSS | 31JS+18CSS |
| Dung lượng JS/CSS nguồn | 813148byte | 762140byte |
| Gzip từng tệp ước tính | 241177byte | 225002byte |
| Request tới lúc login ổn định | 55 | 51 |
| Request tới Tổng quan sau đăng nhập | 74 | 70 |
| Byte decoded tới Tổng quan | 871940 | 820138 |
| RPC REST tới Tổng quan | 16 | 16 |

Giảm51008byte JS/CSS trực tiếp (~6,3%) và4request; byte decoded giảm51802. Giảm4→1RPC chỉ áp dụng thao tác Báo cáo cá nhân, không phải75%tốc độ toànứngdụng. Median localhostlogin655→652ms, Tổng quan750→759ms: dao động này chưa đủ chứng minh nhanh hơn theo thời gian. Đã giảm tải và việc thừa, vẫn cần đo hosted/mobile/mạng yếu để kết luận độ trễ thực. Gzip chỉ là ước tính, không phải transfer đã đo trên Netlify.

Remaining risk: lần dùng đầu cần tải công cụ nếu chưa cache; shell tùy chọn vẫn giữ để sử dụng bản đã tải khi ngoại tuyến. Dữ liệu có thể cũ tối đa30giây khi quay lại cùngphạmvi, có Làm mới/sự kiệnthayđổi và mọi thao tác ghi vẫn kiểmquyền/ngày máy chủ. Chưa có hosted/UAT thật. Kết luận **NOT READY FOR FINAL LOCK trên hệ thống thật** vẫn áp dụng; không SQL/push/deploy thật trong đợt96.

### Bàn giao gói96

Đã đồng bộ97tệp frontend nguồn,172tệp gói phát hành; CHECKSUMS171entries và haiHTMLmirror PASS. Buildverify và test_deploy_package PASS: byte nguồn, haiZIP/hash, Function ngoài publish, không khóa riêng/tài khoản thử, GitcheckoutWindowsCRLF/build. GóiSQL56tệp/ZIP giữ byte từ95 (SHA2568366ab2717a2375d4551816aa3ed2219beeb96607c241c659da932b8d405ae7b), không SQL mới. CloneGIT_DEPLOY_WORK sạch; manifest10 cập nhật453tệp nguồn, không lấy dependency/cache/release. Rollback95 vẫn giữ, không có staging mới cần dọn. GóiZIP20261027 và.sha256 hiện hành đã thay nội dung96; chưa push/deploy.
