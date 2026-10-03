import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, Pill, ChatCircleText, Sparkle } from '@phosphor-icons/react'
import { api, type Diagnosis } from '../api'
import { CategoryTag } from '../components/ui'
import { spring } from '../lib/shared'
export type Analysis = {
  question_code: string; stem: string; answer: string
  evidence: { ref: string; text: string }[]
  analysis: { option: string; option_text: string; category: string; misconception: string; note: string }[]
  primary?: { option: string; option_text: string; category: string; misconception: string; note: string } | null
  followups?: { question_text: string; options: { key: string; text: string }[] | null }[]
}

export function DiagnosisPanel({ diagnosis, questionId, onRefresh, onStartTraining, onExit, onError, onAskAi }: {
  diagnosis: Diagnosis; questionId: string; onRefresh: (id: string) => void
  onStartTraining: () => void; onExit: () => void; onError: (m: string) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  const [answering, setAnswering] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showFollowup, setShowFollowup] = useState(false)
  const [openAnalysis, setOpenAnalysis] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  useEffect(() => {
    if (diagnosis.is_correct) {
      api.questionAnalysis(questionId).then(setAnalysis).catch((e) => onError(String(e)))
    }
  }, [diagnosis.is_correct])

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
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
        className="card flex items-center gap-4 p-5"
        style={{ background: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)',
                 borderColor: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {diagnosis.is_correct
          ? <CheckCircle size={26} weight="fill" className="flex-none text-ok" />
          : <Warning size={26} weight="fill" className="flex-none text-cat-red" />}
        <div>
          <p className="font-semibold">{diagnosis.is_correct ? '回答正确' : '回答错误'}</p>
          {!diagnosis.is_correct
            ? <p className="text-[13px] text-ink-2">正确答案 {diagnosis.answer} · 系统正在定位你的错因</p>
            : <p className="text-[13px] text-ink-2">这道题的坑你已经避开了 — 可选：看看其他错误选项背后的典型误区</p>}
        </div>
        {diagnosis.is_correct && (
          <button onClick={() => setOpenAnalysis(!openAnalysis)}
            className="btn ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--color-cat-red)' }}>
            查看错因分析
          </button>
        )}
      </motion.div>
      {diagnosis.is_correct && openAnalysis && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-4 !rounded-[24px] overflow-hidden">
          <div className="border-b border-line-2 px-8 pb-5 pt-7" style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
            <div className="flex items-center gap-4">
              <span className="rx-badge">Rx</span>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">错因分析 · 防坑指南</p>
                <p className="mt-0.5 text-[13px] text-ink-2">答对了也值得看看：每个错误选项背后是什么典型误区</p>
              </div>
            </div>
          </div>
          <div className="p-8">
            {/* 假设性错因诊断卡（与真实诊断卡同构） */}
            {analysis?.primary && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft/60 p-5 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <CategoryTag category={analysis.primary.category} />
                  <p className="text-[15px] font-semibold">假设性主要错因（假设误选 {analysis.primary.option} {analysis.primary.option_text}）</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{analysis.primary.misconception}</p>
                <p className="mt-3 text-xs text-ink-3">
                  真实练习中：若你在后续同域题目上同样在这个干扰项出错，系统即确认此归因并出具完整诊断。
                </p>
              </div>
            )}

            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule" />候选错因（其余错误选项对应的典型误区）
            </p>
            <div className="space-y-2.5">
              {(analysis?.analysis ?? []).filter((a) => a.option !== analysis?.primary?.option).map((a) => (
                <div key={a.option} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line-2 bg-white px-4 py-3 text-sm text-ink-2">
                  <span className="grid size-6 flex-none place-items-center rounded-full border border-line text-xs font-bold">{a.option}</span>
                  <span className="font-medium">{a.option_text}</span>
                  <span className="ml-auto"><CategoryTag category={a.category} /></span>
                </div>
              ))}
            </div>

            <p className="mb-3 mt-6 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule gold" />衔接追问 · 若进入追问，系统将依次提出（真实练习中为交互对话）
            </p>
            <div className="space-y-3">
              {(analysis?.followups ?? []).map((f, i) => (
                <div key={i} className="rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-3 text-sm">
                  <p className="text-[11px] font-semibold text-ink-3 mb-1">第 {i + 1} 轮追问</p>
                  <p className="leading-relaxed">{f.question_text}</p>
                  {f.options && (
                    <p className="mt-1.5 text-xs text-ink-3">选项：{f.options.map((o) => `${o.key}. ${o.text}`).join('　')}</p>
                  )}
                </div>
              ))}
              {(analysis?.followups ?? []).length === 0 && (
                <p className="text-xs text-ink-3">该错因暂无预置追问，将直接进入靶向训练。</p>
              )}
            </div>

            <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
          </div>
        </motion.div>
      )}

      {/* 追问对话记录：始终展示，提交后不随 followup 清空而整体消失 */}
      {!diagnosis.is_correct && diagnosis.followup_count > 0 && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="size-2 rounded-full bg-primary" />定向追问记录 · 定位你的理解缺口
          </p>
          <div className="space-y-3">
            {diagnosis.turns.map((t, i) => (
              <div key={i} className={`flex ${t.who === 'student' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4.5 py-3 text-sm leading-relaxed
                  ${t.who === 'ai' ? 'rounded-tl-sm bg-paper text-ink border border-line-2' : 'rounded-tr-sm bg-primary text-white'}`}>
                  {t.who === 'ai' && <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-ink-3">
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-white"><Pill size={9} weight="fill" /></span>药知</span>}
                  {t.text}
                </div>
              </div>
            ))}
          </div>
          {/* 追问已结束：明确给出 AI 结论，而不是让整段对话消失 */}
          {!diagnosis.followup && diagnosis.card && (
            <div className="mt-4 rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              {diagnosis.card.evidence_level === '高'
                ? `追问已坐实归因「${diagnosis.card.misconception.category}」，证据等级提升为 高，可据此开具靶向训练。`
                : `已根据你前 ${diagnosis.followup_count} 轮回答完成追问，当前归因维持为「${diagnosis.card.misconception.category}」，证据等级：低。可据此开具靶向训练，或稍后再细化。`}
            </div>
          )}
        </motion.div>
      )}

      {/* 进行中的追问问题 + 作答 */}
      {!diagnosis.is_correct && showFollowup && diagnosis.followup && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="size-2 rounded-full bg-primary breath" />药知向你提问
            </p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diagnosis.followup.turn_max }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < diagnosis.followup_count + 1 ? 'bg-primary' : 'bg-line'}`} />
              ))}
              <span className="ml-1 text-xs text-ink-3">第 {diagnosis.followup_count + 1} / {diagnosis.followup.turn_max} 轮</span>
            </div>
          </div>
          <div className="mb-6 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-primary/40 bg-primary-soft px-4.5 py-3">
              <p className="display text-[15px] leading-relaxed">{diagnosis.followup.question_text}</p>
            </div>
          </div>
          {diagnosis.followup.options ? (
            <div className="space-y-2.5">
              {diagnosis.followup.options.map((o) => (
                <motion.button key={o.key} disabled={answering} whileTap={{ scale: 0.99 }} onClick={() => answer(o.key)}
                  className="btn !justify-start w-full rounded-2xl border border-line bg-white px-5 py-3.5 text-left text-sm hover:border-primary hover:bg-primary-soft">
                  <span className="mr-3 grid size-7 flex-none place-items-center rounded-full border border-line text-xs font-bold text-ink-2">{o.key}</span>
                  {o.text}
                </motion.button>
              ))}
            </div>
          ) : (
            <OpenAnswer onAnswer={() => answer()} disabled={answering} />
          )}
          <div className="mt-5 flex items-center gap-3">
            <button onClick={skip} disabled={answering}
              className="btn items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
              <SkipForward size={13} />跳过追问，维持低证据归因
            </button>
            <button onClick={() => setShowFollowup(false)}
              className="btn text-[13px] text-ink-3 hover:text-ink">收起追问</button>
          </div>
        </motion.div>
      )}

      {!diagnosis.is_correct && diagnosis.card?.can_refine && !showFollowup && diagnosis.followup && (
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowFollowup(true)}
          className="btn card w-full items-center gap-3 p-5 text-left hover:shadow-[var(--shadow-lg)]">
          <span className="grid size-9 flex-none place-items-center rounded-xl bg-gold-soft font-serif font-bold text-gold">问</span>
          <span>
            <span className="block text-sm font-medium">追问对话 · 进一步定位你的理解缺口</span>
            <span className="block text-xs text-ink-3 mt-0.5">证据等级为低——回答几个定向问题，可将归因细化到高证据（可选，最多 3 轮）</span>
          </span>
          <ArrowRight size={15} className="ml-auto text-ink-3" />
        </motion.button>
      )}

      {!diagnosis.is_correct && diagnosis.card && (
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
            {diagnosis.followup_count > 0 && !diagnosis.card.can_refine && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}
                className="mb-5 flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-2.5 text-[13px] text-ink-2">
                  {diagnosis.card.evidence_level === '高'
                    ? `证据已足够，归因收敛为「${diagnosis.card.misconception.category}」，证据等级提升为 高。`
                    : `追问已完成。当前归因维持为「${diagnosis.card.misconception.category}」，证据等级：低——稍后可再来细化。`}
                </div>
              </motion.div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <CategoryTag category={diagnosis.card.misconception.category} />
              <p className="text-[17px] font-bold text-ink">{diagnosis.card.misconception.name}</p>
            </div>

            {diagnosis.card.ai_rationale && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft/70 px-5 py-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-wide text-primary">
                  <Sparkle size={14} weight="fill" />AI 导师临床归因剖析 · 大模型智能推理
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                  {diagnosis.card.ai_rationale}
                </p>
                <p className="mt-2 text-[11px] text-ink-3">
                  由 Qwen 3.7 Flash 基于题干考点、选项药理机制与作答思维链深度比对生成
                </p>
              </motion.div>
            )}

            {diagnosis.card.case_evidence && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className="mt-4 rounded-2xl border-2 border-gold/25 bg-gold-soft/40 px-5 py-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gold">
                  <Pill size={13} weight="fill" />临床案例 · 帮你记住这个错因
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink">{diagnosis.card.case_evidence.scenario}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-ink">记：</span>{diagnosis.card.case_evidence.lesson}
                </p>
                <p className="mt-2 text-[11px] text-ink-3">来源 · {diagnosis.card.case_evidence.source}</p>
              </motion.div>
            )}
            <hr className="rx-divider my-6" />
            <div className="mb-3.5 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
                <span className="capsule gold" />归因依据（证据链）
              </p>
              <button onClick={() => setShowEvidence(!showEvidence)}
                className="btn rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
                {showEvidence ? '收起证据' : '展开证据'}
              </button>
            </div>
            {showEvidence && <div className="space-y-3.5">
              {diagnosis.card.evidences.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.15 + i * 0.08 }}
                  className="rounded-xl bg-paper px-5 py-3.5 text-sm">
                  <p className="mb-0.5 text-xs text-ink-3">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                  <p className="leading-relaxed text-ink-2">{e.content}</p>
                </motion.div>
              ))}
            </div>}

            {diagnosis.card.alternatives && diagnosis.card.alternatives.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-ink-3">候选错因</p>
                <div className="space-y-2">
                  {diagnosis.card.alternatives.map((a) => (
                    <div key={a.code}
                      className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm
                        ${a.primary ? 'border-primary/40 bg-primary-soft' : 'border-line-2 bg-white text-ink-2'}`}>
                      <span className={a.primary ? 'font-medium' : ''}>{a.name}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold
                        ${a.primary ? 'bg-primary text-white' : 'bg-paper-2 text-ink-3'}`}>
                        {a.primary ? '主要' : '次要'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-ink-3">
              这个诊断符合你的情况吗？
              <button onClick={() => { api.feedback(diagnosis.session_id, true).catch(() => {}); setFeedback('matches') }}
                disabled={feedback !== null}
                className={`btn rounded-full border px-3 py-1.5 ${feedback === 'matches' ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:border-primary'}`}>
                <CheckCircle size={12} />归因与我相符
              </button>
              <button onClick={() => { api.feedback(diagnosis.session_id, false).catch(() => {}); setFeedback('not_matches') }}
                disabled={feedback !== null}
                className={`btn rounded-full border px-3 py-1.5 ${feedback === 'not_matches' ? 'border-gold bg-gold text-white' : 'border-line bg-white hover:border-gold'}`}>
                <Warning size={12} />与我并不相符
              </button>
            </div>

            {diagnosis.state === 'diagnosed' && (
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={onStartTraining} className="btn btn-primary">
                  按此诊断开具靶向训练<ArrowRight size={15} weight="bold" />
                </button>
                {onAskAi && diagnosis.card && (
                  <button
                    onClick={() => {
                      const card = diagnosis.card
                      if (!card) return
                      const ctx = `错因诊断卡：
类别：${card.misconception.category}
错因：${card.misconception.name}
证据等级：${card.evidence_level}
${card.ai_rationale ? `AI 归因剖析：${card.ai_rationale}` : ''}
${card.case_evidence ? `临床案例：${card.case_evidence.scenario} (要点：${card.case_evidence.lesson})` : ''}`
                      onAskAi(ctx, `我想进一步了解「${card.misconception.name}」相关的药理机制与典型考题辨析，请结合临床案例为我深度拆解。`, questionId)
                    }}
                    className="btn rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300"
                  >
                    <ChatCircleText size={16} weight="bold" className="text-sky-500" />
                    💬 针对此错因向 AI 追问
                  </button>
                )}
                <button onClick={onExit} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm text-ink-2 transition hover:border-primary hover:text-primary">
                  稍后训练，返回待办
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

export function Stamp({ level }: { level: string }) {
  const color = level === '高' ? 'var(--color-ok)' : level === '中' ? 'var(--color-primary)' : 'var(--color-warn)'
  const dots = level === '高' ? 3 : level === '中' ? 2 : 1
  return (
    <div className="flex flex-col items-end gap-1.5">
      <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.92 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
        className="stamp text-[13px]" style={{ color }}>
        证据<br />{level}
      </motion.span>
      <span className="flex items-center gap-1" title={`证据等级 ${level}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 rounded-full"
            style={{ background: i < dots ? color : 'var(--color-line)' }} />
        ))}
      </span>
    </div>
  )
}

export function OpenAnswer({ onAnswer, disabled }: { onAnswer: () => void; disabled: boolean }) {
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
