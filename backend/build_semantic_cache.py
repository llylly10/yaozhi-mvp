# -*- coding: utf-8 -*-
"""预构建教材语义向量缓存（RAG 语义路，2026-09-29）。

用法（backend 目录下）：
    python build_semantic_cache.py             # 缓存存在且指纹匹配 → 跳过构建
    python build_semantic_cache.py --force     # 忽略既有缓存强制重建
    python build_semantic_cache.py --warmup    # 缓存已新鲜时仍加载模型（Docker 镜像构建预热）
    python build_semantic_cache.py --status    # 仅查看语义路状态

- 模型：BAAI/bge-small-zh-v1.5（fastembed ONNX，本地 CPU，无 torch / 无 API key）
- 下载：默认经 hf-mirror.com（~100MB，仅一次，缓存在系统临时目录）
- 产物：backend/app/rag/cache/textbook_bge_small_zh.npz（约 1.5MB，含语料指纹，入库可复现）
- 云端：Dockerfile 构建期执行本脚本预热；失败不阻塞镜像构建（运行时自动退回 BM25）
"""
import argparse
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")  # 大陆网络：HuggingFace 镜像

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.rag import semantic  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="构建教材语义向量缓存（bge-small-zh 本地 ONNX）")
    ap.add_argument("--force", action="store_true", help="忽略既有缓存强制重建")
    ap.add_argument("--warmup", action="store_true", help="缓存已新鲜时仍加载模型并试编码（镜像构建预热）")
    ap.add_argument("--status", action="store_true", help="仅查看语义路状态")
    ap.add_argument("--ocr-dir", default=None, help="教材 OCR 目录（默认 corpus/ocr_textbook9e）")
    args = ap.parse_args()

    if args.status:
        st = semantic.status(args.ocr_dir)
        print("enabled=%s available=%s model=%s pages=%s chunks=%s reason=%s" % (
            st["enabled"], st["available"], st["model"], st["pages"], st["chunks"], st["reason"]))
        return 0

    res = semantic.build_cache(args.ocr_dir, force=args.force, warmup=args.warmup)
    if not res.get("ok"):
        print("[FAIL] %s" % res.get("reason"))
        return 1
    if res.get("cached") and not args.warmup:
        print("[SKIP] 缓存已新鲜（指纹 %s），如需重建加 --force" % res.get("fingerprint"))
    else:
        print("[OK] 页向量缓存已构建：%s 片 / %s 页，dim=%s，耗时 %ss" % (
            res.get("chunks"), res.get("pages"), res.get("dim"), res.get("seconds")))
    print("cache: %s" % res.get("cache"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
