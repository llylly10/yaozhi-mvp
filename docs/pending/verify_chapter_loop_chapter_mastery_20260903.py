"""真实环境验证：章级薄弱练习闭环（2026-09-03 补口）。
摸底答错 1 道题库题 → 章级薄弱 → 日常练习答对推进 薄弱→学习中→初步掌握。
"""
import json
import sqlite3
import urllib.request

BASE = "http://localhost:8000"
DB = "yaozhi_w1.db"  # 相对 backend cwd


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=data) as r:
        return json.loads(r.read().decode())


def answer_of(qid):
    con = sqlite3.connect(DB)
    try:
        return con.execute("SELECT answer FROM questions WHERE id=?", (qid,)).fetchone()[0]
    finally:
        con.close()


print("== reset-demo ==")
print(call("POST", "/admin/reset-demo")["ok"] if call("POST", "/admin/reset-demo").get("ok") else call("POST", "/admin/reset-demo"))

uid = call("POST", "/sessions/demo", {"account": "chp_loop_demo", "invite_code": "DEMO2026"})["user_id"]
call("POST", f"/users/{uid}/consent", {"user_agreement": True, "privacy_policy": True, "data_collection": True})
print("user:", uid)

v = call("GET", f"/users/{uid}/assessment")["questions"]
t_qs = [q for q in v if q["code"].startswith("T")]
wrong_t = t_qs[0]
answers = {}
for q in v:
    ans = answer_of(q["id"])
    if q["id"] == wrong_t["id"]:
        answers[q["id"]] = next(o["key"] for o in q["options"] if o["key"] != ans)
    else:
        answers[q["id"]] = ans
r = call("POST", f"/users/{uid}/assessment/submit", {"answers": answers})
print(f"摸底: {len(v)} 题, 答错 T 题 {wrong_t['code']} (域 {wrong_t['domain_id']})")

def state_of():
    m = call("GET", f"/users/{uid}/mastery")
    return next(x["state"] for x in m if x["category"] is None and x["domain_id"] == wrong_t["domain_id"])

print("摸底后章级状态:", state_of())  # 期望 薄弱

def attempt(correct, tag):
    ans = answer_of(wrong_t["id"])
    picked = ans if correct else next(o["key"] for o in wrong_t["options"] if o["key"] != ans)
    b = call("POST", "/attempts", {"user_id": uid, "question_id": wrong_t["id"],
                                   "selected_option": picked, "idempotency_key": f"verify-{tag}"})
    assert b["session_id"] is None and b["feedback"]["kind"] == "tiku", b
    return b["is_correct"]

attempt(True, "p1");  print("练对1 → 章级:", state_of())   # 学习中
attempt(False, "f1"); print("练错1 → 章级:", state_of())   # 薄弱（回退）
attempt(True, "p2");  print("练对2 → 章级:", state_of())   # 学习中
attempt(True, "p3");  print("练对3 → 章级:", state_of())   # 初步掌握
plan = call("GET", f"/users/{uid}/learning-plan")["tasks"]
tt = [x for x in plan if x["domain_id"] == wrong_t["domain_id"]]
print("学习路径任务:", [(x["type"], x["state"]) for x in tt])
