# Trần Phú — bản bàn giao 6.4.0 (24/10/2026)

Mã đã hoàn thiện theo các góp ý hiện tại và kiểm thử cục bộ. Gói dùng để cập nhật repository GitHub rồi triển khai Netlify. Không phải bản sao lưu CSDL. Chưa xác nhận hoạt động trên Netlify/Supabase thật sau cập nhật.

## Cập nhật bản trường đang dùng

1. Sao lưu CSDL; chạy `SQL/00_KIEM_TRA_HIEN_TRANG.sql` (chỉ đọc).
2. Trường đã có hai RPC daily_learning/handoffs và19 bảng v4 như kết quả đã gửi: nếu hiện trạng00 xác nhận đủ module21, chạy **SQL/05_CAP_NHAT_TU_21_LEN_23.sql**, rồi **SQL/03_KIEM_TRA_SAU_CAP_NHAT.sql**. Không chạy lại01.05 chỉ thay hai hàm kiểm quyền để tách admin/giáo viên; không xóa lịch sử hay tài khoản. Chạy lại05 có cùng kết quả.
3. Nếu còn cảnh báo năm học: chạy `SQL/06_KIEM_KE_PHIEN_BAN_TKB_CHI_DOC.sql`. Chỉ khi TKB active/published dùng năm sai chuẩn mới đối chiếu và chạy04.04 không sửa các bản lưu cũ và sẽ dừng nếu có xung đột hoặc dữ liệu phụ thuộc. Không gộp/xóa3 phiên bản cũ chỉ để hết cảnh báo.
4. Cập nhật toàn bộ mã của gói vào gốc repository hiện tại; kiểm tra build rồi push như bên dưới.
5. Kiểm tra biến môi trường Netlify và chức năng thật sau deploy. Không chia sẻ service key trong chat hoặc Git.

## Đã thay đổi

- Trang đăng nhập có **Theo giáo viên / Theo lớp**, không yêu cầu tài khoản. Lối công khai chỉ hai loại TKB; không mở PCCM, PPCT, báo giảng, PDF từ menu, link trực tiếp hoặc tùy chọn lưu cũ. Đây là giới hạn chức năng giao diện; chính sách dữ liệu TKB công khai hiện hữu giữ nguyên để đối chiếu tên giáo viên.
- Giữ một phiên đăng nhập, dùng chung client khi chuyển trang nhúng; refresh token không đưa người dùng về form và không xóa nháp. Lỗi mạng có Thử lại, không tự đăng xuất.
- Tài khoản quản trị và giáo viên tách riêng. Admin không điểm danh/đánh giá/xếp chỗ; vẫn quản lý, xem TKB và báo cáo. Giáo viên có quyền theo phân công và chủ nhiệm.
- Lịch riêng chỉ lớp/tiết của buổi; thông báo tiết gần nhất, không có tiết hoặc trường không dạy buổi chiều. Khôi phục tiết đang làm trong ngày; qua ngày chỉ đọc.
- Phân biệt thiếu cấu hình dịch vụ tài khoản với lỗi phiên đăng nhập; không cho cấp/reset khi dịch vụ chưa sẵn sàng. Danh bạ giáo viên lấy từ CSDL, giữ đối chiếu hai giáo viên tên Thủy.
- Giữ các chức năng đã chốt: nhận xét sau điểm danh, trạng thái học tập trong ngày, tổng hợp tiết tự động có nguồn, xếp chỗ linh hoạt, báo cáo theo quyền, xuất Excel/Word và giao diện thống nhất.

## Cấu trúc đưa lên GitHub

Đưa **nội dung đã giải nén** vào gốc repository, gồm SITE_NETLIFY, netlify, SQL, scripts, netlify.toml, package.json, package-lock.json, CHECKSUMS.json, README.md và các file ẩn. Không upload chính ZIP làm website. Không chỉ copy SITE_NETLIFY. Giữ `.gitattributes` để Git không đổi CRLF/LF làm sai checksum.

Repository đã xác nhận: https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh.git

Với bản clone hiện có: kiểm tra `git status`, giữ công việc chưa commit nếu có, `git pull --ff-only`, rồi chép đè nội dung gói mới (không đụng `.git` và không đưa secret vào). Đổi tên `README.md` cũ không cần thiết: gói có hướng dẫn hiện hành thay thế.

Chạy trong thư mục clone sau khi chép mã:

```powershell
node scripts/verify-release.mjs
git status --short
git add .
git commit -m "Update Tran Phu 6.4: public timetable and session fixes"
git push origin main
```

Chỉ commit/push nếu lệnh kiểm gói PASS và danh sách thay đổi đúng. Nếu chưa có clone, dùng `git clone` URL trên vào thư mục trống trước khi chép gói. Không `git init` lại repository cũ và không force push. Không chạy script sửa checksum để che lỗi copy; copy lại đúng gói nếu có lệch.

## SQL cho các hiện trạng khác

- Có đủ module20, chưa có21: chạy02 (20→21), rồi05 (21→23), rồi03.
- Chưa có bảng v4, đã có schema TKB gốc: chạy01 (gộp các bước ghi01→21→23 trong một transaction), rồi03.01 chặn nếu module tồn tại.
- Module cài một phần: đối chiếu steps và chỉ áp dụng phần còn thiếu. Thứ tự ghi:01→03→05→06→08→09→10→11→12→13→14→15→16→17→19→20→21→23. Không suy chỉ từ một hàm tồn tại.
- Thiếu schema TKB gốc: dừng; gói không tạo dữ liệu trường giả để thay thế.

Số ở thư mục SQL là thứ tự hướng dẫn; số trong SQL/steps là migration nguồn. Không chạy tất cả file theo tên.02/04/07/18/24 trong steps là kiểm tra chỉ đọc;22 là sửa metadata tùy hiện trạng. SQL03 hậu kiểm cần2 RPC SECURITY INVOKER, anon=false/authenticated=true;19 bảng v4 bật RLS; hai helper quyền có excludes_admin=true. Vẫn cần kiểm bằng tài khoản thật: SQL Editor không đại diện JWT giáo viên.

SQL mới không tạo tài khoản Auth/admin hoặc nhập học sinh/TKB mẫu. SQL Editor không tự ghi lịch sử Supabase CLI migrations; không chạy db push mù quáng sau đó.

## Netlify

Gói có netlify.toml tại gốc repository: Base directory để trống, build `node scripts/verify-release.mjs`, publish `SITE_NETLIFY`, Functions `netlify/functions`, Node22. SQL và Function nằm ngoài thư mục public. Không kéo riêng SITE_NETLIFY lên Netlify Drop vì cần build Function quản lý tài khoản.

Trong Environment variables của đúng site **tkb-tranphu-2026**, đặt giá trị cho Production và bảo đảm có hiệu lực với Functions:

| Biến | Giá trị |
|---|---|
| SUPABASE_URL | URL dự án Supabase trường; khớp tkb-config.js |
| SUPABASE_SERVICE_ROLE_KEY | service_role key của cùng dự án; đánh dấu Contains secret values |
| SUPABASE_ANON_KEY | anon/public key cùng dự án |
| PUBLIC_SITE_URL | https://tkb-tranphu-2026.netlify.app |

Nếu gói tài khoản không có lựa chọn scope, giữ phạm vi mặc định gồm Functions. Không đặt khóa dịch vụ trong netlify.toml/tkb-config.js hoặc `.env.example`. `.env.example` chỉ mô tả tên biến, không được Netlify tự nạp lúc chạy. Sau thay biến môi trường cần deploy mới để Functions nhận cấu hình.

Lỗi “Chưa cấu hình dịch vụ tài khoản” của bản cũ là cấu hình phía máy chủ: chỉ thay mã không bổ sung được biến còn thiếu. Bản mới chỉ rõ thiếu biến nào, phân biệt404 thiếu Function,503 cấu hình và401 phiên người dùng. Thao tác admin kiểm tra status không chứng minh service key hợp lệ; thử cấp/reset thật mới kiểm hết đường đi.

Nguồn: [biến môi trường Functions](https://docs.netlify.com/build/functions/environment-variables/), [cấu hình Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Sau deploy

- Mở cửa sổ riêng tư: trang đăng nhập có hai lựa chọn TKB, chỉ hai mục; không xem được hồ sơ học sinh khi chưa đăng nhập.
- Đăng nhập bằng admin và giáo viên riêng: chuyển trang/tải lại không phải nhập lại; menu/quyền đúng; admin không đánh giá học sinh.
- Admin cấp tài khoản cho một giáo viên có sẵn, giáo viên đổi mật khẩu tạm; kiểm tra cấp lại và tự đổi mật khẩu. Không lưu mật khẩu ở Git hoặc báo cáo.
- Giáo viên kiểm lịch thực, nhận xét trong ngày, khóa qua ngày; chủ nhiệm kiểm sơ đồ và báo cáo. Kiểm sao lưu/khôi phục và nghiệm thu tại trường trước mở rộng.

Các kiểm tra cục bộ và kiểm gói không thay thế cấu hình, JWT/RLS, sao lưu và thử người dùng trên hệ thống thật. Toàn bộ mã nguồn phát triển chính vẫn ở SITE_NETLIFY của dự án nâng cấp, thư mục release chỉ là sản phẩm đóng gói.
