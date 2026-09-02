from types import SimpleNamespace

from seed.map_tiku_chapters import map_question


def question(stem, options, answer):
    return SimpleNamespace(
        stem=stem,
        options=[{"key": key, "text": text} for key, text in options],
        answer=answer,
    )


def test_correct_answer_breaks_distractor_created_tie():
    q = question(
        "金黄色葡萄球菌引起的急慢性骨髓炎最好选用",
        [
            ("A", "阿莫西林"),
            ("B", "红霉素"),
            ("C", "头孢曲松"),
            ("D", "克林霉素"),
            ("E", "克拉霉素"),
        ],
        "D",
    )

    ref, _, note = map_question(q)

    assert ref == "CH36"
    assert note == "正确答案消除并列"


def test_real_cross_chapter_tie_is_kept_when_answer_has_no_chapter_signal():
    q = question(
        "强心苷中毒引起的心律失常，不宜用氯化钾的是",
        [
            ("A", "房室结性心动过速"),
            ("B", "室性心动过速"),
            ("C", "室性期前收缩"),
            ("D", "房室传导阻滞"),
            ("E", "房性心动过速"),
        ],
        "D",
    )

    ref, _, _ = map_question(q)

    assert ref == "CH22,CH23"


def test_missing_syllabus_chapter_stays_unmapped():
    q = question(
        "可用于各种局部麻醉方法的局麻药是",
        [("A", "丁卡因"), ("B", "利多卡因"), ("C", "普鲁卡因")],
        "B",
    )

    ref, score, note = map_question(q)

    assert (ref, score, note) == ("", 0, "")
