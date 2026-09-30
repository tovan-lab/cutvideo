# LỘ TRÌNH HOÀN THIỆN — AI VIDEO TOOL (BẢN ĐẦY ĐỦ)

**Ngày:** 28/09/2026
**Căn cứ:** file báo cáo tổng hợp, mã nguồn `personal-video-tool.zip` (đọc tĩnh, chưa chạy), các trao đổi làm rõ workflow và 3 khung hình mẫu bạn gửi.

> Lưu ý phương pháp: tôi chưa chạy được `npm install`, kiểm tra kiểu (`tsc`) hay ứng dụng. Mọi nhận xét về mã là từ việc đọc mã nguồn. Tọa độ watermark là ước lượng bằng mắt từ ảnh chụp màn hình. Các mục chưa xác minh được ghi rõ ở phần 8.

---

## 1. Mục tiêu và phạm vi

### Bài toán thực tế
Bạn tạo video bằng NotebookLM (nhãn hiện tại trên video là "Gemini Notebook"), gồm:

- Video ngắn 9:16 đăng YouTube Shorts và TikTok.
- Video 16:9 đăng YouTube.

Video tải về luôn có hai điểm cần xử lý:

1. Đoạn intro của công cụ ở khoảng 3 giây cuối.
2. Watermark nhỏ ở góc dưới bên phải.

Ngoài ra bạn muốn AI đọc nội dung video để viết tiêu đề, mô tả và hashtag cho từng nền tảng, và có nơi lưu tạm để dùng nhiều thiết bị (video sẽ bị xóa sau khi đăng).

### Sản phẩm đích
Một quy trình gần như một chạm:

```text
Video tải về (9:16 hoặc 16:9)
   -> phát hiện & cắt intro cuối
   -> xóa watermark góc dưới phải
   -> xem trước trước/sau
   -> xuất video sạch
   -> AI đọc nội dung -> tiêu đề + mô tả + hashtag theo nền tảng
   -> (tùy chọn) chuyển sang thiết bị khác qua Google Drive
   -> đăng xong thì xóa video, giữ lại phần chữ
```

### Ngoài phạm vi ở giai đoạn đầu
- GPU AI Inpainting làm mặc định.
- Supabase.
- Chỉnh sửa video phức tạp (hiệu ứng, chuyển cảnh, phụ đề mới).

### Nguyên tắc giữ nguyên từ báo cáo
Không giả lập AI; không hiển thị tiến trình giả; không đưa secret xuống frontend; không tải video lên nếu tác vụ chạy local được; không re-encode khi không cần; xem trước trước thao tác có nguy cơ mất nội dung; khi bộ phát hiện không chắc thì hỏi người dùng; giữ tầng trừu tượng để thay engine; không phá các phase đã hoàn thành.

---

## 2. Hiện trạng: báo cáo so với mã nguồn

| Hạng mục | Báo cáo | Thực tế trong mã | Đánh giá |
|---|---|---|---|
| Trim/Merge bằng FFmpeg WASM, có fallback | Hoàn thành | Đúng, có fallback về Browser engine, có nhãn engine và trạng thái re-encode | Đạt, cần vá chi tiết |
| Blur/Cover logo | "Canvas/FFmpeg" | Chỉ Canvas + MediaRecorder, chạy theo thời gian thực. FFmpeg không tham gia | **Lệch báo cáo** |
| Phân tích video và tạo nội dung bằng Gemini | Hoàn thành | Đúng. Model `gemini-3.8-flash` là bản ổn định trên tài liệu Google | Đạt |
| Transcript | Hoàn thành | Chạy được nhưng gọi AI hai lần và có mốc thời gian tự chia đều | Cần sửa |
| Hạ tầng AI Inpainting | Sẵn sàng | Là hạ tầng, chưa dùng được cho video thật (giới hạn 180s, data URI, job trong RAM) | Đúng "chưa nối" |
| NotebookLM Auto Cleanup | Ưu tiên tiếp theo | Chưa có dòng mã nào | Chưa bắt đầu |
| Kiểm thử tự động | Không nhắc | Không có file test | Thiếu |

**Về con số 60%:** hợp lý nếu tính theo số phase trong báo cáo. Nhưng phần còn lại lại là phần quan trọng nhất với workflow của bạn, nên theo mốc "dùng hằng ngày được" tôi ước lượng khoảng 50%.

---

## 3. Vấn đề phát hiện

### Ưu tiên cao
1. **Xóa logo chạy theo thời gian thực.** Video 9 phút mất ít nhất 9 phút và tab phải ở foreground. Định dạng đầu ra phụ thuộc trình duyệt. Nên thử trên iPhone Safari và Android Chrome thật, đừng tin vào tuyên bố "hỗ trợ" trong báo cáo.
2. **Trim và xóa logo là hai lần encode riêng.** Nếu nối chuỗi thì video bị nén hai lần. Cần gom thành một lần render.
3. **Hủy thao tác làm rò tài nguyên.** Trong bộ xử lý logo, khi hủy thì AudioContext, các track và video tạm không được dọn. Trong FFmpeg processor, listener `progress` được thêm mỗi lần chạy mà không gỡ.
4. **Transcript.**
   - Audio có thể bị gửi hai lần (tốn gấp đôi chi phí và thời gian).
   - Mô hình transcribe có sẵn cấu hình mốc thời gian và nhận diện người nói nhưng mã chỉ dùng prompt văn bản.
   - Khi thiếu mốc thời gian, mã tự chia đều thời lượng cho các dòng. Đây là mốc giả và sẽ đi thẳng vào SRT/VTT.
   - `analyze-video` trả về context chung chung tự bịa khi JSON lỗi, thay vì báo lỗi.
5. **API không có xác thực và giới hạn tốc độ.** Nếu triển khai công khai, ai cũng gọi được Gemini/Replicate bằng key của bạn.
6. **Hạ tầng GPU chưa dùng được cho video dài:** giới hạn 180 giây, video gửi dưới dạng data URI (nhà cung cấp chỉ khuyến nghị cho file dưới 1MB), bộ nhớ RAM cho mỗi job, job mất khi server khởi động lại, chưa có hàng đợi thật, vùng mặc định là góc trên phải.

### Ưu tiên trung bình và thấp
- FFmpeg WASM nạp toàn bộ video vào bộ nhớ ảo, có trần khoảng 2GB, dễ làm sập tab điện thoại. Chưa có ngưỡng cảnh báo theo kích thước.
- Lõi FFmpeg tải từ CDN lúc chạy, trái với "local-first".
- Merge bằng stream copy chỉ kiểm tra độ phân giải và có/không audio, chưa kiểm tra codec, fps, sample rate.
- Trim mặc định là stream copy (không chính xác từng frame).
- Transcript giải mã toàn bộ video trên trình duyệt (nặng với video dài); giới hạn body JSON 50MB nên audio dài quá khoảng 19 phút sẽ lỗi.
- Logic MediaRecorder lặp ở ít nhất 4 nơi; `videoProcessor.ts` dài 985 dòng.
- Tên model Gemini rải rác nhiều nơi.
- `package.json` còn tên `react-example`, README và `metadata.json` còn là mẫu AI Studio.
- Server cố định đường dẫn `/usr/bin/ffmpeg`.

### Điểm mạnh nên giữ
- Kiến trúc trừu tượng (`IVideoProcessor`, `IInpaintingProvider`).
- Cơ chế fallback có công bố engine đã dùng và trạng thái re-encode.
- Session cache phân tích video; luồng transcript có chỉnh sửa và xuất SRT/VTT/TXT.
- Tách bạch việc cần AI với việc dùng FFmpeg.
- Tư duy "không chắc thì hỏi người dùng".

---

## 4. Đặc tả workflow đã làm rõ

### 4.1 Intro cuối video
- Khung intro: nền xám nhạt phẳng, logo lớn ở chính giữa, watermark nhỏ vẫn còn ở góc dưới phải.
- Bạn cho biết bản 9:16 giống hệt, chỉ khác tỷ lệ.
- Độ dài khoảng 3 giây (chưa được đo trên nhiều video).
- **Phương pháp đề xuất:** dò ngược từ cuối video, so khớp với khung mẫu của intro (mỗi khổ một mẫu) kết hợp kiểm tra nền phẳng và đứng yên. Không cần 4 tầng tín hiệu như báo cáo.
- **Chưa biết:** logo có hiện bằng hiệu ứng mờ dần hay không (ảnh hưởng điểm cắt), và độ dài có cố định tuyệt đối không.
- Dưới ngưỡng tin cậy thì luôn hỏi người dùng, không tự cắt.

### 4.2 Watermark
- Vị trí cố định ở góc dưới phải, cả khi hiển thị slide lẫn intro.
- Tọa độ ước lượng (cần đo lại trên video gốc):

| Khổ | Vùng watermark | Ghi chú |
|---|---|---|
| 9:16 | x khoảng 73–97%, y khoảng 96–99% | Nằm trong lề màu be, nền phẳng |
| 16:9 | x khoảng 90–100%, y khoảng 96,5–99,5% | Rất nhỏ, sát dải xanh của thẻ nên vùng chọn phải sát |

- Cần **hai preset riêng theo khổ**, cho phép chỉnh tay. Watermark chiếm khoảng 23% chiều ngang ở 9:16 nhưng chỉ khoảng 9% ở 16:9.
- Tên hiển thị trên video hiện là "Gemini Notebook" và có thể đổi lần nữa, nên preset không nên gắn cứng theo tên hay hình mẫu.
- Chưa xác minh: hiển thị trên cảnh nền tối, và các slide có nội dung sát góc (vùng chọn tĩnh có thể che nhầm).

### 4.3 AI nội dung
- Hoạt động sẵn: phân tích khung hình, transcript, sinh tiêu đề/hook/mô tả/hashtag/CTA cho TikTok, YouTube, Facebook, Instagram.
- Khung 9:16 có phụ đề đóng cứng trong video. Nên dùng **transcript từ âm thanh làm nguồn chính**, chữ trên màn hình làm thông tin phụ (một dòng chữ trong khung mẫu trông không giống một cụm tiếng Việt có nghĩa).
- Nên phân tích **video đã cắt sạch** để mô tả không nhắc đến intro.
- Đề xuất: khổ 9:16 mặc định gợi ý Shorts/TikTok, khổ 16:9 mặc định gợi ý YouTube.

### 4.4 Lưu trữ
- Video chỉ tồn tại tạm thời, xóa sau khi đăng. Dữ liệu cần đồng bộ thật sự là phần chữ (tiêu đề, mô tả, hashtag, trạng thái).
- Supabase không cần thiết ở giai đoạn này. Hướng chọn: Google Drive (xem phần 7).

---

## 5. Quyết định kiến trúc cần chốt

### D1. Nơi chạy xử lý video

| Phương án | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Máy tính cá nhân (server Node có sẵn + FFmpeg gốc) | Nhanh nhất; không giới hạn RAM trình duyệt; video không rời máy; điện thoại có thể chỉ điều khiển qua mạng nhà hoặc đường hầm bảo mật | Cần máy tính luôn bật; cần cài FFmpeg và sửa đường dẫn cố định |
| B. Hoàn toàn trên trình duyệt (WASM) | Không cần server xử lý; dùng được trên mọi thiết bị | Chậm hơn; giới hạn RAM (nhất là điện thoại); phải tự lưu lõi FFmpeg |
| C. Triển khai đám mây (AI Studio/Cloud Run) | Truy cập từ mọi nơi | Phải upload video; tốn thời gian và chi phí; cần xác thực |

**Gợi ý:** nếu bạn có máy tính thường xuyên bật thì chọn A, coi WASM là dự phòng. Nên đo thực tế trên bộ video mẫu (Giai đoạn 0) trước khi chốt.

### D2. Lưu trữ
Google Drive (Mức 1 không code, Mức 2 tích hợp API tùy chọn), qua một lớp lưu trữ trừu tượng. Chi tiết ở phần 7.

### D3. Cách xóa watermark
So sánh trên bộ mẫu: che phủ màu lấy mẫu từ nền xung quanh, blur, và bộ lọc `delogo` của FFmpeg (nội suy từ điểm ảnh xung quanh). Chọn mặc định theo kết quả thực tế.

### D4. Chính sách cắt intro
Bảo thủ: thà hỏi người dùng còn hơn cắt nhầm. Chỉ tự cắt khi độ tin cậy cao.

---

## 6. Lộ trình theo giai đoạn

Quy ước kích cỡ: **Nhỏ / Vừa / Lớn** là ước lượng tương đối, không phải số ngày.

```text
GĐ0 -> GĐ1 -> GĐ2 -> GĐ3 (intro) ─┐
                     GĐ4 (logo)  ─┴-> GĐ5 -> GĐ8
                     GĐ6 (AI) và GĐ7 (lưu trữ) có thể chạy song song từ sau GĐ1
GĐ9, GĐ10: tùy chọn
```

### Giai đoạn 0 — Chuẩn bị và chốt nền (Nhỏ)
- [ ] Gom **10–15 video mẫu thật**: cả 9:16 và 16:9, nhiều độ dài, có/không lời nói, cảnh sáng và tối, có slide nội dung sát góc dưới phải.
- [ ] Đo và ghi lại: độ dài intro của từng video, có hiệu ứng mờ dần không, tọa độ watermark chính xác theo từng khổ, watermark trên cảnh tối.
- [ ] Chốt D1 (nơi chạy) và thiết bị sử dụng.
- [ ] Chạy kiểm tra kiểu/dựng dự án, ghi lại tình trạng gốc.
- **Hoàn thành khi:** có bộ mẫu, bảng số đo và quyết định D1.

### Giai đoạn 1 — Vá nền, dọn nợ kỹ thuật (Vừa)
- [ ] Dọn tài nguyên khi hủy (AudioContext, track, video tạm, blob URL); gỡ listener tiến trình FFmpeg.
- [ ] Gom logic MediaRecorder lặp về một nơi; chia nhỏ `videoProcessor.ts`.
- [ ] Transcript: một lần gọi duy nhất với cấu hình mốc thời gian và người nói gốc; bỏ mốc thời gian tự chia đều; không sinh context bịa khi lỗi (báo lỗi rõ ràng).
- [ ] Gom cấu hình tên model Gemini về một chỗ.
- [ ] Lưu lõi FFmpeg cùng ứng dụng thay vì tải từ CDN.
- [ ] Thêm ngưỡng cảnh báo theo kích thước file; mặc định Trim chính xác cho luồng làm sạch.
- [ ] Kiểm tra codec/fps/sample rate trước khi ghép bằng stream copy.
- [ ] Thêm xác thực và giới hạn tốc độ cơ bản cho API; đổi tên dự án, viết lại README và `metadata.json`.
- **Hoàn thành khi:** hủy/chạy lặp nhiều lần không rò tài nguyên; SRT/VTT chỉ chứa mốc thời gian thật; dựng dự án sạch.

### Giai đoạn 2 — Bộ render hợp nhất (Lớn)
- [ ] Một "kế hoạch chỉnh sửa" duy nhất: đoạn giữ lại + vùng watermark + phương pháp xử lý.
- [ ] Một lần encode cho cả cắt và xóa watermark; giữ nguyên âm thanh gốc.
- [ ] Hỗ trợ cả 9:16 và 16:9; đặt tên file đầu ra nhất quán.
- [ ] Bộ Canvas thời gian thực hạ xuống làm phương án dự phòng, có cảnh báo rõ.
- [ ] Nhãn trung thực: chỉ ghi "không re-encode" khi thật sự dùng stream copy; ghi rõ khi video đã encode lại.
- [ ] Đo thời gian và bộ nhớ trên bộ mẫu.
- **Hoàn thành khi:** một video 9:16 và một video 16:9 chạy trọn vẹn qua một lần render, kết quả đúng và nhãn đúng.

### Giai đoạn 3 — Nhận diện intro (Vừa)
- [ ] Khung mẫu intro cho từng khổ.
- [ ] Dò ngược từ cuối video; kết hợp so khớp mẫu với kiểm tra nền phẳng và đứng yên; xác định điểm bắt đầu (kể cả hiệu ứng mờ dần nếu có).
- [ ] Điểm tin cậy; dưới ngưỡng thì hiển thị đoạn ứng viên, cho xem trước, chấp nhận hoặc chỉnh tay.
- [ ] Cho phép "học" mẫu intro mới từ một video (phòng khi nhãn hoặc thiết kế đổi).
- [ ] Bài kiểm tra hồi quy trên bộ mẫu.
- **Hoàn thành khi:** trên bộ mẫu không có lần tự cắt sai; các trường hợp không chắc luôn được hỏi lại.

### Giai đoạn 4 — Xóa watermark (Vừa)
- [ ] Hai preset (9:16, 16:9) từ số đo ở Giai đoạn 0, cho phép chỉnh tay, tên preset do người dùng đặt.
- [ ] So sánh phủ màu, blur, `delogo` trên bộ mẫu; chọn mặc định.
- [ ] Kiểm tra cảnh tối, slide có nội dung sát góc, dải xanh cạnh watermark ở 16:9.
- [ ] Xem trước trước/sau.
- **Hoàn thành khi:** watermark không còn nhận ra được ở mức xem bình thường trên các video mẫu, không che nhầm nội dung.

### Giai đoạn 5 — Nút "Clean" và hàng đợi (Vừa)
- [ ] Một nút gom: phát hiện intro, xóa watermark, cắt, xuất.
- [ ] Xử lý lô nhiều video, hiển thị tiến trình thật, báo lỗi rõ ràng từng video.
- [ ] Xem trước trước/sau cho từng video trước khi xuất.
- **Hoàn thành khi:** một lô video hỗn hợp 9:16 và 16:9 ra kết quả đúng, không cần can thiệp tay ở phần lớn video.

### Giai đoạn 6 — Nâng cấp AI nội dung (Vừa) — song song được
- [ ] Phân tích trên video đã làm sạch; transcript từ âm thanh làm nguồn chính, chữ trên màn hình làm phụ.
- [ ] Gợi ý nền tảng theo khổ (9:16 gợi ý Shorts/TikTok, 16:9 gợi ý YouTube); giữ các nền tảng còn lại.
- [ ] Chỉnh sửa và sao chép nhanh kết quả; lưu phần chữ cùng trạng thái đăng.
- [ ] Kiểm soát chi phí Gemini (giá ưu đãi của 3.8 Flash theo tài liệu Google có hạn đến hết năm, cần xem lại sau đó).
- **Hoàn thành khi:** mô tả khớp nội dung thật của video, không nhắc tới intro, không có dữ liệu bịa khi lỗi.

### Giai đoạn 7 — Lưu trữ và đa thiết bị (Vừa) — song song được
- [ ] Mức 1: thư mục Google Drive đồng bộ, không code (xem phần 7).
- [ ] Lớp lưu trữ trừu tượng (thư mục máy, Drive) để thay engine.
- [ ] Mức 2 (tùy chọn): tích hợp Drive API với quyền hẹp, thông tin chữ trong thư mục ẩn của ứng dụng, xóa video khi đánh dấu "đã đăng".
- [ ] Thử trên điện thoại thật.
- **Hoàn thành khi:** bắt đầu trên thiết bị này và tiếp tục được trên thiết bị kia; xóa video sau đăng hoạt động.

### Giai đoạn 8 — Thiết bị thật, kiểm thử, triển khai (Vừa)
- [ ] Test hồi quy tự động cho bộ nhận diện intro và watermark.
- [ ] Thử iPhone Safari và Android Chrome: thời gian, RAM, thông báo lỗi.
- [ ] Cấu hình secrets, giới hạn chi phí, xác thực khi triển khai; dọn README/metadata.
- **Hoàn thành khi:** chạy ổn định trên thiết bị bạn dùng hằng ngày.

### Giai đoạn 9 — GPU Inpainting (chỉ khi cần)
Chỉ làm nếu Giai đoạn 4 cho thấy che phủ/`delogo` không đạt. Khi đó cần:
- [ ] Nâng hoặc bỏ giới hạn 180 giây, hoặc chia đoạn.
- [ ] Upload qua kênh phù hợp thay vì data URI; không giữ cả file trong RAM.
- [ ] Lưu job bền, hàng đợi thật, xác thực, hạn mức chi phí.
- [ ] Xác minh tham số model với tài liệu của nhà cung cấp.

### Giai đoạn 10 — Đăng trực tiếp qua API (tùy chọn)
Đăng thẳng lên nền tảng để bỏ bước chuyển file. Cần kiểm tra điều kiện API hiện hành của từng nền tảng (nhất là TikTok, có thể yêu cầu duyệt ứng dụng).

---

## 7. Lưu trữ bằng Google Drive

**Vì sao hợp:** bạn đã có tài khoản, không thêm dịch vụ phải duy trì, video vốn sẽ bị xóa sau khi đăng.

### Mức 1 — không cần code
Cài Google Drive trên máy tính, đặt thư mục tải xuống của trình duyệt vào thư mục Drive. Video xuất ra tự có trên điện thoại qua app Drive.

### Mức 2 — tích hợp ứng dụng (tùy chọn)
- Dùng quyền `drive.file` (ứng dụng chỉ thấy file do nó tạo hoặc bạn chọn), an toàn hơn quyền toàn bộ Drive.
- Dùng thư mục ẩn của ứng dụng (`drive.appdata`) để lưu phần chữ: tiêu đề, mô tả, hashtag, trạng thái "đã đăng".
- Mỗi video có thể là một thư mục gồm video và một file thông tin nhỏ. Khi đánh dấu "đã đăng", xóa video, giữ phần chữ.

### Lưu ý
- Ứng dụng có màn hình đồng ý OAuth loại External ở trạng thái Testing chỉ được cấp refresh token sống 7 ngày, nên phải đăng nhập lại mỗi tuần. Có thể chuyển sang Production (một nguồn cho biết vẫn dùng được khi chưa được Google xác minh, cần kiểm tra lại).
- Dung lượng miễn phí dùng chung với Gmail và Photos; hãy kiểm tra mức còn lại của tài khoản.
- Upload file lớn cần tải theo khối.
- Việc chọn và tải file từ Drive trên điện thoại phụ thuộc trình duyệt, cần thử thật.
- Video đi qua máy chủ Google. Nên để Drive là tùy chọn bật thủ công để giữ tinh thần "local-first".

---

## 8. Rủi ro và giả định chưa xác minh

| Mục | Tình trạng |
|---|---|
| Nhận xét về mã | Đọc tĩnh, chưa chạy dựng dự án. `package.json` có nhiều phiên bản rất mới (ví dụ TypeScript 7, Vite 8) chưa kiểm chứng |
| Tọa độ watermark | Ước lượng bằng mắt từ ảnh chụp màn hình, cần đo lại trên video gốc |
| Độ dài intro | Chưa đo trên nhiều video; có thể có hiệu ứng mờ dần |
| Watermark trên cảnh tối | Chưa thấy |
| Khổ 9:16 | Bạn cho biết intro giống 16:9; tôi chưa xem khung intro 9:16 |
| Thông số model Gemini cho mốc thời gian/người nói | Cần đối chiếu với tài liệu lúc triển khai |
| Tham số model inpainting trên Replicate | Chưa xác minh |
| Điều kiện OAuth/Drive/API TikTok | Cần kiểm tra lại khi triển khai |
| Chạy trên iPhone Safari/Android Chrome | Chưa thử |
| Chi phí Gemini | Giá ưu đãi có thời hạn, cần xem lại |

---

## 9. Tiêu chí hoàn thiện

- [ ] Một nút xử lý được cả video 9:16 và 16:9 từ NotebookLM, không cần can thiệp tay ở phần lớn video.
- [ ] Không có lần tự cắt sai nào trên bộ mẫu; trường hợp không chắc luôn được hỏi lại.
- [ ] Watermark không còn nhận ra được ở mức xem bình thường; không che nhầm nội dung.
- [ ] Video 9 phút xử lý trong ngưỡng thời gian bạn chấp nhận (bạn tự chốt con số).
- [ ] Không rò tài nguyên khi hủy hoặc chạy nhiều lần liên tiếp.
- [ ] Mô tả, tiêu đề, hashtag khớp nội dung video thật; mốc thời gian phụ đề đều thật.
- [ ] Mọi nhãn trên giao diện (AI, re-encode, mốc thời gian) đúng với những gì thực sự xảy ra.
- [ ] Chuyển được giữa các thiết bị bạn dùng và xóa được video sau khi đăng.

---

## 10. Việc bạn cần chuẩn bị

1. Bộ 10–15 video mẫu thật (nhiều khổ, độ dài, cảnh sáng/tối).
2. Một khung hình intro của video 9:16 (nếu có thể).
3. Danh sách thiết bị bạn dùng (PC, iPhone, Android) và cách chuyển video hiện nay.
4. Thời lượng dài nhất của video 16:9 và số video làm mỗi ngày.
5. Nền tảng đăng chính và ngôn ngữ nội dung mặc định.
6. Con số thời gian xử lý tối đa bạn chấp nhận cho video dài.
