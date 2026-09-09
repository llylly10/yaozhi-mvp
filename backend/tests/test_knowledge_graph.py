"""FR-A2 结构化知识关系（图谱最小落地，2026-09-08）验收：

种子诊断域（DOM-PHARMO-ANS）应能通过 materials 接口取到机器可读的知识关系
（源节点—边类型→目标节点），且内容由 seed 已署名教材事实转写（不虚构）——
阿托品—作用于→M受体、—禁忌用于→闭角型青光眼/前列腺肥大、
与碘解磷定—与…相互作用等，供学习/记忆图谱使用。
"""
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_kg.db"
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

from app.models import DiagnosticDomain, KnowledgeRelation  # noqa: E402
from sqlalchemy import select  # noqa: E402

client = TestClient(app)


def domain_id() -> str:
    db = SessionLocal()
    try:
        return db.execute(select(DiagnosticDomain).where(
            DiagnosticDomain.code == "DOM-PHARMO-ANS")).scalar_one().id
    finally:
        db.close()


def test_graph_seeded():
    """种子域必须落出知识关系边（schema 完整性 + seed 生效）。"""
    db = SessionLocal()
    try:
        n = db.execute(select(KnowledgeRelation)).scalars().all()
    finally:
        db.close()
    assert n, "种子域应落出至少一条知识关系"


def test_materials_expose_relations():
    """materials 接口带出 FR-A2 关系（源—边→目标），含作用于/禁忌用于/相互作用。"""
    r = client.get(f"/materials/{domain_id()}")
    assert r.status_code == 200
    rels = r.json()["knowledge_relations"]
    assert rels, "materials 必须返回 knowledge_relations"
    by_edge = {}
    for rel in rels:
        by_edge.setdefault(rel["edge"], []).append(rel)
    # 阿托品 —作用于→ M受体
    acting = [(x["source"]["name"], x["target"]["name"]) for x in by_edge.get("作用于", [])]
    assert any(s == "阿托品" and t == "M受体" for s, t in acting), "缺阿托品—作用于→M受体"
    assert any(s == "毛果芸香碱" and t == "M受体" for s, t in acting), "缺毛果芸香碱—作用于→M受体"
    # 阿托品 —禁忌用于→ 闭角型青光眼
    contra = [x["target"]["name"] for x in by_edge.get("禁忌用于", [])
              if x["source"]["name"] == "阿托品"]
    assert "闭角型青光眼" in contra, "阿托品应禁忌用于闭角型青光眼"
    # 阿托品 与…相互作用 碘解磷定
    inter = [x["target"]["name"] for x in by_edge.get("与…相互作用", [])]
    assert "碘解磷定" in inter, "阿托品与碘解磷定应存在相互作用关系"
    # 边类型受控：不允许落入 FR-A2 之外的自造边类型
    allowed = {"作用于", "表现为", "禁忌用于", "适应证", "与…相互作用", "属于"}
    assert set(by_edge) <= allowed, f"存在 FR-A2 之外的边类型 {set(by_edge) - allowed}"


def test_graph_grounded_not_fabricated():
    """内容诚实：每条边的源/目标/边类型都可解析，且不出现教材外臆造药名。"""
    r = client.get(f"/materials/{domain_id()}").json()
    known = {"阿托品", "毛果芸香碱", "碘解磷定"}
    seen_drugs = {x["source"]["name"] for x in r["knowledge_relations"]
                  if x["source"]["type"] == "药物"} | {
        x["target"]["name"] for x in r["knowledge_relations"] if x["target"]["type"] == "药物"}
    assert seen_drugs <= known, f"图谱出现教材外药物节点 {seen_drugs - known}"
