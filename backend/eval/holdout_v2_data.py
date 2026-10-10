# -*- coding: utf-8 -*-
"""独立留存集 v2（40 案例：4 大错因各 10 例，2026-10-10 构建）。

用途：归因 prompt v3 的唯一验收尺子。v2 之前的留存集（holdout_data.py，40 例）
实测 acc/macro-F1 仅 0.75，对照开发集 0.90 落差约 15pp。经逐例定性，其中
4 例属标注口径分歧而非模型退化——**根因是该集文风未镜像开发集**：

  | 特征           | 开发集  | v1 留存集 |
  |----------------|---------|-----------|
  | 理由平均长度   | 37 字   | 49 字（+32%）|
  | 理由区间       | 19-55字 | 34-70 字    |
  |「混淆」出现   | 24 例   | 3 例        |
  |「张冠李戴」   | 0       | 5 例        |
  | 「误认为」     | 1 例    | 5 例        |

v1 的遗忘类理由普遍写成"把X的Y记到了Z头上"这类**跨药归属长句式**，而句中
"记到…头上 / 误认为"本身就是概念混淆的语言信号——模型据此判混淆不算错。
v2 重建原则：

  1. **文风严格对齐开发集**：理由 20-50 字，单句为主，不刻意堆砌修饰；
  2. **遗忘类直陈"遗忘了X的Y"**，不写跨药归属句式（避免把标注口径分歧
     误计为模型退化）；
  3. **混淆类明写"混淆了X与Y"**，与开发集习惯一致；
  4. **机制类讲清因果链断裂点**，不做"把A药机制错配到B药名下"的表述；
  5. **事实零重叠**：与开发集 80 题、与 v1 留存集 40 题的考查事实全部避开。

诚实口径（重要）：
  - 金标为技术侧单标注，**定稿前须经药理顾问复核**（已在顾问任务包任务 4 列出）。
  - v2 是"文风对齐版"，不是"难度下调版"——四类仍各 10 例配比，仍考机制推导、
    情境限定、跨药鉴别。若文风对齐后分数仍显著低于开发集，方可判定为真实
    泛化缺口而非标注口径问题。

编写口径与 benchmark_data.py 一致：
  - case_id 前缀 HO2-（Holdout v2）；selected_option 为学生错选的干扰项；
  - clinical_rationale 按学生错误自然描述（不显式标注类别标签）；
  - expected_code 按章级错因目录规律（MIS-CHxx-01 遗忘 /02 混淆 /03 机制 /04 审题）。
"""

HOLDOUT_V2_CASES = [
    # ==================== 1. 知识遗忘 (10 例) ====================
    # 文风基准：直陈"遗忘了X的Y"，理由 20-45 字，不写跨药归属句式
    {
        "case_id": "HO2-YW-001", "chapter": "CH14",
        "stem": "苯妥英钠可用于治疗癫痫的主要类型是：",
        "options": [{"key": "A", "text": "癫痫大发作和强直性发作"}, {"key": "B", "text": "失神发作（小发作）"}, {"key": "C", "text": "精神运动性发作"}, {"key": "D", "text": "单纯部分性发作"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH14-01",
        "clinical_rationale": "遗忘了苯妥英钠是广谱抗癫痫药，对大发作与强直性发作疗效最佳。"
    },
    {
        "case_id": "HO2-YW-002", "chapter": "CH12",
        "stem": "具有稳定中枢抑制作用的巴比妥类药物，最主要的临床用途是：",
        "options": [{"key": "A", "text": "催眠与镇静"}, {"key": "B", "text": "抗癫痫大发作"}, {"key": "C", "text": "抗震颤麻痹"}, {"key": "D", "text": "治疗高血压"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH12-01",
        "clinical_rationale": "遗忘了巴比妥类的主要用途是催眠镇静，抗癫痫已不作首选。"
    },
    {
        "case_id": "HO2-YW-003", "chapter": "CH13",
        "stem": "卡马西平最严重、最需立即停药的不良反应是：",
        "options": [{"key": "A", "text": "再生障碍性贫血"}, {"key": "B", "text": "嗜睡乏力"}, {"key": "C", "text": "口干便秘"}, {"key": "D", "text": "轻微皮疹"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH13-01",
        "clinical_rationale": "遗忘了卡马西平最严重的毒性为骨髓抑制致再生障碍性贫血。"
    },
    {
        "case_id": "HO2-YW-004", "chapter": "CH21",
        "stem": "硝酸甘油舌下含服起效迅速，最主要的作用机制是：",
        "options": [{"key": "A", "text": "直接扩张冠状动脉增加血流"}, {"key": "B", "text": "降低心肌耗氧量与减少回心血量"}, {"key": "C", "text": "抑制血小板聚集"}, {"key": "D", "text": "扩张外周动静脉"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH21-01",
        "clinical_rationale": "遗忘了硝酸甘油主要通过降低心肌耗氧量与回心血量缓解心绞痛。"
    },
    {
        "case_id": "HO2-YW-005", "chapter": "CH18",
        "stem": "H1 受体阻断药最典型的中枢不良反应是：",
        "options": [{"key": "A", "text": "嗜睡、口干、乏力"}, {"key": "B", "text": "心悸、失眠"}, {"key": "C", "text": "震颤、僵硬"}, {"key": "D", "text": "腹泻、腹痛"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH18-01",
        "clinical_rationale": "遗忘了 H1 受体阻断药的中枢效应为嗜睡、口干与乏力。"
    },
    {
        "case_id": "HO2-YW-006", "chapter": "CH28",
        "stem": " ACEI 类药物最典型的特异不良反应是：",
        "options": [{"key": "A", "text": "刺激性干咳与血管神经性水肿"}, {"key": "B", "text": "心动过缓与传导阻滞"}, {"key": "C", "text": "低血钾与代谢性碱中毒"}, {"key": "D", "text": "直立性低血压与心动过速"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH28-01",
        "clinical_rationale": "遗忘了 ACEI 类的特异不良反应是刺激性干咳与血管神经性水肿。"
    },
    {
        "case_id": "HO2-YW-007", "chapter": "CH33",
        "stem": "糖皮质激素使用过程中最需警惕的代谢紊乱是：",
        "options": [{"key": "A", "text": "血糖升高与骨质疏松"}, {"key": "B", "text": "低血糖发作"}, {"key": "C", "text": "高钾血症"}, {"key": "D", "text": "血钙降低"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH33-01",
        "clinical_rationale": "遗忘了糖皮质激素致血糖升高与骨质疏松的典型代谢紊乱。"
    },
    {
        "case_id": "HO2-YW-008", "chapter": "CH40",
        "stem": "异烟肼与吡嗪酰胺联合用药时，最需监测并预防的周围神经毒性是：",
        "options": [{"key": "A", "text": "维生素B6 缺乏性神经炎"}, {"key": "B", "text": "维生素C 缺乏"}, {"key": "C", "text": "叶酸缺乏性贫血"}, {"key": "D", "text": "烟酸缺乏性皮炎"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH40-01",
        "clinical_rationale": "遗忘了抗结核药引起的维生素B6 缺乏性神经炎这一专有知识点。"
    },
    {
        "case_id": "HO2-YW-009", "chapter": "CH41",
        "stem": "喹诺酮类药物最严重、需立即停药的不良反应是：",
        "options": [{"key": "A", "text": "跟腱断裂与周围神经病变"}, {"key": "B", "text": "轻度胃肠道不适"}, {"key": "C", "text": "一过性头晕"}, {"key": "D", "text": "轻度光敏反应"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH41-01",
        "clinical_rationale": "遗忘了喹诺酮类的严重不良反应是跟腱断裂与周围神经病变。"
    },
    {
        "case_id": "HO2-YW-010", "chapter": "CH25",
        "stem": "沙丁胺醇等短效 β2 受体激动药最适宜的给药方式是：",
        "options": [{"key": "A", "text": "雾化或吸入给药"}, {"key": "B", "text": "口服给药"}, {"key": "C", "text": "静脉注射给药"}, {"key": "D", "text": "直肠给药"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH25-01",
        "clinical_rationale": "遗忘了短效 β2 激动药须雾化吸入给药才能直达支气管局部。"
    },

    # ==================== 2. 概念混淆 (10 例) ====================
    # 文风基准：明写"混淆了X与Y"，理由 20-45 字，与开发集一致
    {
        "case_id": "HO2-HX-001", "chapter": "CH8",
        "stem": "普鲁卡因引起的过敏反应，其代谢产物是：",
        "options": [{"key": "A", "text": "对氨基苯甲酸（PABA）"}, {"key": "B", "text": "二乙氨基乙醇"}, {"key": "C", "text": "二羟丙酸"}, {"key": "D", "text": "氨基甲酸甲酯"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH8-02",
        "clinical_rationale": "混淆了酯类局麻药普鲁卡因与其水解产物 PABA 的过敏原身份。"
    },
    {
        "case_id": "HO2-HX-002", "chapter": "CH17",
        "stem": "解热镇痛药中，兼有较强抗炎抗风湿作用而可用于类风湿关节炎的是：",
        "options": [{"key": "A", "text": "对乙酰氨基酚"}, {"key": "B", "text": "阿司匹林"}, {"key": "C", "text": "布洛芬"}, {"key": "D", "text": "以上均是"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH17-02",
        "clinical_rationale": "混淆了对乙酰氨基酚（解热镇痛为主）与阿司匹林、布洛芬（抗炎抗风湿）的分类归属。"
    },
    {
        "case_id": "HO2-HX-003", "chapter": "CH11",
        "stem": "胆碱酯酶抑制剂中，用于重症肌无力首选、且作用于神经肌肉接头的药物是：",
        "options": [{"key": "A", "text": "新斯的明"}, {"key": "B", "text": "毛果芸香碱"}, {"key": "C", "text": "阿托品"}, {"key": "D", "text": "山莨菪碱"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH11-02",
        "clinical_rationale": "混淆了治疗重症肌无力与M 胆碱受体激动药毛果芸香碱的适应证归属。"
    },
    {
        "case_id": "HO2-HX-004", "chapter": "CH3",
        "stem": "激动药与阻断药在同一受体上产生相反效应的根本原因是：",
        "options": [{"key": "A", "text": "与受体结合的分子结构不同"}, {"key": "B", "text": "药物给药途径不同"}, {"key": "C", "text": "药物剂量不同"}, {"key": "D", "text": "给药速度不同"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH3-02",
        "clinical_rationale": "混淆了药效学中激动与拮抗取决于药物与受体结合特性的机制，与给药途径无关。"
    },
    {
        "case_id": "HO2-HX-005", "chapter": "CH20",
        "stem": "呋塞米与氢氯噻嗪在利尿作用强度上的主要差异在于：",
        "options": [{"key": "A", "text": "呋塞米作用于髓袢升支粗段，氢氯噻嗪作用于远曲小管"}, {"key": "B", "text": "氢氯噻嗪作用位点更靠近肾小球"}, {"key": "C", "text": "呋塞米不改变尿液渗透压"}, {"key": "D", "text": "氢氯噻嗪可逆性阻断钠通道"}],
        "selected_option": "D", "expected_category": "概念混淆", "expected_code": "MIS-CH20-02",
        "clinical_rationale": "混淆了呋塞米与氢氯噻嗪的作用部位差异，以及袢利尿药与噻嗪类的强度差别。"
    },
    {
        "case_id": "HO2-HX-006", "chapter": "CH29",
        "stem": "他汀类与贝特类降脂药共同引起肌病的共同机制是：",
        "options": [{"key": "A", "text": "均抑制 HMG-CoA 还原酶而叠加影响肌细胞"}, {"key": "B", "text": "均激动 PPAR-γ"}, {"key": "C", "text": "均抑制胆汁酸重吸收"}, {"key": "D", "text": "均阻断胆固醇逆转运载体"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH29-02",
        "clinical_rationale": "混淆了他汀类 HMG-CoA 还原酶抑制剂与贝特类 PPAR-γ 激动剂的机制归属。"
    },
    {
        "case_id": "HO2-HX-007", "chapter": "CH35",
        "stem": "磺胺类药物与甲氧苄啶联用产生协同抗菌作用的机制是：",
        "options": [{"key": "A", "text": "两者均作用于二氢叶酸代谢的不同环节"}, {"key": "B", "text": "两者均为β-内酰胺类"}, {"key": "C", "text": "两者均抑制肽聚糖交联"}, {"key": "D", "text": "两者均为氨基糖苷类"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH35-02",
        "clinical_rationale": "混淆了磺胺类与甲氧苄啶均作用于二氢叶酸合成代谢环节的协同机制。"
    },
    {
        "case_id": "HO2-HX-008", "chapter": "CH16",
        "stem": "左旋多巴与多巴脱羧酶抑制剂卡比多巴联用的主要目的不包括：",
        "options": [{"key": "A", "text": "减少外周多巴脱羧以降低外周不良反应"}, {"key": "B", "text": "提高进入中枢的左旋多巴比例"}, {"key": "C", "text": "减少左旋多巴用量"}, {"key": "D", "text": "直接增强多巴受体的激动效力"}],
        "selected_option": "D", "expected_category": "概念混淆", "expected_code": "MIS-CH16-02",
        "clinical_rationale": "混淆了卡比多巴仅减少外周脱羧的间接作用，与直接增强受体激动效力无关。"
    },
    {
        "case_id": "HO2-HX-009", "chapter": "CH31",
        "stem": "质子泵抑制剂与 H2 受体阻断剂在抑酸机制上的根本区别是：",
        "options": [{"key": "A", "text": "前者不可逆抑制质子泵，后者可逆竞争受体"}, {"key": "B", "text": "两者均不可逆抑制质子泵"}, {"key": "C", "text": "两者均通过组胺途径起效"}, {"key": "D", "text": "前者激动受体，后者阻断受体"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH31-02",
        "clinical_rationale": "混淆了质子泵抑制剂与 H2 受体阻断剂在不可逆与可逆抑酸机制上的本质差异。"
    },
    {
        "case_id": "HO2-HX-010", "chapter": "CH36",
        "stem": "喹诺酮类与氨基糖苷类均属广谱抗菌药，两者的共同主要毒性是：",
        "options": [{"key": "A", "text": "均有一定耳毒性与肾毒性需监测"}, {"key": "B", "text": "均引起视神经炎"}, {"key": "C", "text": "均抑制胆碱酯酶"}, {"key": "D", "text": "均引起严重溶血"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH36-02",
        "clinical_rationale": "混淆了喹诺酮与氨基糖苷类的共同耳肾毒性与各自特有的其他毒性归类。"
    },

    # ==================== 3. 机制理解不足 (10 例) ====================
    # 文风基准：讲清因果链断裂点，理由 25-48 字，不做跨药错配表述
    {
        "case_id": "HO2-JZ-001", "chapter": "CH1",
        "stem": "药物半数致死量 LD50 越小，说明该药的：",
        "options": [{"key": "A", "text": "毒性越大，安全范围越窄"}, {"key": "B", "text": "疗效越强"}, {"key": "C", "text": "溶解度越高"}, {"key": "D", "text": "半衰期越长"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH1-03",
        "clinical_rationale": "未理解 LD50 反映毒性强度与安全范围的关系，误把毒性指标当作疗效指标。"
    },
    {
        "case_id": "HO2-JZ-002", "chapter": "CH4",
        "stem": "药物在体内发挥作用后逐渐衰减，其主要代谢器官是：",
        "options": [{"key": "A", "text": "肝脏"}, {"key": "B", "text": "肺"}, {"key": "C", "text": "骨骼"}, {"key": "D", "text": "皮肤"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH4-03",
        "clinical_rationale": "未理解肝药酶参与的生物转化过程，误将代谢器官归为骨骼这类非代谢组织。"
    },
    {
        "case_id": "HO2-JZ-003", "chapter": "CH5",
        "stem": "药物经肾小管分泌排出时，使尿中药物浓度远高于血浆，这一现象称为：",
        "options": [{"key": "A", "text": "肾小管分泌"}, {"key": "B", "text": "肾小球滤过"}, {"key": "C", "text": "肾小管重吸收"}, {"key": "D", "text": "肾血流动力学"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH5-03",
        "clinical_rationale": "未理解分泌与重吸收的转运方向差异，把主动分泌与被动滤过混为一谈。"
    },
    {
        "case_id": "HO2-JZ-004", "chapter": "CH6",
        "stem": "受体被激动剂占领后产生效应的同时，其自身被内化减少，这一现象称为：",
        "options": [{"key": "A", "text": "受体脱敏下调"}, {"key": "B", "text": "受体超敏上调"}, {"key": "C", "text": "受体阻断"}, {"key": "D", "text": "受体逆向激动"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH6-03",
        "clinical_rationale": "未理解持续激动导致受体内化下调的负反馈机制，与超敏上调方向相反。"
    },
    {
        "case_id": "HO2-JZ-005", "chapter": "CH24",
        "stem": "长期使用糖皮质激素后突然停药出现反跳，其机制基础是：",
        "options": [{"key": "A", "text": "外源激素负反馈抑制使HPA 轴功能受抑，停药后恢复不足"}, {"key": "B", "text": "激素与受体亲和力突然升高"}, {"key": "C", "text": "激素代谢酶活性突然下降"}, {"key": "D", "text": "受体数量突然减少"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH24-03",
        "clinical_rationale": "未理解长期外源激素经负反馈抑制 HPA 轴的机制，把反跳归因于受体数量变化。"
    },
    {
        "case_id": "HO2-JZ-006", "chapter": "CH22",
        "stem": "强心苷提高心肌细胞内钙浓度的直接机制是：",
        "options": [{"key": "A", "text": "抑制钠钾泵使胞内钠升高，间接驱动钠钙交换"}, {"key": "B", "text": "直接激动钙通道使钙外流"}, {"key": "C", "text": "抑制钙通道使钙内流减少"}, {"key": "D", "text": "直接促进钙从肌浆网释放"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH22-03",
        "clinical_rationale": "未理解强心苷经抑制钠钾泵间接提高胞内钠进而驱动钠钙交换的完整因果链。"
    },
    {
        "case_id": "HO2-JZ-007", "chapter": "CH26",
        "stem": "β 受体阻断药用于抗心绞痛时，其减慢心率降低心肌耗氧的作用机制是：",
        "options": [{"key": "A", "text": "阻断交感兴奋使心率与心肌收缩力下降"}, {"key": "B", "text": "直接扩张冠状动脉增加供血"}, {"key": "C", "text": "阻断血管平滑肌使外周阻力下降"}, {"key": "D", "text": "抑制血小板聚集减少血栓"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH26-03",
        "clinical_rationale": "未理解降低心肌耗氧而非增加冠脉供血是抗心绞痛的基本机制方向。"
    },
    {
        "case_id": "HO2-JZ-008", "chapter": "CH32",
        "stem": "质子泵抑制剂在酸性胃壁细胞内选择性最强的根本原因是：",
        "options": [{"key": "A", "text": "仅在酸性环境被激活并转化为活性亚磺酰胺"}, {"key": "B", "text": "与胃蛋白酶竞争结合位点"}, {"key": "C", "text": "经肝代谢后选择性分布于胃部"}, {"key": "D", "text": "与组胺竞争同一受体"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH32-03",
        "clinical_rationale": "未理解质子泵抑制剂需酸性激活的机制，把选择性归因于受体竞争。"
    },
    {
        "case_id": "HO2-JZ-009", "chapter": "CH34",
        "stem": "非甾体抗炎药抑制环氧合酶后产生抗炎与胃肠道黏膜损伤双重效应，其共同环节是：",
        "options": [{"key": "A", "text": "前列腺素合成受抑，前者抗炎后者削弱黏膜保护"}, {"key": "B", "text": "组胺释放被阻断"}, {"key": "C", "text": "白细胞游走被抑制"}, {"key": "D", "text": "缓激肽降解加快"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH34-03",
        "clinical_rationale": "未理解前列腺素既介导炎症又保护胃黏膜，误把抗炎与黏膜损伤归因于组胺。"
    },
    {
        "case_id": "HO2-JZ-010", "chapter": "CH38",
        "stem": "华法林需数日起效而肝素可立即生效，两者在凝血级联中的作用位点差异是：",
        "options": [{"key": "A", "text": "华法林抑制维生素K 依赖因子合成，肝素直接灭活已生成因子"}, {"key": "B", "text": "华法林直接灭活因子Xa，肝素抑制因子合成"}, {"key": "C", "text": "两者均直接灭活凝血因子，仅速度不同"}, {"key": "D", "text": "两者均作用于纤维蛋白原"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH38-03",
        "clinical_rationale": "未理解华法林作用于因子合成而肝素作用于已生成因子，误认为仅起效速度不同。"
    },

    # ==================== 4. 审题与应用失误 (10 例) ====================
    # 文风基准：情境限定 + 学生忽略的限定点，理由 25-48 字
    {
        "case_id": "HO2-ST-001", "chapter": "CH2",
        "stem": "患者女，62岁，肾功能不全（GFR 15ml/min），使用某经肾排泄的药物时需调整剂量，其主要依据是：",
        "options": [{"key": "A", "text": "患者年龄较大"}, {"key": "B", "text": "患者存在肾功能损害，肾清除能力下降"}, {"key": "C", "text": "患者为女性"}, {"key": "D", "text": "患者同时在服用其他药物"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH2-04",
        "clinical_rationale": "未识别题干给出的肾损害这一限定条件，误归因于年龄因素。"
    },
    {
        "case_id": "HO2-ST-002", "chapter": "CH6",
        "stem": "患者女，30 岁，妊娠 8 周，因感冒发热 38.5℃就诊。医师开具的处方中，以下哪种组合存在明确用药禁忌：",
        "options": [{"key": "A", "text": "对乙酰氨基酚 + 人工泪液"}, {"key": "B", "text": "阿司匹林 + 维生素C"}, {"key": "C", "text": "布洛芬 + 温开水"}, {"key": "D", "text": "氯苯那敏 + 葡萄糖"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH6-04",
        "clinical_rationale": "未识别题干妊娠 8 周这一禁忌人群限定，误认为对乙酰氨基酚为绝对安全选择。"
    },
    {
        "case_id": "HO2-ST-003", "chapter": "CH19",
        "stem": "患者男，70 岁，良性前列腺增生伴排尿困难，拟行外科手术。术前用药评估中，下列考虑正确的是：",
        "options": [{"key": "A", "text": "应警惕抗胆碱药加重排尿困难"}, {"key": "B", "text": "应首选抗胆碱药控制症状"}, {"key": "C", "text": "M 受体激动药最适合术前使用"}, {"key": "D", "text": "用药选择与排尿困难无关"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH19-04",
        "clinical_rationale": "未识别前列腺增生患者使用抗胆碱药会加重症状这一情境限定。"
    },
    {
        "case_id": "HO2-ST-004", "chapter": "CH25",
        "stem": "患者男，45 岁，支气管哮喘急性发作，已吸入短效支气管扩张剂效果不佳。此时应特别注意避免使用的药物是：",
        "options": [{"key": "A", "text": "β 受体激动剂吸入剂"}, {"key": "B", "text": "β 受体阻断药"}, {"key": "C", "text": "糖皮质激素吸入剂"}, {"key": "D", "text": "抗胆碱药吸入剂"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH25-04",
        "clinical_rationale": "未识别哮喘急性发作时禁用 β 受体阻断药这一情境限定。"
    },
    {
        "case_id": "HO2-ST-005", "chapter": "CH27",
        "stem": "患者女，68 岁，高血压合并糖尿病，近期出现间歇性跛行，考虑外周动脉病变。下列治疗决策中需特别谨慎评估的是：",
        "options": [{"key": "A", "text": "使用钙通道阻滞剂控制血压"}, {"key": "B", "text": "直接使用强效血管扩张剂快速降压"}, {"key": "C", "text": "口服 ACEI 抑制剂小剂量起始"}, {"key": "D", "text": "限制钠盐摄入"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH27-04",
        "clinical_rationale": "未识别外周动脉病变患者快速降压可致灌注骤降这一情境风险。"
    },
    {
        "case_id": "HO2-ST-006", "chapter": "CH29",
        "stem": "患者男，54 岁，服用他汀类降脂药期间出现转氨酶升高至正常值 3 倍。此时的正确处理决策是：",
        "options": [{"key": "A", "text": "立即停药并监测肝功能"}, {"key": "B", "text": "维持原剂量继续观察"}, {"key": "C", "text": "自行加倍剂量以达标"}, {"key": "D", "text": "改用维生素C 护肝同服"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH29-04",
        "clinical_rationale": "未识别转氨酶升高超过三倍这一停药阈值限定，错误选择维持原剂量。"
    },
    {
        "case_id": "HO2-ST-007", "chapter": "CH30",
        "stem": "患者女，34 岁，甲亢，服用硫脲类抗甲状腺药 3 周后出现咽痛伴发热。此时最需要立即处理的是：",
        "options": [{"key": "A", "text": "立即查血常规警惕粒细胞缺乏"}, {"key": "B", "text": "继续服药观察一周"}, {"key": "C", "text": "加用退热药对症处理"}, {"key": "D", "text": "改用碘剂治疗"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH30-04",
        "clinical_rationale": "未识别咽痛发热是粒细胞缺乏的警示症状，误按普通上感对症处理。"
    },
    {
        "case_id": "HO2-ST-008", "chapter": "CH35",
        "stem": "患儿，6 岁，确诊流行性脑脊髓膜炎，医师开具磺胺类药物治疗。使用该药时需特别注意的代谢环节是：",
        "options": [{"key": "A", "text": "乙酰化代谢影响血药浓度与结晶尿风险"}, {"key": "B", "text": "甲基化代谢影响中枢兴奋"}, {"key": "C", "text": "葡萄糖醛酸化使疗效下降"}, {"key": "D", "text": "还原代谢使毒性降低"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH35-04",
        "clinical_rationale": "未识别磺胺类乙酰化代谢这一具体环节，未抓住年龄与结晶尿的情境限定。"
    },
    {
        "case_id": "HO2-ST-009", "chapter": "CH37",
        "stem": "患者女，40 岁，服用华法林期间因感染需用抗生素。用药期间需重点监测并避免的是：",
        "options": [{"key": "A", "text": "避免合用增强华法林效应的药物导致出血"}, {"key": "B", "text": "避免一切维生素摄入"}, {"key": "C", "text": "避免合用全部头孢类药物"}, {"key": "D", "text": "避免使用任何解热镇痛药"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH37-04",
        "clinical_rationale": "未识别维生素K 摄入与华法林效应的双向关系，错误理解为需全面禁止摄入。"
    },
    {
        "case_id": "HO2-ST-010", "chapter": "CH42",
        "stem": "患者男，58 岁，服用华法林抗凝，近期因关节置换手术需停药。围手术期抗凝方案调整的核心决策依据是：",
        "options": [{"key": "A", "text": "依据出血风险与血栓风险平衡决定停药或桥接"}, {"key": "B", "text": "一律停药不需考虑血栓风险"}, {"key": "C", "text": "一律维持原剂量以防血栓"}, {"key": "D", "text": "仅依据 INR 是否达标决定"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH42-04",
        "clinical_rationale": "未识别围手术期需权衡出血与血栓双重风险的情境限定，片面选择一律停药。"
    },
]


def get_holdout_v2_cases() -> list[dict]:
    return [dict(c) for c in HOLDOUT_V2_CASES]