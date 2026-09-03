"""题库→业务桥接回归（2026-09-03 方案 A：闭环消费 published 题库；P4 收口含 B1）。

红线：
1. 物化：published 题库题（A1 131 + B1 15 = 146）以 code=T{paper}-{qid} 物化为 Question 行
   （type=single / usage=diagnostic / published），绑定解析型证据；B1 配伍组摊平存储，
   物化与题库逐字一致（P4 实证隔离假设作废）。
2. 幂等：reset-demo / startup 重复 seed 不重复物化。
3. 诚实归因：物化题无错因标注 → 作答走解析型反馈（state=answered / 无 DiagnosisSession），
   绝不产出空错因卡；幂等重放同样补反馈。
4. 摸底混卷：真实题库(按章配额 3) + 种子诊断域(2) 混卷；同 user 同卷可回放；题带章信息。
5. 薄弱语义分层：题库题答错 → 章级薄弱（category=None，只发练习任务）；种子域题答错 → 错因薄弱。
6. 种子题来源锚点：10 题解析绑定教材第5章真实锚点（EV-PENDING-W3 占位作废）。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_tiku_bridge.db"
settings.seed_on_startup = True

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.models import (  # noqa: E402
    DiagnosisSession, Question, QuestionEvidence, TikuQuestion,
)
from app.main import app  # noqa: E402

client = TestClient(app)


def _rebuild():
    """模拟 reset-demo：drop_all→create_all→migrate→seed（含内容化恢复 + 题库桥接）。"""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    migrate()
    from seed.seed import seed as run_seed
    db = SessionLocal()
    try:
        run_seed(db)
        db.commit()
    finally:
        db.close()


def _fresh_user(account: str = "bridge_stu01") -> str:
    r = client.post("/sessions/demo", json={"account": account, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    assert client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True}).status_code == 200
    return uid


def _answer_of(question_id: str) -> str:
    db = SessionLocal()
    try:
        return db.get(Question, question_id).answer
    finally:
        db.close()


def _first_tiku_question() -> dict:
    qs = client.get("/questions?usage=diagnostic").json()
    return next(x for x in qs if x["code"].startswith("T"))


def test_bridge_materializes_all_published():
    """P4：published 全量物化（A1 131 + B1 15 = 146）；B1 摊平单选与业务同构。"""
    _rebuild()
    db = SessionLocal()
    try:
        exp_a1 = db.query(TikuQuestion).filter(
            TikuQuestion.review_status == "published",
            TikuQuestion.type == "A1").count()
        exp_b1 = db.query(TikuQuestion).filter(
            TikuQuestion.review_status == "published",
            TikuQuestion.type == "B1").count()
        assert exp_a1 >= 100 and exp_b1 >= 1, f"published 规模异常 A1={exp_a1}/B1={exp_b1}"
        t_rows = db.execute(select(Question).where(
            Question.code.like("T%"))).scalars().all()
        assert len(t_rows) == exp_a1 + exp_b1, \
            f"物化应 A1+B1={exp_a1}+{exp_b1}，实际 {len(t_rows)}"
        # 结构：单选/诊断池/已发布/域存在；每个 T 题恰好绑定一条解析证据
        ev_qids = {e.question_id for e in db.execute(select(QuestionEvidence).where(
            QuestionEvidence.support_type == "解析")).scalars()}
        for q in t_rows:
            assert q.type == "single" and q.usage == "diagnostic" \
                and q.review_status == "published", f"{q.code} 结构不符"
            assert q.domain_id, f"{q.code} 必须挂章级诊断域"
            assert q.id in ev_qids, f"{q.code} 缺解析证据（题目绑定证据，ADR-02）"
            assert q.stem and q.options and q.answer, f"{q.code} 题干/选项/答案不完整"
        # B1 配伍组摊平物化：同组题 options 与物化后逐字一致、answer 为单字母
        b1_rows = db.execute(select(TikuQuestion).where(
            TikuQuestion.review_status == "published",
            TikuQuestion.type == "B1")).scalars().all()
        for t in b1_rows:
            q = db.execute(select(Question).where(
                Question.code == f"T{t.paper_no}-{t.qid:03d}")).scalar_one_or_none()
            assert q and q.options == t.options and q.answer == t.answer, \
                f"B1 {t.paper_no}-{t.qid:03d} 摊平物化不一致"
        # 摸底 3 章配额前提：published A1 覆盖 ≥3 章
        ch_refs = {t.chapter_ref for t in db.query(TikuQuestion).filter(
            TikuQuestion.review_status == "published",
            TikuQuestion.type == "A1").all()}
        assert len(ch_refs) >= 3, f"A1 published 覆盖章数应 ≥3，实际 {len(ch_refs)}"
    finally:
        db.close()


def test_seed_questions_have_real_source_anchor():
    """种子 10 题解析来源锚点（原 EV-PENDING-W3 占位作废）：
    证据 chunk id 为教材锚点且非占位，与题库"题目绑定证据"口径一致。"""
    _rebuild()
    db = SessionLocal()
    try:
        qs = db.execute(select(Question).where(Question.code.like("Q-%"))).scalars().all()
        assert len(qs) >= 10, f"种子题应 10 道，实际 {len(qs)}"
        for q in qs:
            ev = db.execute(select(QuestionEvidence).where(
                QuestionEvidence.question_id == q.id,
                QuestionEvidence.support_type == "解析")).scalar_one_or_none()
            assert ev is not None and ev.content_text, f"{q.code} 解析文本缺失"
            assert ev.evidence_chunk_id != "EV-PENDING-W3", f"{q.code} 仍是 W3 占位"
            assert "第5章" in ev.evidence_chunk_id or "胆碱能" in ev.evidence_chunk_id, \
                f"{q.code} 锚点应指向教材第5章: {ev.evidence_chunk_id}"
    finally:
        db.close()


def test_bridge_idempotent_reseed():
    _rebuild()
    # 不重建表再次 seed（模拟 startup 幂等重放）→ 物化数量不涨
    from seed.seed import seed as run_seed
    from seed.seed_tiku_bridge import bridge_tiku_questions
    db = SessionLocal()
    try:
        run_seed(db)
        db.commit()
        n1 = db.query(Question).filter(Question.code.like("T%")).count()
        stat = bridge_tiku_questions(db)  # 手工再跑一遍桥接
        n2 = db.query(Question).filter(Question.code.like("T%")).count()
        assert n1 == n2, f"幂等重放后物化数不得增长: {n1} -> {n2}"
        assert stat["bridged"] == 0, "二次桥接不应新建任何题"
        assert set(stat["by_type"]) == {"A1", "B1"}, "统计应按题型拆分（P4 全量物化）"
    finally:
        db.close()


def test_tiku_attempt_returns_feedback_no_session():
    """题库题作答：答对/答错都给解析型反馈，不建 DiagnosisSession（诚实归因红线）。"""
    _rebuild()
    uid = _fresh_user()
    tq = _first_tiku_question()
    answer = _answer_of(tq["id"])
    wrong = next(o["key"] for o in tq["options"] if o["key"] != answer)
    # 答错：解析型反馈，不归因不建会话
    r = client.post("/attempts", json={
        "user_id": uid, "question_id": tq["id"], "selected_option": wrong,
        "idempotency_key": "bridge-wrong-1"})
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["state"] == "answered" and body["session_id"] is None
    assert body["is_correct"] is False
    assert body["feedback"]["kind"] == "tiku"
    assert body["feedback"]["analysis"], "物化题必须带解析文本"
    assert body["feedback"]["chapter_ref"].startswith("CH"), f"应带章锚点: {body['feedback']}"
    # 答对同样只给反馈，不进诊断
    r2 = client.post("/attempts", json={
        "user_id": uid, "question_id": tq["id"], "selected_option": answer,
        "idempotency_key": "bridge-right-1"})
    assert r2.status_code == 202 and r2.json()["is_correct"] is True
    assert r2.json()["session_id"] is None
    # 全程不得产生诊断会话（避免空错因卡）
    db = SessionLocal()
    try:
        assert db.execute(select(DiagnosisSession)).scalars().first() is None, \
            "题库题作答不得创建诊断会话"
    finally:
        db.close()


def test_tiku_idempotent_replay_refunds_feedback():
    _rebuild()
    uid = _fresh_user()
    tq = _first_tiku_question()
    answer = _answer_of(tq["id"])
    wrong = next(o["key"] for o in tq["options"] if o["key"] != answer)
    body = {"user_id": uid, "question_id": tq["id"], "selected_option": wrong,
            "idempotency_key": "bridge-replay-1"}
    r1 = client.post("/attempts", json=body).json()
    r2 = client.post("/attempts", json=body).json()
    assert r2["idempotent_replay"] is True
    assert r2["session_id"] is None
    assert r2["feedback"]["kind"] == "tiku", "题库题幂等重放必须同样补反馈"
    assert r1["feedback"]["analysis"] == r2["feedback"]["analysis"]


def test_assessment_mixes_tiku_and_seed_replayable():
    _rebuild()
    uid = _fresh_user()
    v1 = client.get(f"/users/{uid}/assessment").json()["questions"]
    v2 = client.get(f"/users/{uid}/assessment").json()["questions"]
    assert [q["id"] for q in v1] == [q["id"] for q in v2], "同 user 摸底卷可回放"
    n_t = sum(1 for q in v1 if q["code"].startswith("T"))
    n_s = sum(1 for q in v1 if q["code"].startswith("Q-"))
    assert n_t == 3 and n_s == 2 and len(v1) == 5, \
        f"摸底卷应为 3 题库 + 2 种子 = 5 题，实际 T{n_t}/Q{n_s}/共{len(v1)}"
    t = next(q for q in v1 if q["code"].startswith("T"))
    assert t["chapter"] and t["chapter_name"], "题库题应带章级信息（前端题头/画像用）"
    assert all("stem" in q and q["options"] for q in v1)


def test_wrong_tiku_marks_chapter_level_weak():
    """摸底答错分层：T 题 → 章级薄弱(category=None)；Q 题 → 错因薄弱。学习路径按层发任务。"""
    _rebuild()
    uid = _fresh_user()
    v = client.get(f"/users/{uid}/assessment").json()["questions"]
    wrong = {q["id"]: next(o["key"] for o in q["options"]
                           if o["key"] != _answer_of(q["id"])) for q in v}
    assert client.post(f"/users/{uid}/assessment/submit",
                       json={"answers": wrong}).status_code == 200
    m = client.get(f"/users/{uid}/mastery").json()
    t_row = next(x for x in m if x["category"] is None and x["state"] == "薄弱")
    assert t_row["domain_id"], "题库题答错应产生章级薄弱（category=None）"
    # 章级薄弱的学习路径：只发练习任务，不发空材料任务
    plan = client.get(f"/users/{uid}/learning-plan").json()["tasks"]
    t_tasks = [x for x in plan if x["domain_id"] == t_row["domain_id"]]
    assert t_tasks and all(x["type"] == "practice" for x in t_tasks), \
        f"章级薄弱只发练习任务，实际 {t_tasks}"
    # 种子域题（摸底卷必含 2 道 Q-，此处全答错）→ 错因薄弱：material + practice 双任务
    q_rows = [x for x in m if x["category"] and x["state"] == "薄弱"]
    assert q_rows, "种子域题答错应产生错因级薄弱"
    q_tasks = [x for x in plan if x["domain_id"] == q_rows[0]["domain_id"]
               and x["category"] == q_rows[0]["category"]]
    types = {x["type"] for x in q_tasks}
    assert types == {"material", "practice"}, f"错因薄弱应发 学+练 任务对，实际 {types}"


def test_chapter_weak_practice_loop_closes():
    """章级薄弱闭环（2026-09-03 引擎补口）：摸底错题库题建章级薄弱后，
    今日待办「练习」不再无出口卡死——
      答对推进：薄弱→学习中→初步掌握；答错回退：学习中→薄弱；
      未评估（未摸底直接练）答对→学习中、答错→薄弱；
      已初步掌握以上不因练习继续推进、不因单次答错降级。
    学习路径任务 state 徽标随之更新（薄弱红 / 学习中金 / 初步掌握绿）。
    """
    _rebuild()
    uid = _fresh_user("bridge_loop01")
    v = client.get(f"/users/{uid}/assessment").json()["questions"]
    t_qs = [q for q in v if q["code"].startswith("T")]
    assert len(t_qs) == 3
    wrong_t = t_qs[0]
    # 只答错 1 道题库题，其余全对 → 仅 1 个章级薄弱行，断言干净
    answers = {}
    for q in v:
        ans = _answer_of(q["id"])
        if q["id"] == wrong_t["id"]:
            answers[q["id"]] = next(o["key"] for o in q["options"] if o["key"] != ans)
        else:
            answers[q["id"]] = ans
    assert client.post(f"/users/{uid}/assessment/submit",
                       json={"answers": answers}).status_code == 200
    dom = wrong_t["domain_id"]

    def state_of():
        m = client.get(f"/users/{uid}/mastery").json()
        return next(x["state"] for x in m if x["category"] is None and x["domain_id"] == dom)

    def attempt(want_correct: bool, tag: str) -> None:
        ans = _answer_of(wrong_t["id"])
        picked = ans if want_correct else next(
            o["key"] for o in wrong_t["options"] if o["key"] != ans)
        r = client.post("/attempts", json={"user_id": uid, "question_id": wrong_t["id"],
                        "selected_option": picked, "idempotency_key": f"chp-loop-{tag}"})
        assert r.status_code == 202, r.text
        body = r.json()
        assert body["session_id"] is None and body["feedback"]["kind"] == "tiku", \
            "题库题日常练习仍走解析反馈（无诊断会话）"

    assert state_of() == "薄弱", "摸底答错题库题应先建章级薄弱"
    plan = client.get(f"/users/{uid}/learning-plan").json()["tasks"]
    assert any(x["domain_id"] == dom and x["type"] == "practice" for x in plan), \
        "章级薄弱应在今日待办有练习任务"
    attempt(True, "p1")     # 薄弱 → 学习中
    assert state_of() == "学习中"
    attempt(False, "f1")    # 学习中 → 薄弱（回退）
    assert state_of() == "薄弱"
    attempt(True, "p2")     # 薄弱 → 学习中
    assert state_of() == "学习中"
    attempt(True, "p3")     # 学习中 → 初步掌握
    assert state_of() == "初步掌握"
    attempt(False, "f2")    # 初步掌握不因单次答错降级（保守）
    assert state_of() == "初步掌握"
    plan2 = client.get(f"/users/{uid}/learning-plan").json()["tasks"]
    t_tasks = [x for x in plan2 if x["domain_id"] == dom]
    assert t_tasks and all(x["state"] == "初步掌握" for x in t_tasks), \
        f"学习路径任务 state 应随推进更新为初步掌握，实际 {t_tasks}"

