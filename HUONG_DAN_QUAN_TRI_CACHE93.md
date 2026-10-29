# Hoàn thiện giao diện quản trị — cache93, 28/10/2026

Phạm vi: cổng Quản trị và trang TKB/PCCM/PPCT nhúng, nguồn tại SITE_NETLIFY. Đây là hoàn thiện cục bộ theo kế hoạch sáu giai đoạn; chưa triển khai Netlify/Supabase thật và chưa thay thế nghiệm thu của quản trị nhà trường.

## 1. Cấu trúc và quyền

| Nhóm | Công việc và dữ liệu | Quyền hiện hành |
|---|---|---|
| Tổng quan quản trị | TKB đang áp dụng, việc cần đối chiếu, tài khoản chưa liên kết, hộp thư góp ý | Admin |
| TKB và phân công | Metadata, tệp nhập, kiểm tra/lưu nháp, phiên bản/áp dụng, đồng bộ quyền, PPCT/PDF, lịch tuần, QR | Admin; thao tác ghi qua API/RLS hiện hành |
| Lớp và học sinh | Quản lý danh sách theo lớp, nhập Excel, xếp chỗ và luân chuyển | Admin; GVCN vẫn có luồng đúng lớp riêng |
| Tài khoản | Cấp, tìm, hồ sơ, cấp lại mật khẩu và quyền báo cáo | Admin; dịch vụ máy chủ xác minh |
| Báo cáo | Báo cáo, ghi nhận ngoài tiết và lưu ý theo quyền được cấp | Giữ kiểm tra quyền ở API và giao diện |
| Cấu hình | Khung giờ, mẫu nhận xét, tiếp nhận/giải quyết góp ý | Admin |

Không cấp quyền ghi tiết thay giáo viên, không mở dữ liệu sức khỏe/hỗ trợ ngoài quyền sẵn có. GVCN chỉ cấu hình luân chuyển lớp mình; admin theo RPC v4_can_arrange_seats; GVBM chỉ đọc sơ đồ. Không SQL mới cho giao diện93.

## 2. Tổng quan từ dữ liệu có nguồn

TKB hiện hành lấy từ bản is_active và published đang được ứng dụng đọc. Số chưa liên kết/vấn đề định danh lấy từ mô hình đối chiếu TKB/PCCM/danh bạ đã tải. Chưa có kết quả thì hiện Chưa có kết quả, không thay bằng0. Lỗi làm mới đối chiếu đánh dấu kết quả cũ có thể đã thay đổi và khóa đồng bộ.

Góp ý chỉ hiển thị số sau khi đọc thành công toàn bộ trạng thái; bộ lọc không làm thay đổi số chờ xử lý. Trên Tổng quan, trong khi đọc/lỗi, trạng thái là chưa kiểm tra; huy hiệu trong nhóm Góp ý có thể giữ số đã đọc lần trước. Hai phản hồi về sai thứ tự không ghi đè bộ lọc mới. Mỗi mục có nút đi tới đúng chức năng hoặc bộ lọc Chờ xử lý. Các lối tắt học sinh/tài khoản/TKB gọi lại nút và định tuyến đã có kiểm quyền.

## 3. Bố cục và điều khiển

Sáu nhóm dùng nút có trạng thái chọn và tên truy cập; nhóm chi tiết mở khi cần. Chuyển nhóm giữ nguyên biểu mẫu đang nhập. Khung giờ chưa lưu cũng được giữ khi vẽ lại admin cùng tài khoản/năm học; chỉ đặt lại mốc nháp sau lưu thành công. Các màn hình con có nút quay về Quản trị. Giữ thanh trên và menu theo quyền đang dùng của cổng.

Ô nhập/select/textarea co trong cột bằng minmax(0,1fr), min-width0 và border-box. Nhóm lệnh có khoảng cách, tự xuống hàng khi cần; các bảng dài cuộn trong vùng riêng và tiêu đề cột ghim. Điện thoại xếp biểu mẫu một cột, thẻ/nhãn tự xuống dòng.

Hai điều khiển của hộp thư (lọc trạng thái/Làm mới) là lưới hai cột, căn đáy, cao44px; nhãn Lọc nằm phía trên select. Có phép đo cùng tọa độ top và cùng chiều cao tại360/390/768/1024/1440/1920px.

Thanh điều hướng cố định được tính bằng chiều cao thực. Vùng admin có khoảng cuộn dưới; khi mở mục hoặc focus ô nhập/nút trên màn hình nhỏ, điều khiển được đưa lên trên menu. Ảnh feedback-visible-390.png là bằng chứng sửa lỗi menu che nút người dùng gửi.

## 4. Luồng dữ liệu

- TKB: thêm hướng dẫn Thông tin/tệp → Kiểm tra/lưu bản nháp → Phiên bản/áp dụng. Có lối tắt PPCT/PDF, lịch tuần và QR. Nút lưu bản nháp và thao tác Áp dụng TKB tách rõ. Không đổi RPC công bố hoặc quyền. Tìm phiên bản tự mở phần lưu có kết quả; xóa từ khóa khôi phục trạng thái phần lưu trước đó; có trạng thái không có kết quả.
- Excel học sinh: vô hiệu kết quả cũ ngay khi chọn tệp khác; chặn kết quả đọc cũ về muộn; chỉ ra thiếu/sai/trùng tới từng dòng thực Excel, kể cả sau dòng50. Chỉ cho nhập khi toàn bộ tệp hợp lệ. Xác nhận hiển thị số dòng; khóa đổi tệp và bấm lặp trong khi xác nhận/gửi. Kiểm tra lại user/năm học/revision trước RPC; payload không gửi trường lỗi giao diện. Chỉ báo thành công sau phản hồi máy chủ. Lỗi/cancel giữ bản xem trước để sửa/thử lại.
- Tài khoản: tìm theo họ tên/mã/môn/tên đăng nhập/lớp chủ nhiệm/lớp dạy. Cấp/cấp lại nằm tại đúng giáo viên; mật khẩu tạm không vào lưu trữ/log, dịch vụ không sẵn sàng khóa ghi. Các kiểm tra hiện hành giữ nguyên.
- Xếp chỗ/luân chuyển: sử dụng luồng đã chốt ởcache91, đúng lớp, xem trước và kiểm soát revision; thay lớp không lưu nhầm. Tác vụ cần kết nối trực tiếp.
- Báo cáo: giữ bộ lọc và phân quyền, trạng thái đang tải/rỗng/lỗi, xuất theo kết quả và quyền máy chủ. Word/Excel/In theo bộ hồi quy hiện hành.
- Cấu hình/góp ý: lưu tại từng mục. Góp ý phân biệt Chờ xử lý/Đã tiếp nhận/Đã giải quyết và giữ số chờ độc lập bộ lọc.

## 5. Kiểm thử

Bài mới test_admin_workspace.py đo sáu nhóm, năm mục mở, hộp tài khoản và trang TKB nhúng trên sáu độ rộng; không giao nhau giữa nút/ô nhập, không tràn trang; ô lọc/Làm mới cùng hàng/cùng cao và nằm trên menu khi focus. Có ca giữ nháp, lối tắt/quay lại, hơn50 dòng lỗi, thay tệp hợp lệ bằng tệp lỗi, nhập một lần/payload sạch/biên nhận thật trong CSDL giả.

Bài mới test_admin_async_state.py giữ hai request góp ý để trả ngược thứ tự và kiểm bản mới thắng; tạo bản TKB lưu giả để kiểm tìm/xóa từ khóa khôi phục cả trạng thái mở và đóng.

Bài điều hướng cũ được cập nhật đi qua nút nhóm thật, giữ các assertion nghiệp vụ/quyền. Fixture standalone about:blank không chờ script ngoài không thể nạp. Các bài kiểm lệnh cho phép xuống hàng và kiểm không giao nhau thay vì ép mọi màn hình cùng một hàng.

Gate84/84 PASS trong lượt đủ20261028T114900Z/summary.json; ba bài ảnh hưởng kiểm lại sau bổ sung giữ nháp đạt tại admin_cache93/final-draft-checks.json. Bài admin mới10 nhóm và async2 nhóm, sáu độ rộng360–1920px;42 JS/MJS/mirror/integrity đạt. Chỉ tài khoản/CSDL giả cục bộ, chưa hosted/UAT/SQL/push/deploy thật. Kết quả chi tiết tại KIEM_THU_MOI_NHAT/admin_cache93/final-regression.json. Bằng chứng gốc lượt đầu được giữ, không ghi lại thành PASS. Kiểm cục bộ không chứng nhận UAT thiết bị thật, tải đa người dùng hay dịch vụ hosted.

## 6. Bàn giao và cập nhật

Nguồn và hai HTML cổng bằng byte; SW93 tải tài nguyên mới, không ép reload biểu mẫu đang nhập. Tài liệu, manifest nguồn, gói frontend và checksum được cập nhật sau kiểm. SQL/module36/gói SQL và clone GIT_DEPLOY_WORK không sửa trong đợt này.

Trước triển khai thật: quản trị lưu bản frontend hiện tại, đọc tuyến nâng cấp SQL đã bàn giao cho hệ thống đang chạy (giao diện93 không có SQL mới), kiểm tra cấu hình Functions/Auth ở môi trường thử, đăng nhập admin/GVCN/GVBM và thực hiện các ca nghiệm thu ở trên bằng dữ liệu thử. Chỉ công bố TKB khi quản trị chọn rõ phiên bản.

Bản frontendcache92 trước thay đổi được giữ tại KIEM_THU_MOI_NHAT/admin_cache93/cache92-rollback.zip. Nếu cần quay lại giao diện, dùng đúng gói này; không phục hồi CSDL cũ hoặc hoàn tác lịch sử học sinh. Việc phát hành website thật vẫn là bước riêng khi có yêu cầu cho phép.
