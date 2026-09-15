import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Clock, ChatCircle, FileText, BookmarkSimple } from '@phosphor-icons/react'
import { api, type Question } from './api'
import { useToast } from './Toast'

type CustomQuizConfig = {
  chapters: { id: string; code: string; chapter_ref: string; name: string; question_count: number }[]
  cognitive_levels: Record<string, number>
  difficulties: Record<string, number>
  preset_modes: { id: string; name: string; desc: string; default_count: number; icon: string }[]
  weak_domain_ids: string[]
  total_published_questions: number
}

type QuizQuestion = Question & {
  cognitive_level?: string
  difficulty?: string
  source_ref?: string
  analysis?: string
}

type QuizResult = {
  quiz_id: string
  mode: string
  score: number
  correct_count: number
  total_count: number
  domain_breakdown: Record<string, { correct: number; total: number }>
  cognitive_breakdown: Record<string, { correct: number; total: number }>
  results: {
    id: string
    code: string
    stem: string
    options: { key: string; text: string }[]
    user_answer: string
    correct_answer: string
    is_correct: boolean
    chapter_name: string
    cognitive_level: string
    difficulty: string
    analysis: string
    source_ref: string
  }[]
}

export function CustomQuizView({
  userId,
  onExit,
  onAskAi
}: {
  userId: string
  onExit: () => void
  onAskAi: (context: string, defaultQ?: string) => void
}) {
  const [config, setConfig] = useState<CustomQuizConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedMode, setSelectedMode] = useState('exam_sprint')
  const [totalCount, setTotalCount] = useState(20)
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [selectedCognitives, setSelectedCognitives] = useState<string[]>([])
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([])

  // 考试状态
  const [generating, setGenerating] = useState(false)
  const [activeQuiz, setActiveQuiz] = useState<{ quiz_id: string; mode: string; questions: QuizQuestion[] } | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({})
  const [elapsedSec, setElapsedSec] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flaggedQuestions, setFlaggedQuestions] = useState<Record<string, boolean>>({})
  const toast = useToast()

  const toggleFlag = (qid: string) => {
    setFlaggedQuestions((prev) => {
      const next = !prev[qid]
      if (next) toast.warning(`已标记第 ${currentIdx + 1} 题为存疑题目（交卷前可在答题卡复查）`)
      else toast.info(`已取消第 ${currentIdx + 1} 题存疑标记`)
      return { ...prev, [qid]: next }
    })
  }

  // 键盘快捷键盲打与切题
  useEffect(() => {
    if (!activeQuiz || quizResult) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      const q = activeQuiz.questions[currentIdx]
      if (!q) return

      const keyUpper = e.key.toUpperCase()
      const hit = q.options.find((o) => o.key.toUpperCase() === keyUpper)
      if (hit) {
        e.preventDefault()
        setUserAnswers((prev) => ({ ...prev, [q.id]: hit.key }))
        return
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentIdx((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        setCurrentIdx((i) => Math.min(activeQuiz.questions.length - 1, i + 1))
        return
      }
      if (e.key === 'f' || e.key === 'F' || e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        toggleFlag(q.id)
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (currentIdx < activeQuiz.questions.length - 1) {
          setCurrentIdx((i) => i + 1)
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeQuiz, quizResult, currentIdx, toggleFlag])

  useEffect(() => {
    setLoading(true)
    api.customQuizConfig(userId)
      .then((cfg) => {
        setConfig(cfg)
        if (cfg.weak_domain_ids?.length) {
          setSelectedChapters(cfg.weak_domain_ids)
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId])

  // 计时器
  useEffect(() => {
    if (!activeQuiz || quizResult) return
    const timer = setInterval(() => setElapsedSec((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [activeQuiz, quizResult])

  const handleModeChange = (modeId: string) => {
    setSelectedMode(modeId)
    if (!config) return
    const m = config.preset_modes.find((x) => x.id === modeId)
    if (m) setTotalCount(m.default_count)
    if (modeId === 'weakness_focused' && config.weak_domain_ids?.length) {
      setSelectedChapters(config.weak_domain_ids)
    } else if (modeId === 'exam_sprint') {
      setSelectedChapters([])
      setSelectedCognitives([])
      setSelectedDifficulties([])
    } else if (modeId === 'clinical_cases') {
      setSelectedCognitives(['应用', '分析'])
    }
  }

  const handleStartQuiz = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.generateCustomQuiz(userId, {
        mode: selectedMode,
        total_count: totalCount,
        chapter_ids: selectedChapters,
        cognitive_levels: selectedCognitives,
        difficulties: selectedDifficulties
      })
      if (!res.questions || res.questions.length === 0) {
        setError('所选筛选条件过于严苛，未匹配到题目，请放宽章节或难度限制。')
        return
      }
      setActiveQuiz(res)
      setCurrentIdx(0)
      setUserAnswers({})
      setElapsedSec(0)
      setQuizResult(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return
    const answeredCount = Object.keys(userAnswers).length
    if (answeredCount < activeQuiz.questions.length) {
      if (!window.confirm(`你还有 ${activeQuiz.questions.length - answeredCount} 道题目未作答，确认现在交卷吗？`)) {
        return
      }
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.submitCustomQuiz(userId, {
        quiz_id: activeQuiz.quiz_id,
        mode: activeQuiz.mode,
        answers: userAnswers
      })
      setQuizResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  if (loading) {
    return (
      <div className="card p-12 text-center">
        <div className="skeleton h-12 w-48 mx-auto mb-4" />
        <div className="skeleton h-32 max-w-lg mx-auto" />
      </div>
    )
  }

  // 1. 结果战报视图
  if (quizResult) {
    const accuracyPct = Math.round(quizResult.score * 100)
    return (
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="card overflow-hidden !rounded-[24px] border border-line-2 bg-white p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-2 pb-6">
            <div>
              <span className="badge-capsule gold mb-2">
                <span className="capsule gold" />
                自适应智能模考 · 战报结算
              </span>
              <h2 className="display text-2xl mt-1">全真组卷评测完成</h2>
              <p className="text-xs text-ink-3 mt-1">用时：{formatTime(elapsedSec)} · 作答 {quizResult.results.length} 题</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-3xl font-extrabold text-primary">{accuracyPct}%</p>
                <p className="text-xs text-ink-3 mt-0.5">正确率（{quizResult.correct_count} / {quizResult.total_count}）</p>
              </div>
              <button onClick={onExit} className="btn btn-primary !px-5 !py-2.5">
                返回学习主页
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-primary-soft/50 border border-primary/20 p-4 flex items-center gap-3">
            <span className="grid size-8 place-items-center rounded-xl bg-primary text-white font-bold text-xs">BKT</span>
            <div className="text-xs text-ink-2">
              <span className="font-semibold text-ink">贝叶斯认知追踪模型（BKT）已实时同步更新：</span>
              系统已根据本场模考作答的 {quizResult.results.length} 道题目，动态重算各涉及章节的后验掌握概率 P(L)，并同步修正后续「今日待办」推荐优先级。
            </div>
          </div>

          {/* 维度分析 */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-line p-5 bg-paper/50">
              <h4 className="text-xs font-bold text-ink-3 uppercase tracking-wider mb-3">认知层级多维分解</h4>
              <div className="space-y-3">
                {Object.entries(quizResult.cognitive_breakdown).map(([lvl, stats]) => {
                  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
                  return (
                    <div key={lvl}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold">{lvl}</span>
                        <span className="text-ink-3">{stats.correct}/{stats.total}（{pct}%）</span>
                      </div>
                      <div className="h-2 rounded-full bg-line overflow-hidden">
                        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-line p-5 bg-paper/50">
              <h4 className="text-xs font-bold text-ink-3 uppercase tracking-wider mb-3">重点章节得分情况</h4>
              <div className="space-y-3 max-h-[160px] overflow-y-auto pr-1">
                {Object.entries(quizResult.domain_breakdown).map(([dname, stats]) => {
                  const pct = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
                  return (
                    <div key={dname}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium truncate max-w-[200px]">{dname}</span>
                        <span className="text-ink-3 font-mono">{stats.correct}/{stats.total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-line overflow-hidden">
                        <div className={`h-full ${pct >= 60 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 逐题讲评 */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <FileText size={18} className="text-primary" />逐题深度解析与 AI 智能追问
          </h3>
          {quizResult.results.map((r, i) => (
            <div key={r.id} className="card p-6 rounded-2xl border border-line bg-white space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${r.is_correct ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold text-ink-3">{r.chapter_name}</span>
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] text-ink-3">{r.cognitive_level} · {r.difficulty}</span>
                  {flaggedQuestions[r.id] && (
                    <span className="rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 flex items-center gap-0.5">
                      <BookmarkSimple size={10} weight="fill" /> 考时存疑
                    </span>
                  )}
                </div>
                <div className="text-xs flex items-center gap-2">
                  <span className={r.is_correct ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                    你的选择: {r.user_answer || '未作答'}
                  </span>
                  <span className="text-ink-3 font-semibold">正确答案: {r.correct_answer}</span>
                </div>
              </div>

              <p className="text-sm font-medium text-ink leading-relaxed">{r.stem}</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {r.options.map((opt) => (
                  <div key={opt.key} className={`p-2.5 rounded-xl border flex items-center gap-2 ${
                    opt.key === r.correct_answer
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-medium'
                      : opt.key === r.user_answer && !r.is_correct
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-line text-ink-2 bg-white'
                  }`}>
                    <span className="font-bold">{opt.key}.</span>
                    <span>{opt.text}</span>
                  </div>
                ))}
              </div>

              {r.analysis && (
                <div className="rounded-xl bg-paper p-3 text-xs leading-relaxed text-ink-2">
                  <span className="font-bold text-ink">考点解析：</span>{r.analysis}
                  {r.source_ref && <span className="block text-[11px] text-ink-3 mt-1">依据出处：{r.source_ref}</span>}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    toast.info('已将试卷考点带入「问 AI」...')
                    onAskAi(
                      `【自适应试卷试题】${r.stem}\n【你的作答】${r.user_answer || '未作答'} (正确答案: ${r.correct_answer})\n【解析要点】${r.analysis}`,
                      `关于本题考查的 ${r.chapter_name} 知识点，请问为什么 ${r.user_answer || '该干扰项'} 是错误的？`
                    )
                  }}
                  className="btn !py-1.5 !px-3.5 !text-xs border border-primary/30 text-primary bg-primary-soft/60 hover:bg-primary hover:text-white transition flex items-center gap-1">
                  <ChatCircle size={13} weight="bold" />向 AI 深度追问此题
                </button>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    )
  }

  // 2. 考试作答视图
  if (activeQuiz) {
    const q = activeQuiz.questions[currentIdx]
    const answeredCount = Object.keys(userAnswers).length

    return (
      <div className="space-y-6">
        <div className="card !rounded-[24px] border border-line-2 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="badge-capsule gold">
              <span className="capsule gold" />
              正在考试
            </span>
            <h3 className="font-bold text-ink">全真模拟 · {activeQuiz.mode === 'clinical_cases' ? '临床病例专项' : activeQuiz.mode === 'weakness_focused' ? 'BKT 薄弱靶向' : '综合自适应出卷'}</h3>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-ink font-mono bg-paper-2 px-3 py-1.5 rounded-full">
              <Clock size={14} className="text-primary" /> {formatTime(elapsedSec)}
            </span>
            <button
              onClick={handleSubmitQuiz}
              disabled={submitting}
              className="btn btn-primary !px-5 !py-2 !text-xs font-semibold">
              {submitting ? '判分中…' : '交卷结算'}
            </button>
          </div>
        </div>

        {/* 题目卡 */}
        <div className="card !rounded-[24px] border border-line-2 bg-white p-8">
          <div className="flex flex-wrap items-center justify-between text-xs text-ink-3 border-b border-line-2 pb-4 mb-6 gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary text-sm">第 {currentIdx + 1} / {activeQuiz.questions.length} 题</span>
              <span>·</span>
              <span>{q.chapter_name || q.chapter || '药理学'}</span>
              <span className="rounded-full bg-paper px-2 py-0.5 text-[10px]">{q.cognitive_level || '理解'} · 难度{q.difficulty || '中'}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleFlag(q.id)}
                className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition ${
                  flaggedQuestions[q.id]
                    ? 'bg-amber-500/15 text-amber-700 border border-amber-500/40 shadow-xs'
                    : 'bg-paper-2 text-ink-3 hover:text-ink hover:bg-paper border border-transparent'
                }`}
                title="快捷键 F 或 M 切换存疑标记"
              >
                <BookmarkSimple size={13} weight={flaggedQuestions[q.id] ? 'fill' : 'regular'} className={flaggedQuestions[q.id] ? 'text-amber-600' : ''} />
                {flaggedQuestions[q.id] ? '已标记存疑' : '标记存疑 (F)'}
              </button>
              <span className="font-mono">已作答 {answeredCount} / {activeQuiz.questions.length}</span>
            </div>
          </div>

          <p className="display text-lg leading-relaxed mb-6">{q.stem}</p>

          <div className="space-y-3">
            {q.options.map((opt) => {
              const picked = userAnswers[q.id] === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setUserAnswers({ ...userAnswers, [q.id]: opt.key })}
                  className={`w-full text-left p-4 rounded-2xl border transition flex items-center gap-3 text-sm ${
                    picked ? 'border-primary bg-primary-soft/80 shadow-xs font-semibold' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper/40 text-ink-2'
                  }`}>
                  <span className={`grid size-7 place-items-center rounded-full border text-xs font-bold ${
                    picked ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'
                  }`}>
                    {opt.key}
                  </span>
                  <span>{opt.text}</span>
                </button>
              )
            })}
          </div>

          <div className="mt-8 pt-6 border-t border-line-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                disabled={currentIdx === 0}
                className="btn border border-line px-4 py-2 text-xs text-ink-2 disabled:opacity-30">
                <ArrowLeft size={12} />上一题 (←)
              </button>
              <div className="flex items-center gap-1.5 max-w-[480px] overflow-x-auto py-1 px-1">
                {activeQuiz.questions.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentIdx(idx)}
                    title={`第 ${idx + 1} 题${userAnswers[item.id] ? '（已答）' : '（未答）'}${flaggedQuestions[item.id] ? ' · 存疑待查' : ''}`}
                    className={`relative size-7 text-[10.5px] font-bold rounded-lg flex items-center justify-center transition flex-none ${
                      idx === currentIdx
                        ? 'ring-2 ring-primary ring-offset-1 bg-primary text-white shadow-xs'
                        : userAnswers[item.id]
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300/60'
                        : 'bg-paper-2 text-ink-3 hover:bg-paper'
                    }`}>
                    {idx + 1}
                    {flaggedQuestions[item.id] && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-500 ring-1 ring-white" />
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentIdx((i) => Math.min(activeQuiz.questions.length - 1, i + 1))}
                disabled={currentIdx === activeQuiz.questions.length - 1}
                className="btn border border-line px-4 py-2 text-xs text-ink-2 disabled:opacity-30">
                下一题 (→)<ArrowRight size={12} />
              </button>
            </div>

            {/* 键盘与状态提示栏 */}
            <div className="flex flex-wrap items-center justify-between text-[11px] text-ink-3 bg-paper/60 px-4 py-2 rounded-xl">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500 inline-block" /> 已作答</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500 inline-block" /> 存疑题</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary inline-block" /> 当前题</span>
              </div>
              <div>
                快捷键：<kbd className="px-1 py-0.5 rounded bg-white border border-line font-mono text-[10px]">A~E</kbd> 直选 · <kbd className="px-1 py-0.5 rounded bg-white border border-line font-mono text-[10px]">←/→</kbd> 切题 · <kbd className="px-1 py-0.5 rounded bg-white border border-line font-mono text-[10px]">F</kbd> 存疑标记
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // 3. 组卷配置主视图
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">ADAPTIVE QUIZ ENGINE</p>
          <h2 className="display mt-1 text-[26px]">全题库自适应出卷</h2>
          <p className="mt-1 text-sm text-ink-2">
            基于全国执业药师考纲 786 题全量题库，融合认知维度与 BKT 贝叶斯后验掌握度科学组卷。
          </p>
        </div>
        <button onClick={onExit} className="btn border border-line rounded-full px-3.5 py-1.5 text-xs text-ink-3 hover:text-primary">
          返回主流程
        </button>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">{error}</div>}

      {/* 预置模式选择 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {config?.preset_modes.map((m) => {
          const active = selectedMode === m.id
          return (
            <div
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              className={`card cursor-pointer p-5 rounded-2xl border-2 transition relative overflow-hidden ${
                active ? 'border-primary bg-primary-soft/30 shadow-md' : 'border-line bg-white hover:border-primary/40'
              }`}>
              <div className="flex items-start justify-between">
                <span className="text-2xl">{m.icon}</span>
                {active && (
                  <span className="badge-capsule gold">
                    <span className="capsule gold" />
                    已选
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-ink mt-3">{m.name}</h3>
              <p className="text-xs text-ink-2 mt-1 leading-relaxed">{m.desc}</p>
              <div className="mt-4 flex items-center justify-between text-[11px] text-ink-3 border-t border-line-2 pt-2">
                <span>推荐题量</span>
                <span className="font-bold text-primary font-mono">{m.default_count} 题</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* 自由定制调节器（当选择 free_custom 时展开详细调节） */}
      {selectedMode === 'free_custom' && config && (
        <div className="card p-6 rounded-2xl border border-line bg-white space-y-5">
          <h4 className="text-sm font-bold text-ink">个性化组卷多维细则配置</h4>

          <div>
            <label className="text-xs font-semibold text-ink-2 block mb-2">生成题量：{totalCount} 题</label>
            <input
              type="range" min="10" max="50" step="5" value={totalCount}
              onChange={(e) => setTotalCount(Number(e.target.value))}
              className="w-full accent-primary cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-semibold text-ink-2">考察章节范围（已选 {selectedChapters.length ? selectedChapters.length : '全章节随机'}）</label>
              <button
                onClick={() => setSelectedChapters(selectedChapters.length === config.chapters.length ? [] : config.chapters.map((c) => c.id))}
                className="text-[11px] text-primary hover:underline">
                {selectedChapters.length === config.chapters.length ? '清空' : '全选'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto p-1 border border-line-2 rounded-xl">
              {config.chapters.map((c) => {
                const picked = selectedChapters.includes(c.id)
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (picked) setSelectedChapters(selectedChapters.filter((id) => id !== c.id))
                      else setSelectedChapters([...selectedChapters, c.id])
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                      picked ? 'bg-primary text-white font-medium' : 'bg-paper text-ink-2 hover:bg-paper-2'
                    }`}>
                    {c.name} ({c.question_count})
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 开考动作按钮 */}
      <div className="card p-6 rounded-2xl border border-line bg-gradient-to-r from-primary-soft/60 to-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-ink">准备就绪：{totalCount} 题组卷即将开启</p>
          <p className="text-xs text-ink-3 mt-0.5">出卷系统支持即时倒计时与全真批阅分析</p>
        </div>
        <button
          onClick={handleStartQuiz}
          disabled={generating}
          className="btn btn-primary !px-8 !py-3 font-semibold text-sm shadow-md">
          {generating ? '正在智能装配试卷…' : '⚡ 立即生成试卷并开考'}
        </button>
      </div>
    </motion.div>
  )
}
