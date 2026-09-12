"""诊断引擎（v1.1 §5）：五级漏斗 + 断环追问状态机。

W1 简化：引擎在请求内同步执行（Mock 模型零延迟）；W2 换真实模型时改为
APScheduler 领取（SKIP LOCKED）+ 逐步落库，引擎接口不变。
追问判定优先级：option_signal（精确）> keyword > model 三分类。
"""
import re
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..llm.provider import get_provider
from ..misconceptions.service import route_intervention
from ..models import (
    Attempt, ChainNode, ConfusionPair, DiagnosisCandidate, DiagnosisEvidence,
    DiagnosisSession, DiagnosticDomain, FollowupTurn, FollowupNode, Misconception,
    MisconceptionFollowup, Question, QuestionEvidence, TrainingSession,
    TrainingSessionQuestion, audit,
)
from ..mastery import engine as mastery
MAX_FOLLOWUP_ROUNDS = 3
SUFFICIENCY_MARGIN = 0.2
HIGH_SCORE = 0.6


def start_session(db: Session, attempt: Attempt) -> DiagnosisSession:
    """作答落库后启动会话并跑完 ①②③④ 级；证据不足停在 followup_required。"""
    question = db.get(Question, attempt.question_id)
    session = DiagnosisSession(attempt_id=attempt.id, state="submitted",
                               chain_focus=(question.chain_levels or [None])[0])
    db.add(session)
    db.flush()
    audit(db, "system", "diagnosis.state", session.id, to="submitted")
    _collect_evidence(db, session, attempt, question)
    _filter_candidates(db, session, attempt, question)
    provider = get_provider()
    t0 = time_ms()
    ranked = provider.rerank([{"misconception_id": c.misconception_id, "rule_score": float(c.rule_score),
                               "retrieval_score": float(c.retrieval_score)} for c in session.candidates])
    provider.log_run("rerank", {"session": session.id, "ranked": ranked},
                     time_ms() - t0 or 1, db)
    for c in session.candidates:
        for r in ranked:
            if r["misconception_id"] == c.misconception_id:
                c.rerank_score, c.final_rank = r["rerank_score"], r["final_rank"]
    session.state = "candidates_retrieved"
    audit(db, "system", "diagnosis.state", session.id, to="candidates_retrieved")
    _sufficiency(db, session)
    db.commit()
    return session


# 章级通用错因四分类（与 seed.add_chapter_misconceptions.TEMPLATES 对应）。
# 题库物化题无 distractor_signals 标注，答错时按题干规则信号做"一级分类通用归因"，
# 证据等级=低，可追问细化（产品决策：通用归因 + 低证据 + 可细化，不捏造具体错点）。
GENERIC_CATS = ["审题与应用失误", "机制理解不足", "知识遗忘", "概念混淆"]
# 归因优先级：审题 > 机制 > 知识 > 概念混淆（兜底）
_PICK_ORDER = ["审题与应用失误", "机制理解不足", "知识遗忘", "概念混淆"]
_REVERSE = re.compile(r"不属于|除外|错误的?是|不是|不宜|禁用|慎用|禁忌|避免")
_MECH = re.compile(r"机制|原理|为什么|由于|通过|阻断|抑制|激动|导致|作用方式|怎样")
_RECALL = re.compile(r"属于|分类|首选|主要|特点|代表药|包括|哪些|是什么")


def _pick_generic_mis(db: Session, question: Question) -> Misconception | None:
    """按题干规则信号在章级四分类里挑一条通用错因。"""
    mis_list = db.execute(select(Misconception).where(
        Misconception.domain_id == question.domain_id,
        Misconception.status == "published",
        Misconception.category.in_(GENERIC_CATS))).scalars().all()
    if not mis_list:
        return None
    by_cat = {m.category: m for m in mis_list}
    stem = question.stem or ""
    for cat in _PICK_ORDER:
        if cat not in by_cat:
            continue
        if cat == "审题与应用失误" and _REVERSE.search(stem):
            return by_cat[cat]
        if cat == "机制理解不足" and _MECH.search(stem):
            return by_cat[cat]
        if cat == "知识遗忘" and _RECALL.search(stem):
            return by_cat[cat]
    # 都没命中 → 兜底概念混淆
    return by_cat.get("概念混淆") or mis_list[0]


def _attribute_tiku_model(db: Session, attempt: Attempt, question: Question) -> tuple:
    """题库题真模型归因：题干+作答理由+所选/正确答案 → 受控四分类（external_api 模式）。

    - external_api：调 provider.attribute_misconception 得 (category, evidence_level, rationale)，
      映射到章级同域同类别错因；调用失败/无 key → 抛 ProviderError 由调用方降级。
    - 其余模式（mock）：直接走 _pick_generic_mis 正则兜底，保证确定性评测不回归。
    返回 (misconception|None, evidence_level, rationale_text)。
    """
    from ..config import settings
    from ..llm.provider import ProviderError, get_provider
    if settings.model_provider != "external_api":
        mis = _pick_generic_mis(db, question)
        return mis, "低", None
    provider = get_provider()
    options_text = "\n".join(f"{o.get('key')}. {o.get('text')}" for o in (question.options or []))
    domain_name = ""
    if question.domain_id:
        dom = db.get(DiagnosticDomain, question.domain_id)
        if dom:
            domain_name = dom.name
    try:
        res = provider.attribute_misconception(
            question_stem=question.stem or "", options_text=options_text,
            selected_option=attempt.selected_option or "", correct_answer=question.answer or "",
            student_rationale=attempt.rationale or "", domain_name=domain_name or "")
        cat = res.get("category") or "概念混淆"
        mis = db.execute(select(Misconception).where(
            Misconception.domain_id == question.domain_id,
            Misconception.category == cat,
            Misconception.status == "published")).scalars().first() \
            or _pick_generic_mis(db, question)
        return mis, res.get("evidence_level", "低"), res.get("rationale")
    except ProviderError:
        mis = _pick_generic_mis(db, question)
        return mis, "低", None


def start_session_tiku(db: Session, attempt: Attempt) -> DiagnosisSession | None:
    """题库物化题答错时的轻量诊断会话：通用四分类归因 + 低证据 + 可细化。

    不跑五级漏斗（无 distractor_signals，跑全漏斗会误导），直接出一级错因卡，
    让 练→诊断→训练→复测 在 723 道题库题上闭合。
    external_api 模式下用真模型按学生作答理由归因（评审意见③：可解释的"为什么错"）。
    """
    question = db.get(Question, attempt.question_id)
    chosen, evidence_level, rationale = _attribute_tiku_model(db, attempt, question)
    if not chosen:
        return None
    session = DiagnosisSession(
        attempt_id=attempt.id, state="diagnosed",
        chain_focus=(question.chain_levels or [None])[0],
        hypothesis_id=chosen.id, evidence_level=evidence_level, can_refine=True)
    db.add(session)
    db.flush()
    rationale_note = f"，依据学生作答理由归因：{rationale}" if rationale else ""
    db.add(DiagnosisEvidence(
        session_id=session.id, evidence_type="选项标注",
        source_ref=f"question:{question.id}",
        content=f"学生选择 {attempt.selected_option}，正确答案为 {question.answer}"
                f"（通用四分类归因：{chosen.category}，证据等级{evidence_level}"
                f"{rationale_note}，可追问细化）"))
    # W3 RAG：题库题答错时按题干检索教材切片，补充"知识库切片"证据（讲解更贴近教材）
    for etype, ref, content in _rag_evidence(question, attempt):
        db.add(DiagnosisEvidence(session_id=session.id, evidence_type=etype, source_ref=ref, content=content))
    # 注意：通用四分类归因不写错因级掌握度薄弱——那是种子域「真错因」才有的。
    # 章级薄弱由 router.practice_failed 负责；本会话仅用于出卡片 + 接训练，
    # 避免同一道错题在 domain 内既建章级薄弱又建错因级薄弱导致双重计数。
    audit(db, "system", "diagnosis.state", session.id, to="diagnosed",
          misconception=chosen.id, evidence_level=evidence_level, note="tiku_generic")
    db.commit()
    return session


def _collect_evidence(db: Session, session: DiagnosisSession, attempt: Attempt, question: Question):
    evidences = [
        ("选项标注", f"question:{question.id}", f"学生选择 {attempt.selected_option}，正确答案为 {question.answer}"),
    ]
    if attempt.rationale:
        evidences.append(("作答理由", f"attempt:{attempt.id}", attempt.rationale))
    for chunk in db.execute(select(QuestionEvidence).where(
            QuestionEvidence.question_id == question.id)).scalars():
        evidences.append(("知识库切片", chunk.evidence_chunk_id, chunk.content_text))
    # W3 RAG：按题干+作答动态检索教材切片，作为"知识库切片"证据并入证据链
    for etype, ref, content in _rag_evidence(question, attempt):
        evidences.append((etype, ref, content))
    for etype, ref, content in evidences:
        db.add(DiagnosisEvidence(session_id=session.id, evidence_type=etype, source_ref=ref, content=content))
    session.state = "evidence_collected"


def _rag_query(question: Question, attempt: Attempt | None = None) -> str:
    """构造检索 query：题干 + 选项文本(去答案标注) 的关键字集合，太长则截题干。"""
    parts = [question.stem or ""]
    opts = []
    for o in (question.options or []):
        t = o.get("text", "")
        if t and len(t) <= 60:  # 长选项多为临床情境，不参与检索；取短术语型选项
            opts.append(t)
    parts.extend(opts)
    q = " ".join(parts)
    return q[:400] if q else ""


def _rag_evidence(question: Question, attempt: Attempt | None = None) -> list[tuple[str, str, str]]:
    """对题库物化题/种子题做教材检索，返回 [(etype, ref, content)] 证据元组列表。

    仅在配置 rag_enabled 且语料存在时产出；检索失败/无命中返回 []（不阻塞诊断）。
    source_ref 形如 rag:教材p<PDF页>。
    """
    from ..config import settings
    if not getattr(settings, "rag_enabled", True):
        return []
    query = _rag_query(question, attempt)
    if not query:
        return []
    try:
        from ..rag import retrieve_top_k
        hits = retrieve_top_k(query, k=getattr(settings, "rag_top_k", 2))
    except Exception as e:  # 检索异常绝不影响诊断主链路
        import logging as _l
        _l.getLogger("yaozhi.rag").warning("RAG 检索失败，跳过证据：%s", e)
        return []
    out = []
    for h in hits:
        src = f"rag:教材p{h.page}"
        if h.chapter:
            src += f"·{h.chapter}"
        # 截取命中页正文做证据卡内容；附章节/页码定位便于复核
        body = h.text
        note = f"（教材第{h.book_page}页定位）" if h.book_page else ""
        out.append(("知识库切片", src, f"{body}{note}"))
    return out


def _rag_evidence_for(query: str, k: int = 1) -> list[tuple[str, str, str]]:
    """追问环节的教材检索：按追问节点题干(可拼错因名)检索教材，返回证据元组。

    与 _rag_evidence 的区别在 query 来源：这里检索的是"追问正在钻探的具体子概念/
    错因"，而非整道错题，故命中的教材段落更聚焦（如强心苷"中毒机制"而非"用途"）。
    k 默认 1，保持追问证据链精简。语料缺失/失败 → []（不阻塞判读）。
    """
    from ..config import settings
    if not getattr(settings, "rag_enabled", True) or not query:
        return []
    try:
        from ..rag import retrieve_top_k
        hits = retrieve_top_k(query, k=k or 1)
    except Exception as e:
        import logging as _l
        _l.getLogger("yaozhi.rag").warning("追问 RAG 检索失败，跳过证据：%s", e)
        return []
    out = []
    for h in hits:
        src = f"rag:教材p{h.page}"
        if h.chapter:
            src += f"·{h.chapter}"
        body = h.text
        note = f"（教材第{h.book_page}页定位）" if h.book_page else ""
        out.append(("知识库切片", src, f"{body}{note}"))
    return out


def _mis_by_code(db: Session, code: str) -> Misconception | None:
    """种子/标注里引用错因一律用 code（MIS-…），库内主键是 uuid，这里做解析。"""
    if code is None:
        return None
    if code.startswith("MIS-"):
        return db.execute(select(Misconception).where(Misconception.code == code)).scalar_one_or_none()
    return db.get(Misconception, code)


def _filter_candidates(db: Session, session: DiagnosisSession, attempt: Attempt, question: Question):
    """② 规则过滤：干扰项预标注为主信号；无命中时回退该域全部错因（权重压低）。"""
    signal = (question.distractor_signals or {}).get(attempt.selected_option)
    domain_mis = db.execute(select(Misconception).where(
        Misconception.domain_id == question.domain_id, Misconception.status == "published")).scalars().all()
    if signal and signal.get("misconception"):
        primary = _mis_by_code(db, signal["misconception"])
        rows = [(primary.id, float(signal.get("weight", 0.8)))] if primary else []
        if primary:
            for m in domain_mis:  # 同类别近似候选，供追问区分
                if m.id != primary.id and m.category == primary.category:
                    rows.append((m.id, round(float(signal.get("weight", 0.8)) - 0.25, 3)))
    else:
        rows = [(m.id, 0.3) for m in domain_mis]
    seen = set()
    for mid, score in rows:
        if mid in seen or db.get(Misconception, mid) is None:
            continue
        seen.add(mid)
        db.add(DiagnosisCandidate(session_id=session.id, misconception_id=mid,
                                  rule_score=score, retrieval_score=0.0))
    db.flush()  # autoflush=False：关系加载前显式落库


def _sufficiency(db: Session, session: DiagnosisSession):
    """⑤ 充分性门禁：Top1 分数与候选间距决定出卡还是追问。
    出题人可在干扰项信号标注 needs_followup=true（干扰项只区分到类别级，
    需追问坐实具体错因），此时无论分差多少都进入追问。"""
    ranked = sorted(session.candidates, key=lambda c: (-float(c.rerank_score or 0)))
    if not ranked:  # 无候选：不强制归因，停在 diagnosed-前置或直接低证据出卡
        session.state = "diagnosed"
        session.evidence_level = "低"
        audit(db, "system", "diagnosis.state", session.id, to="diagnosed", evidence_level="低", note="无候选")
        db.commit()
        return
    top, second = ranked[0], (ranked[1] if len(ranked) > 1 else None)
    margin = (float(top.rerank_score) - float(second.rerank_score)) if second else 1.0
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    signal = (question.distractor_signals or {}).get(attempt.selected_option) or {}
    if float(top.rerank_score) >= HIGH_SCORE and margin >= SUFFICIENCY_MARGIN and not signal.get("needs_followup"):
        _diagnose(db, session, top.misconception_id, "中")
    else:
        # 证据不足：仍直接出卡（低证据 + 候选错因），追问降级为卡上的可选细化（产品决策 2026-08-30）
        session.can_refine = True
        _diagnose(db, session, top.misconception_id, "低")
        audit(db, "system", "diagnosis.can_refine", session.id, hypothesis=top.misconception_id)


def _diagnose(db: Session, session: DiagnosisSession, misconception_id: str, level: str):
    session.hypothesis_id = misconception_id
    session.evidence_level = level
    session.state = "diagnosed"
    audit(db, "system", "diagnosis.state", session.id, to="diagnosed",
          misconception=misconception_id, evidence_level=level)
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    mastery.transition(db, attempt.user_id, question.domain_id,
                       db.get(Misconception, misconception_id).category, "diagnosed")
    route_intervention(db, session)
    db.commit()  # 显式提交：mastery 幂等分支不 commit，缺此行会导致升级被回滚
    return session


# ---------- 追问（FollowupRunner） ----------

def current_followup(db: Session, session: DiagnosisSession) -> FollowupNode | None:
    if not (session.state == "followup_required" or
            (session.state == "diagnosed" and session.can_refine)):
        return None
    node_ids = db.execute(select(MisconceptionFollowup.followup_node_id).where(
        MisconceptionFollowup.misconception_id == session.hypothesis_id)).scalars().all()
    used = set(db.execute(select(FollowupTurn.node_id).where(
        FollowupTurn.session_id == session.id)).scalars())
    if node_ids:
        nodes = [db.get(FollowupNode, n) for n in node_ids if n not in used]
        nodes = [n for n in nodes if n]
        nodes.sort(key=lambda n: n.code)  # 确定性：追问顺序固定，保证评测可回放
        if nodes:
            return {"kind": "node", "node": nodes[0]}
    fallback = _fallback_node(db, session)
    if fallback:
        return {"kind": "node", "node": fallback}
    # 对话节点用尽/不存在 → 跨题验证：出一道标注了主要候选错因的定向题（demo 机制）
    return _verify_question(db, session)


def _fallback_node(db: Session, session: DiagnosisSession):
    if not session.chain_focus:
        return None
    return db.execute(select(FollowupNode).where(
        FollowupNode.domain_id == _domain_of(db, session),
        FollowupNode.chain_level == session.chain_focus,
        FollowupNode.review_status == "published")).scalars().first()


def _verify_question(db: Session, session: DiagnosisSession):
    """跨题验证（demo 机制）：按主要候选错因选一道学生未做过的同域题。
    答对 → 确认主要假设（区别于知识遗忘：遗忘者此题也会错）；答错 → 按干扰项信号切换假设。"""
    from ..models import Attempt, Question
    attempt = db.get(Attempt, session.attempt_id)
    mis = db.get(Misconception, session.hypothesis_id)
    answered = set(db.execute(select(Attempt.question_id).where(
        Attempt.user_id == attempt.user_id)).scalars())
    answered.add(attempt.question_id)
    pool = db.execute(select(Question).where(
        Question.domain_id == mis.domain_id, Question.usage == "diagnostic",
        Question.review_status == "published")).scalars().all()
    cands = [q for q in pool
             if q.id not in answered
             and mis.code in [(s or {}).get("misconception") for s in (q.distractor_signals or {}).values()]]
    if not cands:  # 无精确标注题时兜底：任何未做过的同域诊断题（同域新题即可作跨题验证）
        cands = [q for q in pool if q.id not in answered]
    if not cands:
        return None
    return {"kind": "verify", "question": cands[0]}


def _domain_of(db: Session, session: DiagnosisSession) -> str:
    attempt = db.get(Attempt, session.attempt_id)
    return db.get(Question, attempt.question_id).domain_id


def answer_followup(db: Session, session: DiagnosisSession, payload: dict) -> DiagnosisSession:
    """payload: {"option_key": "A"} 或 {"text": "…"}；payload.get("skip") 为跳过。
    追问为诊断后的可选细化：state=diagnosed 且 can_refine 时可用（产品决策 2026-08-30）。"""
    refining = session.state == "diagnosed" and session.can_refine
    if session.state != "followup_required" and not refining:
        raise ValueError(f"会话状态 {session.state} 不接受追问回答")
    fu = current_followup(db, session)
    if fu is None:  # 无可用追问/验证题 → 维持当前归因，结束细化
        session.can_refine = False
        db.commit()
        return session
    if fu["kind"] == "verify":
        return _answer_verify(db, session, fu["question"], payload)

    node = fu["node"]
    session.followup_count += 1
    turn_no = session.followup_count
    if payload.get("skip"):
        db.add(FollowupTurn(session_id=session.id, node_id=node.id, presented_text=node.question_text,
                            student_answer="", judge_method="skipped", turn_no=turn_no, skipped=True))
        audit(db, "student", "diagnosis.followup_skipped", session.id, turn_no=turn_no)
        session.can_refine = False
        db.commit()
        return session

    if payload.get("option_key") and node.option_signals:
        sig = node.option_signals.get(payload["option_key"])
        method, result = "option_signal", {"signal": sig}
        supported = sig.get("supports") if sig else None
        if sig:
            session.chain_focus = max(1, min(6, (session.chain_focus or 3) + int(sig.get("shift", 0))))
    else:
        provider = get_provider()
        result = provider.judge_open_answer(payload.get("text", ""), node.open_judge or {})
        method = "keyword"
        supported = result.get("supports") if result.get("accepted") else None
        db_text = payload.get("text", "")

    supports = _mis_by_code(db, supported).id if supported else None
    db.add(FollowupTurn(session_id=session.id, node_id=node.id,
                        presented_text=node.question_text,
                        student_answer=payload.get("option_key") or payload.get("text", ""),
                        judge_method=method, judge_result=result, turn_no=turn_no))
    audit(db, "student", "diagnosis.followup_answered", session.id, turn_no=turn_no, method=method)
    # W3 RAG·追问：按追问节点题干(+假设错因名)检索教材，补充本轮"知识库切片"证据，
    # 让钻探的子概念/错因有教材原文背书（如追问强心苷"中毒机制"→命中中毒章节而非用途章）。
    _hyp = db.get(Misconception, session.hypothesis_id) if session.hypothesis_id else None
    _q = (node.question_text or "").strip()
    if _hyp and _hyp.name:
        _q = f"{_q} {_hyp.name}".strip()
    for etype, ref, content in _rag_evidence_for(_q, k=1):
        db.add(DiagnosisEvidence(session_id=session.id, evidence_type=etype,
                                 source_ref=f"{ref}·追问{node.code}", content=content))

    if supports and supports == session.hypothesis_id:
        # 追问坐实原假设：证据链补全，升级为高并结束细化
        session.can_refine = False
        return _diagnose(db, session, session.hypothesis_id, "高")
    if supports and supports != session.hypothesis_id:
        # 追问指向另一错因：切换假设；轮次用尽则维持低证据并结束细化
        session.hypothesis_id = supports
        if turn_no >= MAX_FOLLOWUP_ROUNDS:
            session.can_refine = False
            db.commit()
            return _diagnose(db, session, supports, "低")
    # 未区分：轮次用尽 → 维持低证据，结束细化；否则继续追问
    if turn_no >= MAX_FOLLOWUP_ROUNDS:
        session.can_refine = False
        db.commit()
        return session
    db.commit()
    return session


def _answer_verify(db: Session, session: DiagnosisSession, question, payload: dict) -> DiagnosisSession:
    """跨题验证判分：答对 → 确认主要假设（升高）；答错 → 按该题干扰项信号切换/维持。"""
    import json as _json
    session.followup_count += 1
    turn_no = session.followup_count
    picked = payload.get("option_key") or ""
    correct = picked == question.answer
    db.add(FollowupTurn(session_id=session.id, node_id=None, verify_question_id=question.id,
                        presented_text=question.stem, student_answer=picked,
                        judge_method="verify", judge_result={"correct": correct}, turn_no=turn_no))
    audit(db, "student", "diagnosis.verify_answered", session.id, turn_no=turn_no, correct=correct)

    if correct:
        # 验证题答对：排除知识遗忘类解释，确认主要候选（概念混淆者的变式题往往做对）
        session.can_refine = False
        db.commit()
        return _diagnose(db, session, session.hypothesis_id, "高")
    # 答错：按该题干扰项信号切换假设；无信号或轮尽 → 维持低证据
    sig = (question.distractor_signals or {}).get(picked) or {}
    alt = _mis_by_code(db, sig.get("misconception")) if sig.get("misconception") else None
    if alt and alt.id != session.hypothesis_id:
        session.hypothesis_id = alt.id
    session.can_refine = False
    db.commit()
    return _diagnose(db, session, session.hypothesis_id, "低")


def time_ms() -> int:
    import time as _t
    return int(_t.time() * 1000)


def pick_training_questions(db: Session, question: Question, misconception: Misconception) -> list[Question]:
    """按错因×干预路由取训练题（v1.1 §5.3）。
    记忆卡：不推刷题，训练载荷只有卡片（返回空列表）。
    混淆对变式：优先易混药对变式。
    情境拆解：优先情境题。
    兜底机制：若本域题目少于 3 道（如单题章节），自动从全局已发布题库补足 3 道，保证绝不出现空题目。
    """
    mode = misconception.remediation_type
    if mode == "记忆卡":
        return []

    pool = db.execute(select(Question).where(
        Question.domain_id == question.domain_id,
        Question.usage.in_(["training", "diagnostic"]),
        Question.review_status == "published",
        Question.id != question.id)).scalars().all()

    sig = [q for q in pool
           if misconception.code in [(s or {}).get("misconception") for s in (q.distractor_signals or {}).values()]]
    if mode == "混淆对变式":
        pairs = db.execute(select(ConfusionPair).where(
            ConfusionPair.domain_id == question.domain_id)).scalars().all()
        drugs = {d for p in pairs for d in (p.drug_a, p.drug_b) if d}
        conf = [q for q in pool
                if any(d in (q.stem or "") for d in drugs)] if drugs else []
        ordered = conf + [q for q in sig if q not in conf]
    elif mode == "情境拆解":
        ctx = [q for q in pool if q.condition_type != "normal"]
        ordered = ([q for q in sig if q in ctx]
                   + [q for q in ctx if q not in sig]
                   + [q for q in sig if q not in ctx])
    else:
        ordered = sig

    rest = [q for q in pool if q not in ordered]
    picked = (ordered + rest)[:3]

    # 兜底保障：若本域内少于 3 道题（如只有单题的章节），优先从全库已发布题池补齐，保证学生必有题练
    if len(picked) < 3:
        existing_ids = {p.id for p in picked} | {question.id}
        fallbacks = db.execute(select(Question).where(
            Question.usage.in_(["training", "diagnostic"]),
            Question.review_status == "published",
            Question.id.notin_(existing_ids)
        ).limit(10)).scalars().all()
        for fq in fallbacks:
            if len(picked) >= 3:
                break
            picked.append(fq)

    # 终极兜底：若全库仍不足 3 道，允许放入本题原题进行再次巩固
    if len(picked) < 3 and question.id not in {p.id for p in picked}:
        picked.append(question)

    return picked[:3]


def start_training(db: Session, session: DiagnosisSession):
    """按错因×干预路由取训练题（v1.1 §5.3）。"""
    if session.state != "diagnosed":
        raise ValueError(f"会话状态 {session.state} 不能开始训练")
    misconception = db.get(Misconception, session.hypothesis_id)
    attempt = db.get(Attempt, session.attempt_id)
    question = db.get(Question, attempt.question_id)
    mode = misconception.remediation_type
    picked = pick_training_questions(db, question, misconception)
    ts = TrainingSession(diagnosis_id=session.id, source="审核题池",
                         status="in_progress" if (picked or mode == "记忆卡") else "pending")
    db.add(ts)
    db.flush()
    for i, q in enumerate(picked):
        db.add(TrainingSessionQuestion(training_session_id=ts.id, question_id=q.id, sequence_no=i))
    session.state = "training"
    audit(db, "system", "diagnosis.state", session.id, to="training", training_id=ts.id)
    # 题库物化题（无干扰项标注）只维护章级掌握度（category=None）；
    # 种子域诊断题维护错因级掌握度，让「今日待办」任务状态与闭环同步更新。
    mastery_category = misconception.category if question.distractor_signals else None
    mastery.transition(db, attempt.user_id, question.domain_id, mastery_category, "training_started")
    db.commit()
    return ts
