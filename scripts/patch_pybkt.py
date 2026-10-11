# -*- coding: utf-8 -*-
"""pyBKT 1.4.3 补丁：修复 util/metrics.py 的 import 期崩溃。

**问题**：pyBKT 1.4.3 在 `fetch_supported_metrics()` 里用纯 Python list 探测
sklearn 指标（`dummy_x, dummy_y = [0,1]*5, [1,0]*5`）。sklearn 1.9.1 的
`_log_loss` 期望 ndarray，收到 list 后抛
`AttributeError: 'list' object has no attribute 'dtype'`。
而原代码只`except TypeError`，AttributeError 逃出 → **import pyBKT 即崩**。

**既有事实**：此前的 `.venv` 环境之所以能跑，是因为有人手工把该行改成了
`except Exception`（直接改site-packages，未留任何记录）。迁移到 uv 时环境
重建，这个补丁丢失 → `test_mastery_bkt` 的可选依赖用例被静默 skip，
测试从 140 passed 1 skipped 变成 139 passed 2 skipped，**不报错不告警**。

**本脚本把补丁固化为可重放的部署步骤**，不再依赖"某台机器上手工改过"。
幂等：已打过补丁则跳过。

用法：
  python scripts/patch_pybkt.py                # 自动定位仓库根的 .venv
  python scripts/patch_pybkt.py --venv <路径>  # 指定环境
  python scripts/patch_pybkt.py --check       # 只检查不修改（返回码 1=未打）

典型场景（uv 环境重建后）：
  uv sync && python scripts/patch_pybkt.py
"""
import argparse
import sys
from pathlib import Path

OLD = "            except TypeError:"
NEW = "            except Exception:"
TARGET = "pyBKT/util/metrics.py"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--venv", default=None, help="venv 根目录，默认取仓库根的 .venv")
    ap.add_argument("--check", action="store_true", help="只检查不修改")
    args = ap.parse_args()

    root = Path(__file__).resolve().parents[1]
    venv = Path(args.venv) if args.venv else root / ".venv"
    if venv.name == "Scripts":          # 传进来的是 python.exe 所在目录
        venv = venv.parent

    for base in (venv / "Lib" / "site-packages",
                 venv / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages"):
        f = base / TARGET
        if f.exists():
            break
    else:
        print(f"未找到 {TARGET}（venv={venv}）—— pyBKT 未安装则无需补丁，返回 0")
        return 0

    src = f.read_text(encoding="utf-8")
    if NEW in src:
        print(f"补丁已存在，跳过：{f}")
        return 0
    if OLD not in src:
        print(f"⚠️  目标行未找到，pyBKT 版本可能已变（{f}），请人工确认。")
        return 1
    if args.check:
        print(f"未打补丁：{f}")
        return 1

    f.write_text(src.replace(OLD, NEW), encoding="utf-8")
    print(f"已打补丁：{f}（except TypeError -> except Exception）")
    return 0


if __name__ == "__main__":
    sys.exit(main())