"""P0 表模型（v1.1 §4，共 17 张：15 张 P0 + mastery/audit 运行组）+ 课程资产 3 张。

约定：uuid 主键存 String(36)；枚举用 native_enum=False（VARCHAR+CHECK，SQLite/PG 可移植）；
多值关系一律关联表；金额/分数用 Numeric。字段语义见《实施方案设计 v1.1》第 4 章。
新增资产表（tiku_papers/tiku_questions/syllabus_chapters）为外部语料导入，
与诊断业务表隔离：题库原文/大纲树未经错因标注与顾问审校，不得进入 questions 业务表。
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON, Boolean, CheckConstraint, DateTime, ForeignKey, Numeric, SmallInteger,
    String, Text, UniqueConstraint, false,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


def _enum(name: str, *values: str):
    from sqlalchemy import Enum
    return Enum(name=name, native_enum=False, *values)


# ---------- 内容资产组 ----------

class KnowledgePoint(Base):
    __tablename__ = "knowledge_points"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    domain_id: Mapped[str | None] = mapped_column(ForeignKey("diagnostic_domains.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(128))
    cognitive_level: Mapped[str] = mapped_column(_enum("cognitive_level", "记忆", "理解", "应用"))
    aliases: Mapped[list] = mapped_column(JSON, default=list)  # 别名，无外键语义


class DiagnosticDomain(Base):
    __tablename__ = "diagnostic_domains"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    chapter_ref: Mapped[str] = mapped_column(String(256))
    syllabus_ref: Mapped[str] = mapped_column(String(512), default="")
    exam_ref: Mapped[str] = mapped_column(String(512), default="")
    mastery_threshold: Mapped[float] = mapped_column(Numeric(4, 3), default=0.70)
    status: Mapped[str] = mapped_column(_enum("asset_status", "draft", "in_review", "published", "deprecated"),
                                        default="published")


class ChainNode(Base):
    __tablename__ = "chain_nodes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    level: Mapped[int] = mapped_column(SmallInteger)  # L1..L6
    title: Mapped[str] = mapped_column(String(128))
    summary: Mapped[str] = mapped_column(Text, default="")
    __table_args__ = (UniqueConstraint("domain_id", "level", name="uq_chain_domain_level"),)


class FollowupNode(Base):
    """追问树节点（静态资产，模型只做选择与话术组装；v1.1 决策 X1）。"""
    __tablename__ = "followup_nodes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    chain_level: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    question_text: Mapped[str] = mapped_column(Text)
    # 选择型：[{"key":"A","text":"…"}]；开放型为 null
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 选择型判定：{"A": {"shift": -1|0|1, "supports": "MIS-x", "note": "…"}}
    option_signals: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 开放型判定：{"accept_keywords": [...], "supports": "MIS-x"}
    open_judge: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    author: Mapped[str] = mapped_column(String(64), default="待药理顾问确认")
    review_status: Mapped[str] = mapped_column(_enum("asset_status", "draft", "in_review", "published", "deprecated"),
                                               default="published")  # 种子内容默认 draft，见 seed.py


class ConfusionPair(Base):
    __tablename__ = "confusion_pairs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    drug_a: Mapped[str] = mapped_column(String(64))
    drug_b: Mapped[str] = mapped_column(String(64))
    distinction_text: Mapped[str] = mapped_column(Text)
    variant_template: Mapped[str] = mapped_column(_enum("variant_template", "正向", "反向", "情境"), default="正向")
    # 教材证据锚点（2026-09-11）：每条辨析挂 1 条教材原文出处，避免"辨析内容无出处"。
    # 结构同 Misconception.case_evidence：{source, book_page, chapter, text}
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class Misconception(Base):
    """错因目录条目：受控目录，模型不得创造（ADR-03）；remediation_type 即错因×干预路由（N3）。"""
    __tablename__ = "misconceptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    category: Mapped[str] = mapped_column(_enum(
        "misconception_category", "知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"))
    name: Mapped[str] = mapped_column(String(256))
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    indicators: Mapped[list] = mapped_column(JSON, default=list)
    counter_indicators: Mapped[list] = mapped_column(JSON, default=list)
    remediation_type: Mapped[str] = mapped_column(_enum(
        "remediation_type", "记忆卡", "混淆对变式", "断环重讲", "情境拆解"))
    remediation_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    # 教材事实案例（v0.7 错因卡第④字段，2026-09-08）：每个错因附 1 条教材/说明书事实
    # 案例辅助学生记忆，来源署名（教材页码/说明书条目），不虚构。结构：
    # {"scenario": 临床场景, "lesson": 一句话要点, "source": 来源署名}
    case_evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(_enum("asset_status", "draft", "in_review", "published", "deprecated"),
                                        default="published")


class MisconceptionFollowup(Base):
    __tablename__ = "misconception_followups"
    misconception_id: Mapped[str] = mapped_column(ForeignKey("misconceptions.id"), primary_key=True)
    followup_node_id: Mapped[str] = mapped_column(ForeignKey("followup_nodes.id"), primary_key=True)


class ConfusionPairEvidence(Base):
    __tablename__ = "confusion_pair_evidence"
    pair_id: Mapped[str] = mapped_column(ForeignKey("confusion_pairs.id"), primary_key=True)
    evidence_chunk_id: Mapped[str] = mapped_column(String(36))  # W3 接 evidence_chunks 后加 FK


class KnowledgeRelation(Base):
    """结构化知识关系（FR-A2 图谱最小落地，2026-09-08）。

    以「源节点 —(边类型)→ 目标节点」表示一条知识关系。节点用 JSON {type, name}
    内联标识（不另设节点注册表，MVP 够用）。边类型对齐 FR-A2：
    作用于 / 表现为 / 禁忌用于 / 适应证 / 与…相互作用 / 属于。
    内容仅由种子已署名教材事实转写（见 seed.KNOWLEDGE_EDGES），不虚构；
    全章节铺开前须药理顾问审校（字段 author/review_status 预留）。
    """
    __tablename__ = "knowledge_relations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    source: Mapped[dict] = mapped_column(JSON)          # {"type": 药物|机制|靶点|..., "name": …}
    edge: Mapped[str] = mapped_column(String(32))        # 作用于/表现为/禁忌用于/适应证/与…相互作用/属于
    target: Mapped[dict] = mapped_column(JSON)          # {"type": …, "name": …}
    note: Mapped[str] = mapped_column(String(256), default="")
    # 教材证据锚点（2026-09-11）：每条边挂 1 条教材原文出处，让"关系"可回溯而非凭空断言。
    # 由 seed_knowledge_evidence 从人卫 9e OCR 检索 + 人工核验后写入；结构：
    # {"source": 来源署名, "book_page": 教材页码, "chapter": 章节, "text": 原文摘录}
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    author: Mapped[str] = mapped_column(String(64), default="待药理顾问确认")
    review_status: Mapped[str] = mapped_column(_enum("asset_status", "draft", "in_review", "published", "deprecated"),
                                               default="draft")  # 试用前置 published


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    type: Mapped[str] = mapped_column(_enum("question_type", "single", "judge"))
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    stem: Mapped[str] = mapped_column(Text)
    options: Mapped[list] = mapped_column(JSON)  # [{"key","text"}]
    answer: Mapped[str] = mapped_column(String(8))
    usage: Mapped[str] = mapped_column(_enum("question_usage", "diagnostic", "training", "retest", "protected"))
    leakage_group_id: Mapped[str] = mapped_column(String(32), default="")
    # 出题时预标注：{"A": {"misconception": "MIS-x", "weight": 0.8, "note": "…"}}
    distractor_signals: Mapped[dict] = mapped_column(JSON, default=dict)
    chain_levels: Mapped[list] = mapped_column(JSON, default=list)  # 枚举环位数组，无外键语义
    condition_type: Mapped[str] = mapped_column(_enum(
        "condition_type", "normal", "special_population", "polypharmacy", "pathology"), default="normal")
    review_status: Mapped[str] = mapped_column(_enum("asset_status", "draft", "in_review", "published", "deprecated"),
                                               default="published")  # 种子默认 draft（待顾问审核）


class QuestionEvidence(Base):
    """题目绑定证据（ADR-02）。W1 存文本占位，W3 换 evidence_chunks.id + FK。"""
    __tablename__ = "question_evidence"
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), primary_key=True)
    evidence_chunk_id: Mapped[str] = mapped_column(String(36), primary_key=True)  # W1: "EV-占位"
    support_type: Mapped[str] = mapped_column(_enum("support_type", "解析", "归因", "复测判定"), default="解析")
    content_text: Mapped[str] = mapped_column(Text, default="")  # W1 占位：知识点原文


# ---------- 作答与诊断组 ----------

class DemoUser(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    display_name: Mapped[str] = mapped_column(String(64), default="演示学生")
    consented: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    # US-0 AC4/AC5：撤回同意与数据删除。逻辑删除即时生效（停止一切读写），
    # 物理删除由 purge_withdrawn_users 按 PURGE_AFTER_DAYS（30 天）清理。
    consented_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deletion_receipt: Mapped[str | None] = mapped_column(String(32), nullable=True)


class Attempt(Base):
    __tablename__ = "attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"))
    selected_option: Mapped[str] = mapped_column(String(8))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[str | None] = mapped_column(_enum("confidence", "高", "中", "低"), nullable=True)
    time_spent: Mapped[int | None] = mapped_column(nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DiagnosisSession(Base):
    __tablename__ = "diagnosis_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("attempts.id"), unique=True)
    state: Mapped[str] = mapped_column(_enum(
        "diagnosis_state",
        "submitted", "claimed", "evidence_collected", "candidates_retrieved",
        "followup_required", "followup_answered", "diagnosed", "training", "retesting", "completed"))
    hypothesis_id: Mapped[str | None] = mapped_column(ForeignKey("misconceptions.id"), nullable=True)
    chain_focus: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    followup_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    evidence_level: Mapped[str | None] = mapped_column(_enum("evidence_level", "高", "中", "低"), nullable=True)
    claimed_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    feedback: Mapped[str | None] = mapped_column(
        _enum("diagnosis_feedback", "matches", "not_matches"), nullable=True)  # 学生归因反馈
    can_refine: Mapped[bool] = mapped_column(Boolean, default=False)  # 诊断后可再追问细化
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    attempt: Mapped[Attempt] = relationship()
    candidates: Mapped[list["DiagnosisCandidate"]] = relationship(back_populates="session")


class DiagnosisCandidate(Base):
    __tablename__ = "diagnosis_candidates"
    session_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"), primary_key=True)
    misconception_id: Mapped[str] = mapped_column(ForeignKey("misconceptions.id"), primary_key=True)
    rule_score: Mapped[float] = mapped_column(Numeric(4, 3), default=0)
    retrieval_score: Mapped[float] = mapped_column(Numeric(4, 3), default=0)  # W3
    rerank_score: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    final_rank: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    session: Mapped[DiagnosisSession] = relationship(back_populates="candidates")


class DiagnosisEvidence(Base):
    __tablename__ = "diagnosis_evidences"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"))
    evidence_type: Mapped[str] = mapped_column(_enum("evidence_type", "选项标注", "作答理由", "追问回答", "知识库切片"))
    source_ref: Mapped[str] = mapped_column(String(128), default="")
    content: Mapped[str] = mapped_column(Text)


class FollowupTurn(Base):
    __tablename__ = "followup_turns"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"))
    node_id: Mapped[str | None] = mapped_column(ForeignKey("followup_nodes.id"), nullable=True)
    verify_question_id: Mapped[str | None] = mapped_column(ForeignKey("questions.id"), nullable=True)
    presented_text: Mapped[str] = mapped_column(Text)
    student_answer: Mapped[str] = mapped_column(String(512))
    judge_method: Mapped[str] = mapped_column(_enum("judge_method", "option_signal", "keyword", "model", "verify", "skipped"))
    judge_result: Mapped[dict] = mapped_column(JSON, default=dict)
    turn_no: Mapped[int] = mapped_column(SmallInteger)  # 1..3
    skipped: Mapped[bool] = mapped_column(Boolean, default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


# ---------- 训练、复测、画像与运行组 ----------

class TrainingSession(Base):
    __tablename__ = "training_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    diagnosis_id: Mapped[str] = mapped_column(ForeignKey("diagnosis_sessions.id"), unique=True)
    source: Mapped[str] = mapped_column(_enum("training_source", "审核题池", "现场生成"), default="审核题池")
    status: Mapped[str] = mapped_column(_enum("training_status", "pending", "in_progress", "completed"), default="pending")
    score: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class TrainingSessionQuestion(Base):
    __tablename__ = "training_session_questions"
    training_session_id: Mapped[str] = mapped_column(ForeignKey("training_sessions.id"), primary_key=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), primary_key=True)
    sequence_no: Mapped[int] = mapped_column(SmallInteger, default=0)


class MasteryState(Base):
    __tablename__ = "mastery_states"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"), primary_key=True)
    category: Mapped[str | None] = mapped_column(
        _enum("misconception_category", "知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"),
        primary_key=True, nullable=True)
    state: Mapped[str] = mapped_column(_enum(
        "mastery_state", "未评估", "薄弱", "学习中", "初步掌握", "掌握", "稳定掌握"), default="未评估")
    reason: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


VALID_MASTERY_TRANSITIONS = {
    ("未评估", "薄弱"), ("薄弱", "学习中"), ("学习中", "初步掌握"), ("学习中", "薄弱"),
    ("初步掌握", "掌握"), ("初步掌握", "薄弱"), ("掌握", "稳定掌握"), ("掌握", "薄弱"),
}


class StudyProgress(Base):
    """学习进度（2026-09-09 学习→摸底 流程）：选完目标后在知识图谱里的「学一节→随堂摸底」。
    每域一行：随堂摸底 ≥60% 通过即 state='已达标'（记录最优分数）。
    与 MasteryState 解耦——摸底前(尚未产出薄弱画像)也能独立记录「学过」，图谱节点据此显示已达标；
    若该域已有对应薄弱错因行，判分通过时会同步触发 mastery.material_passed（薄弱→学习中）。
    """
    __tablename__ = "study_progress"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"), primary_key=True)
    state: Mapped[str] = mapped_column(_enum("study_state", "未学", "已达标"), default="未学")
    best_score: Mapped[float] = mapped_column(Numeric(4, 3), default=0)
    quiz_total: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class RetestSchedule(Base):
    """艾宾浩斯抗遗忘长时记忆复测排期表 (ADR-Retest-01)
    stage: 1 (24h/1天), 2 (72h/3天), 3 (168h/7天), 4 (长时稳定掌握)
    status: 'pending', 'passed', 'failed', 'mastered'
    """
    __tablename__ = "retest_schedules"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    domain_id: Mapped[str] = mapped_column(ForeignKey("diagnostic_domains.id"))
    misconception_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confusion_pair_id: Mapped[str | None] = mapped_column(ForeignKey("confusion_pairs.id"), nullable=True)
    source_attempt_id: Mapped[str | None] = mapped_column(ForeignKey("attempts.id"), nullable=True)
    stage: Mapped[int] = mapped_column(SmallInteger, default=1)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    status: Mapped[str] = mapped_column(
        _enum("retest_schedule_status", "pending", "passed", "failed", "mastered"),
        default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)



class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    task_type: Mapped[str] = mapped_column(_enum("model_task", "rerank", "followup_judge", "explain", "variant_draft"))
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(64))
    prompt_version: Mapped[str] = mapped_column(String(32), default="v0")
    input_hash: Mapped[str] = mapped_column(String(64), default="")
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    schema_valid: Mapped[bool] = mapped_column(Boolean, default=True)
    latency_ms: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(128))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def audit(db, actor: str, action: str, target: str, **detail):
    db.add(AuditLog(actor=actor, action=action, target=target, detail=detail))


# ---------- 内容资产组：外部语料导入（题库原文 / 大纲树，隔离于诊断业务表） ----------

class TikuPaper(Base):
    """题库卷元信息（corpus/course-materials 导入，审校前不入 questions 业务表）。"""
    __tablename__ = "tiku_papers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    paper_no: Mapped[str] = mapped_column(String(8), unique=True)  # "01"/"02"/"03"
    file: Mapped[str] = mapped_column(String(256), default="")
    total: Mapped[int] = mapped_column(default=0)
    count_a1: Mapped[int] = mapped_column(default=0)  # 题面题型 A1
    count_a2: Mapped[int] = mapped_column(default=0)  # 答案区段 A2（A1 变体）
    count_b1: Mapped[int] = mapped_column(default=0)
    answer_count: Mapped[int] = mapped_column(default=0)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)  # 解析器统计原样留存
    review_status: Mapped[str] = mapped_column(
        _enum("asset_status", "draft", "in_review", "published", "deprecated"), default="draft")


class TikuQuestion(Base):
    """题库题目原文（A1 单选 / A2 病例单选 / B1 配伍）。

    错因/干扰项/知识点标注留空，待药理顾问审校；chapter_ref 待启发式章节映射。
    """
    __tablename__ = "tiku_questions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    paper_no: Mapped[str] = mapped_column(String(8), index=True)
    qid: Mapped[int] = mapped_column(SmallInteger)  # 卷内题号
    type: Mapped[str] = mapped_column(_enum("tiku_type", "A1", "A2", "B1"))
    stem: Mapped[str] = mapped_column(Text)
    options: Mapped[list] = mapped_column(JSON)  # [{"key","text"}]
    answer: Mapped[str] = mapped_column(String(8))
    ans_section_type: Mapped[str] = mapped_column(String(16), default="")  # 答案区所属题型段
    chapter_ref: Mapped[str] = mapped_column(String(128), default="")  # 启发式章节映射占位
    kp_ref: Mapped[str] = mapped_column(String(128), default="")       # 知识点映射占位
    review_status: Mapped[str] = mapped_column(
        _enum("asset_status", "draft", "in_review", "published", "deprecated"), default="draft")
    # 内容化字段（MVP 内容补全 2026-09-03）：published = 题目经 AI 自审通过，可进闭环。
    # reset-demo 会 drop_all→create_all 重建表，故这些列必须同时体现在模型与 db.migrate 中。
    analysis: Mapped[str] = mapped_column(Text, default="")           # AI 解析（锚定教材/卷内考点）
    cognitive_level: Mapped[str] = mapped_column(String(8), default="")   # 识记/理解/应用/分析（规则初标+复核）
    difficulty: Mapped[str] = mapped_column(String(4), default="")        # 易/中/难
    source_ref: Mapped[str] = mapped_column(String(256), default="")      # 来源：题库卷号 Q编号 + 教材锚点
    __table_args__ = (UniqueConstraint("paper_no", "qid", name="uq_tiku_paper_qid"),)


class SyllabusChapter(Base):
    """教学大纲章节树（31 章结构化导入；节/知识点/实验为嵌套只读资产，JSON 存储）。

    hours_practice = 挂在该章行上的实践学时（实验 1–8）；实验 9/10 为独立实践课，
    存于 syllabus_experiments。章节 25 + 独立实验 7 = 全部实验 32 学时。
    """
    __tablename__ = "syllabus_chapters"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    book_chapter_no: Mapped[int] = mapped_column(SmallInteger, unique=True)  # 教材章号
    title: Mapped[str] = mapped_column(String(128))
    teach_seqs: Mapped[list] = mapped_column(JSON, default=list)   # 授课序次数组
    hours_theory: Mapped[int] = mapped_column(SmallInteger, default=0)
    hours_practice: Mapped[int] = mapped_column(SmallInteger, default=0)
    objectives: Mapped[dict] = mapped_column(JSON, default=dict)   # {master,familiar,understand}
    key_points: Mapped[list] = mapped_column(JSON, default=list)
    difficulties: Mapped[list] = mapped_column(JSON, default=list)
    sections: Mapped[list] = mapped_column(JSON, default=list)     # [{title, points[]}]
    experiments: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[list] = mapped_column(JSON, default=list)
    review_status: Mapped[str] = mapped_column(
        _enum("asset_status", "draft", "in_review", "published", "deprecated"), default="draft")


class SyllabusExperiment(Base):
    """教学大纲实验明细（10 个实验，共 32 学时；实验 9/10 为独立实践课，不挂章节）。"""
    __tablename__ = "syllabus_experiments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    seq_no: Mapped[int] = mapped_column(SmallInteger, unique=True)  # 1..10
    name: Mapped[str] = mapped_column(String(128))
    hours: Mapped[int] = mapped_column(SmallInteger, default=3)
    desc: Mapped[list] = mapped_column(JSON, default=list)
    review_status: Mapped[str] = mapped_column(
        _enum("asset_status", "draft", "in_review", "published", "deprecated"), default="draft")
