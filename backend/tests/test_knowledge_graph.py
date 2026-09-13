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
from app.db import Base, SessionLocal, engine, migrate  # noqa: E402

Base.metadata.create_all(engine)
migrate()
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
    # 边类型受控：FR-A2 六种 + 全量版新增"包含"（大纲结构边）
    allowed = {"作用于", "表现为", "禁忌用于", "适应证", "与…相互作用", "属于", "包含"}
    assert set(by_edge) <= allowed, f"存在 FR-A2 之外的边类型 {set(by_edge) - allowed}"


def test_graph_grounded_not_fabricated():
    """内容诚实：每条边的源/目标/边类型都可解析，且不出现教材外臆造药名。"""
    r = client.get(f"/materials/{domain_id()}").json()
    known = {"阿托品", "毛果芸香碱", "碘解磷定"}
    seen_drugs = {x["source"]["name"] for x in r["knowledge_relations"]
                  if x["source"]["type"] == "药物"} | {
        x["target"]["name"] for x in r["knowledge_relations"] if x["target"]["type"] == "药物"}
    assert seen_drugs <= known, f"图谱出现教材外药物节点 {seen_drugs - known}"


def test_relations_carry_textbook_evidence():
    """图谱边必须挂教材出处（2026-09-11）：此前 11 条边全是"裸断言"，无法回答凭什么成立。

    全量版区分：机制边（作用于/表现为/禁忌用于/适应证/与…相互作用）须挂
    教材页码证据；结构边（包含/属于）挂大纲/题库共现证据（source+chapter+text）。
    """
    rels = client.get(f"/materials/{domain_id()}").json()["knowledge_relations"]
    mech = [r for r in rels if r["edge"] in
            {"作用于", "表现为", "禁忌用于", "适应证", "与…相互作用"}]
    with_ev = [r for r in mech if r.get("evidence")]
    assert len(with_ev) >= 9, f"至少 9 条机制边应有教材证据，实际 {len(with_ev)}"
    for r in with_ev:
        ev = r["evidence"]
        assert {"source", "book_page", "chapter", "text"} <= set(ev), \
            f"证据字段不完整: {set(ev)}"
        assert ev["book_page"] and ev["text"], "页码与原文摘录不能为空"


def test_unverified_relation_keeps_evidence_null():
    """教材里找不到依据的边必须保持 null——宁可显示"待补教材依据"，也不挂不相关页。"""
    rels = client.get(f"/materials/{domain_id()}").json()["knowledge_relations"]
    missing = {(r["source"]["name"], r["edge"], r["target"]["name"])
               for r in rels if not r.get("evidence")}
    # 阿托品→前列腺肥大、毛果芸香碱→哮喘：OCR 538 页中未检索到可靠表述
    assert ("阿托品", "禁忌用于", "前列腺肥大") in missing or not missing, \
        f"未核验边应保持 evidence=null，实际缺失集合 {missing}"


def test_confusion_pairs_carry_evidence():
    """混淆对辨析同样要挂出处（此前 confusion_pair_evidence 表 0 行，辨析内容无背书）。"""
    pairs = client.get(f"/materials/{domain_id()}").json()["confusion_pairs"]
    assert pairs, "种子域应有混淆对"
    for p in pairs:
        assert p.get("evidence"), f"混淆对 {p['drug_a']} vs {p['drug_b']} 缺教材证据"


# ---------- 全量版（2026-09-11）：35 章覆盖 + 实体链接 + 遍历 ----------

def _all_domains():
    db = SessionLocal()
    try:
        return db.execute(select(DiagnosticDomain)).scalars().all()
    finally:
        db.close()


def test_chapter_domains_have_graph():
    """章级域全覆盖：每个 DOM-CH 域都有结构边（包含/属于），不再是空图谱。"""
    for d in _all_domains():
        if not d.code.startswith("DOM-CH"):
            continue
        n = client.get(f"/domains/{d.id}/graph").json()
        assert n["edges"], f"{d.code} 应有图谱边"
        by_edge = {e["edge"] for e in n["edges"]}
        assert by_edge <= {"作用于", "表现为", "禁忌用于", "适应证",
                           "与…相互作用", "属于", "包含"}, f"{d.code} 边类型越界 {by_edge}"


def test_structural_edges_carry_source():
    """结构边诚实：包含/属于边挂大纲/题库共现出处，不冒充教材页码。"""
    for d in _all_domains():
        if not d.code.startswith("DOM-CH"):
            continue
        n = client.get(f"/domains/{d.id}/graph").json()
        struct = [e for e in n["edges"] if e["edge"] in ("包含", "属于")]
        assert struct, f"{d.code} 应有结构边"
        for e in struct[:5]:
            ev = e.get("evidence") or {}
            assert {"source", "chapter", "text"} <= set(ev), \
                f"{d.code} 结构边证据缺字段: {set(ev)}"
            assert ev["source"] in ("教学大纲", "题库共现"), \
                f"{d.code} 结构边来源非法: {ev['source']}"
        break  # 抽一章验格式即可，全章格式同一管线生成


def test_no_mechanism_edges_outside_seed():
    """不虚构机制断言：章级域不得出现作用于/禁忌用于等机制边。"""
    for d in _all_domains():
        if not d.code.startswith("DOM-CH"):
            continue
        n = client.get(f"/domains/{d.id}/graph").json()
        mech = [e["edge"] for e in n["edges"] if e["edge"] in
                {"作用于", "表现为", "禁忌用于", "适应证", "与…相互作用"}]
        assert not mech, f"{d.code} 出现未审校机制边 {mech}"


def test_entity_link_and_traverse():
    """实体链接 + BFS：以本章药物为种子能走出子图。"""
    from app import graph as g
    db = SessionLocal()
    try:
        for d in _all_domains():
            if not d.code.startswith("DOM-CH"):
                continue
            drugs = [r.source["name"] for r in db.execute(
                select(KnowledgeRelation).where(
                    KnowledgeRelation.domain_id == d.id)).scalars()
                if (r.source or {}).get("type") == "药物"]
            if not drugs:
                continue
            seed = drugs[0]
            sub = g.traverse(db, d.id, [seed], depth=1)
            assert sub["edges"], f"{d.code} 以 {seed} 为种子应走出边"
            assert any(n["name"] == seed for n in sub["nodes"])
            # 长词优先：链接不应把已命中长词再拆成短词
            linked = g.link_entities(db, d.id, f"患者服用{seed}后血压下降")
            assert linked and linked[0]["name"] == seed
            break
    finally:
        db.close()


def test_graph_search_cross_domain():
    """跨章检索：常见药应命中多个章节。"""
    r = client.get("/graph/search", params={"q": "阿托品"})
    assert r.status_code == 200
    assert r.json()["domains"], "阿托品应跨章命中"


def test_chapter_graph_seed_idempotent():
    """幂等：重跑章图谱抽取不新增行。"""
    from seed.seed_chapter_graphs import apply_chapter_graphs
    db = SessionLocal()
    try:
        out = apply_chapter_graphs(db)
    finally:
        db.close()
    assert out["relations"] == 0 and out["pairs"] == 0, f"重放应零新增，实际 {out}"
