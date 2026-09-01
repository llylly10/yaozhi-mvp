"""Demo 规模评测：错因诊断引擎在种子题库上的表现（9/5 演示证据）。

方法：遍历全部 published 题 × 每个标注了错因的错误选项，走真实闭环
（注册 → 同意 → 作答 → 直接出卡），预测错因与题目标注比对。
输出：逐类 Recall / Precision / Macro-F1 / 混淆矩阵 / 证据等级分布 / 反例清单。

用法：cd backend && python eval_demo.py
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./eval_demo.db"
settings.seed_on_startup = True

from app.main import app  # noqa: E402
from app.db import Base, SessionLocal, engine  # noqa: E402

Base.metadata.create_all(engine)
from seed.seed import seed  # noqa: E402

_s = SessionLocal()
try:
    seed(_s)
finally:
    _s.close()

from sqlalchemy import select  # noqa: E402

from app.models import Misconception, Question  # noqa: E402

client = TestClient(app)

MIS_CAT = {m.code: m.category for m in
           SessionLocal().execute(select(Misconception)).scalars()}


def run_case(uid: str, qid: str, option: str, key: str) -> dict:
    r = client.post("/attempts", json={"user_id": uid, "question_id": qid,
                                       "selected_option": option,
                                       "idempotency_key": key})
    assert r.status_code == 202, r.text
    sid = r.json()["session_id"]
    return client.get(f"/diagnoses/{sid}").json()


def main():
    # 收集案例：每题 × 每个标注了错因的错误选项
    cases = []       # (q_code, option, exp_code, exp_cat, pred_code, pred_cat, level, can_refine)
    undecided = []   # 未出卡
    n_signal = n_no_signal = 0
    db = SessionLocal()
    try:
        qs = db.execute(select(Question).where(
            Question.review_status == "published")).scalars().all()
        for q in qs:
            sig = q.distractor_signals or {}
            for opt, info in sig.items():
                if opt == q.answer:      # 正确答案不入错因案例
                    continue
                mis_code = (info or {}).get("misconception")
                if not mis_code:
                    n_no_signal += 1
                    continue
                n_signal += 1
                uid = client.post("/sessions/demo", json={
                    "account": f"ev-{uuid.uuid4().hex[:8]}",
                    "invite_code": "DEMO2026"}).json()["user_id"]
                client.post(f"/users/{uid}/consent", json={
                    "user_agreement": True, "privacy_policy": True,
                    "data_collection": True})
                card = run_case(uid, q.id, opt, f"evk-{uuid.uuid4().hex[:8]}")
                if card.get("misconception"):
                    cases.append((q.code, opt, mis_code, MIS_CAT.get(mis_code),
                                  card["misconception"]["code"],
                                  card["misconception"]["category"],
                                  card.get("evidence_level"), card.get("can_refine")))
                else:
                    undecided.append((q.code, opt, mis_code))
    finally:
        db.close()

    # ---- 指标 ----
    cats = sorted({c[3] for c in cases} | {c[5] for c in cases})
    rows = []
    for cat in cats:
        exp_n = sum(1 for c in cases if c[3] == cat)   # 该类应召回数
        pred_n = sum(1 for c in cases if c[5] == cat)  # 该类被预测数
        tp = sum(1 for c in cases if c[3] == cat and c[5] == cat)
        rec = tp / exp_n if exp_n else 0.0
        pre = tp / pred_n if pred_n else 0.0
        f1 = 2 * pre * rec / (pre + rec) if (pre + rec) else 0.0
        rows.append((cat, exp_n, pred_n, tp, rec, pre, f1))

    acc = sum(1 for c in cases if c[3] == c[5]) / len(cases) if cases else 0.0
    macro_f1 = sum(r[6] for r in rows) / len(rows) if rows else 0.0

    # 证据等级分布
    levels = {}
    for c in cases:
        levels[c[6]] = levels.get(c[6], 0) + 1
    can_refine = sum(1 for c in cases if c[7])

    # 反例（预测类别 ≠ 期望类别）
    mism = [c for c in cases if c[3] != c[5]]

    # ---- 输出 Markdown 报告 ----
    out = []
    out.append("# 药知 MVP · 错因诊断 Demo 规模评测报告")
    out.append("")
    out.append(f"- 评测日期：2026-09-01")
    out.append(f"- 评测对象：种子题库 published 题 × 标注错因的错误选项（真实 HTTP 闭环，非模拟）")
    out.append(f"- 案例规模：{len(cases)} 个错因案例（标注信号 {n_signal}；无错因标注的错误选项 {n_no_signal} 不计入；未出卡 {len(undecided)}）")
    out.append(f"- 评估口径：预测错因类别 == 题目标注错因类别 计为命中")
    out.append("")
    out.append("## 一、总体")
    out.append("")
    out.append(f"| 指标 | 值 |")
    out.append(f"|---|---|")
    out.append(f"| 案例数 | {len(cases)} |")
    out.append(f"| 类别级准确率（Acc） | {acc:.3f} |")
    out.append(f"| Macro-F1 | {macro_f1:.3f} |")
    out.append(f"| 中证据直出卡占比 | {levels.get('中',0)}/{len(cases)}（{levels.get('中',0)/len(cases)*100:.1f}%） |")
    out.append(f"| 低证据 + 可细化（can_refine） | {can_refine}/{len(cases)} |")
    out.append("")
    out.append("> 注：v1.1 评测协议门槛为保护测试集（≥80 案例 / 4 类各 ≥20、Recall≥0.60、Macro-F1≥0.65），本报告为种子 Demo 规模（10 题池），仅作演示证据，不替代保护测试集。")
    out.append("")
    out.append("## 二、逐类 Recall / Precision / F1")
    out.append("")
    out.append("| 错因类别 | 期望案例 | 预测案例 | TP | Recall | Precision | F1 |")
    out.append("|---|---|---|---|---|---|---|")
    for cat, exp_n, pred_n, tp, rec, pre, f1 in rows:
        out.append(f"| {cat} | {exp_n} | {pred_n} | {tp} | {rec:.3f} | {pre:.3f} | {f1:.3f} |")
    out.append("")
    out.append("## 三、混淆矩阵（期望 × 预测，行=期望）")
    out.append("")
    out.append("| 期望\\预测 | " + " | ".join(cats) + " |")
    out.append("|---|" + "---|" * len(cats))
    for ecat in cats:
        cell = [ecat]
        for pcat in cats:
            cell.append(str(sum(1 for c in cases if c[3] == ecat and c[5] == pcat)))
        out.append("| " + " | ".join(cell) + " |")
    out.append("")
    out.append("## 四、反例清单（预测 ≠ 期望）")
    out.append("")
    if mism:
        out.append("| 题目 | 选项 | 期望错因 | 期望类别 | 预测错因 | 预测类别 | 证据 |")
        out.append("|---|---|---|---|---|---|---|")
        for q_code, opt, exp_code, exp_cat, pred_code, pred_cat, level, cr in mism:
            out.append(f"| {q_code} | {opt} | {exp_code} | {exp_cat} | {pred_code} | {pred_cat} | {level} |")
    else:
        out.append("无。")
    out.append("")
    out.append("## 五、未出卡案例")
    out.append("")
    if undecided:
        for q_code, opt, mis in undecided:
            out.append(f"- {q_code} 选 {opt}（期望 {mis}）未产出诊断卡")
    else:
        out.append("无（全部案例均直接出卡）。")
    out.append("")

    report = "\n".join(out)
    root = Path(__file__).resolve().parents[1]
    dest = root / "评测报告-demo规模-2026-09-01.md"
    dest.write_text(report, encoding="utf-8")

    print(f"案例 {len(cases)} · Acc {acc:.3f} · Macro-F1 {macro_f1:.3f} · 中证据 {levels.get('中',0)} · 反例 {len(mism)}")
    print(f"报告已写入: {dest}")
    for cat, exp_n, pred_n, tp, rec, pre, f1 in rows:
        print(f"  {cat:<8} exp={exp_n:>2} pred={pred_n:>2} tp={tp:>2} R={rec:.3f} P={pre:.3f} F1={f1:.3f}")


if __name__ == "__main__":
    main()
