"""教材 OCR 语料装载与 page→chapter 元数据（RAG 索引底料）。

数据源：corpus/ocr_textbook9e/body_<PDF页>.txt（body_NNN，NNN 0 起，共 538 页）。
每页一个文件，文本为中文字符流、无段落标记；故以"页"为检索文档单元。

page→chapter 映射来源：corpus/course-materials/药理教材OCR章节索引-20260902.md
（含 2026-09-03 页眉复核勘误）。已可靠定位的章起始 PDF 页在此编码；未命中章节
（21-29、31-39 部分）正文仍在，靠 BM25 关键词召回，chapter_label 标为"教材第X章?"近似。
"""
from __future__ import annotations

import glob
import os
import re
from dataclasses import dataclass

# 项目根：本文件位于 backend/app/rag/ → 上溯 3 级到 yaozhi-mvp/
_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(_PKG_DIR, "..", "..", ".."))
OCR_DIR = os.path.join(REPO_ROOT, "corpus", "ocr_textbook9e")

# 已定位的章起始 PDF 页（PDF 页 = body_NNN 的 NNN）。元组: (pdf_page, 章号, 标题)
# 依据 OCR 章节索引 + 2026-09-03 勘误页眉复核。仅列已可靠命中者；未列区间走关键词兜底。
CHAPTER_STARTS: list[tuple[int, str, str]] = [
    (19, "第1章", "绪论"),
    (25, "第2章", "药物代谢动力学"),
    (47, "第3章", "药物效应动力学"),
    (62, "第4章", "传出神经系统药理学概论"),
    (77, "第5章", "作用于胆碱能神经系统的药物"),
    (91, "第6章", "肾上腺素受体激动药与拮抗药"),
    (107, "第7章", "局部麻醉药"),
    (115, "第8章", "中枢神经系统药理学概论"),
    (125, "第9章", "镇静催眠药"),
    (133, "第10章", "抗癫痫药及抗惊厥药"),
    (141, "第11章", "镇痛药"),
    (155, "第12章", "精神障碍治疗药物"),
    (167, "第13章", "神经系统退行性疾病治疗药物"),
    (179, "第14章", "全身麻醉药"),
    (181, "第15章", "其他具有中枢作用的药物"),
    (193, "第16章", "抗高血压药"),
    (211, "第17章", "抗心律失常药"),
    (227, "第18章", "抗心力衰竭药"),
    (243, "第19章", "抗心绞痛药"),
    (255, "第20章", "调血脂药与抗动脉粥样硬化药"),
    (296, "第24章", "影响其他自体活性物质的药物(组胺与抗组胺药等)"),  # 页眉复核第二十四章 PDF296起
    (355, "第30章", "影响其他自体活性物质的药物(含组胺抗组胺药节)"),
    (443, "第39章", "抗结核药与抗麻风药"),   # 页眉复核 PDF 443-450（第四十章首现 PDF 451）
    (455, "第40章", "抗真菌药及抗病毒药"),
]


@dataclass
class Page:
    """教材单页（检索单元）。"""
    pdf_page: int        # body_NNN 的 NNN（0 起）
    text: str            # 全页 OCR 文本（去除噪声首尾空白）
    chapter: str = ""    # 近似章标签，如 "第7章 局部麻醉药"，未知则 ""
    book_page: int = 0   # 书内页码 ≈ pdf_page - 17（索引表口径），仅作展示


def _clean(text: str) -> str:
    # 去 OCR 页眉/页脚的孤立页码与极短噪声行，压连续空白。
    lines = []
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        if re.fullmatch(r"[\u4e00-\u9fff]{0,3}?第?[一二三四五六七八九十0-9]{1,3}章?[^.·]{0,4}", ln) and len(ln) <= 12:
            # 不剥章标题（它是定位信号），仅剥疑似页脚数字行
            if re.fullmatch(r"[0-9\-—]{1,6}", ln):
                continue
        lines.append(ln)
    return "".join(lines)


def _chapter_for(pdf_page: int) -> str:
    """二分定位 pdf_page 落在哪个已定位章内；落在正文起点(19)前返回空。"""
    if pdf_page < CHAPTER_STARTS[0][0]:
        return ""
    lo = 0
    for i in range(len(CHAPTER_STARTS) - 1, -1, -1):
        if pdf_page >= CHAPTER_STARTS[i][0]:
            no, title = CHAPTER_STARTS[i][1], CHAPTER_STARTS[i][2]
            # 若落在未定位大区间（下一章起点未列出），给近似章号不带边界结论
            return f"{no} {title}"
    return ""


def load_pages(ocr_dir: str | None = None) -> list[Page]:
    """读取全部 body_NNN.txt → Page 列表（按页序升序）。语料缺失时返回 []。"""
    d = ocr_dir or OCR_DIR
    if not os.path.isdir(d):
        return []
    pages: list[Page] = []
    for f in sorted(glob.glob(os.path.join(d, "body_*.txt"))):
        m = re.search(r"body_(\d+)\.txt$", f)
        if not m:
            continue
        num = int(m.group(1))
        with open(f, encoding="utf-8", errors="ignore") as fh:
            text = _clean(fh.read())
        if not text:
            continue
        pages.append(Page(pdf_page=num, text=text,
                          chapter=_chapter_for(num), book_page=max(0, num - 17)))
    pages.sort(key=lambda p: p.pdf_page)
    return pages
