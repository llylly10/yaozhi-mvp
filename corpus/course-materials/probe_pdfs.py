# -*- coding: utf-8 -*-
"""勘察 2026-09-01 用户提供的三份教学材料：
- 药理学题库1.pdf.zip（内 3 个 PDF，GBK 文件名需重命名）
- 教学大纲-药理学-药学专业.pdf
- 药理教材.pdf（733MB，疑似扫描版）

输出：正确文件名、页数、前 3 页可提取文本字符数（判断文本型/扫描型）。
"""
import os, zipfile, sys

BASE = r"D:\ceshi\corpus\course-materials"
ZIP = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\2\药理学题库1.pdf.zip"

# 1) 从 zip 原始条目名恢复正确文件名（zip 内是 GBK 编码）
print("=" * 70)
print("STEP 1: zip 内原始文件名（尝试 GBK/UTF-8 解码）")
with zipfile.ZipFile(ZIP) as z:
    for info in z.infolist():
        raw = info.filename
        dec = None
        for enc in ("gbk", "utf-8", "cp437"):
            try:
                dec = raw.encode("cp437").decode(enc) if enc == "cp437" else raw
                # 通用做法：先按 cp437 还原字节再按 gbk 解码
                break
            except Exception:
                continue
        try:
            fixed = raw.encode("cp437").decode("gbk")
        except Exception:
            fixed = raw
        print(f"  raw={raw!r}\n      -> gbk解码: {fixed}")

# 2) 重命名乱码目录/文件
print("=" * 70)
print("STEP 2: 重命名乱码文件")
for root, dirs, files in os.walk(BASE):
    for name in files + dirs:
        if "ß" in name or "¢" in name or "Ô" in name or "Ý" in name or "+" in name and name.endswith(".pdf"):
            try:
                fixed = name.encode("cp437").decode("gbk")
            except Exception:
                fixed = name
            src = os.path.join(root, name)
            dst = os.path.join(root, fixed)
            if src != dst and not os.path.exists(dst):
                os.rename(src, dst)
                print(f"  {name!r} -> {fixed}")
print("  完成")

# 3) 遍历所有 PDF，统计页数与文本量
print("=" * 70)
print("STEP 3: PDF 勘察")
from pypdf import PdfReader

def probe(path):
    size_mb = os.path.getsize(path) / 1024 / 1024
    try:
        r = PdfReader(path, strict=False)
        n = len(r.pages)
        chars = 0
        sample = ""
        for i in range(min(3, n)):
            try:
                t = r.pages[i].extract_text() or ""
            except Exception:
                t = ""
            chars += len(t.strip())
            if not sample and t.strip():
                sample = t.strip()[:80].replace("\n", " ")
        kind = "文本型" if chars > 200 else ("扫描/图片型" if n > 0 else "空")
        return n, chars, kind, sample
    except Exception as e:
        return -1, 0, f"解析失败: {e}", ""

for root, dirs, files in os.walk(BASE):
    for f in sorted(files):
        if f.lower().endswith(".pdf"):
            p = os.path.join(root, f)
            n, chars, kind, sample = probe(p)
            print(f"\n文件: {os.path.relpath(p, BASE)}")
            print(f"  大小: {os.path.getsize(p)/1024:.0f} KB | 页数: {n} | 前3页文本: {chars} 字符 | 类型: {kind}")
            if sample:
                print(f"  样本: {sample}")

# 4) 大纲 PDF 单独细看（小文件，直接读全部页结构）
print("=" * 70)
print("STEP 4: 大纲 PDF 页数")
for root, dirs, files in os.walk(BASE):
    for f in files:
        if "教学大纲" in f:
            p = os.path.join(root, f)
            try:
                r = PdfReader(p)
                print(f"  教学大纲: {len(r.pages)} 页, 全文可提取字符: ", end="")
                total = sum(len((r.pages[i].extract_text() or "")) for i in range(len(r.pages)))
                print(total)
            except Exception as e:
                print(f"  教学大纲解析失败: {e}")
print("勘察结束")
