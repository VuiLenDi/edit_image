# Chỉnh sửa ảnh VLD — Trình chỉnh ảnh nhiều lớp

Chỉnh sửa ảnh VLD là ứng dụng chỉnh sửa ảnh chạy trên trình duyệt. Bạn có thể ghép ảnh, thêm chữ và nét vẽ, tinh chỉnh màu sắc, rồi xuất thành PNG, JPEG hoặc WebP.

## Quyền riêng tư và bảo mật

- Ảnh được xử lý trong trình duyệt; ứng dụng không gửi ảnh lên backend của dự án và không cần tài khoản.
- Tách nền AI chạy trên thiết bị. Lần đầu sử dụng, trình duyệt tải model và WASM từ CDN; giao diện cũng tải phông chữ từ Google Fonts. Các dịch vụ bên thứ ba có thể nhận metadata kết nối, nhưng luồng xử lý này không gửi ảnh cho họ.
- Dự án không lưu ảnh hoặc tệp chỉnh sửa trên máy chủ. Các lớp chỉ tồn tại trong phiên hiện tại; hãy xuất PNG trước khi đóng hoặc tải lại trang.
- Không đưa khóa, token, mã tài khoản, URL nội bộ, thông tin cá nhân hay dữ liệu khách hàng vào README, mã nguồn hoặc Git. Cấu hình riêng và thông tin xác thực phải được quản lý ngoài repository.

## Chạy dự án

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```sh
npm ci
npm run dev
```

Mở URL được Vite hiển thị trong terminal. Tạo bản production bằng `npm run build`.

## Chức năng

- **Thêm ảnh:** tải tệp, kéo thả hoặc dán ảnh từ clipboard. Có thể ghép nhiều ảnh thành các lớp.
- **Chỉnh sửa lớp:** di chuyển, đổi kích thước, xoay, chỉnh vị trí và độ trong suốt; sắp xếp thứ tự, nhân bản, ẩn, khóa và xóa lớp. Canh trái/giữa/phải hoặc trên/giữa/dưới theo vùng chọn hay theo khung ảnh; canh chỉnh giữ nguyên kích thước, góc xoay và hỗ trợ hoàn tác/làm lại. Phím mũi tên di chuyển lớp; giữ Shift để tăng bước di chuyển.
- **Sắp xếp và gộp lớp:** kéo thả lớp trong danh sách để đổi thứ tự. Chọn nhiều lớp để gộp thành một lớp ảnh mới; có thể hoàn tác/làm lại thao tác gộp.
- **Điều chỉnh ảnh:** chỉnh độ sáng, vùng sáng, vùng tối, tương phản và bão hòa riêng cho từng lớp ảnh; đặt lại hoặc hoàn tác/làm lại.
- **Vẽ tự do:** chọn màu và kích thước cọ. Mỗi nét vẽ là một lớp riêng có thể chọn và chỉnh sửa như các lớp khác.
- **Thêm chữ:** chỉnh nội dung, phông, cỡ chữ, màu, đậm, nghiêng, gạch chân và căn lề. Ô mã màu HEX nhận mã 3 hoặc 6 chữ số. Có thể dán chữ trên canvas để tạo lớp mới hoặc dán trong ô nội dung để sửa chữ đang chọn.
- **Tách nền AI:** xử lý ảnh trên thiết bị, tinh chỉnh bằng cọ xóa/khôi phục và Magic, điều chỉnh viền và nền xem trước, rồi áp dụng vào lớp ảnh. Có lịch sử riêng khi tinh chỉnh và lịch sử chung sau khi áp dụng.
- **Bỏ viền trong suốt:** cắt vùng alpha trong suốt thừa quanh lớp ảnh, giữ nguyên pixel bán trong suốt và vị trí nội dung trên khung; không đổi kích thước khung ảnh.
- **Khung ảnh:** thay đổi kích thước, chọn nền màu hoặc trong suốt, phóng to/thu nhỏ và vừa khung.
- **Hoàn tác và xuất:** hoàn tác/làm lại tối đa 25 trạng thái; nhấn **Tải ảnh** để chọn PNG, JPEG hoặc WebP và xuất canvas đã gộp lớp ở độ phân giải khung ảnh, không phụ thuộc mức zoom. Trong cùng hộp thoại, mục **Nén hình ảnh** cho phép chỉnh chất lượng JPEG/WebP; PNG giữ chất lượng lossless và nền trong suốt.
- **Giao diện di động:** dùng được trên điện thoại; các nút trên thanh công cụ mở danh sách lớp và bảng thuộc tính. Có thể thêm ứng dụng vào màn hình chính từ Safari trên iPhone.

## Cài trên iPhone

Mở ứng dụng qua HTTPS bằng Safari, nhấn **Chia sẻ** rồi chọn **Thêm vào màn hình chính**. Nếu hiện tùy chọn **Mở dưới dạng ứng dụng web**, bật tùy chọn đó rồi nhấn **Thêm**. Khi xuất ảnh, dùng menu chia sẻ iOS và chọn **Lưu hình ảnh**; nếu chia sẻ tệp không khả dụng, ảnh được tải về theo cài đặt của Safari.

## Triển khai tĩnh bằng Terraform

Thư mục [terraform](terraform/) chứa cấu hình triển khai ứng dụng tĩnh lên S3 và CloudFront. Bucket được cấu hình riêng tư; CloudFront dùng Origin Access Control để đọc nội dung và chuyển HTTP sang HTTPS. Không cần backend ứng dụng.

Yêu cầu Terraform 1.7+ (dưới 2.0), AWS CLI và một danh tính AWS đã được cấu hình bên ngoài repository, ưu tiên SSO. Không lưu access key, token, thông tin đăng nhập, state hoặc tệp plan có dữ liệu nhạy cảm trong Git. Trước khi chạy lệnh AWS, xác nhận đúng tài khoản và môi trường bằng `aws sts get-caller-identity` và kiểm tra biến trong [terraform/terraform.tfvars.example](terraform/terraform.tfvars.example). Dùng state tách biệt cho từng môi trường; state dùng chung cần được lưu trong backend bảo vệ, có mã hóa và khóa.

Kiểm tra cấu hình và kiểm thử Terraform không tạo tài nguyên AWS:

```sh
terraform -chdir=terraform init
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
terraform -chdir=terraform test
```

Lập kế hoạch, xem kỹ tài nguyên và chi phí dự kiến rồi mới áp dụng:

```sh
terraform -chdir=terraform plan -out=deploy.tfplan
terraform -chdir=terraform show deploy.tfplan
terraform -chdir=terraform apply deploy.tfplan
```

Sau khi hạ tầng sẵn sàng, build và tải ứng dụng lên:

```sh
npm ci
npm run build
bucket=$(terraform -chdir=terraform output -raw bucket_name)
distribution=$(terraform -chdir=terraform output -raw distribution_id)
aws s3 sync dist/ "s3://$bucket/" --exclude index.html --sse AES256 --cache-control 'public,max-age=3600'
aws s3 cp dist/index.html "s3://$bucket/index.html" --sse AES256 --content-type 'text/html' --cache-control 'no-cache,no-store,must-revalidate'
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*'
```

Tải assets trước `index.html`; không xóa assets cũ trong lúc còn phiên ứng dụng đang mở. `terraform destroy` có thể xóa tài nguyên và làm gián đoạn dịch vụ; chỉ chạy sau khi xác nhận đúng môi trường, state và tác động.

## Giới hạn

- Hỗ trợ PNG, JPEG, WebP, GIF, AVIF và BMP theo khả năng giải mã của trình duyệt. GIF được nhập thành ảnh tĩnh.
- Có thể xuất canvas thành PNG, JPEG hoặc WebP. Điều chỉnh chất lượng áp dụng cho JPEG/WebP; PNG là lossless. JPEG không hỗ trợ alpha nên vùng trong suốt được làm phẳng trên nền trắng.
- Mỗi tệp tối đa 30 MB; mỗi chiều tối đa 8192 px và tổng tối đa 32 triệu pixel. Tách nền AI giới hạn 16 megapixel.
- Cần Internet để tải model/WASM của công cụ tách nền lần đầu và phông chữ giao diện. Khi mất mạng, các phông chữ dự phòng vẫn dùng được.
- Nếu cấu hình CSP/COEP khi triển khai, cần cho phép các nguồn CDN cần thiết cho phông chữ và model; chính sách quá hạn chế có thể làm các tính năng này không tải được.
- Lịch sử chỉ tồn tại trong phiên. Ảnh xuất ra đã gộp lớp, không phải tệp dự án có thể mở lại để sửa từng lớp.
- Clipboard cần localhost hoặc HTTPS cùng quyền truy cập của trình duyệt; nếu không, có thể dán bằng Ctrl+V / Cmd+V.
- Chrome và Edge có thể mở hộp lưu để chọn tên và vị trí tệp. Trình duyệt không hỗ trợ hộp lưu này, như Firefox hoặc Safari, tải PNG theo cài đặt tải xuống của trình duyệt.
- Trên Chrome 157.0.8103.52 từng gặp lỗi `showSaveFilePicker()` trả `AbortError` khi cửa sổ ở kích thước lớn/toàn màn hình. Có thể thử khôi phục và thu nhỏ cửa sổ. Tham khảo [Chromium issue 582407452](https://issues.chromium.org/issues/582407452); issue công khai đề cập `showDirectoryPicker()`, nên liên hệ với `showSaveFilePicker()` chưa được xác nhận độc lập.

## Kiểm thử

```sh
npx playwright install chromium
npm test
```

Chạy `npm run test:chrome` để kiểm tra hộp lưu native trên Chrome Stable; cần Chrome và môi trường desktop có giao diện.

Playwright suite hiện có 21 kiểm thử bao gồm upload, clipboard, chỉnh sửa lớp, điều chỉnh ảnh, vẽ, canh lớp, cắt viền trong suốt, xuất và nén PNG/JPEG/WebP, lịch sử, giao diện di động và tách nền. Hộp lưu được mô phỏng trong suite mặc định; test Chrome kiểm tra hộp lưu native.
