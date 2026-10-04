# -*- coding: utf-8 -*-
"""条件语义重排（实装版）效果验证（2026-10-04，可重跑）。

前置: 本地后端 :8001 已启动且 YAOZHI_RERANK_LLM_ENABLED=1（deepseek key 就绪）。

两轮画像 × 10 道种子标注题:
  Round A「强标注」: 选带干扰项标注的错项（gap=0.25 不触发）→ 期望零触发、
        零延迟、最终错因=静态标注（回归保护验证）。
  Round B「fallback」: 选无标注错项（全目录 0.3 乱序 → 必触发）→ 观测
        LLM 采纳率、最终错因 vs 静态乱序 Top1、诊断卡实际输出。
产物: backend/rerank_llm.jsonl（引擎采纳旁路追加）+ 控制台摘要
（含每次诊断卡的最终错因——产品真实输出）。
"""
import json
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8001"
DB = Path(__file__).resolve().parents[1] / "backend" / "yaozhi_w1.db"
LOG = DB.parent / "rerank_llm.jsonl"
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
    qs = db.execute("select id, code, options, answer, distractor_signals from questions "
                    "where code like 'Q-%' order by code").fetchall()
    mis = {r["code"]: dict(r) for r in db.execute(
        "select code, name, category from misconceptions").fetchall()}
    print(f"种子标注题 {len(qs)} 道")

    def register(tag):
        u = req("POST", "/sessions/demo", {"account": f"llmrk_{tag}_{int(time.time()) % 100000}",
                                           "invite_code": INVITE})
        uid = u.get("user_id") or u.get("id")
        req("POST", f"/users/{uid}/consent", {"user_agreement": True, "privacy_policy": True,
                                              "data_collection": True})
        return uid

    uid_a, uid_b = register("a"), register("b")
    log_before = LOG.read_text(encoding="utf-8").count("\n") if LOG.exists() else 0

    finals = []  # (round, qcode, card_mis_code)
    n_ok = 0
    t0 = time.time()
    for q in qs:
        opts = json.loads(q["options"])
        sig = json.loads(q["distractor_signals"] or "{}")
        answer = q["answer"]
        wrong = [o for o in opts if o["key"] != answer]
        ann = next((o for o in wrong if sig.get(o["key"], {}).get("misconception")), None)
        if ann:
            mcode = sig[ann["key"]]["misconception"]
            mname = mis.get(mcode, {}).get("name", mcode)
            r = req("POST", "/attempts", {
                "user_id": uid_a, "question_id": q["id"], "selected_option": ann["key"],
                "rationale": f"我当时把这道题理解成了「{mname}」的方向，选的时候觉得就该选这个。",
                "confidence": "中", "idempotency_key": f"llmA-{q['id']}-{int(time.time())}"})
            sid = r.get("session_id") or r.get("diagnosis_session_id")
            try:  # 种子域设计为先追问后归因：跳过追问让漏斗收敛到最终错因
                req("POST", f"/diagnoses/{sid}/skip-followup", {})
            except Exception:
                pass
            card = req("GET", f"/diagnoses/{sid}")
            finals.append(("A", q["code"], ((card.get("card") or {}).get("misconception") or {}).get("code")))
            n_ok += 1
        # Round B：优先选未标注错项（触发 fallback 乱序路径），否则选另一标注错项（理由冲突路径）
        ann_keys = {o["key"] for o in wrong if sig.get(o["key"], {}).get("misconception")}
        other = next((o for o in wrong if o["key"] not in ann_keys), None) or \
            next((o for o in wrong if o["key"] != (ann or {}).get("key")), None)
        if other:
            other_cat = [m for m in mis.values()
                         if m["category"] in ("知识遗忘", "概念混淆", "审题与应用失误")]
            pick = other_cat[hash(q["id"]) % len(other_cat)]
            r = req("POST", "/attempts", {
                "user_id": uid_b, "question_id": q["id"], "selected_option": other["key"],
                "rationale": f"其实我是把两个结论记混了，感觉更像是「{pick['name']}」这类问题，就随手选了。",
                "confidence": "低", "idempotency_key": f"llmB-{q['id']}-{int(time.time())}"})
            sid = r.get("session_id") or r.get("diagnosis_session_id")
            try:
                req("POST", f"/diagnoses/{sid}/skip-followup", {})
            except Exception:
                pass
            card = req("GET", f"/diagnoses/{sid}")
            finals.append(("B", q["code"], ((card.get("card") or {}).get("misconception") or {}).get("code")))
            n_ok += 1
        print(f"  {q['code']} done")

    for _ in range(30):
        time.sleep(2)
        n = LOG.read_text(encoding="utf-8").count("\n") if LOG.exists() else 0
        if n >= log_before + n_ok:
            break
    time.sleep(3)

    entries = [json.loads(l) for l in LOG.read_text(encoding="utf-8").splitlines()[log_before:] if l.strip()]
    trig = [e for e in entries if e["llm_responded"] or e.get("adopted")]
    wall = time.time() - t0
    print(f"\n===== 条件语义重排效果摘要（{len(entries)} 次诊断，共 {n_ok} 次作答，墙钟 {wall:.0f}s）=====")
    print(f"JSONL 触发留痕 {len(entries)} 条（Round A 强标注不应出现；出现的即异常）")
    responded = [e for e in entries if e["llm_responded"]]
    print(f"LLM 响应 {len(responded)}/{len(entries)}；"
          f"触发均延迟 {sum(e['latency_ms'] for e in responded) // max(len(responded), 1)}ms")
    adopted = [e for e in entries if e.get("adopted")]
    print(f"采纳翻转 {len(adopted)}/{len(responded)}")
    for e in entries:
        mark = "→ 采纳" if e.get("adopted") else "（保持）"
        print(f"  [{e['trigger']}] {e['question_code']} 规则#{e['rule_top1']} "
              f"LLM#{e['llm_pick']} {mark} gap={e['gap']} | {e['llm_rationale']}")
    print("\n--- 诊断卡最终错因（产品真实输出）---")
    for rnd, qc, mc in finals:
        print(f"  Round {rnd} {qc} -> {mc}")


if __name__ == "__main__":
    sys.exit(main())
