"""RAG 检索（W3 落地，v1.1 §5 证据化输出 / ADR-02 evidence_chunks）。

当前实现（2026-09-08，比赛演示基线）：
- 语料：人卫《药理学》第 9 版 OCR（corpus/ocr_textbook9e/body_<页>.txt，538 页）。
  版权：项目负责人已明确放宽红线，允许人卫教材入检索索引，仅作证据引用展示，
  不对外传播 / 不入题库正文。
- 检索（2026-09-10 双路混合 → 2026-09-29 三路升级）：
  - 教材路：BM25 词法（纯 Python、免费、本地、零 key）+ page→chapter 元数据 + 页内滑窗降噪；
  - 题库路：723 条 published 题目解析（小粒度、单主题聚焦、已质量审计）作为第二检索源，
    补教材"整页太粗 + 双栏串行 + 跨药对比跨页召回不了"的短板；
  - 语义向量路（2026-09-29 落地，semantic.py）：教材页 bge-small-zh 本地向量检索
    （fastembed ONNX，无 torch / 无 key），页向量离线预构建（backend/build_semantic_cache.py
    → app/rag/cache/），与教材 BM25 路内融合：同页取较大分、语义独有页并入候选；
    依赖/缓存/指纹任一不满足自动关闭，退回纯词法双路混合。
  - 两路各自归一化后融合，并强制每路至少 1 条，保证跨源互补（retrieve_mixed）。
- 语料范围（产品决策 2026-09-29）：本期只用教材 OCR + 自有题库解析，
  不接 NMPA 说明书 / 诊疗方案等外部语料。

对题库物化题/种子诊断题，答题诊断时按题干+错项检索命中教材切片，写入
DiagnosisEvidence(evidence_type='知识库切片')，即"教材知识点/知识点原文"证据卡
（该链路只走教材路 retrieve_top_k，不引入题库解析作为诊断证据，避免自证循环）。
"""
from .retriever import (  # noqa: F401
    Hit, best_window, get_retriever, reset_for_tests, retrieve_mixed, retrieve_top_k,
)
from .semantic import status as semantic_status  # noqa: F401

__all__ = ["get_retriever", "retrieve_top_k", "retrieve_mixed", "Hit",
           "reset_for_tests", "best_window", "semantic_status"]
