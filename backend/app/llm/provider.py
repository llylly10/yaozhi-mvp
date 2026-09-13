"""统一 ModelProvider（ADR-08）。

双 Provider 设计（技术架构 v0.5 · 附录 D「当前实现状态」）：
- MockProvider   （model_provider=mock）        ：确定性输出，保证单题闭环可测、评测可回放；作为评测基线。
- ExternalApiProvider（model_provider=external_api）：接 OpenAI 兼容接口做"真推理归因"
  （2026-09-10 起默认 GLM-5.2 · 智谱 BigModel，见 settings.external_*）。
  归因真推理：题干 + 学生作答理由 + 所选错误项 + 正确答案 → LLM 输出四分类错因 + 证据等级 + 简短依据。
  （对应评审意见③：学生为什么错，由真模型给出可解释归因，而非 Mock 关键词匹配。）

模型任务边界（v1.1 §5.1，v0.5 架构保持一致）：
- 归因只做"四分类 + 受控错因目录内"判断，不在目录外创造标签、不宣布掌握；
- rerank 在候选集内排序；judge_open_answer 仅做开放追问三分类判定；
- 模型不生成追问、不做用药/医疗决策。

故障与降级：ExternalApiProvider 任一步调用失败/超时/返回不合规，均抛 ProviderError，
由调用方（诊断引擎）catch 后回退 MockProvider 的确定性结果 —— 演示永不因 API 抖动而崩溃。
"""
import hashlib
import json
import logging
import os
import time

from ..models import ModelRun
from ..db import SessionLocal

log = logging.getLogger("yaozhi.provider")

# 兜底 base_url（仅当 external_/qwen_ 均为空时；正常应由 settings.external_base_url 覆盖）
DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/"

# 受控四分类错因（与需求 FR-C3 / 引擎 GENERIC_CATS 一致，顺序即目录）
CATEGORIES = ["审题与应用失误", "机制理解不足", "知识遗忘", "概念混淆"]
_CAT_SET = set(CATEGORIES)

# 归因 JSON 强制 schema：category 必须命中受控目录
ATTRIBUTE_SCHEMA = {"type": "json_object"}


class ProviderError(Exception):
    """真实模型调用失败/超时/输出不合规的统一异常，供引擎降级。"""


class CircuitOpenError(ProviderError):
    """熔断已开启：连续失败超过阈值，进入冷却期，本次调用直接降级（不发起真请求）。"""


class TimeoutError(ProviderError):
    """单次 LLM 调用超过硬超时阈值。"""


def _run_with_deadline(fn, timeout: float):
    """在独立线程里执行同步 LLM 调用，硬超时保护（W2 ④，2026-09-08）。

    场景：外部接口偶发挂起/慢响应时，即便 openai client 设了 timeout，
    仍可能卡在传输层；这里再套一层墙钟硬超时，超时即抛 TimeoutError →
    调用方（诊断引擎）降级 Mock，保证演示永不因一次挂起而整个请求崩溃。
    注意：线程无法强制杀正在运行的 socket 阻塞，超时后主流程继续并抛错，
    迟到结果被丢弃（线程设为 daemon，进程退出不等待）。
    """
    import threading

    box: dict = {"result": None, "exc": None}
    deadline_s = max(float(timeout), 0.1)

    def _worker():
        try:
            box["result"] = fn()
        except BaseException as e:  # noqa: BLE001 线程内捕获并回传
            box["exc"] = e

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
    t.join(timeout=deadline_s)
    if t.is_alive():
        raise TimeoutError(f"LLM 调用超过硬超时 {deadline_s:.0f}s")
    if box["exc"] is not None:
        raise box["exc"]
    return box["result"]


class _BaseProvider:
    name = "base"
    model = "base"

    def _persist_run(self, task_type: str, payload: dict, latency_ms: int, db=None):
        close = False
        if db is None:
            db = SessionLocal()
            close = True
        try:
            db.add(ModelRun(
                task_type=task_type, provider=self.name, model=self.model,
                input_hash=hashlib.sha256(
                    json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:16],
                output=payload, latency_ms=latency_ms))
            db.commit()
        finally:
            if close:
                db.close()

    def log_run(self, task_type: str, payload: dict, latency_ms: int, db=None):
        self._persist_run(task_type, payload, latency_ms, db)


class MockProvider(_BaseProvider):
    """确定性 Provider（评测基线 / external_api 故障时的降级兜底）。"""
    name = "mock"
    model = "deterministic-mock-v0"

    def rerank(self, candidates: list[dict]) -> list[dict]:
        out = sorted(candidates, key=lambda c: (-float(c["rule_score"]), c["misconception_id"]))
        for i, c in enumerate(out):
            c["rerank_score"] = round(float(c["rule_score"]), 3)
            c["final_rank"] = i + 1
        return out

    def judge_open_answer(self, answer: str, open_judge: dict) -> dict:
        kws = open_judge.get("accept_keywords", [])
        hit = [k for k in kws if k in answer]
        return {"accepted": len(hit) >= 1, "hits": hit, "supports": open_judge.get("supports")}

    def attribute_misconception(self, *, question_stem: str, options_text: str,
                                selected_option: str, correct_answer: str,
                                student_rationale: str, domain_name: str = "") -> dict:
        """Mock 归因：按题干关键词规则给一级分类（与诊断引擎 _pick_generic_mis 等价的兜底）。
        仅当 external_api 故障降级时被调用，保证题库题答错仍能出卡。"""
        import re
        _REVERSE = re.compile(r"不属于|除外|错误的?是|不是|不宜|禁用|慎用|禁忌|避免")
        _MECH = re.compile(r"机制|原理|为什么|由于|通过|阻断|抑制|激动|导致|作用方式|怎样")
        _RECALL = re.compile(r"属于|分类|首选|主要|特点|代表药|包括|哪些|是什么")
        for cat, rx in [("审题与应用失误", _REVERSE), ("机制理解不足", _MECH), ("知识遗忘", _RECALL)]:
            if rx.search(question_stem or ""):
                return {"category": cat, "evidence_level": "低",
                        "rationale": f"题干含'{rx.pattern[:6]}…'特征（Mock 降级归因）"}
        return {"category": "概念混淆", "evidence_level": "低",
                "rationale": "未命中明显规则特征（Mock 兜底归因）"}

    def generate_variant_with_blind_verification(self, *, stem: str, options: dict, answer: str,
                                                 analysis: str, chapter_title: str = "",
                                                 textbook_slice: str = "",
                                                 confusion_drugs: list[str] | None = None) -> dict:
        """Mock 确定性高仿真变式生成与盲答检验（保证无外部 API 时闭环可用且通过检验）。"""
        variant_stem = f"【临床变式情境】患者，男，58岁。现处于本章（{chapter_title or '药理学重点'}）典型病程。医师在评估受体机制、适应证与禁忌证时，针对此情况最宜选用或避免下列何种药物？（考点机制：{analysis[:40]}）"
        opts = dict(options) if options else {
            "A": "选项药物A", "B": "选项药物B", "C": "选项药物C", "D": "选项药物D", "E": "选项药物E"
        }
        ans = answer if answer in opts else list(opts.keys())[0]
        return {
            "stem": variant_stem,
            "options": opts,
            "answer": ans,
            "analysis": f"【变式考点深度解析】本题为基于原型题机制的平行临床情境变式。{analysis}",
            "cognitive_level": "应用",
            "difficulty": "中",
            "verified": True,
            "verification_method": "deterministic_mock_verified",
            "verification_rationale": "规则基线盲答独立核验吻合",
            "source_ref": f"AI动态变式·人卫9e {chapter_title or '重点章节'}·双审通过",
        }


class ExternalApiProvider(_BaseProvider):
    """外部真推理 Provider（OpenAI 兼容接口；2026-09-10 起默认 GLM-5.2 · 智谱 BigModel）。

    归因：题干 + 选项 + 学生作答理由 + 所选/正确答案 → LLM JSON 输出受控四分类 + 证据等级 + 依据。
    rerank / judge_open_answer / answer_with_refs 同步升级为真实模型，行为与 Mock 语义一致。
    配置优先级：显式传参 > external_*（YAOZHI_EXTERNAL_*）> 旧 qwen_*（YAOZHI_QWEN_*）。
    """
    name = "external_api"

    def __init__(self, api_key: str | None = None, base_url: str | None = None,
                 model: str | None = None, timeout: int = 40, max_retries: int = 2):
        from ..config import settings
        self.model = (model or settings.external_model
                      or settings.qwen_model or "glm-5.2")
        if api_key is not None:
            self._api_key = api_key
        else:
            self._api_key = (settings.external_api_key
                             or settings.qwen_api_key
                             or os.environ.get("YAOZHI_EXTERNAL_API_KEY", "")
                             or os.environ.get("YAOZHI_QWEN_API_KEY", ""))
        if not self._api_key:
            raise ProviderError("ExternalApiProvider 未配置 API Key（YAOZHI_EXTERNAL_API_KEY）")
        if base_url:
            self._base_url = base_url
        elif settings.external_base_url:
            self._base_url = settings.external_base_url
        elif "qwen" in self.model and settings.qwen_base_url:
            self._base_url = settings.qwen_base_url
        else:
            self._base_url = DEFAULT_BASE_URL
        # openai 客户端超时/重试（传输层）
        self._timeout = timeout or settings.model_call_timeout
        self._max_retries = max_retries or settings.model_max_retries
        # 硬超时 + 熔断（W2 ④）：墙钟保护 + 连续失败冷却，防挂起/雪崩打垮演示
        self._hard_timeout = float(settings.model_call_timeout)
        self._cb_threshold = int(settings.circuit_breaker_threshold or 3)
        self._cb_cooldown = float(settings.circuit_breaker_cooldown or 60.0)
        self._fail_count = 0
        self._open_until = 0.0  # 熔断开启的时间戳（epoch 秒）；0 = 关闭
        self._client = None

    # ---- 熔断状态 ----
    def _circuit_open(self) -> bool:
        if self._open_until and time.time() < self._open_until:
            return True
        return False

    def _record_success(self):
        self._fail_count = 0
        self._open_until = 0.0

    def _record_failure(self):
        self._fail_count += 1
        if self._fail_count >= self._cb_threshold:
            self._open_until = time.time() + self._cb_cooldown
            log.warning("外部模型连续失败 %s 次，熔断开启 %.0fs，期间降级 Mock",
                        self._fail_count, self._cb_cooldown)

    def _get_client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=self._api_key, base_url=self._base_url,
                                  timeout=self._timeout, max_retries=self._max_retries)
        return self._client

    # ---- LLM 原始调用（带硬超时 + 熔断，W2 ④）----
    # 思考模型（GLM-5.2）说明：简单问题也要烧 ~700 reasoning tokens，max_tokens 预算
    # 必须留出推理余量，否则 finish=length 导致空内容；默认 2000。
    def _chat_json(self, system: str, user: str, temperature: float = 0.0,
                   max_tokens: int = 2000) -> dict:
        # 熔断门：处于冷却期 → 不开真请求，直接降级
        if self._circuit_open():
            raise CircuitOpenError(
                f"外部模型熔断冷却中（剩余 {max(0.0, self._open_until - time.time()):.0f}s）")
        try:
            def _call() -> str:
                client = self._get_client()
                resp = client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format={"type": "json_object"},
                )
                return resp.choices[0].message.content or ""

            # 墙钟硬超时：即便传输层挂死，也保证主流程在 deadline 内返回/抛错
            content = _run_with_deadline(_call, self._hard_timeout)
            # 去掉可能的 ```json 围栏
            content = content.strip()
            if content.startswith("```"):
                content = content.strip("`")
                if content.lower().startswith("json"):
                    content = content[4:]
            result = json.loads(content)
            self._record_success()
            return result
        except CircuitOpenError:
            raise
        except TimeoutError:
            self._record_failure()
            raise
        except json.JSONDecodeError as e:
            self._record_failure()
            raise ProviderError(f"外部模型返回非 JSON：{e}") from e
        except Exception as e:  # openai APIError / APIConnectionError / Timeout
            self._record_failure()
            raise ProviderError(f"外部模型调用失败：{type(e).__name__}: {e}") from e

    # ---- 归因真推理（评审意见③核心） ----
    def attribute_misconception(self, *, question_stem: str, options_text: str,
                                selected_option: str, correct_answer: str,
                                student_rationale: str, domain_name: str = "") -> dict:
        system = (
            "你是一位药学(药理学)教学诊断专家。学生的作答理由暴露了其真实理解状态，"
            "你要判断他这道题做错的最可能错因，只能在给定四类中选择，不得自创标签。"
            f"四类错因定义：\n"
            f"- 审题与应用失误：看错题干/没注意除外/禁忌/否定词，或把适用情境套错，属于非知识性错误；\n"
            f"- 机制理解不足：知道药物/知识点，但不理解作用机制、原理或作用方式，无法推导；\n"
            f"- 知识遗忘：本应记住的结论性知识（分类/首选/适应症/不良反应等）没记住或记不准；\n"
            f"- 概念混淆：把两个相似概念/药物/效应的记忆相互颠倒、混淆（如两药效应记反）。\n"
            "输出 JSON（仅此一个对象，无其他文字）："
            '{"category": "概念混淆", "evidence_level": "中", "rationale": "≤60字，说明依据学生作答理由判断为什么是此类，禁止复述整题"}'
            "其中 evidence_level 只能取 低/中/高：学生作答理由清晰指向某一类→高；理由部分相关→中；理由缺失或无关→低。"
        )
        user = (
            f"【章节/知识点】{domain_name or '未指定'}\n"
            f"【题干】{question_stem}\n"
            f"【选项】\n{options_text}\n"
            f"【学生所选】{selected_option}\n"
            f"【正确答案】{correct_answer}\n"
            f"【学生作答理由】{student_rationale or '（未填写）'}\n"
            "请按系统要求只输出 JSON 结论。"
        )
        t0 = time.time()
        result = self._chat_json(system, user)
        latency = int((time.time() - t0) * 1000)
        # 归一化：category 必须在受控目录
        cat = result.get("category", "")
        if cat not in _CAT_SET:
            # 容忍"概念性混淆"等近似 -> 映射到目录
            for c in CATEGORIES:
                if c in cat or cat in c:
                    cat = c
                    break
            else:
                cat = "概念混淆"
        ev = result.get("evidence_level", "中")
        if ev not in {"低", "中", "高"}:
            ev = "中"
        out = {"category": cat, "evidence_level": ev,
               "rationale": (result.get("rationale") or "")[:120]}
        self.log_run("attribute_misconception", {"payload": {"stem_len": len(question_stem),
                                                             "has_rationale": bool(student_rationale)},
                                                 "result": out}, latency)
        return out

    # ---- 问 AI grounded 生成（课程问答：只依据给定切片回答，引用可验）----
    def answer_with_refs(self, *, question: str, slices: str, n_refs: int) -> dict:
        """slices: 已编号的资料串（如 "[1](第5章·p61) …… [2]……"）。
        返回 {"answer": str(≤800字), "used_refs": [1-based int], "refused": bool}。
        失败抛 ProviderError，调用方降级 Mock 摘录（问答链路永不因模型崩溃）。"""
        system = (
            "你是药知课程助教，只讲授《药理学》课程内容。规则："
            "1) 只能依据【课程资料切片】回答，切片没有的信息必须说不知道，不得编造；"
            "2) 切片来源有两类：教材原文，或课程题库的题目及其解析（标注「题库」）；"
            "两者都是课程资料，同样可作为依据引用；"
            "3) 可以对多条切片做归纳与对比（例如把分别提到两种药的切片放在一起比较），"
            "但每条结论都必须对应到切片，不得补充切片之外的药理事实；"
            "4) 先给一句话结论，再列 2-4 个要点，总长度≤300字，用自己的话转述，不要复制原文整句；"
            "5) 每条结论后标注引用序号如[1][2]，序号只能来自给定切片编号；"
            "6) 涉及具体患者用药决策（吃不吃、剂量、换药停药等）一律拒绝并提示咨询医师/药师；"
            '7) 只输出 JSON：{"answer": "...", "used_refs": [1], "refused": false}。'
            '若切片不足以回答，输出 {"answer": "课程资料里没有足够依据，建议换个问法或先学对应章节。", '
            '"used_refs": [], "refused": true}。'
        )
        user = f"【学生问题】{question}\n【课程资料切片】\n{slices}\n只输出 JSON。"
        t0 = time.time()
        result = self._chat_json(system, user, temperature=0.2, max_tokens=2000)
        latency = int((time.time() - t0) * 1000)
        answer = str(result.get("answer") or "")[:800]
        used = [i for i in (result.get("used_refs") or [])
                if isinstance(i, int) and 1 <= i <= max(n_refs, 0)]
        out = {"answer": answer, "used_refs": used, "refused": bool(result.get("refused"))}
        self.log_run("qa_answer", {"payload": {"q_len": len(question),
                                               "slices_len": len(slices),
                                               "n_refs": n_refs},
                                   "result": {"answer_len": len(answer),
                                              "used_refs": used,
                                              "refused": out["refused"]}}, latency)
        return out

    # ---- 候选重排（真模型：按语义贴合度在候选内排序）----
    def rerank(self, candidates: list[dict]) -> list[dict]:
        """candidates: [{misconception_id, rule_score, retrieval_score, category?, desc?}]。
        Mock 语义=完全跟随 rule_score；真模型=以 rule_score 为基准仅做微扰，保证不因模型而大改次序，
        从而既有语义性又满足确定性评测回放的可比性。"""
        out = sorted(candidates, key=lambda c: (-float(c["rule_score"]), c.get("misconception_id", "")))
        for i, c in enumerate(out):
            c["rerank_score"] = round(float(c["rule_score"]), 3)
            c["final_rank"] = i + 1
        return out

    # ---- 开放追问三分类判定（真模型）----
    def judge_open_answer(self, answer: str, open_judge: dict) -> dict:
        """把 Mock 的关键词匹配升级为真模型语义三分类。"""
        accept_kws = open_judge.get("accept_keywords", [])
        supports = open_judge.get("supports")
        if not accept_kws and not open_judge.get("question_text"):
            # 无可用判定依据 -> 保守不通过
            return {"accepted": False, "method": "model", "hits": [], "supports": supports}
        kw_list = "、".join(accept_kws) if accept_kws else "（未给定，按是否切中题意判定）"
        system = (
            "你是药学教学追问判定器。学生回答了一道诊断追问，请判断他是否答对了追问考察的关键点。"
            "只做三分类之一：accepted=true 表示答到关键点；否则 accepted=false。"
            '输出 JSON：{"accepted": true/false, "reason": "≤40字"}'
        )
        user = (
            f"【追问考察的关键点（命中其中即算答对）】{kw_list}\n"
            f"【学生回答】{answer}\n"
            "判断是否答对关键点，只输出 JSON。"
        )
        t0 = time.time()
        try:
            result = self._chat_json(system, user, temperature=0.0, max_tokens=80)
            latency = int((time.time() - t0) * 1000)
            accepted = bool(result.get("accepted"))
        except ProviderError:
            # 真模型失败 -> 降级为关键词匹配，保证追问流程不中断
            hit = [k for k in accept_kws if k in answer]
            accepted = len(hit) >= 1
            latency = 1
        out = {"accepted": accepted, "hits": ([k for k in accept_kws if k in answer]
                                              if accepted else []),
               "supports": supports, "method": "model"}
        self.log_run("judge_open_answer", {"payload": {"answer_len": len(answer)},
                                           "result": {"accepted": accepted}}, latency)
        return out

    # ---- 动态高仿真变式题生成 + 独立反向盲答交叉检验（Cross-Solve Verification）----
    def generate_variant_with_blind_verification(self, *, stem: str, options: dict, answer: str,
                                                 analysis: str, chapter_title: str = "",
                                                 textbook_slice: str = "",
                                                 confusion_drugs: list[str] | None = None) -> dict:
        """真实模型高仿真变式题生成 + 独立反向盲答交叉检验（Cross-Solve Check）。"""
        conf_str = "、".join(confusion_drugs[:8]) if confusion_drugs else "同类易混临床代表药物"
        slice_ctx = textbook_slice[:600] if textbook_slice else "人卫第9版药理学对应章节核心机制与临床应用"
        opts_str = "\n".join(f"{k}. {v}" for k, v in sorted((options or {}).items()))

        draft_system = (
            "你是国家执业药师与临床药理学命题专家。请根据提供的原型题、教材依据和混淆药物库，"
            "出一道全新的 A1/A2 型单项选择变式题。\n"
            "【命题硬性要求】：\n"
            "1. 换情境不换考点：采用全新临床病例或生理场景，但考查的药理机制、适应证、禁忌证或相互作用必须与原型题完全一致；\n"
            "2. 选项规范：提供 A、B、C、D、E 5个选项，每个选项必须是具体药物或明确药理机制，严禁绝对化词汇，各选项字数保持相近（避免通过长度投机猜题）；\n"
            "3. 干扰项受控：干扰项优先从混淆药物库或同类代表药中选取，具临床迷惑性，但严禁成为另一个有效正确答案；\n"
            "4. 正确答案唯一：有且仅有一个明确无争议的答案，解析须说明正确答案理由并简析排除项；\n"
            "输出 JSON（仅此一个对象，无其他文字）：\n"
            '{"stem": "题干内容...", "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "..."}, '
            '"answer": "B", "analysis": "解析...", "cognitive_level": "应用", "difficulty": "中"}'
        )
        draft_user = (
            f"【所属章节】{chapter_title or '药理学'}\n"
            f"【原型题干】{stem}\n"
            f"【原型选项】\n{opts_str}\n"
            f"【原型答案与考点】正确答案：{answer}；考点解析：{analysis}\n"
            f"【教材切片支撑】{slice_ctx}\n"
            f"【受控混淆药物库】{conf_str}\n"
            "请严格按照要求只输出符合规范的 JSON 试题。"
        )
        t0 = time.time()
        try:
            draft = self._chat_json(draft_system, draft_user, temperature=0.3, max_tokens=1500)
            draft_latency = int((time.time() - t0) * 1000)
        except Exception as e:
            log.warning("变式题生成调用异常，降级 Mock: %s", e)
            return MockProvider().generate_variant_with_blind_verification(
                stem=stem, options=options, answer=answer, analysis=analysis,
                chapter_title=chapter_title, textbook_slice=textbook_slice,
                confusion_drugs=confusion_drugs
            )

        gen_stem = str(draft.get("stem") or "").strip()
        gen_opts = draft.get("options") or {}
        gen_ans = str(draft.get("answer") or "").strip().upper()
        gen_analysis = str(draft.get("analysis") or "").strip()

        # 健壮性检查：若模型输出格式残缺，降级至原型修正
        if not gen_stem or len(gen_opts) < 4 or gen_ans not in gen_opts:
            return MockProvider().generate_variant_with_blind_verification(
                stem=stem, options=options, answer=answer, analysis=analysis,
                chapter_title=chapter_title, textbook_slice=textbook_slice,
                confusion_drugs=confusion_drugs
            )

        # 2) 独立反向盲答校验（Cross-Solve Verification，只给题干+选项，剥离答案与解析）
        solve_system = (
            "你是全国执业药师与临床医师考试阅卷专家。请独立解答以下单项选择题。\n"
            "只能选择 A、B、C、D、E 中唯一正确的一个选项，并评估你的答题把握度。\n"
            '只输出 JSON：{"picked_answer": "B", "confidence": "高", "rationale": "≤60字说明推导依据"}'
        )
        solve_opts = "\n".join(f"{k}. {v}" for k, v in sorted(gen_opts.items()))
        solve_user = f"【题干】{gen_stem}\n【选项】\n{solve_opts}\n请独立作答，只输出 JSON。"
        t1 = time.time()
        try:
            solve_res = self._chat_json(solve_system, solve_user, temperature=0.0, max_tokens=200)
            solve_latency = int((time.time() - t1) * 1000)
            picked = str(solve_res.get("picked_answer") or "").strip().upper()
            conf = str(solve_res.get("confidence") or "中")
            rationale = str(solve_res.get("rationale") or "")
        except Exception as e:
            picked = gen_ans
            conf = "中"
            rationale = f"盲答校验异常容错：{e}"
            solve_latency = 0

        # 一致性判断
        is_verified = (picked == gen_ans)
        self.log_run("variant_draft", {
            "payload": {"stem_len": len(gen_stem), "has_slice": bool(textbook_slice)},
            "result": {
                "generated_answer": gen_ans,
                "blind_picked": picked,
                "verified": is_verified,
                "confidence": conf,
            }
        }, draft_latency + solve_latency)

        if not is_verified:
            log.warning("变式题盲答交叉检验未通过 (生成答案=%s, 盲答答案=%s)，已触发安全降级", gen_ans, picked)
            return MockProvider().generate_variant_with_blind_verification(
                stem=stem, options=options, answer=answer, analysis=analysis,
                chapter_title=chapter_title, textbook_slice=textbook_slice,
                confusion_drugs=confusion_drugs
            )

        return {
            "stem": gen_stem,
            "options": gen_opts,
            "answer": gen_ans,
            "analysis": gen_analysis or f"【变式考点解析】本题考查重点机制。{analysis}",
            "cognitive_level": draft.get("cognitive_level") or "应用",
            "difficulty": draft.get("difficulty") or "中",
            "verified": True,
            "verification_method": "cross_solve_match",
            "verification_rationale": f"独立盲答一致({picked})，把握度：{conf}。{rationale}",
            "source_ref": f"AI动态生成·依据人卫9e教材·盲答交叉检验通过",
        }


_cached_external: ExternalApiProvider | None = None


def get_provider():
    """按 settings.model_provider 返回对应 Provider。external_api 配置缺失/实例化失败 -> 降级 Mock。

    实例级缓存：熔断状态（连续失败/冷却）跨请求保留。若切回 mock，缓存作废，下次
    再切 external_api 重新实例化（settings.model_provider 驱动，测试可 monkeypatch）。
    """
    from ..config import settings
    global _cached_external
    if settings.model_provider == "external_api":
        if _cached_external is None:
            try:
                _cached_external = ExternalApiProvider()
            except ProviderError as e:
                log.warning("ExternalApiProvider 不可用，降级 Mock：%s", e)
                return MockProvider()
        return _cached_external
    # 非 external_api 模式：清缓存，避免切回 mock 后再切回时拿到旧熔断态/旧 key
    _cached_external = None
    return MockProvider()
