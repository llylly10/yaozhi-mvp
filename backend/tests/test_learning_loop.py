"""今日待办完成口径与随堂自测回归（2026-09-08，用户反馈修复）。

修复点：
1. 章级题库行（category=None）无复测资产，「初步掌握」即达标出列（done_tasks），
   不再无限滞留待办（原 bug：题库题做完永不消失/不打勾）。
2. 种子域错因行须到「掌握」才出列（有训练→复测链路）。
3. 学习随堂自测：GET quiz（本域未答过的 training/retest 优先），通过(≥60%)
   触发 material_passed 把该域所有「薄弱」行推至「学习中」；种子域错因今日待办里
   「学习材料」任务随之消失（仅剩练习），章级行保留 学+练 配对直到达标出列；
   未通过则保持薄弱。
4. 一学一练配对（2026-09-10）：章级行（category=None）在薄弱/学习中发
   学习任务 + 练习任务，不再是光杆练习；章节随堂自测（study-map 口径）通过
   同样把章级行 薄弱→学习中。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_learning_loop.db"
settings.seed_on_startup = True

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.models import DiagnosticDomain, MasteryState, Question  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


def _rebuild():
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


def _fresh_user(account: str = "loop_stu01") -> str:
    r = client.post("/sessions/demo", json={"account": account, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    assert client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True}).status_code == 200
    return uid


def _seed_domain_id() -> str:
    db = SessionLocal()
    try:
        return db.execute(select(DiagnosticDomain).where(
            DiagnosticDomain.code == "DOM-PHARMO-ANS")).scalar_one().id
    finally:
        db.close()


def _insert_mastery(user: str, domain_id: str, category: str | None, state: str):
    db = SessionLocal()
    try:
        db.add(MasteryState(user_id=user, domain_id=domain_id, category=category, state=state))
        db.commit()
    finally:
        db.close()


def _answer_of(qid: str) -> str:
    db = SessionLocal()
    try:
        return db.get(Question, qid).answer
    finally:
        db.close()


def _wrong_option(qid: str) -> str:
    db = SessionLocal()
    try:
        q = db.get(Question, qid)
        return next(o["key"] for o in q.options if o["key"] != q.answer)
    finally:
        db.close()


def _quiz_qids(uid: str, domain_id: str) -> list[str]:
    r = client.get(f"/users/{uid}/learning-plan/{domain_id}/quiz")
    assert r.status_code == 200, r.text
    return [q["id"] for q in r.json()["questions"]]


def test_chapter_initial_mastery_exits_to_done():
    """章级题库题：薄弱→学习中→初步掌握后任务出列到已完成（不再滞留）。"""
    _rebuild()
    uid = _fresh_user()
    domain_id = _seed_domain_id()
    _insert_mastery(uid, domain_id, None, "薄弱")  # 章级薄弱（category=None）
    plan = client.get(f"/users/{uid}/learning-plan").json()
    # 章级薄弱：一学一练配对（学习=本章大纲知识点+随堂自测，练习=本章题目）
    tasks = [t for t in plan["tasks"] if t["domain_id"] == domain_id]
    assert {t["type"] for t in tasks} == {"material", "practice"}, f"章级薄弱应发 学+练 任务对 {tasks}"
    assert all(t.get("guide") for t in tasks), "每个任务都应有下一步引导"
    # 章级题库推进到「初步掌握」后应出列（无复测资产，初步掌握=可达到的最强达标态）
    # 注意：category=NULL 行 ORM UPDATE 会炸（NULL 主键），须原生 UPDATE（同 mastery._apply）
    from sqlalchemy import update as _upd
    db = SessionLocal()
    try:
        db.execute(_upd(MasteryState).where(
            MasteryState.user_id == uid, MasteryState.domain_id == domain_id,
            MasteryState.category.is_(None)).values(state="初步掌握"))
        db.commit()
    finally:
        db.close()
    plan2 = client.get(f"/users/{uid}/learning-plan").json()
    assert not [t for t in plan2["tasks"] if t["domain_id"] == domain_id], \
        "章级初步掌握应移出待办"
    done = [t for t in plan2["done_tasks"] if t["domain_id"] == domain_id]
    assert done and done[0]["state"] == "初步掌握", f"章级初步掌握应在已完成并标初步掌握 {done}"


def _chapter_domain_with_quiz(min_q: int = 3) -> str:
    """找一个 published 题量充足的章节域（DOM-CH*），供章节自测用例使用。"""
    from collections import Counter

    db = SessionLocal()
    try:
        counts = Counter(db.execute(select(Question.domain_id).where(
            Question.review_status == "published")).scalars().all())
        for dom_id, n in counts.items():
            dom = db.get(DiagnosticDomain, dom_id)
            if dom and (dom.code or "").startswith("DOM-CH") and n >= min_q:
                return dom_id
        raise AssertionError("种子中没有题量充足的章节域")
    finally:
        db.close()


def test_chapter_learn_practice_pair_and_quiz_advances():
    """一学一练配对（2026-09-10）：章级薄弱发 学+练 任务对；章节随堂自测通过后
    章级行 薄弱→学习中，学+练配对保留（学习任务可反复回看）直到达标出列。"""
    _rebuild()
    uid = _fresh_user("loop_pair")
    domain_id = _chapter_domain_with_quiz()
    _insert_mastery(uid, domain_id, None, "薄弱")
    plan = client.get(f"/users/{uid}/learning-plan").json()
    tasks = [t for t in plan["tasks"] if t["domain_id"] == domain_id]
    assert {t["type"] for t in tasks} == {"material", "practice"}, f"章级薄弱应发 学+练 任务对 {tasks}"
    assert all(t.get("guide") and t.get("goal") for t in tasks), "配对任务都应有引导与达成路径"
    # 章节随堂自测（study-map 口径）：全对 → 通过，章级行 薄弱→学习中
    r = client.get(f"/users/{uid}/study-map/{domain_id}/quiz")
    assert r.status_code == 200, r.text
    qids = [q["id"] for q in r.json()["questions"]]
    assert qids, "章节应有可自测的题目"
    ans = {q: _answer_of(q) for q in qids}
    r = client.post(f"/users/{uid}/study-map/{domain_id}/quiz/submit", json={"answers": ans})
    assert r.status_code == 200, r.text
    assert r.json()["passed"] is True
    db = SessionLocal()
    try:
        st = db.execute(select(MasteryState).where(
            MasteryState.user_id == uid, MasteryState.domain_id == domain_id,
            MasteryState.category.is_(None))).scalar_one()
        assert st.state == "学习中", f"章节自测通过应推至学习中，实际 {st.state}"
    finally:
        db.close()
    plan2 = client.get(f"/users/{uid}/learning-plan").json()
    tasks2 = [t for t in plan2["tasks"] if t["domain_id"] == domain_id]
    assert {t["type"] for t in tasks2} == {"material", "practice"}, f"学习中仍应保留 学+练 配对 {tasks2}"
    assert all(t["state"] == "学习中" for t in tasks2), f"配对任务徽标应同步为学习中 {tasks2}"


def _seed_qid() -> str:
    """题库物化题示例（code 以 T 开头）作为章级练习载体。"""
    db = SessionLocal()
    try:
        return db.execute(select(Question).where(Question.code.like("T%"))).scalars().first().id
    finally:
        db.close()


def test_material_quiz_pass_advances_weak_and_drops_learn_task():
    """种子域错因薄弱：今日待办有「学习材料」任务；随堂自测通过后该错因推至「学习中」、
    学习任务出列，仅剩练习任务。"""
    _rebuild()
    uid = _fresh_user("loop_material")
    domain_id = _seed_domain_id()
    _insert_mastery(uid, domain_id, "概念混淆", "薄弱")
    plan = client.get(f"/users/{uid}/learning-plan").json()
    learn = [t for t in plan["tasks"] if t["domain_id"] == domain_id and t["type"] == "material"]
    assert learn, "种子域错因薄弱应有学习材料任务"
    # 随堂自测：全答对 → 通过
    qids = _quiz_qids(uid, domain_id)
    assert qids, "种子域应有可作随堂自测的题目"
    ans = {q: _answer_of(q) for q in qids}
    r = client.post(f"/users/{uid}/learning-plan/{domain_id}/quiz/submit", json={"answers": ans})
    assert r.status_code == 200, r.text
    assert r.json()["passed"] is True
    # 掌握状态：薄弱 → 学习中
    db = SessionLocal()
    try:
        st = db.execute(select(MasteryState).where(
            MasteryState.user_id == uid, MasteryState.domain_id == domain_id,
            MasteryState.category == "概念混淆")).scalar_one()
        assert st.state == "学习中", f"自测通过应把薄弱推进到学习中，实际 {st.state}"
    finally:
        db.close()
    # 学习材料任务出列，仅剩练习
    plan2 = client.get(f"/users/{uid}/learning-plan").json()
    learn2 = [t for t in plan2["tasks"] if t["domain_id"] == domain_id and t["type"] == "material"]
    assert not learn2, "自测通过后学习材料任务应出列"
    pra = [t for t in plan2["tasks"] if t["domain_id"] == domain_id and t["type"] == "practice"]
    assert pra, "学习中阶段仍应保留练习任务"


def test_material_quiz_fail_keeps_weak():
    """随堂自测未通过（≤60%）：错因保持薄弱，学习材料任务仍在。"""
    _rebuild()
    uid = _fresh_user("loop_fail")
    domain_id = _seed_domain_id()
    _insert_mastery(uid, domain_id, "机制理解不足", "薄弱")
    qids = _quiz_qids(uid, domain_id)
    assert len(qids) >= 1
    # 全答错 → 未通过
    ans = {q: _wrong_option(q) for q in qids}
    r = client.post(f"/users/{uid}/learning-plan/{domain_id}/quiz/submit", json={"answers": ans})
    assert r.json()["passed"] is False
    db = SessionLocal()
    try:
        st = db.execute(select(MasteryState).where(
            MasteryState.user_id == uid, MasteryState.domain_id == domain_id,
            MasteryState.category == "机制理解不足")).scalar_one()
        assert st.state == "薄弱", f"自测未通过不应改变状态，实际 {st.state}"
    finally:
        db.close()
    plan = client.get(f"/users/{uid}/learning-plan").json()
    learn = [t for t in plan["tasks"] if t["domain_id"] == domain_id and t["type"] == "material"]
    assert learn, "自测未通过学习材料任务应保留"


def test_archive_aggregates_attempts_and_domains():
    """学习档案聚合（2026-09-09）：作答总数/对错/正确率/域统计一致，热力图类别合法。"""
    _rebuild()
    uid = _fresh_user("loop_archive")
    qid = _seed_qid()
    correct_opt = _answer_of(qid)
    wrong_opt = next(o["key"] for o in db_question(qid).options if o["key"] != correct_opt)
    # 1 对 + 1 错
    for tag, opt in (("a-ok", correct_opt), ("a-wrong", wrong_opt)):
        r = client.post("/attempts", json={
            "user_id": uid, "question_id": qid, "selected_option": opt,
            "idempotency_key": f"arc-{tag}"})
        assert r.status_code in (200, 202), r.text
    arch = client.get(f"/users/{uid}/archive").json()
    s = arch["summary"]
    assert s["attempts"] == 2 and s["correct"] == 1 and s["wrong"] == 1
    assert abs(s["accuracy"] - 0.5) < 1e-9
    assert arch["domain_stats"], "应有域统计"
    ds = arch["domain_stats"][0]
    assert ds["attempts"] == 2 and ds["rate"] == 0.5
    # 热力图类别 ∈ CATS（含待诊断），值非负
    for c in arch["heatmap"]["categories"]:
        assert c in ("知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误", "待诊断")
    for row in arch["heatmap"]["values"]:
        assert all(v >= 0 for v in row)
    # 掌握度总览数组 + 统计汇总字段齐全
    assert "mastery" in arch and s["mastery_rows"] >= 0
    assert arch["heatmap"]["domains"]  # 答错的题应对应有域


def db_question(qid: str):
    from app.models import Question
    db = SessionLocal()
    try:
        return db.get(Question, qid)
    finally:
        db.close()
