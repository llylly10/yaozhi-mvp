# -*- coding: utf-8 -*-
"""prompt v3 手术：在 attribute_misconception 的 system prompt 上追加三条判别规则。

依据：留存集 v2 真模型实测（qwen3.7-flash-2026-07-15，real=40/fallback=0，
acc 82.5% / macro-F1 82.2%，门禁PASSED）7 个错例的偏差方向：

  HO2-JZ-001 / JZ-002  机制 -> 遗忘  理由明写"未理解 X 关系"但无机制名词
  HO2-JZ-003 / JZ-010  机制 -> 混淆 考转运方向 / 合成 vs 灭活位点，不在 v2 机制对象清单
  HO2-HX-001 / HX-004  混淆 -> 遗忘/机制 理由显式写"混淆了X与Y"却未优先归混淆

三条改动（v2 四条规则保持不动，只在其后追加 5/6/7）：
  5) 判据从"认不认得出机制名词"改为"推不推得出因果链"——题干问某结论
     为什么成立/意味着什么/反映什么而学生答不出其中关系 → 机制类；
  6) 机制对象范围扩展：补转运方向、合成 vs 灭活位点、效应类型；
  7) 理由显式出现"混淆/混同/张冠李戴"且指向两个具体对象 → 优先混淆，
     除非两个对象都是机制要素。

不做的事：
  - 不改 v2 的四条规则（已验证遗忘类 10/10 零误判，改动风险大于收益）；
  - 不针对 HO2-ST-009 改prompt（该例金标本身存疑，交顾问复核）。

幂等：可重复执行（每次先回退到 v2 基线再改）。
用法：cd backend && ../.venv/Scripts/python.exe ../scripts/apply_prompt_v3.py
"""
import io
from pathlib import Path

PROVIDER = Path(__file__).resolve().parents[1] / "backend" / "app" / "llm" / "provider.py"

V2_ANCHOR = '"其余单纯结论没记住或记不准 → 知识遗忘。\\n"'
V3_EXTRA = (
    '"5) 判据是能否推出因果链，不是能否识别机制名词。若题干问的是某个结论"\n'
    '            "为什么成立、意味着什么、反映什么、依据是什么，而学生作答理由显示"\n'
    '            "未理解该结论与其依据之间的关系（而非未记住某个术语或数值），"\n'
    '            "归机制理解不足，即使题干与选项中未出现受体/通路/酶等机制名词。\\n"\n'
    '            "6) 机制层面对象还包括：物质转运方向与方式（如主动转运与被动滤过）、"\n'
    '            "合成与灭活/降解的作用位点差异、效应类型（如收缩与舒张、兴奋与抑制）、"\n'
    '            "反馈调节的方向。学生把这些环节或位点认错，属机制理解不足，"\n'
    '            "不属于概念混淆。\\n"\n'
    '            "7) 若学生作答理由明确出现「混淆了」「混同了」「张冠李戴」「记混」等表述，"\n'
    '            "且指向两个具体对象，则优先归概念混淆；但若两个对象均属第6 条列举的"\n'
    '            "机制要素，仍归机制理解不足。\\n"\n'
)


def main() -> None:
    src = io.open(PROVIDER, encoding="utf-8").read()

    if "5) 判据是能否推出因果链" in src:
        print("prompt v3 规则已存在，跳过（幂等）。")
        return

    n = src.count(V2_ANCHOR)
    assert n == 1, f"v2 锚点应唯一命中，实得 {n} 处——请检查 provider.py 是否被改过"
    out = src.replace(V2_ANCHOR, V2_ANCHOR.replace(
        '"其余单纯结论没记住或记不准 → 知识遗忘。\\n"',
        '"其余单纯结论没记住或记不准 → 知识遗忘。\\n"\n            ' + V3_EXTRA.rstrip()
    ))

    # 更新版本注释
    old_comment = "# prompt v2（2026-10-02）：依 80 案例真模型评测暴露的两个边界补判别规则——"
    new_comment = (
        "# prompt v3（2026-10-11）：依留存集 v2 实测（82.5%）7 错例偏差追加规则 5/6/7——\n"
        "# 机制类判据改「能否推出因果链」、机制对象补转运方向与合成/灭活位点、\n"
        "# 理由显式混淆信号优先。v2 四条规则保持不动（遗忘类 10/10 零误判）。\n"
        "# v2 基线备份：scratch/scratch_provider_v2_backup.py（2026-10-11）。\n"
        "# 原 v2 注释（2026-10-02）：依 80 案例真模型评测暴露的两个边界补判别规则——"
    )
    assert src.count(old_comment) == 1, "版本注释锚点未唯一命中"
    out = out.replace(old_comment, new_comment)

    # 语法回读验证（文本手术必做）
    import ast
    ast.parse(out)
    io.open(PROVIDER, "w", encoding="utf-8").write(out)
    print("prompt v3 已写入，ast.parse 通过。")
    print(f"provider.py行数：{len(src.splitlines())} -> {len(out.splitlines())}")


if __name__ == "__main__":
    main()