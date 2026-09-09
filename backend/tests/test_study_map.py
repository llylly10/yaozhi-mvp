"""学习地图 · 知识图谱（2026-09-09：目标后、摸底前 的「先学→随堂摸底」）验收：

  - /users/{id}/study-map 返回按药理系统分组的章节节点（35 节点 = 34 章域 + 种子域示范）；
    每节点带 source（seed/syllabus/none）、题量、是否已随堂达标、掌握态。
  - /users/{id}/study-map/{domain}/ 返回学习内容：种子域=深图谱(链+关系+混淆)；
    章节域=课程大纲(节→知识点 + 重点难点)；缺材料域如实 source=none。
  - 随堂摸底 ≥60% 通过 → 该域 StudyProgress 置「已达标」并记录分数（融入学习闭环）。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_study_map.db"
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

from app.models import DiagnosticDomain, Question, StudyProgress  # noqa: E402
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def _new_user() -> str:
    r = client.post("/sessions/demo", json={"account": f"stu_{uuid.uuid4().hex[:6]}",
                                            "invite_code": "DEMO2026"})
    assert r.status_code == 200
    uid = r.json()["user_id"]
    client.post(f"/users/{uid}/consent", json={"user_agreement": True, "privacy_policy": True,
                                               "data_collection": True})
    return uid


def _domain(code: str) -> str:
    db = SessionLocal()
    try:
        return db.execute(select(DiagnosticDomain).where(
            DiagnosticDomain.code == code)).scalar_one().id
    finally:
        db.close()


def _seed_domain() -> str:
    return _domain("DOM-PHARMO-ANS")


def test_study_map_groups_nodes():
    """图谱门户返回 6 药理系统分组、共 35 节点，种子域在「总论·自主神经」首位且 is_seed。"""
    uid = _new_user()
    r = client.get(f"/users/{uid}/study-map")
    assert r.status_code == 200
    d = r.json()
    assert len(d["groups"]) >= 6
    total = sum(len(g["nodes"]) for g in d["groups"])
    assert total == 35
    first = d["groups"][0]["nodes"][0]
    assert first["is_seed"] is True
    assert first["source"] == "seed"
    # 每个节点都有题量与学习来源标记
    for g in d["groups"]:
        for n in g["nodes"]:
            assert n["q_published"] >= 0
            assert n["source"] in ("seed", "syllabus", "none")


def test_study_detail_seed_has_deep_graph():
    """种子域学习内容 = 顾问整理的深图谱（推理链 + 关系 + 易混对）。"""
    uid = _new_user()
    r = client.get(f"/users/{uid}/study-map/{_seed_domain()}")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "seed"
    assert len(d["graph"]["chain"]) >= 5
    assert d["graph"]["relations"]
    assert d["graph"]["confusion"]


def test_study_detail_syllabus_has_outline():
    """章节域学习内容 = 课程大纲结构（节→知识点 + 重点 + 掌握要求），未伪造深图谱。"""
    uid = _new_user()
    db = SessionLocal()
    try:
        ch_dom = db.execute(select(DiagnosticDomain).where(
            DiagnosticDomain.code == "DOM-CH7")).scalar_one()
    finally:
        db.close()
    r = client.get(f"/users/{uid}/study-map/{ch_dom.id}")
    assert r.status_code == 200
    d = r.json()
    assert d["source"] == "syllabus"
    assert d["chapter"]["no"] == 7
    assert "objectives" in d["chapter"] and d["chapter"]["key_points"]


def test_study_quiz_pass_marks_progress():
    """随堂摸底：≥60% 通过 → StudyProgress 该域「已达标」并记录分数。"""
    uid = _new_user()
    seed_dom = _seed_domain()
    q = client.get(f"/users/{uid}/study-map/{seed_dom}/quiz").json()["questions"]
    assert len(q) >= 2, "种子域应有随堂摸底题"
    # 构造全对答案
    db = SessionLocal()
    try:
        answers = {qid: db.execute(select(Question).where(
            Question.id == qid)).scalar_one().answer for qid in [x["id"] for x in q]}
    finally:
        db.close()
    r = client.post(f"/users/{uid}/study-map/{seed_dom}/quiz/submit",
                    json={"answers": answers})
    assert r.status_code == 200
    body = r.json()
    assert body["passed"] is True
    # StudyProgress 已落库
    db = SessionLocal()
    try:
        prog = db.get(StudyProgress, (uid, seed_dom))
    finally:
        db.close()
    assert prog is not None
    assert prog.state == "已达标"
    assert float(prog.best_score or 0) >= 0.6
    # 图谱门户节点反映已达标
    d = client.get(f"/users/{uid}/study-map").json()
    node = [n for g in d["groups"] for n in g["nodes"]
            if n["domain_id"] == seed_dom][0]
    assert node["studied"] and node["studied"]["passed"] is True


def test_study_quiz_fail_no_progress():
    """未通过摸底不写「已达标」。"""
    uid = _new_user()
    seed_dom = _seed_domain()
    q = client.get(f"/users/{uid}/study-map/{seed_dom}/quiz").json()["questions"]
    # 全部答错
    wrong = {qid: "Z" for qid in [x["id"] for x in q]}
    r = client.post(f"/users/{uid}/study-map/{seed_dom}/quiz/submit",
                    json={"answers": wrong})
    body = r.json()
    assert body["passed"] is False
    db = SessionLocal()
    try:
        prog = db.get(StudyProgress, (uid, seed_dom))
    finally:
        db.close()
    assert prog is None or prog.state != "已达标"
