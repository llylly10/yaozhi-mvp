FROM python:3.12-slim
WORKDIR /srv
# 构建期 DNS：compose 的 dns: 只对运行容器生效，build 的 RUN 步骤不继承——
# 构建容器默认拿宿主 systemd-resolved stub(127.0.0.53)，在 bridge 网络不可达，
# pip 镜像域名解析失败（2026-10-03 部署实付：Temporary failure in name resolution）。
# 公共 DNS(223.5.5.5/8.8.8.8) 从容器 bridge UDP:53 也不可达，必须用阿里云内网 DNS。
RUN printf 'nameserver 100.100.2.136\nnameserver 100.100.2.138\n' > /etc/resolv.conf
# pip 用阿里云镜像 (避免 Docker Hub IPv6 直连被掐)
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
    && pip config set global.trusted-host mirrors.aliyun.com
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt psycopg[binary]
COPY backend/ ./
# 数据库数据目录：named volume 仅挂载于此(/srv/data)，不再遮蔽 /srv 下的镜像代码，
# 保证每次 rebuild 新代码即生效、SQLite 数据独立持久化。
RUN mkdir -p /srv/data
# 种子数据：仅复制小体积 course-materials JSON（约 3MB），不含 280MB 原始语料与受版权教材 OCR
COPY corpus/course-materials/ /corpus/course-materials/
# RAG 教材检索语料：body_*.txt(约2.1MB, 538 页 OCR 文本)+chapter_index.json。_tmp/原始扫描片已由
# .dockerignore 排除，不进镜像。语料缺失时 rag 自动 no-op 不阻塞诊断。
# 容器内 backend 扁平拷贝到 /srv（无 backend/ 目录层），app/rag/corpus.py 的三级上溯
# 解析 OCR_DIR=/corpus/ocr_textbook9e —— 目标必须是绝对 /corpus/（2026-09-29 部署实测确认，
# 曾误改为 ./corpus 导致容器内语料缺失，语义路预热与教材路检索双双 no-op）。
COPY corpus/ocr_textbook9e/ /corpus/ocr_textbook9e/
# 语义模型运行时惰性加载（fastembed；启用时首次查询经 hf-mirror 下载 ~100MB 缓存于容器层）
ENV HF_ENDPOINT=https://hf-mirror.com
# 说明：云端 2C4G 默认关闭语义路（deploy compose 置 YAOZHI_RAG_SEMANTIC_ENABLED=false），
#       此 ENV 仅为将来启用时经 hf-mirror 正常下载预留（Xet 端点镜像无法代理）。
ENV HF_HUB_DISABLE_XET=1
EXPOSE 8000
# Render 通过 $PORT 注入端口；本地回退 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
