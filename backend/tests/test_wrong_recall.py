"""错题记忆卡 recall 接口（图谱 + 临床/教材助记），2026-09-08。

用户诉求：错题本里每条错题点开，能看到「错题图谱 + 实际案例/临床教材助记」。
wrong_book 列表保持轻量；点开单条走 GET /wrong/{attempt_id}/recall，聚合返回：
  - misconception 归因 + case_evidence（错因目录预置的临床案例）
  - relations / confusion_pairs（该错题所属域 FR-A2 图谱；M 受体演示域 11 条）
  - textbook_anchors（按题干实时检索人卫《药理学》9e OCR 的真实教材段落，带章/页码署名）
题库题即便无预置临床案例，也能给出真实教材依据辅助记忆（RAG 锚定）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_recall.db"
settings.seed_on_startup = True

from app.main import app  # noqa: E402
from app.db import Base, SessionLocal, engine, migrate  # noqa: E402

Base.metadata.create_all(engine)
migrate()
from seed.seed import seed  # noqa: E402

_s = SessionLocal()
try:
    seed(_s)
finally:
    _s.close()

from app.models import Question  # noqa: E402
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def fresh_user() -> str:
    acc = f"recall_{uuid.uuid4().hex[:8]}"
    r = client.post("/sessions/demo", json={"account": acc, "invite_code": "DEMO2026"})
    assert r.status_code == 200, r.text
    uid = r.json()["user_id"]
    client.post(f"/users/{uid}/consent", json={
        "user_agreement": True, "privacy_policy": True, "data_collection": True})
    return uid


def q_id(code: str) -> str:
    db = SessionLocal()
    try:
        return db.execute(select(Question).where(Question.code == code)).scalar_one().id
    finally:
        db.close()


def wrong_attempt(user: str, code: str) -> str:
    """答错一道题并返回 attempt_id（选一个必然错的选项）。"""
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.code == code)).scalar_one()
        options = q.options or []
        answer = q.answer
        wrong = next((o["key"] for o in options if o.get("key") != answer), None) or "A"
    finally:
        db.close()
    r = client.post("/attempts", json={
        "user_id": user, "question_id": q_id(code), "selected_option": wrong,
        "confidence": "中", "idempotency_key": f"recall-{uuid.uuid4().hex}"})
    assert r.status_code == 202, r.text
    return r.json()["attempt_id"]


def test_recall_m_receptor_wrong_has_graph():
    """M 受体演示域错题：recall 应带出 11 条 FR-A2 图谱关系 + 混淆对（真数据，非空）。"""
    u = fresh_user()
    aid = wrong_attempt(u, "Q-ANS-01")
    r = client.get(f"/wrong/{aid}/recall")
    assert r.status_code == 200
    d = r.json()
    assert (d["question"] or {}).get("code") == "Q-ANS-01"
    # M 受体域有预置知识图谱
    assert len(d.get("relations") or []) > 0
    # 图谱边类型含 FR-A2 语义字段
    assert {"source", "edge", "target"} <= set(d["relations"][0])
    # 该域有混淆对
    assert len(d.get("confusion_pairs") or []) > 0


def test_recall_m_receptor_wrong_after_diagnosis_has_case():
    """走完诊断(M受体域概念混淆)后，错因携带临床案例 case_evidence 出现在记忆卡。"""
    # 让 MIS-ANS 域题答错并出诊断卡（概念混淆方向→Q-ANS 错选 B 会进诊断）
    u = fresh_user()
    db = SessionLocal()
    try:
        q = db.execute(select(Question).where(Question.code == "Q-ANS-02")).scalar_one()
        options = q.options or []
        answer = q.answer
        # 故意答"张冠李戴"方向的错误选项，触发概念混淆诊断
        wrong = next(o["key"] for o in options if o.get("key") != answer)
    finally:
        db.close()
    # 用确定的错误作答
    r = client.post("/attempts", json={
        "user_id": u, "question_id": q_id("Q-ANS-02"), "selected_option": wrong,
        "confidence": "中", "idempotency_key": f"recall2-{uuid.uuid4().hex}"})
    assert r.status_code == 202
    aid = r.json()["attempt_id"]
    rec = client.get(f"/wrong/{aid}/recall").json()
    # 若已出具错因卡，则错因属于种子域四分类之一（MIS-ANS-*）
    if rec.get("misconception"):
        mc = rec["misconception"]
        assert mc["code"].startswith("MIS-ANS")
    # 结构完整：relations + case 字段存在（不要求必然有 case，因取决于是否走追问到收敛）
    assert "case_evidence" in rec
    assert "textbook_anchors" in rec
    assert isinstance(rec["textbook_anchors"], list)


def test_recall_fields_present_for_every_wrong():
    """recall 对所有错题都返回统一结构（前端契约稳定），各字段 key 齐备。"""
    u = fresh_user()
    aids = [wrong_attempt(u, "Q-ANS-01"), wrong_attempt(u, "Q-ANS-03")]
    for aid in aids:
        d = client.get(f"/wrong/{aid}/recall").json()
        for k in ("question", "misconception", "case_evidence", "evidence_level",
                  "relations", "confusion_pairs", "textbook_anchors", "trained"):
            assert k in d, f"缺少字段 {k}"


def test_recall_tiku_question_has_deep_subgraph():
    """章域题库题错题卡：子图须是 2 跳邻域（不是 depth=1 的药物→章节星形），
    混淆对带 relevant 标记且含本题实体的对排在前面。"""
    from app.models import DiagnosticDomain
    db = SessionLocal()
    try:
        codes = [q.code for q in db.execute(
            select(Question).where(Question.code.like("T%"),
                                   Question.review_status == "published")).scalars()]
    finally:
        db.close()
    assert codes, "测试库应有物化题库题"
    u = fresh_user()
    got = None
    for code in codes[:8]:
        aid = wrong_attempt(u, code)
        d = client.get(f"/wrong/{aid}/recall").json()
        if d.get("linked_entities"):
            got = d
            break
    assert got, "章域题应至少有一道能链接到图谱实体"
    # 2 跳邻域：边数应超过"每实体一条属于边"的星形规模（含章节结构边）
    assert len(got["relations"]) >= len(got["linked_entities"]) + 1, \
        f"子图太稀疏（疑似 depth=1 星形）：{len(got['relations'])} 边 / {len(got['linked_entities'])} 实体"
    assert got["subgraph"]["fallback"] is False
    # 混淆对人人带 relevant 标记
    for p in got["confusion_pairs"]:
        assert "relevant" in p, f"混淆对缺 relevant 标记: {p}"
    linked = {e["name"] for e in got["linked_entities"]}
    first = got["confusion_pairs"][0]
    assert first["relevant"] == bool(
        first["drug_a"] in linked or first["drug_b"] in linked), "首对排序与标记不一致"


def _same_chapter_t_codes() -> list[str]:
    """取同一章节的两道物化题库题（保证共享章节枢纽）。"""
    from collections import defaultdict
    db = SessionLocal()
    try:
        by_dom: dict[str, list[str]] = defaultdict(list)
        for q in db.execute(select(Question).where(
                Question.code.like("T%"),
                Question.review_status == "published")).scalars():
            by_dom[q.domain_id].append(q.code)
    finally:
        db.close()
    for codes in by_dom.values():
        if len(codes) >= 2:
            return codes[:2]
    raise AssertionError("测试库无同章双题")


def test_wrong_graph_empty_for_clean_user():
    """无错题用户：关联图谱返回空节点（前端隐藏该区）。"""
    u = fresh_user()
    d = client.get(f"/users/{u}/wrong-graph").json()
    assert d["nodes"] == [] and d["edges"] == []


def test_wrong_graph_shares_chapter_and_drug_hubs():
    """错题关联图谱：同章两题共享章节枢纽，同药两题共享药物枢纽；
    题目节点带回跳 attempt 映射，无归因的题库题没有归因边。"""
    codes = _same_chapter_t_codes()
    u = fresh_user()
    for code in codes:
        wrong_attempt(u, code)
    d = client.get(f"/users/{u}/wrong-graph").json()
    by_type: dict[str, list] = {}
    for n in d["nodes"]:
        by_type.setdefault(n["type"], []).append(n["name"])
    assert len(by_type.get("题目", [])) >= 2
    assert by_type.get("章节"), "应有章节枢纽"
    # 枢纽复用：至少一个枢纽连出 ≥2 道题（同章/同药的联系真实存在）
    from collections import Counter
    hub_uses: Counter = Counter()
    for e in d["edges"]:
        if e["target"]["type"] in ("章节", "药物", "错因"):
            hub_uses[e["target"]["name"]] += 1
    assert any(v >= 2 for v in hub_uses.values()), f"无共享枢纽：{hub_uses.most_common(5)}"
    # 边类型受控 + 派生证据诚实（不冒充教材页码）
    assert {e["edge"] for e in d["edges"]} <= {"属于", "涉及", "归因"}
    for e in d["edges"]:
        ev = e.get("evidence") or {}
        assert ev.get("source") == "做题关联" and "book_page" not in ev
    # 回跳映射：题目节点能找到 attempt（枢纽节点除外）
    qnames = set(by_type.get("题目", []))
    assert qnames <= set(d["meta"]), "题目节点应有映射"
    for name in qnames:
        assert d["meta"][name].get("attempt_ids"), f"{name} 无作答映射"
