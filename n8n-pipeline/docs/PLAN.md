# Kế hoạch hoàn thiện — Kinh Tế Content Pipeline (n8n)

Toàn bộ dự án chia thành **3 giai đoạn lớn**. Mỗi giai đoạn kết thúc bằng một file
workflow trong `dist/` import được vào n8n và chạy thử được, không phải chờ giai đoạn sau.

```
Chat n8n ──► Router đọc tag
               ├─ #bantin     ─► Giai đoạn 2: Bản tin kinh tế
               ├─ #marketing  ─► Giai đoạn 3: Xu hướng marketing
               ├─ (trống)     ─► Hướng dẫn dùng tag
               └─ không tag   ─► Giai đoạn 1: Chủ đề → nghiên cứu → kịch bản → prompt NotebookLM
```

---

## Giai đoạn 1 — Nền tảng: router tag + sửa nhánh chủ đề cũ

**Mục tiêu:** workflow cũ chạy đúng từ đầu tới cuối, và chat đã nhận tag.

| # | Việc | Vị trí |
|---|---|---|
| 1.1 | Node Router: đọc `#bantin` / `#marketing` / không tag / tin trống. Tin trống thì trả hướng dẫn | `modules/00-router` |
| 1.2 | Tavily nhận chuỗi `={{ ... }}` nguyên văn thay vì chủ đề → dựng body bằng `JSON.stringify` | `01-chu-de` |
| 1.3 | Prompt "Viết kịch bản" đọc `$json` của node Sheet (không có `summary`/`key_points`) → đọc từ node `Kiểm tra dữ liệu nghiên cứu` | `01-chu-de/prompts` |
| 1.4 | Prompt "Viết prompt NotebookLM" không có `script_text` → đọc từ node `Kiểm tra kịch bản` | `01-chu-de/prompts` |
| 1.5 | Vòng thử chủ đề: `attempt` luôn quay về 0 nên giới hạn 5 lần không có tác dụng → lấy giá trị từ node `Tăng số lần thử` | `01-chu-de/code` |
| 1.6 | Kiểm tra trùng quá chặt ("lạm phát" chặn luôn "lạm phát Mỹ 2026") → so khớp theo tỷ lệ từ trùng nhau | `01-chu-de/code` |
| 1.7 | Chat Trigger bật chế độ "Using Response Nodes", các node Chat không chờ người dùng trả lời | `workflow.base.json` |
| 1.8 | Đổi model Gemini trong `config.json` (một chỗ dùng cho mọi node) | `config.json` |

**Nghiệm thu:** gõ một chủ đề → Sheet có đủ `research_data`, `script`, `prompt`, `status = ready`.
Gõ lại chủ đề đó → AI đề xuất chủ đề khác và dừng sau tối đa 5 lần thử.

---

## Giai đoạn 2 — Nhánh `#bantin`: 4 agent + số liệu thị trường → bản tin khoảng 3.000 từ

```
Chat "Đang tổng hợp…"
 ├─ Agent Google/báo chí : Tavily news 24h (trong nước + quốc tế) → Gemini tóm tắt
 ├─ Agent YouTube        : YouTube Data API v3, 48h, kèm lượt xem  → Gemini tóm tắt
 ├─ Agent TikTok         : Tavily include_domains tiktok.com       → Gemini tóm tắt
 ├─ Agent Facebook       : Tavily include_domains facebook.com     → Gemini tóm tắt
 └─ Số liệu thị trường   : tỷ giá USD từ XML Vietcombank + tin VN-Index / SJC / xăng trong ngày
      ↓ Merge (5 nhánh)
 Gemini biên tập → Code kiểm tra → trả bản tin vào chat
```

**Khung bản tin:** 5 mục theo mẫu của bạn (mục 4 để `[ĐỂ TRỐNG]`),
phụ lục "Mỗi nền tảng đang bàn gì", danh sách nguồn, rồi đến phần cuối gồm 3 tiêu đề YouTube
(dưới 70 ký tự, có con số), 1 câu thumbnail (tối đa 6 chữ) và 2 mô tả video.

**Quy tắc chống bịa số:** mọi con số phải có trong dữ liệu đã tìm được. Nếu không có thì ghi
"chưa có dữ liệu". Mỗi nhánh đặt `onError: continue` để một nguồn lỗi không làm hỏng cả bản tin.

**Nghiệm thu:** gõ `#bantin` → trong khoảng 2 phút nhận bản tin đủ các mục, có nguồn.
Code kiểm tra báo cảnh báo khi thiếu mục, sai độ dài tiêu đề hoặc thumbnail, hoặc số từ nằm ngoài 2.500–3.600.

---

## Giai đoạn 3 — Nhánh `#marketing` + hoàn thiện

**6 bước:**
1. Quét tin marketing 7 ngày gần nhất (Việt Nam + quốc tế), dùng Tavily news.
2. Quét trend marketing trên YouTube, TikTok, Facebook, dùng Tavily với include_domains.
3. Gemini chấm điểm theo độ mới, độ nóng, mức liên quan tới Việt Nam → chọn 5–6 xu hướng.
4. Với mỗi xu hướng: 1 quy trình áp dụng gồm mục tiêu, các bước, công cụ, ví dụ thực tế có nguồn, và chỉ số đo hiệu quả.
5. Liệt kê những sai lầm cần tránh.
6. Đề xuất 3 video (tiêu đề, câu thumbnail, mô tả) → trả vào chat. Muốn làm tiếp chủ đề nào thì
   gõ chủ đề đó (không tag) để nhánh cũ viết kịch bản và prompt NotebookLM.

Gõ kèm từ khóa để tập trung vào một mảng, ví dụ `#marketing TikTok Shop`.

**Hoàn thiện:** chạy thử cả 4 đường, cập nhật README, đổi tên workflow thành v2.

---

## Trạng thái

- [x] Dựng cấu trúc dự án, tách code/prompt, `build.py` (bản build lại giống hệt bản gốc)
- [x] Giai đoạn 1: đã có code, chưa chạy thử trên n8n → `dist/Kinh Te Content Pipeline v2.json`
- [ ] Giai đoạn 2
- [ ] Giai đoạn 3

Đã chốt: `#bantin` và `#marketing` chỉ trả kết quả về chat. Nhánh chủ đề giữ Google Sheet.
Dùng model `models/gemini-3.8-flash` (đã thử bằng key trong `.env`). Phiên bản các node lấy theo
file gốc do n8n của bạn xuất ra.

## Bạn cần chuẩn bị

| Cần | Dùng cho | Ghi vào |
|---|---|---|
| ID Google Sheet `content_pipeline` (phần giữa `/d/` và `/edit` trong link) | Nhánh chủ đề | `config.json` → `SHEET_ID` |
| Dòng tiêu đề tab đầu tiên của Sheet: `topic, research_data, sources, script, prompt, status, date_created, date_updated` | Nhánh chủ đề | Google Sheet |
| YouTube Data API v3 key (Google Cloud Console → APIs → YouTube Data API v3 → Credentials) | Giai đoạn 2 | tạo credential "Query Auth" trong n8n, tên tham số `key` |
| Kiểm tra key Tavily còn quota | Giai đoạn 2, 3 | credential "Header Auth account" có sẵn |
