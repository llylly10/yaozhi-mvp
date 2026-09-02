# -*- coding: utf-8 -*-
"""
B 类补章落库脚本：新增 CH8 局麻 / CH13 抗癫痫 / CH18 抗组胺 / CH39 抗结核
=================================================================
- 按 syllabus_chapters 体例新增 4 章（book_chapter_no 取大纲间隙 8/13/18/39）
- 把 36 道原兜底/未映射题改入新章
- 幂等可重放：dry-run 默认打印计划，--apply 写库；已存在章节/已更新题自动跳过
用法:
  python add_bchapters.py           # dry-run
  python add_bchapters.py --apply    # 写库
"""
import sqlite3, io, sys, json, uuid, os, datetime, hashlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DB = r"D:\ceshi\yaozhi-mvp\backend\yaozhi_w1.db"
BAK_DIR = r"C:\Users\Administrator\AppData\Local\DoubaoWork\User Data\Default\.doubaowork\agent_mode\workspace\.sessions\38439826045569538\agents\m_0cwExU1vFef"

NEW_CHAPTERS = [
    {
        "book_chapter_no": 8, "title": "局部麻醉药",
        "teach_seqs": [8], "hours_theory": 2, "hours_practice": 0,
        "objectives": {
            "master": [
                "局麻药的作用机制（阻断电压门控钠通道，阻碍神经冲动的产生和传导）。",
                "普鲁卡因、利多卡因、丁卡因、布比卡因、罗哌卡因的作用特点、临床应用与不良反应。",
            ],
            "familiar": [
                "局麻药的吸收作用与毒性反应（中枢先兴奋后抑制、心血管抑制）。",
                "影响局麻药作用的因素。",
            ],
            "understand": [
                "各种局麻方法（表面麻醉、浸润麻醉、传导麻醉、蛛网膜下腔麻醉、硬膜外麻醉）的临床应用特点及适用药物。",
            ],
        },
        "key_points": [
            "局麻药作用机制与常用药物的作用特点。",
            "普鲁卡因需做皮肤过敏试验。",
            "利多卡因可用于多种局麻方法。",
        ],
        "difficulties": [
            "局麻药作用机制（钠通道阻断）与毒性反应鉴别。",
            "各局麻方法与适用药物的对应关系。",
        ],
        "sections": [
            {"title": "局部麻醉药概述", "points": ["作用机制", "吸收作用与毒性反应", "影响局麻药作用的因素"]},
            {"title": "常用局麻药", "points": ["普鲁卡因", "利多卡因", "丁卡因", "布比卡因", "罗哌卡因"]},
        ],
        "experiments": [],
        "notes": ["题库 8 题：01-017/01-146/01-209/02-051/02-231/02-292/03-132/01-139"],
    },
    {
        "book_chapter_no": 13, "title": "抗癫痫药",
        "teach_seqs": [13], "hours_theory": 2, "hours_practice": 0,
        "objectives": {
            "master": [
                "苯妥英钠、卡马西平、苯巴比妥、乙琥胺、丙戊酸钠、扑米酮的作用、临床应用与不良反应。",
                "各类癫痫发作的选药原则。",
            ],
            "familiar": [
                "抗癫痫药的作用机制（电压门控钠通道、增强 GABA 等）。",
                "抗癫痫药的药动学特点（苯妥英钠零级/饱和消除）。",
            ],
            "understand": [
                "抗癫痫药临床应用原则（个体化、联合用药、不可骤然停药）。",
            ],
        },
        "key_points": [
            "各类癫痫发作选药（大发作、小发作、精神运动性发作、癫痫持续状态）。",
            "苯妥英钠不良反应（齿龈增生、共济失调、过敏）。",
            "乙琥胺为小发作首选。",
        ],
        "difficulties": [
            "各型癫痫选药的对应关系。",
            "抗癫痫药物的相互作用（肝药酶诱导，如卡马西平）。",
        ],
        "sections": [
            {"title": "癫痫临床分型与选药原则", "points": ["癫痫定义及分类", "各类发作的选药原则"]},
            {"title": "常用抗癫痫药", "points": ["苯妥英钠", "卡马西平", "苯巴比妥", "乙琥胺", "丙戊酸钠", "扑米酮"]},
        ],
        "experiments": [],
        "notes": ["题库 4 题：02-070/03-180/02-095/01-169"],
    },
    {
        "book_chapter_no": 18, "title": "抗组胺药",
        "teach_seqs": [18], "hours_theory": 1, "hours_practice": 0,
        "objectives": {
            "master": [
                "H1 受体阻断药的药理作用、临床应用与不良反应。",
                "常用 H1 受体阻断药（苯海拉明、异丙嗪、氯苯那敏、阿司咪唑、特非那定）的作用特点。",
            ],
            "familiar": ["组胺的生理与病理作用、H1/H2 受体分布。"],
            "understand": ["H1 受体阻断药的中枢镇静副作用与第一代/第二代分类（驾驶员用药禁忌）。"],
        },
        "key_points": [
            "H1 受体阻断药的作用机制与临床应用（过敏性疾病、晕动病、镇静催眠）。",
            "中枢副作用强弱比较（阿司咪唑、特非那定无明显中枢抑制）。",
        ],
        "difficulties": [
            "H1 与 H2 受体阻断药的区别。",
            "各药中枢副作用比较与用药场景（驾驶员、高空作业）。",
        ],
        "sections": [
            {"title": "组胺及其受体", "points": ["组胺的合成与生理作用", "H1/H2 受体分布"]},
            {"title": "H1 受体阻断药", "points": ["第一代/第二代分类", "临床应用与不良反应"]},
        ],
        "experiments": [],
        "notes": ["题库 4 题：02-214/02-218/03-024/03-174"],
    },
    {
        "book_chapter_no": 39, "title": "抗结核病药",
        "teach_seqs": [39], "hours_theory": 2, "hours_practice": 0,
        "objectives": {
            "master": [
                "异烟肼、利福平、乙胺丁醇、链霉素、吡嗪酰胺的作用、机制、临床应用与不良反应。",
                "抗结核药联合用药原则。",
            ],
            "familiar": [
                "抗结核药的分级（一线/二线）。",
                "异烟肼的体内过程与周围神经炎（维生素 B6 防治）。",
            ],
            "understand": ["结核病化疗方案（初治/复治、长程/短程）与原则。"],
        },
        "key_points": [
            "一线抗结核药（异烟肼、利福平、乙胺丁醇、链霉素、吡嗪酰胺）的作用与不良反应。",
            "异烟肼周围神经炎（加用维生素 B6）；乙胺丁醇视神经炎；利福平肝损害与肝药酶诱导。",
        ],
        "difficulties": [
            "抗结核药不良反应鉴别（异烟肼周围神经炎 vs 乙胺丁醇视神经炎 vs 利福平肝损害）。",
            "利福平肝药酶诱导的药物相互作用（如与口服降糖药）。",
        ],
        "sections": [
            {"title": "抗结核病药概述", "points": ["治疗原则", "一线/二线分类"]},
            {"title": "常用抗结核药", "points": ["异烟肼", "利福平", "乙胺丁醇", "链霉素", "吡嗪酰胺"]},
            {"title": "抗结核药的联合应用", "points": ["联合用药原则", "不良反应监测"]},
        ],
        "experiments": [],
        "notes": ["题库 20 题（原 CH33 移入，详见映射脚本）"],
    },
]

# 题号 → 目标章；旧值校验（EXPECT_OLD：None/''/实际旧值）
Q_MOVES = {
    "CH8":  ["01-017", "01-146", "01-209", "02-051", "02-231", "02-292", "03-132", "01-139"],
    "CH13": ["02-070", "03-180", "02-095", "01-169"],
    "CH18": ["02-214", "02-218", "03-024", "03-174"],
    "CH39": ["01-055", "01-071", "01-092", "01-098", "01-117", "01-165", "01-171", "01-205",
             "02-049", "02-113", "02-123", "02-125", "02-128", "02-182", "02-201",
             "03-017", "03-058", "03-074", "03-116", "03-136"],
}

def split_pid(pid):
    p, q = pid.split("-")
    return p, int(q)

def main():
    apply = "--apply" in sys.argv
    print("模式:", "APPLY(写库)" if apply else "DRY-RUN(预览)")

    con = sqlite3.connect(DB)
    cur = con.cursor()

    # 1) 新增章节
    print("\n=== 新增章节 ===")
    for ch in NEW_CHAPTERS:
        no = ch["book_chapter_no"]
        cur.execute("SELECT COUNT(*) FROM syllabus_chapters WHERE book_chapter_no=?", (no,))
        if cur.fetchone()[0] > 0:
            print(f"  CH{no} {ch['title']}: 已存在，跳过")
            continue
        rid = uuid.uuid4().hex
        row = (rid, no, ch["title"], json.dumps(ch["teach_seqs"], ensure_ascii=False),
               ch["hours_theory"], ch["hours_practice"],
               json.dumps(ch["objectives"], ensure_ascii=False),
               json.dumps(ch["key_points"], ensure_ascii=False),
               json.dumps(ch["difficulties"], ensure_ascii=False),
               json.dumps(ch["sections"], ensure_ascii=False),
               json.dumps(ch["experiments"], ensure_ascii=False),
               json.dumps(ch["notes"], ensure_ascii=False), "draft")
        if apply:
            cur.execute("""INSERT INTO syllabus_chapters
                (id, book_chapter_no, title, teach_seqs, hours_theory, hours_practice,
                 objectives, key_points, difficulties, sections, experiments, notes, review_status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", row)
        print(f"  CH{no} {ch['title']}: {'写入' if apply else '将插入'} (id={rid[:8]}...)")

    # 2) 题映射
    print("\n=== 题映射更新 ===")
    total_plan = 0
    for ch, pids in Q_MOVES.items():
        for pid in pids:
            p, q = split_pid(pid)
            cur.execute("SELECT chapter_ref FROM tiku_questions WHERE paper_no=? AND qid=?", (p, q))
            r = cur.fetchone()
            if r is None:
                print(f"  {pid} → {ch}: 题不存在! 跳过")
                continue
            old = r[0]
            if old == ch:
                print(f"  {pid}: 已是 {ch}，跳过")
                continue
            if apply:
                cur.execute("UPDATE tiku_questions SET chapter_ref=? WHERE paper_no=? AND qid=?", (ch, p, q))
            print(f"  {pid}: {old if old else '(空)'} → {ch}")
            total_plan += 1

    if apply:
        con.commit()
    print(f"\n计划更新题数: {total_plan}；新增章节: {sum(1 for ch in NEW_CHAPTERS)}")
    con.close()
    if not apply:
        print("提示: 加 --apply 写库")

if __name__ == "__main__":
    main()
