# 药知 MVP 一键演示启动脚本（Windows）
# 用法：在 PowerShell 中运行  .\start_demo.ps1
# 说明：
#  - 后端用 uvicorn 起在 127.0.0.1:8000（项目本地 venv .venv，依赖自包含，无需管理员装包）
#  - 前端用 vite dev 起在 127.0.0.1:5173（始终编译最新源码，规避旧的 dist 构建）
#  - 启动后自动调用 /admin/reset-demo 复位为初始种子数据，保证演示可重现
#  - 两个服务各自开独立窗口，关闭窗口即停止
# 环境准备（首次）：python -m venv .venv && .venv\Scripts\pip install -r backend\requirements.txt

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
# 解析后端 python：优先 backend/.venv；缺失时尝试自动建 venv 并装依赖；
# 再否则回退到 PATH 中能 import fastapi 的 python（依赖已预装的场景）。
$VenvPy1 = Join-Path $Root ".venv\Scripts\python.exe"
$VenvPy2 = Join-Path $Root "backend\.venv\Scripts\python.exe"
$Py = $null
if (Test-Path $VenvPy1) {
    $Py = $VenvPy1
} elseif (Test-Path $VenvPy2) {
    $Py = $VenvPy2
} else {
    try {
        Write-Host "未检测到 .venv，尝试自动创建虚拟环境并安装依赖..."
        & python -m venv (Join-Path $Root "backend\.venv") 2>&1 | Out-Null
        & $VenvPy2 -m pip install -q -r (Join-Path $Backend "requirements.txt") 2>&1 | Out-Null
    } catch { Write-Warning "自动创建 venv 失败：$_" }
    if (Test-Path $VenvPy2) { $Py = $VenvPy2 }
}
if (-not $Py) {
    try { $Py = (python -c "import sys,fastapi; print(sys.executable)" 2>$null) } catch { $Py = $null }
    if (-not $Py) { $Py = "python" }
    Write-Warning "未使用虚拟环境，回退到：$Py（请确保已 pip install -r backend/requirements.txt）"
}
# 预检：所选 python 必须能导入 fastapi，否则明确报错而非静默失败
try {
    & $Py -c "import fastapi" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "fastapi 未安装" }
} catch {
    Write-Error "后端 python（$Py）缺少 fastapi 等依赖。请先执行：python -m venv .venv 并 pip install -r backend/requirements.txt"; exit 1
}
$NpmFound = (Get-Command npm.cmd, npm -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
$Npm = if ($NpmFound) { $NpmFound } else { "npm.cmd" }

function Test-Port($port) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect("127.0.0.1", $port)
        $c.Close()
        return $true
    } catch { return $false }
}

if (Test-Port 8000) { Write-Warning "8000 端口已被占用，请先关闭旧的后端进程" }
if (Test-Port 5173) { Write-Warning "5173 端口已被占用，请先关闭旧的前端进程" }

# 1) 启动后端
Start-Process -FilePath $Py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000","--reload" `
    -WorkingDirectory $Backend -WindowStyle Normal | Out-Null
Write-Host "后端启动中..."

# 2) 等待后端健康
$up = $false
for ($i = 0; $i -lt 25; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "http://127.0.0.1:8000/healthz" -TimeoutSec 2
        if ($r.ok) { $up = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $up) { Write-Error "后端未能在 25s 内就绪，请检查 backend 依赖与端口"; exit 1 }
Write-Host "后端就绪 http://127.0.0.1:8000"

# 3) 复位演示数据（保证每次演示从干净种子开始）
try {
    Invoke-RestMethod -Uri "http://127.0.0.1:8000/admin/reset-demo" -Method Post | Out-Null
    Write-Host "演示数据已复位为初始种子"
} catch {
    Write-Warning "复位失败（将使用现有数据）：$_"
}

# 4) 启动前端（vite dev，始终最新源码）
Start-Process -FilePath $Npm -ArgumentList "run","dev","--","--host","127.0.0.1","--port","5173" `
    -WorkingDirectory $Frontend -WindowStyle Normal | Out-Null
Write-Host "前端启动中..."

Start-Sleep -Seconds 3
Start-Process "http://127.0.0.1:5173" | Out-Null

Write-Host ""
Write-Host "========== 药知演示已启动 =========="
Write-Host "  前端  http://127.0.0.1:5173"
Write-Host "  后端  http://127.0.0.1:8000"
Write-Host "  复位  POST http://127.0.0.1:8000/admin/reset-demo"
Write-Host "  关闭两个弹出的终端窗口即可停止演示"
