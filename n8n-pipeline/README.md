# Kinh Tế Content Pipeline (n8n)

Workflow n8n chạy qua chat, phục vụ kênh YouTube kinh tế. Từ chủ đề hoặc tag, workflow tìm tin mới nhất,
viết kịch bản và prompt NotebookLM, sau đó video NotebookLM được đưa sang công cụ `cắt tạo video` để cắt intro
và xóa watermark.

Kế hoạch 3 giai đoạn: [docs/PLAN.md](docs/PLAN.md)

## Cấu trúc

```
n8n-pipeline/
├─ build.py                  ghép src/ → dist/, kiểm tra kết nối node
├─ config.json               Sheet ID, model Gemini, ID credential (thay token __TEN__)
├─ source/
│  └─ original-workflow.json bản gốc, không sửa
├─ src/
│  ├─ workflow.base.json     khung: node, vị trí, kết nối
│  └─ modules/
│     ├─ 00-router/          đọc tag trong chat          (Giai đoạn 1)
│     ├─ 01-chu-de/          chủ đề → kịch bản → prompt  (có sẵn, sửa ở Giai đoạn 1)
│     │  ├─ code/            mã node Code (.js)
│     │  └─ prompts/         prompt node Gemini (.md)
│     ├─ 02-ban-tin/         #bantin                     (Giai đoạn 2)
│     └─ 03-marketing/       #marketing                  (Giai đoạn 3)
├─ dist/                     file JSON để import vào n8n (do build.py tạo)
└─ docs/PLAN.md
```

Trong `workflow.base.json`:
- `"@file:modules/.../x.js"` được thay bằng nội dung file.
- `"@expr-file:modules/.../x.md"` được thay bằng `=` + nội dung file (biểu thức n8n).
- `__SHEET_ID__`, `__GEMINI_MODEL__`… được thay bằng giá trị trong `config.json`.

## Dùng

```bash
python build.py
```

Sau đó vào n8n → **Import from File** → chọn file trong `dist/`.
Muốn chỉ kiểm tra mà không ghi file: `python build.py --check`.

Sửa code hoặc prompt thì sửa file trong `src/modules/`, **không** sửa trực tiếp file trong `dist/`.
