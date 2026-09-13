import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  FirstAid, CheckCircle, XCircle, Warning, ChatCircle, ArrowRight, ArrowLeft,
  Sparkle, Heartbeat, Star, Check
} from '@phosphor-icons/react'
import { api } from './api'

interface ClinicalCaseSummary {
  id: string
  title: string
  category: string
  patient_name: string
  chief_complaint: string
  question_count: number
}

interface Question {
  qid: string
  stem: string
  options: { key: string; text: string }[]
}

interface CaseDetail {
  id: string
  title: string
  category: string
  patient: {
    name: string
    gender: string
    age: number
    chief_complaint: string
    history: string
    vitals: string
    labs: { name: string; val: string; ref: string; status: 'normal' | 'high' | 'low' | 'low_normal' }[]
    current_prescription: { drug_name: string; spec: string; usage: string; role: string }[]
  }
  questions: Question[]
}

interface EvalResult {
  qid: string
  stem: string
  options: { key: string; text: string }[]
  user_answer: string
  correct_answer: string
  is_correct: boolean
  analysis: string
}

interface CaseEvalResponse {
  case_id: string
  title: string
  category: string
  total_questions: number
  correct_count: number
  score: number
  score_ratio: number
  passed: boolean
  star_rating: number
  results: EvalResult[]
  evaluations: Record<string, EvalResult>
  pharmacist_summary: string
  textbook_reference: string
}

interface Props {
  userId: string
  onAskAi: (context: string, question: string) => void
  onBackToTodo?: () => void
}

export const ClinicalCaseView: React.FC<Props> = ({ userId, onAskAi, onBackToTodo }) => {
  const [cases, setCases] = useState<ClinicalCaseSummary[]>([])
  const [selectedCaseId, setSelectedCaseId] = useState<string>('case_cvs_01')
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null)
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [evalResult, setEvalResult] = useState<CaseEvalResponse | null>(null)
  const [loading, setLoading] = useState(true)

  // 1. Fetch case summaries
  useEffect(() => {
    api.clinicalCases(userId)
      .then((res: { cases: ClinicalCaseSummary[] }) => {
        setCases(res.cases || [])
        if (res.cases && res.cases.length > 0) {
          setSelectedCaseId(res.cases[0].id)
        }
      })
      .catch((err) => console.error('Failed to load clinical cases', err))
  }, [userId])

  // 2. Fetch specific case detail
  useEffect(() => {
    if (!selectedCaseId) return
    setLoading(true)
    setEvalResult(null)
    setUserAnswers({})
    api.clinicalCaseDetail(userId, selectedCaseId)
      .then((detail: CaseDetail) => {
        setCaseDetail(detail)
      })
      .catch((err) => console.error('Failed to load case detail', err))
      .finally(() => setLoading(false))
  }, [userId, selectedCaseId])

  const handleSelectOption = (qid: string, key: string) => {
    if (evalResult) return // already submitted
    setUserAnswers((prev) => ({ ...prev, [qid]: key }))
  }

  const handleSubmit = async () => {
    if (!caseDetail) return
    const answeredCount = Object.keys(userAnswers).length
    if (answeredCount < caseDetail.questions.length) {
      alert(`请先完成全部 ${caseDetail.questions.length} 道决策题目后再提交审核！`)
      return
    }
    setSubmitting(true)
    try {
      const res = await api.submitClinicalCase(userId, caseDetail.id, userAnswers)
      setEvalResult(res)
      // Scroll to review result
      window.scrollTo({ top: 300, behavior: 'smooth' })
    } catch (err: any) {
      alert(err?.message || '提交处方审核失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAskAiAboutCase = () => {
    if (!caseDetail) return
    const ctx = `【真实病例沙盘】案例：${caseDetail.title}\n患者：${caseDetail.patient.name} (${caseDetail.patient.gender}, ${caseDetail.patient.age}岁)\n主诉与病史：${caseDetail.patient.chief_complaint} ${caseDetail.patient.history}\n体征与化验：${caseDetail.patient.vitals}\n拟定处方：${caseDetail.patient.current_prescription.map((m) => `${m.drug_name} (${m.role})`).join('、')}`
    const prompt = `请作为资深临床药理专家，针对该病例（${caseDetail.title}）为我深入剖析：\n1. 处方中的主要不合理用药风险与禁忌；\n2. 相关的分子药理与受体/转运体竞争机制；\n3. 指南推荐的更优替代治疗策略与监护要点。`
    onAskAi(ctx, prompt)
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40">
              <FirstAid size={20} weight="fill" />
            </span>
            <span className="text-xs font-semibold tracking-wider text-emerald-300">
              真实临床实战沙盘 · 处方合理性审核
            </span>
          </div>
          {onBackToTodo && (
            <button
              onClick={onBackToTodo}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20 transition"
            >
              <ArrowLeft size={14} /> 返回今日待办
            </button>
          )}
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            临床处方审核与药物相互作用沙盘
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-300 leading-relaxed">
            药学专硕 / 执业药师高分综合案例大题情境实训：全真电子病历（EMR）化验单排查 + 禁用/慎用靶向甄别 + 细胞药理机制推导 + 临床指南规范赋分。
          </p>
        </div>

        {/* Case Switcher Tabs */}
        <div className="mt-2 flex flex-wrap gap-2 pt-2 border-t border-white/10">
          {cases.map((c) => {
            const isSelected = c.id === selectedCaseId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCaseId(c.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-900/40'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                <span>{c.title.slice(0, 16)}...</span>
              </button>
            )
          })}
        </div>
      </div>

      {loading && (
        <div className="card p-12 text-center text-sm text-ink-3">
          正在加载临床病历与生化检验数据...
        </div>
      )}

      {!loading && caseDetail && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Electronic Medical Record (EMR) */}
          <div className="space-y-6 lg:col-span-7">
            {/* EMR Card */}
            <div className="card overflow-hidden border border-emerald-800/20 bg-surface shadow-sm">
              <div className="flex items-center justify-between border-b border-line/60 bg-emerald-900/5 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Heartbeat size={18} className="text-emerald-700" weight="fill" />
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    电子病历 (EMR) · 门诊病历夹
                  </span>
                </div>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                  {caseDetail.category}
                </span>
              </div>

              <div className="p-5 space-y-4 text-xs leading-relaxed text-ink-2">
                {/* Patient Info Row */}
                <div className="flex flex-wrap items-center gap-6 rounded-lg bg-surface/70 p-3 border border-line/40">
                  <div>
                    <span className="text-ink-3">患者姓名: </span>
                    <span className="font-semibold text-ink-1">{caseDetail.patient.name}</span>
                  </div>
                  <div>
                    <span className="text-ink-3">性别/年龄: </span>
                    <span className="font-semibold text-ink-1">{caseDetail.patient.gender} / {caseDetail.patient.age}岁</span>
                  </div>
                  <div>
                    <span className="text-ink-3">主要生命体征: </span>
                    <span className="font-semibold text-emerald-800">{caseDetail.patient.vitals}</span>
                  </div>
                </div>

                {/* Chief Complaint & History */}
                <div>
                  <h4 className="font-bold text-ink-1 mb-1">【主诉】</h4>
                  <p className="text-ink-2 pl-2 border-l-2 border-emerald-600/40">
                    {caseDetail.patient.chief_complaint}
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-ink-1 mb-1">【现病史与既往史】</h4>
                  <p className="text-ink-2 pl-2 border-l-2 border-emerald-600/40">
                    {caseDetail.patient.history}
                  </p>
                </div>

                {/* Lab Indicators Table */}
                <div>
                  <h4 className="font-bold text-ink-1 mb-2">【主要实验室生化检验 (Labs)】</h4>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {caseDetail.patient.labs.map((lab, i) => {
                      const isHigh = lab.status === 'high'
                      const isLow = lab.status === 'low'
                      return (
                        <div
                          key={i}
                          className={`flex flex-col rounded-lg border p-2.5 ${
                            isHigh
                              ? 'border-red-200 bg-red-50/60 text-red-950'
                              : isLow
                              ? 'border-amber-200 bg-amber-50/60 text-amber-950'
                              : 'border-line/60 bg-white/60 text-ink-2'
                          }`}
                        >
                          <span className="text-[11px] text-ink-3 font-medium truncate">{lab.name}</span>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className={`font-mono text-sm font-bold ${isHigh ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-ink-1'}`}>
                              {lab.val} {isHigh && '↑'} {isLow && '↓'}
                            </span>
                            <span className="text-[10px] text-ink-3 font-mono">参考: {lab.ref}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Prescription Table */}
                <div>
                  <h4 className="font-bold text-ink-1 mb-2 flex items-center justify-between">
                    <span>【拟定处方明细 (Rx)】</span>
                    <span className="text-[11px] font-normal text-ink-3">待药师审核签字</span>
                  </h4>
                  <div className="overflow-hidden rounded-lg border border-line/70">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-surface border-b border-line/60 text-ink-3 font-medium">
                        <tr>
                          <th className="px-3 py-2">药品通用名</th>
                          <th className="px-3 py-2">规格与用量</th>
                          <th className="px-3 py-2">拟用临床角色</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/40 bg-white">
                        {caseDetail.patient.current_prescription.map((rx, idx) => (
                          <tr key={idx} className="hover:bg-surface/50 transition">
                            <td className="px-3 py-2.5 font-semibold text-ink-1">
                              <span className="mr-1.5 text-emerald-700">💊</span>
                              {rx.drug_name}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-ink-2">
                              {rx.spec} · {rx.usage}
                            </td>
                            <td className="px-3 py-2.5 text-ink-3">
                              {rx.role}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Linkage Card */}
            <div className="flex items-center justify-between rounded-xl border border-line bg-gradient-to-r from-emerald-50/50 to-teal-50/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600/10 text-emerald-700">
                  <ChatCircle size={20} weight="fill" />
                </div>
                <div>
                  <h5 className="font-semibold text-xs text-ink-1">对该病例有疑难困惑？</h5>
                  <p className="text-[11px] text-ink-3">可一键将该病历及处方上下文注入「问 AI」药理导师进行深度探讨</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAskAiAboutCase}
                className="btn btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-800"
              >
                <Sparkle size={14} weight="fill" />
                问 AI 启发追问
              </button>
            </div>
          </div>

          {/* Right Column: Interactive Clinical Review Questions */}
          <div className="space-y-6 lg:col-span-5">
            {/* Review Result (If submitted) */}
            {evalResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="card overflow-hidden border border-emerald-300 bg-emerald-50/40 p-5 shadow-md"
              >
                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-white font-bold ${evalResult.passed ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                      {evalResult.passed ? <Check size={18} weight="bold" /> : <Warning size={18} weight="bold" />}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-ink-1">
                        {evalResult.passed ? '处方审核达标' : '处方审核未达标'}
                      </h4>
                      <p className="text-[11px] text-ink-3">
                        答对 {evalResult.correct_count} / {evalResult.total_questions} 题 · 获得 {evalResult.score} 分
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((star) => (
                      <Star
                        key={star}
                        size={18}
                        weight={star <= evalResult.star_rating ? 'fill' : 'regular'}
                        className={star <= evalResult.star_rating ? 'text-amber-500' : 'text-line'}
                      />
                    ))}
                  </div>
                </div>

                {/* Pharmacist Summary */}
                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-lg bg-white/80 p-3 text-ink-2 shadow-sm border border-emerald-100">
                    <span className="font-bold text-emerald-900 block mb-1">【临床药师专家审核意见】：</span>
                    <p className="leading-relaxed">{evalResult.pharmacist_summary}</p>
                  </div>
                  <div className="text-[11px] text-ink-3">
                    📖 指南与出处: {evalResult.textbook_reference}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Questions List */}
            <div className="card p-5 space-y-5">
              <div className="border-b border-line/60 pb-2">
                <h3 className="font-bold text-sm text-ink-1 flex items-center justify-between">
                  <span>临床审方决策决策大题</span>
                  <span className="text-xs text-ink-3 font-normal">
                    共 {caseDetail.questions.length} 关 · 已作答 {Object.keys(userAnswers).length}
                  </span>
                </h3>
              </div>

              <div className="space-y-6">
                {caseDetail.questions.map((q, idx) => {
                  const userAns = userAnswers[q.qid]
                  const qEval = evalResult?.evaluations?.[q.qid]
                  return (
                    <div key={q.qid} className="space-y-3 rounded-xl bg-surface/50 p-4 border border-line/60">
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                          {idx + 1}
                        </span>
                        <p className="text-xs font-semibold text-ink-1 leading-relaxed">
                          {q.stem}
                        </p>
                      </div>

                      {/* Options */}
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const isSelected = userAns === opt.key
                          let btnStyle = isSelected
                            ? 'border-emerald-600 bg-emerald-50/80 text-emerald-900 font-medium'
                            : 'border-line/60 bg-white hover:bg-surface text-ink-2'

                          if (qEval) {
                            if (opt.key === qEval.correct_answer) {
                              btnStyle = 'border-emerald-500 bg-emerald-100 text-emerald-900 font-bold'
                            } else if (isSelected && !qEval.is_correct) {
                              btnStyle = 'border-red-300 bg-red-100 text-red-900 font-medium line-through'
                            }
                          }

                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => handleSelectOption(q.qid, opt.key)}
                              className={`w-full flex items-start gap-2 rounded-lg border p-2.5 text-left text-xs transition ${btnStyle}`}
                            >
                              <span className="font-bold font-mono">{opt.key}.</span>
                              <span className="flex-1">{opt.text}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Question Explanation (After Eval) */}
                      {qEval && (
                        <div className={`rounded-lg p-3 text-xs leading-relaxed ${qEval.is_correct ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                          <div className="flex items-center gap-1.5 font-bold mb-1">
                            {qEval.is_correct ? (
                              <>
                                <CheckCircle size={15} className="text-emerald-600" weight="fill" />
                                回答正确（答案: {qEval.correct_answer}）
                              </>
                            ) : (
                              <>
                                <XCircle size={15} className="text-red-600" weight="fill" />
                                回答失误（你选了 {qEval.user_answer}，正确答案是 {qEval.correct_answer}）
                              </>
                            )}
                          </div>
                          <p className="text-[11px] text-ink-2">{qEval.analysis}</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Submit Action Bar */}
              {!evalResult ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn btn-primary w-full py-2.5 text-xs font-semibold shadow-md"
                >
                  {submitting ? '正在交由临床专家评阅...' : '提交处方审核并获取评分与分析'}
                  <ArrowRight size={15} weight="bold" />
                </button>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEvalResult(null)
                      setUserAnswers({})
                    }}
                    className="btn btn-secondary flex-1 py-2 text-xs"
                  >
                    重做本病例
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const currIdx = cases.findIndex((c) => c.id === selectedCaseId)
                      const nextCase = cases[(currIdx + 1) % cases.length]
                      if (nextCase) setSelectedCaseId(nextCase.id)
                    }}
                    className="btn btn-primary flex-1 py-2 text-xs"
                  >
                    挑战下一个真实病例 <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
