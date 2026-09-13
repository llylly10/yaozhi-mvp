"""贝叶斯知识追踪（Bayesian Knowledge Tracing, BKT）引擎。

基于 Corbett & Anderson (1995) 经典 HMM 二值知识追踪理论，为药知知识点掌握度提供：
1. 连续概率在线贝叶斯更新（P_L）；
2. 考虑猜对率（Guess）与失误率（Slip）的容错推断；
3. 学习跃迁率（Learn）与艾宾浩斯时间遗忘衰减；
4. 连续概率与六阶段业务状态（未评估/薄弱/学习中/初步掌握/掌握/稳定掌握）的双轨平滑映射；
5. 针对离线大规模数据集的 pyBKT 模型适配器。
"""
from dataclasses import dataclass
import math
from typing import Literal

try:
    from pyBKT.models import Model as PyBKTModel
    HAS_PYBKT = True
except Exception:
    PyBKTModel = None
    HAS_PYBKT = False


@dataclass
class BKTParameters:
    """单个知识点或题目的 BKT 4 项核心参数。"""
    prior: float = 0.15       # P(L0): 初始先验掌握概率
    learn: float = 0.18       # P(T): 每次作答/学习后从未掌握跃迁至掌握的学习转移率
    guess: float = 0.20       # P(G): 未掌握时蒙对的概率（医学 4~5 选 1 单选）
    slip: float = 0.10        # P(S): 已掌握时失误/粗心答错的概率
    forget: float = 0.02      # P(F): 每日轻微记忆衰退率


# 预设的药理学典型考点参数配置（可按认知难度自适应）
DEFAULT_BKT_PARAMS = BKTParameters()
CONCEPT_PARAMS = BKTParameters(prior=0.18, learn=0.22, guess=0.20, slip=0.08)   # 概念记忆型
MECHANISM_PARAMS = BKTParameters(prior=0.10, learn=0.15, guess=0.15, slip=0.12) # 机制推理型（更难猜对，失误率稍高）


class BKTOnlineTracker:
    """高内聚、零网络延迟的 BKT 在线推断器。"""

    @staticmethod
    def update_posterior(p_known: float, is_correct: bool, params: BKTParameters = DEFAULT_BKT_PARAMS) -> float:
        """单次作答后的贝叶斯后验概率更新：
        1. 计算当前作答观测下的条件概率 P(L_t | O_t)；
        2. 结合学习转移率 P(T) 计算下一状态掌握预测值 P(L_{t+1})。
        """
        p = max(0.01, min(0.99, float(p_known)))
        g = max(0.01, min(0.50, params.guess))
        s = max(0.01, min(0.40, params.slip))
        t = max(0.01, min(0.50, params.learn))

        if is_correct:
            # 答对：P(L | correct) = P * (1 - S) / [P * (1 - S) + (1 - P) * G]
            numerator = p * (1.0 - s)
            denominator = numerator + (1.0 - p) * g
            p_posterior = numerator / denominator if denominator > 0 else p
        else:
            # 答错：P(L | wrong) = P * S / [P * S + (1 - P) * (1 - G)]
            numerator = p * s
            denominator = numerator + (1.0 - p) * (1.0 - g)
            p_posterior = numerator / denominator if denominator > 0 else p

        # 考虑学习跃迁：P(L_{t+1}) = P_post + (1 - P_post) * P(T)
        p_next = p_posterior + (1.0 - p_posterior) * t
        return round(max(0.01, min(0.99, p_next)), 4)

    @staticmethod
    def apply_decay(p_known: float, days_passed: float, half_life_days: float = 7.0) -> float:
        """艾宾浩斯时间遗忘衰减模型：
        基于半衰期指数衰减公式 P_decay = P * (2 ** (-Δt / t_half))
        下限设为 0.10，避免衰减归零。
        """
        if days_passed <= 0:
            return p_known
        decay_factor = math.pow(2.0, -float(days_passed) / max(1.0, half_life_days))
        decayed_p = p_known * decay_factor
        return round(max(0.10, min(0.99, decayed_p)), 4)

    @staticmethod
    def probability_to_state(p: float, current_state: str | None = None) -> str:
        """掌握概率与六阶段业务状态的映射转换：
        [0.00, 0.35) -> 薄弱
        [0.35, 0.60) -> 学习中
        [0.60, 0.80) -> 初步掌握
        [0.80, 0.95) -> 掌握
        [0.95, 1.00] -> 稳定掌握
        """
        if current_state == "未评估" and p <= 0.15:
            return "未评估"
        if p < 0.35:
            return "薄弱"
        if p < 0.60:
            return "学习中"
        if p < 0.80:
            return "初步掌握"
        if p < 0.95:
            return "掌握"
        return "稳定掌握"

    @staticmethod
    def state_to_default_probability(state: str) -> float:
        """状态向默认基准概率的冷启动映射（用于既有存量数据平滑打底）。"""
        defaults = {
            "未评估": 0.15,
            "薄弱": 0.20,
            "学习中": 0.45,
            "初步掌握": 0.70,
            "掌握": 0.88,
            "稳定掌握": 0.96,
        }
        return defaults.get(state, 0.15)
