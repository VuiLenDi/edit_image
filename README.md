# Lớp - Trình chỉnh ảnh nhiều lớp

Ứng dụng TypeScript + Vite + Fabric.js, xử lý ảnh hoàn toàn trên trình duyệt, không cần backend.

## Chạy dự án

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```sh
npm install
npm run dev -- --port 5174
```

Truy cập <http://localhost:5174>. Build production bằng `npm run build`; kết quả nằm trong thư mục `dist`.

## Chức năng

- Upload, kéo thả hoặc dán ảnh bằng Ctrl+V / Cmd+V. Ảnh đầu tiên xác định kích thước khung; ảnh tiếp theo trở thành lớp chồng lên.
- Chọn lớp để di chuyển, đổi kích thước, xoay, chỉnh vị trí và độ trong suốt. Hai nút mũi tên trong danh sách lớp thay đổi thứ tự chồng ảnh.
- Thêm chữ; sửa nội dung ở bảng thuộc tính hoặc nhấp đúp chữ trên canvas. Dán chữ bằng Ctrl+V / Cmd+V trên canvas để tạo lớp mới, hoặc dán trong ô nội dung để sửa lớp hiện tại. Nút Dán hỗ trợ cả ảnh và chữ.
- Có font, cỡ chữ, màu, đậm, nghiêng, gạch chân và căn lề. Ô Mã màu HEX cho phép gõ/dán mã 3 hoặc 6 chữ số, có hoặc không có dấu #; đồng bộ với bảng chọn màu và hỗ trợ hoàn tác.
- Nhân bản, xóa, khóa, ẩn lớp, hoàn tác/làm lại tối đa 25 trạng thái; phím mũi tên di chuyển lớp, Shift tăng bước lên 10 px.
- Đổi kích thước khung, nền màu hoặc trong suốt; xuất PNG ở độ phân giải khung ảnh, độc lập mức zoom.
- Trên điện thoại, mở danh sách lớp và thuộc tính bằng hai nút biểu tượng trên thanh công cụ.

## Lưu ý

- Ảnh không được tải lên server. Google Fonts được dùng để tải font giao diện; có font dự phòng khi mất mạng.
- Các lớp chỉ tồn tại trong phiên hiện tại. Hãy tải PNG trước khi đóng hoặc tải lại trang. PNG là ảnh đã gộp lớp, không phải tệp dự án có thể sửa từng lớp.
- Nút đọc clipboard cần localhost hoặc HTTPS và quyền trình duyệt. Khi không được cấp quyền, dùng Ctrl+V / Cmd+V.
- Khi tải PNG trên trình duyệt hỗ trợ File System Access (như Chrome/Edge), hộp lưu cho phép chọn thư mục và tên tệp. Cần localhost hoặc HTTPS. Hủy hộp lưu sẽ không tải ảnh.
- Trình duyệt không hỗ trợ hộp lưu (như Firefox/Safari) sẽ hỏi tên tệp rồi tải xuống. Thư mục lưu do cài đặt tải xuống của trình duyệt quyết định; website không thể tự mở hộp chọn thư mục trên các trình duyệt này.
- Hỗ trợ PNG, JPEG, WebP, GIF, AVIF, BMP theo khả năng giải mã của trình duyệt. GIF được nhập thành ảnh tĩnh. Giới hạn mỗi tệp 30 MB, mỗi chiều 8192 px, tổng 32 triệu pixel.

## Kiểm thử

```sh
npx playwright install chromium
npm test
```

7 kiểm thử bao gồm upload, clipboard ảnh/chữ, hex, thứ tự lớp bằng pixel PNG, kích thước xuất ở mức zoom khác nhau, chữ tiếng Việt, định dạng, nhân bản/xóa/ẩn/khóa, lịch sử, nền trong suốt và giao diện điện thoại. Hộp lưu hệ điều hành được mô phỏng để xác nhận tham số, dữ liệu PNG được ghi, đóng tệp và hủy lưu; luồng tải xuống dự phòng kiểm tra tên tệp thực tế.
