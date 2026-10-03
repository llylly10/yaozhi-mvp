import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Warning, ArrowRight, BookOpenText, ChatCircleText, Sparkle } from '@phosphor-icons/react'
import { api, type Diagnosis, type Question, type TikuFeedback } from '../api'
import { Hex } from '../components/ui'
import { Cconst, Rconst, genUUID, spring } from '../lib/shared'
import { DiagnosisPanel } from './DiagnosisPanel'
export function PracticeFlow({ userId, question, onDiagnosis, onError, onExit, onStep, onAskAi }: {
  userId: string; question: Question
  onDiagnosis: (d: Diagnosis | null) => void; onError: (m: string) => void; onExit: () => void
  onStep: (n: number) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [retest, setRetest] = useState<{ training_id: string; questions: { id: string; stem: string; options: { key: string; text: string }[] }[] } | null>(null)
  const [retestPicks, setRetestPicks] = useState<Record<string, string>>({})
  const [retestResult, setRetestResult] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  // 题库物化题（无 distractor_signals 标注）：答错走通用四分类归因轻量诊断会话
  // （一级错因 + 证据等级低 + 可细化），答对只给解析型反馈
  const [tikuFeedback, setTikuFeedback] = useState<{ feedback: TikuFeedback; is_correct: boolean } | null>(null)
  const [training, setTraining] = useState<{
    training_id: string; mode: string; note: string
    questions: { id: string; stem: string; options: { key: string; text: string }[]; is_ai_variant?: boolean }[]
    cards?: { front: string; back: string }[]
    reteach?: { level: number; title: string; summary: string } | null
  } | null>(null)
  const [generatingVariant, setGeneratingVariant] = useState(false)
  const [flipped, setFlipped] = useState<Record<number, boolean>>({})
  const [trainingPicks, setTrainingPicks] = useState<Record<string, string>>({})
  const [trainingResult, setTrainingResult] = useState<{ score: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pushDiagnosis(d: Diagnosis | null) { setDiagnosis(d); onDiagnosis(d) }

  async function submit() {
    if (!selected) return
    setSubmitting(true); setError(null)
    try {
      const r = await api.submitAttempt({
        user_id: userId, question_id: question.id, selected_option: selected,
        rationale: rationale || undefined, idempotency_key: genUUID(),
      })
      if (r.session_id) {
        setTikuFeedback(null)
        pushDiagnosis(await api.diagnosis(r.session_id))
      } else {
        // 题库题答对：不建会话，直接展示解析型反馈
        pushDiagnosis(null)
        setTikuFeedback({ feedback: r.feedback as TikuFeedback, is_correct: !!r.is_correct })
      }
      onStep(8)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(id: string) { pushDiagnosis(await api.diagnosis(id)) }

  async function handleGenerateAiVariant() {
    if (!training) return
    setGeneratingVariant(true)
    try {
      const res = await api.generateAiVariant(training.training_id)
      if (res && res.variant) {
        setTraining((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            questions: [...prev.questions, res.variant]
          }
        })
      }
    } catch (e) {
      setError('生成变式题失败：' + String(e))
    } finally {
      setGeneratingVariant(false)
    }
  }

  // 键盘答题：选项键直选 + 回车提交；输入框聚焦 / 已出结论时不劫持
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
      if (diagnosis || tikuFeedback || submitting) return
      const hit = question.options.find((o) => o.key.toUpperCase() === e.key.toUpperCase())
      if (hit) { setSelected(hit.key); return }
      if (e.key === 'Enter' && selected) { e.preventDefault(); submitRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t)
      pushDiagnosis(await api.diagnosis(diagnosis.session_id))
      onStep(10)
    } catch (e) { onError(String(e)) }
  }

  async function finishTraining() {
    if (!training || !diagnosis) return
    try {
      const r = await api.submitTraining(training.training_id, trainingPicks)
      setTrainingResult({ score: r.score })
      if (r.score >= 0.6) {
        const rt = await api.retest(training.training_id)
        setRetest(rt)
        pushDiagnosis(await api.diagnosis(diagnosis.session_id))
      }
    } catch (e) { onError(String(e)) }
  }

  async function finishRetest() {
    if (!retest) return
    try {
      const r = await api.submitRetest(retest.training_id, retestPicks)
      setRetestResult({ passed: r.passed, correct: r.correct, total: r.total })
    } catch (e) { onError(String(e)) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card relative overflow-hidden !rounded-[24px]">
        <div className="absolute right-6 top-5 opacity-[0.06]"><Hex size={92} className="text-ink" /></div>
        <div className="border-b border-line-2 px-8 pb-6 pt-7">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <div className="flex items-center gap-2">
              <span className="capsule" />{question.code} · 单选题 · 药理学 / {question.chapter_name || 'M 受体药'}
            </div>
            <button onClick={onExit} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-3 transition hover:border-primary hover:text-primary">
              <ArrowRight size={11} className="rotate-180" />返回今日待办
            </button>
          </div>
          <p className="display mt-4 text-[20px] md:text-[21px] font-bold text-ink leading-relaxed tracking-normal">{question.stem}</p>
        </div>
        <div className="p-8 pt-6">
          <div className="space-y-3">
            {question.options.map((o) => (
              <motion.button key={o.key} onClick={() => setSelected(o.key)} whileTap={{ scale: 0.99 }}
                className={`relative w-full rounded-2xl border px-5 py-4 text-left text-sm transition-colors duration-150 cursor-pointer
                  ${selected === o.key ? 'border-primary bg-primary-soft/85 shadow-xs font-semibold' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                <span className="relative z-10 flex items-center gap-3.5">
                  <span className={`grid size-7.5 flex-none place-items-center rounded-full border text-xs font-black transition-colors duration-150
                    ${selected === o.key ? 'border-primary bg-primary text-white shadow-xs' : 'border-line text-ink-2 bg-white'}`}>
                    {o.key}
                  </span>
                  <span className={selected === o.key ? 'font-bold text-ink text-[15px]' : 'text-ink-2 text-[14.5px]'}>{o.text}</span>
                </span>
              </motion.button>
            ))}
          </div>

          {!diagnosis && !tikuFeedback && question.options.every((o) => /^[A-Za-z0-9]$/.test(o.key)) && (
            <p className="mt-4 text-xs text-ink-3">
              键盘答题：按 {question.options.map((o) => o.key).join(' / ')} 快速选择，回车提交
            </p>
          )}
          <label className="mb-1.5 mt-7 block text-[13px] font-semibold text-ink-2">你的解题思路（选填）</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2}
            placeholder="写下你的推理，例如它作用于哪类受体、产生了什么效应。写得越清楚，归因越准。"
            className="input" />
          {!diagnosis && (
            <button onClick={submit} disabled={!selected || submitting} className="btn btn-primary mt-6">
              {submitting ? '判分中…' : '提交答案'}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {tikuFeedback && (
          <TikuFeedbackCard key={`tiku-${question.id}`} feedback={tikuFeedback.feedback}
            isCorrect={tikuFeedback.is_correct} question={question} onExit={onExit} onAskAi={onAskAi} />
        )}
        {diagnosis && (
          <DiagnosisPanel key={diagnosis.session_id}
            diagnosis={diagnosis} questionId={question.id} onRefresh={refresh}
            onStartTraining={startTraining} onExit={onExit} onError={setError} onAskAi={onAskAi} />
        )}
      </AnimatePresence>

      {training && !trainingResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="display text-[19px]">
                {training.mode === '记忆卡' ? '记忆卡训练' : training.mode === '断环重讲' ? '断环重讲 + 变式训练' : training.mode === '情境拆解' ? '情境拆解训练' : '针对性训练'}
              </h3>
              {training.note && <p className="text-xs text-ink-3 mt-0.5">{training.note}</p>}
            </div>
            <span className="capsule gold" />
          </div>

          {/* 断环重讲：先讲断环环节 */}
          {training.mode === '断环重讲' && training.reteach && (
            <div className="mb-6 rounded-2xl border-2 border-primary/30 bg-primary-soft/60 p-5">
              <p className="text-[11px] font-semibold text-primary mb-1">断环重讲 · L{training.reteach.level} {training.reteach.title}</p>
              <p className="text-sm leading-relaxed text-ink-2">{training.reteach.summary}</p>
            </div>
          )}

          {/* 记忆卡形态：翻卡 */}
          {training.mode === '记忆卡' && (training.cards ?? []).length > 0 && (
            <div className="space-y-3">
              {(training.cards ?? []).map((c, i) => (
                <motion.button key={i} whileTap={{ scale: 0.99 }}
                  onClick={() => setFlipped({ ...flipped, [i]: !flipped[i] })}
                  className="w-full rounded-2xl border border-line-2 bg-white p-5 text-left">
                  <p className="text-[11px] font-semibold text-ink-3 mb-1.5">
                    记忆卡 {i + 1}/{(training.cards ?? []).length} · {flipped[i] ? '要点' : '回忆'}
                  </p>
                  <p className={`leading-relaxed ${flipped[i] ? 'text-sm text-ink-2' : 'display text-[16px]'}`}>
                    {flipped[i] ? c.back : c.front}
                  </p>
                </motion.button>
              ))}
              <p className="text-xs text-ink-3">全部翻看完毕后点击下方按钮标记完成（知识遗忘类先记后测）。</p>
            </div>
          )}

          {training.mode !== '记忆卡' && (
          <div className="space-y-6">
            {training.questions.length === 0 ? (
              <div className="rounded-2xl border border-line-2 bg-paper p-6 text-center text-sm text-ink-2">
                正在加载针对性训练题，请稍候…
              </div>
            ) : (
              training.questions.map((q, i) => (
                <div key={q.id} className={`rounded-2xl border p-6 ${q.is_ai_variant ? 'border-primary/40 bg-primary-soft/20' : 'border-line-2'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-ink-3">第 {i + 1} 题</span>
                    {q.is_ai_variant && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        <Sparkle size={12} weight="fill" />
                        ⚡ AI 高仿真变式 · 盲答双审通过
                      </span>
                    )}
                  </div>
                  <p className="mb-3.5 text-sm font-medium leading-relaxed">{q.stem}</p>
                  <div className="space-y-2.5">
                    {q.options.map((o) => (
                      <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                        onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                        className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                          ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                        <span className="relative z-10 flex items-center gap-3">
                          <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                            ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>
                            {o.key}
                          </span>
                          <span className={trainingPicks[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleGenerateAiVariant}
                disabled={generatingVariant}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-xs transition hover:bg-primary-soft disabled:opacity-50"
              >
                <Sparkle size={13} weight="fill" />
                {generatingVariant ? 'AI 正在根据本题考点生成高仿真变式并进行反向交叉盲审…' : '⚡ 现场生成一道 AI 变式题（双盲交叉审校）'}
              </button>
            </div>
          </div>
          )}
          {training.mode !== '记忆卡' && (
          <button onClick={finishTraining}
            disabled={training.questions.length === 0 || Object.keys(trainingPicks).length < training.questions.length}
            className="btn btn-primary mt-7 disabled:opacity-50">
            提交训练{training.questions.length > 0 ? `（已答 ${Object.keys(trainingPicks).length}/${training.questions.length}）` : ''}
          </button>
          )}
          {training.mode === '记忆卡' && (
            <button onClick={finishTraining} className="btn btn-primary mt-7">完成记忆训练</button>
          )}
        </motion.div>
      )}

      {trainingResult && !retest && <TrainingResult score={trainingResult.score} onExit={onExit} />}

      {retest && !retestResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="display text-[19px]">迁移复测 · 新情境检验</h3>
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold">通过后标记「已突破」</span>
          </div>
          <p className="mb-5 text-xs text-ink-3">以下题目换了情境但考查同一个推理链——这才是真正掌握的检验。</p>
          <div className="space-y-6">
            {retest.questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-6">
                <p className="mb-3.5 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                      onClick={() => setRetestPicks({ ...retestPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                        ${retestPicks[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                      <span className="relative z-10 flex items-center gap-3">
                        <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                          ${retestPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>{o.key}</span>
                        <span className={retestPicks[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishRetest} disabled={Object.keys(retestPicks).length < retest.questions.length}
            className="btn btn-primary mt-7">提交复测</button>
        </motion.div>
      )}

      {retestResult && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
          className="card mt-5 !rounded-[24px] p-10 text-center"
          style={{ background: retestResult.passed ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
          <div className="relative mx-auto size-[110px]">
            <svg className="size-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={Rconst} fill="none" stroke="#fff" strokeWidth={9} />
              <motion.circle cx="60" cy="60" r={Rconst} fill="none" strokeWidth={9} strokeLinecap="round"
                strokeDasharray={Cconst}
                initial={{ strokeDashoffset: Cconst }}
                animate={{ strokeDashoffset: Cconst * (1 - retestResult.correct / Math.max(retestResult.total, 1)) }}
                transition={{ ...spring, delay: 0.25 }}
                style={{ stroke: retestResult.passed ? 'var(--color-ok)' : 'var(--color-cat-red)' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <p className="display text-[24px]">{retestResult.correct}/{retestResult.total}</p>
            </div>
          </div>
          <h3 className="display mt-5 text-[20px]">{retestResult.passed ? '复测通过 · 已标记「掌握」' : '复测未通过 · 已退回薄弱项'}</h3>
          <p className="mt-2 text-sm text-ink-2">
            {retestResult.passed
              ? '迁移情境下推理依然成立，这个缺口真正补上了。'
              : '换个情境就没答对，说明之前是短期记忆——材料再看一遍，隔两天再来。'}
          </p>
          <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
        </motion.div>
      )}
    </motion.div>
  )
}

export function TrainingResult({ score, onExit }: { score: number; onExit: () => void }) {
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
      <p className="mt-2 text-xs text-ink-3">错题已归档到「错题本」，可从左侧栏查看</p>
      <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
    </motion.div>
  )
}

/* 题库物化题（无错因标注）的解析型反馈卡：答对/答错均即时展示教材解析。
   区别于种子域的错因诊断卡——不硬归因到四分类错因（诚实口径，见演示手册）。 */

export function TikuFeedbackCard({ feedback, isCorrect, question, onExit, onAskAi }: {
  feedback: TikuFeedback; isCorrect: boolean; question: Question; onExit: () => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-5 space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
        className="card flex items-center gap-4 p-5"
        style={{ background: isCorrect ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)',
                 borderColor: isCorrect ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {isCorrect
          ? <CheckCircle size={26} weight="fill" className="flex-none text-ok" />
          : <Warning size={26} weight="fill" className="flex-none text-cat-red" />}
        <div>
          <p className="font-semibold">{isCorrect ? '回答正确' : '回答错误'}</p>
          <p className="text-[13px] text-ink-2">
            {feedback.chapter_name ? `${feedback.chapter_name} · ` : ''}题库原题解析已展示
            {!isCorrect && '，可对照下方解析自查错点'}
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="card !rounded-[24px] overflow-hidden">
        <div className="border-b border-line-2 px-8 pb-5 pt-7"
          style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
          <div className="flex items-center gap-4">
            <span className="rx-badge">Rx</span>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">答案解析 · 考点与机制</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                四分类错因诊断在标注域题目上提供完整流程；本题展示教材锚点解析供自查
              </p>
            </div>
          </div>
        </div>
        <div className="p-8">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{feedback.analysis || '（该题暂无解析文本）'}</p>
          {feedback.source && (
            <p className="mt-5 flex items-center gap-1.5 rounded-xl border border-line-2 bg-paper px-4 py-3 text-xs text-ink-3">
              <BookOpenText size={15} className="flex-none text-primary" />
              解析来源：{feedback.source}
            </p>
          )}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button onClick={onExit} className="btn btn-primary">返回今日待办</button>
            {onAskAi && !isCorrect && (
              <button
                type="button"
                onClick={() => {
                  const ctx = `题库考题：
章节：${feedback.chapter_name || question.chapter_name || '药理学'}
题目：${question.stem}
解析依据：${feedback.analysis || '暂无详细文本'}
出处：${feedback.source || '人卫第9版教材考纲'}`
                  onAskAi(ctx, `关于该题考查的 ${feedback.chapter_name || '药理'} 考点，请老师帮我详细剖析核心药理机制与临床易混淆点。`, question.id)
                }}
                className="btn rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300 flex items-center gap-1.5"
              >
                <ChatCircleText size={15} weight="bold" className="text-sky-500" />
                💬 针对此题向 AI 追问
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
