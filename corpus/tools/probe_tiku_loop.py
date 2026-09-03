# -*- coding: utf-8 -*-
"""只读探针：题库题（T-）答错后到底发生了什么（2026-09-03）。

走真实 HTTP 链路，不改数据逻辑。用于确认「期末练题完整闭环」在 723 道
题库题上是否成立：练错 → 错因诊断 → 靶向训练 → 复测。

运行: cd yaozhi-mvp && python corpus/tools/probe_tiku_loop.py
"""
import json
import os
import urllib.request

BASE = "http://127.0.0.1:8000"
os.environ["no_proxy"] = "127.0.0.1,localhost"
os.environ["NO_PROXY"] = "127.0.0.1,localhost"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, {"error": e.read().decode()[:300]}


def main():
    print("=" * 70)
    print("探针：题库题（T-）答错后的闭环链路")
    print("=" * 70)

    _, _ = req("POST", "/admin/reset-demo")
    _, u = req("POST", "/sessions/demo",
               {"account": "probe_tiku", "invite_code": "DEMO2026"})
    uid = u["user_id"]
    req("POST", f"/users/{uid}/consent", {"purge_previous": False})
    print(f"用户: {uid}\n")

    # 取一道非种子域的题库物化题（T- 前缀）
    _, doms = req("GET", "/domains")
    seed_dom = None
    for d in doms:
        if "M 受体" in (d.get("name") or ""):
            seed_dom = d["id"]
    _, qs = req("GET", "/questions?usage=diagnostic")
    tikus = [q for q in qs if q["code"].startswith("T")
             and (not seed_dom or q["domain_id"] != seed_dom)]
    print(f"题库物化题（非种子域）: {len(tikus)} 道")

    q = tikus[0]
    wrong = next(o["key"] for o in q["options"] if o["key"] != _answer(q))
    print(f"\n选一道: {q['code']}  {q['stem'][:50]}")
    print(f"故意错选: {wrong}\n")

    st, r = req("POST", "/attempts", {
        "user_id": uid, "question_id": q["id"], "selected_option": wrong,
        "idempotency_key": "probe-tiku-001"})
    print(f"[1] 提交作答 HTTP {st}")
    print(f"    session_id = {r.get('session_id')}")
    print(f"    state      = {r.get('state')}")
    print(f"    is_correct = {r.get('is_correct')}")
    print(f"    feedback   = {str(r.get('feedback'))[:60]}")

    sid = r.get("session_id")
    if not sid:
        print("\n🔴 结论: 题库题答错 **不创建诊断会话** → 无错因诊断、无靶向训练、无复测。")
        print("   期末练题场景下，723 题只能『练 + 看解析』，核心差异化闭环不成立。")
        return

    st2, d = req("GET", f"/diagnoses/{sid}")
    print(f"\n[2] 诊断卡 HTTP {st2}")
    print(f"    hypothesis = {d.get('hypothesis')}")
    print(f"    evidence_level = {d.get('evidence_level')}")


def _answer(q):
    # /questions 不返回 answer，用本地只读库查
    import sqlite3
    from pathlib import Path
    db = Path(__file__).resolve().parents[2] / "backend" / "yaozhi_w1.db"
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    row = con.execute("SELECT answer FROM questions WHERE id=?", (q["id"],)).fetchone()
    return row[0] if row else "A"


if __name__ == "__main__":
    main()
