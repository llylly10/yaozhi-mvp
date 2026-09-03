# -*- coding: utf-8 -*-
"""药知 MVP 演示全链路冒烟（9/5 演示保命用）

用途：在演示前 5 分钟跑一遍，确认 18 步链路每一步都按预期返回。
      任何一步失败 → 打印实际响应并退出码 1，禁止带病上台。

用法：
    1) 先启动后端  http://127.0.0.1:8000/healthz 返回 {"ok":true}
    2) python scripts/smoke_demo.py            # 默认 127.0.0.1:8000
       python scripts/smoke_demo.py --base http://127.0.0.1:8000 --no-reset

说明：脚本只读 SQLite 题库（取正确答案），用于构造"确定性的演示路径"
      （摸底答错 2 题 → 练习答错种子标注题 → 出诊断卡 → 训练 → 复测通过），不写业务库。
      2026-09-03 题库桥接后：练习主链路挑 Q- 标注题（答错进错因诊断）；
      另新增 T 题库原题"解析反馈"步（无错因标注 → 不建会话不硬归因，诚实口径）。
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "backend" / "yaozhi_w1.db"
INVITE = "DEMO2026"

PASS, FAIL = 0, 0


def req(method: str, url: str, body: dict | None = None, expect: int | tuple = (200, 201, 202)):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:  # 网络/超时
        return 0, {"error": str(e)}


def check(step: str, name: str, ok: bool, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✅ {step:>2} {name}" + (f"  {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  🔴 {step:>2} {name}  {detail}")
    return ok


def answers_from_db(qids: list[str]) -> tuple[dict, dict]:
    """返回 (正确选项映射, 错误选项映射)。"""
    con = sqlite3.connect(DB)
    cur = con.cursor()
    right, wrong = {}, {}
    for qid in qids:
        cur.execute("select options, answer from questions where id=?", (qid,))
        row = cur.fetchone()
        if not row:
            continue
        opts = json.loads(row[0])
        keys = [o["key"] for o in opts] if isinstance(opts, list) and opts and isinstance(opts[0], dict) else list(opts)
        ans = row[1]
        right[qid] = ans
        wrong[qid] = next((k for k in keys if k != ans), keys[0])
    con.close()
    return right, wrong


def main() -> int:
    global PASS, FAIL
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8000")
    ap.add_argument("--no-reset", action="store_true", help="跳过数据复位（演示中途复跑用）")
    args = ap.parse_args()
    B = args.base.rstrip("/")

    print(f"\n药知 MVP 演示冒烟  base={B}  {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("-" * 68)

    # 0 健康
    st, h = req("GET", f"{B}/healthz")
    if not check(0, "后端健康", st == 200 and h.get("ok"), str(h)):
        return 1

    # 1 复位
    if args.no_reset:
        print("  ⏭   1 数据复位（--no-reset 跳过）")
    else:
        st, r = req("POST", f"{B}/admin/reset-demo")
        check(1, "数据复位", st == 200 and r.get("ok"), str(r)[:120])

    # 2 注册
    st, r = req("POST", f"{B}/sessions/demo", {"account": "smoke_tester", "invite_code": INVITE})
    if not check(2, "演示注册", st == 200 and r.get("user_id"), str(r)[:120]):
        return 1
    uid = r["user_id"]

    # 3 三同意书
    st, r = req("POST", f"{B}/users/{uid}/consent",
                {"user_agreement": True, "privacy_policy": True, "data_collection": True})
    if not check(3, "三份同意书", st == 200 and r.get("consented"), str(r)[:120]):
        return 1

    # 4 摸底卷
    st, r = req("GET", f"{B}/users/{uid}/assessment")
    qs = r.get("questions", [])
    if not check(4, "摸底卷发放", st == 200 and len(qs) >= 5, f"{len(qs)} 题"):
        return 1
    qids = [q["id"] for q in qs]
    right, wrong = answers_from_db(qids)

    # 5 摸底作答：前 3 对、后 2 错 → 制造薄弱项
    ans = {}
    for i, qid in enumerate(qids):
        ans[qid] = right[qid] if i < 3 else wrong[qid]
    st, r = req("POST", f"{B}/users/{uid}/assessment/submit", {"answers": ans})
    ok5 = st == 200 and len(r.get("weak", [])) >= 1
    check(5, "摸底判分+薄弱项", ok5,
          f"答对 {r.get('domains', [{}])[0].get('correct', '?')}/{r.get('total', '?')}，薄弱 {len(r.get('weak', []))} 题")

    # 6 画像热力图
    st, r = req("GET", f"{B}/users/{uid}/profile-summary")
    check(6, "画像热力图", st == 200 and len(r.get("heatmap", [])) >= 1,
          f"{len(r.get('heatmap', []))} 个格子")

    # 7 学习路径
    st, r = req("GET", f"{B}/users/{uid}/learning-plan")
    check(7, "学习路径推荐", st == 200, str(r)[:100])

    # 8 练习：挑一道摸底没答过的【种子标注题】(Q-，答错可走完整错因诊断主链路)
    st, r = req("GET", f"{B}/questions?usage=diagnostic")
    qlist = r if isinstance(r, list) else r.get("questions", [])
    marked = [q for q in qlist if q["code"].startswith("Q-") and q["id"] not in set(qids)]
    if not check(8, "练习题库(标注题)", st == 200 and marked, f"{len(marked)} 道标注题可用"):
        return 1
    tq = marked[0]["id"]
    _, wmap = answers_from_db([tq])

    st, r = req("POST", f"{B}/attempts", {
        "user_id": uid, "question_id": tq, "selected_option": wmap[tq],
        "rationale": "演示：故意选错，用于触发错因诊断",
        "confidence": "中",
        "idempotency_key": f"smoke-{int(time.time())}",
    })
    sid = r.get("session_id") or r.get("diagnosis_session_id")
    if not check(9, "提交作答→诊断会话", bool(sid), str(r)[:160]):
        return 1

    # 10 题库原题（T-，无错因标注）→ 解析型反馈：不建会话不硬归因（诚实口径红线）
    tiku_pool = [q for q in qlist if q["code"].startswith("T")]
    tb = tiku_pool[0]["id"] if tiku_pool else None
    if tb:
        _, twmap = answers_from_db([tb])
        st, r = req("POST", f"{B}/attempts", {
            "user_id": uid, "question_id": tb, "selected_option": twmap[tb],
            "idempotency_key": f"smoke-tiku-{int(time.time())}"})
        fb = r.get("feedback") or {}
        ok10 = st == 202 and r.get("session_id") is None \
            and r.get("state") == "answered" and fb.get("kind") == "tiku"
        check(10, "题库原题→解析反馈", ok10,
              f"无诊断会话，解析 {len(fb.get('analysis') or '')} 字 / 来源 {fb.get('source', '?')[:40]}")
    else:
        print("  ⏭  10 题库原题→解析反馈（无 T 题库题，跳过）")
        PASS += 1

    # 11 诊断卡
    st, r = req("GET", f"{B}/diagnoses/{sid}")
    card = r.get("card")
    ok11 = st == 200 and r.get("state") == "diagnosed" and card
    check(11, "错因诊断卡", ok11,
          f"{card.get('misconception', {}).get('name', '?')} "
          f"/ 证据 {len(card.get('evidences', []))} 条 / 等级 {card.get('evidence_level')}"
          if card else str(r)[:160])
    if not ok11:
        return 1

    # 12 靶向训练
    st, r = req("GET", f"{B}/training/{sid}")
    tid, mode = r.get("training_id"), r.get("mode")
    if not check(12, "靶向训练载荷", bool(tid), f"形态={mode}，题目 {len(r.get('questions', []))} 道"):
        return 1

    # 13 训练提交（记忆卡形态不答题，空提交=自评完成）
    tqids = [q["id"] for q in r.get("questions", [])]
    tright, _ = answers_from_db(tqids)
    st, r = req("POST", f"{B}/training/{tid}/submit", {"answers": tright})
    check(13, "训练提交判分", st == 200 and r.get("state") in ("retesting", "diagnosed"),
          f"得分 {r.get('score')}，状态={r.get('state')}（≥0.6 才进复测）")

    # 14 迁移复测
    st, r = req("GET", f"{B}/retest/{tid}")
    rq = r.get("questions", [])
    if not check(14, "迁移复测发题", st == 200 and rq, f"{len(rq)} 题"):
        return 1
    rright, _ = answers_from_db([q["id"] for q in rq])

    # 15 复测提交（答对 → 标记掌握）
    st, r = req("POST", f"{B}/retest/{tid}/submit", {"answers": rright})
    check(15, "复测判分→掌握度", st == 200 and r.get("passed") is True,
          f"正确 {r.get('correct')}/{r.get('total')}，通过={r.get('passed')}")

    # 16 掌握度总览
    st, r = req("GET", f"{B}/users/{uid}/mastery")
    items = r if isinstance(r, list) else r.get("mastery", r.get("items", []))
    check(16, "掌握度总览", st == 200 and len(items) >= 1, f"{len(items)} 条状态")

    # 17 合规闭环：撤回同意 + 删除回执
    st, r = req("POST", f"{B}/users/{uid}/consent/withdraw", {"confirm": True})
    ok17a = st == 200
    st2, r2 = req("GET", f"{B}/users/{uid}/deletion-receipt")
    check(17, "撤回同意+删除回执", ok17a and st2 == 200 and bool(r2.get("receipt")),
          f"回执号 {r2.get('receipt')}，{r.get('physical_delete_after_days', '?')} 天内物理删除")

    print("-" * 68)
    print(f"结果：{PASS} 通过 / {FAIL} 失败")
    if FAIL:
        print("🔴 存在失败步骤，请勿直接上台；先复位数据再重跑一次定位。")
    else:
        print("✅ 全链路可用，可以上台。")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
