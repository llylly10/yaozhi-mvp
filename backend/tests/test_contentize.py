"""内容化回归（2026-09-03 P1-CH6）：reset-demo/startup 重建后内容不丢。

覆盖两条红线：
1. 重建（drop_all→create_all→seed，模拟 reset-demo）后：
   - tiku_questions 786 题、含 4 内容化列
   - CH3 22 题（P2a 19 + P4e 钙拮抗药 3）全部有解析且 review_status='published'
   - 规则初标（cognitive_level/difficulty/source_ref）覆盖全部 786 题
   - 章节 35（含补章 CH8/13/18/39）
   - 各内容化批重放保留：P1 CH6 46 / P2a CH3 19 / P2b CH2 45（两文件累加）/ P3 补章 4 章 36
    / P4a CH7 38 / P4b CH15 36+CH12 20+CH14 14 / P4c CH19-CH24 164
    / P4d 17 章 302 / P4e CH3 3（钙拮抗药，章映射偏差已标注） → published 总量 723
   - 单章题内容化 100% 覆盖；未发布 63 题全部为并列章题（chapter_ref 含逗号），
     按既定红线挂药理顾问裁决，不自动消解。
2. 幂等重放（不重建表再次 seed，模拟 startup 重启）：CH6 内容不丢失、不重复。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect, select  # noqa: E402

from app.config import settings  # noqa: E402

settings.database_url = "sqlite:///./test_contentize.db"
settings.seed_on_startup = True

from app.db import Base, SessionLocal, engine, migrate  # noqa: E402
from app.models import SyllabusChapter, TikuQuestion  # noqa: E402


def _counts(db):
    total = db.query(TikuQuestion).count()
    ch6 = db.query(TikuQuestion).filter(TikuQuestion.chapter_ref == "CH6").count()
    ch6_an = db.query(TikuQuestion).filter(
        TikuQuestion.chapter_ref == "CH6", TikuQuestion.analysis != "").count()
    ch6_pub = db.query(TikuQuestion).filter(
        TikuQuestion.chapter_ref == "CH6",
        TikuQuestion.review_status == "published").count()
    tagged = db.query(TikuQuestion).filter(
        TikuQuestion.cognitive_level != "",
        TikuQuestion.difficulty != "",
        TikuQuestion.source_ref != "").count()
    chs = db.query(SyllabusChapter).count()
    return total, ch6, ch6_an, ch6_pub, tagged, chs


def _rebuild():
    """模拟 reset-demo：drop_all→create_all→migrate→seed。"""
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


def test_contentize_survives_rebuild():
    _rebuild()
    db = SessionLocal()
    try:
        total, ch6, ch6_an, ch6_pub, tagged, chs = _counts(db)
        assert total == 786, f"题库池应 786 题，实际 {total}"
        assert ch6 == 49, f"CH6 应 49 题（P1 46 + 仲裁并入 3 题），实际 {ch6}"
        assert ch6_an == 49, f"CH6 解析应 49 条，实际 {ch6_an}"
        assert ch6_pub == 49, f"CH6 published 应 49，实际 {ch6_pub}"
        assert tagged == total, f"规则初标应覆盖全部 {total} 题，实际 {tagged}"
        assert chs >= 35, f"章节应 >=35（含补章），实际 {chs}"
        # P2a: CH3 内容化批(19题) 重放后保留；P2b: CH2 两文件共 45 题累加保留
        ch3_pub = db.query(TikuQuestion).filter(
            TikuQuestion.chapter_ref == "CH3",
            TikuQuestion.review_status == "published").count()
        assert ch3_pub == 22, f"CH3 published 应 22（P2a 19 + P4e 3），实际 {ch3_pub}"
        ch2_pub = db.query(TikuQuestion).filter(
            TikuQuestion.chapter_ref == "CH2",
            TikuQuestion.review_status == "published").count()
        assert ch2_pub == 47, f"CH2 published 应 47（原 45 + 仲裁并入 2 题），实际 {ch2_pub}"
        total_pub = db.query(TikuQuestion).filter(
            TikuQuestion.review_status == "published").count()
        assert total_pub == 786, (
            f"published 总量应达到 786（100.0% 收官），实际 {total_pub}")
        # 红线：全库 786 题 100% 内容化上线，未发布题数为 0，且无遗留逗号并列章题
        from sqlalchemy import not_  # noqa: E402
        unpub_total = db.query(TikuQuestion).filter(
            TikuQuestion.review_status != "published").count()
        assert unpub_total == 0, (
            f"未发布题数应为 0（63 道并列题已全量仲裁上线），实际 {unpub_total}")
        tie_unresolved = db.query(TikuQuestion).filter(
            TikuQuestion.chapter_ref.like("%,%")).count()
        assert tie_unresolved == 0, (
            f"仍有 {tie_unresolved} 题存在未裁决的并列章节引用")
        # 4 内容化列必须存在于表
        cols = {c["name"] for c in inspect(engine).get_columns("tiku_questions")}
        for need in ("analysis", "cognitive_level", "difficulty", "source_ref"):
            assert need in cols, f"tiku_questions 缺内容化列 {need}"
        # 抽查 3 条 CH6 解析非空且有真实内容
        samples = db.execute(
            select(TikuQuestion.analysis)
            .where(TikuQuestion.chapter_ref == "CH6")
            .limit(3)).all()
        for (a,) in samples:
            assert len(a) > 30, f"解析过短: {a[:20]}"
    finally:
        db.close()


def test_contentize_idempotent_reseed():
    """不重建表再次 seed（startup 重启路径）：内容不丢不重。"""
    from seed.seed import seed as run_seed
    db = SessionLocal()
    try:
        run_seed(db)
        db.commit()
        total, ch6, ch6_an, ch6_pub, tagged, chs = _counts(db)
        assert total == 786
        assert ch6_an == 49 and ch6_pub == 49, "幂等重放后 CH6 内容不得丢失"
        assert tagged == 786, "幂等重放不得重复计数/清空初标"
    finally:
        db.close()


def test_a_fixes_survive_rebuild():
    """A 类人工修正 4 题不随 reset-demo 丢失（词表启发优先级 < 人工判定）。"""
    _rebuild()
    db = SessionLocal()
    try:
        from seed.apply_amapping import FIXES
        bad = []
        for (p, q), target in FIXES.items():
            row = db.query(TikuQuestion).filter_by(paper_no=p, qid=q).first()
            if row is None:
                bad.append(f"{p}-{q:03d}: 题不存在")
            elif row.chapter_ref != target:
                bad.append(f"{p}-{q:03d}: 应为 {target}，实际 {row.chapter_ref}")
        assert not bad, "A 类修正被恢复链覆盖: " + "; ".join(bad)
    finally:
        db.close()


def test_tie_fixes_survive_rebuild():
    """63 道并列题人工仲裁结果不随 reset-demo 丢失。"""
    _rebuild()
    db = SessionLocal()
    try:
        from seed.apply_tie_arbitration import TIE_FIXES
        bad = []
        for (p, q), target in TIE_FIXES.items():
            row = db.query(TikuQuestion).filter_by(paper_no=p, qid=q).first()
            if row is None:
                bad.append(f"{p}-{q:03d}: 题不存在")
            elif row.chapter_ref != target:
                bad.append(f"{p}-{q:03d}: 应为 {target}，实际 {row.chapter_ref}")
            elif row.review_status != "published":
                bad.append(f"{p}-{q:03d}: 状态未发布({row.review_status})")
        assert not bad, "并列题仲裁被恢复链覆盖或未发布: " + "; ".join(bad)
    finally:
        db.close()
