# Cache92 — mở từ bản lưu và tự đồng bộ

Ngày 28/10/2026, thực hiện yêu cầu mở trang không bị treo khi mạng yếu, dùng bản đã lưu, tải mới ở nền và gửi thao tác còn chờ khi kết nối trở lại. Mã trong dự án chính; chưa SQL/push/deploy vào website thật.

## Cách sử dụng

Mở ứng dụng và lớp một lần khi có mạng để tải tài nguyên và dữ liệu cần thiết. Lần sau trang mở bản lưu ngay, đồng thời xác minh phiên đăng nhập, quyền, ngày học và dữ liệu mới. Giáo viên có thể tiếp tục quan sát và nhập nội dung; cập nhật nền không thay nội dung ô đang nhập.

Khi mất mạng, điểm danh/ghi chú điểm danh, nhận xét trong tiết, nhận định chung tiết, xác nhận điểm danh cả lớp và mở tiết mới được ghi vào hàng đợi trên thiết bị trước. Thông báo **Đã lưu trên thiết bị · Chờ gửi** khác với xác nhận đã lưu ở máy chủ. Sĩ số đã xác nhận và việc chuyển bước chỉ dựa trên phản hồi thật của máy chủ.

Khi mạng trở lại, ứng dụng đang mở tự gửi các bản chờ bằng đúng tài khoản. Mở lại ứng dụng cũng kiểm tra và tiếp tục gửi. Nếu đã đóng hoàn toàn trình duyệt/ứng dụng, cần mở lại để quá trình này chạy. Mất phản hồi sau khi máy chủ đã lưu được đối chiếu lại; không tự tạo thêm nhận xét trùng. Tiết mở ngoại tuyến được chấp nhận trước khi ghi nhận phụ thuộc được gửi.

Bấm **nút kết nối xanh/đỏ nhỏ ở thanh trên cùng** để xem lớp, tiết, học sinh, nội dung và lỗi. Có thể thử lại, tải bản sao JSON hoặc chủ động bỏ bản chưa gửi sau xác nhận. Không bỏ một lượt đang gửi vì máy chủ có thể đã nhận. Bỏ một bản làm phụ thuộc còn lại cần đối chiếu, không tự đổi thành xác nhận thành công.

Sơ đồ tổ/bàn và các tác vụ quản trị vẫn gửi trực tiếp khi có kết nối; không được đưa vào hàng đợi này. Nháp chưa bấm lưu được giữ riêng và không tự biến thành nhận xét đã gửi.

Theo điều chỉnh cuối của người dùng: kiểm tra/kết nối/đồng bộ chạy tự động và yên lặng. Không thanh thông báo, nút thử kết nối hay popup tự mở trên trang. Chỉ có nút Wi-Fi20px trên thanh đầu trang: xanh khi ổn định; đỏ khi chưa xác minh/mất mạng hoặc cần xử lý. Chi tiết, bản chờ và tùy chọn mở phiên bản đã tải chỉ xuất hiện khi bấm nút. Màu đổi ngay, có tên truy cập cho trình đọc màn hình; menu không thêm hàng trên điện thoại.

## Giữ quy tắc nghiệp vụ

- Bản đọc gần nhất tối đa bảy ngày tính từ lần xác minh. Ghi ngoại tuyến yêu cầu đã xác minh trong 24 giờ và ngày máy chủ đã biết trùng ngày học hôm nay theo Việt Nam. Chưa có bản lưu thì cần kết nối trước.
- Khóa ngày, giáo viên phụ trách, quyền lớp và các kiểm tra SQL hiện có vẫn áp dụng. Bản chưa gửi quá ngày được giữ để xử lý/tải bản sao; không tự ghi bù ngày trước.
- Điểm danh dùng snapshot và cập nhật có điều kiện; nhận định dùng thời điểm xác nhận trước. Thay đổi từ thiết bị khác tạo bản **Cần xử lý**, giữ nội dung trên máy và dữ liệu máy chủ để người dùng đối chiếu.
- Đăng xuất dừng đồng bộ, bỏ snapshot đọc và nháp. Hàng đợi chưa gửi cùng biên nhận cần cho phụ thuộc còn lại được giữ theo tài khoản; tài khoản khác không được nhận hàng đợi đó trên giao diện. Cần đăng nhập đúng tài khoản để gửi tiếp.

## Cơ chế kỹ thuật

`assets/offline-runtime.js` dùng IndexedDB `tranphu-teacher-offline-v1`, tách cache/queue/keys/leases. Nội dung riêng được mã hóa AES-GCM bằng CryptoKey không xuất ra qua WebCrypto; phạm vi gồm backend và user ID. Đây là lớp tránh lưu nội dung rõ trong bản ghi IndexedDB, không phải cam kết chống mã độc/XSS hoặc người có toàn quyền hồ sơ trình duyệt. Không sao chép mật khẩu, access token hay refresh token vào kho mới. SDK Auth tiếp tục quản lý phiên hiện có.

Mỗi ý định có UUID bền vững, trạng thái đang gửi/chờ gửi/cần xử lý, thứ tự, snapshot và phụ thuộc. Ghi ý định trước yêu cầu mạng; chỉ xóa khỏi queue khi lưu biên nhận vào cùng giao dịch IndexedDB. Lease và kiểm tra danh tính hạn chế hai tab cùng gửi; CAS/UUID/RLS tiếp tục bảo vệ phía máy chủ. Lượt đang gửi bị gián đoạn có thời gian chờ trước khi kiểm tra lại. Lượt đọc/ghi cache còn dở bị vô hiệu hóa khi đổi tài khoản hoặc xóa snapshot.

`sw.js` cache92 chỉ cache tài nguyên ứng dụng, không cache HTTP Auth, REST hoặc dữ liệu học sinh. HTML cũ trả ngay; bản mới chỉ thay entry sau khi tải đủ JS/CSS đúng kiểu nội dung. Giữ một cache trước cho tab còn mở. Không ép tải lại biểu mẫu; nút **Mở bản mới** trong hộp chi tiết giữ nháp rồi mở. Giới hạn tám giây bao gồm đọc hết thân phản hồi, tránh vừa treo luồng tải vừa giữ các kết nối chưa tiêu thụ.

TKB công khai tiếp tục snapshot/giao dịch nguyên tử hiện có và âm thầm cập nhật bản `is_active` do quản trị chọn khi đang theo bản hiện hành. Liên kết bản lưu cụ thể và tuần chọn thủ công vẫn được tôn trọng; không đoán bản mới bằng số lớn nhất. `follow=current` giữ ý định theo TKB hiện hành qua tải lại.

Không thêm migration. Các RPC/bảng hiện có tiếp tục là nơi quyết định quyền, ngày và chấp nhận dữ liệu; không bỏ qua RLS. Luân chuyển chỗ của cache91 vẫn cần SQL14/module36 như hướng dẫn trước.

## Kiểm chứng và bàn giao

Hai bài mới `TESTS/test_offline_outbox.py` và `TESTS/test_offline_resilience.py` dùng Chrome, Auth giả và SQL/RLS cục bộ. Có 13 nhóm: cache mở khi mất mạng; lưu qua tải lại; tự gửi các phụ thuộc; mất phản hồi sau commit; tiết mới ngoại tuyến; xung đột; mã hóa/không HTTP-cache dữ liệu riêng; tách tài khoản; mạng trễ12 giây; giữ nháp khi cập nhật nền; cập nhật thiếu bundle; quá ngày; lỗi IndexedDB không báo lưu giả.

Bằng chứng và gate cuối ở `KIEM_THU_MOI_NHAT/offline_cache92/`. Summary đầy đủ các lượt chạy được giữ nguyên; gate cuối ghi rõ lượt đủ và các bài kiểm lại. Không suy kiểm thử cục bộ thành nghiệm thu thiết bị thật, Supabase Auth hosted hoặc phát hành production.

Gói dẫn xuất `release/TRAN_PHU_GIT_NETLIFY` có frontend cache92, hướng dẫn này và checksum. ZIP SQL giữ nguyên so với cache91. Không chép/push vào clone triển khai, không chạy SQL, không ghi dữ liệu trường.

Gate gộp82/82 PASS: lượt đủ20261028T070919Z đạt78/81; ba bài lỗi đã sửa và kiểm lại đạt, thêm bài một chạm và bốn bài UI cuối đạt. Không phải full82 một lượt. Bằng chứng KIEM_THU_MOI_NHAT/offline_cache92/final-regression.json; nguồn/mirror/JS/integrity đã kiểm. Chỉ dữ liệu giả cục bộ; chưa SQL/push/deploy/hosted/UAT.

## Điều chỉnh thao tác và bố cục ngày 28/10/2026

Nút kết nối 20px nằm trên thanh đầu trang, ngoài thanh điều hướng. Nút hướng dẫn (?) ở ngoài cùng bên phải. Các trang dùng chung trạng thái nút, ô nhập, viền focus và thanh lệnh; giữ chế độ in riêng.

Nhận xét học sinh: nhập ghi chú/đánh dấu cần lưu ý nếu cần, rồi chạm nội dung để lưu ngay. Có thể chạm nhiều nội dung khác nhau liên tiếp, bảng học sinh không tự đóng. Cùng học sinh/nội dung/tiết chỉ ghi một lần qua nút nhanh; nút đã ghi được đánh dấu. Chỉnh ghi chú qua Sửa trong lịch sử. Sức khỏe và dấu bất thường vẫn theo quyền và lựa chọn rõ ràng của giáo viên.

Mở Nhận định chung tiết học để xem bảng ghi nhận đã lưu/chờ gửi/cần xử lý trước khi xác nhận. Nhận xét thêm nằm trong mục Thêm nhận xét, mặc định thu gọn. Điểm danh khôi phục không hiện thông báo chuyển bước; trạng thái giờ tránh đọc lặp lại khi vừa nhận dữ liệu, nút Làm mới vẫn đọc thực tế để phát hiện thay đổi/xung đột.
