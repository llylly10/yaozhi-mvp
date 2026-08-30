import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, CaretLeft, Pill } from '@phosphor-icons/react'
import { api, type Diagnosis, type Question } from './api'

/*
 * 药知 · 「现代药房 × 分子美学」
 * 屏幕：欢迎 → 题库 → 作答 → 诊断/追问（处方笺）→ 训练 → 结果
 * 动效：弹簧物理 + 逐级瀑布入场 + layoutId 选中迁移（reduced-motion 全部降级）
 */

const USER_KEY = 'yaozhi_user_id_v2'
type Screen = 'welcome' | 'list' | 'flow'
const STEPS = ['题库', '作答', '诊断', '训练'] as const

const spring = { type: 'spring', stiffness: 120, damping: 20 } as const
const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...spring, delay: i * 0.07 } }),
}

/* ---------- 苯环分子背景 ---------- */

const HEXES = [
  [4, 10, 46], [12, 26, 30], [22, 8, 58], [33, 20, 36], [45, 6, 50], [58, 16, 42],
  [70, 7, 54], [82, 22, 34], [92, 10, 46], [8, 55, 40], [26, 68, 56], [50, 60, 44],
  [72, 72, 52], [90, 58, 38], [60, 85, 34], [16, 86, 44], [40, 40, 28],
] as const // [x%, y%, size]

function Hex({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  const h = size, w = size * 0.866
  const pts = `${w / 2},0 ${w},${h * 0.25} ${w},${h * 0.75} ${w / 2},${h} 0,${h * 0.75} 0,${h * 0.25}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style}>
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

function MolField() {
  return (
    <div className="mol-field text-primary/25" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {HEXES.slice(0, 12).map(([x, y], i) => (
          <line key={`b${i}`} x1={`${x}%`} y1={`${y}%`} x2={`${HEXES[(i + 3) % HEXES.length][0]}%`}
            y2={`${HEXES[(i + 3) % HEXES.length][1]}%`} stroke="currentColor" strokeWidth={0.7} opacity={0.35} />
        ))}
      </svg>
      {HEXES.map(([x, y, s], i) => (
        <motion.div key={i} className="absolute text-primary/60"
          style={{ left: `${x}%`, top: `${y}%` }}
          animate={{ y: [0, -9, 0], rotate: [0, i % 2 ? 6 : -6, 0] }}
          transition={{ duration: 10 + (i % 5) * 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}>
          <Hex size={s} />
        </motion.div>
      ))}
    </div>
  )
}

/* ---------- 顶部悬浮玻璃步骤轨 ---------- */

function StepRail({ step, onHome, onLogout }: { step: number; onHome: () => void; onLogout: () => void }) {
  return (
    <div className="sticky top-0 z-30">
      <div className="glass border-x-0 border-t-0 !rounded-none px-5 py-2">
      <motion.nav initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring}
        className="mx-auto flex w-fit items-center gap-1 rounded-full py-1.5 pl-2 pr-4">
        <button onClick={onHome}
          className="btn grid size-8 place-items-center rounded-full text-ink-2 hover:bg-primary-soft">
          <CaretLeft size={14} weight="bold" />
        </button>
        <span className="capsule mr-2" />
        {STEPS.map((s, i) => (
          <button key={s} className="relative rounded-full px-3.5 py-1.5 text-[13px]">
            {i === step && (
              <motion.span layoutId="rail-active" transition={spring}
                className="absolute inset-0 rounded-full bg-primary text-white shadow-[0_6px_16px_-8px_rgba(14,122,99,.7)]" />
            )}
            <span className={`relative z-10 ${i === step ? 'font-semibold' : 'text-ink-3'}`}>{s}</span>
          </button>
        ))}
        <button onClick={onLogout}
          className="btn ml-2 rounded-full px-3 py-1.5 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink">
          退出账号
        </button>
      </motion.nav>
      </div>
    </div>
  )
}

/* ---------- 欢迎页 ---------- */

function Welcome({ onEnter }: { onEnter: () => void }) {
  const [reads, setReads] = useState([false, false, false])
  const all = reads.every(Boolean)
  const toggle = (i: number) => setReads(reads.map((v, j) => (j === i ? !v : v)))

  return (
    <div className="relative z-10 flex min-h-[100dvh] items-center justify-center px-5 py-10">
      <div className="grid w-full max-w-[1140px] items-stretch gap-7 lg:grid-cols-[1.08fr_0.92fr]">
      {/* 英雄区 */}
      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="relative flex flex-col overflow-hidden rounded-[28px] p-10 text-white"
        style={{ background: 'linear-gradient(155deg, var(--color-primary-deep) 0%, #0C6150 55%, #128A70 100%)' }}>
        {/* 苯环装饰 */}
        <div className="pointer-events-none absolute -right-8 -top-10 opacity-20">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="absolute text-white"
              style={{ right: i * 66, top: i * 88 }}
              animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
              transition={{ duration: 11 + i * 2, repeat: Infinity, ease: 'easeInOut' }}>
              <Hex size={150 - i * 30} />
            </motion.div>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="capsule gold" />
          <span className="text-xs font-semibold tracking-[0.2em] opacity-85">YAOZHI · 药知</span>
        </div>

        <h1 className="display mt-9 text-[38px] leading-[1.4] md:text-[42px]">
          从「知道答案」<br />走向「理解原因」
        </h1>
        <p className="mt-5 max-w-[430px] text-sm leading-relaxed opacity-85">
          答错一道题不可怕，可怕的是不知道自己为什么错。药知用证据化的错因归因、定向追问和靶向训练，把每个理解缺口补上。
        </p>

        <div className="pt-10">
          <p className="mb-3 flex items-center gap-2 text-xs opacity-70"><Pill size={13} weight="fill" />学习闭环 · 每日一剂</p>
          <div className="flex flex-wrap items-center gap-2">
            {['作答', '错因归因', '定向追问', '靶向训练', '迁移复测'].map((s, i) => (
              <motion.span key={s}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: 0.5 + i * 0.1 }}
                className="flex items-center gap-2.5">
                {i > 0 && <ArrowRight size={11} className="opacity-55" />}
                <span className="rounded-xl border border-white/35 bg-white/12 px-3.5 py-2 text-[13px]">{s}</span>
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* 同意卡（玻璃） */}
      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        className="glass relative z-10 flex flex-col rounded-[28px] p-9">
        <div className="flex items-center gap-3">
          <span className="rx-badge">Rx</span>
          <div>
            <h2 className="display text-[21px] leading-tight">使用前确认</h2>
            <p className="text-xs text-ink-3">逐条确认后开始学习</p>
          </div>
        </div>

        <div className="mt-7 space-y-3.5">
          {[
            ['演示环境', '本系统为比赛演示环境，仅用于药理学学习练习，使用演示账号。'],
            ['数据隐私', '只收集完成学习闭环所需的作答与学习记录，不含真实身份信息；可随时要求删除。'],
            ['非医疗建议', '系统输出仅用于学习，不能替代医师或药师的用药建议。'],
          ].map(([t, d], i) => (
            <motion.button key={t} onClick={() => toggle(i)} whileTap={{ scale: 0.985 }}
              className={`w-full rounded-2xl border p-4 text-left transition-colors
                ${reads[i] ? 'border-primary/50 bg-primary-soft' : 'border-line-2 bg-white/80 hover:border-line'}`}>
              <span className="flex items-start gap-3.5">
                <span className={`mt-0.5 grid size-[22px] flex-none place-items-center rounded-full border-2 transition-colors
                  ${reads[i] ? 'border-primary bg-primary' : 'border-line bg-white'}`}>
                  {reads[i] && <CheckCircle size={13} weight="bold" className="text-white" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t}</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{d}</span>
                </span>
              </span>
            </motion.button>
          ))}
        </div>

        <motion.button onClick={onEnter} disabled={!all} whileTap={all ? { scale: 0.98 } : undefined}
          className="btn btn-primary mt-8 w-full !py-3.5">
          开始学习<ArrowRight size={15} weight="bold" />
        </motion.button>
        <p className="mt-4 text-center text-xs text-ink-3">Datawhale 星跃三期 · 药知项目组</p>
      </motion.div>
      </div>
    </div>
  )
}

/* ---------- 题库（聚光边框卡片） ---------- */

function SpotCard({ children, onClick, delay = 0 }: {
  children: React.ReactNode; onClick?: () => void; delay?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <motion.button ref={ref} onClick={onClick}
      variants={fadeUp} initial="hidden" animate="show" custom={delay}
      whileTap={{ scale: 0.985 }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
      className="spot-card w-full p-5 text-left">
      {children}
    </motion.button>
  )
}

function QuestionList({ onPick }: { onPick: (q: Question) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.questions().then(setQuestions).catch((e) => setError(String(e))) }, [])

  return (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-7">
      <div className="mb-1.5 flex items-end justify-between">
        <h2 className="display text-[27px]">今天练什么</h2>
        <span className="flex items-center gap-2 text-xs text-ink-3">
          <span className="capsule" />诊断域 · M 受体激动药与阻断药
        </span>
      </div>
      <p className="mb-6 text-sm text-ink-2">选择一道题开始。答错时，系统会定位你错在哪，而不是只告诉你错了。</p>

      {error && <ErrorPanel message={error} />}
      {!questions && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[120px]" />)}
        </div>
      )}
      {questions && questions.length === 0 && <EmptyPanel text="当前没有可练习的题目，等待内容生产。" />}

      {questions && questions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {questions.map((q, i) => (
            <SpotCard key={q.id} onClick={() => onPick(q)} delay={i * 0.05}>
              <span className="grid size-9 flex-none place-items-center rounded-full bg-primary-soft font-serif text-sm font-bold text-primary">
                {q.code.slice(-1)}
              </span>
              <span className="mt-3.5 block text-[14.5px] font-medium leading-relaxed">{q.stem}</span>
              <span className="mt-3 flex items-center gap-2 text-xs text-ink-3">
                开始练习 <ArrowRight size={12} />
              </span>
            </SpotCard>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">演示账号 · 作答记录已匿名保存 · 本系统不提供用药建议</p>
    </motion.div>
  )
}

/* ---------- 四类错因配色 ---------- */

const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  '知识遗忘': { bg: 'var(--color-cat-blue-soft)', fg: 'var(--color-cat-blue)' },
  '概念混淆': { bg: 'var(--color-cat-purple-soft)', fg: 'var(--color-cat-purple)' },
  '机制理解不足': { bg: 'var(--color-cat-orange-soft)', fg: 'var(--color-cat-orange)' },
  '审题与应用失误': { bg: 'var(--color-cat-red-soft)', fg: 'var(--color-cat-red)' },
}

function CategoryTag({ category }: { category: string }) {
  const s = CAT_STYLE[category] ?? { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' }
  return (
    <span className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}>
      {category}
    </span>
  )
}

/* ---------- 作答 → 诊断（处方笺） → 追问 → 训练 ---------- */

function PracticeFlow({ userId, question, onStep, onExit }: {
  userId: string; question: Question; onStep: (n: number) => void; onExit: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [training, setTraining] = useState<{ training_id: string; questions: { id: string; stem: string; options: { key: string; text: string }[] }[] } | null>(null)
  const [trainingPicks, setTrainingPicks] = useState<Record<string, string>>({})
  const [trainingResult, setTrainingResult] = useState<{ score: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!selected) return
    setSubmitting(true); setError(null)
    try {
      const r = await api.submitAttempt({
        user_id: userId, question_id: question.id, selected_option: selected,
        rationale: rationale || undefined, idempotency_key: crypto.randomUUID(),
      })
      setDiagnosis(await api.diagnosis(r.session_id))
      onStep(2)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(id: string) { setDiagnosis(await api.diagnosis(id)) }

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t); setDiagnosis(await api.diagnosis(diagnosis.session_id)); onStep(3)
    } catch (e) { setError(String(e)) }
  }

  async function finishTraining() {
    if (!training) return
    try {
      const r = await api.submitTraining(training.training_id, trainingPicks)
      setTrainingResult({ score: r.score })
    } catch (e) { setError(String(e)) }
  }

  return (
    <motion.div key="flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="pt-7">
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* 题目卡 */}
      <div className="card relative overflow-hidden !rounded-[24px]">
        <div className="absolute right-6 top-5 opacity-[0.06]"><Hex size={92} className="text-ink" /></div>
        <div className="border-b border-line-2 px-8 pb-6 pt-7">
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <span className="capsule" />{question.code} · 单选题 · 药理学 / M 受体药
          </div>
          <p className="display mt-4 text-[19px] leading-relaxed">{question.stem}</p>
        </div>
        <div className="p-8 pt-6">
          <div className="space-y-3">
            {question.options.map((o) => (
              <motion.button key={o.key} onClick={() => setSelected(o.key)} whileTap={{ scale: 0.99 }}
                className={`relative w-full rounded-2xl border px-5 py-4 text-left text-sm
                  ${selected === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                {selected === o.key && (
                  <motion.span layoutId={`opt-${question.id}`} transition={spring}
                    className="absolute inset-0 rounded-2xl bg-primary-soft" />
                )}
                <span className="relative z-10 flex items-center gap-3.5">
                  <span className={`grid size-7 flex-none place-items-center rounded-full border text-xs font-bold
                    ${selected === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>
                    {o.key}
                  </span>
                  <span className={selected === o.key ? 'font-medium' : ''}>{o.text}</span>
                </span>
              </motion.button>
            ))}
          </div>

          <label className="mb-1.5 mt-7 block text-[13px] font-semibold text-ink-2">你的解题思路（选填）</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2}
            placeholder="写下你的推理，例如它作用于哪类受体、产生了什么效应。写得越清楚，归因越准。"
            className="input" />
          <button onClick={submit} disabled={!selected || submitting || diagnosis !== null} className="btn btn-primary mt-6">
            {submitting ? '判分中…' : diagnosis ? '已判分' : '提交答案'}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {diagnosis && (
          <DiagnosisPanel key={diagnosis.state + diagnosis.followup_count}
            diagnosis={diagnosis} onRefresh={refresh} onStartTraining={startTraining} onError={setError} />
        )}
      </AnimatePresence>

      {training && !trainingResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="display text-[19px]">针对性训练</h3>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              已答 {Object.keys(trainingPicks).length} / {training.questions.length}
              <span className="capsule gold" />
            </div>
          </div>
          <div className="space-y-6">
            {training.questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-6">
                <p className="mb-3.5 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                      onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm
                        ${trainingPicks[q.id] === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      {trainingPicks[q.id] === o.key && (
                        <motion.span layoutId={`tr-${q.id}`} transition={spring}
                          className="absolute inset-0 rounded-xl bg-primary-soft" />
                      )}
                      <span className="relative z-10 flex items-center gap-3">
                        <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold
                          ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>
                          {o.key}
                        </span>
                        {o.text}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishTraining}
            disabled={Object.keys(trainingPicks).length < training.questions.length}
            className="btn btn-primary mt-7">
            提交训练
          </button>
        </motion.div>
      )}

      {trainingResult && <TrainingResult score={trainingResult.score} onExit={onExit} />}
    </motion.div>
  )
}

/* ---------- 训练结果（动画得分环） ---------- */

function TrainingResult({ score, onExit }: { score: number; onExit: () => void }) {
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      className="card mt-5 !rounded-[24px] p-10 text-center">
      <div className="relative mx-auto size-[132px]">
        <svg className="size-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line-2)" strokeWidth={9} />
          <motion.circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-primary)" strokeWidth={9}
            strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - score) }}
            transition={{ ...spring, delay: 0.25 }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className="display text-[28px] leading-none">{Math.round(score * 100)}<span className="text-[15px]">%</span></p>
            <p className="mt-1 text-[11px] text-ink-3">训练正确率</p>
          </div>
        </div>
      </div>
      <h3 className="display mt-6 text-[20px]">本轮训练完成</h3>
      <p className="mt-2 text-sm text-ink-2">
        {score >= 0.8 ? '掌握状态已更新，巩固得不错。' : '错因画像已更新，建议针对薄弱项再练一轮。'}
      </p>
      <p className="mt-2 text-xs text-ink-3">新情境迁移复测与延迟复测将在后续版本开放</p>
      <button onClick={onExit} className="btn btn-primary mt-7">返回题库</button>
    </motion.div>
  )
}

/* ---------- 诊断卡（处方笺）+ 追问 ---------- */

function DiagnosisPanel({ diagnosis, onRefresh, onStartTraining, onError }: {
  diagnosis: Diagnosis; onRefresh: (id: string) => void; onStartTraining: () => void; onError: (m: string) => void
}) {
  const [answering, setAnswering] = useState(false)

  async function answer(optionKey?: string) {
    if (!diagnosis.followup) return
    setAnswering(true)
    try {
      await api.answerFollowup(diagnosis.session_id, optionKey ? { option_key: optionKey } : { text: '不确定' })
      onRefresh(diagnosis.session_id)
    } catch (e) { onError(String(e)) } finally { setAnswering(false) }
  }

  async function skip() {
    setAnswering(true)
    try {
      await api.skipFollowup(diagnosis.session_id)
      onRefresh(diagnosis.session_id)
    } catch (e) { onError(String(e)) } finally { setAnswering(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-5 space-y-5">
      {/* 判定横幅 */}
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
        className="card flex items-center gap-4 p-5"
        style={{ background: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)',
                 borderColor: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {diagnosis.is_correct
          ? <CheckCircle size={26} weight="fill" className="flex-none text-ok" />
          : <Warning size={26} weight="fill" className="flex-none text-cat-red" />}
        <div>
          <p className="font-semibold">{diagnosis.is_correct ? '回答正确' : '回答错误'}</p>
          {!diagnosis.is_correct && (
            <p className="text-[13px] text-ink-2">正确答案 {diagnosis.answer} · 系统正在定位你的错因</p>
          )}
        </div>
      </motion.div>

      {/* 追问 */}
      {diagnosis.state === 'followup_required' && diagnosis.followup && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="size-2 rounded-full bg-primary breath" />
              定向追问 · 正在定位你的理解缺口
            </p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diagnosis.followup.turn_max }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < diagnosis.followup_count + 1 ? 'bg-primary' : 'bg-line'}`} />
              ))}
              <span className="ml-1 text-xs text-ink-3">第 {diagnosis.followup_count + 1} / {diagnosis.followup.turn_max} 轮</span>
            </div>
          </div>
          <p className="display mb-6 text-[17px]">{diagnosis.followup.question_text}</p>
          {diagnosis.followup.options ? (
            <div className="space-y-2.5">
              {diagnosis.followup.options.map((o) => (
                <motion.button key={o.key} disabled={answering} whileTap={{ scale: 0.99 }} onClick={() => answer(o.key)}
                  className="btn !justify-start w-full rounded-2xl border border-line bg-white px-5 py-3.5 text-left text-sm hover:border-primary hover:bg-primary-soft">
                  <span className={`mr-3 grid size-7 flex-none place-items-center rounded-full border text-xs font-bold
                    ${answering ? 'border-line text-ink-3' : 'border-line text-ink-2'}`}>{o.key}</span>
                  {o.text}
                </motion.button>
              ))}
            </div>
          ) : (
            <OpenAnswer onAnswer={() => answer()} disabled={answering} />
          )}
          <button onClick={skip} disabled={answering}
            className="btn mt-5 items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
            <SkipForward size={13} />跳过追问，生成低证据归因
          </button>
        </motion.div>
      )}

      {/* 处方笺式错因卡 */}
      {diagnosis.card && (
        <motion.div initial={{ opacity: 0, y: 16, rotate: -0.4 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={spring} className="card relative overflow-hidden !rounded-[24px]">
          <div className="border-b border-line-2 px-8 pb-5 pt-7" style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <span className="rx-badge">Rx</span>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">错因诊断卡 · YAOZHI DIAGNOSIS</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">依据你的作答证据与追问回答出具</p>
                </div>
              </div>
              <Stamp level={diagnosis.card.evidence_level} />
            </div>
          </div>
          <div className="p-8">
            <div className="flex flex-wrap items-center gap-3">
              <CategoryTag category={diagnosis.card.misconception.category} />
              <p className="font-medium text-[15.5px]">{diagnosis.card.misconception.name}</p>
            </div>

            <hr className="rx-divider my-6" />

            <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule gold" />归因依据（证据链）
            </p>
            <div className="space-y-3.5">
              {diagnosis.card.evidences.map((e, i) => (
                <motion.div key={i}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.15 + i * 0.08 }}
                  className="rounded-xl bg-paper px-5 py-3.5 text-sm">
                  <p className="mb-0.5 text-xs text-ink-3">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                  <p className="leading-relaxed text-ink-2">{e.content}</p>
                </motion.div>
              ))}
            </div>

            {diagnosis.state === 'diagnosed' && (
              <button onClick={onStartTraining} className="btn btn-primary mt-7">
                按此诊断开具靶向训练<ArrowRight size={15} weight="bold" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

function Stamp({ level }: { level: string }) {
  const color = level === '高' ? 'var(--color-ok)' : level === '中' ? 'var(--color-primary)' : 'var(--color-warn)'
  return (
    <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.92 }}
      transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
      className="stamp text-[13px]" style={{ color }}>
      证据<br />{level}
    </motion.span>
  )
}

function OpenAnswer({ onAnswer, disabled }: { onAnswer: () => void; disabled: boolean }) {
  const [text, setText] = useState('')
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="用你自己的话回答" className="input" />
      <button onClick={() => onAnswer()} disabled={disabled || !text.trim()} className="btn btn-primary mt-4">
        <MagnifyingGlass size={14} />提交回答
      </button>
    </div>
  )
}

/* ---------- 状态组件 ---------- */

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="card p-14 text-center">
      <div className="mx-auto w-fit opacity-30"><Hex size={64} className="text-primary" /></div>
      <p className="mt-4 text-sm text-ink-3">{text}</p>
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
}

/* ---------- 根组件 ---------- */

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(USER_KEY) ? 'list' : 'welcome'))
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function onConsent() {
    api.demoSession(true).then((r) => {
      localStorage.setItem(USER_KEY, r.user_id)
      setUserId(r.user_id); setScreen('list'); setStep(0)
    }).catch((e) => setError(String(e)))
  }

  return (
    <div className="relative min-h-[100dvh]">
      <MolField />
      {screen !== 'welcome' && (
        <StepRail step={step} onHome={() => { setScreen('list'); setActiveQuestion(null); setStep(0) }}
            onLogout={() => { localStorage.removeItem(USER_KEY); setUserId(null); setScreen('welcome'); setStep(0) }} />
      )}
      <div className="relative z-10 mx-auto w-full max-w-[1140px] px-5 pb-16">
        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {screen === 'welcome' && <Welcome onEnter={onConsent} />}
        {screen === 'list' && !activeQuestion && (
          <QuestionList onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setStep(1) }} />
        )}
        {screen === 'flow' && activeQuestion && (
          <PracticeFlow userId={userId!} question={activeQuestion} onStep={setStep}
            onExit={() => { setScreen('list'); setActiveQuestion(null); setStep(0) }} />
        )}
      </div>
    </div>
  )
}
