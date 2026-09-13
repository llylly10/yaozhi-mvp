import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings

settings.database_url = "sqlite:///./test_knowledge.db"
settings.seed_on_startup = True

import pytest
from fastapi.testclient import TestClient
from app.db import Base, SessionLocal, engine, migrate
from app.models import DemoUser
from app.main import app

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def init_test_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    migrate()
    from seed.seed import seed as run_seed
    db = SessionLocal()
    try:
        run_seed(db)
    finally:
        db.close()
    yield


@pytest.fixture
def test_user():
    db = SessionLocal()
    try:
        u = DemoUser(display_name="知识点测试学员", consented=True)
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id
    finally:
        db.close()
    return uid


def test_core_knowledge_point_detail(test_user):
    """测试经典核心知识点获取，验证结构化药理字段与人卫9版教材锚点。"""
    res = client.get(
        f"/users/{test_user}/study/knowledge-detail",
        params={"chapter_no": 6, "point_name": "M 胆碱受体激动药"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["point_name"] == "M 胆碱受体激动药"
    assert "毛果芸香碱" in data["representative_drugs"][0]
    assert "缩瞳" in data["core_mechanism"] or "M3" in data["core_mechanism"]
    assert len(data["clinical_applications"]) >= 1
    assert "青光眼" in "".join(data["clinical_applications"])
    assert "mnemonic" in data and len(data["mnemonic"]) > 0
    assert "textbook_anchors" in data


def test_dynamic_synthesized_knowledge_point(test_user):
    """测试冷门/大纲分节标签的动态合成，保证结构完整。"""
    res = client.get(
        f"/users/{test_user}/study/knowledge-detail",
        params={"chapter_no": 2, "point_name": "被动转运"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["clean_name"] == "被动转运"
    assert len(data["core_mechanism"]) > 0
    assert len(data["clinical_applications"]) >= 1
    assert len(data["cautions_and_adverse"]) > 0
    assert len(data["key_takeaways"]) >= 1
