# 00-router — Giai đoạn 1

Đứng ngay sau Chat Trigger.

- `code/phan-loai-lenh.js`: đọc `chatInput`, trả `{ mode, chatInput, focus }`
  - `#bantin` → `bantin`
  - `#marketing [từ khóa]` → `marketing` (`focus` = từ khóa)
  - trống → `help`
  - còn lại → `topic` (chuyển nguyên văn sang 01-chu-de)
- Switch (chế độ expression, 4 đầu ra) theo `mode`
- Chat: hướng dẫn dùng tag (cho `help`)
