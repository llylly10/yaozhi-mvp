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
# 配 registry-mirrors: 让 dockerd 拉镜像走 https 代理 (避免 IPv6 失败)
# 注: 之前用 docker.mirrors.ustc.edu.cn 因 DNS 解析不到挂了, 改用 dockerproxy.com 公开代理
# 强制覆盖 (脚本可重跑)
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "registry-mirrors": [
    "https://dockerproxy.com",
    "https://docker.m.daocloud.io"
  ],
  "ip-forward": true,
  "iptables": false,
  "dns": ["223.5.5.5", "8.8.8.8"]
}
JSON
sudo systemctl restart docker || sudo service docker restart || true
sleep 3
echo "    daemon.json:" && sudo cat /etc/docker/daemon.json

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
# 服务器到 npmjs.org 是通的 (实测). 先默认走 npmjs 官方; 若后续遇卡顿可换 npmmirror
# 注: 之前 npmmirror 同步滞后致 @fontsource/noto-serif-sc 404, 改回官方
npm config set registry https://registry.npmjs.org
npm config set fund false
npm config set audit false

echo "==> [3/4] 构建前端静态站（dist/ 已存在则跳过，避免服务器上 rolldown native binding 问题）"
cd "$REPO_ROOT/frontend"
# 修 npm 缓存权限 (旧版本 npm 的 bug: 之前 sudo 装 docker 时留下了 root-owned 缓存, 致 npm install EACCES)
sudo chown -R "$(id -u):$(id -g)" /home/admin/.npm 2>/dev/null || chown -R "$(id -u):$(id -g)" ~/.npm 2>/dev/null || true
# 清掉旧 _cacache/tmp (可能含 root-owned 临时目录)
sudo rm -rf /home/admin/.npm/_cacache/tmp 2>/dev/null || true
if [ -f dist/index.html ]; then
  echo "    ✅ dist/index.html 已存在, 跳过构建（前端在本机构建, 服务器只起 nginx 提供静态）"
else
  echo "    ⚠ dist/ 不存在, 服务器本地构建..."
  npm install
  # vite 8 用 rolldown 的 native binding, 在 ECS 上 optionalDependencies 经常装不上
  # 强制补装 linux-x64-gnu binding (失败也继续, 让 vite build 自己报错)
  npm install --no-save @rolldown/binding-linux-x64-gnu@1.2.6 2>&1 | tail -3 || true
  npm run build || {
    echo "    ❌ 本地构建失败（rolldown native binding 等问题）";
    echo "    解决: 在本机构建后, 将 frontend/dist/ 加入 tarball 重传";
    exit 1;
  }
fi
cd "$REPO_ROOT"

echo "==> [4/4] 启动后端 + nginx（sudo docker）"
cd "$REPO_ROOT/deploy/cloud"
sudo docker compose up -d --build

echo ""
echo "✅ 部署完成。浏览器访问: http://<服务器公网IP>"
echo "   查看状态: cd deploy/cloud && sudo docker compose ps"
echo "   查看日志: sudo docker compose logs -f backend"
echo "   重置演示数据: sudo docker compose exec backend python -c \"from app.db import SessionLocal; from seed.seed import reset_demo; reset_demo(SessionLocal())\""
