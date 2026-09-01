# 药知 MVP 一键演示启动脚本（Windows）
# 用法：在 PowerShell 中运行  .\start_demo.ps1
# 说明：
#  - 后端用 uvicorn 起在 127.0.0.1:8000（系统 Python，已装 fastapi/uvicorn/sqlalchemy）
#  - 前端用 vite dev 起在 127.0.0.1:5173（始终编译最新源码，规避旧的 dist 构建）
#  - 启动后自动调用 /admin/reset-demo 复位为初始种子数据，保证演示可重现
#  - 两个服务各自开独立窗口，关闭窗口即停止

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Py = "D:\Program Files\Python314\python.exe"
$Npm = "C:\Users\Administrator\.workbuddy\binaries\node\versions\22.22.2-2\npm.cmd"

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
Start-Process -FilePath $Py -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000" `
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
