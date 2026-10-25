# Trần Phú — bản6.5.0 (25/10/2026)

Bản này đồng bộ mã nguồn/cache74: sơ đồ gọn theo mẫu mới, ảnh nhỏ19KB, chọn tổ trực tiếp; điểm danh/nhận xét tự lưu; thông tin các tiết trước của lớp; quản lý học sinh; nhập số/ngày TKB và quản trị xác nhận bản đang áp dụng. Gói có Function quản lý tài khoản và SQL cập nhật, không có dữ liệu học sinh hoặc tài khoản thử. Chưa áp dụng SQL hoặc triển khai thật.

## Cập nhật CSDL Supabase

Sao lưu CSDL của trường trước. Mở SQL Editor đúng dự án, chạy `SQL/00_KIEM_TRA_HIEN_TRANG.sql` (chỉ đọc), rồi theo kết quả:

| Hiện trạng đã có | Thứ tự chạy tiếp |
|---|---|
| SQL08/module26 (xem các tuần trước) | **09 →03** |
| Đã đủ29 | **03** để hậu kiểm |
| SQL07/module25 | **08 →09 →03** |
| Module23 (đã tách admin/GV) | **07 →08 →09 →03** |
| Module21 | **05 →07 →08 →09 →03** |
| Module20 chưa21 | **02 →05 →07 →08 →09 →03** |
| Chưa có bảng v4, đã có CSDL TKB gốc | **01 →03** |
| Module cài một phần | Dừng và đối chiếu các bước còn thiếu; không chạy01 |

Số bên trên là file trong thư mục SQL của gói. Mỗi file chạy xong thành công rồi mới chạy file kế tiếp. Không chạy tất cả file từ00đến09. **Không chạy lại01 trên CSDL đã có module.**

File09_CAP_NHAT_QUAN_LY_LOP_VA_TKB.sql gom nguồn27→28→29 trong một transaction. Nó bổ sung hàm quản lý học sinh, số/ngày và áp dụng TKB, nhóm ghi nhận các tiết học; không xóa lịch sử, không đổi năm/số hoặc tự kích hoạt TKB hiện có. Có guard dừng nếu nền/schema thiếu. Chạy lại09 giữ dữ liệu. Sau09 không chạy lại08 riêng vì08 sẽ thay hàm handoff29; nếu cần chạy08 thì09 phải theo sau.

File03 là hậu kiểm chỉ đọc:19 bảng v4 bật RLS; daily_learning/handoffs SECURITY DEFINER=false, anon=false/authenticated=true;5 hàm quản lý mới SECURITY DEFINER=true, anon=false/authenticated=true; trigger không được anon/authenticated gọi trực tiếp. Các cờ weekly_history, linked_account_sync, lesson_highlights, future_timetable_guard phải true. SQL Editor không đại diện JWT giáo viên nên vẫn cần thử bằng tài khoản thật.

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
git commit -m "Update Tran Phu 6.5.0"
git push origin main
```

Chỉ tiếp tục khi pull và kiểm gói báo thành công. Không force push, không git init lại. Giữ.gitattributes để không đổi CRLF/LF làm lệch checksum. CHECKSUMS.json đã bao gồm tệp mới; không sửa checksum để che lỗi copy.

## Netlify

Cấu hình đã có ở netlify.toml: Base directory để trống, build `node scripts/verify-release.mjs`, publish `SITE_NETLIFY`, Functions `netlify/functions`, Node22. SQL và Function nằm ngoài thư mục public. Giữ các biến môi trường hiện có cho Functions: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, PUBLIC_SITE_URL. Service role phải là secret; URL/anon là cấu hình công khai. Không đưa khóa riêng vào Git. Không tắt quét bí mật. Không kéo riêng SITE_NETLIFY lên Netlify Drop vì cấp tài khoản cần build Function.

Khi Netlify đã nối nhánh main, push sẽ kích hoạt deploy theo cấu hình site. Sau deploy kiểm trang công khai chỉ xem TKB giáo viên/lớp; đăng nhập tường minh Enter/nút; admin và GV tách riêng; lịch riêng đúng buổi; điểm danh/nhận xét trong ngày; GVCN quản lý lớp/xếp chỗ; thông tin tiết trước và xuất báo cáo đúng quyền. Dữ liệu cục bộ không thay cho nghiệm thu máy chủ thật.

Mã phát triển chính ở SITE_NETLIFY của dự án nâng cấp. Thư mục release chỉ là kết quả đóng gói; không sửa source từ clone phát hành.
