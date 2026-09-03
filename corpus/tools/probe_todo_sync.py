"""API 探针：tiku 题完整闭环后，章节级掌握度(category=None)是否推进到掌握、learning-plan 是否出现 done_tasks。"""
import json, urllib.request, time

BASE = "http://127.0.0.1:8000"

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

def analysis_answer(qid):
    st, a = call("GET", f"/questions/{qid}/analysis")
    return a.get("answer")

# 1) demo + consent
st, ses = call("POST", "/sessions/demo", {"account": "probe_todo_%d" % int(time.time()*1000), "invite_code": "DEMO2026"})
uid = ses["user_id"]
print("user_id:", uid)
call("POST", f"/users/{uid}/consent", {"user_agreement": True, "privacy_policy": True, "data_collection": True})

# 2) 找 T01-001
st, qs = call("GET", "/questions?usage=diagnostic")
target = next((q for q in qs if q["code"] == "T01-001"), qs[0])
print("target:", target["code"], "domain:", target.get("domain_id"))
ans = analysis_answer(target["id"])
wrong = next(o["key"] for o in target["options"] if o["key"] != ans)
print("answer=", ans, "wrong=", wrong)

# 3) 答错
st, att = call("POST", "/attempts", {"user_id": uid, "question_id": target["id"], "selected_option": wrong, "rationale": "", "idempotency_key": "a"})
print("attempt:", st, {k: att.get(k) for k in ("session_id", "is_correct")})
sid = att["session_id"]

# 查看答错后掌握度
st, m1 = call("GET", f"/users/{uid}/mastery")
print("\n答错后 mastery:", json.dumps([{k: r[k] for k in ("domain_id", "category", "state", "reason")} for r in m1], ensure_ascii=False))
st, p1 = call("GET", f"/users/{uid}/learning-plan")
print("答错后 plan tasks:", len(p1.get("tasks", [])), "done:", len(p1.get("done_tasks", [])))

# 4) 训练
st, tr = call("GET", f"/training/{sid}")
print("\ntraining:", st, "mode=", tr.get("mode"), "questions=", len(tr.get("questions", [])))
tid = tr["training_id"]
# 确定性答对训练题
train_answers = {}
for q in tr.get("questions", []):
    train_answers[q["id"]] = analysis_answer(q["id"])
st, trs = call("POST", f"/training/{tid}/submit", {"answers": train_answers})
print("training submit:", st, trs)

st, m2 = call("GET", f"/users/{uid}/mastery")
print("训练后 mastery:", json.dumps([{k: r[k] for k in ("domain_id", "category", "state", "reason")} for r in m2], ensure_ascii=False))

# 5) 复测
st, rt = call("GET", f"/retest/{tid}")
print("\nretest:", st, "questions=", len(rt.get("questions", [])))
retest_answers = {}
for q in rt.get("questions", []):
    retest_answers[q["id"]] = analysis_answer(q["id"])
st, rts = call("POST", f"/retest/{tid}/submit", {"answers": retest_answers})
print("retest submit:", st, rts)

# 6) 检查闭环后状态
st, m3 = call("GET", f"/users/{uid}/mastery")
print("\n复测后 mastery:", json.dumps([{k: r[k] for k in ("domain_id", "category", "state", "reason")} for r in m3], ensure_ascii=False))
st, p3 = call("GET", f"/users/{uid}/learning-plan")
print("复测后 plan tasks:", len(p3.get("tasks", [])), "done:", len(p3.get("done_tasks", [])))
print("done_tasks:", json.dumps(p3.get("done_tasks", []), ensure_ascii=False))

# 断言
cat_none = next((r for r in m3 if r["domain_id"] == target["domain_id"] and r["category"] is None), None)
print("\n断言：章节级(category=None) 状态 =", cat_none["state"] if cat_none else "MISSING", "✅ 掌握" if cat_none and cat_none["state"] == "掌握" else "🔴 失败")
print("断言：plan done_tasks > 0 =", len(p3.get("done_tasks", [])) > 0)
