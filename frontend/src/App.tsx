import { useEffect, useState } from 'react'
import { CheckCircle, Warning, MagnifyingGlass, SkipForward, Brain, NotePencil, ArrowRight, CaretLeft } from '@phosphor-icons/react'
import { api, type Diagnosis, type Question } from './api'

/*
 * 学习闭环界面（Redesign-Preserve：对齐产品原型视觉语言）
 * 屏幕流：欢迎 → 题库 → 作答 → 诊断/追问 → 训练 → 结果
 */

const USER_KEY = 'yaozhi_user_id'

type Screen = 'welcome' | 'list' | 'flow'
const STEPS = ['题库', '作答', '诊断', '训练'] as const

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(USER_KEY) ? 'list' : 'welcome'))
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  function onConsent() {
    api.demoSession(true).then((r) => {
      localStorage.setItem(USER_KEY, r.user_id)
      setUserId(r.user_id)
      setScreen('list')
      setStep(0)
    }).catch((e) => setError(String(e)))
  }

  return (
    <div className="min-h-[100dvh]">
      {screen !== 'welcome' && <StepRail step={step} onExit={() => { setScreen('list'); setActiveQuestion(null); setStep(0) }} />}
      <div className="max-w-[1080px] mx-auto px-5 pb-14">
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {screen === 'welcome' && <Welcome key="welcome" onEnter={onConsent} />}
        {screen === 'list' && !activeQuestion && (
          <div key="list" className="fade-up pt-8">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="display text-[26px]">今天练什么</h2>
              <span className="text-xs text-ink-3">诊断域：M 受体激动药与阻断药</span>
            </div>
            <p className="text-sm text-ink-2 mb-6">选择一道题开始。答错时，系统会帮你定位错在哪，而不是只告诉你错了。</p>
            <QuestionList onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setStep(1) }} />
            <p className="text-xs text-ink-3 mt-5">演示账号 {String(userId).slice(0, 8)} · 作答记录已匿名保存 · 本系统不提供用药建议</p>
          </div>
        )}
        {screen === 'flow' && activeQuestion && (
          <PracticeFlow key={activeQuestion.id} userId={userId!} question={activeQuestion}
            onStep={setStep}
            onExit={() => { setScreen('list'); setActiveQuestion(null); setStep(0) }} />
        )}
      </div>
    </div>
  )
}

/* ---------- 顶部步骤轨 ---------- */

function StepRail({ step, onExit }: { step: number; onExit: () => void }) {
  return (
    <div className="border-b border-line-2 bg-white">
      <div className="max-w-[1080px] mx-auto px-5 py-2.5 flex items-center gap-2">
        <button onClick={onExit} className="btn rail-chip hover:bg-paper-2 items-center">
          <CaretLeft size={13} />题库
        </button>
        <span className="text-line px-1">|</span>
        {STEPS.map((s, i) => (
          <span key={s} className={`rail-chip ${i <= step ? 'active' : ''}`}>
            <span className={`size-1.5 rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />
            {s}
          </span>
        ))}
        <span className="ml-auto text-xs text-ink-3 font-semibold tracking-wide">药知</span>
      </div>
    </div>
  )
}

/* ---------- 欢迎页：渐变英雄区 + 同意卡 ---------- */

function Welcome({ onEnter }: { onEnter: () => void }) {
  const [reads, setReads] = useState([false, false, false])
  const all = reads.every(Boolean)
  const toggle = (i: number) => setReads(reads.map((v, j) => (j === i ? !v : v)))

  return (
    <div className="min-h-[100dvh] max-w-[1080px] mx-auto px-5 py-8 grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-stretch">
      {/* 英雄区 */}
      <div className="fade-up hero-gradient relative overflow-hidden rounded-[20px] p-10 text-white flex flex-col min-h-[520px]">
        {/* 六边形分子装饰 */}
        <div className="absolute -right-10 -top-10 opacity-15 pointer-events-none grid grid-cols-4 gap-1 rotate-12">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="molecule" style={{ '--mol-bg': 'rgba(255,255,255,.9)' } as React.CSSProperties} />
          ))}
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium">
          药学专业的错因诊断学习闭环
        </span>
        <h1 className="display text-[34px] leading-[1.35] mt-5">
          从「知道答案」<br />走向「理解原因」
        </h1>
        <p className="mt-4 max-w-[420px] text-sm opacity-85 leading-relaxed">
          答错一道题不可怕，可怕的是不知道自己为什么错。药知用证据化的错因归因和靶向训练，帮你把每个理解缺口补上。
        </p>
        <div className="mt-auto pt-7">
          <p className="text-xs opacity-70 mb-3">学习闭环</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {['作答', '错因归因', '定向追问', '靶向训练', '迁移复测'].map((s, i) => (
              <span key={s} className="flex items-center gap-2.5">
                {i > 0 && <ArrowRight size={12} className="opacity-60" />}
                <span className="rounded-[10px] border border-white/25 bg-white/10 px-3.5 py-2 text-[13px]">{s}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 同意卡 */}
      <div className="fade-up self-center card rounded-[20px] p-9" style={{ animationDelay: '80ms' }}>
        <h2 className="display text-[22px] mb-1">开始之前</h2>
        <p className="text-[13px] text-ink-2 mb-6">请逐条确认以下说明，全部同意后进入。</p>
        <div className="space-y-3.5">
          {[
            ['演示环境', '本系统为比赛演示环境，仅用于药理学学习练习，使用演示账号。'],
            ['数据隐私', '只收集完成学习闭环所需的作答与学习记录，不含真实身份信息；你可以随时要求删除数据。'],
            ['非医疗建议', '系统输出仅用于学习，不能替代医师或药师的用药建议。'],
          ].map(([t, d], i) => (
            <button key={t} onClick={() => toggle(i)}
              className={`w-full text-left rounded-xl border p-4 flex gap-3.5 items-start transition-all
                ${reads[i] ? 'border-primary bg-primary-soft' : 'border-line-2 bg-white hover:border-line'}`}>
              <span className={`mt-0.5 grid place-items-center size-[22px] rounded-md border-2 flex-none
                ${reads[i] ? 'bg-primary border-primary' : 'border-line bg-white'}`}>
                {reads[i] && <CheckCircle size={14} weight="bold" className="text-white" />}
              </span>
              <span>
                <span className="font-semibold text-[14px] flex items-center gap-2">{t}</span>
                <span className="block text-[13px] text-ink-2 mt-1 leading-relaxed">{d}</span>
              </span>
            </button>
          ))}
        </div>
        <button onClick={onEnter} disabled={!all}
          className="btn btn-primary w-full mt-7 !py-3">
          进入学习<ArrowRight size={15} />
        </button>
        <p className="text-center text-xs text-ink-3 mt-4">Datawhale 星跃三期 · 药知项目</p>
      </div>
    </div>
  )
}

/* ---------- 题库 ---------- */

function QuestionList({ onPick }: { onPick: (q: Question) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.questions().then(setQuestions).catch((e) => setError(String(e)))
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (!questions) return <ListSkeleton />
  if (questions.length === 0) return <EmptyPanel text="当前没有可练习的题目，等待内容生产。" />

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {questions.map((q, i) => (
        <button key={q.id} onClick={() => onPick(q)}
          className="btn card fade-up p-5 text-left hover:shadow-[var(--shadow-lg)] hover:-translate-y-0.5 flex gap-4 items-start !items-start"
          style={{ animationDelay: `${i * 40}ms` }}>
          <span className="molecule" style={{ '--mol-bg': 'var(--color-primary-soft)' } as React.CSSProperties}>
            <i>{q.code.slice(-1)}</i>
          </span>
          <span>
            <span className="block text-[14.5px] font-medium leading-relaxed">{q.stem}</span>
            <span className="block text-xs text-ink-3 mt-2.5">开始练习</span>
          </span>
        </button>
      ))}
    </div>
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
    <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}>
      {category}
    </span>
  )
}

function EvidenceBadge({ level }: { level: string }) {
  if (level === '高')
    return <span className="rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: 'var(--color-ok)' }}>证据等级 · 高</span>
  if (level === '中')
    return <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>证据等级 · 中</span>
  return <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: 'var(--color-warn-soft)', color: 'var(--color-warn)' }}>证据等级 · 低</span>
}

/* ---------- 作答 → 诊断 → 追问 → 训练 ---------- */

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

  async function refresh(sessionId: string) { setDiagnosis(await api.diagnosis(sessionId)) }

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t)
      setDiagnosis(await api.diagnosis(diagnosis.session_id))
      onStep(3)
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
    <div className="fade-up pt-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
      )}
      <div className="rounded-[20px] overflow-hidden card !shadow-[var(--shadow-lg)]">
        {/* 题目卡头 */}
        <div className="px-7 pt-6 pb-5 border-b border-line-2" style={{ background: 'linear-gradient(150deg, var(--color-primary-soft), #fff 70%)' }}>
          <div className="flex items-center gap-3.5">
            <span className="molecule" style={{ '--mol-bg': 'var(--color-primary)', '--mol-ink': '#fff' } as React.CSSProperties}>
              <i>{question.code.slice(-1)}</i>
            </span>
            <div>
              <p className="text-xs text-ink-3">{question.code} · 单选题</p>
              <p className="font-semibold">药理学 · M 受体激动药与阻断药</p>
            </div>
          </div>
          <p className="display text-[17px] leading-relaxed mt-4">{question.stem}</p>
        </div>

        <div className="p-7 pt-6">
          <div className="space-y-2.5">
            {question.options.map((o) => (
              <button key={o.key} onClick={() => setSelected(o.key)}
                className={`btn !justify-start w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-all
                  ${selected === o.key ? 'border-primary bg-primary-soft shadow-[var(--shadow-card)]' : 'border-line bg-white hover:border-ink-3/40'}`}>
                <span className={`inline-grid place-items-center size-6 rounded-full border text-xs font-bold mr-2.5 flex-none
                  ${selected === o.key ? 'text-white' : 'border-line text-ink-2'}`}
                  style={selected === o.key ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : {}}>
                  {o.key}
                </span>
                {o.text}
              </button>
            ))}
          </div>

          <label className="block text-[13px] font-semibold text-ink-2 mt-6 mb-1.5">你的解题思路（选填）</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2}
            placeholder="写下你的推理，例如它作用于哪类受体、产生了什么效应。写得越清楚，归因越准。"
            className="input" />
          <button onClick={submit} disabled={!selected || submitting}
            className="btn btn-primary mt-5">
            {submitting ? '判分中…' : '提交答案'}
          </button>
        </div>
      </div>

      {diagnosis && (
        <DiagnosisPanel diagnosis={diagnosis} onRefresh={refresh} onStartTraining={startTraining} onError={setError} />
      )}

      {training && !trainingResult && (
        <div className="card fade-up p-7 mt-5">
          <div className="flex items-center gap-3 mb-5">
            <span className="molecule" style={{ '--mol-bg': 'var(--color-gold-soft)' } as React.CSSProperties}>
              <NotePencil size={20} className="text-gold relative z-10" />
            </span>
            <div>
              <h3 className="font-semibold">针对性训练</h3>
              <p className="text-xs text-ink-3">围绕「{training.questions.length} 道题」巩固被诊断出的理解缺口</p>
            </div>
          </div>
          <div className="space-y-6">
            {training.questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-line-2 p-5">
                <p className="text-sm font-medium leading-relaxed mb-3">{i + 1}. {q.stem}</p>
                <div className="space-y-2">
                  {q.options.map((o) => (
                    <button key={o.key} onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                      className={`btn !justify-start w-full rounded-lg border px-3.5 py-2.5 text-left text-sm
                        ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:bg-paper'}`}>
                      <span className="font-semibold mr-2">{o.key}.</span>{o.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishTraining} className="btn btn-primary mt-6">提交训练</button>
        </div>
      )}

      {trainingResult && (
        <div className="card fade-up p-8 mt-5 text-center">
          <div className="molecule mx-auto" style={{ '--mol-bg': 'var(--color-ok)', '--mol-ink': '#fff' } as React.CSSProperties}>
            <CheckCircle size={20} weight="bold" className="text-white relative z-10" />
          </div>
          <h3 className="display text-[20px] mt-4 mb-2">本轮训练完成</h3>
          <p className="text-sm text-ink-2">正确率 {Math.round(trainingResult.score * 100)}% · 掌握状态已更新</p>
          <p className="text-xs text-ink-3 mt-2">新情境迁移复测与延迟复测将在后续版本开放</p>
          <button onClick={onExit} className="btn btn-primary mt-6">返回题库</button>
        </div>
      )}
    </div>
  )
}

/* ---------- 诊断卡（含追问） ---------- */

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
    <div className="fade-up mt-5 space-y-5">
      {/* 判定横幅 */}
      <div className={`card p-5 flex items-center gap-3.5 ${diagnosis.is_correct ? '' : 'border-red-200'}`}
        style={{ background: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {diagnosis.is_correct
          ? <CheckCircle size={22} weight="fill" className="text-ok flex-none" />
          : <Warning size={22} weight="fill" className="text-cat-red flex-none" />}
        <div>
          <p className="font-semibold">{diagnosis.is_correct ? '回答正确' : '回答错误'}</p>
          {!diagnosis.is_correct && <p className="text-[13px] text-ink-2">正确答案 {diagnosis.answer} · 系统正在定位你的错因</p>}
        </div>
      </div>

      {/* 追问 */}
      {diagnosis.state === 'followup_required' && diagnosis.followup && (
        <div className="card fade-up p-7">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-ink-3">定向追问</p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diagnosis.followup.turn_max }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < diagnosis.followup_count + 1 ? 'bg-primary' : 'bg-line'}`} />
              ))}
              <span className="text-xs text-ink-3 ml-1">第 {diagnosis.followup_count + 1} / {diagnosis.followup.turn_max} 轮</span>
            </div>
          </div>
          <p className="display text-[16px] mb-5">{diagnosis.followup.question_text}</p>
          {diagnosis.followup.options ? (
            <div className="space-y-2.5">
              {diagnosis.followup.options.map((o) => (
                <button key={o.key} disabled={answering} onClick={() => answer(o.key)}
                  className="btn !justify-start w-full rounded-xl border border-line bg-white px-4 py-3.5 text-left text-sm hover:border-primary hover:bg-primary-soft">
                  <span className="font-semibold mr-2.5">{o.key}.</span>{o.text}
                </button>
              ))}
            </div>
          ) : (
            <OpenAnswer onAnswer={() => answer()} disabled={answering} />
          )}
          <button onClick={skip} disabled={answering}
            className="btn mt-4 text-[13px] text-ink-3 hover:text-ink items-center gap-1">
            <SkipForward size={13} />跳过追问，生成低证据归因
          </button>
        </div>
      )}

      {/* 错因卡 */}
      {diagnosis.card && (
        <div className="card fade-up overflow-hidden">
          <div className="px-7 py-5 border-b border-line-2 flex items-center justify-between"
            style={{ background: 'linear-gradient(150deg, var(--color-primary-soft), #fff 75%)' }}>
            <h3 className="font-semibold flex items-center gap-2.5">
              <span className="molecule" style={{ '--mol-bg': 'var(--color-primary)', '--mol-ink': '#fff' } as React.CSSProperties}>
                <Brain size={18} className="text-white relative z-10" />
              </span>
              错因诊断卡
            </h3>
            <EvidenceBadge level={diagnosis.card.evidence_level} />
          </div>
          <div className="p-7">
            <div className="flex items-center gap-3 flex-wrap">
              <CategoryTag category={diagnosis.card.misconception.category} />
              <p className="font-medium text-[15px]">{diagnosis.card.misconception.name}</p>
            </div>
            <p className="text-xs text-ink-3 mt-4 mb-3 font-semibold">归因依据（证据链）</p>
            <div className="space-y-3">
              {diagnosis.card.evidences.map((e, i) => (
                <div key={i} className="rounded-xl bg-paper px-5 py-4 text-sm border-l-[3px] border-primary">
                  <p className="text-xs text-ink-3 mb-1">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                  <p className="text-ink-2 leading-relaxed">{e.content}</p>
                </div>
              ))}
            </div>
            {diagnosis.state === 'diagnosed' && (
              <button onClick={onStartTraining} className="btn btn-primary mt-6">
                进入针对性训练<ArrowRight size={15} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function OpenAnswer({ onAnswer, disabled }: { onAnswer: () => void; disabled: boolean }) {
  const [text, setText] = useState('')
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="用你自己的话回答"
        className="input" />
      <button onClick={() => onAnswer()} disabled={disabled || !text.trim()} className="btn btn-primary mt-4">
        <MagnifyingGlass size={14} />提交回答
      </button>
    </div>
  )
}

/* ---------- 状态组件 ---------- */

function ListSkeleton() {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[110px] w-full" />)}
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="card p-12 text-center">
      <span className="molecule mx-auto" style={{ '--mol-bg': 'var(--color-paper-2)' } as React.CSSProperties} />
      <p className="text-sm text-ink-3 mt-4">{text}</p>
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
}
