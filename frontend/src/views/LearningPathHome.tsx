import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Warning, ArrowRight, CaretDown, ClockCounterClockwise, Lightning, Hourglass, Sparkle } from '@phosphor-icons/react'
import { api, type Question, type RetestCapsuleData } from '../api'
import { ErrorPanel } from '../components/ui'
import { spring } from '../lib/shared'
export function RetestCapsuleCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [capsule, setCapsule] = useState<RetestCapsuleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [inQuiz, setInQuiz] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    passed: boolean; score: number; new_stage: number; next_due_days: number; next_stage_desc?: string; memory_boost: number; message: string
  } | null>(null)

  const loadCapsule = useCallback(() => {
    setLoading(true)
    setError(null)
    api.retestCapsule(userId)
      .then((d: RetestCapsuleData) => {
        setCapsule(d)
        setInQuiz(false)
        setAnswers({})
        setResult(null)
      })
      .catch(() => setCapsule(null))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { loadCapsule() }, [loadCapsule])

  if (loading || !capsule || !capsule.has_capsule || !capsule.questions?.length) return null

  const handlePick = (qid: string, key: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: key }))
  }

  const handleSubmit = async () => {
    if (!capsule.schedule_id) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.submitRetestCapsule(userId, {
        schedule_id: capsule.schedule_id,
        answers,
      })
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const allAnswered = capsule.questions.every((q) => answers[q.id])

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-xs dark:border-amber-400/25 dark:from-amber-950/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
            <Lightning size={14} weight="fill" />
          </span>
          <span className="text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400">
            今日遗忘预警 · 艾宾浩斯抗遗忘加固
          </span>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {capsule.stage_name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Hourglass size={14} className="text-amber-500" />
          <span>记忆存留度</span>
          <span className="font-bold text-amber-600 dark:text-amber-400">
            {capsule.retention_pct}%
          </span>
        </div>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      {!inQuiz && !result && (
        <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">
              检测到您在{' '}
              <span className="font-bold text-primary">
                {capsule.domain_name}（{capsule.concept_name}）
              </span>{' '}
              处于记忆衰退临界区！
            </p>
            <p className="mt-1 text-xs text-ink-3">
              只需 2 分钟完成 {capsule.questions.length} 道靶向辨析题，即可阻断遗忘曲线，建立长时专业记忆。
            </p>
          </div>
          <button
            onClick={() => setInQuiz(true)}
            className="btn btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold shadow-xs"
          >
            <Lightning size={14} weight="fill" />
            开始闪电复测（{capsule.questions.length}题）
          </button>
        </div>
      )}

      {inQuiz && !result && (
        <div className="mt-4 space-y-5">
          {capsule.questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-line bg-card/60 p-4">
              <p className="text-xs font-semibold text-primary">
                第 {idx + 1} 题 / 共 {capsule.questions!.length} 题
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed">{q.stem}</p>
              <div className="mt-3 space-y-2">
                {q.options?.map((opt) => {
                  const isPicked = answers[q.id] === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handlePick(q.id, opt.key)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-xs transition ${
                        isPicked
                          ? 'border-primary bg-primary/10 font-semibold text-primary shadow-xs'
                          : 'border-line hover:border-line-hover hover:bg-card-hover'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          isPicked ? 'bg-primary text-white' : 'border border-line text-ink-3'
                        }`}
                      >
                        {opt.key}
                      </span>
                      <span className="leading-snug">{opt.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              onClick={() => setInQuiz(false)}
              className="btn rounded-full border border-line px-4 py-1.5 text-xs text-ink-3 hover:text-ink"
            >
              稍后再测
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="btn btn-primary rounded-full px-5 py-2 text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              {submitting ? '评估中…' : '提交复测结果'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-3.5 space-y-3">
          <div
            className={`flex items-start gap-3 rounded-xl p-4 ${
              result.passed
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="mt-0.5">
              {result.passed ? (
                <CheckCircle size={20} weight="fill" className="text-emerald-500" />
              ) : (
                <Warning size={20} weight="fill" className="text-amber-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">
                {result.passed ? '🎉 长时专业记忆已成功激活！' : '⚠️ 记忆仍需巩固'}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{result.message}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span>正确率: {Math.round(result.score * 100)}%</span>
                <span>•</span>
                <span>当前进度: {result.next_stage_desc}</span>
                <span>•</span>
                <span>记忆强化度: +{result.memory_boost}%</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setResult(null)
                loadCapsule()
                onDone()
              }}
              className="btn btn-primary rounded-full px-5 py-1.5 text-xs font-semibold"
            >
              完成并返回待办
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

/* ---------- 学习路径（今日待办） ---------- */

export type PlanTask = {
  type: 'material' | 'practice'
  domain_id: string
  domain: string
  category: string | null
  state: string
  title: string
  guide?: string
  goal?: string
  bkt_probability?: number
  urgency_score?: number
  freshness_status?: string
  decay_level?: string
  days_since_update?: number
}

export type DoneTask = { domain_id: string; domain: string; category: string | null; state: string; title: string }

export type DailyRec = {
  domain_id: string
  domain_name: string
  category: string | null
  bkt_probability: number
  urgency_score: number
  urgency_level: string
  suggested_action: string
  reason: string
}

export type MemoryDecayAlert = {
  domain_id: string
  domain_name: string
  category: string | null
  days_passed: number
  decay_pct: number
  freshness_status: string
  tip: string
}

export function LearningPathHome({ userId, onPick, onMaterial }: {
  userId: string; onPick: (q: Question) => void; onMaterial: (domainId: string) => void
}) {
  const [plan, setPlan] = useState<{
    tasks: PlanTask[]
    done_tasks?: DoneTask[]
    daily_recommendation?: DailyRec[]
    memory_decay_alerts?: MemoryDecayAlert[]
    note: string
  } | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    setRefreshing(true)
    return Promise.all([
      api.learningPlan(userId).then(setPlan).catch((e) => setError(String(e))),
      api.questions().then(setQuestions).catch(() => {}),
    ]).finally(() => setRefreshing(false))
  }, [userId])

  useEffect(() => { load() }, [load])

  if (error) return <ErrorPanel message={error} />
  if (!plan) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
  }

  const hasTasks = plan.tasks.length > 0
  const doneTasks = plan.done_tasks ?? []
  // 按 域×错因 分组（一组 = 一学一练配对）；分组头可折叠，长待办不再一屏到底
  const groups: { key: string; domain_id: string; domain: string; items: PlanTask[] }[] = []
  for (const t of plan.tasks) {
    const key = `${t.domain_id}::${t.category ?? ''}`
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, domain_id: t.domain_id, domain: t.domain, items: [] }; groups.push(g) }
    g.items.push(t)
  }
  const allShut = groups.length > 0 && groups.every((g) => collapsed[g.key])
  return (
    <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 6 · 学习路径</p>
      <h2 className="display mt-2 text-[26px]">今日待办</h2>
      <div className="mt-4">
        <RetestCapsuleCard userId={userId} onDone={() => load()} />
      </div>

      {/* 动态时间遗忘衰减引擎预警 */}
      {plan.memory_decay_alerts && plan.memory_decay_alerts.length > 0 && (
        <div className="card mt-4 mb-3 border border-amber-500/40 bg-gradient-to-r from-amber-50 via-orange-50/40 to-white p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Hourglass size={16} className="text-amber-600" weight="fill" />
              BKT 动态时间遗忘预警 · 记忆半衰期衰退探测
            </span>
            <span className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900">
              {plan.memory_decay_alerts.length} 个薄弱考点临界遗忘
            </span>
          </div>
          <div className="space-y-2">
            {plan.memory_decay_alerts.map((al, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 border border-amber-200/70 text-xs">
                <div>
                  <span className="font-bold text-ink-1 mr-2">{al.domain_name}</span>
                  {al.category && <span className="text-ink-3 mr-2 font-mono">[{al.category}]</span>}
                  <span className="text-amber-800">{al.tip}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${al.freshness_status === '严重遗忘' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {al.freshness_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BKT 认知追踪驱动的今日自适应推荐 */}
      {plan.daily_recommendation && plan.daily_recommendation.length > 0 && (
        <div className="card relative overflow-hidden mt-5 mb-5 border-2 border-primary/20 bg-gradient-to-br from-primary-soft/40 via-white to-gold-soft/30 p-5 !rounded-[22px] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-white text-xs font-bold font-mono">BKT</span>
              <div>
                <h4 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  今日自适应突破推荐 · 贝叶斯认知模型推断
                </h4>
                <p className="text-xs text-ink-3">动态追踪掌握概率 P(L)，优先攻克失误概率最高的脆弱考点</p>
              </div>
            </div>
            <span className="badge-capsule gold">
              <span className="capsule gold" />
              认知推断
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {plan.daily_recommendation.map((rec) => (
              <div key={rec.domain_id} className="rounded-xl border border-line bg-white/95 p-3.5 flex flex-col justify-between hover:border-primary transition shadow-2xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rec.urgency_level === '高危薄弱' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {rec.urgency_level}
                    </span>
                    <span className="text-[11px] font-semibold text-primary font-mono">
                      掌握度 {Math.round(rec.bkt_probability * 100)}%
                    </span>
                  </div>
                  <p className="text-sm font-bold text-ink truncate">{rec.domain_name}</p>
                  {rec.category && <p className="text-xs text-ink-3 mt-0.5">{rec.category}</p>}
                  <p className="text-[11px] text-ink-3 mt-1.5 line-clamp-2 leading-relaxed">{rec.reason}</p>
                </div>
                <button
                  onClick={() => onMaterial(rec.domain_id)}
                  className="mt-3 w-full btn btn-primary !py-1.5 !text-xs flex items-center justify-center gap-1">
                  <Sparkle size={12} weight="fill" /> {rec.suggested_action}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-sm leading-relaxed text-ink-2">{plan.note}</p>
        {hasTasks && (
          <button onClick={() => {
              if (allShut) setCollapsed({})
              else setCollapsed(Object.fromEntries(groups.map((g) => [g.key, true])))
            }}
            className="btn ml-auto items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-3 hover:border-primary hover:text-primary">
            {allShut ? '全部展开' : '全部收起'}
          </button>
        )}
        <button onClick={() => load()} disabled={refreshing}
          className={`btn items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-3 hover:border-primary hover:text-primary ${hasTasks ? '' : 'ml-auto'}`}>
          <ClockCounterClockwise size={12} weight="bold" />{refreshing ? '刷新中…' : '刷新'}
        </button>
      </div>
      {hasTasks || doneTasks.length > 0 ? (
        <p className="mt-1 text-xs text-ink-3">
          待完成 <span className="font-semibold text-cat-red">{plan.tasks.length}</span> 项 · 已完成{' '}
          <span className="font-semibold text-ok">{doneTasks.length}</span> 项
        </p>
      ) : null}

      {!hasTasks && doneTasks.length === 0 && (
        <div className="card mt-6 p-8 text-center">
          <p className="text-sm text-ink-2">当前没有薄弱项待办。</p>
          <p className="mt-1 text-xs text-ink-3">完成一次「作答 → 诊断 → 训练」后，路径会按你的错因画像自动生成。</p>
          {questions && questions.length > 0 && (
            <button onClick={() => { const q = questions[0]; if (q) onPick(q) }}
              className="btn btn-primary mt-5">自由练习一道</button>
          )}
        </div>
      )}

      {hasTasks && (
        <div className="relative mt-6 space-y-4 before:absolute before:left-[19px] before:top-3 before:bottom-3 before:w-px before:bg-line">
          {/* 按域分组：每组=「一域一个薄弱点 → 学 + 练」的一一配对引导，分组头点击折叠 */}
          {groups.map((g, gi) => {
            const shut = !!collapsed[g.key]
            return (
              <motion.div key={g.key} initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: gi * 0.08 }}
                className="relative">
                <button onClick={() => setCollapsed({ ...collapsed, [g.key]: !shut })}
                  aria-expanded={!shut} title={shut ? '展开该组' : '收起该组'}
                  className="z-10 mb-2 ml-9 flex items-center gap-1.5 rounded-full py-0.5 pr-2 text-xs font-medium text-ink-2 transition-colors hover:text-primary">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />{g.domain} · 逐个突破
                  <span className="rounded-full bg-paper-2 px-1.5 text-[10px] text-ink-3">{g.items.length} 项</span>
                  <CaretDown size={13} weight="bold" className={`text-ink-3 transition-transform duration-200 ${shut ? '-rotate-90' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {!shut && (
                    <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden">
                <div className="space-y-3">
                  {g.items.map((t) => {
                    const isLearn = t.type === 'material'
                    return (
                      <div key={t.type + t.category} className="flex items-start gap-4">
                        <span className={`z-10 mt-1 grid size-10 flex-none place-items-center rounded-xl font-serif font-bold
                          ${isLearn ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                          {isLearn ? '学' : '练'}
                        </span>
                        <div className="spot-card flex-1 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[15px] font-medium leading-snug">{t.title}</p>
                              {isLearn && <p className="mt-0.5 text-xs text-gold">先学本域材料，再做随堂自测，最后练习</p>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {t.freshness_status && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  t.freshness_status === '巩固期'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : t.freshness_status === '临界衰退'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {t.freshness_status}
                                </span>
                              )}
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium
                                ${t.state === '薄弱' ? 'bg-cat-red-soft text-cat-red' : t.state === '学习中' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                                {t.state}
                              </span>
                            </div>
                          </div>
                          {/* 明确引导：这一步该做什么、做完会怎样 */}
                          {t.guide && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink-2">{t.guide}</p>}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {isLearn ? (
                              <button onClick={() => onMaterial(t.domain_id)}
                                className="btn items-center gap-1.5 rounded-full border border-gold/40 bg-gold-soft/60 px-3.5 py-1.5 text-xs text-gold hover:border-gold">
                                进入学习 · 随堂自测<ArrowRight size={11} />
                              </button>
                            ) : (
                              questions && questions.length > 0 && (
                                <button onClick={() => { const q = questions.find((x) => x.domain_id === t.domain_id) ?? questions[0]; onPick(q) }}
                                  className="btn items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary">
                                  开始练习<ArrowRight size={11} />
                                </button>
                              )
                            )}
                            {t.goal && <span className="text-xs text-ink-3">达成：{t.goal}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {doneTasks.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <CheckCircle size={14} weight="fill" className="text-ok" />已完成（不再出现在待办）
          </p>
          <div className="space-y-2.5">
            {doneTasks.map((t, i) => (
              <div key={t.domain_id + i} className="card flex items-center gap-3 p-4 opacity-75">
                <span className="grid size-7 flex-none place-items-center rounded-full text-ok" style={{ background: 'var(--color-ok-soft)' }}>
                  <CheckCircle size={15} weight="fill" />
                </span>
                <p className="text-sm text-ink-2 line-through">{t.title}</p>
                <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium text-ok" style={{ background: 'var(--color-ok-soft)' }}>
                  {t.state === '初步掌握' ? '已达标' : '掌握'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">演示账号 {userId.slice(0, 8)} · 路径按「一学一练」配对生成 · 本系统不提供用药建议</p>
    </motion.div>
  )
}

/* ---------- 问 AI（课程问答：BM25 教材切片 grounded，有引用才答） ---------- */
