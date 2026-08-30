import { useEffect, useState } from 'react'
import { CheckCircle, Warning, MagnifyingGlass, SkipForward, Brain, NotePencil, ArrowsClockwise } from '@phosphor-icons/react'
import { api, type Diagnosis, type Question } from './api'

/* 学习闭环（v1.1 §4.1）：练习 → 错因诊断 → 追问 → 针对性训练 → 掌握状态 */

const USER_KEY = 'yaozhi_user_id'

type Phase = 'consent' | 'list' | 'flow'

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [phase, setPhase] = useState<Phase>(() => (localStorage.getItem(USER_KEY) ? 'list' : 'consent'))
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onConsent(consent: boolean) {
    api.demoSession(consent).then((r) => {
      localStorage.setItem(USER_KEY, r.user_id)
      setUserId(r.user_id)
      setPhase('list')
    }).catch((e) => setError(String(e)))
  }

  return (
    <div className="min-h-[100dvh] max-w-[760px] mx-auto px-4 py-10">
      <header className="flex items-baseline justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">药知</h1>
          <p className="text-sm text-zinc-500">从知道答案，走向理解原因</p>
        </div>
        {userId && (
          <button
            className="btn text-sm text-zinc-500 hover:text-zinc-800"
            onClick={() => { localStorage.removeItem(USER_KEY); setUserId(null); setPhase('consent'); setActiveQuestion(null) }}
          >
            退出演示账号
          </button>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-6">
          {error}
        </div>
      )}

      {phase === 'consent' && <Consent onConsent={onConsent} />}
      {phase === 'list' && !activeQuestion && (
        <QuestionList userId={userId!} onPick={(q) => { setError(null); setActiveQuestion(q) }} />
      )}
      {activeQuestion && (
        <PracticeFlow
          userId={userId!}
          question={activeQuestion}
          onExit={() => setActiveQuestion(null)}
        />
      )}
    </div>
  )
}

/* ---------- 同意门（US-0） ---------- */

function Consent({ onConsent }: { onConsent: (c: boolean) => void }) {
  const [read, setRead] = useState(false)
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="font-semibold mb-3">使用前请先了解</h2>
      <ul className="text-sm text-zinc-600 space-y-2 mb-6">
        <li>本系统为比赛演示环境，仅用于药理学学习练习。</li>
        <li>只收集完成学习闭环所需的作答与学习记录，不含真实身份信息。</li>
        <li>系统不能替代医师或药师的用药建议。</li>
      </ul>
      <label className="flex items-center gap-2 text-sm mb-5">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)}
               className="size-4 accent-emerald-600" />
        我已阅读并同意以上说明
      </label>
      <button
        disabled={!read}
        onClick={() => onConsent(true)}
        className="btn rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        进入学习
      </button>
    </section>
  )
}

/* ---------- 题目清单 ---------- */

function QuestionList({ userId, onPick }: { userId: string; onPick: (q: Question) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.questions().then(setQuestions).catch((e) => setError(String(e)))
  }, [])

  if (error) return <ErrorPanel message={error} />
  if (!questions) return <ListSkeleton />
  if (questions.length === 0)
    return <EmptyPanel text="当前没有可练习的题目，等待内容生产。" />

  return (
    <section>
      <h2 className="font-semibold mb-1">今天练什么</h2>
      <p className="text-sm text-zinc-500 mb-4">选择一道题开始；答错时系统会帮你定位错因。</p>
      <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
        {questions.map((q) => (
          <button key={q.id} onClick={() => onPick(q)}
                  className="btn block w-full px-5 py-4 text-left hover:bg-zinc-50 first:rounded-t-xl last:rounded-b-xl">
            <span className="text-sm text-zinc-400 mr-3">{q.code}</span>
            <span className="text-sm">{q.stem}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-400 mt-3">演示账号 {userId.slice(0, 8)}，作答记录已匿名保存。</p>
    </section>
  )
}

/* ---------- 单题闭环流程 ---------- */

function PracticeFlow({ userId, question, onExit }: {
  userId: string; question: Question; onExit: () => void
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
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(sessionId: string) {
    setDiagnosis(await api.diagnosis(sessionId))
  }

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t)
      setDiagnosis(await api.diagnosis(diagnosis.session_id))
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
    <section>
      <button onClick={onExit} className="btn text-sm text-zinc-500 hover:text-zinc-800 mb-4">
        返回题目列表
      </button>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">{error}</div>
      )}

      {/* 作答 */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-xs text-zinc-400 mb-2">{question.code}</p>
        <p className="font-medium leading-relaxed mb-5">{question.stem}</p>
        <div className="space-y-2">
          {question.options.map((o) => (
            <button key={o.key} onClick={() => setSelected(o.key)}
                    className={`btn w-full rounded-xl border px-4 py-3 text-left text-sm
                      ${selected === o.key ? 'border-emerald-600 bg-emerald-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
              <span className="font-medium mr-2">{o.key}.</span>{o.text}
            </button>
          ))}
        </div>
        <label className="block text-sm text-zinc-600 mt-5 mb-1">你的解题思路（选填，帮助系统更准地归因）</label>
        <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2}
                  placeholder="例如：我认为它作用于哪个受体、产生了什么效应"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40" />
        <button onClick={submit} disabled={!selected || submitting}
                className="btn mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
          {submitting ? '判分中' : '提交答案'}
        </button>
      </div>

      {/* 诊断卡与追问 */}
      {diagnosis && <DiagnosisPanel diagnosis={diagnosis} onRefresh={refresh} onStartTraining={startTraining} onError={setError} />}

      {/* 训练 */}
      {training && !trainingResult && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 mt-4">
          <h3 className="font-semibold flex items-center gap-2 mb-4"><NotePencil size={18} className="text-emerald-600" />针对性训练</h3>
          <div className="space-y-5">
            {training.questions.map((q, i) => (
              <div key={q.id}>
                <p className="text-sm font-medium mb-2">{i + 1}. {q.stem}</p>
                <div className="space-y-1.5">
                  {q.options.map((o) => (
                    <button key={o.key}
                            onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                            className={`btn w-full rounded-lg border px-3 py-2 text-left text-sm
                              ${trainingPicks[q.id] === o.key ? 'border-emerald-600 bg-emerald-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                      <span className="font-medium mr-2">{o.key}.</span>{o.text}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishTraining}
                  className="btn mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
            提交训练
          </button>
        </div>
      )}

      {trainingResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 mt-4">
          <h3 className="font-semibold flex items-center gap-2 mb-2"><ArrowsClockwise size={18} className="text-emerald-700" />训练完成</h3>
          <p className="text-sm text-zinc-700 mb-1">本轮正确率 {Math.round(trainingResult.score * 100)}%。</p>
          <p className="text-sm text-zinc-500">新情境迁移复测与延迟复测将在后续版本开放。</p>
        </div>
      )}
    </section>
  )
}

/* 训练判分已在服务端完成 */

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
    <div className="mt-4 space-y-4">
      <div className={`rounded-xl border p-6 ${diagnosis.is_correct ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <p className="font-semibold flex items-center gap-2">
          {diagnosis.is_correct
            ? <CheckCircle size={20} className="text-emerald-700" />
            : <Warning size={20} className="text-amber-700" />}
          {diagnosis.is_correct ? '回答正确' : '回答错误'}
        </p>
        {!diagnosis.is_correct && <p className="text-sm text-zinc-700 mt-1">正确答案：{diagnosis.answer}</p>}
      </div>

      {diagnosis.state === 'followup_required' && diagnosis.followup && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <p className="text-xs text-zinc-400 mb-2">定向追问 · 帮助系统定位你的理解缺口</p>
          <p className="font-medium mb-4">{diagnosis.followup.question_text}</p>
          {diagnosis.followup.options ? (
            <div className="space-y-2">
              {diagnosis.followup.options.map((o) => (
                <button key={o.key} disabled={answering} onClick={() => answer(o.key)}
                        className="btn w-full rounded-xl border border-zinc-200 px-4 py-3 text-left text-sm hover:bg-zinc-50">
                  <span className="font-medium mr-2">{o.key}.</span>{o.text}
                </button>
              ))}
            </div>
          ) : (
            <OpenAnswer onAnswer={() => answer()} disabled={answering} />
          )}
          <button onClick={skip} disabled={answering}
                  className="btn mt-4 text-sm text-zinc-500 hover:text-zinc-800 flex items-center gap-1">
            <SkipForward size={14} />跳过追问（将给出低证据等级的归因）
          </button>
        </div>
      )}

      {diagnosis.card && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Brain size={18} className="text-emerald-600" />错因诊断卡
            </h3>
            <EvidenceBadge level={diagnosis.card.evidence_level} />
          </div>
          <p className="text-sm mb-1">
            <span className="inline-block rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white mr-2">
              {diagnosis.card.misconception.category}
            </span>
            {diagnosis.card.misconception.name}
          </p>
          <div className="mt-4 space-y-3">
            {diagnosis.card.evidences.map((e, i) => (
              <div key={i} className="rounded-lg bg-zinc-50 px-4 py-3 text-sm">
                <p className="text-xs text-zinc-400 mb-1">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                <p className="text-zinc-700 leading-relaxed">{e.content}</p>
              </div>
            ))}
          </div>
          {diagnosis.state === 'diagnosed' && (
            <button onClick={onStartTraining}
                    className="btn mt-5 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700">
              进入针对性训练
            </button>
          )}
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
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40" />
      <button onClick={() => onAnswer()} disabled={disabled || !text.trim()}
              className="btn mt-3 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 flex items-center gap-1">
        <MagnifyingGlass size={14} />提交回答
      </button>
    </div>
  )
}

function EvidenceBadge({ level }: { level: string }) {
  const high = level === '高'
  const mid = level === '中'
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium ${high ? 'bg-emerald-600 text-white' : mid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      证据等级：{level}
    </span>
  )
}

/* ---------- 状态组件 ---------- */

function ListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="skeleton h-6 w-40 mb-4" />
      {[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-400">{text}</div>
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{message}</div>
}
