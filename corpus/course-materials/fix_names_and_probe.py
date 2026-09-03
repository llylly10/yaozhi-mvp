# -*- coding: utf-8 -*-
"""修正：按 zip 条目名（GBK 解码）精确重命名题库文件；
复制教学大纲到工作目录；探测教材 PDF（原路径）。"""
import os, shutil, zipfile

BASE = r"D:\ceshi\corpus\course-materials"
ZIP = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\2\药理学题库1.pdf.zip"
DG = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\1\教学大纲-药理学-药学专业.pdf"
JIAOCAI = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\0\药理教材.pdf"

# 1) 删除乱码目录（仅限 course-materials 下非中文名目录，安全）
for name in os.listdir(BASE):
    p = os.path.join(BASE, name)
    if os.path.isdir(p) and any(ord(c) > 127 for c in name) and not any("\u4e00" <= c <= "\u9fff" for c in name):
        shutil.rmtree(p)
        print(f"删除乱码目录: {name}")

# 2) 按 zip 条目名重新解压（GBK 解码正确文件名）
with zipfile.ZipFile(ZIP) as z:
    for info in z.infolist():
        if info.is_dir():
            continue
        fixed = info.filename.encode("cp437").decode("gbk")  # 药理学题库1.pdf/药理学题库01.pdf
        parts = fixed.split("/")
        folder = os.path.join(BASE, "药理学题库1")
        os.makedirs(folder, exist_ok=True)
        dst = os.path.join(folder, parts[-1])
        with z.open(info) as src, open(dst, "wb") as out:
            shutil.copyfileobj(src, out)
        print(f"解压: {parts[-1]} ({os.path.getsize(dst)/1024:.0f} KB)")

# 3) 复制教学大纲
dst_dg = os.path.join(BASE, "教学大纲-药理学-药学专业.pdf")
if not os.path.exists(dst_dg):
    shutil.copy2(DG, dst_dg)
print(f"教学大纲已复制: {os.path.getsize(dst_dg)/1024:.0f} KB")

# 4) 探测教材 PDF（原路径，只读）
print("-" * 60)
from pypdf import PdfReader
r = PdfReader(JIAOCAI, strict=False)
n = len(r.pages)
chars = 0
for i in range(min(3, n)):
    try:
        t = r.pages[i].extract_text() or ""
    except Exception:
        t = ""
    chars += len(t.strip())
print(f"药理教材.pdf: {os.path.getsize(JIAOCAI)/1024/1024:.0f} MB | 页数: {n} | 前3页文本: {chars} 字符 | 类型: {'文本型' if chars > 200 else '扫描/图片型'}")
if chars > 200:
    print("样本:", (r.pages[0].extract_text() or "")[:120].replace("\n", " "))
