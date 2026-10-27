# Cập nhật SQL và GitHub — 6.7.0 / cache87

Đây là hướng dẫn để người quản trị tự cập nhật. Chưa chạy SQL, push GitHub hoặc triển khai website thật trong lần hoàn thiện này.

## 1. Chọn đúng gói

Thư mục đã giải nén: `D:\Phần mềm 2026\TKB_TRAN_PHU_NÂNGCẤP\release\TRAN_PHU_GIT_NETLIFY`.

- `SQL`: các bước cập nhật CSDL; không chứa dữ liệu học sinh hoặc bản sao lưu.
- `SITE_NETLIFY`, `netlify`, `scripts`, cấu hình và checksum: phải đưa đầy đủ lên GitHub.
- Hai ZIP cùng ngày trong `release` chứa gói Git/Netlify và gói SQL riêng. Không tải ZIP lên làm mã website.

## 2. Cập nhật Supabase trước, mã website sau

1. Xác nhận đúng dự án Supabase và bản sao lưu gần nhất. Lưu bản sao lưu ngoài thư mục Git. Khôi phục thử vào môi trường riêng trước khi dùng cho dữ liệu thật. Không bấm Restore trên dự án thật để thử nghiệm.
2. Vào Supabase → SQL Editor → New query. Mở `SQL/00_KIEM_TRA_HIEN_TRANG.sql`, chép toàn bộ nội dung và Run. Đây là kiểm tra chỉ đọc.
3. Dựa vào `suggested_path` và lịch sử các bước đã chạy, chọn một hàng dưới đây. Số là tiền tố tên tệp trong `SQL`, không phải tên module trong `DATABASE`.
4. Chạy từng tệp đầy đủ, thành công mới chạy tệp tiếp theo. Nếu có lỗi: dừng, lưu thông báo; không bỏ qua guard hay chạy lại bộ cài mới.

| Đã cập nhật đến | Các tệp cần chạy |
|---|---|
| SQL12/module34, hoặc đã có SQL35 cũ | **13 → 03** |
| SQL11/module33 | **12 → 13 → 03** |
| SQL10/module31 | **11 → 12 → 13 → 03** |
| SQL09/module29 | **10 → 11 → 12 → 13 → 03** |
| SQL08/module26 | **09 → 10 → 11 → 12 → 13 → 03** |
| SQL07/module25 | **08 → 09 → 10 → 11 → 12 → 13 → 03** |
| Module23 | **07 → 08 → 09 → 10 → 11 → 12 → 13 → 03** |
| Module21 | **05 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 03** |
| Module20 | **02 → 05 → 07 → 08 → 09 → 10 → 11 → 12 → 13 → 03** |
| Chưa có module quản lý học sinh, đã có CSDL TKB gốc | **01 → 03** |
| Cài dở hoặc không khớp các mốc | Đối chiếu schema trước; không tự chạy01 |

**Không chạy01 trên CSDL đang có module. Không chạy tất cả tệp theo số.** SQL04 (sửa năm học) là tác vụ riêng, chỉ chạy sau đối chiếu; SQL06 chỉ kiểm kê. Không nhập lại học sinh, không xóa bảng, không thay năm học hoặc kích hoạt lại TKB chỉ để nâng phiên bản.

Tệp mới `13_GOP_Y_VA_GIOI_HAN_GUI.sql` tương ứng module35 đã sửa. Chạy cả khi từng cài35 cũ; nó thay hàm, thêm chỉ mục và giữ góp ý hiện có. SQL13 yêu cầu SQL12/module34. Cài mới01 đã chứa bản35 sửa, không cần13 nữa.

## 3. Đọc kết quả hậu kiểm03

- Tất cả bảng `v4_*`: `rls_enabled = true`.
- Các cờ lịch sử tuần, đồng bộ tài khoản, nhóm ghi nhận, chặn TKB tương lai, Tổng quan, xác nhận điểm danh, xếp chỗ: `true`.
- `feedback_guard_v2_installed = true`.
- Ba hàm góp ý đều `installed = true`, `security_definer = true`, `authenticated_execute = true`. Chỉ `v4_submit_feedback` có `anon_execute = true`; hai hàm xem/cập nhật phải `false`.
- Hai dòng quyền bảng góp ý cho `anon` và `authenticated`: RLS `true`; quyền trực tiếp SELECT/INSERT/UPDATE/DELETE đều `false`.

Hậu kiểm chỉ xác minh schema/quyền, không thay thế đăng nhập thử bằng các vai trò trên môi trường thử.

## 4. Lệnh PowerShell chuẩn bị và đẩy GitHub

Clone hiện có đã đối chiếu với repository `https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh.git`. Chạy khối sau trong PowerShell. Các kiểm tra dừng nếu thư mục có sửa đổi, sai nhánh/remote, pull thất bại hoặc gói lệch checksum.

```powershell
$ErrorActionPreference = 'Stop'
$releaseSource = 'D:\Phần mềm 2026\TKB_TRAN_PHU_NÂNGCẤP\release\TRAN_PHU_GIT_NETLIFY'
$deployClone = 'D:\Phần mềm 2026\TKB_TRAN_PHU_NÂNGCẤP\release\GIT_DEPLOY_WORK'
Set-Location -LiteralPath $deployClone
if (!(Test-Path -LiteralPath '.git')) { throw 'Không phải clone Git đã chuẩn bị.' }
$expectedRemote = 'https://github.com/abcthuyduongan/tkb_v-_qu-n_l-_h-c-_sinh.git'
$actualRemote = git remote get-url origin
if ($LASTEXITCODE -ne 0 -or $actualRemote -ne $expectedRemote) { throw 'Sai repository origin.' }
$branchName = git branch --show-current
if ($LASTEXITCODE -ne 0 -or $branchName -ne 'main') { throw 'Cần kiểm tra và chuyển đúng nhánh main.' }
$pendingChanges = git status --porcelain
if ($LASTEXITCODE -ne 0 -or $pendingChanges) { throw 'Clone có thay đổi. Lưu/đối chiếu trước; không ghi đè.' }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw 'Pull thất bại. Dừng để xử lý; không force push.' }
node "$releaseSource\scripts\verify-release.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Gói nguồn chưa đạt kiểm tra.' }
Get-ChildItem -LiteralPath $releaseSource -Force | ForEach-Object {
    if ($_.Name -eq '.git') { throw 'Gói nguồn không được chứa .git.' }
    Copy-Item -LiteralPath $_.FullName -Destination $deployClone -Recurse -Force
}
node scripts/verify-release.mjs
if ($LASTEXITCODE -ne 0) { throw 'Gói trong clone chưa đạt kiểm tra.' }
git status --short
git diff --stat
```

Xem danh sách thay đổi: chỉ mã/gói phát hành, không có `.env`, bản sao lưu dữ liệu hay khóa bí mật. Sau đó chạy từng lệnh:

```powershell
git add .
if ($LASTEXITCODE -ne 0) { throw 'git add thất bại.' }
git diff --cached --stat
git commit -m "Complete Tran Phu cache87 feedback and SQL upgrade"
if ($LASTEXITCODE -ne 0) { throw 'Commit chưa thành công; đọc thông báo trước khi tiếp tục.' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push chưa thành công; không force push.' }
```

Push lên `main` có thể kích hoạt Netlify tự triển khai nếu site đã nối repository. Chỉ thực hiện bước push sau khi SQL và kiểm thử môi trường riêng đạt. Không chạy `git init`, không dùng `--force`, không đổi checksum để bỏ qua lỗi. Nếu `nothing to commit`, kiểm tra `git status` và `git log -1` để xác định bản đã có, thay vì tạo commit rỗng.

## 5. Kiểm tra sau triển khai

Netlify: Base directory trống; Build `node scripts/verify-release.mjs`; Publish `SITE_NETLIFY`; Functions `netlify/functions`; Node22. Giữ cấu hình Functions hiện có, không chép service role vào mã frontend/Git.

Đóng và mở lại tab/PWA để nhận cache87. Trên môi trường thử: đăng nhập/F5, TKB, điểm danh và nhận xét trong ngày, báo cáo GVCN, BGH chỉ đọc, admin xếp chỗ; góp ý tự điền tên, gửi thành công, huy hiệu không mất khi lọc “Đã tiếp nhận”. Thử Android/iPhone và PC; xác nhận footer ở cuối nội dung và thanh chức năng không che nút.

Giới hạn góp ý: 5 lượt/10 phút/tài khoản; khách chưa đăng nhập dùng chung20 lượt/10 phút toàn hệ thống. Đây là chặn tần suất ở CSDL, không phải CAPTCHA hoặc chống tấn công mạng; một khách có thể dùng hết phần chung. Khi hết giới hạn, chờ cửa sổ10 phút. Dữ liệu cũ không bị rút gọn hoặc xóa.

Thiết bị thật, Auth/JWT/Functions hosted, khôi phục bản sao lưu và dùng thử 3–5 giáo viên vẫn cần nghiệm thu thực tế; kết quả tự động cục bộ không xác nhận các mục này. Nếu gặp lỗi sau triển khai, ghi thời điểm và lỗi, tạm dừng thao tác ghi; khôi phục bản triển khai Netlify trước nếu cần. Không tự xóa module35 hoặc khôi phục CSDL đè lên dữ liệu mới phát sinh.

Tham khảo chính thức: [Supabase backup](https://supabase.com/docs/guides/platform/backups), [Git pull --ff-only](https://git-scm.com/docs/git-pull), [Git push](https://git-scm.com/docs/git-push). Dự án này dùng bộ SQL Editor có thứ tự; không chạy thêm `supabase db push` nếu chưa quản lý lịch sử migration CLI tương ứng.
