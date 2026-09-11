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

# 教材事实案例（v0.7 错因卡第④字段，2026-09-08）——每个种子错因附 1 条临床事实案例，
# 辅助学生从"知道答案"到"理解记忆"。事实表述与 seed 头部 docstring 一致（人卫《药理学》9e
# 第5章胆碱能神经系统药物），来源署名到章（与 QUESTION 解析证据 source 同口径），不虚构页码。
CASE_EVIDENCE = {
    "MIS-ANS-01": {
        "scenario": "同一患者滴眼：毛果芸香碱用于青光眼使瞳孔缩小、眼压下降；误用阿托品则散瞳、眼压升高。",
        "lesson": "阿托品阻断 M 受体→散瞳/升眼压/调节麻痹；毛果芸香碱激动 M 受体→缩瞳/降眼压/调节痉挛，效应相反，别记反。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-02": {
        "scenario": "闭角型青光眼患者误用阿托品点眼，可因瞳孔散大、前房角变窄诱发眼压急剧升高甚至急性发作。",
        "lesson": "闭角型青光眼、前列腺肥大是阿托品的绝对禁忌，不是「慎用」或「可用」。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-03": {
        "scenario": "阿托品散瞳后房水回流路径受阻，患者可诉眼胀、视物模糊，青光眼者诱发急性发作。",
        "lesson": "散瞳使前房角变窄、房水经前房角回流受阻→眼压升高，这正是散瞳致眼压升高的机制链。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-04": {
        "scenario": "开角型青光眼患者用毛果芸香碱滴眼后瞳孔缩小、眼压下降，视近物清楚、视远物模糊。",
        "lesson": "毛果芸香碱激动 M 受体三大眼作用：缩瞳、降眼压、调节痉挛（视近物清楚），是青光眼与缩瞳常用药。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-05": {
        "scenario": "有机磷中毒患者静注阿托品，护士监测到瞳孔散大、颜面潮红、皮肤干燥、心率加快、肺部啰音消失——阿托品化。",
        "lesson": "阿托品化指征（瞳孔散大/颜面潮红/皮肤干燥/啰音消失/心率加快）是调整阿托品用量的观察终点。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-06": {
        "scenario": "有机磷中毒患者同时出现流涎、瞳孔缩小（M 样）与肌束颤动（N 样），临床阿托品+碘解磷定联合解救。",
        "lesson": "阿托品对抗 M 样症状（流涎/缩瞳等）；碘解磷定复活胆碱酯酶、解除 N 样症状（肌颤）。分工互补，不能互相替代。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-07": {
        "scenario": "有机磷中毒早期肌束颤动明显，碘解磷定使用后肌颤减轻——因胆碱酯酶被复活、ACh 得以正常水解。",
        "lesson": "碘解磷定通过与磷酰化胆碱酯酶结合并裂解，使酶复活，针对的是酶而非 M 受体，故不能替代阿托品。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-08": {
        "scenario": "用药前筛禁忌情境：闭角型青光眼/前列腺肥大者不宜用阿托品类抗胆碱药，哮喘患者不宜用毛果芸香碱。",
        "lesson": "审题先判人群与禁忌：题目出现「青光眼/前列腺肥大/哮喘/孕妇」等情境，往往考用药禁忌而非药理机制本身。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-09": {
        "scenario": "瞳孔括约肌由副交感（M 受体）支配，收缩致缩瞳；瞳孔开大肌由交感（α 受体）支配，收缩致散瞳。",
        "lesson": "括约肌=环行肌、受 M 支配→收缩缩瞳；开大肌=辐射肌、受 α 支配→收缩散瞳。别把两者的神经支配记反。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
    "MIS-ANS-10": {
        "scenario": "毛果芸香碱使睫状肌收缩、悬韧带放松、晶状体变凸，患者视近物清楚、视远物模糊——调节痉挛。",
        "lesson": "调节痉挛＝睫状肌收缩→晶状体变凸→折光力↑→视近清楚、视远模糊；阿托品则相反（调节麻痹、视近不清）。",
        "source": "人卫《药理学》9e·第5章·胆碱能神经系统药物",
    },
}

# 追问树节点：code, chain_level, question, options, option_signals, open_judge
FOLLOWUPS = [
    ("FU-ANS-00", 2, "你如何理解阿托品和毛果芸香碱对瞳孔作用的区别？",
     None, None,
     {"accept_keywords": ["阻断", "激动", "相反", "散瞳", "缩瞳"], "supports": None,
      "reject_hint": "MIS-ANS-01"}),
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
    "MIS-ANS-01": ["FU-ANS-00", "FU-ANS-01", "FU-ANS-03", "FU-ANS-04"],
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
     {"A": {"misconception": "MIS-ANS-05", "weight": 0.85, "note": "阿托品化指征记忆缺失", "needs_followup": True},
      "B": {"misconception": "MIS-ANS-05", "weight": 0.85, "note": "阿托品化指征记忆缺失", "needs_followup": True},
      "C": {"misconception": "MIS-ANS-05", "weight": 0.85, "note": "阿托品化指征记忆缺失", "needs_followup": True}},
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


def _apply_case_evidence(db):
    """幂等给既有错因目录回填教材事实案例（v0.7 第④字段，2026-09-08）。

    新库在插入时已带 case_evidence；旧库（升级前已 seed）此函数补回，已填的不覆盖。
    """
    changed = 0
    for code, case in CASE_EVIDENCE.items():
        m = db.execute(select(Misconception).where(
            Misconception.code == code)).scalar_one_or_none()
        if m is not None and not m.case_evidence:
            m.case_evidence = case
            changed += 1
    if changed:
        db.commit()


def _apply_knowledge_edges(db):
    """FR-A2 图谱边幂等回填（新库/旧库都覆盖，见 seed_knowledge_graph.apply_knowledge_edges）。"""
    try:
        from seed.seed_knowledge_graph import apply_knowledge_edges
        return apply_knowledge_edges(db)
    except Exception as e:  # noqa: BLE001
        print(f"[seed][WARN] 知识关系边回填跳过: {type(e).__name__}: {e}")
        return 0


def _apply_knowledge_evidence(db):
    """图谱证据锚点幂等回填（2026-09-11）：给边/混淆对挂教材原文出处。

    必须在 _apply_knowledge_edges 之后调用（边先存在）。未找到教材依据的边保持
    evidence=None（见 seed_knowledge_evidence.UNVERIFIED），不拿不相关页凑数。
    """
    try:
        from seed.seed_knowledge_evidence import apply_knowledge_evidence
        return apply_knowledge_evidence(db)
    except Exception as e:  # noqa: BLE001
        print(f"[seed][WARN] 图谱证据锚点回填跳过: {type(e).__name__}: {e}")
        return 0, 0


def seed(db):
    """幂等：以 code 判重。全部内容 review_status=draft（待药理顾问审校）。"""
    _restore_course_assets(db)  # 课程资产（题库/大纲/章节映射）幂等恢复，reset-demo 后自动还原
    _apply_case_evidence(db)  # 给既有错因目录回填教材事实案例（幂等，新库/旧库都覆盖）
    # 结构化知识关系（FR-A2 图谱最小落地）：旧库（域已存在）在此补回；新库域稍后建，末段再补
    _apply_knowledge_edges(db)
    _apply_knowledge_evidence(db)  # 图谱证据锚点（旧库：边已存在，此处补教材出处）
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
                          remediation_payload={}, case_evidence=CASE_EVIDENCE.get(code),
                          status="published")  # 同上
        db.add(m)
        mis_by_code[code] = m
    db.flush()
    for mcode, fucodes in FOLLOWUP_LINKS.items():
        for fu in fucodes:
            db.add(MisconceptionFollowup(misconception_id=mis_by_code[mcode].id, followup_node_id=nodes[fu].id))

    for a, b, txt in CONFUSION_PAIRS:
        db.add(ConfusionPair(domain_id=domain.id, drug_a=a, drug_b=b, distinction_text=txt))

    # 解析来源锚点（2026-09-03 与题库"题目绑定证据"口径对齐）：
    # 种子 10 题内容均为 M 胆碱受体药（阿托品/毛果芸香碱/碘解磷定等），
    # 依据人卫《药理学》9e 第5章"作用于胆碱能神经系统的药物"（OCR p60-78 范围）。
    # 原 EV-PENDING-W3 为 W3 RAG 占位，演示/教学预览若透出会显得证据悬空，已弃用。
    seed_src = "人卫《药理学》9e·第5章·胆碱能神经系统药物"
    for code, stem, options, answer, usage, levels, cond, signals, ev in QUESTIONS:
        q = Question(code=code, type="single", domain_id=domain.id, stem=stem, options=options,
                     answer=answer, usage=usage, leakage_group_id="LG-ANS-01",
                     distractor_signals=signals, chain_levels=levels, condition_type=cond,
                     review_status="published")  # 同上
        db.add(q)
        db.flush()
        db.add(QuestionEvidence(question_id=q.id, evidence_chunk_id=seed_src,
                                support_type="解析", content_text=ev))
    audit(db, "seed", "content.seeded", domain.code, questions=len(QUESTIONS),
          followups=len(FOLLOWUPS), misconceptions=len(MISCONCEPTIONS))
    _apply_knowledge_edges(db)  # 新库域刚建，补 FR-A2 图谱边（幂等）
    _apply_knowledge_evidence(db)  # 边已存在，补教材证据锚点（幂等）
    db.commit()



def _restore_course_assets(db):
    """幂等恢复课程资产：题库 786 题原文 + 大纲 31 章 + 章节映射 chapter_ref。

    reset-demo 会 drop 全部表再重建，若无此恢复则课程资产（c54255a/c990685 的成果）
    会丢失。import_course_assets 按 (paper_no,qid) 查重、map_tiku_chapters 重算
    chapter_ref，均可重放。文件缺失或异常时跳过，不影响 10 题诊断域种子。
    """
    try:
        from seed.import_course_assets import import_syllabus, import_tiku
        from seed.map_tiku_chapters import map_question
        import_tiku(db)
        import_syllabus(db)
        from app.models import TikuQuestion
        for q in db.query(TikuQuestion).all():
            ref, _, _ = map_question(q)
            if ref and q.chapter_ref != ref:
                q.chapter_ref = ref
        # 补章成果（CH8/13/18/39 + 36 题归位）不随 reset-demo 丢失：map_question
        # 基于 31 章词表重算后，apply_bchapters 幂等补回新章与题映射。
        from seed.add_bchapters import apply_bchapters
        n_ch, n_q = apply_bchapters(db)
        if n_ch or n_q:
            print(f"[seed] 补章恢复: 新增章节 {n_ch}，题归位 {n_q}")
        # A 类人工修正 4 题不随 reset-demo 丢失：词表启发优先级低于人工判定，
        # map_question 重算会把修正覆盖回错值（如 01-154 尼莫地平→CH3），此步强制回写。
        from seed.apply_amapping import apply_a_fixes
        n_a = apply_a_fixes(db)
        if n_a:
            print(f"[seed] A类修正恢复: {n_a} 题映射强制回写（人工判定优先级>词表）")
        db.commit()
        # 内容化成果（解析/认知层级/难度/来源）不随 reset-demo 丢失：重放批注稿。
        # 注：先 commit 章节映射，再跑 contentize（批注稿按 chapter_ref 定位）。
        from seed.contentize_tiku import restore_content
        r = restore_content(db)
        print(f"[seed] 内容化恢复: 规则初标新填 {r['tagged']} 题, "
              f"批注稿 {r['batches']}")
        # 题库→业务桥接（2026-09-03）：published A1+B1 物化进 questions，闭环消费真实题库。
        from seed.seed_tiku_bridge import bridge_tiku_questions
        b = bridge_tiku_questions(db)
        print(f"[seed] 题库桥接: 物化 {b['bridged']} 题, 解析重绑定 {b['rebound']} 题, "
              f"题型 {b['by_type']}, 章域 {b['domain_codes']}")
        # 章级通用错因目录（四分类 × 34 章，2026-09-03）：723 道题库题没有任何
        # 错因标注，缺此目录则题库题答错不出错因卡、不进靶向训练、不进复测。
        # 依赖 domains（由 import_syllabus 建），故放在桥接之后。
        from seed.add_chapter_misconceptions import apply_chapter_misconceptions
        n_mis = apply_chapter_misconceptions(db)
        if n_mis:
            print(f"[seed] 章级错因目录恢复: 新增 {n_mis} 条")
        # 全量章节图谱（2026-09-11）：34 章结构边+药物归属边+混淆候选，
        # 依赖 domains（桥接建）与 tiku/大纲内容，故放在最后。
        from seed.seed_chapter_graphs import apply_chapter_graphs
        g = apply_chapter_graphs(db)
        if g["relations"] or g["pairs"]:
            print(f"[seed] 章节图谱恢复: 新增边 {g['relations']}，混淆候选 {g['pairs']}")
    except Exception as e:  # noqa: BLE001
        # 醒目提示：异常会导致补章(4章)与内容化(published)静默缺失，reset-demo
        # 接口仍返回 ok，演示方不易察觉。打印类型便于定位（如枚举非法值拦截）。
        print(f"[seed][WARN] 课程资产恢复跳过（不影响演示种子）: "
              f"{type(e).__name__}: {e}")
        print("[seed][WARN] 注意：补章(CH8/13/18/39)或内容化(published)可能未恢复，"
              "请检查 tiku_questions.review_status 是否有枚举外值")
