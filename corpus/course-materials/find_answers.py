# -*- coding: utf-8 -*-
"""逐页扫描三份题库，定位答案区（排除"共用备选答案"），输出答案格式样本。"""
import os, re
from pypdf import PdfReader

BASE = r"D:\ceshi\corpus\course-materials\药理学题库1"
FILES = ["药理学题库01.pdf", "药理学题库02.pdf", "药理学题库03.pdf"]

for f in FILES:
    print("=" * 70)
    print(f"文件: {f}")
    r = PdfReader(os.path.join(BASE, f))
    pages_text = [(pg.extract_text() or "") for pg in r.pages]
    # 找含"答案"且不是"共用备选答案"的页
    ans_pages = []
    for i, t in enumerate(pages_text):
        # 去掉"共用备选答案"后是否还有"答案"
        t2 = t.replace("共用备选答案", "")
        if "答案" in t2:
            ans_pages.append(i + 1)
    print(f"  总页数: {len(r.pages)} | 含答案的页: {ans_pages}")
    if ans_pages:
        # 打印答案页内容
        p = ans_pages[-1] - 1
        t = pages_text[p]
        print(f"  第 {p+1} 页内容（前 800 字符）:")
        print("  " + t[:800].replace("\n", "\n  "))
        # 尝试匹配答案条目：行首数字+字母
        hits = re.findall(r"^\s*(\d{1,3})\s*[\.、．\s]*([A-E])", t, re.M)
        if hits:
            print(f"  该页答案条目样例: {hits[:10]}")
        else:
            # 可能是连续字母串
            seq = re.findall(r"[A-E]{5,}", t.replace(" ", ""))
            print(f"  连续字母串样例: {seq[:5]}")
