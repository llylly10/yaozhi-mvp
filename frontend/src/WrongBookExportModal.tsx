import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer, X, Eye, EyeSlash, FileText, Warning, Sparkle, BookmarkSimple } from '@phosphor-icons/react'
import { api } from './api'

interface ExportItem {
  attempt_id: string
  question_id: string
  question_code: string
  stem: string
  options: { key: string; text: string }[]
  student_answer: string
  correct_answer: string
  domain_id: string
  domain_name: string
  misconception_category: string
  misconception_name: string
  case_scenario: string
  case_lesson: string
  textbook_anchor: string
  analysis: string
  confusion_pair: string
  mnemonic: string
  retention_pct: number
  decay_level: 'fresh' | 'warning' | 'critical'
  days_since: number
  evidence_level: string
}

interface ExportData {
  user_id: string
  generated_at: string
  total_wrong: number
  high_risk_count: number
  items: ExportItem[]
}

interface Props {
  userId: string
  onClose: () => void
}

export const WrongBookExportModal: React.FC<Props> = ({ userId, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ExportData | null>(null)
  const [hideAnswers, setHideAnswers] = useState(false)
  const [highRiskOnly, setHighRiskOnly] = useState(false)

  useEffect(() => {
    api.exportWrongBook(userId)
      .then((res: ExportData) => {
        setData(res)
      })
      .catch((err) => {
        console.error('Failed to export wrong book', err)
      })
      .finally(() => setLoading(false))

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userId, onClose])

  const filteredItems = (data?.items || []).filter((it) => {
    if (highRiskOnly) {
      return it.decay_level === 'warning' || it.decay_level === 'critical'
    }
    return true
  })

  const handlePrint = () => {
    window.print()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-white print:static">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="relative flex h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl print:h-auto print:max-w-none print:rounded-none print:shadow-none print:border-none"
        >
          {/* Header Bar - Hidden on print */}
          <div className="flex items-center justify-between border-b border-line px-6 py-4 print:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-gold">
                <FileText size={20} weight="bold" />
              </div>
              <div>
                <h3 className="font-semibold text-ink-1">错题本 · 考前必背记忆手册与真题集</h3>
                <p className="text-xs text-ink-3">
                  聚合人卫9e教材出处、核心考点速记口诀与混淆辨析 · 支持直连打印生成 A4 纸质手册
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Toggle Hide Answers */}
              <button
                type="button"
                onClick={() => setHideAnswers(!hideAnswers)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  hideAnswers ? 'bg-amber-100 text-amber-800' : 'bg-line/40 text-ink-2 hover:bg-line/70'
                }`}
                title={hideAnswers ? '当前为刷题默写模式（已隐藏答案）' : '当前为考前复习模式（展示解析）'}
              >
                {hideAnswers ? <EyeSlash size={14} weight="bold" /> : <Eye size={14} weight="bold" />}
                {hideAnswers ? '默写自测模式（答案已遮挡）' : '考前背诵模式（完整解析）'}
              </button>

              {/* Toggle High Risk Only */}
              <button
                type="button"
                onClick={() => setHighRiskOnly(!highRiskOnly)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  highRiskOnly ? 'bg-red-100 text-red-800' : 'bg-line/40 text-ink-2 hover:bg-line/70'
                }`}
              >
                <Warning size={14} weight="bold" />
                {highRiskOnly ? `仅看高危衰退 (${data?.high_risk_count || 0})` : '全量错题'}
              </button>

              {/* Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
              >
                <Printer size={15} weight="bold" />
                打印 / 导出 PDF
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-3 hover:bg-line/40"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          </div>

          {/* Printable Document Container */}
          <div className="flex-1 overflow-y-auto px-8 py-6 print:overflow-visible print:p-0">
            <style>{`
              @media print {
                body * {
                  visibility: hidden;
                }
                .printable-area, .printable-area * {
                  visibility: visible;
                }
                .printable-area {
                  position: absolute;
                  left: 0;
                  top: 0;
                  width: 100%;
                  color: #000;
                  background: #fff;
                }
                .page-break {
                  page-break-after: always;
                }
                .avoid-break {
                  page-break-inside: avoid;
                }
              }
            `}</style>

            <div className="printable-area mx-auto max-w-3xl space-y-6">
              {/* Document Title Header */}
              <div className="border-b-2 border-primary/20 pb-4 text-center">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-0.5 text-xs font-semibold text-primary">
                  药知智能体 · 临床药学考前精准提分宝典
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-1">
                  《药理学》错题归因与考前必背重点小册
                </h1>
                <div className="mt-2 flex items-center justify-center gap-4 text-xs text-ink-3">
                  <span>学员 ID: {userId.slice(0, 8)}</span>
                  <span>生成时间: {data?.generated_at}</span>
                  <span>错题总计: {filteredItems.length} 道</span>
                  {data?.high_risk_count ? (
                    <span className="text-red-600 font-medium">包含高危临界遗忘项: {data.high_risk_count} 道</span>
                  ) : null}
                </div>
              </div>

              {loading && (
                <div className="py-20 text-center text-sm text-ink-3">
                  正在整合教材切片出处、速记口诀与混淆辨析...
                </div>
              )}

              {!loading && filteredItems.length === 0 && (
                <div className="py-20 text-center text-sm text-ink-3">
                  暂无匹配的错题记录。去「今日待办」刷题吧！
                </div>
              )}

              {/* Items List */}
              <div className="space-y-6">
                {filteredItems.map((item, idx) => (
                  <div
                    key={item.attempt_id}
                    className="avoid-break rounded-xl border border-line bg-surface/50 p-5 print:border-black/20 print:bg-white"
                  >
                    {/* Header Tag */}
                    <div className="flex items-center justify-between border-b border-line/60 pb-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-ink-1">[{item.question_code}] {item.domain_name}</span>
                        <span className="rounded bg-line/60 px-1.5 py-0.5 text-ink-2 font-mono">
                          {item.misconception_category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {item.decay_level === 'critical' && (
                          <span className="rounded bg-red-100 px-2 py-0.5 text-red-700 font-medium text-[11px]">
                            ⚠️ 严重遗忘 (记忆留存 {item.retention_pct}%)
                          </span>
                        )}
                        {item.decay_level === 'warning' && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800 font-medium text-[11px]">
                            ⚠️ 临界衰退 (留存 {item.retention_pct}%)
                          </span>
                        )}
                        <span className="text-ink-3">未复习 {item.days_since} 天</span>
                      </div>
                    </div>

                    {/* Question Stem */}
                    <p className="mt-3 text-sm font-medium leading-relaxed text-ink-1">
                      {item.stem}
                    </p>

                    {/* Options */}
                    <div className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {item.options.map((opt) => {
                        const isStudent = opt.key === item.student_answer
                        const isCorrect = opt.key === item.correct_answer
                        let optStyle = 'border-line/60 bg-white/60 text-ink-2'
                        if (!hideAnswers) {
                          if (isCorrect) optStyle = 'border-emerald-300 bg-emerald-50 text-emerald-900 font-medium'
                          else if (isStudent) optStyle = 'border-red-200 bg-red-50/70 text-red-800 line-through'
                        }
                        return (
                          <div
                            key={opt.key}
                            className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${optStyle}`}
                          >
                            <span className="font-bold">{opt.key}.</span>
                            <span>{opt.text}</span>
                          </div>
                        )
                      })}
                    </div>

                    {/* Analysis & Memorization Section */}
                    {!hideAnswers ? (
                      <div className="mt-4 space-y-2.5 rounded-lg bg-surface p-3 text-xs print:bg-gray-50">
                        {/* Answers & Diagnosis */}
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-semibold text-emerald-700">
                            正确答案: {item.correct_answer}
                          </span>
                          <span className="text-red-600">
                            历史作答: {item.student_answer}
                          </span>
                          <span className="text-ink-3">
                            错因归因: {item.misconception_name} ({item.evidence_level}证据)
                          </span>
                        </div>

                        {/* Mnemonic Capsule */}
                        {item.mnemonic && (
                          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-amber-900 print:bg-amber-50">
                            <Sparkle size={15} weight="fill" className="mt-0.5 flex-shrink-0 text-amber-600" />
                            <div>
                              <span className="font-bold">【速记口诀】：</span>
                              <span>{item.mnemonic}</span>
                            </div>
                          </div>
                        )}

                        {/* Confusion Distinction */}
                        {item.confusion_pair && (
                          <div className="flex items-start gap-2 text-ink-2">
                            <BookmarkSimple size={15} weight="bold" className="mt-0.5 flex-shrink-0 text-gold" />
                            <div>
                              <span className="font-semibold text-ink-1">【考点易混辨析】：</span>
                              <span>{item.confusion_pair}</span>
                            </div>
                          </div>
                        )}

                        {/* Case Evidence or Analysis */}
                        {item.case_scenario && (
                          <div className="text-ink-2">
                            <span className="font-semibold text-ink-1">【真实临床实例】：</span>
                            {item.case_scenario} —— <span className="text-ink-1">{item.case_lesson}</span>
                          </div>
                        )}

                        {/* Textbook Anchor */}
                        <div className="pt-1 text-[11px] text-ink-3 border-t border-line/40">
                          出处依据: {item.textbook_anchor} · {item.analysis ? item.analysis.slice(0, 100) + '...' : ''}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-2 text-xs text-ink-3">
                        <span>（默写模式：答案与解析已隐藏）</span>
                        <span>正确答案: [  ]</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Document Footer */}
              <div className="border-t border-line pt-4 text-center text-[11px] text-ink-3 print:pt-6">
                药知（YaoZhi）智能药学备考系统 · 结合认知诊断与遗忘衰减模型 · 祝考试顺利通关
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
