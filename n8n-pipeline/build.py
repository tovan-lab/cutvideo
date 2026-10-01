"""
Ghép workflow n8n từ mã nguồn tách file.

- src/workflow.base.json : khung workflow (node, vị trí, kết nối, credential)
- src/modules/**/code/*.js      : mã của các node Code      -> tham chiếu "@file:<đường dẫn>"
- src/modules/**/prompts/*.md   : prompt của các node Gemini -> tham chiếu "@expr-file:<đường dẫn>"
                                  (build tự thêm dấu "=" ở đầu để n8n hiểu là biểu thức)
- config.json                   : giá trị dùng chung, thay cho token dạng __TEN__ trong khung

Chạy:  python build.py            -> ghi dist/<tên workflow>.json
       python build.py --check    -> chỉ kiểm tra, không ghi file
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
DIST = ROOT / "dist"

TOKEN_RE = re.compile(r"__([A-Z0-9_]+)__")


def resolve_refs(value, errors):
    """Thay "@file:" / "@expr-file:" bằng nội dung file tương ứng trong src/."""
    if isinstance(value, dict):
        return {k: resolve_refs(v, errors) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve_refs(v, errors) for v in value]
    if isinstance(value, str):
        for prefix, lead in (("@expr-file:", "="), ("@file:", "")):
            if value.startswith(prefix):
                path = SRC / value[len(prefix):]
                if not path.is_file():
                    errors.append(f"Không tìm thấy file tham chiếu: {path.relative_to(ROOT)}")
                    return value
                return lead + path.read_text(encoding="utf-8")
    return value


def apply_config(text, config, errors):
    def repl(m):
        key = m.group(1)
        if key not in config:
            errors.append(f"config.json thiếu khóa: {key}")
            return m.group(0)
        # Giá trị được chèn vào bên trong chuỗi JSON nên phải escape.
        return json.dumps(config[key], ensure_ascii=False)[1:-1]

    return TOKEN_RE.sub(repl, text)


def validate(wf):
    errors, warnings = [], []
    names = [n["name"] for n in wf["nodes"]]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        errors.append(f"Trùng tên node: {sorted(dupes)}")
    ids = [n["id"] for n in wf["nodes"]]
    if len(ids) != len(set(ids)):
        errors.append("Trùng id node")

    name_set = set(names)
    targets = set()
    for src, outputs in wf.get("connections", {}).items():
        if src not in name_set:
            errors.append(f"Kết nối từ node không tồn tại: {src}")
        for branch in outputs.get("main", []):
            for link in branch or []:
                targets.add(link["node"])
                if link["node"] not in name_set:
                    errors.append(f"Kết nối tới node không tồn tại: {src} -> {link['node']}")

    triggers = {n["name"] for n in wf["nodes"] if "trigger" in n["type"].lower()}
    for n in wf["nodes"]:
        if n["type"] == "n8n-nodes-base.stickyNote":
            continue
        if n["name"] not in targets and n["name"] not in triggers:
            warnings.append(f"Node không có đầu vào: {n['name']}")

    raw = json.dumps(wf, ensure_ascii=False)
    for placeholder in sorted(set(re.findall(r"REPLACE_[A-Z_]+", raw))):
        warnings.append(f"Còn giá trị cần thay: {placeholder}")
    return errors, warnings


def build():
    errors = []
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    base_text = (SRC / "workflow.base.json").read_text(encoding="utf-8")
    base_text = apply_config(base_text, config, errors)
    wf = resolve_refs(json.loads(base_text), errors)

    v_errors, warnings = validate(wf)
    errors += v_errors
    return wf, errors, warnings


def main():
    check_only = "--check" in sys.argv
    wf, errors, warnings = build()

    for w in warnings:
        print(f"[CẢNH BÁO] {w}")
    for e in errors:
        print(f"[LỖI] {e}")
    if errors:
        sys.exit(1)

    node_count = sum(1 for n in wf["nodes"] if n["type"] != "n8n-nodes-base.stickyNote")
    if check_only:
        print(f"OK: {node_count} node, không ghi file (--check).")
        return

    DIST.mkdir(exist_ok=True)
    out = DIST / f"{wf['name']}.json"
    out.write_text(json.dumps(wf, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"OK: {node_count} node -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
