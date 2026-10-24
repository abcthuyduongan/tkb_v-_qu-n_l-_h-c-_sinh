# Trần Phú — mã nguồn Git và chuẩn bị Netlify

Bản ứng viên24/10/2026. Ứng dụng gốc đạt41/41 bộ cục bộ; chưa nghiệm thu Supabase/Netlify thật. Đây không phải bản sao lưu CSDL. Không có tài khoản thử, mật khẩu hoặc service key trong gói.

## 1. Cập nhật CSDL đúng hiện trạng

Sao lưu CSDL/schema/quyền trước khi chạy file ghi; xác nhận đúng dự án trường. Mở Supabase SQL Editor và chạy `SQL/00_KIEM_TRA_HIEN_TRANG.sql` trước. Tệp này chỉ đọc, không chứa hồ sơ HS.

- Nếu CSDL đã hoàn tất các bước đến20: đối chiếu kết quả hiện trạng, chạy `SQL/02_CAP_NHAT_TU_20_LEN_21.sql`, sau đó `SQL/03_KIEM_TRA_SAU_CAP_NHAT.sql`.
- Nếu chưa có bất kỳ bảng v4 nào nhưng đã có schema TKB gốc: chạy `SQL/01_CAI_MODULE_MOI_TREN_CSDL_TKB.sql`, sau đó03. File01 có guard chặn nếu module đã tồn tại và một transaction cho toàn bộ cài mới01→21.
- Nếu module mới được cài một phần: chỉ áp dụng các bước còn thiếu đã đối chiếu từ `SQL/steps`, theo thứ tự dưới đây. Không chạy lại cả01 vì có thể làm mất hiệu lực các chính sách đã nâng cấp. Không suy mức migration chỉ từ một hàm tồn tại.
- Nếu thiếu schema TKB gốc: dừng. Gói này nâng cấp CSDL TKB đang có, không chứa bootstrap Auth giả hoặc tạo TKB trắng thay dữ liệu của trường.

Thứ tự bước ghi:01 →03 →05 →06 →08 →09 →10 →11 →12 →13 →14 →15 →16 →17 →19 →20 →21. Các file02/04/07/18 trong steps là kiểm tra chỉ đọc. File03 trong thư mục chính SQL là kiểm tra sau cập nhật, khác với bước03 trong steps. Khi dùng cập nhật02, không chạy riêng steps/21 nữa. Nếu SQL báo lỗi, dừng và giữ nguyên lỗi để đối chiếu; không xóa bảng hoặc bỏ RLS để chạy tiếp.

Sau SQL03 cần thấy2 RPC SECURITY INVOKER (security_definer=false), anon không EXECUTE, authenticated có EXECUTE; các bảng v4 bật RLS. Kiểm tra tiếp bằng tài khoản/JWT thật vì SQL Editor có quyền khác giáo viên. SQL mới không tạo tài khoản Auth, không tạo quyền admin và không nhập học sinh/TKB mẫu.

## 2. Đưa lên GitHub

Giải nén ZIP rồi đưa TOÀN BỘ nội dung thư mục lên gốc một repository, gồm các file ẩn `.gitignore`, `.gitattributes`, `.nvmrc`, `.env.example`. Giữ `.gitattributes` để Git không tự đổi dòng CRLF/LF làm sai checksum khi build trên Netlify. Không chỉ đưa SITE_NETLIFY lên Git. Không đưa chính ZIP lên làm mã website.

```text
git init
git add .
git commit -m "Prepare Tran Phu deployment"
git branch -M main
git remote add origin https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh.git
git push -u origin main
```

Thay URL bằng repository của bạn. Các lệnh trên dành cho repository mới; repository đã có phải dùng quy trình cập nhật hiện hành, không force push. Repository đích đã được người dùng xác nhận: https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh .

## 3. Kết nối Netlify với GitHub

Import repository từ GitHub, chọn nhánh main. Base directory để trống (gốc repository). `netlify.toml` gốc đã đặt:

| Cấu hình | Giá trị |
|---|---|
|Build command|node scripts/verify-release.mjs|
|Publish directory|SITE_NETLIFY|
|Functions directory|netlify/functions|
|Node|22|

Không kéo riêng SITE_NETLIFY lên Netlify Drop vì cần triển khai cả Function cấp/reset/đổi mật khẩu. SQL và Function được đặt NGOÀI publish directory. Mã Function chỉ đổi đường dẫn import helper phù hợp cấu trúc gói; nghiệp vụ giữ nguyên bản đã kiểm thử.

Trong Netlify Environment variables, đặt scope Functions:

| Biến | Giá trị |
|---|---|
|SUPABASE_URL|URL dự án Supabase trường|
|SUPABASE_SERVICE_ROLE_KEY|service_role key, chỉ lưu phía server|
|SUPABASE_ANON_KEY|anon/public key cùng dự án|
|PUBLIC_SITE_URL|origin chính xác, ví dụ https://ten-trang.netlify.app|

`.env.example` chỉ hướng dẫn tên biến; không điền secret rồi commit. Không đặt service key trong tkb-config.js/netlify.toml. Nếu dùng Deploy Preview, PUBLIC_SITE_URL của context thử phải khớp origin bản thử. Khóa công khai và URL frontend đang giữ từ dự án hiện có tại `SITE_NETLIFY/assets/tkb-config.js`; nếu đổi Supabase thì phải cập nhật đồng bộ frontend và biến Functions, rồi kiểm tra lại. Khi thay file hợp lệ, sau khi kiểm tra thay đổi hãy chạy `node scripts/update-checksums.mjs` rồi `node scripts/verify-release.mjs`; commit CHECKSUMS.json đã cập nhật, không bỏ kiểm tra checksum.

## 4. Trước mở dùng thật

Sau deploy xác nhận Function teacher-accounts có trong Netlify, rồi kiểm tra admin/GVCN/GVBM và GV khác lớp: đăng nhập, cấp/reset tài khoản, buộc đổi mật khẩu, tự đổi, khôi phục tiết, điểm danh→nhận xét,5 mức màu, nhận định nguồn hệ thống/giáo viên, xếp chỗ và xuất Excel/Word. Kiểm tra khóa qua ngày Việt Nam, thu hồi quyền, backup/restore và dùng thử một tuần tại trường. Chưa kết luận FINAL LOCK trước các bước này.

## Kiểm tra gói và nguồn hướng dẫn

Chạy `node scripts/verify-release.mjs` tại thư mục gốc để kiểm checksum/import/layout. CHECKSUMS.json kiểm toàn bộ nội dung gói; không chứa service key hoặc dữ liệu học sinh.

[Netlify build configuration](https://docs.netlify.com/build/configure-builds/file-based-configuration/), [Netlify Functions configuration](https://docs.netlify.com/build/functions/configuration/), [Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/), [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations).

SQL Editor không tự ghi lịch sử Supabase CLI migrations. Nếu dự án đang dùng CLI migrations, cần đối chiếu/đồng bộ lịch sử trước, không chạy thêm db push mù quáng sau SQL Editor.
