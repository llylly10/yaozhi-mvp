# 药知 MVP · 云服务器单机部署

适用于任意 Linux VPS（阿里云 ECS / 腾讯云 CVM / AWS EC2 / DigitalOcean 等）。
前后端同机：后端跑 Docker 容器，nginx 托管前端静态站并反代 `/api`，**同源、无跨域、无冷启动**。

## 一、准备服务器

- 系统：Ubuntu 22.04 / Debian 12（其他含 docker 的 Linux 亦可）
- 规格：1 vCPU / 1–2 GB 内存即可跑演示（约 ¥30–100/月）
- 安全组/防火墙：放通 **22(SSH)** 与 **80(HTTP)**；如配 HTTPS 再放通 443
- 建议绑定一个域名（A 记录指向服务器 IP），不用域名直接拿 IP 也行

## 二、部署（在服务器上执行）

```bash
# 1. 把代码拉到服务器（私有仓库记得先配 SSH key 或 access token）
git clone <你的仓库地址> ~/yaozhi-mvp
cd ~/yaozhi-mvp

# 2. 一键部署（自动装 Docker、构建前端、起后端+nginx）
bash deploy/cloud/setup.sh
```

完成后浏览器打开 `http://<服务器公网IP>` 即可，把地址发给队友。

## 三、常用运维

```bash
cd deploy/cloud

docker compose ps                 # 看服务状态
docker compose logs -f backend    # 看后端日志
docker compose restart            # 重启全部
docker compose down               # 停止并移除容器（数据卷保留）

# 重置演示数据（清空后自动重建种子）
docker compose exec backend python -c "from app.db import SessionLocal; from seed.seed import reset_demo; reset_demo(SessionLocal())"
```

## 四、可选：HTTPS（建议）

1. 域名 A 记录指向服务器 IP，且 80 端口可访问。
2. 在服务器上执行：
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --webroot -w /var/www/html -d 你的域名
   ```
3. 把证书挂进 nginx 容器（`docker-compose.yml` 取消 443 注释 + 增挂证书卷），
   并将 `nginx.conf` 的 `listen 80;` 改为 `listen 443 ssl;` 并补 `ssl_certificate/ssl_certificate_key` 两行。
4. 重新 `docker compose up -d nginx`。

## 五、与 Cloudflare 方案的差异

| 项 | 本方案(云服务器) | Cloudflare Pages + Render |
|---|---|---|
| 后端 | 同机 Docker 原生跑 Python ✅ | 必须 Render，Cloudflare 跑不了 ❌ |
| 跨域 | nginx 同机反代，无跨域 ✅ | 需 Cloudflare Function 代理 `/api` ⚠️ |
| 冷启动 | 常驻在线 ✅ | Render 免费层 15 分钟休眠 ⚠️ |
| 费用 | 约 ¥30–100/月 💰 | 前端+后端免费 🆓 |
| 运维 | 一次装 Docker + 跑脚本 ⚠️ | 基本零运维 ✅ |

> 注：本仓库之前还备过 Cloudflare 方案配置（`frontend/wrangler.toml`、`frontend/functions/`、`render.yaml`），
> 走云服务器路线可忽略它们，不影响本方案。
