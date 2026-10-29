# Điểm danh từ dưới lên và nút hiện mật khẩu — cache90

Ngày 28/10/2026, theo yêu cầu giáo viên: sơ đồ mở tại đầu lớp ở phía dưới, cuộn lên để quan sát các bàn phía sau; thao tác điểm danh và nhận xét đặt gần vùng đang quan sát.

## Cách sử dụng

- Khi vào tiết có sơ đồ đã chốt, bàn giáo viên và Bàn 1 nằm phía dưới. Vùng sơ đồ tự mở ở đầu lớp; vuốt/cuộn lên để xem cuối lớp. Nút **Đầu lớp ↓** trở về các bàn gần giáo viên. Đổi tổ, điểm danh hoặc làm mới giữ khoảng cách đến cuối vùng cuộn của từng tiết/nhóm tổ.
- Chạm học sinh để mở thao tác; sơ đồ giữ học sinh đang chọn trong vùng nhìn thấy. Điện thoại mở bảng từ cạnh dưới, thu gọn thông tin phụ và không phủ lớp nền tối lên sơ đồ. Máy tính bảng/máy tính giữ bảng bên cạnh. Tên học sinh, mã và **Trước / Tiếp** nằm ở đầu bảng; thứ tự đi theo tổ, bàn đầu đến bàn cuối, từng chỗ. Không tự chuyển học sinh trước khi lưu.
- Bốn nút điểm danh **Có mặt / Vắng / Muộn / Có phép** có nhãn và màu riêng, vùng bấm ít nhất 44px. Điểm danh vẫn tự lưu qua hàng đợi hiện có; chỉ chuyển Nhận xét sau khi đủ dữ liệu đã lưu. Xác nhận cả tiết vẫn có bước xác nhận.
- Nhận xét có ba nhóm **Tích cực / Cần hỗ trợ / Sức khỏe**. Chạm nhóm để lọc; chạm lại để hiện tất cả. Chọn nội dung, ghi chú nếu cần, bấm **Lưu nhận xét**. Nút lưu chỉ bật khi đã chọn và không nhận bấm lặp khi đang chờ máy chủ. Sức khỏe và dấu hiệu bất thường giữ quy tắc theo dõi hiện có.
- Nút mắt áp dụng cho đăng nhập giáo viên, đăng nhập quản trị TKB và ba ô đổi mật khẩu. Nút không gửi biểu mẫu, giữ giá trị/vị trí nhập; tự ẩn mật khẩu khi gửi biểu mẫu hoặc rời cửa sổ/tab. Đóng hộp đổi mật khẩu xóa cả giá trị đang hiện dạng chữ.

Lớp chưa chốt sơ đồ tiếp tục dùng danh sách, không tạo chỗ ngồi giả. Không thay dữ liệu ghế, quyền tài khoản, quy tắc khóa ngày, SQL hoặc dữ liệu trên dịch vụ thật.

## Nguồn và kiểm chứng

Mã chính: `SITE_NETLIFY/giao-vien/v4.js`, `assets/classroom-scene.css`, `assets/password-visibility.js/css`. Hai HTML cổng giữ bằng byte; Service Worker cache90 có đủ tài nguyên mới. Trang Xếp chỗ dùng sơ đồ gọn hiện có.

Bài mới `TESTS/test_teacher_bottom_up.py` kiểm tra sáu độ rộng 360/390/768/1024/1440/1920px, mở tại bàn đầu, giữ vị trí sau lưu, học sinh đang chọn còn nhìn thấy trên điện thoại, kích thước bốn nút, Trước/Tiếp, lưu nhận xét và mắt mật khẩu trong đăng nhập/hộp tài khoản. Đã thêm vào `TESTS/run_suite.py`. Bài command-layout chọn rõ nút submit vì biểu mẫu đăng nhập hiện có thêm nút mắt.

Bằng chứng lượt này nằm tại `KIEM_THU_MOI_NHAT/teacher_view_cache90/`: `checks.json`, `final-regression.json` và ảnh viewport. Đây là kiểm thử trình duyệt cục bộ với học sinh/Auth giả; không phải nghiệm thu thiết bị thật hoặc website đã triển khai. Mốc full 75 bộ cache87 thuộc lịch sử, không tính là full cache90.

Chưa push Git, triển khai Netlify hoặc chạy SQL trên Supabase trong lượt này.

Kết quả chốt: **9/9 bài liên quan PASS**, gồm 14 nhóm của bài mới; 38 tệp JavaScript ứng dụng kiểm cú pháp PASS; HTML mirror PASS; toàn vẹn TKB PASS (6 tệp gốc và 10 tệp có thay đổi đã đối chiếu). Hai fixture cũ sửa để chọn đúng nút submit khi form có thêm mắt, chờ màu CSS ổn định trước khi đo; bổ sung đo hàng nút chính mới vào command-layout. Không giảm điều kiện kiểm nghiệp vụ.
