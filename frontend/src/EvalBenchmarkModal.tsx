import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck, CheckCircle, XCircle, ArrowClockwise, X, Sparkle,
} from '@phosphor-icons/react'
import { api, type EvalReportData } from './api'

interface Props {
  onClose: () => void
}

export function EvalBenchmarkModal({ onClose }: Props) {
  const [report, setReport] = useState<EvalReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('mock')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLatest()
  }, [])

  async function loadLatest() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getEvalLatest()
      setReport(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleRunEval() {
    setRunning(true)
    setError(null)
    try {
      const data = await api.runEval(selectedProvider)
      setReport(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  // 类别简称，用于混淆矩阵表头
  const shortLabels: Record<string, string> = {
    '知识遗忘': '遗忘',
    '概念混淆': '混淆',
    '机制理解不足': '机制',
    '审题与应用失误': '审题',
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink/50 backdrop-blur-sm"
        />

        {/* 弹窗主体 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className="relative z-10 w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-paper-1 shadow-2xl border border-line/80 overflow-hidden"
        >
          {/* 顶栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-white/70 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow-xs">
                <ShieldCheck size={20} weight="fill" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-ink">错因诊断保护测试集自动化评测与门禁</h2>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                    星跃三期 · 算法门禁
                  </span>
                </div>
                <p className="text-xs text-ink-3">
                  80 题黄金保护测试集 · 严禁先验泄露 · 三级红线门禁体系 · 全量混淆矩阵
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink transition"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* 内容区 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={loadLatest} className="text-xs font-semibold text-red-800 underline">重试</button>
              </div>
            )}

            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-ink-3 space-y-3">
                <ArrowClockwise size={28} className="animate-spin text-primary" />
                <p className="text-sm font-medium">正在读取最新基准评测报告…</p>
              </div>
            ) : report ? (
              <>
                {/* 门禁总览 Banner */}
                <div
                  className={`rounded-2xl p-4.5 border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    report.gates.all_passed
                      ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50/60 text-emerald-950'
                      : 'border-rose-200 bg-gradient-to-r from-rose-50 via-red-50 to-rose-50/60 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`grid size-11 place-items-center rounded-2xl shadow-xs ${
                        report.gates.all_passed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {report.gates.all_passed ? (
                        <ShieldCheck size={26} weight="fill" />
                      ) : (
                        <XCircle size={26} weight="fill" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold tracking-wide">
                          {report.gates.all_passed
                            ? '准入评估结果：全量通过 (PASSED)'
                            : '准入评估结果：门禁拦截 (REJECTED)'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                            report.gates.all_passed
                              ? 'bg-emerald-200 text-emerald-900'
                              : 'bg-rose-200 text-rose-900'
                          }`}
                        >
                          {report.gates.status_label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs opacity-85 leading-relaxed">
                        {report.gates.all_passed
                          ? '三项红线门禁全量通过：未出现单类零召回死刑、宏召回率与宏F1均达到试点准入门槛。'
                          : '存在未达标门禁项，严禁直接推进真实试点，请查看细项进行诊断算法优化。'}
                      </p>
                    </div>
                  </div>

                  {/* 评测操作区 */}
                  <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                    <select
                      value={selectedProvider}
                      onChange={(e) => setSelectedProvider(e.target.value)}
                      className="rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-2xs"
                    >
                      <option value="mock">规则基线引擎 (Mock)</option>
                      <option value="glm">智谱 GLM-4-Flash</option>
                    </select>
                    <button
                      onClick={handleRunEval}
                      disabled={running}
                      className="btn btn-primary flex items-center gap-1.5 !px-3.5 !py-1.5 text-xs whitespace-nowrap shadow-sm"
                    >
                      <ArrowClockwise size={14} className={running ? 'animate-spin' : ''} />
                      {running ? '评测执行中…' : '一键重跑评测'}
                    </button>
                  </div>
                </div>

                {/* 4 个核心 KPI 卡片 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-3 font-medium">Macro-F1 (宏F1)</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          report.gates.gate3_macro_f1.passed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {report.gates.gate3_macro_f1.passed ? '达标' : '未达标'}
                      </span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-ink">
                      {(report.overall.macro_f1 * 100).toFixed(1)}%
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">
                      门槛 ≥ {(report.gates.gate3_macro_f1.threshold * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-3 font-medium">Macro-Recall (宏召回)</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          report.gates.gate2_macro_recall.passed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {report.gates.gate2_macro_recall.passed ? '达标' : '未达标'}
                      </span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-ink">
                      {(report.overall.macro_recall * 100).toFixed(1)}%
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">
                      门槛 ≥ {(report.gates.gate2_macro_recall.threshold * 100).toFixed(0)}%
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-3 font-medium">总体准确率 (Acc)</span>
                      <span className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        80题
                      </span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-ink">
                      {(report.overall.accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">
                      精确命中用例率
                    </div>
                  </div>

                  <div className="rounded-2xl border border-line bg-white p-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ink-3 font-medium">零召回死刑违规</span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          report.gates.gate1_no_zero_recall.passed
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {report.gates.gate1_no_zero_recall.passed ? '无违规' : '死刑否决'}
                      </span>
                    </div>
                    <div className="mt-1 text-2xl font-black text-ink">
                      {report.gates.gate1_no_zero_recall.zero_recall_categories.length} 类
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-3">
                      任一类Recall=0即否决
                    </div>
                  </div>
                </div>

                {/* 三级门禁详情卡片 */}
                <div className="rounded-2xl border border-line bg-white/80 p-4 space-y-2">
                  <div className="text-xs font-bold text-ink flex items-center gap-2">
                    <Sparkle size={13} weight="fill" className="text-primary" />
                    评测红线三级门禁检查明细 (依据 AGENTS.md 规范)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    {/* 门禁 1 */}
                    <div className="rounded-xl bg-paper-2/60 p-3 border border-line/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">门禁一：单类零召回</span>
                        {report.gates.gate1_no_zero_recall.passed ? (
                          <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                        ) : (
                          <XCircle size={15} weight="fill" className="text-rose-600" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {report.gates.gate1_no_zero_recall.passed
                          ? '✓ 全部 4 类错因均具备有效诊断识别能力'
                          : `✕ 严重死刑：${report.gates.gate1_no_zero_recall.zero_recall_categories.join('、')} 召回率为 0`}
                      </p>
                    </div>

                    {/* 门禁 2 */}
                    <div className="rounded-xl bg-paper-2/60 p-3 border border-line/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">门禁二：宏召回率</span>
                        {report.gates.gate2_macro_recall.passed ? (
                          <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                        ) : (
                          <XCircle size={15} weight="fill" className="text-rose-600" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {report.gates.gate2_macro_recall.passed
                          ? `✓ ${(report.gates.gate2_macro_recall.current * 100).toFixed(1)}% ≥ ${(report.gates.gate2_macro_recall.threshold * 100).toFixed(0)}% 门槛达成`
                          : `✕ ${(report.gates.gate2_macro_recall.current * 100).toFixed(1)}% < ${(report.gates.gate2_macro_recall.threshold * 100).toFixed(0)}% 门槛未达标`}
                      </p>
                    </div>

                    {/* 门禁 3 */}
                    <div className="rounded-xl bg-paper-2/60 p-3 border border-line/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">门禁三：宏 F1 分数</span>
                        {report.gates.gate3_macro_f1.passed ? (
                          <CheckCircle size={15} weight="fill" className="text-emerald-600" />
                        ) : (
                          <XCircle size={15} weight="fill" className="text-rose-600" />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-ink-3">
                        {report.gates.gate3_macro_f1.passed
                          ? `✓ ${(report.gates.gate3_macro_f1.current * 100).toFixed(1)}% ≥ ${(report.gates.gate3_macro_f1.threshold * 100).toFixed(0)}% 门槛达成`
                          : `✕ ${(report.gates.gate3_macro_f1.current * 100).toFixed(1)}% < ${(report.gates.gate3_macro_f1.threshold * 100).toFixed(0)}% 门槛未达标`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 左右分栏：4类错因诊断分析 + 混淆矩阵 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* 左栏：4 类错因逐项指标 */}
                  <div className="lg:col-span-6 rounded-2xl border border-line bg-white p-4 space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <span className="text-xs font-bold text-ink">4 类错因逐项诊断能力</span>
                      <span className="text-[11px] text-ink-3">每类均衡 20 例测试用例</span>
                    </div>

                    <div className="space-y-3">
                      {report.category_metrics.map((m) => (
                        <div key={m.category} className="rounded-xl bg-paper-2/40 p-2.5 border border-line/50">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-ink">{m.category}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-ink-3">
                                F1: <strong className="text-ink">{(m.f1 * 100).toFixed(1)}%</strong>
                              </span>
                              <span
                                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                                  m.passed_redline
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                                }`}
                              >
                                {m.passed_redline ? '非零' : '死刑'}
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            {/* Recall 进度 */}
                            <div>
                              <div className="flex justify-between text-ink-3 mb-0.5">
                                <span>召回率 (Recall)</span>
                                <span className="font-semibold text-ink">{(m.recall * 100).toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-line/60 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.min(100, m.recall * 100)}%` }}
                                />
                              </div>
                            </div>

                            {/* Precision 进度 */}
                            <div>
                              <div className="flex justify-between text-ink-3 mb-0.5">
                                <span>精确率 (Precision)</span>
                                <span className="font-semibold text-ink">{(m.precision * 100).toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-line/60 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gold"
                                  style={{ width: `${Math.min(100, m.precision * 100)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 右栏：4x4 混淆矩阵 (Confusion Matrix) */}
                  <div className="lg:col-span-6 rounded-2xl border border-line bg-white p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-line pb-2.5">
                      <span className="text-xs font-bold text-ink">4 × 4 混淆矩阵 (Confusion Matrix)</span>
                      <span className="text-[11px] text-ink-3">对角线 = 精确命中</span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-center text-xs border-collapse">
                        <thead>
                          <tr>
                            <th className="p-1.5 text-[10.5px] text-ink-3 font-medium text-left">
                              真实 \ 预测
                            </th>
                            {report.confusion_matrix.labels.map((l) => (
                              <th
                                key={l}
                                className="p-1.5 text-[11px] font-bold text-ink bg-paper-2/50 rounded-t-lg"
                                title={l}
                              >
                                {shortLabels[l] || l}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.confusion_matrix.matrix.map((row, rIdx) => {
                            const trueLabel = report.confusion_matrix.labels[rIdx]
                            return (
                              <tr key={trueLabel} className="border-t border-line/40">
                                <td className="p-1.5 text-[11px] font-bold text-ink text-left bg-paper-2/30">
                                  {shortLabels[trueLabel] || trueLabel}
                                </td>
                                {row.map((count, cIdx) => {
                                  const isHit = rIdx === cIdx
                                  return (
                                    <td
                                      key={cIdx}
                                      className={`p-2 font-mono text-[12px] font-semibold transition ${
                                        isHit
                                          ? 'bg-emerald-100/80 text-emerald-900 font-bold border border-emerald-300'
                                          : count > 0
                                          ? 'bg-amber-50 text-amber-800'
                                          : 'text-ink-3/40'
                                      }`}
                                      title={`真实: ${trueLabel}, 预测: ${report.confusion_matrix.labels[cIdx]} => ${count} 例`}
                                    >
                                      {count}
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-2 border-t border-line/50 flex items-center justify-between text-[11px] text-ink-3">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2.5 rounded-sm bg-emerald-200 border border-emerald-400" />
                        对角绿色：正确分类
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2.5 rounded-sm bg-amber-100 border border-amber-300" />
                        浅橙色：跨类混淆分类
                      </span>
                    </div>
                  </div>
                </div>

                {/* 底部报告审计信息 */}
                <div className="rounded-xl bg-paper-2/50 p-3 text-xs text-ink-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border border-line/60">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-2">评测审计批次:</span>
                    <span className="font-mono">{report.run_id}</span>
                    <span>·</span>
                    <span>{report.timestamp}</span>
                    <span>·</span>
                    <span>引擎: {report.provider}</span>
                  </div>
                  <span className="text-[11px] text-primary">
                    已自动落盘至项目根目录 Markdown 评测报告
                  </span>
                </div>
              </>
            ) : null}
          </div>

          {/* 底栏 */}
          <div className="px-6 py-3.5 border-t border-line bg-paper-2/40 flex items-center justify-between">
            <span className="text-xs text-ink-3">
              遵循《Datawhale 星跃三期智能体评测规范》· 评测集受保护不参与模型提示词
            </span>
            <button
              onClick={onClose}
              className="btn rounded-full px-5 py-1.5 text-xs text-ink-2 bg-white border border-line hover:bg-paper-2"
            >
              关闭
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
