const mode = $json.mode;

const usage = [
  'Cách dùng:',
  '• Gõ một chủ đề kinh tế → nghiên cứu, viết kịch bản và prompt NotebookLM (lưu vào Google Sheet).',
  '• #bantin → bản tin kinh tế mới nhất từ Google, YouTube, TikTok, Facebook.',
  '• #marketing [từ khóa tùy chọn] → 5–6 xu hướng marketing mới nhất kèm quy trình áp dụng và gợi ý video.'
].join('\n');

// Nhánh #bantin và #marketing sẽ được nối ở Giai đoạn 2 và 3.
const text = mode === 'help'
  ? usage
  : `Tính năng #${mode} đang được xây dựng.\n\n${usage}`;

return [{ json: { text } }];
