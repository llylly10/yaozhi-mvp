FROM python:3.12-slim
WORKDIR /srv
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg[binary]
COPY backend/ ./
# 种子数据：仅复制小体积 course-materials JSON（约 3MB），不含 280MB 原始语料与受版权教材 OCR
COPY corpus/course-materials/ /corpus/course-materials/
EXPOSE 8000
# Render 通过 $PORT 注入端口；本地回退 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
