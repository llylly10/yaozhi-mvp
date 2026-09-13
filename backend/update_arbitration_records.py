# -*- coding: utf-8 -*-
"""更新 章节并列题裁决表-20260903.csv 与 .md，回填最终裁决结论。
"""
import csv
import io
import json
import re
from pathlib import Path

MAT_DIR = Path(r"d:\ceshi\yaozhi-mvp\corpus\course-materials")
csv_path = MAT_DIR / "章节并列题裁决表-20260903.csv"
md_path = MAT_DIR / "章节并列题裁决表-20260903.md"
p5_json = MAT_DIR / "P5-并列题63题解析批注稿-20260912.json"

p5_data = json.load(open(p5_json, encoding="utf-8"))

# 1. 更新 CSV
rows = []
with open(csv_path, encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for r in reader:
        q_id = r["题号"]
        if q_id in p5_data:
            ch = p5_data[q_id]["chapter_ref"]
            r["顾问结论（CH几 / 保留并列 / 其他意见）"] = ch
            r["状态"] = "✅ 已采纳裁决"
        rows.append(r)

with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(f"已更新 CSV 裁决结论: {csv_path}")

# 2. 更新 MD
md_content = open(md_path, encoding="utf-8").read()
for q_id, item in p5_data.items():
    ch = item["chapter_ref"]
    # 替换例如:
    # ### 1. 01-198　`CH12,CH27`　✅ 有机器候选（建议确认）
    # ...
    # - **顾问结论**：
    pattern = rf"(### \d+\. {q_id}[^\n]*\n(?:- [^\n]*\n)*- \*\*顾问结论\*\*：)([^\n]*)"
    repl = rf"\g<1>{ch}（已裁定并入库上线，人卫9e对应章节）"
    md_content = re.sub(pattern, repl, md_content)

open(md_path, "w", encoding="utf-8").write(md_content)
print(f"已更新 MD 裁决文档: {md_path}")
