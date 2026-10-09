# -*- coding: utf-8 -*-
"""独立留存集（40 案例：4 大错因各 10 例，2026-10-07 构建）。

用途：归因 prompt v2（macro-F1 0.9023）在同一 80 案例开发集上迭代三轮得出，
数字存在乐观偏差。本集为定版前独立复测集，与 benchmark_data.BENCHMARK_CASES
零题目重叠（同章不同事实，见各 case_id），构建后从未参与任何 prompt 调优。

编写口径（与开发集一致）：
  - case_id 前缀 HO-（Holdout）；selected_option 为学生错选的干扰项；
  - clinical_rationale 按学生错误自然描述（与开发集文风对齐，不显式标注类别）；
  - expected_code 按章级错因目录规律（MIS-CHxx-01 遗忘/02 混淆/03 机制/04 审题）；
  - 案例金标为技术侧单标注，定版前宜经药理顾问复核。
"""

HOLDOUT_CASES = [
    # ==================== 1. 知识遗忘 (10 例) ====================
    {
        "case_id": "HO-YW-001", "chapter": "CH8",
        "stem": "局麻药液中加入少量肾上腺素的主要目的是：",
        "options": [{"key": "A", "text": "延缓局麻药吸收，延长作用时间并降低吸收中毒"}, {"key": "B", "text": "防止局麻药引起的过敏性休克"}, {"key": "C", "text": "增强局麻药对细菌的杀灭作用"}, {"key": "D", "text": "对抗局麻药引起的支气管痉挛"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH8-01",
        "clinical_rationale": "遗忘了局麻药加肾上腺素是利用其收缩局部血管延缓吸收的药动学目的，误当成抗过敏急救手段。"
    },
    {
        "case_id": "HO-YW-002", "chapter": "CH12",
        "stem": "硫酸镁过量中毒引起呼吸抑制与腱反射消失时，特异性解救药物是：",
        "options": [{"key": "A", "text": "葡萄糖酸钙静脉注射"}, {"key": "B", "text": "纳洛酮"}, {"key": "C", "text": "氟马西尼"}, {"key": "D", "text": "新斯的明"}],
        "selected_option": "D", "expected_category": "知识遗忘", "expected_code": "MIS-CH12-01",
        "clinical_rationale": "遗忘了钙、镁离子相互竞争拮抗的解救常识，误把胆碱酯酶抑制药当成镁中毒解救药。"
    },
    {
        "case_id": "HO-YW-003", "chapter": "CH15",
        "stem": "吗啡用于治疗胆绞痛或肾绞痛时，必须联合应用的药物是：",
        "options": [{"key": "A", "text": "阿托品"}, {"key": "B", "text": "肾上腺素"}, {"key": "C", "text": "纳洛酮"}, {"key": "D", "text": "阿司匹林"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH15-01",
        "clinical_rationale": "遗忘了吗啡兴奋 Oddi 括约肌、升高胆道内压，需与阿托品解痉合用的配伍要点，误以为需常备解救药。"
    },
    {
        "case_id": "HO-YW-004", "chapter": "CH19",
        "stem": "大剂量快速静脉注射可引起突发性耳聋（耳毒性）的利尿药是：",
        "options": [{"key": "A", "text": "呋塞米"}, {"key": "B", "text": "氢氯噻嗪"}, {"key": "C", "text": "螺内酯"}, {"key": "D", "text": "氨苯蝶啶"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH19-01",
        "clinical_rationale": "遗忘了袢利尿药呋塞米的剂量相关耳毒性，把耳毒性风险记到了噻嗪类头上。"
    },
    {
        "case_id": "HO-YW-005", "chapter": "CH20",
        "stem": "高血压危象伴急性左心衰竭，起效最快、可静脉滴注迅速控制血压的药物是：",
        "options": [{"key": "A", "text": "硝普钠"}, {"key": "B", "text": "利血平"}, {"key": "C", "text": "氢氯噻嗪"}, {"key": "D", "text": "可乐定"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH20-01",
        "clinical_rationale": "遗忘了高血压急症静脉降压首选硝普钠（扩张动静脉、起效数秒），误把口服利尿药当成急症首选用药。"
    },
    {
        "case_id": "HO-YW-006", "chapter": "CH22",
        "stem": "强心苷中毒具有诊断价值的特征性视觉症状是：",
        "options": [{"key": "A", "text": "黄视、绿视"}, {"key": "B", "text": "耳鸣"}, {"key": "C", "text": "视野缺损"}, {"key": "D", "text": "夜盲"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH22-01",
        "clinical_rationale": "遗忘了强心苷中枢毒性引起的色视障碍（黄视绿视）这一特征表现，误把水杨酸类的耳鸣当作强心苷中毒指标。"
    },
    {
        "case_id": "HO-YW-007", "chapter": "CH25",
        "stem": "关于长期吸入倍氯米松治疗哮喘的叙述，正确的是：",
        "options": [{"key": "A", "text": "吸入后应漱口，以防口咽部念珠菌感染"}, {"key": "B", "text": "是哮喘急性发作的首选抢救药物"}, {"key": "C", "text": "主要通过直接扩张支气管平滑肌迅速止喘"}, {"key": "D", "text": "无任何局部不良反应"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH25-01",
        "clinical_rationale": "遗忘了吸入性糖皮质激素是长期控制抗炎药物、不能用于急性发作抢救，也没记住吸入后需漱口防口咽真菌感染的护理要点。"
    },
    {
        "case_id": "HO-YW-008", "chapter": "CH27",
        "stem": "恶性贫血（内因子缺乏所致巨幼红细胞性贫血伴神经症状）必须使用的治疗药物是：",
        "options": [{"key": "A", "text": "维生素B12肌内注射"}, {"key": "B", "text": "硫酸亚铁口服"}, {"key": "C", "text": "叶酸单用"}, {"key": "D", "text": "维生素K1"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH27-01",
        "clinical_rationale": "遗忘了恶性贫血的病因是内因子缺乏致B12吸收障碍，误把缺铁性贫血的治疗当成恶性贫血用药。"
    },
    {
        "case_id": "HO-YW-009", "chapter": "CH29",
        "stem": "糖皮质激素隔日疗法的正确给药方法是：",
        "options": [{"key": "A", "text": "将两日总量于隔日清晨8时一次顿服"}, {"key": "B", "text": "每日三次饭后服"}, {"key": "C", "text": "隔日晚间睡前一次顿服"}, {"key": "D", "text": "连续静脉滴注两日后停两日"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH29-01",
        "clinical_rationale": "遗忘了隔日疗法需模拟皮质激素清晨分泌高峰以减轻对肾上腺皮质功能的抑制，把给药时点记成晚间。"
    },
    {
        "case_id": "HO-YW-010", "chapter": "CH30",
        "stem": "硫脲类抗甲状腺药物治疗中最严重、须立即停药并抢救的不良反应是：",
        "options": [{"key": "A", "text": "粒细胞缺乏症"}, {"key": "B", "text": "低血糖反应"}, {"key": "C", "text": "便秘"}, {"key": "D", "text": "骨质疏松"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH30-01",
        "clinical_rationale": "遗忘了硫脲类最严重不良反应是白细胞减少乃至粒细胞缺乏、易诱发感染，误把降糖药的典型不良反应当成抗甲状腺药反应。"
    },
    # ==================== 2. 概念混淆 (10 例) ====================
    {
        "case_id": "HO-HX-001", "chapter": "CH6",
        "stem": "治疗青光眼可滴眼使用的抗胆碱酯酶药是：",
        "options": [{"key": "A", "text": "毒扁豆碱"}, {"key": "B", "text": "新斯的明"}, {"key": "C", "text": "阿托品"}, {"key": "D", "text": "碘解磷定"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH6-02",
        "clinical_rationale": "把新斯的明与毒扁豆碱的给药途径与适应证张冠李戴，忽视新斯的明脂溶性低、不能穿透角膜滴眼给药。"
    },
    {
        "case_id": "HO-HX-002", "chapter": "CH13",
        "stem": "长期应用易引起齿龈增生的抗癫痫药是：",
        "options": [{"key": "A", "text": "苯妥英钠"}, {"key": "B", "text": "苯巴比妥"}, {"key": "C", "text": "乙琥胺"}, {"key": "D", "text": "丙戊酸钠"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH13-02",
        "clinical_rationale": "把苯妥英钠的典型不良反应（齿龈增生）错记到同类的苯巴比妥名下，属于同类药物不良反应归属张冠李戴。"
    },
    {
        "case_id": "HO-HX-003", "chapter": "CH14",
        "stem": "躁狂症基础治疗（心境稳定）首选的药物是：",
        "options": [{"key": "A", "text": "碳酸锂"}, {"key": "B", "text": "丙米嗪"}, {"key": "C", "text": "氟西汀"}, {"key": "D", "text": "阿米替林"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH14-02",
        "clinical_rationale": "把抗抑郁药与抗躁狂药的作用方向记反，误将三环类抗抑郁药当成躁狂症首选基础用药。"
    },
    {
        "case_id": "HO-HX-004", "chapter": "CH19",
        "stem": "能竞争性拮抗醛固酮受体、具有保钾排钠作用的利尿药是：",
        "options": [{"key": "A", "text": "螺内酯"}, {"key": "B", "text": "呋塞米"}, {"key": "C", "text": "氢氯噻嗪"}, {"key": "D", "text": "布美他尼"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH19-02",
        "clinical_rationale": "把保钾利尿药与排钾利尿药的作用特点对调，误认为氢氯噻嗪具有拮抗醛固酮的保钾作用。"
    },
    {
        "case_id": "HO-HX-005", "chapter": "CH20",
        "stem": "高血压患者服用卡托普利后出现顽固性干咳不能耐受，应换用的降压药是：",
        "options": [{"key": "A", "text": "氯沙坦"}, {"key": "B", "text": "依那普利"}, {"key": "C", "text": "雷米普利"}, {"key": "D", "text": "培哚普利"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH20-02",
        "clinical_rationale": "把血管紧张素转换酶抑制药与血管紧张素Ⅱ受体拮抗药两类的干咳副作用归属混淆，误认为同族换药即可解决干咳。"
    },
    {
        "case_id": "HO-HX-006", "chapter": "CH24",
        "stem": "主要降低血浆甘油三酯（TG）、对混合型高脂血症尤其适用的广谱调血脂药是：",
        "options": [{"key": "A", "text": "烟酸（大剂量）"}, {"key": "B", "text": "考来烯胺"}, {"key": "C", "text": "洛伐他汀"}, {"key": "D", "text": "普罗布考"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH24-02",
        "clinical_rationale": "把主要降甘油三酯的烟酸与主要降胆固醇的胆汁酸结合树脂的调脂谱张冠李戴。"
    },
    {
        "case_id": "HO-HX-007", "chapter": "CH25",
        "stem": "仅用于哮喘预防发作、对正在发作的哮喘无效的药物是：",
        "options": [{"key": "A", "text": "色甘酸钠"}, {"key": "B", "text": "沙丁胺醇"}, {"key": "C", "text": "特布他林"}, {"key": "D", "text": "异丙托溴铵"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH25-02",
        "clinical_rationale": "把色甘酸钠与速效支气管扩张剂的临床用途混同，误认为速效止喘药可承担预防发作任务。"
    },
    {
        "case_id": "HO-HX-008", "chapter": "CH35",
        "stem": "对革兰阴性菌作用强、而对革兰阳性菌作用弱于第一代的头孢菌素是：",
        "options": [{"key": "A", "text": "头孢噻肟（第三代）"}, {"key": "B", "text": "头孢唑林（第一代）"}, {"key": "C", "text": "头孢氨苄（第一代）"}, {"key": "D", "text": "青霉素G"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH35-02",
        "clinical_rationale": "把第一代与第三代头孢菌素的抗G+／抗G-谱特点记反，误认为一代头孢对阴性菌作用更强。"
    },
    {
        "case_id": "HO-HX-009", "chapter": "CH38",
        "stem": "可引起与剂量无关、不可逆的再生障碍性贫血的抗生素是：",
        "options": [{"key": "A", "text": "氯霉素"}, {"key": "B", "text": "链霉素"}, {"key": "C", "text": "四环素"}, {"key": "D", "text": "红霉素"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH38-02",
        "clinical_rationale": "把氯霉素特征性血液系统毒性（再生障碍性贫血）与氨基糖苷类耳肾毒性张冠李戴。"
    },
    {
        "case_id": "HO-HX-010", "chapter": "CH34",
        "stem": "治疗厌氧菌感染（如牙周脓肿、腹腔脓肿）首选的抗菌药物是：",
        "options": [{"key": "A", "text": "甲硝唑"}, {"key": "B", "text": "青霉素G"}, {"key": "C", "text": "环丙沙星"}, {"key": "D", "text": "头孢拉定"}],
        "selected_option": "B", "expected_category": "概念混淆", "expected_code": "MIS-CH34-02",
        "clinical_rationale": "把抗厌氧菌首选药甲硝唑与主要针对革兰阳性球菌的青霉素的抗菌谱归属混淆。"
    },
    # ==================== 3. 机制理解不足 (10 例) ====================
    {
        "case_id": "HO-JZ-001", "chapter": "CH35",
        "stem": "磺胺类抗菌作用的生化机制是：",
        "options": [{"key": "A", "text": "与PABA竞争二氢叶酸合成酶，阻碍敏感菌叶酸合成"}, {"key": "B", "text": "抑制二氢叶酸还原酶"}, {"key": "C", "text": "抑制DNA回旋酶"}, {"key": "D", "text": "与50S亚基结合抑制蛋白质合成"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH35-03",
        "clinical_rationale": "对磺胺作用于二氢叶酸合成酶（与PABA竞争）这一靶酶理解不足，与甲氧苄啶抑制的二氢叶酸还原酶环节混淆断链。"
    },
    {
        "case_id": "HO-JZ-002", "chapter": "CH20",
        "stem": "氢氯噻嗪用药初期降压的主要机制是：",
        "options": [{"key": "A", "text": "排钠利尿、细胞外液与血容量减少、心输出量下降"}, {"key": "B", "text": "直接舒张血管平滑肌"}, {"key": "C", "text": "抑制血管紧张素转换酶"}, {"key": "D", "text": "阻断心脏β1受体"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH20-03",
        "clinical_rationale": "未理解噻嗪类初期经容量减少降压、用药2-4周后才转入血管平滑肌舒张为主的时相演变，把长期机制错当成初期机制。"
    },
    {
        "case_id": "HO-JZ-003", "chapter": "CH23",
        "stem": "利多卡因治疗急性心肌梗死并发的室性心律失常的电生理机制是：",
        "options": [{"key": "A", "text": "轻度阻滞钠通道，抑制浦肯野纤维4期自动去极化，相对延长ERP"}, {"key": "B", "text": "阻断β受体减慢窦性心率"}, {"key": "C", "text": "明显延长动作电位时程（APD）与ERP"}, {"key": "D", "text": "阻滞L型钙通道减慢房室传导"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH23-03",
        "clinical_rationale": "对Ib类药轻度阻钠、缩短APD更甚于ERP而相对延长ERP的机制链理解断环，与III类药显著延长APD/ERP的作用方式混同。"
    },
    {
        "case_id": "HO-JZ-004", "chapter": "CH21",
        "stem": "硝苯地平降压时常引起心率加快、面部潮红的机制是：",
        "options": [{"key": "A", "text": "扩张外周动脉→血压下降→压力感受器反射性交感兴奋"}, {"key": "B", "text": "直接激动心脏β1受体"}, {"key": "C", "text": "阻断突触前膜α2受体"}, {"key": "D", "text": "激动窦房结If起搏电流"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH21-03",
        "clinical_rationale": "对\"血管扩张→血压下降→压力感受性反射\"这一因果链推导断环，误认为药物直接作用于窦房结起搏电流。"
    },
    {
        "case_id": "HO-JZ-005", "chapter": "CH22",
        "stem": "强心苷增强衰竭心肌收缩力的同时反而降低心肌耗氧量的原因是：",
        "options": [{"key": "A", "text": "心室容积缩小、室壁张力下降与心率减慢，超过了收缩性增强带来的耗氧增加"}, {"key": "B", "text": "强心苷直接扩张冠脉增加心肌供氧"}, {"key": "C", "text": "强心苷直接抑制心肌能量代谢"}, {"key": "D", "text": "收缩力增强与心肌耗氧量无关"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH22-03",
        "clinical_rationale": "把正常心脏\"收缩力↑耗氧↑\"的规律机械套用于衰竭心脏，未打通\"心腔缩小→室壁张力↓→净耗氧下降\"的因果链。"
    },
    {
        "case_id": "HO-JZ-006", "chapter": "CH25",
        "stem": "沙丁胺醇舒张支气管平滑肌的受体后信号转导通路是：",
        "options": [{"key": "A", "text": "激动β2受体→Gs蛋白→腺苷酸环化酶激活→cAMP↑→蛋白激酶A活化→平滑肌舒张"}, {"key": "B", "text": "激动β2受体→Gi蛋白→cAMP降低"}, {"key": "C", "text": "阻断M3受体→Ca2+内流减少"}, {"key": "D", "text": "抑制磷酸二酯酶→cAMP降解减少"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH25-03",
        "clinical_rationale": "对受体—G蛋白—第二信使通路的衔接理解不足，把异丙托溴铵的M受体阻断机制错配到β2激动剂名下。"
    },
    {
        "case_id": "HO-JZ-007", "chapter": "CH19",
        "stem": "螺内酯利尿作用弱、起效慢且仅在体内有作用的机制解释是：",
        "options": [{"key": "A", "text": "在肾远曲小管和集合管竞争性拮抗醛固酮受体，作用依赖体内醛固酮水平"}, {"key": "B", "text": "直接抑制髓袢升支Na+-K+-2Cl-共转运子"}, {"key": "C", "text": "抑制近曲小管碳酸酐酶"}, {"key": "D", "text": "拮抗集合管水通道蛋白的ADH效应"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH19-03",
        "clinical_rationale": "未理解螺内酯是醛固酮受体竞争性拮抗剂（受体水平、依赖激素水平、起效慢），把它当成与袢利尿药相同的直接转运蛋白抑制剂。"
    },
    {
        "case_id": "HO-JZ-008", "chapter": "CH27",
        "stem": "肝素体内抗凝的分子机制是：",
        "options": [{"key": "A", "text": "增强抗凝血酶Ⅲ（AT-Ⅲ）活性，加速灭活凝血因子Ⅱa与Ⅹa"}, {"key": "B", "text": "拮抗维生素K环氧化物还原酶"}, {"key": "C", "text": "直接溶解已形成的纤维蛋白血栓"}, {"key": "D", "text": "抑制血小板环氧酶减少TXA2生成"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH27-03",
        "clinical_rationale": "对肝素经AT-Ⅲ间接灭活凝血因子的作用链条理解不足，把抗血小板药的作用靶点错误套用到肝素名下。"
    },
    {
        "case_id": "HO-JZ-009", "chapter": "CH16",
        "stem": "苯海索改善帕金森病震颤、对流涎多汗有效的机制是：",
        "options": [{"key": "A", "text": "中枢阻断胆碱受体，恢复多巴胺—乙酰胆碱功能平衡"}, {"key": "B", "text": "在脑内转变为多巴胺补充递质"}, {"key": "C", "text": "直接激动纹状体多巴胺受体"}, {"key": "D", "text": "抑制儿茶酚-O-甲基转移酶减少多巴胺降解"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH16-03",
        "clinical_rationale": "对中枢胆碱受体阻断、恢复DA/ACh平衡的作用方式理解不足，与左旋多巴补充递质的机制张冠李戴。"
    },
    {
        "case_id": "HO-JZ-010", "chapter": "CH30",
        "stem": "磺酰脲类（格列本脲）降血糖的作用机制是：",
        "options": [{"key": "A", "text": "阻断胰岛B细胞膜ATP敏感钾通道→去极化→电压门控钙通道开放→胰岛素释放"}, {"key": "B", "text": "直接作用于外周组织促进葡萄糖摄取，不依赖胰岛B细胞"}, {"key": "C", "text": "抑制小肠α-葡萄糖苷酶延缓糖吸收"}, {"key": "D", "text": "激活AMPK抑制肝糖异生"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH30-03",
        "clinical_rationale": "对磺酰脲类经钾通道促胰岛素释放、须依赖残存胰岛B细胞功能的机制链理解不足，误当作直接增敏利用葡萄糖的药物。"
    },
    # ==================== 4. 审题与应用失误 (10 例) ====================
    {
        "case_id": "HO-ST-001", "chapter": "CH17",
        "stem": "患者男，48岁，胃镜确诊消化性溃疡活动期，近日膝关节骨关节炎疼痛明显。宜选用的镇痛药物是：",
        "options": [{"key": "A", "text": "对乙酰氨基酚"}, {"key": "B", "text": "阿司匹林"}, {"key": "C", "text": "布洛芬"}, {"key": "D", "text": "双氯芬酸"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH17-04",
        "clinical_rationale": "审题漏看\"消化性溃疡活动期\"病史，忽视NSAIDs抑制胃黏膜COX-1、破坏黏膜屏障诱发溃疡出血的风险（对乙酰氨基酚无此顾虑）。"
    },
    {
        "case_id": "HO-ST-002", "chapter": "CH15",
        "stem": "支气管哮喘患者外伤后剧痛，下列镇痛药中禁用的是：",
        "options": [{"key": "A", "text": "吗啡"}, {"key": "B", "text": "对乙酰氨基酚"}, {"key": "C", "text": "曲马多"}, {"key": "D", "text": "布桂嗪"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH15-04",
        "clinical_rationale": "审题未识别\"禁用\"反向提问方向，错选了对哮喘安全的对乙酰氨基酚（吗啡因促进组胺释放诱发支气管痉挛并抑制呼吸而禁用于哮喘）。"
    },
    {
        "case_id": "HO-ST-003", "chapter": "CH20",
        "stem": "患者男，60岁，高血压病2级，痛风病史5年、近月急性发作1次。该患者不宜选用的降压药是：",
        "options": [{"key": "A", "text": "氢氯噻嗪"}, {"key": "B", "text": "氨氯地平"}, {"key": "C", "text": "氯沙坦"}, {"key": "D", "text": "美托洛尔"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH20-04",
        "clinical_rationale": "审题漏看痛风病史，忽视噻嗪类利尿药减少尿酸排泄、升高血尿酸诱发痛风急性发作（氯沙坦反而有促尿酸排泄作用）。"
    },
    {
        "case_id": "HO-ST-004", "chapter": "CH22",
        "stem": "患者女，55岁，超声心动图确诊肥厚型梗阻性心肌病，活动后气促。该患者禁用的强心药物是：",
        "options": [{"key": "A", "text": "地高辛"}, {"key": "B", "text": "美托洛尔"}, {"key": "C", "text": "维拉帕米"}, {"key": "D", "text": "呋塞米"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH22-04",
        "clinical_rationale": "审题漏看\"肥厚型梗阻\"限定，未识别增强心肌收缩力会加重左室流出道梗阻（地高辛禁忌；β阻断剂负性肌力反而适用）。"
    },
    {
        "case_id": "HO-ST-005", "chapter": "CH25",
        "stem": "患者女，62岁，闭角型青光眼病史，近日哮喘急性发作。不宜选用的平喘药是：",
        "options": [{"key": "A", "text": "异丙托溴铵"}, {"key": "B", "text": "沙丁胺醇"}, {"key": "C", "text": "氨茶碱"}, {"key": "D", "text": "布地奈德"}],
        "selected_option": "D", "expected_category": "审题与应用失误", "expected_code": "MIS-CH25-04",
        "clinical_rationale": "审题漏看闭角型青光眼病史，忽视异丙托溴铵抗M作用可升高眼压、加重青光眼（布地奈德吸入无此禁忌）。"
    },
    {
        "case_id": "HO-ST-006", "chapter": "CH27",
        "stem": "患者男，65岁，机械心脏瓣膜置换术后长期服用华法林，近日头痛自购镇痛药。最应避免合用的药物是：",
        "options": [{"key": "A", "text": "阿司匹林"}, {"key": "B", "text": "对乙酰氨基酚"}, {"key": "C", "text": "法莫替丁"}, {"key": "D", "text": "维生素B1"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH27-04",
        "clinical_rationale": "审题漏看长期华法林抗凝背景，忽视阿司匹林协同抗血小板并竞争血浆蛋白结合、显著升高出血风险（对乙酰氨基酚短期使用相对安全）。"
    },
    {
        "case_id": "HO-ST-007", "chapter": "CH29",
        "stem": "下列患者中不宜使用泼尼松的是：",
        "options": [{"key": "A", "text": "癫痫病史患者"}, {"key": "B", "text": "系统性红斑狼疮患者"}, {"key": "C", "text": "肾病综合征患者"}, {"key": "D", "text": "哮喘持续状态患者"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH29-04",
        "clinical_rationale": "审题漏看\"癫痫病史\"这一糖皮质激素相对禁忌情境，并把激素适应证（肾病综合征）误判为禁忌人群。"
    },
    {
        "case_id": "HO-ST-008", "chapter": "CH30",
        "stem": "患者男，78岁，2型糖尿病伴慢性肾功能减退（eGFR 35ml/min），不宜选用的口服降糖药是：",
        "options": [{"key": "A", "text": "格列本脲"}, {"key": "B", "text": "格列喹酮"}, {"key": "C", "text": "阿卡波糖"}, {"key": "D", "text": "瑞格列奈"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH30-04",
        "clinical_rationale": "审题漏看老年+肾功能减退限定，未识别格列本脲强效长效、代谢产物经肾排泄蓄积致严重低血糖的风险（格列喹酮主要经胆道排泄，肾功能不全相对安全）。"
    },
    {
        "case_id": "HO-ST-009", "chapter": "CH34",
        "stem": "患者女，28岁，癫痫病史，确诊单纯性尿路感染。应避免选用的抗菌药物是：",
        "options": [{"key": "A", "text": "环丙沙星"}, {"key": "B", "text": "阿莫西林"}, {"key": "C", "text": "磷霉素"}, {"key": "D", "text": "呋喃妥因"}],
        "selected_option": "D", "expected_category": "审题与应用失误", "expected_code": "MIS-CH34-04",
        "clinical_rationale": "审题漏看癫痫病史，忽视氟喹诺酮类降低惊厥阈值、可诱发癫痫发作的神经系统风险（呋喃妥因用于单纯性尿路感染相对安全）。"
    },
    {
        "case_id": "HO-ST-010", "chapter": "CH38",
        "stem": "患者男，47岁，重症肌无力（吡斯的明控制中）合并肺部感染。应避免使用的抗菌药物是：",
        "options": [{"key": "A", "text": "庆大霉素"}, {"key": "B", "text": "青霉素G"}, {"key": "C", "text": "头孢曲松"}, {"key": "D", "text": "阿奇霉素"}],
        "selected_option": "D", "expected_category": "审题与应用失误", "expected_code": "MIS-CH38-04",
        "clinical_rationale": "审题漏看重症肌无力基础病，忽视氨基糖苷类抑制神经肌肉接头传递、可诱发肌无力危象加重的应用风险（阿奇霉素无此作用）。"
    },
]

CATEGORIES = ["知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"]


def get_holdout_cases() -> list[dict]:
    """获取独立留存集全部 40 案例。"""
    return list(HOLDOUT_CASES)


def verify_holdout_integrity() -> dict:
    """核验留存集规模与四类配额（各 10 例）。"""
    cases = get_holdout_cases()
    assert len(cases) == 40, f"留存集应为 40 例，实得 {len(cases)}"
    counts: dict[str, int] = {}
    ids = set()
    for c in cases:
        cat = c["expected_category"]
        counts[cat] = counts.get(cat, 0) + 1
        assert c["case_id"] not in ids, f"案例编号重复: {c['case_id']}"
        ids.add(c["case_id"])
        assert c["selected_option"] in {o["key"] for o in c["options"]}, f"{c['case_id']} selected_option 非法"
    for cat in CATEGORIES:
        assert counts.get(cat, 0) == 10, f"类别 {cat} 应为 10 例 (实得 {counts.get(cat, 0)})"
    return counts


if __name__ == "__main__":
    sys_path_check = verify_holdout_integrity()
    print("Holdout dataset verified:")
    for k, v in sys_path_check.items():
        print(f"  {k}: {v} cases")
    # 与开发集重叠检查（case_id 与题干去重）
    from eval.benchmark_data import BENCHMARK_CASES
    dev_ids = {c["case_id"] for c in BENCHMARK_CASES}
    dev_stems = {c["stem"] for c in BENCHMARK_CASES}
    overlap = [c["case_id"] for c in HOLDOUT_CASES
               if c["case_id"] in dev_ids or c["stem"] in dev_stems]
    assert not overlap, f"与开发集重叠: {overlap}"
    print(f"与开发集 80 例零重叠 ✓ (dev ids={len(dev_ids)})")
