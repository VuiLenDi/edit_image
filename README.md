# Lớp - Trình chỉnh ảnh nhiều lớp

Ứng dụng TypeScript + Vite + Fabric.js, xử lý ảnh hoàn toàn trên trình duyệt, không cần backend.

## Chạy dự án

Yêu cầu Node.js 20.19+ hoặc 22.12+.

```sh
npm install
npm run dev -- --port 5174
```

Truy cập <http://localhost:5174>. Build production bằng `npm run build`; kết quả nằm trong thư mục `dist`.

## Cài trên iPhone

Mở website bằng Safari trên iPhone, nhấn **Chia sẻ** rồi chọn **Thêm vào màn hình chính**. Bật **Mở dưới dạng ứng dụng web** nếu tùy chọn này hiện ra, sau đó nhấn **Thêm**. Shortcut dùng biểu tượng Lớp và mở editor ở chế độ toàn màn hình. Website cần được phục vụ qua HTTPS; trang CloudFront dev đã dùng HTTPS.

Khi xuất PNG trên iPhone, menu chia sẻ iOS sẽ mở ra; chọn **Lưu hình ảnh** để lưu vào ứng dụng Ảnh. Nếu trình duyệt không hỗ trợ chia sẻ file, PNG được tải về mục **Tệp > Tải về** hoặc vị trí tải xuống đã chọn trong Safari.

## Triển khai AWS bằng Terraform

Bản dev: <https://d2ri5vjdr61bxs.cloudfront.net> (account `086090976189`, S3 tại `ap-southeast-1`).

Cấu hình trong [terraform](terraform/main.tf) tạo bucket S3 riêng tư, mã hóa AES256 và chặn toàn bộ truy cập công khai. CloudFront dùng Origin Access Control (SigV4) để đọc ảnh/web assets, chuyển HTTP sang HTTPS và cung cấp chứng chỉ cho tên miền mặc định `*.cloudfront.net`. Không cần backend, EC2, domain riêng hay chứng chỉ ACM.

Yêu cầu Terraform 1.7+ (dưới 2.0), AWS CLI và tài khoản AWS đã được cấu hình credentials, ưu tiên SSO. Không ghi access key vào Terraform hoặc Git. Kiểm tra đúng tài khoản bằng `aws sts get-caller-identity` trước khi lập kế hoạch. Tài khoản thực thi cần quyền quản lý S3 và CloudFront cho các tài nguyên này.

Khi dùng SSO, chọn profile qua biến môi trường `AWS_PROFILE` trước khi chạy các lệnh bên dưới. Bản dev hiện dùng profile local `dev-sso` với permission set `AWSAdministratorAccess`.

Mặc định: region `ap-southeast-1`, môi trường `dev`, project `lop-image-editor`, CloudFront `PriceClass_All` để bao gồm các edge location Đông Nam Á. Có thể chỉnh qua các biến trong [terraform/terraform.tfvars.example](terraform/terraform.tfvars.example); tệp `.tfvars` riêng được Git bỏ qua. Mỗi môi trường phải dùng state riêng; chỉ đổi biến `environment` trên cùng state sẽ thay thế tài nguyên hiện có.

Kiểm tra cấu hình không tạo tài nguyên AWS:

```sh
terraform -chdir=terraform init
terraform -chdir=terraform fmt -check -recursive
terraform -chdir=terraform validate
terraform -chdir=terraform test
```

Kiểm thử dùng AWS mock, không cần credentials. Commit tệp [terraform/.terraform.lock.hcl](terraform/.terraform.lock.hcl) để giữ phiên bản provider nhất quán.

Lập kế hoạch, xem thay đổi rồi mới triển khai (S3/CloudFront phát sinh phí theo sử dụng):

```sh
terraform -chdir=terraform plan -out=deploy.tfplan
terraform -chdir=terraform show deploy.tfplan
terraform -chdir=terraform apply deploy.tfplan
```

Terraform chỉ quản lý hạ tầng. Sau khi apply thành công, chạy từ thư mục gốc để build và upload ứng dụng:

```sh
npm ci
npm run build
bucket=$(terraform -chdir=terraform output -raw bucket_name)
distribution=$(terraform -chdir=terraform output -raw distribution_id)
aws s3 sync dist/ "s3://$bucket/" --exclude index.html --sse AES256 --cache-control 'public,max-age=3600'
aws s3 cp dist/index.html "s3://$bucket/index.html" --sse AES256 --content-type 'text/html' --cache-control 'no-cache,no-store,must-revalidate'
aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/*'
terraform -chdir=terraform output -raw site_url
```

Gửi rõ `--sse AES256` khi upload, kể cả khi bucket đã bật mã hóa mặc định. Trên account dev, upload không có header này bị SCP từ chối; upload có header AES256 đã được xác minh thành công. Không cần thay đổi SCP hay mở public bucket.

Upload assets trước `index.html`; không xóa assets cũ để các phiên đang mở vẫn tải được chunk của bản trước. Chờ invalidation hoàn tất rồi kiểm tra URL HTTPS và công cụ tách nền. Không bật COEP/CSP hạn chế vì ứng dụng tải font và mô hình từ CDN bên ngoài. Cấu hình hiện tại phục vụ trang gốc, không chuyển lỗi assets thành HTML và chưa hỗ trợ route SPA dạng đường dẫn con.

**State và CI/CD:** bước đầu dùng local state trong thư mục Terraform, được bỏ qua bởi Git. Giữ state an toàn, không xóa hoặc chia sẻ qua artifact công khai. Trước khi chạy CI/CD cần tạo bucket state riêng có versioning, mã hóa, chặn public và khóa state; chuyển state sang S3 backend, rồi cấu hình GitHub Actions OIDC cùng IAM role giới hạn quyền. Chưa có workflow CI/CD hay tài nguyên IAM trong bước này.

**Dọn tài nguyên:** `terraform -chdir=terraform destroy` xóa hạ tầng nhưng sẽ từ chối xóa bucket còn dữ liệu (`force_destroy = false`). Cần chủ động kiểm tra và xóa các object trước khi hủy. Không chạy destroy trên state dùng chung hoặc khi chưa xác nhận môi trường.

## Chức năng

- Upload, kéo thả hoặc dán ảnh bằng Ctrl+V / Cmd+V. Ảnh đầu tiên xác định kích thước khung; ảnh tiếp theo trở thành lớp chồng lên.
- Chọn lớp để di chuyển, đổi kích thước, xoay, chỉnh vị trí và độ trong suốt. Hai nút mũi tên trong danh sách lớp thay đổi thứ tự chồng ảnh.
- Mục **Canh theo** trong bảng lớp hỗ trợ canh trái/giữa ngang/phải và trên/giữa dọc/dưới. Chọn **Các lớp đang chọn** để canh từ hai lớp trở lên theo khung bao chung; chọn **Khung ảnh** để canh từng lớp theo khung ảnh, kể cả khi chỉ chọn một lớp. Nút **Chính giữa khung ảnh** canh cả hai chiều trong một thao tác. Canh chỉnh giữ nguyên kích thước, góc xoay, mức zoom và hỗ trợ hoàn tác/làm lại; lớp bị khóa không được di chuyển.
- Thêm chữ; sửa nội dung ở bảng thuộc tính hoặc nhấp đúp chữ trên canvas. Dán chữ bằng Ctrl+V / Cmd+V trên canvas để tạo lớp mới, hoặc dán trong ô nội dung để sửa lớp hiện tại. Nút Dán hỗ trợ cả ảnh và chữ.
- Có font, cỡ chữ, màu, đậm, nghiêng, gạch chân và căn lề. Ô Mã màu HEX cho phép gõ/dán mã 3 hoặc 6 chữ số, có hoặc không có dấu #; đồng bộ với bảng chọn màu và hỗ trợ hoàn tác.
- Với lớp ảnh đang chọn, mở **Tách nền AI** để xử lý ngay trên thiết bị; dùng cọ xóa/khôi phục, Magic chọn vùng liền kề, tinh chỉnh viền/khử ám màu và nền xem trước. Áp dụng kết quả vào chính lớp ảnh; có thể hoàn tác bằng lịch sử chung của editor.
- Chọn lớp ảnh rồi bấm **Bỏ viền trong suốt** trong bảng thuộc tính để cắt phần alpha bằng 0 thừa quanh ảnh, kể cả sau tách nền. Giữ nguyên pixel bán trong suốt, khoảng trống bên trong, vị trí nội dung trên khung, tỷ lệ và góc xoay; không đổi kích thước khung ảnh. Hỗ trợ hoàn tác/làm lại. Ảnh hoàn toàn trong suốt hoặc không có viền thừa sẽ được thông báo và giữ nguyên.
- Nhân bản, xóa, khóa, ẩn lớp, hoàn tác/làm lại tối đa 25 trạng thái; phím mũi tên di chuyển lớp, Shift tăng bước lên 10 px.
- Đổi kích thước khung, nền màu hoặc trong suốt; xuất PNG ở độ phân giải khung ảnh, độc lập mức zoom.
- Trên điện thoại, mở danh sách lớp và thuộc tính bằng hai nút biểu tượng trên thanh công cụ.

## Lưu ý

- Ảnh không được tải lên server. Google Fonts được dùng để tải font giao diện; có font dự phòng khi mất mạng.
- Tách nền dùng `@imgly/background-removal` trên trình duyệt. Lần đầu cần Internet để tải mô hình/WASM từ CDN; công cụ giới hạn 16 megapixel và 8192 px mỗi chiều. Mặt nạ/cọ/Magic có lịch sử riêng trong cửa sổ tinh chỉnh; sau khi áp dụng, thay đổi là một bước trong lịch sử chung.
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

13 kiểm thử bao gồm upload, clipboard ảnh/chữ, hex, thứ tự lớp bằng pixel PNG, canh lớp theo vùng chọn và khung ảnh, cắt viền trong suốt và bảo toàn pixel gốc/vị trí nội dung khi lớp đã co giãn/xoay, kích thước xuất ở mức zoom khác nhau, chữ tiếng Việt, định dạng, nhân bản/xóa/ẩn/khóa, lịch sử, nền trong suốt, giao diện điện thoại và công cụ mặt nạ tách nền. Hộp lưu hệ điều hành được mô phỏng để xác nhận tham số, dữ liệu PNG được ghi, đóng tệp và hủy lưu; luồng tải xuống dự phòng kiểm tra tên tệp thực tế.
