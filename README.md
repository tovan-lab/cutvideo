# AI Video Tool — Công Cụ Hậu Kỳ & Làm Sạch Video Tự Động (NotebookLM)

Bộ công cụ tối ưu quy trình xử lý hậu kỳ video (khổ dọc 9:16 cho Shorts/TikTok và khổ ngang 16:9 cho YouTube), chuyên dụng để tự động làm sạch video tạo từ **NotebookLM** ("Gemini Notebook") và sinh nội dung AI.

---

## ⚡ Các Tính Năng Nổi Bật

### 1. Bộ Làm Sạch Hợp Nhất 1-Pass (Unified Clean Engine)
- **Cắt bỏ Intro cuối (~3 giây)** và **Khử Watermark góc dưới bên phải** trong **1 lần mã hóa duy nhất (Single-pass render)**.
- **Không nén lặp lại 2 lần**, giữ 100% chất lượng âm thanh gốc (lossless audio stream copy).
- Tích hợp động cơ **Native FFmpeg** trên máy tính cho tốc độ xử lý chỉ vài giây (nhanh gấp 30-50 lần so với canvas trình duyệt).
- Tự động nhận diện tỷ lệ khung hình video:
  - **Khổ dọc 9:16 (Shorts/TikTok):** Preset watermark `x: 73%, y: 96%, w: 24%, h: 3.5%`
  - **Khổ ngang 16:9 (YouTube):** Preset watermark `x: 90%, y: 96.5%, w: 9.5%, h: 3%`
- Hỗ trợ đa dạng thuật toán: **FFmpeg Delogo (Nội suy viền thông minh)**, **Làm mờ (BoxBlur)**, hoặc **Che phủ màu (Matte)**.

### 2. Cắt Ghép Video (Fast Trim & Merge)
- Cắt phân đoạn video siêu tốc với chế độ **Stream Copy (`-c copy`)** tức thì khi không cần lọc hình ảnh.
- Ghép nhiều video có chuẩn hóa độ phân giải và bù trừ khung hình.

### 3. Trí Tuệ Nhân Tạo (Gemini AI Social Content)
- Chuyển âm thanh thành lời thoại (**Single-pass Speech-to-Text**) với mốc thời gian thực chính xác từng câu.
- Phân tích bối cảnh video và tự động tạo tiêu đề, hook, mô tả, hashtag, CTA tối ưu theo từng nền tảng (TikTok, YouTube, Facebook, Reels).


### 4. Xưởng Nội Dung (tab thứ 3)
Các agent AI chạy ngay trên server web, tiến trình từng bước hiển thị trên mô hình vũ trụ 3D (Three.js):
- **Chủ đề → Kịch bản:** chống trùng chủ đề với Google Sheet, tìm tin (Tavily), tổng hợp nghiên cứu, viết kịch bản 5–8 phút và prompt NotebookLM, lưu lại vào Sheet.
- **Bản tin kinh tế:** 4 agent (Google, YouTube, TikTok, Facebook) và số liệu thị trường (tỷ giá USD lấy trực tiếp từ Vietcombank) chạy song song, sau đó viết bản tin khoảng 3.000 từ kèm 3 tiêu đề, câu thumbnail và 2 mô tả video.
- **Xu hướng marketing:** quét trend 7 ngày, chấm điểm và chọn 5–6 xu hướng, viết quy trình áp dụng, liệt kê sai lầm cần tránh và gợi ý 3 video.

Cấu hình trong `.env` (xem `.env.example`): `TAVILY_API_KEY` (bắt buộc), `YOUTUBE_API_KEY` (không bắt buộc), `STUDIO_SHEET_ID` và service account Google (dùng cho Sheet).
Chỉ chạy khi dùng `server.ts` (máy local, Docker hoặc Render). Bản Vercel không hỗ trợ tab này.

---

## 🚀 Khởi Chạy Dự Án

### Yêu cầu hệ thống:
- **Node.js** (>= 18) hoặc **Bun** (khuyên dùng).
- **FFmpeg** đã cài đặt trong PATH của hệ thống (đã có sẵn trên PC).

### Cài đặt & Chạy:
```bash
# 1. Cài đặt dependencies
bun install
# hoặc: npm install

# 2. Cấu hình file .env
# Thêm GEMINI_API_KEY để sử dụng các tính năng AI Content

# 3. Khởi chạy dev server
bun server.ts
# hoặc: npm run dev
```

Truy cập giao diện web tại: **http://localhost:3000**
