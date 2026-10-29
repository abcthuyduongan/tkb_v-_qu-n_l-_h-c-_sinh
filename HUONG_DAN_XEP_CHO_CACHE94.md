# Xếp chỗ từ dưới lên — cache94, 28/10/2026

Trang Xếp chỗ của GVCN/admin dùng cùng hướng với Đánh giá: bàn1 ở dưới sát bàn giáo viên, bàn cuối ở trên. Trước đây thứ tự bàn đã đúng nhưng trang chưa có vùng cuộn mở tại đầu lớp. Cache94 bổ sung vùng cuộn có tên truy cập, nút Đầu lớp và hướng dẫn hướng lớp; không đảo tọa độ đã lưu.

## Cách dùng

Mở Xếp chỗ, sơ đồ bắt đầu tại bàn đầu. Cuộn lên xem phía cuối lớp; nút Đầu lớp ↓ quay về bàn giáo viên. Chọn tổ ở thanh phía trên. Trên điện thoại hiện1 tổ; tablet2 tổ; desktop4 tổ theo vùng hiển thị thực tế. Các tổ có số bàn khác nhau vẫn thẳng hàng ở đầu lớp.

Chạm chỗ để chọn hoặc bỏ học sinh. Lưu thành công giữ vị trí cuộn và trả focus về chỗ vừa sửa. Học sinh chưa xếp chỗ và bước chốt sơ đồ giữ nguyên. Mỗi nhóm tổ/lớp/năm/tài khoản ghi nhớ vị trí riêng trong lần mở ứng dụng; nhóm/lớp chưa xem mở tại bàn đầu. Thay cấu trúc tổ/bàn mở vùng mới tại đầu lớp. Không lưu vị trí cuộn vào dữ liệu học sinh.

Luân chuyển vị trí hằng tuần nằm trong mục thu gọn hiện có. Chọn ngày/tuần xem trước chỉ thay bản xem trước; trang Xếp chỗ tiếp tục sửa sơ đồ gốc. Màn Đánh giá dùng vị trí đã chiếu theo ngày và quy luật. Không đưa tuần/revision luân chuyển vào khóa nhớ vị trí của sơ đồ gốc.

## Phạm vi và quyền

GVCN chỉ xếp/chốt lớp mình; admin theo quyền hiện có; GVBM không vào trang xếp chỗ. Thao tác sơ đồ vẫn cần kết nối và dùng RPC hiện hành. Mở trang mới không gửi thao tác ghi chỗ tự động. Không đổi schema/RLS/quy luật hay dữ liệu tọa độ chỗ ngồi, điểm danh/nhận xét. Không SQL mới và chưa push/deploy thật.

## Kiểm chứng

TESTS/test_seating_bottom_up.py: sáu độ rộng360/390/768/1024/1440/1920, mở tại bàn1, bàn giáo viên ở dưới, giữ khoảng cách từ đầu lớp sau bỏ/gán lại học sinh, trả focus, nhớ theo nhóm tổ và nút về đầu lớp; GVCN ghi đúng RPC/khóa tọa độ, admin đổi lớp nhớ riêng, GVBM bị chặn. Chỉ tài khoản/học sinh/CSDL giả.

Các bài hồi quy liên quan: classroom_views, extended_ui, lesson_reviews, ui_interactions, seating_rotation, command_layout, compact_portal, teacher_bottom_up, offline_outbox, offline_resilience. Kết quả cuối tại KIEM_THU_MOI_NHAT/seating_bottom_up_cache94/final-regression.json. Không suy kiểm cục bộ thành nghiệm thu thiết bị thật/hosted.

Nguồn v4.js và classroom-scene.css query94, SW94; root/giao-vien HTML phải bằng byte. Vị trí lấy theo khóa của viewport cũ trước khi thay nội dung/đổi lớp; sau lưu focus({preventScroll:true}) để không phá vị trí đã khôi phục. Callback chỉ chạy khi viewport còn gắn và hiện. Tọa độ nghiệp vụ không đổi.

Gói frontendcache93 trước sửa giữ tại KIEM_THU_MOI_NHAT/seating_bottom_up_cache94/cache93-rollback.zip. Gói SQL và clone triển khai giữ nguyên.

## Chốt kiểm

Cache94:10 bài hồi quy liên quan và bài mới9 nhóm PASS trên6 độ rộng360–1920px; bàn phím/in2 nhóm PASS. Gate gộp85/85 từ lượt đủ84/cache93 và các bài kiểm lại; không phải full85 một lượt. Bằng chứng KIEM_THU_MOI_NHAT/seating_bottom_up_cache94/final-regression.json.42 JS/MJS/mirror/integrity và37 tệp DATABASE giữ nguyên đã kiểm. Chỉ dữ liệu giả cục bộ, chưa SQL/push/deploy/hosted/UAT.
