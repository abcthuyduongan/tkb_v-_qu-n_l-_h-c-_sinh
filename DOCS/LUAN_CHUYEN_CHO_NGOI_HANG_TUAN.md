# Luân chuyển vị trí hằng tuần — cache91, 28/10/2026

Trong **Xếp chỗ → Luân chuyển vị trí hằng tuần**, GVCN đúng lớp hoặc quản trị có thể chọn các tổ đổi dãy, hướng trái/phải, hướng chuyển hàng bàn riêng từng tổ và thứ Hai bắt đầu. Tổ không chọn đổi dãy giữ nguyên vị trí ngang. Một tổ có thể chỉ chuyển hàng, chỉ đổi dãy hoặc kết hợp cả hai. Hai học sinh cùng bàn luôn chuyển cùng nhau, giữ vị trí trái/phải trong bàn.

## Quy tắc

- Trái/phải tính theo sơ đồ nhìn từ bàn giáo viên; dãy 1 ở bên trái. Các tổ được chọn đổi theo vòng tròn trên những dãy của chính các tổ đó, bỏ qua dãy của tổ cố định. Ví dụ chọn tổ 1 và 3: hai tổ đổi chỗ, tổ 2 và 4 không chuyển.
- Mỗi thứ Hai chuyển một dãy. Với bốn tổ chuyển sang phải: sơ đồ gốc `1–2–3–4`; lần đầu `4–1–2–3`; lần hai `3–4–1–2`; lần ba `2–3–4–1`; lần bốn trở về gốc.
- Dưới lên: bàn đầu (bàn 1, gần giáo viên) lên bàn 2; bàn cuối vòng về bàn 1. Trên xuống là chiều ngược lại. Mỗi tổ luân chuyển trong số bàn của tổ đó, kể cả hàng còn chỗ trống; các tổ có thể có số bàn khác nhau. Khi đổi dãy, tổ giữ số bàn đã xếp của mình.
- Ngày bắt đầu phải là thứ Hai. Trước ngày đó dùng sơ đồ gốc; ngay tuần bắt đầu đã chuyển lần thứ nhất. Mỗi tuần tiếp theo thêm một lần chuyển. Tuần là tuần lịch thứ Hai–Chủ nhật, không dựa vào số tuần PPCT và không tự bỏ tuần nghỉ.
- Xem trước tuần khác chỉ thay hình xem trước. Chỉ **Lưu quy luật** mới áp dụng cho các giáo viên. Tắt và lưu quy luật đưa phần hiển thị về sơ đồ gốc; không đóng băng tại vị trí của tuần vừa xem.

## Sơ đồ gốc và dữ liệu

Sơ đồ gốc vẫn dùng để xếp/chốt học sinh. Phần Điểm danh/Nhận xét tính dãy, hàng bàn từ sơ đồ gốc và quy luật đã lưu; tìm kiếm, Trước/Tiếp, chọn học sinh và ghi điểm danh dùng đúng học sinh ở vị trí đang hiển thị. Tên tổ giữ nguyên, vị trí dãy thay đổi. Không viết lại `v4_seats`, không chuyển lại nhiều lần khi tải trang, không thay điểm danh, nhận xét hoặc quyền dạy học.

Ngày tính tuần lấy từ máy chủ qua RPC. Mở lại ứng dụng luôn tính được tuần hiện hành; trong trang lớp đang mở, kiểm tra lại khi quay về tab và mỗi phút khi tab hiện. Không cần cron hay giữ trình duyệt mở vào đêm Chủ nhật. Khi không đọc được quy luật, giao diện nói rõ đang dùng sơ đồ gốc và yêu cầu làm mới; không coi đó là sơ đồ luân chuyển đã được kiểm tra.

Sửa chỗ hoặc thay danh sách làm sơ đồ chưa chốt sẽ tắt luân chuyển. Thay số tổ/bàn đặt lại quy luật. Giáo viên chốt lại sơ đồ, xem trước và bật/lưu lại khi muốn tiếp tục. Giữ dữ liệu gốc giúp tránh lặp chuyển và mất học sinh.

## Quyền, đồng thời và cập nhật CSDL

`DATABASE/36_v6_weekly_seating_rotation.sql` bổ sung hai cột cấu hình/phiên bản vào `v4_layouts`, không tạo dữ liệu học sinh. RLS hiện có giữ nguyên. RPC đọc dùng SECURITY INVOKER; RPC lưu dùng SECURITY DEFINER, kiểm GVCN thực/quản trị và trạng thái đổi mật khẩu. Anon không được gọi; GVBM đọc được lớp đang có quyền, không được lưu quy luật. Phiên bản cùng thời điểm sơ đồ chống ghi đè từ một biểu mẫu cũ. Cấu hình lưu được audit cùng sơ đồ.

Gói phát hành có `SQL/14_LUAN_CHUYEN_CHO_NGOI_HANG_TUAN.sql`; installer mới đến module36 và preflight/hậu kiểm được cập nhật. Đã có SQL13/module35 đã sửa: sao lưu, chạy **00 →14 →03**. Có SQL12/module34 hoặc35 cũ: **00 →13 →14 →03**. Chưa có module dùng installer01 sau khi đối chiếu CSDL TKB gốc. Không chạy01 trên CSDL đã có module. Khi triển khai frontend phải đóng/mở lại tab cũ để nhận cache91; bản cũ không hiểu quy luật mới.

Chưa chạy SQL trên Supabase thật hoặc push/deploy website trong lượt này. Các ảnh và kiểm thử dùng Auth/học sinh giả. Kết quả tại `KIEM_THU_MOI_NHAT/seating_rotation_cache91/`; kết quả hồi quy toàn dự án ghi riêng trong hồ sơ kiểm chứng sau khi chạy xong.

## Kết quả kiểm chứng cục bộ

- 10 nhóm UI trên sáu độ rộng 360/390/768/1024/1440/1920px: xem trước, kết hợp hướng, đúng HS ở bàn mới, dữ liệu dùng chung, F5, lỗi mạng, hai phiên sửa và chuyển lớp khi biểu mẫu cũ còn mở.
- 24 nhóm SQL/model: thứ Hai/Chủ nhật, trước ngày hiệu lực, quay vòng, nhóm một phần, 1–12 tổ/số bàn khác nhau qua53 tuần không trùng/mất HS, quyền anon/GVBM/GVCN/admin/đổi mật khẩu, schema cài lại, stale revision và không ghi lại ghế.
- 70 kiểm gói SQL: cài mới/cập nhật/cài lại, giữ dữ liệu, hai RPC và hai cột mới, guard và quyền.
- Gate gộp **78/78 PASS** tại `seating_rotation_cache91/final-regression.json`. Lượt đầy đủ `20261028T044726Z/summary.json` đạt73/78;8 bài liên quan kiểm lại đạt sau khi cập nhật5 fixture cũ theo giao diện đã được chốt ở88–90 và thêm ca chuyển lớp. Summary gốc giữ nguyên; đây không phải full78 đạt một lượt.
- 39 tệp JS ứng dụng kiểm cú pháp và HTML mirror PASS. Kiểm gói ZIP/checksum/Windows Git được ghi trong hồ sơ bàn giao cuối.

Không dùng kết quả PGlite/trình duyệt tự động để khẳng định tải đồng thời hosted hay nghiệm thu giáo viên/thiết bị thật.
