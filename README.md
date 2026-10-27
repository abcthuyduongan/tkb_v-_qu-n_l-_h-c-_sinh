# Trần Phú — 6.7.0/cache87 (27/10/2026)

Đã hoàn thiện tuyến nâng cấp SQL35, giới hạn gửi góp ý, tự điền danh tính và huy hiệu. Hướng dẫn chi tiết và lệnh PowerShell: CAP_NHAT_SQL_VA_DAY_GITHUB_CACHE87.md trong gói. Chưa chạy SQL/push/deploy thật.

**Bản cập nhật cục bộ; chưa phát hành trên website thật.**

Bổ sung Tổng quan theo quyền, báo cáo trực quan, quyền Ban Giám Hiệu trên tài khoản giáo viên, lịch sử truy cập, nhận định nhanh và điểm danh tự động chờ xác nhận. Chỉ giáo viên phụ trách được xác nhận/điều chỉnh trong ngày Việt Nam; BGH theo dõi. Lớp chưa xếp chỗ dùng danh sách học sinh. Bộ lọc báo cáo Tuần/Tháng/Học kỳ, mở Lọc thêm khi cần.

Có mặt tự động là trạng thái do máy chủ tính sau giờ kết thúc trên danh sách đã chụp khi mở tiết, không phải điểm danh do giáo viên xác nhận. Không cần mở trình duyệt hoặc lịch chạy nền; không tạo tiết chưa mở, không thay số liệu cũ. Dữ liệu điểm danh thật giữ nguyên; các tệp xuất ghi rõ số lượt tự động được thống kê riêng.

SQL10 gộp30/31: quyền BGH và hoạt động tài khoản. SQL11 gộp32/33: danh sách học sinh của tiết, xác nhận điểm danh, lịch sử thay đổi, nhận định nhanh và Tổng quan. Bản cập nhật không tự gán BGH cho tài khoản cũ. Chạy lại giữ điểm danh và danh sách đã chụp. Khi cập nhật mã, đóng/mở lại tab cũ để nhận cache87.

SQL12 bổ sung xếp chỗ cho quản trị sau SQL11; không trao quyền đánh giá tiết hoặc nhật ký hỗ trợ. Bố cục nút lệnh dùng chung hàng theo độ rộng thiết bị, bộ công cụ dài cuộn trong thanh riêng.

Tổng quan mở đầu cho các tài khoản; tiết đang làm dở và liên kết chức năng được giữ ưu tiên. Cấp/cấp lại mật khẩu tạm theo họ tên viết liền không dấu +123456, buộc đổi lần đầu, mật khẩu riêng tối thiểu8 ký tự; có sao chép thông tin vừa cấp. GVCN có thông báo phụ huynh tuần cho các trường hợp cần xem lại, tạo PDF riêng từng em và native share văn bản nếu thiết bị hỗ trợ và Chép/mở Zalo/Messenger trên điện thoại, tablet, máy tính. Góp ý cần SQL13/module35 đã sửa, kể cả khi đã cài35 cũ.

## Cập nhật CSDL Supabase

Sao lưu CSDL của trường trước. Mở SQL Editor đúng dự án, chạy `SQL/00_KIEM_TRA_HIEN_TRANG.sql` (chỉ đọc), rồi theo kết quả:

| Hiện trạng đã có | Thứ tự chạy tiếp |
|---|---|
| Module34/SQL12 hoặc35 cũ | **13 →03** hậu kiểm |
| Module33/SQL11 | **12 →13 →03** |
| Module31/SQL10 | **11 →12 →13 →03** |
| Module29/SQL09 | **10 →11 →12 →13 →03** |
| Module26/SQL08 | **09 →10 →11 →12 →13 →03** |
| Module25/SQL07 | **08 →09 →10 →11 →12 →13 →03** |
| Module23 | **07 →08 →09 →10 →11 →12 →13 →03** |
| Module21 | **05 →07 →08 →09 →10 →11 →12 →13 →03** |
| Module20 | **02 →05 →07 →08 →09 →10 →11 →12 →13 →03** |
| Chưa có module, đã có CSDL TKB gốc | **01 →03** |
| Module cài một phần | Đối chiếu trước, không chạy01 |

Số bên trên là file trong thư mục SQL của gói. Mỗi file chạy xong thành công rồi mới chạy file kế tiếp. Không chạy tất cả file từ00đến13. **Không chạy lại01 trên CSDL đã có module.**

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
