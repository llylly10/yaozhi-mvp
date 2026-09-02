# -*- coding: utf-8 -*-
"""
药理教材(人卫《药理学》第9版)OCR 管线 —— 版权参照级提取
===================================================
输入: 教材扫描版 PDF（538 页，文本型缺失，需 OCR）
输出: 每页一个 txt（UTF-8），corpus/ocr_textbook9e/body_<页索引>.txt
特点: 断点续跑(已有输出则跳过) / 进度可恢复 / 幂等可重放
用法:
  python ocr_textbook9e.py                 # 全量 0..N
  python ocr_textbook9e.py 85 120          # 指定区间 [85,120)
  python ocr_textbook9e.py --resume        # 只跑缺失页
依赖: pypdf, pillow, rapidocr-onnxruntime (python -m pip install ...)
"""
import io, sys, os, time, argparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PDF_PATH = r"D:\Backup\xwechat_files\wxid_yq2j9sp7j5nb22_be3b\msg\attach\58af6d7cbfe9da8fcff7b1cd63db5d17\2026-09\Rec\20bfc43ffa3aada3\F\0\药理教材.pdf"
OUT_DIR = r"D:\ceshi\yaozhi-mvp\corpus\ocr_textbook9e"
TARGET_LEN = 2400   # OCR 输入图最长边像素（质量/速度平衡）
TMP_DIR = os.path.join(OUT_DIR, "_tmp")

def ocr_page_text(engine, page_img, idx):
    """提取页图 → 缩放 → RapidOCR → 文本。"""
    from PIL import Image
    img = page_img.convert("RGB")
    w, h = img.size
    scale = TARGET_LEN / max(w, h)
    if scale < 1:
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    os.makedirs(TMP_DIR, exist_ok=True)
    tmp = os.path.join(TMP_DIR, f"pg{idx:03d}.png")
    img.save(tmp)
    result, _ = engine(tmp)
    return "\n".join(item[1] for item in result) if result else ""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("start", nargs="?", type=int, default=None)
    ap.add_argument("end", nargs="?", type=int, default=None)
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()

    from pypdf import PdfReader
    from rapidocr_onnxruntime import RapidOCR

    os.makedirs(OUT_DIR, exist_ok=True)
    r = PdfReader(PDF_PATH)
    total = len(r.pages)
    print(f"总页数: {total}")

    if args.resume:
        done = {int(f.split("_")[1].split(".")[0]) for f in os.listdir(OUT_DIR) if f.startswith("body_")}
        pages = [i for i in range(total) if i not in done]
        print(f"断点续跑: 已有 {len(done)} 页, 待跑 {len(pages)} 页")
    elif args.start is not None and args.end is not None:
        pages = list(range(args.start, args.end))
    else:
        pages = list(range(total))

    engine = RapidOCR()
    t0 = time.time()
    ok = 0
    for i in pages:
        try:
            imgs = list(r.pages[i].images)
            if not imgs:
                txt = ""
            else:
                txt = ocr_page_text(engine, imgs[0].image, i)
            with open(os.path.join(OUT_DIR, f"body_{i:03d}.txt"), "w", encoding="utf-8") as f:
                f.write(txt)
            ok += 1
        except Exception as e:
            print(f"页{i}: 失败 {e}", flush=True)
        if ok % 20 == 0:
            el = time.time() - t0
            print(f"进度: 已完成 {ok}/{len(pages)} 页, 已用 {el:.0f}s, 预计剩余 {el/ok*(len(pages)-ok):.0f}s", flush=True)
    print(f"完成: {ok}/{len(pages)} 页, 总耗时 {time.time()-t0:.0f}s")

if __name__ == "__main__":
    main()
