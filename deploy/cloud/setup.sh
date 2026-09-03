#!/usr/bin/env bash
# 药知 MVP · 云服务器一键部署（在 Linux 服务器上以 sudo 用户执行，如 admin）
# 前置：一台 Ubuntu/Debian 云服务器 + 已 clone 本仓库到 ~/yaozhi-mvp
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/4] 安装 Docker（如缺失，需 sudo）"
# 阿里云 ECS 出网能力约束：DNS 解析到 IPv6, 但只 IPv4 通. 因此:
#  - apt/docker-ce 用阿里云镜像站
#  - 一切 curl 加 -4 强制 IPv4
#  - 配 Docker registry-mirrors 让守护进程拉镜像也走 IPv4 镜像
if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  [ -f /etc/apt/keyrings/docker.asc ] || sudo curl -4fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker "$USER" || true
  echo "    已安装 Docker（当前 shell 未生效 docker 组，下面统一用 sudo docker）"
fi
if ! sudo docker compose version >/dev/null 2>&1; then
  echo "    需要 docker compose 插件，请先安装 docker-ce 完整版"; exit 1
fi
# 配 registry-mirrors: 让 dockerd 拉镜像走阿里云加速器 (避免 IPv6 失败)
if [ ! -f /etc/docker/daemon.json ]; then
  sudo mkdir -p /etc/docker
  sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://mirror.ccs.tencentyun.com",
    "https://registry.docker-cn.com"
  ],
  "ip-forward": true,
  "iptables": false
}
JSON
  sudo systemctl restart docker || sudo service docker restart || true
  sleep 2
fi

echo "==> [2/4] 安装 Node.js 22（构建前端用；新服务器通常没有）"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  # 用国内 npmmirror 镜像装 Node (避免 deb.nodesource.com 撞 IPv6)
  curl -4fsSL https://registry.npmmirror.com/-/binary/node/v22.11.0/node-v22.11.0-linux-x64.tar.gz -o /tmp/node.tgz
  sudo tar -xzf /tmp/node.tgz -C /usr/local --strip-components=1
  echo 'export PATH=/usr/local/bin:$PATH' | sudo tee /etc/profile.d/node.sh >/dev/null
  rm -f /tmp/node.tgz
fi
export PATH=/usr/local/bin:$PATH
echo "    node: $(node -v)  npm: $(npm -v)"
# npm 也用国内镜像
npm config set registry https://registry.npmmirror.com

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
