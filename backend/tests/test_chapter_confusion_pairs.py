# -*- coding: utf-8 -*-
"""34 章深度混淆对精细化（人卫第9版临床鉴别知识库）自动化测试。"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_cp_refine.db"
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

from app.models import ConfusionPair, DiagnosticDomain  # noqa: E402

client = TestClient(app)


def test_all_34_chapters_have_confusion_pairs():
    """断言全书 34 个章节诊断域全部覆盖了混淆鉴别对。"""
    db = SessionLocal()
    try:
        domains = db.execute(
            select(DiagnosticDomain).where(DiagnosticDomain.code.like("DOM-CH%"))
        ).scalars().all()
        assert len(domains) == 34, f"章节域数量应为 34，实得 {len(domains)}"

        empty_domains = []
        for d in domains:
            cnt = db.execute(
                select(ConfusionPair).where(ConfusionPair.domain_id == d.id)
            ).scalars().all()
            if len(cnt) == 0:
                empty_domains.append(d.code)

        assert not empty_domains, f"以下章节混淆对缺失: {empty_domains}"
    finally:
        db.close()


def test_zero_placeholder_pairs_exist():
    """断言全库没有任何包含'待药理顾问撰写'或'共现'占位符的混淆对。"""
    db = SessionLocal()
    try:
        pairs = db.execute(select(ConfusionPair)).scalars().all()
        assert len(pairs) >= 120, f"混淆对总数应不少于 120，实得 {len(pairs)}"

        placeholders = []
        for p in pairs:
            txt = p.distinction_text or ""
            if "待药理顾问撰写" in txt or "待顾问撰写" in txt or "选项中共现" in txt:
                placeholders.append((p.drug_a, p.drug_b, txt))

        assert not placeholders, f"存在未精细化的占位混淆对: {placeholders[:5]}"
    finally:
        db.close()


def test_no_spurious_drug_names():
    """断言清理了'止嘧啶'等分词误切杂质。"""
    db = SessionLocal()
    try:
        bad = db.execute(
            select(ConfusionPair).where(
                (ConfusionPair.drug_a == "止嘧啶") | (ConfusionPair.drug_b == "止嘧啶")
            )
        ).scalars().all()
        assert len(bad) == 0, "数据库中不应存在'止嘧啶'等非法分词混淆对"
    finally:
        db.close()


def test_all_chapter_pairs_carry_authoritative_evidence():
    """断言章节混淆对均携带人卫《药理学》9e 教材原文锚点。"""
    db = SessionLocal()
    try:
        domains = {d.id: d.code for d in db.execute(
            select(DiagnosticDomain).where(DiagnosticDomain.code.like("DOM-CH%"))
        ).scalars().all()}

        pairs = db.execute(
            select(ConfusionPair).where(ConfusionPair.domain_id.in_(domains.keys()))
        ).scalars().all()

        missing_evidence = []
        for p in pairs:
            ev = p.evidence
            if not isinstance(ev, dict) or ev.get("source") != "人卫《药理学》9e":
                missing_evidence.append((domains[p.domain_id], p.drug_a, p.drug_b))

        assert not missing_evidence, f"以下混淆对缺少人卫9e教材依据: {missing_evidence[:5]}"
    finally:
        db.close()


def test_api_materials_serves_refined_distinctions():
    """接口回归：GET /materials/{domain_id} 能正确返回精细化辨析与人卫教材出处。"""
    db = SessionLocal()
    try:
        d_ch20 = db.execute(
            select(DiagnosticDomain).where(DiagnosticDomain.code == "DOM-CH20")
        ).scalar_one()
        ch20_id = d_ch20.id
    finally:
        db.close()

    r = client.get(f"/materials/{ch20_id}")
    assert r.status_code == 200, r.text
    data = r.json()
    cps = data.get("confusion_pairs", [])
    assert len(cps) >= 4, f"CH20 混淆对应不少于 4 对，实得 {len(cps)}"

    first = cps[0]
    assert "drug_a" in first and "drug_b" in first
    assert "distinction" in first and len(first["distinction"]) > 20
    assert "待顾问撰写" not in first["distinction"]
    assert first.get("evidence", {}).get("source") == "人卫《药理学》9e"
