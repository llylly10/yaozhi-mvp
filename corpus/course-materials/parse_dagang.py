# -*- coding: utf-8 -*-
"""
教学大纲结构化解析
输入: 教学大纲-药理学-药学专业.txt (pypdf 提取全文)
输出: 教学大纲-结构化.json

结构:
- meta: 课程基本信息 / 教材 / 考核方式 / 学时汇总
- chapters: 按教材章号排列, 每章含
    book_chapter_no / title / teach_seq / hours_theory / hours_practice / practice_name
    objectives {master,familiar,understand} / key_points / difficulties
    sections [{title, points[]}] / experiments [{name, desc[]}] / notes
- hour_table: 学时分配表 (34 授课序次)
- experiments: 实验 1-10 列表
"""
import json
import re

SRC = r"D:\ceshi\corpus\course-materials\教学大纲-药理学-药学专业.txt"
DST = r"D:\ceshi\corpus\course-materials\教学大纲-结构化.json"

# ---------- 0. 读文本, 去页标记, OCR 清洗 ----------
with open(SRC, "r", encoding="utf-8") as f:
    raw = f.read()

lines = []
for ln in raw.splitlines():
    ln = ln.strip()
    if not ln:
        continue
    if re.match(r"^===== 第 \d+ 页 =====$", ln):
        continue
    if ln.isdigit():  # 页脚页码
        continue
    # OCR 清洗: 中文与中文之间的单个空格删除 (如 "药 理作用" "第 三 节")
    ln = re.sub(r"(?<=[\u4e00-\u9fff]) (?=[\u4e00-\u9fff])", "", ln)
    # 统一省略号分隔符
    ln = ln.replace("…………", "…").replace("………", "…").replace("……", "…")
    ln = ln.replace("........", "…").replace(".......", "…")
    lines.append(ln)

# ---------- 1. 切分正文章节 ----------
# 教材章号: 第一/二/三/五/六/七/十二/十四...
CN_NUM = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7,
          "八": 8, "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13,
          "十四": 14, "十五": 15, "十六": 16, "十七": 17, "十八": 18,
          "十九": 19, "二十": 20, "二十一": 21, "二十二": 22, "二十三": 23,
          "二十四": 24, "二十五": 25, "二十六": 26, "二十七": 27,
          "二十八": 28, "二十九": 29, "三十": 30, "三十一": 31,
          "三十二": 32, "三十三": 33, "三十四": 34, "三十五": 35,
          "三十六": 36, "三十七": 37, "三十八": 38, "三十九": 39,
          "四十": 40, "四十一": 41, "四十二": 42}

def chapter_num(s: str):
    """'第一' -> 1, 失败返回 None"""
    return CN_NUM.get(s, None)

chapter_pat = re.compile(r"^第([一二三四五六七八九十百]+)章\s*(.*)$")

chapters_raw = []   # (num, title, [lines...])
cur = None
in_body = False    # 只在"（二）各章节内容安排"之后收集
for ln in lines:
    if ln == "（二）各章节内容安排":
        in_body = True
        continue
    if not in_body:
        continue
    if ln.startswith("六、学时分配表"):
        in_body = False
        cur = None
        continue
    m = chapter_pat.match(ln)
    if m:
        num = chapter_num(m.group(1))
        if num is not None:
            title = re.sub(r"^…*\s*", "", m.group(2).strip())
            cur = {"num": num, "title": title, "lines": []}
            chapters_raw.append(cur)
            continue
    if cur is not None:
        cur["lines"].append(ln)

print(f"[1] 正文章节数: {len(chapters_raw)}")

# ---------- 2. 授课序次/学时手工映射表 ----------
# teach_seq: 1-34, 对应学时分配表; 每项 = (教材章号, 学时表章名, 理论学时, 实践学时, 实践名称或None)
TEACH_SEQ = [
    (1, "绪论", 1, 3, "实验1 药理学实验的基本知识及基本技能"),
    (2, "药动学", 3, 0, None),
    (3, "药效学", 3, 3, "实验2 影响药物作用的因素"),
    (5, "传出神经系统药理概论", 2, 0, None),
    (6, "拟胆碱药", 1, 3, "实验3 有机磷药物中毒及解救"),
    (6, "有机磷酸酯类的毒理和胆碱酯酶复活药", 1, 0, None),
    (6, "抗胆碱药", 2, 0, None),
    (7, "拟肾上腺素药", 2, 0, None),
    (7, "抗肾上腺素药", 2, 0, None),
    (12, "镇静催眠药", 1, 3, "实验4 镇静实验"),
    (14, "抗精神失常药", 2, 0, None),
    (16, "治疗中枢神经系统退行性疾病药", 1, 0, None),
    (15, "镇痛药", 2, 3, "实验5 镇痛实验"),
    (17, "解热镇痛抗炎药与抗痛风药", 2, 0, None),
    (19, "利尿药与脱水药", 2, 3, "实验6 利尿实验"),
    (20, "抗高血压药", 2, 0, None),
    (22, "抗慢性心功能不全药", 2, 0, None),
    (23, "抗心律失常药", 2, 0, None),
    (21, "抗心绞痛药", 1, 0, None),
    (24, "调血脂药及抗动脉粥样硬化药", 1, 0, None),
    (27, "血液系统药", 2, 3, "实验7 肝素的抗凝血作用及鱼精蛋白对抗"),
    (26, "消化系统药", 1, 0, None),
    (25, "呼吸系统药", 1, 0, None),
    (29, "肾上腺皮质激素类药", 4, 0, None),
    (31, "甲状腺激素和抗甲状腺药", 1, 0, None),
    (30, "胰岛素与口服降血糖药", 2, 0, None),
    (33, "抗病原微生物药物概论", 2, 0, None),
    (34, "合成抗菌药物", 1, 0, None),
    (35, "β-内酰胺类抗生素", 1, 0, None),
    (36, "大环内酯类与林可霉素类抗生素", 1, 0, None),
    (37, "氨基糖苷类与多肽类抗生素", 1, 4, "实验8 链霉素的毒性反应及其解救+抗惊厥实验"),
    (38, "四环素类与氯霉素类", 1, 0, None),
    (40, "抗病毒和抗真菌药", 1, 0, None),
    (42, "抗恶性肿瘤药", 2, 0, None),
    # 独立成行的实践课 (不计入章节)
    (None, "实验9 设计性实验", 0, 4, "实验9 设计性实验"),
    (None, "实验10 实验考核", 0, 3, "实验10 实验考核"),
]
t_hours = sum(x[2] for x in TEACH_SEQ)
p_hours = sum(x[3] for x in TEACH_SEQ)
print(f"[2] 学时表: 理论 {t_hours} + 实践 {p_hours} = {t_hours + p_hours} (对照: 56+32=88)")
assert t_hours == 56 and p_hours == 32, "学时表与 56+32 不符!"

# 实验 1-10 明细 (名称, 学时, 说明)
EXPERIMENTS = [
    ("实验1 药理学实验的基本知识及基本技能", 3,
     ["学习与药理学实验有关联的基础知识", "实践药理学实验的若干实际操作"]),
    ("实验2 影响药物作用的因素", 3,
     ["不同肝功能状态对药物作用的影响", "给药方式对药物作用的影响"]),
    ("实验3 有机磷药物中毒及解救", 3,
     ["观察有机磷农药致家兔中毒症状", "观察阿托品、解磷定对有机磷农药中毒的解救作用"]),
    ("实验4 镇静实验", 3,
     ["利用小鼠自主活动仪，观察给予安定后受试动物自主活动的情况"]),
    ("实验5 镇痛实验", 3,
     ["观察药物对小鼠疼痛反应的影响"]),
    ("实验6 利尿实验", 3,
     ["验证利尿药对家兔的利尿作用"]),
    ("实验7 肝素的抗凝血作用及鱼精蛋白对抗", 3,
     ["观察肝素的抗凝血作用", "观察鱼精蛋白对肝素的对抗作用"]),
    ("实验8 链霉素的毒性反应及其解救+抗惊厥实验", 4,
     ["观察链霉素的毒性反应及其解救措施", "观察戊四氮小鼠惊厥反应及救治"]),
    ("实验9 设计性实验", 4,
     ["学生自主查阅文献、确定研究题目，撰写研究计划与方案，论证可行性",
      "预试验、调整实验方案、完成实验计划",
      "实验结果处理分析、撰写正式实验报告"]),
    ("实验10 实验考核", 3,
     ["实验操作与报告考核"]),
]

# ---------- 3. 解析每章内部结构 ----------
section_pat = re.compile(r"^第\s*([一二三四五六七八九十\d]+)\s*节\s*…?\s*(.*)$")
point_pat = re.compile(r"^(\d{1,2})[\.、．]?\s*(.*)$")
LEVEL_KEY = {"掌握": "master", "熟悉": "familiar", "了解": "understand"}
KEYP_KEY = {"重点": "key_points", "难点": "difficulties"}

def parse_chapter(lines, num, title):
    ch = {
        "book_chapter_no": num,
        "title": title,
        "objectives": {"master": [], "familiar": [], "understand": []},
        "key_points": [],
        "difficulties": [],
        "sections": [],
        "experiments": [],
        "notes": [],
    }
    mode = None            # objectives | keypoints | content | practice
    cur_level = None       # master/familiar/understand 或 key_points/difficulties
    cur_section = None
    cur_exp = None

    def push_obj(line):
        for k, v in LEVEL_KEY.items():
            if line.startswith(k + "：") or line.startswith(k + ":"):
                content = line[len(k) + 1:].strip()
                if content:
                    ch["objectives"][v].append(content)
                return v
        for k, v in KEYP_KEY.items():
            if line.startswith(k + "：") or line.startswith(k + ":"):
                content = line[len(k) + 1:].strip()
                if content:
                    ch[v].append(content)
                return v
        return None

    for ln in lines:
        # 模式切换
        if ln.startswith("教学目的与要求"):
            mode = "objectives"; cur_level = None; continue
        if ln.startswith("教学重点与难点"):
            mode = "keypoints"; cur_level = None; continue
        if ln.startswith("学习内容"):
            mode = "content"; cur_section = None; continue
        if ln.startswith("课程实践"):
            mode = "practice"; cur_exp = None; continue
        if ln.startswith("设计："):
            ch["notes"].append(ln); continue
        if ln.startswith("实验") and mode == "practice":
            cur_exp = {"name": ln, "desc": []}
            ch["experiments"].append(cur_exp)
            continue

        if mode == "objectives":
            lv = push_obj(ln)
            if lv:
                cur_level = lv
            elif cur_level and cur_level in ch["objectives"]:
                # 编号开头的行: 独立成条; 否则拼接续行
                if re.match(r"^\d{1,2}[\.、．]", ln):
                    ch["objectives"][cur_level].append(ln)
                else:
                    ch["objectives"][cur_level][-1] += ln
            continue

        if mode == "keypoints":
            lv = push_obj(ln)
            if lv:
                cur_level = lv
            elif cur_level:
                if re.match(r"^\d{1,2}[\.、．]", ln):
                    ch[cur_level].append(ln)
                else:
                    ch[cur_level][-1] += ln
            continue

        if mode == "content":
            m = section_pat.match(ln)
            if m:
                cur_section = {"title": m.group(2).strip(), "points": []}
                ch["sections"].append(cur_section)
                continue
            if cur_section is not None:
                mp = point_pat.match(ln)
                if mp and mp.group(1) and int(mp.group(1)) <= 12:
                    t = mp.group(2).strip()
                    if t:
                        cur_section["points"].append(t)
                else:
                    # 非编号行: 视为对上一节的补充说明, 或游离文本
                    cur_section["points"].append(ln)
            continue

        if mode == "practice":
            if cur_exp is not None:
                cur_exp["desc"].append(ln)
            continue

    return ch

chapters = []
for cr in chapters_raw:
    chapters.append(parse_chapter(cr["lines"], cr["num"], cr["title"]))

# 合并授课序次信息
seq_by_book = {}
for i, (bn, tname, th, ph, pn) in enumerate(TEACH_SEQ, start=1):
    if bn is None:
        continue
    seq_by_book.setdefault(bn, []).append({
        "teach_seq": i, "hours_theory": th, "hours_practice": ph,
        "seq_title": tname, "practice_name": pn,
    })
for ch in chapters:
    ch["teach_items"] = seq_by_book.get(ch["book_chapter_no"], [])

# ---------- 4. 课程元信息 ----------
meta = {
    "course_zh": "药理学",
    "course_en": "Pharmacology",
    "major": "药学",
    "nature": "药学专业基础必修课",
    "hours_total": 88,
    "hours_theory": 56,
    "hours_practice": 32,
    "credits": 5.5,
    "prerequisites": ["解剖学", "生理学", "无机化学", "有机化学", "生物化学", "分析化学", "细胞生物学"],
    "textbook": "曾南, 周玖瑶. 《药理学》第3版. 北京: 中国医药科技出版社, 2024",
    "assessment": {
        "平时考核": "占总成绩 40-50%；含课堂学习/平时作业/实验实践/实验报告/出勤/课堂讨论/小测验等；方式为雨课堂检测、教师评分、生生互评",
        "期末考核": "占总成绩 50-60%；闭卷，标准题型（单选、名词解释、简答、论述等）",
    },
}

out = {
    "meta": meta,
    "chapters": chapters,
    "hour_table": [{"teach_seq": i, "book_chapter_no": bn,
                    "row_type": "practice" if bn is None else "theory",
                    "seq_title": tn,
                    "hours_theory": th, "hours_practice": ph, "practice_name": pn}
                   for i, (bn, tn, th, ph, pn) in enumerate(TEACH_SEQ, start=1)],
    "experiments": [{"name": n, "hours": h, "desc": d} for n, h, d in EXPERIMENTS],
}

with open(DST, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

# ---------- 5. 统计报告 ----------
CN_NUM_INV = {v: k for k, v in CN_NUM.items()}
print(f"[3] 输出: {DST}")
print(f"    章节数: {len(chapters)}")
n_master = sum(len(c['objectives']['master']) for c in chapters)
n_fam = sum(len(c['objectives']['familiar']) for c in chapters)
n_und = sum(len(c['objectives']['understand']) for c in chapters)
n_sec = sum(len(c['sections']) for c in chapters)
n_pt = sum(len(s['points']) for c in chapters for s in c['sections'])
print(f"    目标条目: 掌握 {n_master} / 熟悉 {n_fam} / 了解 {n_und}")
print(f"    节数: {n_sec}, 知识点数: {n_pt}")
print(f"    实验数: {len(EXPERIMENTS)}")
for c in chapters:
    seqs = ",".join(f"#{s['teach_seq']}" for s in c["teach_items"])
    npts = sum(len(s["points"]) for s in c["sections"])
    cn = CN_NUM_INV.get(c["book_chapter_no"], str(c["book_chapter_no"]))
    print(f"    第{cn}章 {c['title']} | 授课序:{seqs} | 节:{len(c['sections'])} 点:{npts}")
