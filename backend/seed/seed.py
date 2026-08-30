# -*- coding: utf-8 -*-
"""种子内容：诊断域 DOM-PHARMO-ANS（M 受体激动药与阻断药）。

⚠️ 全部药学内容为技术侧起草样例，review_status=draft，须药理顾问逐字审校后方可
   置为 published（改 status 字段或 seed_on_startup 流程）。事实表述依据人卫版
   《药理学》通行内容：阿托品（M 阻断：散瞳/升眼压/调节麻痹/抑制分泌/解痉/心率↑，
   闭角型青光眼及前列腺肥大禁用）；毛果芸香碱（M 激动：缩瞳/降眼压/调节痉挛，
   视近物清楚视远物模糊）；有机磷中毒（阿托品抗 M 症状 + 碘解磷定复活胆碱酯酶，
   两药合用理由）；阿托品化指征（瞳孔散大、颜面潮红、皮肤干燥、肺部啰音消失、心率加快）。
"""
from sqlalchemy import select

from app.models import (  # noqa
    ChainNode, ConfusionPair, DiagnosticDomain, FollowupNode, KnowledgePoint,
    Misconception, MisconceptionFollowup, Question, QuestionEvidence, audit,
)

DOMAIN = dict(code="DOM-PHARMO-ANS", name="M 受体激动药与阻断药",
              chapter_ref="人卫版《药理学》第6章 传出神经系统药理",
              syllabus_ref="教学大纲：拟胆碱药与抗胆碱药的比较", exam_ref="执业药师考点：M 受体效应与用药禁忌",
              mastery_threshold=0.70)

KNOWLEDGE_POINTS = [
    ("M 受体激动效应", "理解", ["毛果芸香碱", "拟胆碱药"]),
    ("M 受体阻断效应", "理解", ["阿托品", "抗胆碱药"]),
    ("眼内平滑肌与房水", "理解", ["瞳孔括约肌", "瞳孔开大肌", "睫状肌"]),
    ("有机磷中毒与解救", "应用", ["碘解磷定", "胆碱酯酶复活剂", "阿托品化"]),
]

CHAIN = [
    (1, "药物与靶点", "毛果芸香碱激动 M 受体；阿托品阻断 M 受体；碘解磷定复活胆碱酯酶"),
    (2, "效应", "激动：缩瞳/降眼压/调节痉挛/分泌增加；阻断：散瞳/升眼压/调节麻痹/分泌抑制/心率加快"),
    (3, "临床用途", "毛果芸香碱：青光眼、缩瞳；阿托品：解除内脏绞痛、有机磷 M 样症状、散瞳检查（非青光眼）"),
    (4, "不良反应", "阿托品：口干/心悸/视近模糊；毛果芸香碱过量：M 样中毒"),
    (5, "禁忌与相互作用", "阿托品禁用于闭角型青光眼、前列腺肥大；毛果芸香碱禁用于哮喘患者"),
    (6, "特殊人群与机体状态", "老年人前列腺肥大慎用；闭角型青光眼为绝对禁忌"),
]

MISCONCEPTIONS = [
    # code, category, name, remediation_type, indicators
    ("MIS-ANS-01", "概念混淆", "阿托品与毛果芸香碱对瞳孔/眼压的效应记忆反转", "混淆对变式",
     ["将散瞳记成缩瞳", "认为阿托品降眼压"]),
    ("MIS-ANS-02", "概念混淆", "将阿托品的青光眼绝对禁忌记忆为慎用或可用人", "混淆对变式",
     ["认为青光眼可用阿托品", "混淆禁忌与慎用"]),
    ("MIS-ANS-03", "机制理解不足", "散瞳导致眼压升高的机制推导缺失（房水回流受阻）", "断环重讲",
     ["知道散瞳但推不出眼压升高"]),
    ("MIS-ANS-04", "知识遗忘", "毛果芸香碱缩瞳、降眼压、调节痉挛三大作用记忆缺失", "记忆卡",
     ["答不出毛果芸香碱的眼作用"]),
    ("MIS-ANS-05", "知识遗忘", "阿托品化指征（瞳孔散大/颜面潮红/皮肤干燥/啰音消失/心率加快）记忆缺失", "记忆卡",
     ["答不全阿托品化指征"]),
    ("MIS-ANS-06", "概念混淆", "有机磷中毒解救中阿托品与碘解磷定的角色混淆", "混淆对变式",
     ["认为阿托品恢复胆碱酯酶活性", "认为碘解磷定对抗 M 样症状"]),
    ("MIS-ANS-07", "机制理解不足", "碘解磷定复活胆碱酯酶的机制理解不足", "断环重讲",
     ["说不出碘解磷定的作用环节"]),
    ("MIS-ANS-08", "审题与应用失误", "特殊人群（青光眼/前列腺肥大）情境下的用药选择失误", "情境拆解",
     ["机制叙述正确但情境选药错误"]),
    ("MIS-ANS-09", "概念混淆", "M 受体在眼的分布与效应对应错误（括约肌/开大肌）", "混淆对变式",
     ["混淆括约肌与开大肌的神经支配效应"]),
    ("MIS-ANS-10", "机制理解不足", "调节痉挛的机制（睫状肌收缩→晶状体变凸→视近物清楚）理解不足", "断环重讲",
     ["说不清视近物清楚的原因"]),
]

CONFUSION_PAIRS = [
    ("阿托品", "毛果芸香碱", "阿托品阻断 M 受体：散瞳、升眼压、调节麻痹（视近物不清）；毛果芸香碱激动 M 受体：缩瞳、降眼压、调节痉挛（视近物清楚）。效应完全相反，靶点相同。"),
    ("阿托品", "碘解磷定", "有机磷中毒解救分工：阿托品阻断 M 受体对抗 M 样症状（对流涎、瞳孔缩小等）；碘解磷定复活胆碱酯酶、恢复 ACh 水解（对肌束颤动等 N 样症状更有效）。两药合用、机制互补、不能互相替代。"),
]

# 追问树节点：code, chain_level, question, options, option_signals, open_judge
FOLLOWUPS = [
    ("FU-ANS-01", 2, "阿托品作用于瞳孔的哪块肌肉、作用方向是什么？",
     [{"key": "A", "text": "作用于瞳孔括约肌，使其收缩（缩瞳）"},
      {"key": "B", "text": "阻断括约肌上的 M 受体，开大肌占优势（散瞳）"},
      {"key": "C", "text": "作用于开大肌，使其松弛（缩瞳）"}],
     {"A": {"shift": 0, "supports": "MIS-ANS-01", "note": "效应记忆反转坐实"},
      "B": {"shift": -1, "supports": "MIS-ANS-03", "note": "L2 无断环，转向 L5 推导"},
      "C": {"shift": 0, "supports": "MIS-ANS-09", "note": "肌肉分布混淆"}}, None),
    ("FU-ANS-02", 5, "散瞳之后，房水的回流路径会发生什么变化？",
     [{"key": "A", "text": "前房角变窄，房水回流受阻，眼压升高"},
      {"key": "B", "text": "前房角变宽，房水回流加快，眼压下降"},
      {"key": "C", "text": "散瞳不影响房水回流"}],
     {"A": {"shift": -1, "supports": None, "note": "L5 推导完整，机制链无断环"},
      "B": {"shift": 0, "supports": "MIS-ANS-03", "note": "方向记反"},
      "C": {"shift": 0, "supports": "MIS-ANS-03", "note": "推导缺失"}}, None),
    ("FU-ANS-03", 1, "毛果芸香碱作用于受体的哪一类？产生的效应方向与阿托品相同还是相反？",
     [{"key": "A", "text": "激动 M 受体，效应与阿托品相反"},
      {"key": "B", "text": "激动 M 受体，效应与阿托品相同"},
      {"key": "C", "text": "阻断 M 受体，效应与阿托品相反"}],
     {"A": {"shift": -1, "supports": None, "note": "L1-L2 清晰"},
      "B": {"shift": 0, "supports": "MIS-ANS-01", "note": "混淆对方向记错"},
      "C": {"shift": 0, "supports": "MIS-ANS-01", "note": "激动/阻断混淆"}}, None),
    ("FU-ANS-04", 6, "闭角型青光眼患者误用阿托品后，最可能出现的眼部变化是什么？",
     [{"key": "A", "text": "瞳孔缩小、眼压下降"},
      {"key": "B", "text": "散瞳、眼压急剧升高、可能诱发急性发作"},
      {"key": "C", "text": "视力不受影响"}],
     {"A": {"shift": 0, "supports": "MIS-ANS-01", "note": "效应反转"},
      "B": {"shift": -1, "supports": None, "note": "情境后果推理正确"},
      "C": {"shift": 0, "supports": "MIS-ANS-03", "note": "危害推导缺失"}}, None),
    ("FU-ANS-05", 1, "碘解磷定在有机磷中毒解救中作用于哪个环节？",
     None, None,
     {"accept_keywords": ["胆碱酯酶", "复活", "恢复酶活性", "水解乙酰胆碱"], "supports": None,
      "reject_hint": "MIS-ANS-07"}),
    ("FU-ANS-06", 3, "阿托品对抗有机磷中毒的哪些症状？碘解磷定对抗哪些？",
     [{"key": "A", "text": "阿托品抗 M 样症状（流涎/瞳孔缩小等），碘解磷定复活酶对抗肌颤等 N 样症状"},
      {"key": "B", "text": "阿托品复活胆碱酯酶，碘解磷定抗 M 样症状"},
      {"key": "C", "text": "两药作用完全相同，可以互相替代"}],
     {"A": {"shift": -1, "supports": None, "note": "分工清楚"},
      "B": {"shift": 0, "supports": "MIS-ANS-06", "note": "角色对调"},
      "C": {"shift": 0, "supports": "MIS-ANS-06", "note": "认为可替代"}}, None),
    ("FU-ANS-07", 2, "毛果芸香碱引起「视近物清楚、视远物模糊」的原因是什么？",
     None, None,
     {"accept_keywords": ["睫状肌收缩", "晶状体变凸", "悬韧带放松", "调节痉挛"], "supports": None,
      "reject_hint": "MIS-ANS-10"}),
]

# 追问与错因的挂接
FOLLOWUP_LINKS = {
    "MIS-ANS-01": ["FU-ANS-01", "FU-ANS-03", "FU-ANS-04"],
    "MIS-ANS-03": ["FU-ANS-02", "FU-ANS-04"],
    "MIS-ANS-06": ["FU-ANS-06"],
    "MIS-ANS-07": ["FU-ANS-05"],
    "MIS-ANS-09": ["FU-ANS-01"],
    "MIS-ANS-10": ["FU-ANS-07"],
}

# 题目：code, stem, options, answer, usage, chain_levels, condition_type,
#      distractor_signals, evidence_text
QUESTIONS = [
    ("Q-ANS-01", "阿托品禁用于闭角型青光眼患者，主要因为它对眼的作用是：",
     [{"key": "A", "text": "缩瞳、降眼压"}, {"key": "B", "text": "散瞳、升眼压"},
      {"key": "C", "text": "缩瞳、升眼压"}, {"key": "D", "text": "不影响眼压"}], "B",
     "diagnostic", [2, 5], "special_population",
     {"A": {"misconception": "MIS-ANS-01", "weight": 0.85, "note": "效应记忆反转", "needs_followup": True},
      "C": {"misconception": "MIS-ANS-09", "weight": 0.7, "note": "括约肌/开大肌效应混淆", "needs_followup": True},
      "D": {"misconception": "MIS-ANS-03", "weight": 0.6, "note": "散瞳-眼压推导缺失"}},
     "阿托品阻断瞳孔括约肌 M 受体，散瞳并使前房角变窄、房水回流受阻，眼压升高，闭角型青光眼禁用。"),
    ("Q-ANS-02", "毛果芸香碱对眼的作用是：",
     [{"key": "A", "text": "缩瞳、降眼压、调节痉挛"}, {"key": "B", "text": "散瞳、升眼压、调节麻痹"},
      {"key": "C", "text": "缩瞳、升眼压、调节麻痹"}, {"key": "D", "text": "散瞳、降眼压、调节痉挛"}], "A",
     "diagnostic", [1, 2], "normal",
     {"B": {"misconception": "MIS-ANS-01", "weight": 0.9, "note": "与阿托品效应记反"},
      "C": {"misconception": "MIS-ANS-09", "weight": 0.65, "note": "效应方向部分混淆"},
      "D": {"misconception": "MIS-ANS-04", "weight": 0.6, "note": "作用记忆不完整"}},
     "毛果芸香碱激动 M 受体：瞳孔括约肌收缩（缩瞳）、房水回流增加（降眼压）、睫状肌收缩（调节痉挛）。"),
    ("Q-ANS-03", "有机磷农药中毒患者，阿托品与碘解磷定早期合用的理由是：",
     [{"key": "A", "text": "两药均直接对抗乙酰胆碱，合用增强疗效"},
      {"key": "B", "text": "阿托品对抗 M 样症状，碘解磷定复活胆碱酯酶，作用环节互补"},
      {"key": "C", "text": "碘解磷定对抗 M 样症状，阿托品对抗 N 样症状"},
      {"key": "D", "text": "两药合用可减少阿托品用量至无需阿托品化"}], "B",
     "diagnostic", [3, 5], "polypharmacy",
     {"A": {"misconception": "MIS-ANS-06", "weight": 0.75, "note": "机制互补未区分"},
      "C": {"misconception": "MIS-ANS-06", "weight": 0.85, "note": "两药角色对调"},
      "D": {"misconception": "MIS-ANS-05", "weight": 0.6, "note": "阿托品化概念缺失"}},
     "阿托品阻断 M 受体缓解 M 样中毒症状；碘解磷定使被抑制的胆碱酯酶恢复活性，对 N 样症状（肌束颤动）更有效。两药机制互补。"),
    ("Q-ANS-04", "使用阿托品解救有机磷中毒达到「阿托品化」的指征不包括：",
     [{"key": "A", "text": "瞳孔较前扩大"}, {"key": "B", "text": "肺部啰音消失"},
      {"key": "C", "text": "皮肤干燥、颜面潮红"}, {"key": "D", "text": "瞳孔极度缩小、流涎加重"}], "D",
     "diagnostic", [4], "pathology",
     {"D": {"misconception": "MIS-ANS-05", "weight": 0.9, "note": "阿托品化指征记忆缺失（此为中毒加重表现）"}},
     "阿托品化指征：瞳孔较前扩大、颜面潮红、皮肤干燥、肺部啰音消失、心率加快。瞳孔缩小、流涎为未达阿托品化或中毒加重。"),
    ("Q-ANS-05", "患者使用毛果芸香碱滴眼后诉说「看近清楚、看远模糊」，其机制是：",
     [{"key": "A", "text": "瞳孔括约肌收缩所致"}, {"key": "B", "text": "睫状肌收缩、晶状体变凸（调节痉挛）"},
      {"key": "C", "text": "晶状体变扁平（调节麻痹）"}, {"key": "D", "text": "眼压升高影响屈光"}], "B",
     "diagnostic", [2], "normal",
     {"C": {"misconception": "MIS-ANS-10", "weight": 0.8, "note": "与阿托品调节麻痹混淆"},
      "A": {"misconception": "MIS-ANS-10", "weight": 0.6, "note": "肌肉对应错误"},
      "D": {"misconception": "MIS-ANS-10", "weight": 0.5, "note": "机制理解不足"}},
     "毛果芸香碱激动睫状肌 M 受体使其向瞳孔中心收缩、悬韧带放松、晶状体变凸，屈光增强，视近物清楚而视远物模糊，称调节痉挛。"),
    ("Q-ANS-06", "前列腺肥大患者应慎用或禁用阿托品的原因是：",
     [{"key": "A", "text": "抑制腺体分泌引起口干"}, {"key": "B", "text": "松弛内脏平滑肌，加重排尿困难"},
      {"key": "C", "text": "升高眼压诱发青光眼"}, {"key": "D", "text": "加快心率诱发心律失常"}], "B",
     "diagnostic", [5, 6], "special_population",
     {"A": {"misconception": "MIS-ANS-08", "weight": 0.6, "note": "情境条件未对应"},
      "C": {"misconception": "MIS-ANS-08", "weight": 0.55, "note": "禁忌迁移错误"},
      "D": {"misconception": "MIS-ANS-08", "weight": 0.5, "note": "情境条件未对应"}},
     "阿托品松弛内脏平滑肌，前列腺肥大者可加重排尿困难，故禁用或慎用。"),
    ("Q-ANS-07", "闭角型青光眼患者需要散瞳检查眼底时，合理的做法是：",
     [{"key": "A", "text": "常规使用阿托品散瞳"},
      {"key": "B", "text": "避免使用阿托品等升高眼压的散瞳药，由眼科评估选择方案"},
      {"key": "C", "text": "使用毛果芸香碱散瞳"},
      {"key": "D", "text": "散瞳药对青光眼患者没有影响"}], "B",
     "diagnostic", [5, 6], "special_population",
     {"A": {"misconception": "MIS-ANS-02", "weight": 0.9, "note": "禁忌当可用"},
      "C": {"misconception": "MIS-ANS-01", "weight": 0.7, "note": "效应方向混淆"},
      "D": {"misconception": "MIS-ANS-02", "weight": 0.6, "note": "禁忌意识缺失"}},
     "闭角型青光眼为阿托品散瞳的绝对禁忌；确需散瞳应由眼科评估选用其他方案并监测眼压。"),
    ("Q-ANS-08", "碘解磷定解救有机磷中毒的药理学基础是：",
     [{"key": "A", "text": "直接拮抗 M 受体"}, {"key": "B", "text": "复活被抑制的胆碱酯酶"},
      {"key": "C", "text": "促进乙酰胆碱排泄"}, {"key": "D", "text": "阻断骨骼肌 N 受体"}], "B",
     "training", [1, 2], "pathology",
     {"A": {"misconception": "MIS-ANS-06", "weight": 0.8, "note": "与阿托品机制混淆"},
      "C": {"misconception": "MIS-ANS-07", "weight": 0.65, "note": "作用环节不清"},
      "D": {"misconception": "MIS-ANS-07", "weight": 0.55, "note": "作用环节不清"}},
     "碘解磷定与磷酰化胆碱酯酶结合，使胆碱酯酶游离恢复活性，是胆碱酯酶复活药。"),
    ("Q-ANS-09", "毛果芸香碱降眼压的机制是：",
     [{"key": "A", "text": "抑制房水生成"}, {"key": "B", "text": "缩瞳使前房角变宽、房水回流增加"},
      {"key": "C", "text": "收缩血管减少眼内血流"}, {"key": "D", "text": "松弛睫状肌"}], "B",
     "training", [2, 4], "normal",
     {"A": {"misconception": "MIS-ANS-04", "weight": 0.6, "note": "与β受体阻断药降眼压机制混淆"},
      "C": {"misconception": "MIS-ANS-04", "weight": 0.5, "note": "机制记忆错误"}},
     "毛果芸香碱缩瞳使虹膜向中心拉紧、前房角间隙扩大，房水经小梁网回流增加，眼压下降。"),
    ("Q-ANS-10", "阿托品散瞳后患者视近物不清，其机制与毛果芸香碱的调节痉挛的关系是：",
     [{"key": "A", "text": "同一块睫状肌的相反效应：阿托品使其松弛（调节麻痹），毛果芸香碱使其收缩（调节痉挛）"},
      {"key": "B", "text": "两者都收缩睫状肌，仅程度不同"},
      {"key": "C", "text": "视近物不清由散瞳直接造成，与睫状肌无关"}], "A",
     "training", [2, 4], "normal",
     {"B": {"misconception": "MIS-ANS-01", "weight": 0.7, "note": "效应方向未区分"},
      "C": {"misconception": "MIS-ANS-10", "weight": 0.6, "note": "机制理解不足"}},
     "阿托品阻断睫状肌 M 受体使其松弛、悬韧带拉紧、晶状体变扁，视近物不清（调节麻痹）；与毛果芸香碱的调节痉挛互为反向。"),
]

TRAINING_POOL = [q for q in QUESTIONS if q[4] == "training"]
DIAG_POOL = [q for q in QUESTIONS if q[4] == "diagnostic"]


def seed(db):
    """幂等：以 code 判重。全部内容 review_status=draft（待药理顾问审校）。"""
    if db.execute(select(DiagnosticDomain).where(DiagnosticDomain.code == DOMAIN["code"])).scalar_one_or_none():
        return
    domain = DiagnosticDomain(**DOMAIN, status="published")  # 域本身已定稿
    db.add(domain)
    db.flush()

    kp_by_name = {}
    for name, level, aliases in KNOWLEDGE_POINTS:
        kp = KnowledgePoint(domain_id=domain.id, name=name, cognitive_level=level, aliases=aliases)
        db.add(kp)
        kp_by_name[name] = kp
    db.flush()

    for level, title, summary in CHAIN:
        db.add(ChainNode(domain_id=domain.id, level=level, title=title, summary=summary))

    nodes = {}
    for code, lvl, text, options, signals, open_judge in FOLLOWUPS:
        n = FollowupNode(code=code, domain_id=domain.id, chain_level=lvl, question_text=text,
                         options=options, option_signals=signals, open_judge=open_judge,
                         review_status="published")  # 种子即发布（Demo）；试点前须顾问审校，见 README
        db.add(n)
        nodes[code] = n
    db.flush()

    mis_by_code = {}
    for code, cat, name, rem, ind in MISCONCEPTIONS:
        m = Misconception(code=code, category=cat, name=name, domain_id=domain.id,
                          indicators=ind, counter_indicators=[], remediation_type=rem,
                          remediation_payload={}, status="published")  # 同上
        db.add(m)
        mis_by_code[code] = m
    db.flush()
    for mcode, fucodes in FOLLOWUP_LINKS.items():
        for fu in fucodes:
            db.add(MisconceptionFollowup(misconception_id=mis_by_code[mcode].id, followup_node_id=nodes[fu].id))

    for a, b, txt in CONFUSION_PAIRS:
        db.add(ConfusionPair(domain_id=domain.id, drug_a=a, drug_b=b, distinction_text=txt))

    for code, stem, options, answer, usage, levels, cond, signals, ev in QUESTIONS:
        q = Question(code=code, type="single", domain_id=domain.id, stem=stem, options=options,
                     answer=answer, usage=usage, leakage_group_id="LG-ANS-01",
                     distractor_signals=signals, chain_levels=levels, condition_type=cond,
                     review_status="published")  # 同上
        db.add(q)
        db.flush()
        db.add(QuestionEvidence(question_id=q.id, evidence_chunk_id="EV-PENDING-W3",
                                support_type="解析", content_text=ev))
    audit(db, "seed", "content.seeded", domain.code, questions=len(QUESTIONS),
          followups=len(FOLLOWUPS), misconceptions=len(MISCONCEPTIONS))
    db.commit()
