FROM python:3.12-slim
WORKDIR /srv
# pip 用阿里云镜像 (避免 Docker Hub IPv6 直连被掐)
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg[binary]
COPY backend/ ./
# 种子数据：仅复制小体积 course-materials JSON（约 3MB），不含 280MB 原始语料与受版权教材 OCR
COPY corpus/course-materials/ /corpus/course-materials/
# RAG 教材检索语料：body_*.txt(约2.1MB, 538 页 OCR 文本)+chapter_index.json。_tmp/原始扫描片已由
# .dockerignore 排除，不进镜像。语料缺失时 rag 自动 no-op 不阻塞诊断。
COPY corpus/ocr_textbook9e/ /corpus/ocr_textbook9e/
EXPOSE 8000
# Render 通过 $PORT 注入端口；本地回退 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
