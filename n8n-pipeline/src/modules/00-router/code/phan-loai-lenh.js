// Đọc tag ở đầu tin nhắn để chọn nhánh: #bantin, #marketing, tin trống (help), còn lại là chủ đề.
const raw = ($json.chatInput || '').trim();
const match = raw.match(/^[#/](bantin|marketing)(?![\p{L}\p{N}])\s*(.*)$/isu);

let mode = 'topic';
let rest = raw;
if (!raw) {
  mode = 'help';
} else if (match) {
  mode = match[1].toLowerCase();
  rest = match[2].trim();
}

return [{
  json: {
    mode,
    // Nhánh chủ đề đọc chatInput như Chat Trigger cũ.
    chatInput: rest,
    focus: mode === 'marketing' ? rest : '',
    sessionId: $json.sessionId
  }
}];
