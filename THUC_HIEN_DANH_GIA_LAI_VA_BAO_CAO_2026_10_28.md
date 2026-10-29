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

## P6 — Tuần cá nhân gọn và đọc PPCT hiện có, 29/10/2026

Status: PASS (kiểm chứng cục bộ). User gửi ảnh và xác nhận vấn đề chính là bố cục rườm rà, khó theo dõi; đồng thời sửa nhận định trước: mônTin đã cóPPCT. Không triển khai thật/SQL trong lượt này.

Problem/evidence: dateinput flex-grow chiếm gần trọn hàng desktop, tiêu đề/giới thiệu/tuần lặp, mọicard lặp cảnh báoPPCT; baseline test_personal_report_layout tái hiệncard vượt112px tại360px. SQL39 vàpersonal-reports.js hardcode not_linked/dòngcảnhbáo, không đọc tkb_plans. Đây là thiếu tích hợp nguồn, không phải bằng chứng chưa cóPPCT. Nguồn MAU_PPCT_TONG.xlsx cóTin6/Tin8; CurriculumModel.join hiện hữu vàSchoolCalendar đã đối chiếu được cácslottrongảnh bằnglịchfixture:6C/6B PPCT8Mạng máy tính,8E PPCT8Đạo đức và văn hóa trong sử dụng công nghệ số. Chưa xác minh dữ liệu/lichhosted thật, không suy fixture thànhDBthật.

Rootcause: personal report chỉ lấyownsession RPC, bỏ nguồnPPCT đã có và thiếu phân biệt 'chưa gắn snapshot bàiđãdạy' với 'chưa có kếhoạch'. Fix: compactcontrol/card, gom thôngtin nguồn vào details; đọcPPCTpublished/theoyear quaAuthclient hiện hành, chuẩn hóaaliasTin/Tin học/phạmviKhối, dùngbộghépPPCTvàtuầntrường theo đúngversion. Hiểnthị 'Theo kế hoạch' cùng sốPPCT/tênbài, không ghi thànhbàiđãdạy. Códocchưamap/lỗitải/missingcalendar được phânbiệt, không gán cứng chưa có. Giữ RLS/khóangày/truyvấnownsession vàcache/thứtựrequest.

Dependency/files: personal-reports.js/css, personal-ppct.js mới, v4.js context entries/version, HTMLmirror/SW97, test_personal_report_layout vàPPCTfocusedtest. PASScriteria: sáuwidth khôngchồng/tràn, date<=300desktop/cardgọn/đọcstatusnhanh, localfilters khônggọi lặp; Tin/Khối/tuầnlịchtrường/version/missing/error/ambiguous đúngnguồn, manualkhônggánnhầm; regression report/scope/offline/Auth vàgói đạt. Rollback96 ở KIEM_THU_MOI_NHAT/personal_layout_cache97/cache96-rollback.zip. Giữ một báo cáo này.

Đính chính các mốcP2/P5 bên trên: thiếu liênkết bấtbiếnsession→PPCT là giới hạn lịch sử, không đồng nghĩaPPCTmônTin chưa nhập. Các mốc đó giữ làm lịch sử; P6 sửa hiển thị và tích hợp nguồn hiện có.

### Kết quả P6

- Bố cục: bỏ tiêu đề/giới thiệu lặp, ô ngày180px trên desktop, chọn tuần/kiểu xem gọn, Lớp/Môn giới hạn chiều rộng, trạng thái tiết ngắn và thông tin nguồn mở theo yêu cầu. Không lặp cảnh báoPPCT trên mỗi ô. ThẻchưaPPCT68px; bàiPPCT có dòng số/tên bài ngắn, xem chi tiết đầy đủ. Giữ44pxtouch/keyboard.
- Phone: mở bảng gần cột hôm nay khi có tràn ngang, có chỉ dẫn vuốt; nhớ vị trí giáo viên đãcuộn theo tài khoản/tuần khi lọc/đổi view/PPCTđọc xong. Kiểm thực tế bắt được race repaintPPCT lưu vị trí0 trướcfirstrAF, đã sửa chỉ nhớ sau khởi tạo; chỉ dẫn cuộn cập nhật theo overflow khi resize, không giữ sai trên desktop. test_personal_report_layout PASS5/sáuwidth360–1920; có đo tọa độ thật, khôngdùnglocator auto-scroll để chebug. Ảnh390/1440vàTin6/8matched ở KIEM_THU_MOI_NHAT/personal_layout_cache97/.
- PPCT: helperpersonal-ppct.js đọc published/notdeleted/cùngnăm qua Authclient hiện hành, Tin↔Tin học, Khối6/8, lịch tuầntrường/học kỳ/nghỉ và phiênbảnTKB gắn tiết; dùng CurriculumModel.join có sẵn. Rowppct cónguồnplan, sốPPCT/tênbài/tuần/doc/version/time; không sửa session/review/attendance/obs. Tiết thủcông/thiếunguồn/docđãcónhưngchưaghép/APIerror/calendarunknown phânbiệt rõ. UI ghi PPCTtheokếhoạch; đây là thamchiếu kếhoạch đãcôngbố, không chứngnhận bài thực tế đãdạy của tiếtkhứ.
- Đọc2RESTnguồnPPCT/lịch chỉ khi mở báo cáo cá nhân, cache≤30giâytheobackend/user/năm/quyền/versionvàsharepending, force Làmmới vẫnlấy mới. Không tảiPDF/Excel. Model dynamicimport có timeout8giây/retrykhilỗi; lọcLớp/Môn/kiểuxem khôngđọcnguồnlại. Contextversion trongreadkey và sựkiệntkb:published vôhiệu reuse, không trộnbảnTKB. Offline chỉdùngprivateencryptedcache; snapshot96chưacóppct_state khônglặp thôngbáofixedcũ, giữ facts và báo chưađốichiếutrênthiếtbị.

Verification: Nodepersonal-ppct PASS15, browserTin6/Tin8 PASS4 (córetrymodel vàlegacycacheoffline); layout PASS5, requestefficiency PASS12 gồmversion/publication. Bộ personal_reports7 (fixturekhôngcópublishedplan nayassertthôngbáo đúngnguồnthayvìcâu hardcode), teacher_week_history2, homeroom_evidence, class_reports_ui9, shared_controls6widths, previous_lessons9, today_review, review_offline, feature_loading6, offline_resilience5, hosting_CSP, performance_contract3, parent_reports10, BGH/accountactivity đềuPASS. Tổng17bàiPython liênquan và2bàiNode(helperPPCT/SW) đạt; integrity16/HTMLmirror/source53JS+83Pythoncompile/39SQLnguồn giữnguyên đạt. Suiteđãđăngký99bài, **không tuyên bố chạyđủ99 trongP6**; gate96ởP5 làbằngchứng lịch sử, giữsummarygốc. Khôngbỏassert/validation.

Performancecontract97(3lượtcoldlocalhost,SW/cachetắt,390px desktopCPU,khôngthrottle):52requestlogin,71tớiOverview,835179byte decoded,16RPC RESTtớiOverview; vẫntrongngânsách1.1MBvàhiddenpolling/worker. Thêm1filehelper≈8.6KB tải mã ở đầu nhưngkhôngtruyvấnPPCTkhiẩn;2RESTnguồnPPCTchỉphátsinhởreport. Khôngso16RPCOverview với1RPCreport đểtuyênbốgiảmrequesttoànứngdụng. Khônghứa độtrễthật từmslocalhost.

Remaining risk: cần nghiệmthuPPCT/lịchtrường đãcôngbố và dữliệu/tài khoản thật saudeploy; códocnhưngkhôngđủnguồn thìbáocầnđối chiếu. Lịch PPCT hiệncó chưa thay liênkết bấtbiến bàiđãdạy cho tiếtcũ. Kết luận **NOT READY FOR FINAL LOCK trên hệ thống thật** vẫn giữ. P6 không SQL mới; SQLZIP giữ95/96. Chưa push/deploy/SQL thật bởi agent; clone usercache96 khôngđụngtới.

### Bàn giao97

Nguồn98tệp frontend và173tệp gói đã đồng bộ; CHECKSUMS172entries/HTMLmirror/Functionimport/buildverify và test_deploy_package PASS (sourcebytes/haiZIP/hash/noSecret/GitWindowsCRLF). Manifest10 đồng bộ457tệp nguồn; SQLZIP56tệp giữ từ95/96, không cần SQL mới cho97. Rollback96 và3ảnhQA giữ nguyên, không staging mới. Thư mục clone userđang29acd03cache96 giữ nguyên, không chép/commit/push/đổi remote. ZIP20261027 và.sha256 giữ tên phát hành hiện hành, nội dungfrontend97 đã cập nhật.

## Kế hoạch thiết kế lại Tổng quan, Báo cáo và Xếp chỗ — 29/10/2026

Trạng thái: **Đã lập kế hoạch; chưa triển khai thay đổi ứng dụng.** Yêu cầu mới của người dùng là căn chỉnh và tổ chức lại Tổng quan, Báo cáo theo vai trò, đồng thời mở rộng vùng xếp chỗ và rút ngắn thao tác chuyển/đổi học sinh. Kế hoạch này nối tiếp P6, dùng nguồn cache97 làm mốc đối chiếu. Các kết quả P0–P6 phía trên là lịch sử kiểm chứng, không chứng nhận thiết kế mới.

### 1. Hiện trạng và mục tiêu

Đã đối chiếu mã và đo 14 tổ hợp trang/vai trò/kích thước bằng Chrome cục bộ, Auth/PGlite và học sinh giả: Tổng quan của GVBM/GVCN/admin, Báo cáo của ba vai trò và Xếp chỗ GVCN, ở 390×900 và 1440×900. Bằng chứng: `KIEM_THU_MOI_NHAT/redesign_plan_20261029/baseline.json` và bốn ảnh cùng thư mục. Không đăng nhập hoặc ghi dữ liệu thật.

| Khu vực | Vấn đề đã xác minh | Mục tiêu thiết kế |
|---|---|---|
| Tổng quan | Biểu đồ đứng trước danh sách việc cần làm. Trên điện thoại 390px, việc cần làm của GVBM bắt đầu ở y=953 và của GVCN ở y=1017, ngoài màn hình cao 900px. Hai tệp CSS còn quy định khác nhau cho cùng hàng tác vụ. | Việc cần làm xuất hiện sớm; hàng nút có một quy tắc bố cục thống nhất. |
| Báo cáo | Có nhiều lớp điều khiển: phạm vi, kỳ, lọc thêm, hàng xuất, các nhóm nội dung. GVCN mặc định có thể hiện nhiều khối nối tiếp nhau. | Một khung chung, mỗi lần tập trung vào một nhóm nghiệp vụ; mặc định theo đúng vai trò. |
| Xếp chỗ | Ở 390×900, vùng sơ đồ rộng 324px, bắt đầu y=517 và cao 390px. Ở 1440×900, vùng này bắt đầu y=482, cao 500px. Chọn ghế mở hộp có danh sách native select; HS chưa xếp nằm phía dưới sơ đồ dưới dạng nhãn. | Sơ đồ trở thành vùng làm việc chính; danh sách HS dễ tìm và chọn; chuyển/đổi trực tiếp trên sơ đồ. |
| Chuyển/đổi chỗ | UI chỉ cho chọn HS chưa có chỗ. RPC hiện có có thể chuyển một HS nhưng chưa cung cấp giao dịch đổi hai ghế có người. | Thao tác ngắn, hai HS được đổi nguyên tử, không phải bỏ ghế rồi gán thủ công. |

14 mẫu đo không có tràn ngang toàn trang hoặc lỗi JavaScript. Điều đó chỉ xác nhận hai lỗi kỹ thuật này không xuất hiện trong mẫu; không chứng minh giao diện thuận tiện, mọi thiết bị đều đạt hoặc dữ liệu thật đã được nghiệm thu. Tọa độ trên dùng để xác định nguyên nhân, không phải con số cố định cho bố cục mới.

### 2. Quy chuẩn chung cho ba nhóm trang

- Mỗi trang có một tiêu đề rõ, một dòng ngữ cảnh ngắn khi cần. Bỏ tiêu đề lặp, không phục hồi dòng năm học thừa dưới tiêu đề.
- Tách rõ điều hướng, bộ lọc và lệnh thực hiện. Cùng một hàng dùng chung chiều cao, khoảng cách và đường căn; nhãn của ô chọn nằm trong cùng cấu trúc, không làm nút bên cạnh lệch hàng.
- Điều khiển thông thường cao tối thiểu 44px, ưu tiên 44–48px; ô nhập 16px, tên HS 14–16px trong chế độ thông thường. Không giảm cỡ chữ để ép nhiều nút vào một hàng.
- Mỗi vùng có một lệnh chính phù hợp ngữ cảnh. Lệnh ít dùng đưa vào menu hoặc bảng mở thêm; lệnh nguy hiểm tách khỏi thao tác thường xuyên.
- Máy tính dùng lưới có cột linh hoạt; điện thoại xuống hàng có chủ đích. Bảng rộng cuộn trong vùng riêng. Không để toàn trang tràn ngang hoặc thanh menu che nút cuối.
- Mỗi thành phần có một nơi quản lý CSS chính; xử lý quy tắc cũ mâu thuẫn khi chuyển sang bố cục mới, tránh nối thêm nhiều lớp ghi đè.
- Giữ chỉ báo mạng nhỏ ở thanh trên và nút hỗ trợ ngoài cùng bên phải. Kiểm tra mạng/cập nhật vẫn chạy yên lặng; trạng thái gửi dữ liệu chỉ hiện ngay tại thao tác có liên quan.
- Duy trì trạng thái đang xem, bộ lọc và vị trí cuộn khi làm mới. Có trạng thái tải/rỗng/lỗi/cached rõ ràng; không xóa bản đang xem chỉ vì yêu cầu nền bị lỗi.

### 3. Xếp chỗ: ưu tiên cao nhất

#### 3.1. Bố cục làm việc

Phần đầu chỉ giữ lớp, trạng thái đã xếp/tổng HS, trạng thái chốt, nút **Mở rộng sơ đồ** và **Chốt sơ đồ** khi cần. Các nút Tổ nằm sát sơ đồ. Thiết lập số tổ/bàn, luân chuyển và quản lý hồ sơ chuyển vào vùng công cụ mở theo yêu cầu.

| Thiết bị | Cách tổ chức |
|---|---|
| Máy tính | Danh sách HS bên trái có thể thu gọn, dự kiến 280–320px; sơ đồ dùng toàn bộ phần còn lại. Chọn số tổ hiển thị theo chiều rộng thực để tên vẫn đọc được; tối đa bốn tổ như hiện tại. |
| Máy tính bảng | Ưu tiên hai tổ; danh sách HS mở bên cạnh hoặc dạng ngăn tùy không gian. Khi vùng tên không đủ rộng, giảm số tổ đang hiển thị. |
| Điện thoại | Một tổ, mỗi bàn vẫn hai chỗ. Danh sách HS mở thành ngăn có tìm kiếm, không buộc cuộn xuống cuối trang để tìm. Khi đang chọn đích, ngăn thu gọn để còn nhìn thấy sơ đồ. |
| Mở rộng sơ đồ | Mở vùng làm việc trong trang, giữ lớp/tổ/học sinh/vị trí cuộn; có lệnh thoát rõ. Sơ đồ nhận phần lớn chiều cao còn lại sau thanh công cụ và điều hướng. Không phụ thuộc trình duyệt hỗ trợ Fullscreen API. |

Thay cách trừ cứng `100dvh - 400px` hoặc `-510px` bằng bố cục sử dụng chiều cao còn lại thực tế. Tính cả thanh menu, safe area và bàn phím; vùng công cụ không đẩy sơ đồ xuống dưới nửa màn hình như hiện nay. Không ép toàn bộ lớp vừa một màn hình bằng cách thu nhỏ tên.

Giữ một kiểu sơ đồ hiện hành, ảnh HS nhẹ, hai chỗ/bàn và góc nhìn từ dưới lên: bàn 1, bàn giáo viên ở dưới; mở tại đầu lớp, cuộn lên xem phía sau. Đổi tổ/lưu/mở rộng không tự kéo giáo viên về vị trí khác. Không phục hồi công tắc 1D/2D.

#### 3.2. Danh sách và thao tác

Danh sách có hai mục rõ: **Chưa xếp** và **Tìm học sinh**. Tìm theo tên/mã, có thể không dấu. Kết quả HS đã ngồi hiển thị vị trí hiện tại và đưa giáo viên đến ghế đó; không trộn vào danh sách chọn HS chưa xếp.

| Tác vụ | Luồng mới dự kiến | Kết quả |
|---|---|---|
| Xếp HS chưa có chỗ | Chọn HS → chạm ghế trống. Có thể bắt đầu từ ghế trống rồi chọn HS. | Lưu một lần, cập nhật số HS chưa xếp sau biên nhận máy chủ. |
| Chuyển sang ghế trống | Chạm HS đang ngồi → chạm ghế trống. | Chuyển trực tiếp, không phải bỏ chỗ cũ trước. |
| Đổi hai HS | Chạm HS A → chạm HS B → xem tên/vị trí hai bên và bấm **Đổi chỗ**. | Đổi cả hai trong một giao dịch; có **Hủy** ngay cạnh. |
| Bỏ chỗ | Chọn HS → lệnh **Bỏ chỗ** trong bảng thao tác ngắn. | HS trở về Chưa xếp; không xóa hồ sơ. |
| Hoàn tác | Bấm **Hoàn tác** sau thao tác vừa lưu, khi sơ đồ chưa bị sửa tiếp. | Đảo lại đúng thao tác đó sau khi kiểm tra phiên bản máy chủ. |

Nguồn/đích được đánh dấu rõ và có tên đầy đủ. Chọn đích ở tổ khác vẫn giữ HS nguồn. Chạm lại cùng ghế là không thay đổi. Tìm kiếm, chuyển tổ hoặc đóng bảng không tự lưu một thao tác còn dang dở. Escape hủy chọn, Enter/Space kích hoạt; focus quay lại vị trí phù hợp sau lưu.

Ưu tiên hoàn thiện thao tác chạm/chọn. Kéo thả không phải điều kiện sử dụng và chưa nằm trong đợt đầu; chỉ xem xét sau khi luồng chạm đạt nghiệm thu.

#### 3.3. Lưu dữ liệu và phân quyền

- Giữ quyền hiện hành: GVCN đúng lớp và admin được xếp/chốt; admin vào từ Quản trị → Xếp chỗ. GVBM không sửa sơ đồ; BGH đơn thuần chỉ theo dõi. Quyền xếp chỗ không cấp thêm quyền đánh giá tiết hoặc nhật ký hỗ trợ.
- Thiết kế RPC bổ sung cho chuyển/đổi/hoàn tác an toàn. Khóa hàng sơ đồ, kiểm tra quyền và HS đang học đúng lớp, kiểm tra ghế nguồn/đích và phiên bản mong đợi; thực hiện toàn bộ thay đổi trong một giao dịch. Không ghép hai lần gọi gán ghế độc lập để đổi hai HS.
- Trước khi chọn cơ chế phiên bản, xác minh trigger cập nhật sơ đồ/ghế hiện có. Không mặc định `rotation_revision` đã bao phủ mọi thay đổi ghế.
- Mỗi thao tác có định danh để lần gửi lại sau mất phản hồi không đổi hai HS lần thứ hai. Khi có xung đột, tải lại sơ đồ và yêu cầu chọn lại đích; không âm thầm ghi đè thay đổi từ thiết bị khác.
- Khi gửi, giữ sơ đồ đã xác nhận và đánh dấu nguồn/đích đang xử lý; chặn bấm lặp. Chỉ báo đã lưu sau biên nhận. Hoàn tác cũng kiểm tra phiên bản; không hoàn tác mù qua thay đổi của người khác.
- Xếp chỗ tiếp tục cần kết nối để ghi. Có thể xem bản đã lưu khi mất mạng; không tự xếp các thao tác đổi ghế vào hàng đợi nhận xét ngoại tuyến.
- **Đã lưu thay đổi** và **Đã chốt sơ đồ** là hai trạng thái riêng. Sửa ghế làm sơ đồ cần chốt lại; giảm tổ/bàn có ảnh hưởng HS phải cho xem số ghế/HS bị tác động trước khi xác nhận.

Các thay đổi bố cục không cần SQL; phần đổi hai HS và hoàn tác an toàn cần đánh giá và chuẩn bị migration/RPC bổ sung. Chưa ấn định số tệp hoặc chạy SQL trong lượt lập kế hoạch.

#### 3.4. Luân chuyển hằng tuần

Phân biệt rõ **Sửa sơ đồ gốc** và **Xem vị trí tuần này**. Xem tuần là phép chiếu chỉ đọc; không ghi tọa độ tuần thành ghế gốc. Giữ quy luật trái/phải, trên/dưới, tổ tham gia và cặp HS cùng bàn. Sau sửa sơ đồ gốc, phản ánh đúng trạng thái cần chốt lại/luân chuyển bị tắt theo quy tắc hiện hành; không báo quy luật vẫn đang áp dụng khi máy chủ đã vô hiệu.

### 4. Tổng quan: ưu tiên công việc và căn chỉnh lệnh

Thứ tự nội dung mới: **tiêu đề và phạm vi → thống kê gọn → việc cần làm → lịch/tiết tiếp theo → biểu đồ và chi tiết phụ**.

- Phạm vi chỉ có một lựa chọn thì hiển thị nhãn ngắn, không tạo thêm một hàng nút. Nút Hôm nay/Tuần này và làm mới nằm trong cùng thanh điều khiển, xuống hàng rõ trên điện thoại.
- Thẻ thống kê cùng kích thước: bốn cột khi đủ rộng, hai cột trên điện thoại. Số liệu là điểm truy cập vào danh sách tương ứng, không lặp thêm các nút cùng chức năng.
- Đặt **Việc cần làm** trước biểu đồ. Với GVBM, ưu tiên tiết đang làm, tiết cần xác nhận và tiết trong ngày có thể xem lại; với GVCN có lối đi tới báo cáo lớp; admin có việc theo lớp và tài khoản đúng quyền.
- Dòng tác vụ có cột nội dung và cột nút thống nhất trên máy tính. Điện thoại bố trí nút ngay dưới nội dung hoặc trong cột riêng đủ rộng, không bó hẹp còn 36% rồi giảm chữ. Nút có cùng đường căn và chiều cao.
- Lệnh dùng đúng trạng thái: **Mở tiết**, **Xem lại**, **Xem báo cáo**; qua ngày chỉ đọc. Không tạo quyền sửa từ việc đổi nhãn hoặc thẻ thống kê.
- Biểu đồ tuần ở phía sau; chế độ một ngày dùng tóm tắt tiến độ gọn hoặc vùng mở thêm. Giữ nguồn, đơn vị và trạng thái chưa xác nhận; thiếu dữ liệu không được biến thành số 0 hoặc xác nhận giả.
- Tiết theo lịch chưa mở vẫn tách khỏi tiết đã ghi trên ứng dụng. Không dựng lịch sử từ bản TKB hiện hành.

Mục tiêu nghiệm thu: trong bộ dữ liệu mẫu thông thường ở 390×844 và 1440×900, tiêu đề Việc cần làm và ít nhất một lệnh hợp lệ phải xuất hiện trước khi cuộn. Trường hợp danh sách rỗng có trạng thái và đường đi phù hợp, không tạo việc giả để đủ giao diện.

### 5. Báo cáo: một khung chung, nội dung riêng theo vai trò

Khung chung: **phạm vi → kỳ và bộ lọc chính → nhóm nội dung → kết quả/chi tiết**. Không dùng nhiều thanh chọn lặp cùng một ý nghĩa. Chỉ một vùng điều khiển kỳ đang hoạt động; ô ngày/tuần có chiều rộng hợp lý. Bộ lọc ít dùng nằm trong **Lọc thêm**. Lệnh xuất gom thành **Xuất báo cáo**, chỉ hiện các định dạng được quyền dùng.

| Vai trò | Nội dung mặc định | Nội dung và thao tác chính |
|---|---|---|
| GVBM | Tiết tôi dạy, tuần hiện tại | Theo TKB hoặc Lớp/Môn; lọc gọn theo lớp/môn; xem tiết và xem lại tiết của mình trong ngày. Lớp được phân công là phạm vi riêng, đúng quyền hiện có. |
| GVCN | Lớp chủ nhiệm | Các tab đề xuất: **Tổng quan · Học sinh · Tiết/Môn · Nhật ký hỗ trợ**. Phần Tiết tôi dạy vẫn riêng để không trộn trách nhiệm chủ nhiệm với tiết do mình dạy. |
| Admin/BGH | Tổng hợp toàn trường | Kỳ, khối/lớp và bộ lọc GV/môn phù hợp; từ tổng hợp mở xuống chi tiết được phép. Admin không xuất hiện lệnh sửa đánh giá hay nhật ký hỗ trợ. |

#### 5.1. Giáo viên bộ môn

Giữ các sửa cache97: thanh tuần gọn, thẻ ngắn, giữ cuộn, phân biệt PPCT theo kế hoạch với bài thực tế đã dạy. Đọc nguồn PPCT đã công bố và lịch tuần hiện có; không quay lại thông báo cố định môn Tin chưa có PPCT.

Trong bảng, đưa lớp/môn, trạng thái đánh giá và số/tên bài PPCT thành thông tin dễ quét. Nội dung dài mở khi chọn tiết. Tên nút ngắn, trạng thái hệ thống/giáo viên xác nhận rõ. Tiết trong ngày có lệnh xem lại theo quyền chủ tiết; tiết ngày cũ chỉ đọc. Giữ lịch sử theo nguồn TKB của tiết, không suy lại bằng bản active mới.

#### 5.2. Giáo viên chủ nhiệm

Không mở toàn bộ dashboard, bảng học sinh, bảng tiết và nhật ký cùng lúc. Tab Tổng quan hiển thị vài chỉ số có ý nghĩa và danh sách cần GVCN xem; tab Học sinh ưu tiên tên, chuyên cần, ghi nhận tích cực/cần hỗ trợ và đường mở minh chứng.

Chọn một HS mở bảng minh chứng bên cạnh trên màn hình rộng; trên điện thoại mở vùng chi tiết có nút quay lại và giữ bộ lọc/vị trí danh sách. Minh chứng có ngày, tiết, môn, giáo viên và nội dung gốc. Phân biệt số tiết vắng với số ngày vắng, có phép với lỗi, sức khỏe với học tập. Không tự gán xếp loại hoặc kết luận chưa tiến bộ từ số lượt.

Nhật ký hỗ trợ có tab riêng trong phạm vi lớp chủ nhiệm, giữ nháp đúng lớp và quyền hiện hành. Thông báo phụ huynh đặt trong ngữ cảnh HS sau bước GVCN xem lại, không là nút lớn thường trực cạnh mọi bộ lọc; không tự gửi hoặc tạo thông báo hàng loạt.

#### 5.3. Quản trị và BGH

Đặt chỉ số tổng hợp và danh sách lớp trước các bảng nhiều chi tiết. Lọc thêm mở khi cần; đổi nhiều điều kiện rồi bấm **Xem báo cáo** một lần, tránh phát truy vấn theo từng lần chọn liên tiếp. Lệnh xem lớp/GV có cùng vị trí giữa các dòng.

Phân biệt dữ liệu điểm danh đã xác nhận, nhận định của GV và tổng hợp hệ thống. Chọn chi tiết phải được máy chủ kiểm quyền; không đưa nhật ký/sức khỏe ngoài phạm vi cho tài khoản quản trị chỉ vì cùng có trang báo cáo. Giữ hoạt động tài khoản ở khu vực quản trị thích hợp, không chen vào mặc định báo cáo HS.

#### 5.4. Xuất và hiệu năng

- Menu xuất giữ Excel/Word/In-PDF theo quyền thực tế; không cấp quyền xuất tổng hợp mới cho GVBM. Tệp thể hiện lớp/phạm vi/kỳ đúng kết quả đang xem, không lấy nhầm bộ lọc vừa thay nhưng chưa áp dụng.
- Quyền xuất phải lấy từ phản hồi máy chủ và phạm vi hiện tại. Chế độ toàn trường hiện không mở bộ lệnh Excel/Word/In như báo cáo lớp; không suy quyền xuất từ nhãn admin/BGH hoặc từ menu mới.
- Giữ worker/hủy xuất và tải thư viện khi cần. Chuyển tab đang dùng cùng dữ liệu, tìm HS và lọc cục bộ không gọi lại toàn bộ báo cáo.
- Bảo toàn cache riêng theo backend/tài khoản/quyền/năm/tuần/phiên bản; chia sẻ yêu cầu đang chờ và chặn phản hồi cũ khi đổi phạm vi. Làm mới vẫn lấy dữ liệu mới đúng quyền.
- Báo cáo cá nhân giữ mức nền một RPC dữ liệu cá nhân và hai lần đọc nguồn PPCT/lịch khi cần; không phục hồi ba RPC báo cáo lớp thừa. Đây là ngân sách cho luồng đó, không phải toàn ứng dụng.

### 6. Các mốc thực hiện và đầu ra

| Mốc | Công việc và phụ thuộc | Đầu ra phải đạt trước khi sang mốc tiếp |
|---|---|---|
| 0 — Mẫu bố cục | Chốt cấu trúc các trang, mẫu máy tính/điện thoại, trạng thái tải/rỗng/lỗi và lệnh theo vai trò từ baseline97. | Mẫu có vị trí lệnh rõ; chỉ ra nơi sửa CSS và nguồn dữ liệu; giữ được các quyết định nghiệp vụ. |
| 1 — Khung dùng chung | Chuẩn hóa tiêu đề, nhãn/ô nhập/nút, hàng bộ lọc, menu xuất và phần chừa cho điều hướng. | Nút/ô lọc không lệch, không chồng; dọn quy tắc CSS xung đột liên quan, kiểm cả trang chưa thiết kế lại. |
| 2 — Xếp chỗ | Làm vùng sơ đồ lớn và danh sách HS; song song thiết kế/kiểm RPC nguyên tử, phiên bản và gửi lại. Chỉ mở đổi ghế khi hợp đồng dữ liệu đã đạt. | Gán/chuyển/đổi/hoàn tác dùng được bằng chạm và bàn phím; đúng quyền, không mất HS; sơ đồ gốc/tuần phân biệt rõ. |
| 3 — Tổng quan | Đưa việc cần làm lên trước, gọn thống kê, thống nhất hàng tác vụ và lối đi theo vai trò. | Lệnh đầu tiên nhìn thấy trong viewport chuẩn; số liệu và trạng thái cũ giữ đúng. |
| 4 — Báo cáo | Tích hợp khung chung, lần lượt GVBM → GVCN → admin/BGH; xử lý chi tiết HS và menu xuất. | Mỗi vai trò mở đúng phạm vi mặc định; không xếp chồng khối; PPCT, chứng cứ, quyền xuất và xem lại tiết đúng. |
| 5 — Kiểm và bàn giao | Đo responsive/thao tác/hiệu năng, kiểm hồi quy và đóng gói sau khi mã ổn định; nghiệm thu thiết bị thật là bước riêng. | Có ảnh/số đo trước–sau, kết quả thật từng nhóm, migration nếu có, gói/checksum và hướng dẫn quay lui. |

Mốc 2 có ưu tiên cao vì ảnh hưởng trực tiếp thao tác xếp chỗ. Mốc 3 và phần khung báo cáo có thể làm độc lập sau mốc 1, nhưng tích hợp/kiểm trước khi đóng gói chung. Không hứa thời gian hoàn tất khi chưa dựng và kiểm mẫu.

### 7. Tiêu chí nghiệm thu

| Nhóm | Điều kiện đạt |
|---|---|
| Bố cục chung | Không nút đè ô nhập/nút khác; cùng hàng căn đáy control và chiều cao thống nhất (sai số đo tối đa 1px trong cùng kiểu). Không tràn toàn trang; nội dung không bị menu cuối che. |
| Độ rộng/khả năng đọc | Kiểm 360, 390, 768, 1024, 1440, 1920px; thêm màn hình thấp/ngang và zoom 200%. Có tên dài, bộ lọc dài, số liệu lớn; không dùng chữ nhỏ để che lỗi. |
| Tổng quan | Việc cần làm và lệnh đầu nhìn thấy ở viewport chuẩn nêu trên; biểu đồ không đẩy lệnh xuống dưới; mọi lệnh dẫn đúng tiết/lớp/quyền. |
| Sơ đồ lớn | Ở chế độ mở rộng, sơ đồ chiếm mục tiêu ít nhất 70% chiều cao làm việc còn lại sau thanh chung/điều hướng; danh sách HS có thể thu gọn. Tên đọc được, không ép bốn tổ vào vùng quá hẹp. Đo lại khi có bàn phím hoặc màn hình thấp. |
| Thao tác ghế | Gán/chuyển bằng hai lần chọn; đổi hai HS bằng hai lần chọn và một xác nhận ngắn. Bỏ chỗ không xóa hồ sơ; chuyển tổ giữ nguồn; hoàn tác đúng phiên bản. |
| Toàn vẹn dữ liệu | Không trùng HS/ghế, không mất một phía khi đổi; giao dịch lỗi không lưu nửa chừng; gửi lại không đổi lần hai; sửa đồng thời hoặc quyền bị thu hồi không ghi đè. |
| Đặc thù lớp | Thử 30/45/60 HS, 1–12 tổ, tổ có số bàn khác nhau, thiếu ghế, HS nghỉ/khôi phục và tên trùng; giảm bàn/tổ có bước xem ảnh hưởng. |
| Luân chuyển/Đánh giá | Góc nhìn dưới lên và vị trí cuộn giữ đúng; đổi sơ đồ gốc/chốt lại phản ánh đúng quy luật tuần. CSS Xếp chỗ không làm hỏng sơ đồ Điểm danh/Nhận xét. |
| Báo cáo | GV/GVCN/admin/BGH mở đúng phạm vi; không lẫn lớp/tài khoản sau đổi nhanh. Vắng theo tiết/ngày, sức khỏe, nguồn hệ thống/GV, PPCT kế hoạch và lịch sử hiển thị đúng; xuất đúng dữ liệu đã xem. |
| Mạng và tốc độ | Thử tải chậm, mất mạng, mất phản hồi sau commit, mở lại và đổi trang lúc đang tải. Không thêm polling/RPC thừa; không làm tăng đường tải đăng nhập cho công cụ chưa dùng. Đo request/byte cùng cấu hình trước–sau, không dùng localhost để hứa tốc độ mạng trường. |
| Hồi quy và thực tế | Chạy các bộ liên quan sau từng mốc và suite hiện hành trước bàn giao; giữ assertion quyền/khóa ngày/audit. Nghiệm thu trên thiết bị/tài khoản thử tách biệt trước khi kết luận sẵn sàng trên hệ thống thật. |

Các bài mới tập trung vào nghiệp vụ đổi ghế, xung đột/gửi lại và các lỗi bố cục đo được; không tạo hàng loạt kiểm thử chỉ lặp lại tên class CSS. Ghi đúng số bài thực chạy, không lấy gate cache97 làm PASS của đợt thiết kế mới.

### 8. Phạm vi mã và cách bàn giao

Các điểm dự kiến tác động: `SITE_NETLIFY/assets/overview.js`, `report-dashboard.css`, `action-layout.css`; nhóm `report-scope.js`, `class-reports.js`, `personal-reports.js/css`, `homeroom-evidence.js` và công cụ xuất; `SITE_NETLIFY/giao-vien/v4.js`, `assets/classroom-scene.css`, `seating-rotation.js/css`; hai HTML nguồn phải tiếp tục khớp byte. Chỉ chọn tệp cần sửa sau khi xác định trách nhiệm từng thành phần; không viết lại toàn bộ để đổi bố cục.

Giữ renderer TKB/PCCM/PPCT, Auth, khóa ngày, lịch sử HS và các quy tắc đánh giá hiện hành. Không thêm framework, thư viện kéo thả hoặc bộ ảnh nặng chỉ để dựng giao diện. Migration đổi chỗ nếu cần là bổ sung có guard/preflight/hậu kiểm, audit và hướng dẫn nâng cấp; không chạy lại installer gốc hoặc tự đổi schema thật.

Khi thực hiện, tạo bản quay lui trước thay đổi, cập nhật báo cáo này theo từng mốc. Chỉ sau kiểm mới đồng bộ cache/version, gói ứng viên, manifest và checksum. Triển khai SQL/Netlify và thử ghi trên hệ thống thật là bước riêng theo quy ước dự án; không tự dùng production làm nơi kiểm thử. Clone triển khai do người dùng quản lý giữ nguyên trong lượt lập kế hoạch.

**Kết quả lượt này:** hoàn tất kế hoạch và baseline cục bộ; chưa sửa HTML/CSS/JS/SQL, chưa tăng cache, chưa thay gói phát hành, chưa push/deploy. Thiết kế mới chưa được triển khai hoặc kiểm nghiệm thu; trạng thái sẵn sàng hệ thống thật vẫn là **NOT READY FOR FINAL LOCK**.

## Thực hiện thiết kế lại theo PROMPT_2 — 29/10/2026

Người dùng tiếp tục bằng tệp PROMPT_2_SUA_THEO_KE_HOACH.md yêu cầu trực tiếp thực hiện kế hoạch đã chốt. Mốc chỉ lập kế hoạch bên trên là lịch sử. Báo cáo duy nhất vẫn là tệp này.

BEFORE: giữ baseline97 gồm 14 mẫu trang cục bộ; bản quay lui `KIEM_THU_MOI_NHAT/redesign_cache98/cache97-rollback.zip` gồm 142 tệp ứng dụng/SQL/công cụ gói, SHA256 `cc47d36314c1f3f75d692f4074c806401f884330c01b37d3744811354868fb0f`. Không dùng production để thử ghi.

| Task | Status ban đầu | Problem / root cause | Files / dependency / expected result và tiêu chí PASS |
|---|---|---|---|
| Khung và mẫu | PARTIAL | Control xung đột CSS, nhiều thanh/tiêu đề lặp. Baseline đã đo, cần đưa cấu trúc mới vào mã. | HTML mirror, action-layout/report CSS; nút cùng hàng, 44px và không chồng/tràn trên sáu độ rộng. |
| Xếp chỗ | PARTIAL | Viewport trừ chiều cao cứng, chọn qua dropdown nhỏ; ghế đang ngồi không chọn trực tiếp, chưa có đổi nguyên tử. | v4.js, classroom CSS, công cụ workspace; phụ thuộc RPC bổ sung có CAS/idempotency. PASS khi sơ đồ lớn, gán/chuyển/đổi/undo đúng quyền và không mất ghế khi lỗi/gửi lại. |
| Tổng quan | PARTIAL | Biểu đồ và chú thích đẩy công việc ra ngoài màn hình, CSS hàng nút có hai nguồn quy định. | overview.js/report-dashboard/action-layout; Việc cần làm và lệnh đầu ở viewport chuẩn, số liệu/quyền không đổi. |
| Báo cáo theo vai trò | PARTIAL | Nhiều tầng control và mặc định mở nhiều khối; lệnh xuất rải. | report scope/class/personal/homeroom và CSS scoped; mỗi vai trò mở đúng phạm vi/nhóm, PPCT97 giữ, không tăng quyền/truy vấn thừa. |
| Gate và bàn giao | UNVERIFIED | Chưa có kết quả cho mã mới. | Kiểm UI/runtime/SQL/quyền/ngoại tuyến/hiệu năng và suite hiện hành; cập nhật gói/checksum sau khi sửa và kiểm. |

### Kết quả thực hiện cache98

| Task | Status | Fix / files changed | Verification / regression check | Remaining risk |
|---|---|---|---|---|
| Khung và mẫu | PASS cục bộ | Dùng cấu trúc dùng chung và CSS có phạm vi; bỏ quy tắc hàng nút Tổng quan mâu thuẫn. HTML hai đường vào đồng bộ. `action-layout.css`, `report-dashboard.css`, `report-workspace.css`, hai HTML. | Sáu độ rộng 360–1920px, control 44px; kiểm hàng lệnh, footer và luồng theo vai trò. | Cần nghiệm thu trên thiết bị thực. |
| Xếp chỗ | PASS cục bộ | Công cụ `seating-workspace.js/css` tải khi mở; danh sách Chưa xếp/Tìm học sinh, gán/chuyển bằng chạm, đổi hai ghế, hoàn tác, ngăn chọn HS và sơ đồ mở rộng. Bridge trong `giao-vien/v4.js`, sizing riêng khỏi sơ đồ Đánh giá trong `classroom-scene.css`, loader `portal-features.js`. | Bài mới 8 nhóm: sáu độ rộng, vùng sơ đồ mở rộng ≥70% ở màn hình chuẩn, tên ≥14px, thanh tổ/Đầu lớp không bị cắt; màn hình ngang/thấp và diện tích CSS tương đương zoom200%; swap/undo/remove/search/assign, gửi lại cùng intent sau mất phản hồi, bàn phím/chuyển tổ, thiếu RPC chỉ xem và admin tải lớp lỗi có thử lại. Giữ 9 nhóm dưới lên/vị trí cuộn, quản lý HS và phân quyền. | Màn hình thấp/bàn phím có vùng sơ đồ nhỏ hơn; kiểm bằng viewport cục bộ, chưa phải bàn phím/zoom trình duyệt trên thiết bị thật. |
| Lưu ghế nguyên tử | PASS cục bộ | `DATABASE/40_v6_atomic_seating_workspace.sql`: snapshot thống nhất, revision cho mọi thay đổi sơ đồ, RPC 1–2 vị trí trong một giao dịch, kiểm nguồn/đích và quyền, biên nhận riêng từng tài khoản, gửi lại cùng action ID, hoàn tác có CAS. Giữ API cũ và audit/luân chuyển. | Node/PGlite 71 nhóm: 34 ca quyền/CAS/gửi lại/rollback/receipt/undo và matrix 30/45/60HS × 1–12 tổ, đủ/thiếu ghế, tên trùng/dài; cuối matrix dữ liệu/audit/receipt giữ nguyên sau rollback. Hồi quy bảo mật/luân chuyển/admin xếp chỗ đạt. | Cần chạy SQL16 trên backend thử tách biệt, kiểm JWT/gateway và tải đồng thời thật. Ca hai editor stale nối tiếp không phải benchmark đồng thời. |
| Tổng quan | PASS cục bộ | `overview.js`, `report-dashboard.css`, `action-layout.css`: một tiêu đề, scope đơn dạng nhãn, thống kê gọn, việc cần làm trước biểu đồ, hàng tác vụ đồng nhất, nhãn Xem lại đúng quyền. Nguồn/chú thích mở khi cần. | 18 tổ hợp ba vai trò × sáu độ rộng; ở390×844 lệnh đầu nhìn thấy trước menu đáy. Luồng tự động/chờ xác nhận/giáo viên xác nhận/lịch sử và dữ liệu unknown giữ đúng. | Chưa xác minh số liệu và thao tác hosted bằng tài khoản thật. |
| Báo cáo theo vai trò | PASS cục bộ trong phạm vi dữ liệu hiện có | `class-reports.js`, `report-scope.js`, `homeroom-evidence.js`, `report-dashboard.js`, CSS workspace. GVCN mặc định Tổng quan, bốn tab tách nội dung; tìm/chi tiết HS cạnh danh sách hoặc quay lại trên mobile, giữ focus/tìm kiếm/nháp. Menu xuất dùng nút và quyền cũ; thông báo PH trong ngữ cảnh HS. | 18 tổ hợp vai trò/độ rộng; bộ lớp/kỳ và Xem/Xuất căn hàng. Report UI, minh chứng nhiều môn, lịch sử tuần, Excel/Word/in/PH, request-efficiency và cache/PPCT97 đã kiểm. Lọc danh sách tiết hai GV/hai môn đúng, không phát thêm REST và không làm sai chỉ số/xuất. | Bộ lọc GV/môn chỉ tác động danh sách tiết. Khối thu gọn lựa chọn lớp; chưa là tổng hợp chỉ số HS của cả khối hoặc riêng GV/môn. UI ghi rõ phạm vi này, không tạo số tổng hợp giả. |

Điều chỉnh theo ảnh người dùng gửi trong lúc thực hiện: chuyển nhãn lớp và nhóm **Tuần / Tháng / Học kỳ** vào cùng thanh ngữ cảnh, căn giữa theo chiều cao, chia đều các nút; gỡ tiêu đề phụ khỏi hàng cũ. Đã thêm kiểm tọa độ cùng hàng cho GVCN/admin ở sáu độ rộng trong `test_report_workspace.py`. Chuyển kỳ và quyền báo cáo giữ nguyên.

Các lỗi thật phát hiện khi tích hợp đã sửa: (1) thay chiều cao vùng sơ đồ làm ghi nhầm offset cuộn, nay có revision cho lượt khôi phục viewport, nhận biết thay đổi kích thước và chỉ giữ offset trong khoảng cuộn hợp lệ; (2) ngăn chọn HS che sơ đồ sau gán, nay thu lại trên mobile và đồng bộ aria-expanded; (3) sửa roster ở trang quản lý rồi quay lại dùng revision cũ, nay invalidate ngay cả khi đang ở trang khác, kiểm add/remove/restore → đọc mới → swap/undo ở360/768/1440; (4) admin tải lớp lỗi làm Làm mới không hoạt động, nay có đường tải lại lớp đã chọn và không cho ghi trên dữ liệu lớp cũ; (5) nhật ký hỗ trợ nằm dưới trang cha bị ẩn, nay đưa về đúng trang trước khi áp tab và tải khi mở. Không sửa Auth/khóa ngày, không bỏ validation hoặc audit.

### Kiểm chốt và phạm vi chứng nhận

Lượt đủ `KIEM_THU_MOI_NHAT/20261029T053043Z/summary.json` đã chạy **103 bài, 98 PASS / 5 FAIL**; giữ nguyên summary gốc. Năm bài cần kiểm lại: `regression_v6_features`, `test_extended_ui` (fixture standalone phải nạp loader/workspace thật và đợi snapshot); `test_design_system`, `test_classroom_views` (số tổ dựa diện tích sơ đồ sau danh sách, ảnh editor28px với tên14px thay giả định cửa sổ/ảnh40px cũ); `test_seating_workspace` (fixture cần chờ lỗi tải sau chính sách retry, không kết luận lỗi sau5giây khi yêu cầu vẫn đang chạy). Giữ kiểm quyền, nội dung, focus, độ đọc được, chống trùng và toàn vẹn dữ liệu; không bỏ assertion nghiệp vụ. Các lỗi nguồn thực được xử lý và kiểm bằng các ca riêng nêu trên.

Các lần kiểm lại nằm trong `KIEM_THU_MOI_NHAT/redesign_cache98/final-reruns.json`, `final-integration.json` và chứng cứ workspace; không gọi đây là một lượt đủ103 PASS. Tệp fixture vị trí cuộn kiểm sau khi response đã thay DOM và layout sẵn sàng; khi viewport lớn hơn, offset được chặn tại maxScroll mới (không thể giữ scrollTop âm). Các trường hợp còn trong khoảng cuộn vẫn giữ sai số4px.

SQL mới là bổ sung nhỏ đã có trong kế hoạch: một cột revision, một bảng biên nhận kín và hai RPC; không đổi kiến trúc đăng nhập hoặc phá hợp đồng RPC cũ. Generator/test gói cập nhật `SQL/16_XEP_CHO_NGUYEN_TU_VA_HOAN_TAC.sql`, installer, preflight/hậu kiểm. Kiểm SQL gói trong thư mục tạm đạt105 điều kiện; tuyến đã có39 là **00 đọc hiện trạng →16 →03**, đã có36–38 là **00 →15 →16 →03**, đã có40 chỉ03. Không chạy lại01 trên module hiện có. Agent chưa thực hiện SQL thật.

Kiểm bản quay lui đối chiếu manifest97: toàn bộ tệp có trong manifest đều khớp, không chứa thay đổi thiết kế mới. Không thay renderer TKB/PCCM/PPCT, không xóa lịch sử hoặc thay định danh HS. Công cụ editor tải khi dùng, không thêm thư viện kéo thả/framework/ảnh mới; cache98 giữ cơ chế exact-version và bản đọc ngoại tuyến. Ghi ghế cần kết nối, không đưa thao tác đổi ghế vào outbox nhận xét.

Trạng thái gói/manifest/checksum và số đo tải cuối sẽ được ghi ngay dưới sau khi kiểm tích hợp hoàn tất. **NOT READY FOR FINAL LOCK trên hệ thống thật**: chưa nâng SQL16 trên backend thử có backup, chưa kiểm JWT/Function/gateway và nghiệm thu GV/GVCN/admin bằng thiết bị thật. Các kiểm localhost/PGlite không thay thế các bước này. Không SQL/push/deploy/ghi thử production trong đợt này.

### Chốt kiểm và bàn giao98

**Gate gộp103/103 PASS cục bộ** tại `KIEM_THU_MOI_NHAT/redesign_cache98/verification.json`: lượt đủ98/103 và các bài lỗi kiểm lại đạt. Ngoài ra, sáu bài UI liên quan và mười bài tích hợp cuối trong `final-reruns.json` / `final-integration.json` đều đạt; bài workspace cuối tám nhóm có thêm màn hình thấp và thử lại tải lớp. SQL71 nhóm matrix và SQL gói105 kiểm đạt. Không tuyên bố một lượt đủ103 PASS; summary lỗi gốc được giữ.

Kiểm tĩnh: toàn bộ50 JS/MJS ứng dụng ngoài vendor qua node --check, Python TESTS compile, hai HTML bằng byte và integrity16 tệp TKB đạt.39 SQL cũ khớp hash97; chỉ bổ sung40. Không có framework/typecheck/lint riêng trong dự án HTML/CSS/JS thuần, nên không gán PASS cho công cụ không tồn tại.

Số đo cuối ba lượt cold localhost, SW/cache tắt, viewport390 desktop CPU, không throttle:53 request tới login,72 tới Tổng quan,16 REST/RPC tới Tổng quan,860223 byte decoded. So với97 (52/71 request và835179byte) tăng1 request và25044byte (~3%) do CSS báo cáo và mã giao diện/bridge mới; công cụ editor vẫn tải khi mở Xếp chỗ. Giữ ngân sách dưới1.1MB, không tải XLSX/HS khi chỉ vào Tổng quan, không polling trang ẩn; idle hiện2 request/125giây mô phỏng. Đây là số đo dung lượng/yêu cầu cục bộ, không phải cam kết độ trễ mạng trường. Báo cáo cá nhân vẫn1RPC và nguồnPPCT/lịch khi cần, không phục hồi3RPC thừa. Chi tiết lưu `redesign_cache98/performance.json`.

Gói ứng viên98 gồm176 tệp, CHECKSUMS175 mục; gói SQL58 tệp có SQL16. Source/frontend bytes, Function chỉ thích ứng import, public/private layout, hai ZIP/.sha256 và Windows Git CRLF checkout/build đã kiểm đạt bằng `test_deploy_package.py` và verify-release. Hướng dẫn Xếp chỗ trong gói là `HUONG_DAN_XEP_CHO_CACHE98.md`; README đã chỉ đúng tuyến SQL. Cập nhật manifest10 cho nguồn cuối sau khi hoàn tất tài liệu. Clone `release/GIT_DEPLOY_WORK` giữ nguyên commit người dùng29acd03/cache96, không chép/commit/push/đổi remote.

Bản sao gói97 dùng tạm khi dựng gói98 được dọn sau khi kiểm; rollback nguồn97 có hash đã đối chiếu vẫn giữ. Không dọn Excel/ảnh nguồn/lịch sử HS hoặc thư mục dự án tham chiếu. **Hoàn tất mã và gói cục bộ; NOT READY FOR FINAL LOCK trên hệ thống thật** cho đến khi hoàn thành SQL/JWT/Function/UAT tách biệt nêu trên. Agent chưa SQL/push/deploy thật.
