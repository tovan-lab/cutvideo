const data = $input.first().json;
return [{
  json: {
    text: `✅ Đã hoàn tất pipeline cho chủ đề: "${data.topic}"\n\nTrạng thái: ${data.status}\nKịch bản và prompt NotebookLM đã được ghi vào Google Sheet. Vào sheet, mở cột "prompt" và copy sang NotebookLM để tạo video thuyết trình nhé.`
  }
}];