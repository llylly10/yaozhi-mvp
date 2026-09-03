"""探针：复现 题库题 答错 -> 诊断 -> 追问 -> 提交 的每步状态"""
import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000"

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]

# 1) demo session
st, ses = call("POST", "/sessions/demo", {"account": "probe_%d" % __import__("time").time(), "invite_code": "DEMO2026"})
print("demo:", st, ses)
uid = ses["user_id"]

# 2) consent
st, c = call("POST", f"/users/{uid}/consent",
             {"user_agreement": True, "privacy_policy": True, "data_collection": True})
print("consent:", st)

# 3) 取题（diagnostic 用法）
st, qs = call("GET", "/questions?usage=diagnostic")
print("questions:", st, "count=", len(qs) if isinstance(qs, list) else qs)
# 找一个 M 受体药（tiku 物化域）的题，确保是题库题路径
target = None
for q in qs:
    if q.get("code", "").startswith("T01-"):
        target = q; break
if not target:
    target = qs[0]
print("TARGET:", target["code"], target.get("domain_id"), target.get("chapter_name"))

# 4) 答错：先取解析拿正确答案，选一个非正确的
st, an = call("GET", f"/questions/{target['id']}/analysis")
ans = an.get("answer")
print("analysis answer=", ans)
wrong = next(o["key"] for o in target["options"] if o["key"] != ans)
print("choosing wrong=", wrong)
st, att = call("POST", "/attempts", {
    "user_id": uid, "question_id": target["id"], "selected_option": wrong,
    "rationale": "探针测试", "idempotency_key": "probe-%d" % __import__("time").time_ns()})
print("attempt:", st, {k: att.get(k) for k in ("session_id", "is_correct")} if isinstance(att, dict) else att)
sid = att.get("session_id")
if not sid:
    print("没有 session_id（答对或异常）->", att); raise SystemExit

# 5) 诊断
st, dg = call("GET", f"/diagnoses/{sid}")
print("\n=== 初始诊断 ===")
print("state=", dg["state"], "can_refine=", dg["card"]["can_refine"] if dg.get("card") else None,
      "followup_count=", dg["followup_count"])
print("followup=", json.dumps(dg.get("followup"), ensure_ascii=False))
print("turns=", dg.get("turns"))

# 6) 若有追问，提交一次
fu = dg.get("followup")
if fu:
    print("\n=== 提交追问 ===")
    if fu.get("options"):
        opt = fu["options"][0]["key"]
        st, r = call("POST", f"/diagnoses/{sid}/followups", {"option_key": opt})
    else:
        st, r = call("POST", f"/diagnoses/{sid}/followups", {"text": "我不太确定"})
    print("followup submit resp:", st, r)
    # 7) 再次拉诊断
    st, dg2 = call("GET", f"/diagnoses/{sid}")
    print("\n=== 提交后诊断 ===")
    print("state=", dg2["state"], "can_refine=", dg2["card"]["can_refine"] if dg2.get("card") else None,
          "followup_count=", dg2["followup_count"])
    print("followup=", json.dumps(dg2.get("followup"), ensure_ascii=False))
    print("turns=", dg2.get("turns"))
else:
    print("初始诊断无 followup -> 追问功能对本题不可用")
