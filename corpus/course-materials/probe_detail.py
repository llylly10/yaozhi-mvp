# -*- coding: utf-8 -*-
"""1) 抽查教材 PDF 文本/图像分布（抽样页）
2) 提取教学大纲全文 -> txt
3) 题库抽样：格式 + 按题号统计题量"""
import os, re
from pypdf import PdfReader

BASE = r"D:\ceshi\corpus\course-materials"
JIAOCAI = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\0\药理教材.pdf"

# ---- 教材抽查 ----
print("=" * 60)
print("教材抽查（页: 文本字符数 | 图像数量）")
r = PdfReader(JIAOCAI, strict=False)
n = len(r.pages)
for idx in [0, 5, 9, 19, 49, 99, 199, 299, 399, 499, n - 1]:
    try:
        pg = r.pages[idx]
        t = pg.extract_text() or ""
        imgs = len(pg.images) if hasattr(pg, "images") else 0
        print(f"  页{idx + 1}: 文本 {len(t.strip())} 字符 | 图像 {imgs} 个")
    except Exception as e:
        print(f"  页{idx + 1}: 解析失败 {e}")

# ---- 教学大纲全文 ----
print("=" * 60)
print("教学大纲全文提取")
dg = os.path.join(BASE, "教学大纲-药理学-药学专业.pdf")
r2 = PdfReader(dg)
full = []
for i, pg in enumerate(r2.pages):
    t = pg.extract_text() or ""
    full.append(f"===== 第 {i+1} 页 =====\n{t}")
txt = "\n".join(full)
out = os.path.join(BASE, "教学大纲-药理学-药学专业.txt")
with open(out, "w", encoding="utf-8") as f:
    f.write(txt)
print(f"  共 {len(r2.pages)} 页, 写入 {out} ({len(txt)} 字符)")
print("  预览:")
print("\n".join(txt.splitlines()[:40]))

# ---- 题库抽样与题量统计 ----
print("=" * 60)
for f in ["药理学题库01.pdf", "药理学题库02.pdf", "药理学题库03.pdf"]:
    p = os.path.join(BASE, "药理学题库1", f)
    r3 = PdfReader(p)
    t_all = "\n".join((pg.extract_text() or "") for pg in r3.pages)
    # 题号模式：行首数字 + 点 或 数字 + 顿号
    nums = re.findall(r"^\s*(\d{1,3})[\.、．]", t_all, re.M)
    print(f"{f}: {len(r3.pages)} 页, 全文 {len(t_all)} 字符, 疑似题号 {len(nums)} 个 (最大编号 {max(int(x) for x in nums) if nums else '-'})")
    first2 = "\n".join((r3.pages[i].extract_text() or "") for i in range(2))
    print(f"  格式样本(前2页):\n{first2[:600]}\n")
