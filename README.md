# Trần Phú — 6.7.0/cache98 (29/10/2026)

Cache98: mở rộng sơ đồ xếp chỗ, tìm học sinh, chọn trực tiếp để gán/chuyển/đổi hai học sinh và hoàn tác thao tác cuối hợp lệ; lưu máy chủ nguyên tử và chống gửi lặp. GVCN đúng lớp/admin giữ quyền hiện hành. Tổng quan đưa việc cần làm trước biểu đồ; Báo cáo có khung lọc gọn, menu xuất đúng quyền, GVCN có Tổng quan/Học sinh/Tiết-Môn/Nhật ký. Cần SQL16/module40 sau SQL15/module39 cho thao tác ghế mới; thiếu cập nhật thì sơ đồ chỉ xem và nêu cần cập nhật. Chi tiết kết quả và giới hạn trong báo cáo thực hiện đi kèm. Chưa SQL/push/deploy thật.

Cache97: Tiết tôi dạy có thanh tuần/bộ lọc gọn, thẻ trạng thái ngắn, nguồn mở khi cần; điện thoại mở gần ngày hôm nay và giữ vị trí cuộn. Đọc PPCT đã công bố của môn/lớp, gồm Tin/Tin học và phạm vi Khối, theo lịch tuần trường và phiên bản TKB. Ô tiết hiển thị sốPPCT/tên bài theo kế hoạch; có tài liệu nhưng chưa ghép được sẽ nêu phần cần đối chiếu. Không đổi bài đã dạy/nhận định cũ. PPCT đọc khi mở báo cáo, dùng lại30giây; không tải PDF/Excel. Không có SQL mới cho97, tính năng95 vẫn cần SQL15. Báo cáo và giới hạn kiểm chứng trong THUC_HIEN_DANH_GIA_LAI_VA_BAO_CAO_2026_10_28.md; chưa push/deploy bởi agent.

Cache96 tối ưu tải: công cụ quản trị, quản lý học sinh và bộ tạo báo cáo trên luồng chính chỉ nạp khi dùng; đăng nhập/đổi mật khẩu giữ sẵn. Báo cáo cá nhân không gọi thêm báo cáo lớp, chia sẻ truy vấn đang chạy và dùng lại kết quả tối đa30giây, Làm mới/thay đổi dữ liệu vẫn cập nhật. Cache nâng cấp tái dùng đúng URL có phiên bản, vẫn kiểm HTML/config mới và chỉ thay HTML khi đủ tài nguyên. Tài nguyên tùy chọn vẫn lưu trong shell để giữ khả năng dùng bản đã tải khi ngoại tuyến; lần cài PWA đầu vẫn có tải nền. Không có SQL mới cho tối ưu96; các tính năng95 bên dưới vẫn cần SQL15/module37–39. Kiểm chứng và giới hạn trong báo cáo duy nhất THUC_HIEN_DANH_GIA_LAI_VA_BAO_CAO_2026_10_28.md. Chưa push/deploy thật.

Cache95: Đánh giá lại hôm nay dùng đúng tiết cũ; thu hồi nhận xét nhầm có lý do/lịch sử; Báo cáo riêng cho GV bộ môn, cá nhân theo TKB/lớp/môn và GVCN có minh chứng nhiều môn, số tiết/ngày vắng. Có SQL15/module37–39; đang có36:00→15→03,35cũ:00→13→14→15→03. Không chạy01 trên CSDL có module. PPCT thiếu liên kết theo tiết được ghi rõ, không tự suy bài đã dạy. Hướng dẫn và trạng thái chốt trong THUC_HIEN_DANH_GIA_LAI_VA_BAO_CAO_2026_10_28.md; chưa SQL/push/deploy thật.

Cache94: trang Xếp chỗ của GVCN/admin mở tại bàn đầu ở dưới, cuộn lên xem cuối lớp; có Đầu lớp và giữ vị trí khi sửa chỗ/đổi nhóm/đổi lớp. Chỉ đổi cách hiển thị, giữ sơ đồ gốc, quyền/RPC và xem trước luân chuyển tuần. Đọc HUONG_DAN_XEP_CHO_CACHE94.md. Chưa push/deploy thật.

Cache93: Quản trị gồm sáu nhóm công việc, tổng quan từ dữ liệu có nguồn, bước lưu nháp/áp dụng rõ ràng, tìm bản lưu TKB, lỗi Excel từng dòng và chống nhập lặp; ô lọc/Làm mới căn cùng hàng và không bị menu che. Đọc HUONG_DAN_QUAN_TRI_CACHE93.md. Không có SQL mới cho giao diện93; chưa push/deploy thật.

Cache92: mở bản đã lưu ngay khi mạng yếu, tải mới ở nền; điểm danh, nhận xét trong tiết, nhận định và mở tiết có hàng đợi trên thiết bị, tự gửi khi có mạng trong ứng dụng đang mở hoặc khi mở lại. Có Chờ gửi/Cần xử lý, tải bản sao, chống trùng và giữ khóa ngày. Kiểm tra/kết nối tự động yên lặng; chỉ một nút Wi-Fi20px xanh/đỏ ở thanh trên cùng, không thêm thanh thông báo. Không thêm SQL; tác vụ quản trị cần kết nối. Đọc HUONG_DAN_NGOAI_TUYEN_CACHE92.md trong gói. Chưa push/deploy thật.

Cache91 thêm luân chuyển dãy/hàng bàn hằng tuần: GVCN hoặc quản trị chọn tổ, hướng ngang và hướng trước–sau từng tổ, thứ Hai bắt đầu, xem trước trước khi lưu. Sơ đồ gốc giữ nguyên; mọi giáo viên xem vị trí theo ngày máy chủ. Cần SQL14/module36; bản cache95 cần thêm SQL15 theo bảng nâng cấp bên dưới. Chưa chạy trên CSDL thật hoặc deploy.

Cache90 thêm nút mắt hiện/ẩn mật khẩu ở đăng nhập và đổi mật khẩu; điểm danh mở tại bàn đầu phía dưới, cuộn lên quan sát cuối lớp, nút điểm danh lớn và nhận xét theo nhóm, Trước/Tiếp từng học sinh. Cập nhật giao diện này không cần SQL mới. Chi tiết kiểm chứng cục bộ tại DOCS/GIAO_DIEN_DIEM_DANH_TU_DUOI_LEN_2026_10_28.md của dự án chính. Chưa push/deploy.

Đã hoàn thiện tuyến nâng cấp SQL35, giới hạn gửi góp ý, tự điền danh tính và huy hiệu. Hướng dẫn chi tiết và lệnh PowerShell: CAP_NHAT_SQL_VA_DAY_GITHUB_CACHE87.md trong gói. Chưa chạy SQL/push/deploy thật.

**Bản cập nhật cục bộ; chưa phát hành trên website thật.**

Bổ sung Tổng quan theo quyền, báo cáo trực quan, quyền Ban Giám Hiệu trên tài khoản giáo viên, lịch sử truy cập, nhận định nhanh và điểm danh tự động chờ xác nhận. Chỉ giáo viên phụ trách được xác nhận/điều chỉnh trong ngày Việt Nam; BGH theo dõi. Lớp chưa xếp chỗ dùng danh sách học sinh. Bộ lọc báo cáo Tuần/Tháng/Học kỳ, mở Lọc thêm khi cần.

Có mặt tự động là trạng thái do máy chủ tính sau giờ kết thúc trên danh sách đã chụp khi mở tiết, không phải điểm danh do giáo viên xác nhận. Không cần mở trình duyệt hoặc lịch chạy nền; không tạo tiết chưa mở, không thay số liệu cũ. Dữ liệu điểm danh thật giữ nguyên; các tệp xuất ghi rõ số lượt tự động được thống kê riêng.

SQL10 gộp30/31: quyền BGH và hoạt động tài khoản. SQL11 gộp32/33: danh sách học sinh của tiết, xác nhận điểm danh, lịch sử thay đổi, nhận định nhanh và Tổng quan. Bản cập nhật không tự gán BGH cho tài khoản cũ. Chạy lại giữ điểm danh và danh sách đã chụp. Khi cập nhật mã, mở bản mới để nhận cache98; giữ nháp theo hướng dẫn ngoại tuyến.

SQL12 bổ sung xếp chỗ cho quản trị sau SQL11; không trao quyền đánh giá tiết hoặc nhật ký hỗ trợ. Bố cục nút lệnh dùng chung hàng theo độ rộng thiết bị, bộ công cụ dài cuộn trong thanh riêng.

Tổng quan mở đầu cho các tài khoản; tiết đang làm dở và liên kết chức năng được giữ ưu tiên. Cấp/cấp lại mật khẩu tạm theo họ tên viết liền không dấu +123456, buộc đổi lần đầu, mật khẩu riêng tối thiểu8 ký tự; có sao chép thông tin vừa cấp. GVCN có thông báo phụ huynh tuần cho các trường hợp cần xem lại, tạo PDF riêng từng em và native share văn bản nếu thiết bị hỗ trợ và Chép/mở Zalo/Messenger trên điện thoại, tablet, máy tính. Góp ý cần SQL13/module35 đã sửa, kể cả khi đã cài35 cũ.

## Cập nhật CSDL Supabase

Sao lưu CSDL của trường trước. Mở SQL Editor đúng dự án, chạy `SQL/00_KIEM_TRA_HIEN_TRANG.sql` (chỉ đọc), rồi theo kết quả:

| Hiện trạng đã có | Thứ tự chạy tiếp |
|---|---|
| Module40/SQL16 | **03** hậu kiểm |
| Module39/SQL15 | **16 →03** hậu kiểm |
| Module36–38/SQL14 | **15 →16 →03** |
| Module35/SQL13 đã sửa | **14 →15 →16 →03** |
| Module34/SQL12 hoặc35 cũ | **13 →14 →15 →16 →03** hậu kiểm |
| Module33/SQL11 | **12 →13 →14 →15 →16 →03** |
| Module31/SQL10 | **11 →12 →13 →14 →15 →16 →03** |
| Module29/SQL09 | **10 →11 →12 →13 →14 →15 →16 →03** |
| Module26/SQL08 | **09 →10 →11 →12 →13 →14 →15 →16 →03** |
| Module25/SQL07 | **08 →09 →10 →11 →12 →13 →14 →15 →16 →03** |
| Module23 | **07 →08 →09 →10 →11 →12 →13 →14 →15 →16 →03** |
| Module21 | **05 →07 →08 →09 →10 →11 →12 →13 →14 →15 →16 →03** |
| Module20 | **02 →05 →07 →08 →09 →10 →11 →12 →13 →14 →15 →16 →03** |
| Chưa có module, đã có CSDL TKB gốc | **01 →03** |
| Module cài một phần | Đối chiếu trước, không chạy01 |

Số bên trên là file trong thư mục SQL của gói. Mỗi file chạy xong thành công rồi mới chạy file kế tiếp. Không chạy tất cả file từ00đến16. **Không chạy lại01 trên CSDL đã có module.**

File16_XEP_CHO_NGUYEN_TU_VA_HOAN_TAC.sql bổ sung snapshot, phiên bản sơ đồ, đổi hai vị trí nguyên tử và hoàn tác; giữ dữ liệu ghế cũ. Bảng biên nhận kín bật RLS, tài khoản ứng dụng không được đọc/ghi trực tiếp. File03 hậu kiểm cả hai RPC, trigger phiên bản và quyền bảng biên nhận. Có module39 thì chỉ cần16 rồi03 sau sao lưu/kiểm thử riêng.

File15_DANH_GIA_LAI_VA_BAO_CAO.sql gộp37–39: thống nhất khóa ngày khi sửa nhận xét, thu hồi có lý do/lịch sử và báo cáo tuần cá nhân đúng quyền. File03 kiểm thêm các RPC mới, chính sách chỉ đọc ghi nhận hiệu lực và quyền UPDATE chỉ cột note. Cần hoàn tất SQL15 trước khi nghiệm thu các tính năng cache95.

File09_CAP_NHAT_QUAN_LY_LOP_VA_TKB.sql gom nguồn27→28→29 trong một transaction. Nó bổ sung hàm quản lý học sinh, số/ngày và áp dụng TKB, nhóm ghi nhận các tiết học; không xóa lịch sử, không đổi năm/số hoặc tự kích hoạt TKB hiện có. Có guard dừng nếu nền/schema thiếu. Chạy lại09 giữ dữ liệu. Sau09 không chạy lại08 riêng vì08 sẽ thay hàm handoff29; nếu cần chạy08 thì09 phải theo sau.

File03 là hậu kiểm chỉ đọc:mọi bảng v4 bật RLS; daily_learning/handoffs SECURITY DEFINER=false, anon=false/authenticated=true;5 hàm quản lý mới SECURITY DEFINER=true, anon=false/authenticated=true; trigger không được anon/authenticated gọi trực tiếp. Các cờ weekly_history, linked_account_sync, lesson_highlights, future_timetable_guard phải true. SQL Editor không đại diện JWT giáo viên nên vẫn cần thử bằng tài khoản thật.

04 sửa metadata năm học chỉ khi đã đối chiếu hiện trạng;06 chỉ đọc kiểm kê. Các file dọn bản TKB theo UUID là tác vụ bảo trì riêng, không nằm trong gói này. Không tự gộp/xóa phiên bản cũ để hết cảnh báo.

## Cập nhật GitHub

Repository: https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh.git

Dùng clone hiện có `release/GIT_DEPLOY_WORK`. Kiểm tra giữ thay đổi cá nhân nếu có; pull trước khi chép bản mới. Chép toàn bộ nội dung thư mục TRAN_PHU_GIT_NETLIFY vào clone, gồm các file ẩn, giữ thư mục.git. Không upload ZIP làm website và không chỉ copy SITE_NETLIFY.

```powershell
git pull --ff-only
# Chép nội dung gói sau khi pull thành công.
node scripts/verify-release.mjs
git status --short
git add .
git commit -m "Update Tran Phu 6.7.0"
git push origin main
```

Chỉ tiếp tục khi pull và kiểm gói báo thành công. Không force push, không git init lại. Giữ.gitattributes để không đổi CRLF/LF làm lệch checksum. CHECKSUMS.json đã bao gồm tệp mới; không sửa checksum để che lỗi copy.

## Netlify

Cấu hình đã có ở netlify.toml: Base directory để trống, build `node scripts/verify-release.mjs`, publish `SITE_NETLIFY`, Functions `netlify/functions`, Node22. SQL và Function nằm ngoài thư mục public. Giữ các biến môi trường hiện có cho Functions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, PUBLIC_SITE_URL. Service role phải là secret; URL/anon là cấu hình công khai. Không đưa khóa riêng vào Git. Không tắt quét bí mật. Không kéo riêng SITE_NETLIFY lên Netlify Drop vì cấp tài khoản cần build Function.

Khi Netlify đã nối nhánh main, push sẽ kích hoạt deploy theo cấu hình site. Sau deploy kiểm trang công khai chỉ xem TKB giáo viên/lớp; đăng nhập tường minh Enter/nút; admin và GV tách riêng; lịch riêng đúng buổi; điểm danh/nhận xét trong ngày; GVCN quản lý lớp/xếp chỗ; thông tin tiết trước và xuất báo cáo đúng quyền. Dữ liệu cục bộ không thay cho nghiệm thu máy chủ thật.

Mã phát triển chính ở SITE_NETLIFY của dự án nâng cấp. Thư mục release chỉ là kết quả đóng gói; không sửa source từ clone phát hành.

SQL13_GOP_Y_VA_GIOI_HAN_GUI.sql giữ dữ liệu và bổ sung bảo vệ góp ý;03 kiểm feedback_guard_v2_installed=true cùng ba RPC và quyền bảng.

## Cache88 — chuyển Tổng quan vào thanh chức năng

Theo yêu cầu người dùng: chuyển nút Tổng quan từ header sang mục đầu nav (biểu tượng nhà + nhãn); điện thoại/tablet ở đáy, desktop giữ sidebar. Bỏ handler trùng; giữ quyền và trang mở đầu. Không đổi SQL, không push/deploy. Kiểm giao diện sáu độ rộng và luồng Tổng quan PASS; bộ75 trước là bằng chứng cache87, không phải full cache88.

## Cache89 — nhãn thanh chức năng
Theo yêu cầu: Thời khóa biểu → TKB; Sắp chỗ ngồi → Xếp chỗ. Chỉ đổi nhãn nav, giữ chức năng/quyền. HTML mirror bằng byte; không đổi SQL, chưa push/deploy.
