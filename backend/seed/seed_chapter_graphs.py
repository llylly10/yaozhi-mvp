# -*- coding: utf-8 -*-
"""全量章节图谱抽取（FR-A2 全铺开，2026-09-11）。

把 35 个章级诊断域（DOM-CHx）从"无图谱"补成"最小诚实图谱"，与种子域
DOM-PHARMO-ANS 的 11 条机制深边互补：

边来源（全部可回溯，不虚构药理事实）：
  1. 大纲结构边：章节—包含→节、节—包含→知识点（源=教学大纲章节树原文）。
  2. 类别归属边：类别—属于→章节（源=大纲节标题/知识点中以"药/剂/类"结尾的术语）。
  3. 药物归属边：药物—属于→章节（源=本章题库选项/题干/解析中真实提及的药名；
     词表以题库选项（干净药名）为主 + 白名单补经典药，题干/解析只做已知词回查，
     不做开放构词，避免编造药名）。
  4. 混淆候选：同题选项中共现的药对（源=题库选项共现计数，≥2 次才收，
     辨析文本诚实标注"待顾问撰写"，不编造区别）。

纪律（与 seed_knowledge_graph / seed_knowledge_evidence 一致）：
  - 不新增机制断言：34 章不写"作用于/禁忌用于/适应证"等机制边；
    药物边只表达"本章题目涉及该药"（属于），不表达药效。
  - 全部 review_status=draft（待药理顾问审校），种子域 11 条不动。
  - 幂等：以 (domain_id, source, edge, target) 判重；混淆对以
    (domain_id, drug_a, drug_b) 有序判重。reset-demo 重放安全。
"""
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from sqlalchemy import select  # noqa: E402

from app.models import (  # noqa: E402
    ConfusionPair, DiagnosticDomain, KnowledgeRelation, SyllabusChapter,
    TikuQuestion, audit,
)

SEED_CODE = "DOM-PHARMO-ANS"

# 药名后缀（仅 ≥2 字，用于判定选项是否为药名；不用做开放构词）
DRUG_SUFFIX_RE = re.compile(
    r"(洛尔|地平|普利|沙坦|他汀|西林|头孢|霉素|环素|沙星|替丁|拉唑|"
    r"替尼|单抗|列汀|巴比妥|妥英|西泮|唑仑|麻黄碱|胆碱|磷定|地高辛|"
    r"奎尼丁|胺碘酮|华法林|肝素|胰岛素|吗啡|可待因|地西泮|氯丙嗪|"
    r"多巴胺|黄体酮|雌二醇|睾酮|泼尼松|米松|咪唑|嘧啶|吡嗪|异烟肼|"
    r"利福平|康唑|昔洛韦|蝶呤|尿嘧啶|孢素|美辛|昔布|芬酸|水杨酸|"
    r"秋水仙碱|别嘌醇|苯海拉明|雷他定|雷尼替丁|潘立酮|"
    r"司琼|螺内酯|噻嗪|塞米|硝普钠|肼屈嗪|哌唑嗪|可乐定|利舍平|"
    r"硝酸甘油|强心苷|氨茶碱|色甘酸钠|沙丁胺醇|特布他林|孟鲁司特|"
    r"奥美拉唑|阿奇霉素|罗红霉素|克拉霉素|阿莫西林|氨苄西林|羧苄西林|"
    r"头孢唑林|头孢拉定|头孢曲松|头孢他定|卡那霉素|庆大霉素|妥布霉素|"
    r"新霉素|链霉素|四环素|土霉素|金霉素|米诺环素|多西环素|氯霉素|"
    r"红霉素|林可霉素|克林霉素|万古霉素|多黏菌素|杆菌肽|磺胺嘧啶|"
    r"甲氧苄啶|甲硝唑|替硝唑|呋喃唑酮|诺氟沙星|氧氟沙星|环丙沙星|"
    r"氟康唑|酮康唑|咪康唑|伊曲康唑|氟胞嘧啶|两性霉素|灰黄霉素|"
    r"阿昔洛韦|齐多夫定|利巴韦林|金刚烷胺|环磷酰胺|甲氨蝶呤|氟尿嘧啶|"
    r"博来霉素|紫杉醇|环孢素|倍氯米松|异丙托溴铵|吲哚美辛|布洛芬|"
    r"萘普生|双氯芬酸|塞来昔布|保泰松|丙磺舒|苯溴马隆|哌替啶|芬太尼|"
    r"美沙酮|曲马多|纳洛酮|戊巴比妥|异戊巴比妥|艾司唑仑|三唑仑|咪达唑仑|"
    r"奥沙西泮|氯氮平|佐匹克隆|唑吡坦|苯妥英|卡马西平|丙戊酸|乙琥胺|"
    r"拉莫三嗪|托吡酯|奋乃静|氟哌啶醇|奥氮平|利培酮|喹硫平|阿立哌唑|"
    r"丙米嗪|阿米替林|氟西汀|帕罗西汀|舍曲林|西酞普兰|文拉法辛|碳酸锂|"
    r"左旋多巴|卡比多巴|苄丝肼|苯海索|溴隐亭|司来吉兰|咖啡因|尼可刹米|"
    r"洛贝林|哌甲酯|乙琥胺|普鲁卡因胺|利多卡因|氟卡尼|普罗帕酮|腺苷|"
    r"氯噻嗪|苄氟噻嗪|氯酞酮|吲达帕胺|氨苯蝶啶|阿米洛利|乙酰唑胺|甘露醇|"
    r"山梨醇|香豆素|氯吡格雷|噻氯匹定|双嘧达莫|链激酶|尿激酶|维生素K|"
    r"鱼精蛋白|右旋糖酐|维生素|叶酸|促红素|格列本脲|格列齐特|格列吡嗪|"
    r"瑞格列奈|那格列奈|二甲双胍|阿卡波糖|伏格列波糖|米格列醇|罗格列酮|"
    r"吡格列酮|西格列汀|左甲状腺素|甲巯咪唑|卡比马唑|氢化可的松|地塞米松|"
    r"倍他米松|米非司酮|他莫昔芬|氯米芬|泮托拉唑|兰索拉唑|雷贝拉唑|"
    r"西咪替丁|法莫替丁|硫糖铝|甲氧氯普胺|多潘立酮|昂丹司琼|格拉司琼|"
    r"氯雷他定|西替利嗪|特非那定|阿司咪唑|氯苯那敏|异丙嗪|赛庚啶|山莨菪碱|"
    r"东莨菪碱|丙胺太林|哌仑西平|毛果芸香碱|毒扁豆碱|新斯的明|吡斯的明|"
    r"他克林|多奈哌齐|碘解磷定|氯解磷定|阿苯达唑|甲苯达唑|吡喹酮|青蒿素|"
    r"氯喹|伯氨喹|奎宁|阿托品|肾上腺素|麻黄碱|普萘洛尔|阿司匹林|对乙酰氨基酚|"
    r"吗啡|地西泮|氯丙嗪|地高辛|维拉帕米|硝苯地平|卡托普利|氯沙坦|氢氯噻嗪|"
    r"呋塞米|青霉素|红霉素|四环素|氯霉素|异烟肼|利福平|乙胺丁醇|吡嗪酰胺|"
    r"氟康唑|阿昔洛韦|氟尿嘧啶|别嘌醇|奥美拉唑|泼尼松|甲状腺素|"
    r"丙硫氧嘧啶|格列本脲|二甲双胍|硝酸甘油|氨茶碱|沙丁胺醇|西咪替丁|"
    r"枸橼酸|碳酸氢钠|氯化钾|葡萄糖|甘露醇|可待因|左旋多巴|奎尼丁|"
    r"地西泮|氯雷他定|甲硝唑|缬沙坦|利舍平|可待因|氨茶碱|酮康唑|地高辛)$"
)

# 选项非药名特征（含这些词的选项不是药名，如作用描述、不良反应）
NOT_DRUG_RE = re.compile(
    r"作用|机制|表现|包括|不包括|属于|不属于|增加|减少|抑制|促进|收缩|舒张|"
    r"加快|减慢|升高|降低|AUC|静脉|口服|注射|吸收|分布|代谢|排泄|半衰期|"
    r"清除率|容积|常数|亲和力|活性|效能|强度|受体|通道|酶|蛋白|细胞|"
    r"缺乏症|水肿|头痛|头晕|恶心|呕吐|腹泻|皮疹|过敏|休克|死亡|停搏|"
    r"阻滞|传导|心律|心肌|血压|心率|血糖|血钾|血钙|中毒|过量|成瘾|依赖|"
    r"耐受|反跳|戒断|首剂|维持|负荷|联合|停药|减量|综合征|反应|现象|"
    r"试验|检查|诊断|鉴别|首选|不宜|禁用|慎用|除外|错误|正确|无关|有关|"
    r"疾病|休克|菌痢|伤寒|溃疡|哮喘|心衰|心绞痛|心梗|中风|偏瘫|昏迷|惊厥|"
    r"的|与|及|或|等|用|治疗|用于|可|能|会|使|由|对|将|被|和|同|时|后|前|"
    r"上|下|内|外|大|小|高|低|快|慢|强|弱|新|老|长|短|首|次|每|无|有|不|非|"
    r"性|化|度|率|量|期|时|后|中|白三烯|前列|缓激肽|兒茶|去甲|异丙|糖皮质|胰岛|甲状腺"
)

# 白名单：后缀表未覆盖但题库真实出现的经典药/制剂（出现即收）
STANDALONE_DRUGS = [
    "阿托品", "毛果芸香碱", "碘解磷定", "肾上腺素", "去甲肾上腺素",
    "异丙肾上腺素", "多巴胺", "多巴酚丁胺", "麻黄碱", "间羟胺",
    "普萘洛尔", "阿司匹林", "布洛芬", "吗啡", "可待因", "地西泮",
    "左旋多巴", "氯丙嗪", "氟哌啶醇", "地高辛", "奎尼丁",
    "维拉帕米", "硝苯地平", "卡托普利", "氯沙坦", "氢氯噻嗪",
    "呋塞米", "华法林", "肝素", "青霉素", "红霉素", "四环素",
    "氯霉素", "异烟肼", "利福平", "乙胺丁醇", "吡嗪酰胺",
    "氟康唑", "阿昔洛韦", "环磷酰胺", "甲氨蝶呤", "氟尿嘧啶",
    "环孢素", "别嘌醇", "秋水仙碱", "苯海拉明", "奥美拉唑",
    "泼尼松", "地塞米松", "甲状腺素", "格列本脲", "二甲双胍",
    "阿卡波糖", "叶酸", "硝普钠", "肼屈嗪", "哌唑嗪", "可乐定",
    "利舍平", "硝酸甘油", "强心苷", "氨茶碱", "色甘酸钠",
    "沙丁胺醇", "特布他林", "异丙托溴铵", "孟鲁司特", "西咪替丁",
    "生理盐水", "葡萄糖", "甘露醇", "山梨醇", "氯化钾", "枸橼酸",
    "碳酸氢钠", "维生素", "安宫黄体酮", "黄体酮", "雌激素",
    "雄激素", "睾酮", "丙酸睾酮", "垂体后叶素", "催产素",
    "加压素", "去氨加压素", "甲状腺素", "丙硫氧嘧啶", "甲巯咪唑",
]

MAX_PAIRS_PER_CHAPTER = 6
MIN_PAIR_COUNT = 2


# 选项内药名抽取：2-4 汉字 + 药名后缀（开放位置匹配，命中后剥前导杂字）
OPT_PAT = re.compile(
    r"([\u4e00-\u9fa5]{2,4}(?:洛尔|地平|普利|沙坦|他汀|西林|头孢|霉素|环素|"
    r"沙星|替丁|拉唑|替尼|单抗|列汀|巴比妥|妥英|西泮|唑仑|麻黄碱|乙酰胆碱|琥珀胆碱|磷定|"
    r"地高辛|奎尼丁|胺碘酮|华法林|肝素|胰岛素|吗啡|可待因|地西泮|氯丙嗪|"
    r"多巴胺|泼尼松|米松|咪唑|嘧啶|吡嗪|异烟肼|利福平|康唑|昔洛韦|蝶呤|"
    r"尿嘧啶|孢素|美辛|昔布|芬酸|秋水仙碱|别嘌醇|苯海拉明|雷他定|雷尼替丁|"
    r"潘立酮|司琼|螺内酯|噻嗪|塞米|硝普钠|肼屈嗪|哌唑嗪|可乐定|利舍平|"
    r"硝酸甘油|强心苷|氨茶碱|色甘酸钠|沙丁胺醇|特布他林|孟鲁司特|奥美拉唑|"
    r"阿奇霉素|罗红霉素|克拉霉素|阿莫西林|氨苄西林|头孢唑林|头孢拉定|"
    r"头孢曲松|卡那霉素|庆大霉素|妥布霉素|新霉素|链霉素|四环素|土霉素|"
    r"金霉素|米诺环素|多西环素|氯霉素|红霉素|林可霉素|克林霉素|万古霉素|"
    r"多黏菌素|磺胺嘧啶|甲氧苄啶|甲硝唑|替硝唑|呋喃唑酮|诺氟沙星|氧氟沙星|"
    r"环丙沙星|氟康唑|酮康唑|咪康唑|伊曲康唑|氟胞嘧啶|两性霉素|灰黄霉素|"
    r"阿昔洛韦|齐多夫定|利巴韦林|金刚烷胺|环磷酰胺|甲氨蝶呤|氟尿嘧啶|"
    r"博来霉素|紫杉醇|环孢素|倍氯米松|异丙托溴铵|吲哚美辛|布洛芬|萘普生|"
    r"双氯芬酸|塞来昔布|保泰松|丙磺舒|苯溴马隆|哌替啶|芬太尼|美沙酮|"
    r"曲马多|纳洛酮|戊巴比妥|异戊巴比妥|艾司唑仑|三唑仑|咪达唑仑|奥沙西泮|"
    r"氯氮平|佐匹克隆|唑吡坦|苯妥英|卡马西平|丙戊酸|乙琥胺|拉莫三嗪|"
    r"托吡酯|奋乃静|氟哌啶醇|奥氮平|利培酮|喹硫平|阿立哌唑|丙米嗪|"
    r"阿米替林|氟西汀|帕罗西汀|舍曲林|西酞普兰|文拉法辛|碳酸锂|左旋多巴|"
    r"卡比多巴|苄丝肼|苯海索|溴隐亭|司来吉兰|咖啡因|尼可刹米|洛贝林|"
    r"哌甲酯|普鲁卡因胺|利多卡因|氟卡尼|普罗帕酮|腺苷|氯噻嗪|苄氟噻嗪|"
    r"氯酞酮|吲达帕胺|氨苯蝶啶|阿米洛利|乙酰唑胺|甘露醇|山梨醇|双香豆素|"
    r"氯吡格雷|噻氯匹定|双嘧达莫|链激酶|尿激酶|维生素|促红素|"
    r"格列本脲|格列齐特|格列吡嗪|瑞格列奈|那格列奈|二甲双胍|阿卡波糖|"
    r"伏格列波糖|米格列醇|罗格列酮|吡格列酮|西格列汀|左甲状腺素|甲巯咪唑|"
    r"卡比马唑|氢化可的松|地塞米松|倍他米松|米非司酮|他莫昔芬|氯米芬|"
    r"泮托拉唑|兰索拉唑|雷贝拉唑|西咪替丁|法莫替丁|硫糖铝|甲氧氯普胺|"
    r"多潘立酮|昂丹司琼|格拉司琼|氯雷他定|西替利嗪|特非那定|阿司咪唑|"
    r"氯苯那敏|异丙嗪|赛庚啶|山莨菪碱|东莨菪碱|丙胺太林|哌仑西平|"
    r"毛果芸香碱|毒扁豆碱|新斯的明|吡斯的明|他克林|多奈哌齐|碘解磷定|"
    r"氯解磷定|阿苯达唑|甲苯达唑|吡喹酮|青蒿素|氯喹|伯氨喹|奎宁|阿托品|"
    r"肾上腺素|麻黄碱|普萘洛尔|阿司匹林|吗啡|地西泮|氯丙嗪|地高辛|"
    r"维拉帕米|硝苯地平|卡托普利|氯沙坦|氢氯噻嗪|呋塞米|青霉素|红霉素|"
    r"四环素|氯霉素|异烟肼|利福平|乙胺丁醇|吡嗪酰胺|"
    r"氟康唑|阿昔洛韦|氟尿嘧啶|别嘌醇|奥美拉唑|泼尼松|甲状腺素|"
    r"丙硫氧嘧啶|格列本脲|二甲双胍|硝酸甘油|氨茶碱|沙丁胺醇|西咪替丁|"
    r"枸橼酸|碳酸氢钠|氯化钾|葡萄糖|甘露醇|可待因|左旋多巴|奎尼丁|"
    r"氯雷他定|甲硝唑|缬沙坦|利舍平|氨茶碱|酮康唑))"
)

# 前导短语：命中里夹带的动词/用法/给药途径，先整词剥离
PHRASE_JUNK = (
    "降低", "升高", "加大", "使用", "兴奋", "促进", "抑制", "阻断", "激动",
    "拮抗", "对抗", "合用", "联合", "单用", "停用", "服用", "口服", "静脉",
    "滴注", "注射", "肌注", "静注", "静滴", "外用", "吸入", "含服", "滴眼",
    "细菌", "二氢", "难逆性", "易逆性", "可逆性",
)
# 前导杂字：短语剥离后仍残留的单字，从左逐字剥离
LEAD_JUNK = set("者禁慎用过不敏宜忌停对於于需须应可治疗作用的与及或等小大剂量服注选药合单每初维持负荷静滴注肌眼吸入舌下含服缓控释片胶囊注射液滴丸气雾颗粒散冲服汤煎膏丹协同拮抗增强减弱延长缩短取消阻断激动抑制脉射将使加降给")
# 命中整体非法（含这些则整条丢弃，如药效描述/检验值）
BAD_HIT_RE = re.compile(r"[0-9A-Za-z/%]|作用|机制|表现|亲和|活性|效能|强度|受体|通道|缺乏|水肿|头痛|头晕|恶心|呕吐|腹泻|皮疹|休克|阻滞|传导|心律|心肌|血压|心率|血糖|综合征|反应|现象|试验|检查|诊断|首选|不宜|禁用|慎用|除外|错误|正确|疾病|休克|菌痢|伤寒|溃疡|哮喘|心衰")


def _clean_hit(raw: str) -> str | None:
    t = raw.strip()
    for _ in range(3):
        for ph in PHRASE_JUNK:
            if t.startswith(ph) and len(t) - len(ph) >= 2:
                t = t[len(ph):]
                break
    while len(t) > 2 and t[0] in LEAD_JUNK:
        t = t[1:]
    if not (2 <= len(t) <= 6):
        return None
    if BAD_HIT_RE.search(t):
        return None
    return t


def build_drug_lexicon(tiku: list) -> list[str]:
    """选项内抽取（频次≥2）+ 白名单经典药（题库出现即收）。"""
    found: Counter = Counter()
    for q in tiku:
        for o in q.options or []:
            if not isinstance(o, dict):
                continue
            for m in OPT_PAT.finditer(o.get("text", "") or ""):
                name = _clean_hit(m.group(1))
                if name:
                    found[name] += 1
    lex = {w for w, c in found.items() if c >= 2}
    blob_parts = []
    for q in tiku:
        blob_parts.append(q.stem or "")
        blob_parts.append(q.analysis or "")
    blob = "\n".join(blob_parts)
    for w in STANDALONE_DRUGS:
        if w in blob:
            lex.add(w)
    # 去包含：短词是长词尾部且差≤2字时留长者
    out = set(lex)
    for w in lex:
        for v in lex:
            if w != v and len(w) < len(v) and v.endswith(w) and len(v) - len(w) <= 2:
                out.discard(w)
                break
    return sorted(out, key=len, reverse=True)


def _question_text(q: TikuQuestion) -> str:
    parts = [q.stem or "", q.analysis or ""]
    for o in q.options or []:
        if isinstance(o, dict) and o.get("text"):
            parts.append(o["text"])
    return "\n".join(parts)


def _split_chapters(ref: str) -> list[str]:
    return [c.strip() for c in (ref or "").split(",") if c.strip().startswith("CH")]


def apply_chapter_graphs(db) -> dict:
    """全量章节图谱幂等回填。返回 {relations, pairs} 新增数。"""
    domains = db.execute(select(DiagnosticDomain).where(
        DiagnosticDomain.code.like("DOM-CH%"))).scalars().all()
    if not domains:
        return {"relations": 0, "pairs": 0}
    syl_by_no = {s.book_chapter_no: s for s in
                 db.execute(select(SyllabusChapter)).scalars()}
    tiku = db.execute(select(TikuQuestion)).scalars().all()

    dom_by_ch: dict[str, list] = defaultdict(list)
    for d in domains:
        m = re.search(r"CH(\d+)", d.code)
        if m:
            dom_by_ch[f"CH{int(m.group(1))}"].append(d)

    lexicon = build_drug_lexicon(tiku)

    # 每题命中药名
    q_hits: dict[str, list[str]] = {}
    q_opt_hits: dict[str, list[str]] = {}
    for q in tiku:
        key = f"{q.paper_no}-{q.qid}"
        text = _question_text(q)
        hits = [w for w in lexicon if w in text]
        if hits:
            q_hits[key] = hits
        opt_text = " ".join(o.get("text", "") for o in (q.options or [])
                            if isinstance(o, dict))
        in_opt = [w for w in lexicon if w in opt_text]
        if in_opt:
            q_opt_hits[key] = in_opt

    # 章→药提及聚合
    ch_drug_refs: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for q in tiku:
        hits = q_hits.get(f"{q.paper_no}-{q.qid}")
        if not hits:
            continue
        for ch in _split_chapters(q.chapter_ref):
            for w in hits:
                refs = ch_drug_refs[ch][w]
                if len(refs) < 8:
                    refs.append(f"{q.paper_no}-{q.qid:03d}")

    # 章→药对共现（同题选项内两药同现）
    ch_pair_count: dict[str, Counter] = defaultdict(Counter)
    ch_pair_refs: dict[str, dict[tuple, list[str]]] = defaultdict(lambda: defaultdict(list))
    for q in tiku:
        in_opt = q_opt_hits.get(f"{q.paper_no}-{q.qid}")
        if not in_opt or len(in_opt) < 2:
            continue
        ref = f"{q.paper_no}-{q.qid:03d}"
        for i in range(len(in_opt)):
            for j in range(i + 1, len(in_opt)):
                pair = tuple(sorted((in_opt[i], in_opt[j])))
                for ch in _split_chapters(q.chapter_ref):
                    ch_pair_count[ch][pair] += 1
                    if len(ch_pair_refs[ch][pair]) < 5:
                        ch_pair_refs[ch][pair].append(ref)

    n_rel = n_pair = 0
    for ch, doms in dom_by_ch.items():
        for dom in doms:
            no = int(ch[2:])
            syl = syl_by_no.get(no)
            ch_title = syl.title if syl else dom.name
            chap_node = {"type": "章节", "name": ch_title}
            existing = set()
            for r in db.execute(select(KnowledgeRelation).where(
                    KnowledgeRelation.domain_id == dom.id)).scalars():
                existing.add((tuple(sorted((r.source or {}).items())),
                              r.edge, tuple(sorted((r.target or {}).items()))))

            def add_rel(src, edge, tgt, note, evidence):
                nonlocal n_rel
                key = (tuple(sorted(src.items())), edge, tuple(sorted(tgt.items())))
                if key in existing:
                    return
                db.add(KnowledgeRelation(domain_id=dom.id, source=src,
                                        edge=edge, target=tgt, note=note,
                                        evidence=evidence))
                existing.add(key)
                n_rel += 1

            # 1) 大纲结构边
            if syl:
                for sec in syl.sections or []:
                    if not isinstance(sec, dict):
                        continue
                    sec_title = (sec.get("title") or "").strip()
                    if not sec_title:
                        continue
                    sec_node = {"type": "节", "name": sec_title}
                    add_rel(chap_node, "包含", sec_node, "教学大纲章节结构",
                            {"source": "教学大纲", "chapter": ch_title,
                             "text": f"{ch_title} / {sec_title}",
                             "verified": "结构化大纲原文逐节转写"})
                    for p in sec.get("points", []) or []:
                        p = str(p).strip()
                        if not p:
                            continue
                        if len(p) <= 14 and ("药" in p or "剂" in p):
                            add_rel({"type": "类别", "name": p}, "属于",
                                    chap_node, "大纲知识点术语归属",
                                    {"source": "教学大纲", "chapter": ch_title,
                                     "text": f"{sec_title} / {p}",
                                     "verified": "大纲原文术语"})
                        else:
                            add_rel(sec_node, "包含",
                                    {"type": "知识点", "name": p[:64]},
                                    "教学大纲节下知识点",
                                    {"source": "教学大纲", "chapter": ch_title,
                                     "text": f"{sec_title} / {p[:64]}",
                                     "verified": "大纲原文逐点转写"})

            # 2) 药物归属边（题库共现：本章题目真实提及）
            for drug, refs in sorted(ch_drug_refs.get(ch, {}).items()):
                add_rel({"type": "药物", "name": drug}, "属于", chap_node,
                        f"本章 {len(refs)} 道题库题提及（待顾问审校）",
                        {"source": "题库共现", "chapter": ch_title,
                         "refs": refs[:5], "count": len(refs),
                         "text": f"题库 {', '.join(refs[:5])} 题干/选项/解析提及{drug}",
                         "verified": "题库原文共现计数，非药效断言"})

            # 3) 混淆候选（同题选项共现≥2次）
            have_pairs = {(p.drug_a, p.drug_b) for p in db.execute(
                select(ConfusionPair).where(
                    ConfusionPair.domain_id == dom.id)).scalars()}
            ranked = sorted(ch_pair_count.get(ch, {}).items(),
                            key=lambda kv: (-kv[1], kv[0][0], kv[0][1]))
            # 已有对计入上限：重放时不再追加，保证幂等（此前只计本轮新增，
            # 每次重放多出 ≤6 组/章）。
            made = len(have_pairs)
            for (a, b), c in ranked:
                if made >= MAX_PAIRS_PER_CHAPTER or c < MIN_PAIR_COUNT:
                    break
                if (a, b) in have_pairs:
                    continue
                refs = ch_pair_refs[ch][(a, b)]
                db.add(ConfusionPair(
                    domain_id=dom.id, drug_a=a, drug_b=b,
                    distinction_text=f"{a}与{b}在 {c} 道同章题目的选项中共现，"
                                    f"易混淆，辨析待药理顾问撰写（题号 {', '.join(refs[:5])}）。",
                    variant_template="正向",
                    evidence={"source": "题库共现", "chapter": ch_title,
                              "refs": refs[:5], "count": c,
                              "text": f"同题选项共现 {c} 次：{', '.join(refs[:5])}",
                              "verified": "题库选项原文共现计数"}))
                have_pairs.add((a, b))
                n_pair += 1
                made += 1

    if n_rel or n_pair:
        audit(db, "seed", "chapter_graphs.seeded", "DOM-CH*",
              relations=n_rel, pairs=n_pair)
        db.commit()
    return {"relations": n_rel, "pairs": n_pair,
            "lexicon_size": len(lexicon)}


if __name__ == "__main__":  # python -m seed.seed_chapter_graphs
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        print(apply_chapter_graphs(db))
    finally:
        db.close()
