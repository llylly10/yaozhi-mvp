# 药知 MVP（W1 纵向切片）

按《实施方案设计 v1.1》第 9.1 节 W1–W2 目标实现的单题闭环：
作答 → 判分 → 规则过滤 → 模型重排 → 充分性门禁 → 追问（≤3 轮/可跳过）→ 错因卡 → 靶向训练 → 掌握状态。

## 运行（开发模式）

```bash
# 后端（SQLite，自动建表+种子）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev      # http://localhost:5173，/api 代理到 8000

# 测试
cd backend && python -m pytest tests/ -q
```

## 运行（Docker Compose，PostgreSQL + pgvector）

```bash
docker compose up --build
# web: http://localhost:5173  api: http://localhost:8000/docs
```

## 当前边界（W1）

- 模型为 MockProvider（确定性输出）；W2 按 v1.1 §2.3 接入真实模型 + 任务领取（SKIP LOCKED）。
- 种子内容（1 个诊断域 DOM-PHARMO-ANS：10 题、7 追问节点、10 错因、2 混淆对）为技术侧起草样例，
  **发布前必须由药理顾问逐字审校**（seed/seed.py，证据切片为占位，W3 接入真实切片流水线）。
- 诊断引擎在请求内同步执行（Mock 零延迟）；会话状态机与库表结构已按 v1.1 就位。
- 摸底测试、迁移复测、延迟复测调度、评测 Runner 为 W3–W4 范围。
