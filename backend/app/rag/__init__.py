"""RAG 检索（W3 落地，v1.1 §5 证据化输出 / ADR-02 evidence_chunks）。

当前实现（2026-09-08，比赛演示基线）：
- 语料：人卫《药理学》第 9 版 OCR（corpus/ocr_textbook9e/body_<页>.txt，538 页）。
  版权：项目负责人已明确放宽红线，允许人卫教材入检索索引，仅作证据引用展示，
  不对外传播 / 不入题库正文。
- 检索：BM25 词法（纯 Python、免费、本地、零 key）为主；page→chapter 元数据定位。
- 语义 embedding（本地 all-MiniLM-L6-v2 已缓存 / 云 Qwen embedding）作为可插拔升级项，
  同接口待接，见 retriever.SemanticMiniLMRetriever 占位说明。

对题库物化题/种子诊断题，答题诊断时按题干+错项检索命中教材切片，写入
DiagnosisEvidence(evidence_type='知识库切片')，即"教材知识点/知识点原文"证据卡。
"""
from .retriever import get_retriever, retrieve_top_k  # noqa: F401

__all__ = ["get_retriever", "retrieve_top_k"]
