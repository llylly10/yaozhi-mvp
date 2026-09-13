# -*- coding: utf-8 -*-
"""标准保护测试集（80 案例配额：4 大类各 20 例）。
与开发集和常规刷题集隔离，专用于检验错因诊断引擎的泛化识别能力与红线门禁。
四类：
  - 知识遗忘 (20 例)
  - 概念混淆 (20 例)
  - 机制理解不足 (20 例)
  - 审题与应用失误 (20 例)
"""

BENCHMARK_CASES = [
    # ==================== 1. 知识遗忘 (20 例) ====================
    {
        "case_id": "BM-YW-001", "chapter": "CH5",
        "stem": "关于阿托品对眼的作用，下列说法正确的是：",
        "options": [{"key": "A", "text": "缩瞳、降眼压、调节麻痹"}, {"key": "B", "text": "散瞳、升眼压、调节麻痹"}, {"key": "C", "text": "缩瞳、降眼压、调节痉挛"}, {"key": "D", "text": "散瞳、降眼压、调节痉挛"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-ANS-01",
        "clinical_rationale": "学生将阿托品散瞳与缩瞳的效应方向记反，属于单纯记忆反转与基础知识遗忘。"
    },
    {
        "case_id": "BM-YW-002", "chapter": "CH6",
        "stem": "毛果芸香碱滴眼后对视力的影响主要是：",
        "options": [{"key": "A", "text": "视近物模糊、视远物清楚"}, {"key": "B", "text": "视近物清楚、视远物模糊"}, {"key": "C", "text": "视近视远均模糊"}, {"key": "D", "text": "对视力无影响"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-ANS-04",
        "clinical_rationale": "学生遗忘了调节痉挛的屈光特征（视近清楚视远模糊），混淆了麻痹与痉挛的物像特征。"
    },
    {
        "case_id": "BM-YW-003", "chapter": "CH8",
        "stem": "下列局麻药中，使用前必须进行皮肤过敏试验的是：",
        "options": [{"key": "A", "text": "利多卡因"}, {"key": "B", "text": "布比卡因"}, {"key": "C", "text": "普鲁卡因"}, {"key": "D", "text": "罗哌卡因"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH8-01",
        "clinical_rationale": "遗忘了酯类局麻药（普鲁卡因）代谢产物PABA致过敏需皮试，而酰胺类不过敏的常规考点。"
    },
    {
        "case_id": "BM-YW-004", "chapter": "CH12",
        "stem": "地西泮过量引起的急性中毒，特异性解救拮抗药物是：",
        "options": [{"key": "A", "text": "纳洛酮"}, {"key": "B", "text": "氟马西尼"}, {"key": "C", "text": "新斯的明"}, {"key": "D", "text": "硫酸阿托品"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH12-01",
        "clinical_rationale": "遗忘了苯二氮䓬受体特异拮抗药氟马西尼，机械照搬了阿片受体解毒剂纳洛酮。"
    },
    {
        "case_id": "BM-YW-005", "chapter": "CH15",
        "stem": "吗啡急性严重过量致呼吸衰竭深度昏迷时，首选的拮抗解毒药是：",
        "options": [{"key": "A", "text": "纳洛酮"}, {"key": "B", "text": "氟马西尼"}, {"key": "C", "text": "间羟胺"}, {"key": "D", "text": "尼可刹米"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH15-01",
        "clinical_rationale": "阿片类特异解毒剂知识点遗忘，误选氟马西尼。"
    },
    {
        "case_id": "BM-YW-006", "chapter": "CH27",
        "stem": "静脉注射大量肝素引起的自发性出血，选用的特异性解救药物是：",
        "options": [{"key": "A", "text": "维生素K1"}, {"key": "B", "text": "硫酸鱼精蛋白"}, {"key": "C", "text": "氨甲环酸"}, {"key": "D", "text": "酚磺乙胺"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH27-01",
        "clinical_rationale": "遗忘了肝素带强负电荷需用强正电荷鱼精蛋白中和，误选华法林解药维生素K。"
    },
    {
        "case_id": "BM-YW-007", "chapter": "CH27",
        "stem": "口服过量双香豆素或华法林引起的大出血，应首选哪种药物急救：",
        "options": [{"key": "A", "text": "硫酸鱼精蛋白"}, {"key": "B", "text": "维生素K1"}, {"key": "C", "text": "去甲肾上腺素"}, {"key": "D", "text": "氯化钙"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH27-02",
        "clinical_rationale": "遗忘了香豆素类抗凝剂的解毒剂为维生素K1。"
    },
    {
        "case_id": "BM-YW-008", "chapter": "CH35",
        "stem": "青霉素过敏性休克发生时，首选的抢救一线药物是：",
        "options": [{"key": "A", "text": "肾上腺素"}, {"key": "B", "text": "糖皮质激素"}, {"key": "C", "text": "去甲肾上腺素"}, {"key": "D", "text": "异丙嗪"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH35-01",
        "clinical_rationale": "遗忘过敏性休克首选首剂必须是肾上腺素（快速升压舒张气道），误选起效慢的激素。"
    },
    {
        "case_id": "BM-YW-009", "chapter": "CH37",
        "stem": "庆大霉素等氨基糖苷类抗生素最严重的高危特征毒性是：",
        "options": [{"key": "A", "text": "胃肠道溃疡"}, {"key": "B", "text": "耳毒性与肾毒性"}, {"key": "C", "text": "肝细胞变性坏死"}, {"key": "D", "text": "高血糖"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH37-01",
        "clinical_rationale": "基础药物毒副反应知识点遗忘，未识别出前庭/耳蜗及肾损害。"
    },
    {
        "case_id": "BM-YW-010", "chapter": "CH38",
        "stem": "长期大量口服四环素引起儿童骨骼发育不良及牙齿永久性黄染，该不良反应称为：",
        "options": [{"key": "A", "text": "四环素牙"}, {"key": "B", "text": "灰婴综合征"}, {"key": "C", "text": "赫氏反应"}, {"key": "D", "text": "二重感染"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH38-01",
        "clinical_rationale": "遗忘了四环素与钙离子螯合沉积于牙本质，误记为氯霉素的灰婴综合征。"
    },
    {
        "case_id": "BM-YW-011", "chapter": "CH38",
        "stem": "氯霉素最严重且常呈不可逆性、可致死的不良反应是：",
        "options": [{"key": "A", "text": "再生障碍性贫血"}, {"key": "B", "text": "急性胰腺炎"}, {"key": "C", "text": "视神经炎"}, {"key": "D", "text": "耳蜗神经坏死"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH38-02",
        "clinical_rationale": "遗忘氯霉素抑制造血系统引起的致命再障，误选视神经炎（乙胺丁醇不良反应）。"
    },
    {
        "case_id": "BM-YW-012", "chapter": "CH39",
        "stem": "患者服用抗结核药物异烟肼出现四肢麻木、针刺感，应加服哪种维生素防治：",
        "options": [{"key": "A", "text": "维生素B1"}, {"key": "B", "text": "维生素B6"}, {"key": "C", "text": "维生素C"}, {"key": "D", "text": "维生素B12"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH39-01",
        "clinical_rationale": "遗忘了异烟肼竞争性对抗维生素B6引起外周神经炎的专有知识点。"
    },
    {
        "case_id": "BM-YW-013", "chapter": "CH39",
        "stem": "服用利福平后患者排泄物呈橘红色，该现象属于：",
        "options": [{"key": "A", "text": "急性溶血反应"}, {"key": "B", "text": "正常排泄染色无害"}, {"key": "C", "text": "严重肝毒性先兆"}, {"key": "D", "text": "急性肾功能衰竭"}],
        "selected_option": "A", "expected_category": "知识遗忘", "expected_code": "MIS-CH39-02",
        "clinical_rationale": "遗忘了利福平代谢产物本身具有橘红色排泄特征的临床常识，误当溶血。"
    },
    {
        "case_id": "BM-YW-014", "chapter": "CH39",
        "stem": "乙胺丁醇最特征的特异性毒副反应是：",
        "options": [{"key": "A", "text": "球后视神经炎及红绿色盲"}, {"key": "B", "text": "听力减退"}, {"key": "C", "text": "外周神经炎"}, {"key": "D", "text": "高血糖危象"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH39-03",
        "clinical_rationale": "遗忘乙胺丁醇靶向眼底毒性，误选链霉素的听力减退。"
    },
    {
        "case_id": "BM-YW-015", "chapter": "CH42",
        "stem": "大剂量甲氨蝶呤化疗后为防止严重骨髓毒性，必须使用的特异救援药物是：",
        "options": [{"key": "A", "text": "亚叶酸钙"}, {"key": "B", "text": "维生素B12"}, {"key": "C", "text": "叶酸片"}, {"key": "D", "text": "美司钠"}],
        "selected_option": "C", "expected_category": "知识遗忘", "expected_code": "MIS-CH42-01",
        "clinical_rationale": "遗忘MTX阻断二氢叶酸还原酶后普通叶酸无法还原，必须补充还原型亚叶酸钙。"
    },
    {
        "case_id": "BM-YW-016", "chapter": "CH42",
        "stem": "环磷酰胺在大剂量给药时，为防止丙烯醛所致出血性膀胱炎，应静脉注射：",
        "options": [{"key": "A", "text": "美司钠"}, {"key": "B", "text": "亚叶酸钙"}, {"key": "C", "text": "鱼精蛋白"}, {"key": "D", "text": "碳酸氢钠"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH42-02",
        "clinical_rationale": "遗忘环磷酰胺特异解毒保护药美司钠，混淆了甲氨蝶呤的解毒药。"
    },
    {
        "case_id": "BM-YW-017", "chapter": "CH20",
        "stem": "可乐定突然停药后血压急剧剧烈反弹回升，这种现象称为：",
        "options": [{"key": "A", "text": "反跳现象"}, {"key": "B", "text": "后遗效应"}, {"key": "C", "text": "耐受现象"}, {"key": "D", "text": "特异质反应"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH20-01",
        "clinical_rationale": "基础药理学术语概念遗忘，将停药反跳现象误认为残留后遗效应。"
    },
    {
        "case_id": "BM-YW-018", "chapter": "CH21",
        "stem": "心绞痛急性发作时，硝酸甘油最正确的给药途径是：",
        "options": [{"key": "A", "text": "舌下含服"}, {"key": "B", "text": "吞服普通片"}, {"key": "C", "text": "肌内注射"}, {"key": "D", "text": "局部热敷涂抹"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH21-01",
        "clinical_rationale": "遗忘硝酸甘油首过消除达90%口服无效、必须舌下含服急救的药动学事实。"
    },
    {
        "case_id": "BM-YW-019", "chapter": "CH22",
        "stem": "强心苷（地高辛）治疗心房颤动最根本的电生理机制是：",
        "options": [{"key": "A", "text": "抑制房室结传导减慢心室率"}, {"key": "B", "text": "转复房颤为窦性节律"}, {"key": "C", "text": "降低心房自律性"}, {"key": "D", "text": "缩短房室结不应期"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH22-01",
        "clinical_rationale": "遗忘强心苷不转复房颤、仅通过抑制房室传导保护心室率的机制常考点。"
    },
    {
        "case_id": "BM-YW-020", "chapter": "CH30",
        "stem": "胰岛素保存温度不当变性失效，其最适宜的冷藏储存温度为：",
        "options": [{"key": "A", "text": "2℃~8℃"}, {"key": "B", "text": "-20℃冷冻"}, {"key": "C", "text": "室温25℃以上"}, {"key": "D", "text": "0℃以下结冰"}],
        "selected_option": "B", "expected_category": "知识遗忘", "expected_code": "MIS-CH30-01",
        "clinical_rationale": "遗忘胰岛素为蛋白质冷冻结冰会破坏变性的保管常识。"
    },

    # ==================== 2. 概念混淆 (20 例) ====================
    {
        "case_id": "BM-HX-001", "chapter": "CH5",
        "stem": "有机磷酸酯类中毒时出现肌束颤动（N样症状），应选用的解救药物是：",
        "options": [{"key": "A", "text": "阿托品"}, {"key": "B", "text": "碘解磷定"}, {"key": "C", "text": "新斯的明"}, {"key": "D", "text": "毛果芸香碱"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-ANS-06",
        "clinical_rationale": "概念混淆：把阿托品（仅拮抗M样症状）与碘解磷定（复活胆碱酯酶、解除N样肌颤）的解救分工混为一谈。"
    },
    {
        "case_id": "BM-HX-002", "chapter": "CH7",
        "stem": "过敏性休克与感染中毒性休克的选药不同，抢救过敏性休克应首选：",
        "options": [{"key": "A", "text": "去甲肾上腺素"}, {"key": "B", "text": "肾上腺素"}, {"key": "C", "text": "多巴胺"}, {"key": "D", "text": "异丙肾上腺素"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH7-01",
        "clinical_rationale": "混淆了去甲肾上腺素（仅收缩血管升高外周阻力）与肾上腺素（兼具强心、舒张支气管、升高血压三联急救）的受体选择性。"
    },
    {
        "case_id": "BM-HX-003", "chapter": "CH7",
        "stem": "休克合并急性少尿时，为保护肾脏功能并升高血压，首选的血管活性药是：",
        "options": [{"key": "A", "text": "去甲肾上腺素"}, {"key": "B", "text": "多巴胺"}, {"key": "C", "text": "肾上腺素"}, {"key": "D", "text": "麻黄碱"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH7-02",
        "clinical_rationale": "将强烈收缩肾血管导致少尿坏死的去甲肾上腺素，与特异性舒张肾血管的多巴胺概念混淆。"
    },
    {
        "case_id": "BM-HX-004", "chapter": "CH13",
        "stem": "癫痫典型失神发作（小发作）的首选治疗药物是：",
        "options": [{"key": "A", "text": "苯妥英钠"}, {"key": "B", "text": "乙琥胺"}, {"key": "C", "text": "卡马西平"}, {"key": "D", "text": "苯巴比妥"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH13-01",
        "clinical_rationale": "概念混淆：误把大发作首选药苯妥英钠当成小发作药物（苯妥英钠对失神发作不仅无效还会加重）。"
    },
    {
        "case_id": "BM-HX-005", "chapter": "CH14",
        "stem": "长期服用抗精神病药氯丙嗪最常见的神经系统不良反应是：",
        "options": [{"key": "A", "text": "锥体外系反应"}, {"key": "B", "text": "惊厥发作"}, {"key": "C", "text": "共济失调"}, {"key": "D", "text": "嗜睡昏迷"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH14-01",
        "clinical_rationale": "混淆了黑质-纹状体多巴胺通路阻断致锥体外系反应与小脑共济失调的神经机制定位。"
    },
    {
        "case_id": "BM-HX-006", "chapter": "CH17",
        "stem": "小剂量阿司匹林（75~100mg/d）用于防治心肌梗死与脑卒中的机制是：",
        "options": [{"key": "A", "text": "抗炎解热"}, {"key": "B", "text": "不可逆抑制血小板COX-1减少TXA2"}, {"key": "C", "text": "直接溶解已形成的血栓"}, {"key": "D", "text": "促进前列环素PGI2合成"}],
        "selected_option": "C", "expected_category": "概念混淆", "expected_code": "MIS-CH17-01",
        "clinical_rationale": "把阿司匹林的抗血小板聚集防栓形成，混淆为溶栓酶类（链激酶/尿激酶）的直接溶栓概念。"
    },
    {
        "case_id": "BM-HX-007", "chapter": "CH17",
        "stem": "对阿司匹林引起的哮喘（阿司匹林哮喘），其发生的本质机制是：",
        "options": [{"key": "A", "text": "IgE介导的I型变态反应"}, {"key": "B", "text": "抑制COX使脂氧酶旁路白三烯生成骤增"}, {"key": "C", "text": "直接兴奋支气管M受体"}, {"key": "D", "text": "阻断支气管β2受体"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH17-02",
        "clinical_rationale": "把代谢分流导致白三烯蓄积的假性过敏，误当成了典型的IgE抗原抗体免疫变态反应。"
    },
    {
        "case_id": "BM-HX-008", "chapter": "CH19",
        "stem": "下列利尿药中，属于作用于髓袢升支粗段的高效利尿药是：",
        "options": [{"key": "A", "text": "氢氯噻嗪"}, {"key": "B", "text": "呋塞米"}, {"key": "C", "text": "螺内酯"}, {"key": "D", "text": "氨苯蝶啶"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH19-01",
        "clinical_rationale": "混淆了中效远曲小管近端利尿药（氢氯噻嗪）与高效袢利尿药（呋塞米）。"
    },
    {
        "case_id": "BM-HX-009", "chapter": "CH20",
        "stem": "高血压伴变异型心绞痛患者，降压药首选：",
        "options": [{"key": "A", "text": "普萘洛尔"}, {"key": "B", "text": "硝苯地平"}, {"key": "C", "text": "卡托普利"}, {"key": "D", "text": "氯沙坦"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH20-02",
        "clinical_rationale": "混淆了劳力性心绞痛与变异型心绞痛选药，把变异型心绞痛禁用的普萘洛尔当成首选。"
    },
    {
        "case_id": "BM-HX-010", "chapter": "CH21",
        "stem": "阵发性室上性心动过速急性发作时，静脉给药首选的高效抗心律失常药是：",
        "options": [{"key": "A", "text": "利多卡因"}, {"key": "B", "text": "维拉帕米"}, {"key": "C", "text": "硝苯地平"}, {"key": "D", "text": "奎尼丁"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH21-02",
        "clinical_rationale": "概念混淆：把室性心律失常首选的利多卡因，与室上性心动过速首选的维拉帕米搞混。"
    },
    {
        "case_id": "BM-HX-011", "chapter": "CH23",
        "stem": "急性心肌梗死引起的室性心动过速及室早，静脉注射首选：",
        "options": [{"key": "A", "text": "维拉帕米"}, {"key": "B", "text": "利多卡因"}, {"key": "C", "text": "普萘洛尔"}, {"key": "D", "text": "地高辛"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH23-01",
        "clinical_rationale": "室性心律失常与室上性心律失常选药混淆。"
    },
    {
        "case_id": "BM-HX-012", "chapter": "CH24",
        "stem": "主要降低血浆低密度脂蛋白胆固醇（LDL-C）的调血脂药物是：",
        "options": [{"key": "A", "text": "吉非罗齐"}, {"key": "B", "text": "阿托伐他汀"}, {"key": "C", "text": "非诺贝特"}, {"key": "D", "text": "烟酸"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH24-01",
        "clinical_rationale": "混淆了他汀类（降胆固醇与LDL）和贝特类（主要降甘油三酯）的靶向脂蛋白亚型。"
    },
    {
        "case_id": "BM-HX-013", "chapter": "CH25",
        "stem": "哮喘急性发作迅速缓解气道痉挛的一线速效吸入药物是：",
        "options": [{"key": "A", "text": "色甘酸钠"}, {"key": "B", "text": "沙丁胺醇"}, {"key": "C", "text": "倍氯米松"}, {"key": "D", "text": "孟鲁司特"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH25-01",
        "clinical_rationale": "把仅能用于预防哮喘发作的色甘酸钠，误当成急性发作平喘速效解痉药。"
    },
    {
        "case_id": "BM-HX-014", "chapter": "CH26",
        "stem": "下列药物中，属于胃壁细胞质子泵（H+-K+-ATP酶）抑制剂的是：",
        "options": [{"key": "A", "text": "雷尼替丁"}, {"key": "B", "text": "奥美拉唑"}, {"key": "C", "text": "法莫替丁"}, {"key": "D", "text": "哌仑西平"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH26-01",
        "clinical_rationale": "把H2受体阻断药雷尼替丁与质子泵抑制剂（PPI）奥美拉唑的分类混淆。"
    },
    {
        "case_id": "BM-HX-015", "chapter": "CH30",
        "stem": "2型糖尿病超重肥胖患者，首选的基础口服降血糖药物是：",
        "options": [{"key": "A", "text": "格列本脲"}, {"key": "B", "text": "二甲双胍"}, {"key": "C", "text": "阿卡波糖"}, {"key": "D", "text": "罗格列酮"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH30-02",
        "clinical_rationale": "混淆了胰岛素促泌剂格列本脲（易增重和低血糖）与双胍类二甲双胍（减轻胰岛素抵抗、减重）的适应证。"
    },
    {
        "case_id": "BM-HX-016", "chapter": "CH31",
        "stem": "甲状腺功能亢进内科长期抗甲状腺药物治疗，其首要基础药物是：",
        "options": [{"key": "A", "text": "复方碘溶液"}, {"key": "B", "text": "甲巯咪唑"}, {"key": "C", "text": "普萘洛尔"}, {"key": "D", "text": "左甲状腺素"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH31-01",
        "clinical_rationale": "混淆了仅用于术前准备或危象救急的大剂量碘剂（产生碘脱敏失效），与长期抑制激素合成的硫脲类。"
    },
    {
        "case_id": "BM-HX-017", "chapter": "CH34",
        "stem": "治疗流行性脑脊髓膜炎（流脑）首选的磺胺类药物是：",
        "options": [{"key": "A", "text": "磺胺嘧啶银"}, {"key": "B", "text": "磺胺嘧啶"}, {"key": "C", "text": "柳氮磺吡啶"}, {"key": "D", "text": "磺胺醋酰钠"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH34-01",
        "clinical_rationale": "将外用烧伤抗感染的磺胺嘧啶银与血脑屏障穿透率高的口服磺胺嘧啶概念混淆。"
    },
    {
        "case_id": "BM-HX-018", "chapter": "CH36",
        "stem": "治疗金黄色葡萄球菌急慢性骨髓炎的最佳首选抗生素是：",
        "options": [{"key": "A", "text": "红霉素"}, {"key": "B", "text": "克林霉素"}, {"key": "C", "text": "头孢唑林"}, {"key": "D", "text": "多黏菌素"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH36-01",
        "clinical_rationale": "混淆了大环内酯类红霉素与骨组织浓度极高的克林霉素的组织穿透优势。"
    },
    {
        "case_id": "BM-HX-019", "chapter": "CH40",
        "stem": "新型隐球菌性脑膜炎抗真菌治疗首选的具有高脑脊液穿透力的唑类药物是：",
        "options": [{"key": "A", "text": "酮康唑"}, {"key": "B", "text": "氟康唑"}, {"key": "C", "text": "咪康唑"}, {"key": "D", "text": "灰黄霉素"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH40-01",
        "clinical_rationale": "混淆了不易透入脑脊液且肝毒性大的第一代咪唑类酮康唑，与高水溶透脑屏障的三唑类氟康唑。"
    },
    {
        "case_id": "BM-HX-020", "chapter": "CH42",
        "stem": "属于细胞周期特异性（S期）抗代谢抗肿瘤药的是：",
        "options": [{"key": "A", "text": "环磷酰胺"}, {"key": "B", "text": "氟尿嘧啶"}, {"key": "C", "text": "顺铂"}, {"key": "D", "text": "多柔比星"}],
        "selected_option": "A", "expected_category": "概念混淆", "expected_code": "MIS-CH42-03",
        "clinical_rationale": "混淆了周期非特异性烷化剂环磷酰胺与S期特异性抗代谢药氟尿嘧啶。"
    },

    # ==================== 3. 机制理解不足 (20 例) ====================
    {
        "case_id": "BM-JZ-001", "chapter": "CH5",
        "stem": "阿托品滴眼后导致眼内压升高的确切机制链条是：",
        "options": [{"key": "A", "text": "阻断瞳孔括约肌M受体→散瞳→前房角变窄→房水回流受阻"}, {"key": "B", "text": "激动瞳孔括约肌M受体→缩瞳→前房角变窄→房水外流增加"}, {"key": "C", "text": "松弛睫状肌→悬韧带拉紧→晶状体变凸→眼球充血"}, {"key": "D", "text": "收缩巩膜静脉窦→房水生成剧增"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-ANS-03",
        "clinical_rationale": "未能理解阿托品散瞳通过机械性挤压虹膜根部使前房角变窄、房水回路堵塞的解剖生理因果机制。"
    },
    {
        "case_id": "BM-JZ-002", "chapter": "CH5",
        "stem": "毛果芸香碱引起调节痉挛使视近物清楚视远物模糊的机制推导是：",
        "options": [{"key": "A", "text": "阻断睫状肌M受体→睫状肌松弛→悬韧带放松→晶状体变扁平"}, {"key": "B", "text": "激动睫状肌M受体→睫状肌向中心收缩→悬韧带松弛→晶状体自身回缩变凸→屈光度增大"}, {"key": "C", "text": "激动瞳孔开大肌→睫状肌麻痹→视网膜成像后移"}, {"key": "D", "text": "收缩瞳孔括约肌→视神经血流剧增"}],
        "selected_option": "A", "expected_category": "机制理解不足", "expected_code": "MIS-ANS-10",
        "clinical_rationale": "对睫状肌收缩引起悬韧带放松、晶状体曲率变大的调节痉挛力学因果逻辑理解断环。"
    },
    {
        "case_id": "BM-JZ-003", "chapter": "CH12",
        "stem": "苯二氮䓬类（地西泮）与巴比妥类相比，其抗焦虑镇静安全性极高的根本机制是：",
        "options": [{"key": "A", "text": "地西泮仅促进GABA诱发的Cl-通道开放频率，依赖内源性GABA存在"}, {"key": "B", "text": "地西泮能不依赖GABA直接大量打开Cl-通道"}, {"key": "C", "text": "地西泮在中枢抑制胆碱酯酶"}, {"key": "D", "text": "地西泮破坏突触后膜受体"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH12-02",
        "clinical_rationale": "未理解地西泮必须变构依赖GABA增加通道开放频率（受生理天花板限制）的内在安全机制。"
    },
    {
        "case_id": "BM-JZ-004", "chapter": "CH16",
        "stem": "卡比多巴单用对帕金森病无效，但与左旋多巴合用疗效倍增且副作用减轻的原因是：",
        "options": [{"key": "A", "text": "卡比多巴在中枢促进多巴胺受体增殖"}, {"key": "B", "text": "卡比多巴在外周抑制多巴脱羧酶，不透过血脑屏障，使更多左旋多巴进入中枢"}, {"key": "C", "text": "卡比多巴直接转变成多巴胺"}, {"key": "D", "text": "卡比多巴阻断纹状体胆碱受体"}],
        "selected_option": "A", "expected_category": "机制理解不足", "expected_code": "MIS-CH16-01",
        "clinical_rationale": "未能理解卡比多巴作为外周酶抑制剂保护左旋多巴穿透血脑屏障的药动-药效协同机制。"
    },
    {
        "case_id": "BM-JZ-005", "chapter": "CH17",
        "stem": "阿司匹林解热镇痛药抗炎作用强，但对胃黏膜具有明显刺激和致溃疡的机制是：",
        "options": [{"key": "A", "text": "抑制胃壁COX-1导致内源性保护性PGE2和PGI2生成减少"}, {"key": "B", "text": "直接促进胃酸H+-K+-ATP酶分泌"}, {"key": "C", "text": "激动胃黏膜促胃液素受体"}, {"key": "D", "text": "破坏胃壁平滑肌细胞结构"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH17-03",
        "clinical_rationale": "对前列腺素E2/I2维持胃黏膜血流与黏液屏障机制理解不足，误以为是直接促酸。"
    },
    {
        "case_id": "BM-JZ-006", "chapter": "CH19",
        "stem": "呋塞米利尿时引起低血钾症的肾小管生理机制是：",
        "options": [{"key": "A", "text": "抑制髓袢粗段Na+-K+-2Cl-吸收→管腔液流至远曲小管Na+增多→Na+-K+交换剧烈增强排钾"}, {"key": "B", "text": "直接促进近曲小管K+的主动分泌"}, {"key": "C", "text": "直接阻断集合管醛固酮受体"}, {"key": "D", "text": "抑制远曲小管H+-K+交换"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH19-02",
        "clinical_rationale": "未能掌握利尿药因流经远曲小管及集合管的钠离子增加促使Na+-K+交换代偿性增强的排钾机制。"
    },
    {
        "case_id": "BM-JZ-007", "chapter": "CH19",
        "stem": "甘露醇降低颅内压消除脑水肿的物理渗透机制是：",
        "options": [{"key": "A", "text": "快速静注后血浆渗透压显著高于脑组织间液→将脑组织水分吸入血管内"}, {"key": "B", "text": "直接阻断脑毛细血管钙通道"}, {"key": "C", "text": "扩张脑血管加速脑脊液重吸收"}, {"key": "D", "text": "抑制脉络丛分泌脑脊液"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH19-03",
        "clinical_rationale": "对血脑屏障渗透压梯度驱动水分转移的物理脱水机制推导不清。"
    },
    {
        "case_id": "BM-JZ-008", "chapter": "CH20",
        "stem": "卡托普利等ACEI类药物引起顽固性刺激性干咳的生化机制是：",
        "options": [{"key": "A", "text": "抑制激肽酶II导致支气管肺内缓激肽和P物质降解受阻蓄积"}, {"key": "B", "text": "直接收缩支气管平滑肌"}, {"key": "C", "text": "激动呼吸道组胺H1受体"}, {"key": "D", "text": "抑制肺泡表面活性物质生成"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH20-03",
        "clinical_rationale": "对ACE即为激肽酶II、抑制ACE造成缓激肽降解受阻的酶双重底物机制不清楚。"
    },
    {
        "case_id": "BM-JZ-009", "chapter": "CH21",
        "stem": "硝酸甘油舒张血管平滑肌的细胞分子机制途径是：",
        "options": [{"key": "A", "text": "提供外源性NO→激活可溶性鸟苷酸环化酶（sGC）→cGMP增加→肌球蛋白去磷酸化"}, {"key": "B", "text": "直接阻断受体依赖性钙通道"}, {"key": "C", "text": "激活腺苷酸环化酶生成cAMP"}, {"key": "D", "text": "抑制磷酸二酯酶PDE5"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH21-03",
        "clinical_rationale": "混淆了NO-sGC-cGMP途径与β激动剂的AC-cAMP途径。"
    },
    {
        "case_id": "BM-JZ-010", "chapter": "CH21",
        "stem": "硝酸甘油与普萘洛尔联合治疗心绞痛能够产生增效减毒，其血流动力学互补机制是：",
        "options": [{"key": "A", "text": "硝酸甘油扩静脉缩小心室容积，普萘洛尔减慢心率并抵消硝酸甘油反射性心动过速"}, {"key": "B", "text": "两药均显著增加心肌收缩力"}, {"key": "C", "text": "两药均显著升高外周动脉血压"}, {"key": "D", "text": "普萘洛尔扩张冠脉，硝酸甘油减慢心率"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH21-04",
        "clinical_rationale": "未理解硝酸甘油导致心率加快与普萘洛尔增加心室容积的互补抵消机制。"
    },
    {
        "case_id": "BM-JZ-011", "chapter": "CH22",
        "stem": "强心苷（地高辛）增强心肌收缩力的正性肌力分子机制是：",
        "options": [{"key": "A", "text": "特异性抑制心肌细胞膜Na+-K+-ATP酶→胞内Na+增加→Na+-Ca2+交换增加→内质网Ca2+摄取释放增加"}, {"key": "B", "text": "直接激活肌浆网钙泵释放Ca2+"}, {"key": "C", "text": "阻断心肌细胞膜钾通道"}, {"key": "D", "text": "直接激动心肌β1受体增加cAMP"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH22-02",
        "clinical_rationale": "对Na+-K+-ATP酶偶联Na+-Ca2+反向转运体级联推导断环，误当交感直接激动。"
    },
    {
        "case_id": "BM-JZ-012", "chapter": "CH22",
        "stem": "低血钾为什么会极大地诱发和加重地高辛中毒：",
        "options": [{"key": "A", "text": "K+与强心苷竞争结合Na+-K+-ATP酶同一部位，低钾使强心苷与酶结合剧增"}, {"key": "B", "text": "低血钾促进地高辛经肾小球排泄"}, {"key": "C", "text": "低血钾直接使心肌细胞膜去极化受阻"}, {"key": "D", "text": "低血钾促进肝脏CYP3A4代谢地高辛"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH22-03",
        "clinical_rationale": "不理解细胞外K+与强心苷在Na+-K+-ATP酶结合位点竞争性拮抗的分子药理学机制。"
    },
    {
        "case_id": "BM-JZ-013", "chapter": "CH23",
        "stem": "普萘洛尔等β受体阻断药减慢窦性心率、抗心律失常的机制是：",
        "options": [{"key": "A", "text": "阻断窦房结β1受体使If起搏电流减弱、4期自动去极化坡度减慢"}, {"key": "B", "text": "直接阻断快钠通道降低0期去极化速度"}, {"key": "C", "text": "加速心室肌3期复极化"}, {"key": "D", "text": "完全阻止房室交界区兴奋传导"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH23-02",
        "clinical_rationale": "把II类β受体阻断剂的4期自律性减慢机制，混同于I类快钠通道阻滞机制。"
    },
    {
        "case_id": "BM-JZ-014", "chapter": "CH24",
        "stem": "他汀类药物降低血浆胆固醇和LDL-C最核心的反馈调节机制是：",
        "options": [{"key": "A", "text": "抑制HMG-CoA还原酶→肝内游离胆固醇耗竭→反馈性代偿上调肝细胞膜LDL受体表达"}, {"key": "B", "text": "抑制肠道胆汁酸重吸收"}, {"key": "C", "text": "直接激活血浆脂蛋白酯酶LPL"}, {"key": "D", "text": "直接促进高密度脂蛋白HDL合成"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH24-02",
        "clinical_rationale": "未能理解“酶抑制致肝内池耗竭→反馈上调细胞表面LDL受体清除血液LDL”的负反馈链条。"
    },
    {
        "case_id": "BM-JZ-015", "chapter": "CH25",
        "stem": "氨茶碱松弛支气管平滑肌的生物化学机制是：",
        "options": [{"key": "A", "text": "抑制磷酸二酯酶（PDE）阻断cAMP降解 + 拮抗腺苷受体"}, {"key": "B", "text": "激动支气管平滑肌M3受体"}, {"key": "C", "text": "直接激活受体依赖性钙通道"}, {"key": "D", "text": "直接抑制腺苷酸环化酶AC"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH25-02",
        "clinical_rationale": "混淆了cAMP的生成酶（AC）与降解酶（PDE）对细胞内cAMP水平的调节方向。"
    },
    {
        "case_id": "BM-JZ-016", "chapter": "CH27",
        "stem": "华法林发挥抗凝作用需要潜伏期（24~72小时）才达最大效应，其原因是：",
        "options": [{"key": "A", "text": "华法林抑制新凝血因子合成，对体内已存在的成熟凝血因子（II、VII、IX、X）无灭活作用"}, {"key": "B", "text": "华法林胃肠道吸收极慢"}, {"key": "C", "text": "华法林须在肝脏经多步转化方有活性"}, {"key": "D", "text": "华法林与血浆蛋白结合率极低"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH27-03",
        "clinical_rationale": "未理解维生素K抑制剂只阻碍新合成、必须等待已有凝血因子按半衰期消耗殆尽的时滞动力学。"
    },
    {
        "case_id": "BM-JZ-017", "chapter": "CH30",
        "stem": "二甲双胍发挥降血糖作用机制且不引起严重低血糖的关键原因是：",
        "options": [{"key": "A", "text": "激活AMPK抑制肝糖异生、改善胰岛素抵抗，不刺激胰岛B细胞分泌胰岛素"}, {"key": "B", "text": "促进胰岛B细胞持续脱颗粒释放胰岛素"}, {"key": "C", "text": "在肠道完全阻止水分吸收"}, {"key": "D", "text": "直接破坏升糖素受体"}],
        "selected_option": "B", "expected_category": "机制理解不足", "expected_code": "MIS-CH30-03",
        "clinical_rationale": "把外周增敏与抑制糖异生药物，误理解为促胰岛素分泌机制。"
    },
    {
        "case_id": "BM-JZ-018", "chapter": "CH35",
        "stem": "青霉素类抗生素仅对繁殖期细菌具有强大杀灭作用的机制推导是：",
        "options": [{"key": "A", "text": "抑制转肽酶阻碍肽聚糖交联，繁殖期细菌合成新细胞壁时自溶酶激活菌体膨胀裂解"}, {"key": "B", "text": "直接穿透核膜破坏染色体DNA"}, {"key": "C", "text": "不可逆破坏细菌核糖体50S亚基"}, {"key": "D", "text": "抑制二氢叶酸合成酶"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH35-02",
        "clinical_rationale": "对转肽酶抑制破坏高渗透压下细菌细胞壁自溶裂解的机制链理解不足。"
    },
    {
        "case_id": "BM-JZ-019", "chapter": "CH39",
        "stem": "异烟肼单用容易迅速产生耐药性，其分子生物学基础主要是：",
        "options": [{"key": "A", "text": "结核分枝杆菌katG基因突变导致过氧化氢酶-过氧化物酶缺失，异烟肼无法活化"}, {"key": "B", "text": "细菌细胞壁外膜完全丧失"}, {"key": "C", "text": "细菌体内生成了青霉素酶"}, {"key": "D", "text": "细菌合成了大量PABA"}],
        "selected_option": "C", "expected_category": "机制理解不足", "expected_code": "MIS-CH39-04",
        "clinical_rationale": "不理解前药异烟肼必须经细菌内源katG酶活化成异烟酰基自由基才具活性的分子机制。"
    },
    {
        "case_id": "BM-JZ-020", "chapter": "CH42",
        "stem": "甲氨蝶呤（MTX）阻断肿瘤细胞DNA合成的靶酶和生化截断点是：",
        "options": [{"key": "A", "text": "竞争性抑制二氢叶酸还原酶（DHFR），阻断四氢叶酸（FH4）生成从而阻碍一碳单位转移"}, {"key": "B", "text": "抑制核糖核苷酸还原酶"}, {"key": "C", "text": "直接抑制DNA拓扑异构酶II"}, {"key": "D", "text": "抑制二氢叶酸合成酶"}],
        "selected_option": "D", "expected_category": "机制理解不足", "expected_code": "MIS-CH42-04",
        "clinical_rationale": "混淆了磺胺类的二氢叶酸合成酶与甲氨蝶呤的二氢叶酸还原酶靶点。"
    },

    # ==================== 4. 审题与应用失误 (20 例) ====================
    {
        "case_id": "BM-ST-001", "chapter": "CH5",
        "stem": "患者男，68岁，因胃肠痉挛绞痛就诊。既往有前列腺增生伴排尿困难及青光眼病史。接诊医生绝对禁用的解痉药物是：",
        "options": [{"key": "A", "text": "山莨菪碱"}, {"key": "B", "text": "阿托品"}, {"key": "C", "text": "颠茄浸膏"}, {"key": "D", "text": "间苯三酚"}],
        "selected_option": "D", "expected_category": "审题与应用失误", "expected_code": "MIS-ANS-08",
        "clinical_rationale": "审题漏看前列腺增生和青光眼既往史，忽视了M受体阻断药加重尿潴留与升眼压的绝对禁忌，把非抗胆碱解痉药当成禁用。"
    },
    {
        "case_id": "BM-ST-002", "chapter": "CH6",
        "stem": "患者女，32岁，患有支气管哮喘急性发作。若需做眼科散瞳检查，下列叙述正确的是：",
        "options": [{"key": "A", "text": "毛果芸香碱可安全常规用于该患者"}, {"key": "B", "text": "毛果芸香碱收缩支气管平滑肌，哮喘患者禁用"}, {"key": "C", "text": "阿托品能使哮喘患者气道痉挛加重"}, {"key": "D", "text": "胆碱能药物对气道平滑肌无影响"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-ANS-08",
        "clinical_rationale": "应用失误：忽视了M激动药激动支气管平滑肌诱发严重哮喘窒息的临床禁忌。"
    },
    {
        "case_id": "BM-ST-003", "chapter": "CH15",
        "stem": "患者男，45岁，突发急性胆囊炎胆绞痛剧烈难忍。下列止痛方案中错误的是：",
        "options": [{"key": "A", "text": "单用吗啡止痛"}, {"key": "B", "text": "阿托品联合哌替啶"}, {"key": "C", "text": "阿托品联合吗啡"}, {"key": "D", "text": "山莨菪碱联合哌替啶"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH15-02",
        "clinical_rationale": "审题误以为只要有阿托品就错误，忽视了“单用吗啡收缩Oddi括约肌恶化胆绞痛”的用药红线。"
    },
    {
        "case_id": "BM-ST-004", "chapter": "CH15",
        "stem": "产妇临产分娩阵痛剧烈，为缓解产痛且避免新生儿呼吸抑制，禁用的镇痛药是：",
        "options": [{"key": "A", "text": "吗啡"}, {"key": "B", "text": "哌替啶"}, {"key": "C", "text": "罗哌卡因硬膜外"}, {"key": "D", "text": "氧化亚氮"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH15-03",
        "clinical_rationale": "审题混淆了临产镇痛选用短效哌替啶与绝对禁用脂溶透胎盘致新生儿窒息的吗啡。"
    },
    {
        "case_id": "BM-ST-005", "chapter": "CH17",
        "stem": "患儿，7岁，因病毒性感冒发热39.2℃，退热治疗绝对禁用的药物是：",
        "options": [{"key": "A", "text": "对乙酰氨基酚"}, {"key": "B", "text": "布洛芬"}, {"key": "C", "text": "阿司匹林"}, {"key": "D", "text": "物理降温"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH17-04",
        "clinical_rationale": "审题漏看“病毒感染儿童”关键题眼，忽视阿司匹林诱发致死性瑞氏综合征（Reye综合征）的禁忌。"
    },
    {
        "case_id": "BM-ST-006", "chapter": "CH17",
        "stem": "患者男，56岁，痛风性关节炎急性发作第1天，红肿热痛剧烈。下列处方中不合理的是：",
        "options": [{"key": "A", "text": "立即足量口服别嘌醇"}, {"key": "B", "text": "口服秋水仙碱"}, {"key": "C", "text": "口服吲哚美辛"}, {"key": "D", "text": "短期应用泼尼松"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH17-05",
        "clinical_rationale": "审题漏看“急性发作期”，忽视了降尿酸药（别嘌醇）在急性发作期会促使结晶迁移加重关节炎的用药时机禁忌。"
    },
    {
        "case_id": "BM-ST-007", "chapter": "CH20",
        "stem": "青年女性高血压患者，近期有备孕计划或已妊娠。下列降压药中绝对禁忌的是：",
        "options": [{"key": "A", "text": "甲基多巴"}, {"key": "B", "text": "拉贝洛尔"}, {"key": "C", "text": "硝苯地平"}, {"key": "D", "text": "卡托普利"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH20-04",
        "clinical_rationale": "审题漏看“妊娠备孕”特殊人群，忽视ACEI类（卡托普利）致胎儿肾发育不全与畸胎的黑框禁忌。"
    },
    {
        "case_id": "BM-ST-008", "chapter": "CH20",
        "stem": "患者男，52岁，高血压病史3年，兼患有支气管哮喘重度。该患者降压治疗禁用的药物是：",
        "options": [{"key": "A", "text": "氨氯地平"}, {"key": "B", "text": "普萘洛尔"}, {"key": "C", "text": "氯沙坦"}, {"key": "D", "text": "氢氯噻嗪"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH20-05",
        "clinical_rationale": "审题漏看高血压合并哮喘病史，忽视普萘洛尔阻断β2受体诱发致死性哮喘的禁忌。"
    },
    {
        "case_id": "BM-ST-009", "chapter": "CH21",
        "stem": "患者半夜睡眠中突发心前区压榨性剧痛，心电图提示ST段一过性抬高，诊断为变异型心绞痛。禁用下列哪种药物：",
        "options": [{"key": "A", "text": "硝苯地平"}, {"key": "B", "text": "地尔硫䓬"}, {"key": "C", "text": "普萘洛尔"}, {"key": "D", "text": "硝酸异山梨酯"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH21-05",
        "clinical_rationale": "审题漏看“变异型（血管痉挛）”，将劳力型与变异型混同，选错普萘洛尔的禁用场景。"
    },
    {
        "case_id": "BM-ST-010", "chapter": "CH21",
        "stem": "冠心病患者服用单硝酸异山梨酯期间，因勃起功能障碍自行服用下列哪种药物可致致死性恶性低血压：",
        "options": [{"key": "A", "text": "西地那非"}, {"key": "B", "text": "前列地尔"}, {"key": "C", "text": "甲磺酸酚妥拉明"}, {"key": "D", "text": "育亨宾"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH21-06",
        "clinical_rationale": "应用失误：忽视PDE5抑制剂西地那非与硝酸酯类合用导致cGMP过度蓄积休克的禁忌。"
    },
    {
        "case_id": "BM-ST-011", "chapter": "CH22",
        "stem": "慢性充血性心力衰竭患者使用地高辛维持治疗，近日因感染自行服用某抗菌药后出现恶心、黄绿视及室早二联律。最可能加重强心苷毒性的药物是：",
        "options": [{"key": "A", "text": "阿莫西林"}, {"key": "B", "text": "克拉霉素"}, {"key": "C", "text": "头孢克肟"}, {"key": "D", "text": "青霉素V钾"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH22-04",
        "clinical_rationale": "审题漏看P-糖蛋白抑制剂红霉素/克拉霉素减少地高辛肾排泄使血药浓度倍增的相互作用。"
    },
    {
        "case_id": "BM-ST-012", "chapter": "CH22",
        "stem": "严重充血性心力衰竭患者，肾小球滤过率（GFR）降至15ml/min。此时消除水肿最适宜的利尿药是：",
        "options": [{"key": "A", "text": "氢氯噻嗪"}, {"key": "B", "text": "呋塞米"}, {"key": "C", "text": "吲达帕胺"}, {"key": "D", "text": "螺内酯单用"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH22-05",
        "clinical_rationale": "审题漏看严重肾衰（GFR<30ml/min噻嗪类完全失效），应用失误错选氢氯噻嗪。"
    },
    {
        "case_id": "BM-ST-013", "chapter": "CH24",
        "stem": "高脂血症患者使用阿托伐他汀降脂治疗，因甘油三酯升高加用吉非罗齐，患者出现肌肉酸痛伴酱油色尿，首要怀疑的重症反应是：",
        "options": [{"key": "A", "text": "横纹肌溶解症"}, {"key": "B", "text": "急性肾小球肾炎"}, {"key": "C", "text": "泌尿系结石感染"}, {"key": "D", "text": "痛风性肾病"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH24-03",
        "clinical_rationale": "未能识别他汀类合用贝特类诱发肌溶解、肌红蛋白尿（酱油尿）导致急性肾衰的典型体征。"
    },
    {
        "case_id": "BM-ST-014", "chapter": "CH27",
        "stem": "人工心脏瓣膜置换术后妊娠早期妇女，预防血栓形成绝对禁用的抗凝药是：",
        "options": [{"key": "A", "text": "华法林"}, {"key": "B", "text": "普通肝素"}, {"key": "C", "text": "低分子肝素"}, {"key": "D", "text": "阿司匹林"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH27-04",
        "clinical_rationale": "审题漏看“妊娠早期”，忽视华法林穿透胎盘引起胎儿骨骼发育异常畸胎的禁用风险（妊娠换用不透胎盘的肝素）。"
    },
    {
        "case_id": "BM-ST-015", "chapter": "CH29",
        "stem": "糖尿病合并严重细菌性感染休克的患者，抢救应用糖皮质激素的合理原则是：",
        "options": [{"key": "A", "text": "因糖尿病禁忌，绝对不使用糖皮质激素"}, {"key": "B", "text": "在足量抗生素联合应用前提下，短期大剂量使用激素抗休克，并严密监测调整胰岛素用量"}, {"key": "C", "text": "长期小剂量口服泼尼松"}, {"key": "D", "text": "仅外用弱效激素"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH29-01",
        "clinical_rationale": "审题僵化教条，在感染性休克危及生命时因糖尿病相对禁忌而错误拒用救命的短期大剂量激素。"
    },
    {
        "case_id": "BM-ST-016", "chapter": "CH30",
        "stem": "2型糖尿病患者服用阿卡波糖合用格列本脲期间出现心慌、手抖、出冷汗等低血糖反应，首选的口服急救解救食品是：",
        "options": [{"key": "A", "text": "纯葡萄糖水或糖块"}, {"key": "B", "text": "蔗糖水"}, {"key": "C", "text": "白面包淀粉"}, {"key": "D", "text": "牛奶或果汁"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH30-04",
        "clinical_rationale": "应用失误：忽视阿卡波糖抑制小肠双糖水解酶导致蔗糖分解极慢的药理特性，低血糖急救必须口服单糖葡萄糖。"
    },
    {
        "case_id": "BM-ST-017", "chapter": "CH34",
        "stem": "妊娠妇女及18岁以下青少年骨骼发育期骨感染，绝对禁用的合成抗菌药是：",
        "options": [{"key": "A", "text": "环丙沙星等氟喹诺酮类"}, {"key": "B", "text": "阿莫西林"}, {"key": "C", "text": "头孢唑林"}, {"key": "D", "text": "红霉素"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH34-02",
        "clinical_rationale": "审题漏看“18岁以下青少年”，忽视氟喹诺酮类损伤幼年动物负重关节软骨的发育禁忌。"
    },
    {
        "case_id": "BM-ST-018", "chapter": "CH35",
        "stem": "青霉素G在配制稀释静脉滴注液时，最适宜的溶剂是：",
        "options": [{"key": "A", "text": "0.9%氯化钠注射液（生理盐水）"}, {"key": "B", "text": "5%或10%葡萄糖注射液（弱酸性易分解）"}, {"key": "C", "text": "碳酸氢钠注射液"}, {"key": "D", "text": "复方乳酸钠葡萄糖注射液"}],
        "selected_option": "B", "expected_category": "审题与应用失误", "expected_code": "MIS-CH35-03",
        "clinical_rationale": "应用配伍失误：忽视青霉素β-内酰胺环在酸性葡萄糖溶液中极易水解开环失效并诱发致敏聚合物生成。"
    },
    {
        "case_id": "BM-ST-019", "chapter": "CH38",
        "stem": "8岁以下儿童及孕妇牙齿形成发育期感染，绝对禁用的抗生素是：",
        "options": [{"key": "A", "text": "四环素类"}, {"key": "B", "text": "头孢菌素类"}, {"key": "C", "text": "阿莫西林"}, {"key": "D", "text": "阿奇霉素"}],
        "selected_option": "C", "expected_category": "审题与应用失误", "expected_code": "MIS-CH38-03",
        "clinical_rationale": "审题漏看8岁以下儿童用药禁忌，错选了儿童安全的青霉素类。"
    },
    {
        "case_id": "BM-ST-020", "chapter": "CH39",
        "stem": "确诊浸润型肺结核初治患者，采用标准化疗方案时必须遵循的联合用药基本原则是：",
        "options": [{"key": "A", "text": "单用异烟肼以免肝损害"}, {"key": "B", "text": "早期、联合、适量、规律、全程"}, {"key": "C", "text": "间歇随意增减药量"}, {"key": "D", "text": "症状好转立即停药"}],
        "selected_option": "A", "expected_category": "审题与应用失误", "expected_code": "MIS-CH39-05",
        "clinical_rationale": "审题忽视结核病化疗十字原则，误选单药治疗诱发快速广泛耐药。"
    }
]


def get_benchmark_cases() -> list[dict]:
    """获取标准保护测试集全部 80 案例。"""
    return list(BENCHMARK_CASES)


def verify_dataset_integrity():
    """核验证据集规模与四类配额。"""
    cases = get_benchmark_cases()
    assert len(cases) >= 80, f"案例数应不少于80，实得 {len(cases)}"
    counts = {}
    for c in cases:
        cat = c["expected_category"]
        counts[cat] = counts.get(cat, 0) + 1
    
    for req_cat in ["知识遗忘", "概念混淆", "机制理解不足", "审题与应用失误"]:
        assert counts.get(req_cat, 0) >= 20, f"类别 {req_cat} 案例数不足20例 (实得 {counts.get(req_cat, 0)})"
    return counts


if __name__ == "__main__":
    c = verify_dataset_integrity()
    print("Benchmark Dataset verified successfully:")
    for k, v in c.items():
        print(f"  {k}: {v} cases")
    print(f"Total cases: {sum(c.values())}")
