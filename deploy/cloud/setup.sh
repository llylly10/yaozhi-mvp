#!/usr/bin/env bash
# 药知 MVP · 云服务器一键部署（在 Linux 服务器上执行，非本机）
# 前置：一台装了 Ubuntu/Debian 的云服务器 + 已 clone 本仓库到 ~/yaozhi-mvp
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/3] 校验/安装 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  echo "    已安装 Docker，请重新登录 SSH 使 docker 组生效，或执行: newgrp docker"
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "    需要 docker compose 插件，请先安装 docker-ce 完整版"; exit 1
fi

echo "==> [2/3] 构建前端静态站"
cd "$REPO_ROOT/frontend"
npm install
npm run build
cd "$REPO_ROOT"

echo "==> [3/3] 启动后端 + nginx"
cd "$REPO_ROOT/deploy/cloud"
docker compose up -d --build

echo ""
echo "✅ 部署完成。浏览器访问: http://<服务器公网IP>"
echo "   查看状态: cd deploy/cloud && docker compose ps"
echo "   查看日志: docker compose logs -f backend"
echo "   重置演示数据: docker compose exec backend python -c \"from app.db import SessionLocal; from seed.seed import reset_demo; reset_demo(SessionLocal())\""
