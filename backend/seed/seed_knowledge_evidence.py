# -*- coding: utf-8 -*-
"""FR-A2 知识图谱证据锚点（2026-09-11）：给图谱边与混淆对挂教材原文出处。

背景：图谱此前只有断言没有出处——11 条边、2 组混淆对均为种子里手写的事实转写，
`confusion_pair_evidence` 表 0 行，边本身也没有任何来源字段。展示时看起来是
"关系图谱"，实际无法回答"这条边凭什么成立"。

本模块从人卫《药理学》9e OCR（corpus/ocr_textbook9e，538 页）检索出候选教材页，
**人工逐条核验**后把确实支持该断言的原文片段写回 `evidence` 字段。纪律：

  1. 只写核验通过的：找不到教材依据的边（阿托品→前列腺肥大、毛果芸香碱→哮喘）
     保持 evidence=None，接口侧显示"待补教材依据"，绝不拿不相关页凑数
     （前车之鉴：诊断卡 RAG 曾把 β 受体阻断药挂到利尿药段落）。
  2. 摘录忠实于 OCR 原文（含 OCR 错字如"流人""磷酰基磷"），不润色成教材原话，
     避免"看起来像原文其实被改写"。
  3. 幂等：只补 evidence 为空的行，已填的不覆盖（重跑 seed / reset-demo 安全）。

字段结构（与 Misconception.case_evidence 对齐，单条证据）：
    {"source": 来源署名, "book_page": 教材页码, "ocr_page": OCR 文件页号,
     "chapter": 章节, "text": 原文摘录, "verified": 核验说明}
"""
from sqlalchemy import select

from app.models import ConfusionPair, DiagnosticDomain, KnowledgeRelation, audit

SOURCE = "人卫《药理学》9e"

# (源节点名, 边类型, 目标节点名) -> 教材证据
RELATION_EVIDENCE = {
    ("阿托品", "作用于", "M受体"): {
        "book_page": 55, "ocr_page": 72,
        "chapter": "第4章 传出神经系统药理学概论",
        "text": "M受体拮抗药如阿托品",
        "verified": "人工核验 2026-09-11：分类表明确列阿托品为 M 受体拮抗药",
    },
    ("毛果芸香碱", "作用于", "M受体"): {
        "book_page": 54, "ocr_page": 71,
        "chapter": "第4章 传出神经系统药理学概论",
        "text": "M受体激动药（毛果芸香碱）",
        "verified": "人工核验 2026-09-11：分类表明确列毛果芸香碱为 M 受体激动药",
    },
    ("碘解磷定", "作用于", "胆碱酯酶"): {
        "book_page": 67, "ocr_page": 84,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "本品进入体内后,其分子中带正电荷的季铵氮与磷酰化乙酰胆碱酯酶的阴离子部位"
                "以静电引力相结合,结合后使其基(N一OH)趋向磷酰化乙酰胆碱酯酶的磷原子,进而与磷酰基",
        "verified": "人工核验 2026-09-11：教材原文本段即碘解磷定复活胆碱酯酶的作用机制",
    },
    ("阿托品", "表现为", "散瞳·升眼压·调节麻痹"): {
        "book_page": 60, "ocr_page": 77,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "配的瞳孔开大肌功能占优势，瞳孔扩大。……进人巩膜静脉窦,从而导致眼压升高。",
        "verified": "人工核验 2026-09-11：同页上下文为阿托品对眼的作用（散瞳 + 眼压升高）；"
                    "「调节麻痹」字样在本页 OCR 中未直接出现，摘录未覆盖该部分",
    },
    ("毛果芸香碱", "表现为", "缩瞳·降眼压·调节痉挛"): {
        "book_page": 57, "ocr_page": 74,
        "chapter": "第5章 作用于胆碱能神经系统的药物（OCR 章节标注为第4章）",
        "text": "本品通过缩瞳作用可使虹膜向……2）降低眼压：房水经睫状体上皮细胞分泌及血管渗出而"
                "产生后，经瞳孔流人前房到达前房角间隙，主要经滤帘流人巩膜静脉窦……3）调节痉挛",
        "verified": "人工核验 2026-09-11：缩瞳/降低眼压/调节痉挛三项在本页均有对应原文",
    },
    ("阿托品", "禁忌用于", "闭角型青光眼"): {
        "book_page": 60, "ocr_page": 77,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "进人巩膜静脉窦,从而导致眼压升高。因此,禁用于青光眼患者。",
        "verified": "人工核验 2026-09-11：教材表述为「禁用于青光眼患者」，未区分闭角/开角；"
                    "边目标写「闭角型青光眼」属种子既定口径，摘录忠实保留教材原话",
    },
    ("阿托品", "适应证", "内脏绞痛/有机磷M样症状解救/散瞳检查"): {
        "book_page": 67, "ocr_page": 84,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "危重中毒患者,阿托品的用量还可酌情增加。如与乙酰胆碱酯酶复活药合用,应减少",
        "verified": "人工核验 2026-09-11：证据支持其中的「有机磷中毒解救」用途；"
                    "「内脏绞痛」「散瞳检查」两项在检索结果中未找到同页直接表述",
    },
    ("毛果芸香碱", "适应证", "青光眼"): {
        "book_page": 58, "ocr_page": 75,
        "chapter": "第5章 作用于胆碱能神经系统的药物（OCR 章节标注为第4章）",
        "text": "滴眼可用于治疗闭角型青光眼（也称充血性青光",
        "verified": "人工核验 2026-09-11：青光眼适应证直接对应",
    },
    ("阿托品", "与…相互作用", "碘解磷定"): {
        "book_page": 67, "ocr_page": 84,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "如与乙酰胆碱酯酶复活药合用,应减少",
        "verified": "人工核验 2026-09-11：「乙酰胆碱酯酶复活药」即碘解磷定一类，机制互补成立",
    },
}

# (drug_a, drug_b) -> 教材证据
PAIR_EVIDENCE = {
    ("阿托品", "毛果芸香碱"): {
        "book_page": 57, "ocr_page": 74,
        "chapter": "第5章 作用于胆碱能神经系统的药物（OCR 章节标注为第4章）",
        "text": "本品通过缩瞳作用可使虹膜向……2）降低眼压……3）调节痉挛",
        "verified": "人工核验 2026-09-11：辨析的毛果芸香碱侧（缩瞳/降眼压/调节痉挛）有原文；"
                    "阿托品侧见同章 p60（散瞳/升眼压/禁用于青光眼）",
    },
    ("阿托品", "碘解磷定"): {
        "book_page": 67, "ocr_page": 84,
        "chapter": "第5章 作用于胆碱能神经系统的药物",
        "text": "危重中毒患者,阿托品的用量还可酌情增加。如与乙酰胆碱酯酶复活药合用,应减少",
        "verified": "人工核验 2026-09-11：两药在有机磷中毒解救中的分工有原文支撑",
    },
}

# 教材 OCR 中未检索到可靠依据的边（保持 evidence=None，接口显示"待补"）
UNVERIFIED = [
    ("阿托品", "禁忌用于", "前列腺肥大"),
    ("毛果芸香碱", "禁忌用于", "哮喘"),
]


def _with_source(ev: dict) -> dict:
    return {"source": SOURCE, **ev}


def apply_knowledge_evidence(db) -> tuple[int, int]:
    """幂等回填图谱证据锚点。返回 (新增边证据数, 新增辨析证据数)。

    只补 evidence 为空的行，已填不覆盖；域不存在时返回 (0, 0)。
    """
    domain = db.execute(select(DiagnosticDomain).where(
        DiagnosticDomain.code == "DOM-PHARMO-ANS")).scalar_one_or_none()
    if domain is None:
        return 0, 0

    n_rel = 0
    for r in db.execute(select(KnowledgeRelation).where(
            KnowledgeRelation.domain_id == domain.id)).scalars():
        if r.evidence:
            continue
        key = (r.source.get("name"), r.edge, r.target.get("name"))
        if key in RELATION_EVIDENCE:
            r.evidence = _with_source(RELATION_EVIDENCE[key])
            n_rel += 1

    n_pair = 0
    for p in db.execute(select(ConfusionPair).where(
            ConfusionPair.domain_id == domain.id)).scalars():
        if p.evidence:
            continue
        key = (p.drug_a, p.drug_b)
        if key in PAIR_EVIDENCE:
            p.evidence = _with_source(PAIR_EVIDENCE[key])
            n_pair += 1

    if n_rel or n_pair:
        audit(db, "seed", "knowledge_evidence.seeded", domain.code,
              relations=n_rel, pairs=n_pair)
        db.commit()
    return n_rel, n_pair
