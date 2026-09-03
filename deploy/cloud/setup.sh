#!/usr/bin/env bash
# 药知 MVP · 云服务器一键部署（在 Linux 服务器上以 sudo 用户执行，如 admin）
# 前置：一台 Ubuntu/Debian 云服务器 + 已 clone 本仓库到 ~/yaozhi-mvp
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/4] 安装 Docker（如缺失，需 sudo）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
  echo "    已安装 Docker（当前 shell 未生效 docker 组，下面统一用 sudo docker）"
fi
if ! sudo docker compose version >/dev/null 2>&1; then
  echo "    需要 docker compose 插件，请先安装 docker-ce 完整版"; exit 1
fi

echo "==> [2/4] 安装 Node.js 22（构建前端用；新服务器通常没有）"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    node: $(node -v)  npm: $(npm -v)"

echo "==> [3/4] 构建前端静态站"
cd "$REPO_ROOT/frontend"
npm install
npm run build
cd "$REPO_ROOT"

echo "==> [4/4] 启动后端 + nginx（sudo docker）"
cd "$REPO_ROOT/deploy/cloud"
sudo docker compose up -d --build

echo ""
echo "✅ 部署完成。浏览器访问: http://<服务器公网IP>"
echo "   查看状态: cd deploy/cloud && sudo docker compose ps"
echo "   查看日志: sudo docker compose logs -f backend"
echo "   重置演示数据: sudo docker compose exec backend python -c \"from app.db import SessionLocal; from seed.seed import reset_demo; reset_demo(SessionLocal())\""
