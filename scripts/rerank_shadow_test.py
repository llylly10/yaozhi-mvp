# -*- coding: utf-8 -*-
"""影子语义重排实验驱动（2026-10-04，一次性实验脚本，可重跑）。

前置:
  - 本地后端 :8001 已启动且 YAOZHI_RERANK_SHADOW=1（deepseek key 在用户级 env）
  - master 库 backend/yaozhi_w1.db（读种子题标注/正确答案/错因名）

设计（两轮画像 × 10 道种子域标注题，共 ~20 次完整漏斗诊断）:
  Round A「呼应静态标注」: 选带干扰项标注的错项，作管理由复述该标注错因
        → 静态排序应正确，LLM 预期同意（基线一致率）。
  Round B「作管理由指向他类」: 选无标注错项（静态排序退化为全目录 0.3 乱序），
        作管理由指向另一类别的错因 → 观测 LLM 翻转率与翻转方向。
产物: backend/rerank_shadow.jsonl（由引擎影子旁路追加）+ 本脚本的控制台摘要。
"""
import json
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8001"
DB = Path(__file__).resolve().parents[1] / "backend" / "yaozhi_w1.db"
LOG = DB.parent / "rerank_shadow.jsonl"
INVITE = "DEMO2026"


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    qs = db.execute("select id, code, stem, options, answer, distractor_signals from questions "
                    "where code like 'Q-%' order by code").fetchall()
    mis = {r["code"]: dict(r) for r in db.execute(
        "select code, name, category from misconceptions").fetchall()}
    print(f"种子标注题 {len(qs)} 道；错因目录 {len(mis)} 条")
    assert qs, "无种子题"

    def register(tag):
        u = req("POST", "/sessions/demo", {"account": f"shadow_{tag}_{int(time.time()) % 100000}",
                                           "invite_code": INVITE})
        uid = u["user_id"] if isinstance(u, dict) and u.get("user_id") else u.get("id")
        req("POST", f"/users/{uid}/consent", {"user_agreement": True, "privacy_policy": True,
                                              "data_collection": True})
        return uid

    uid_a, uid_b = register("a"), register("b")

    log_before = LOG.read_text(encoding="utf-8").count("\n") if LOG.exists() else 0
    n_ok = 0
    for q in qs:
        opts = json.loads(q["options"])
        sig = json.loads(q["distractor_signals"] or "{}")
        answer = q["answer"]
        wrong = [o for o in opts if o["key"] != answer]
        # Round A：带标注的干扰项（有 signal 的选项），理由呼应标注错因
        ann = next((o for o in wrong if sig.get(o["key"], {}).get("misconception")), None)
        if ann:
            mcode = sig[ann["key"]]["misconception"]
            mname = mis.get(mcode, {}).get("name", mcode)
            rat_a = f"我当时把这道题理解成了「{mname}」的方向，选的时候觉得就该选这个。"
            body_a = {"user_id": uid_a, "question_id": q["id"], "selected_option": ann["key"],
                      "rationale": rat_a, "confidence": "中",
                      "idempotency_key": f"shadowA-{q['id']}-{int(time.time())}"}
            req("POST", "/attempts", body_a)
            n_ok += 1
            time.sleep(0.3)
        # Round B：无标注错项（优先），理由指向另一类别的错因
        other = next((o for o in wrong if o["key"] != (ann or {}).get("key")), None)
        if other:
            other_cat = [m for m in mis.values()
                         if m["category"] in ("知识遗忘", "概念混淆", "审题与应用失误")]
            pick = other_cat[hash(q["id"]) % len(other_cat)]
            rat_b = f"其实我是把两个结论记混了，感觉更像是「{pick['name']}」这类问题，就随手选了。"
            body_b = {"user_id": uid_b, "question_id": q["id"], "selected_option": other["key"],
                      "rationale": rat_b, "confidence": "低",
                      "idempotency_key": f"shadowB-{q['id']}-{int(time.time())}"}
            req("POST", "/attempts", body_b)
            n_ok += 1
            time.sleep(0.3)
        print(f"  {q['code']} done")

    # 等最后一笔影子调用落盘
    for _ in range(30):
        time.sleep(2)
        n = LOG.read_text(encoding="utf-8").count("\n") if LOG.exists() else 0
        if n >= log_before + n_ok:
            break
    time.sleep(3)

    entries = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines()[log_before:] if l.strip()]
    print(f"\n===== 影子重排实验摘要（本轮 {len(entries)} 条）=====")
    responded = [e for e in entries if e["llm_responded"]]
    print(f"LLM 有效响应 {len(responded)}/{len(entries)}；"
          f"平均延迟 {sum(e['latency_ms'] for e in responded) // max(len(responded), 1)}ms")
    for tag, name in (("shadowA", "Round A 呼应标注"), ("shadowB", "Round B 指向他类")):
        sub = [e for e in entries if e["question_id"] and e["rationale"] and
               (tag == "shadowA") == ("理解成了" in e["rationale"])]
        agree = sum(1 for e in sub if e["agree"])
        print(f"\n[{name}] {len(sub)} 条，一致 {agree}（{agree * 100 // max(len(sub), 1)}%）")
        for e in sub:
            mark = "==" if e["agree"] else "!= 翻转"
            print(f"  {e['question_code']} {mark} 规则#{e['rule_order'][0] if e['rule_order'] else '?'} "
                  f"LLM#{e['llm_pick']} 置信{e['llm_confidence']} | {e['llm_rationale']}")
    flips = [e for e in entries if e["llm_responded"] and not e["agree"]]
    print(f"\n总翻转 {len(flips)}/{len(responded)}（{len(flips) * 100 // max(len(responded), 1)}%）"
          f"——翻转明细已列于上，人工判断谁更符合作管理由")


if __name__ == "__main__":
    sys.exit(main())
