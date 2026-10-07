import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BookmarkSimple } from '@phosphor-icons/react'
import { api, type Question } from '../api'
import { useToast } from '../Toast'
import { spring, type PortraitResult } from '../lib/shared'
export function Assessment({ userId, onDone, onError, onBack }: {
  userId: string; onDone: (r: PortraitResult) => void; onError: (m: string) => void; onBack: () => void
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const toast = useToast()

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => { api.assessment(userId).then((r) => setQuestions(r.questions)).catch((e) => onError(String(e))) }, [userId])

  async function submit() {
    if (!questions) return
    setSubmitting(true)
    try {
      const r = await api.submitAssessment(userId, answers)
      onDone(r as PortraitResult)
    } catch (e) { onError(String(e)) } finally { setSubmitting(false) }
  }

  const toggleFlag = (qid: string, idx: number) => {
    setFlagged((prev) => {
      const next = !prev[qid]
      if (next) toast.warning(`已将第 ${idx + 1} 题标记为存疑题目`)
      else toast.info(`已取消第 ${idx + 1} 题存疑标记`)
      return { ...prev, [qid]: next }
    })
  }

  const answered = Object.keys(answers).length
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mx-auto w-full max-w-[860px] pt-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 4 · 摸底测试</p>
        <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-3 transition hover:bg-paper-2 hover:text-ink-2">
          <ArrowRight size={12} className="rotate-180" />返回上一步
        </button>
      </div>
      <h2 className="display mt-2 text-[26px]">先摸个底，看看你现在的位置</h2>
      <p className="mt-2 text-sm text-ink-2">
        {questions ? `${questions.length} 道题，约 8 分钟。` : '加载中…'}
        不确定可以凭直觉选——摸底的目的就是暴露薄弱点，答错完全不影响成绩。
      </p>

      {!questions && <div className="mt-7 space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>}

      {questions && (
        <div className="mt-7 space-y-5">
          {questions.map((q, i) => (
            <div key={q.id} id={`assess-q-${i}`} className="card scroll-mt-28 p-6">
              <div className="mb-3 flex items-center justify-between text-xs text-ink-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-primary-soft font-serif font-bold text-primary">{i + 1}</span>
                  <span className="font-semibold">{q.code}</span>
                  {q.chapter_name && (
                    <span className="rounded-full border border-line-2 px-2.5 py-0.5 text-[11px]">{q.chapter_name}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggleFlag(q.id, i)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
                    flagged[q.id]
                      ? 'bg-cat-orange-soft text-cat-orange border border-cat-orange/30'
                      : 'text-ink-3 hover:text-ink bg-paper-2'
                  }`}
                  title="标记本题存疑"
                >
                  <BookmarkSimple size={12} weight={flagged[q.id] ? 'fill' : 'regular'} className={flagged[q.id] ? 'text-cat-orange' : ''} />
                  {flagged[q.id] ? '已存疑' : '标记存疑'}
                </button>
              </div>
              <p className="mb-4 text-[15px] font-medium leading-relaxed">{q.stem}</p>
              <div className="space-y-2.5">
                {q.options.map((o) => (
                  <motion.button key={o.key} whileTap={{ scale: 0.99 }} aria-pressed={answers[q.id] === o.key}
                    onClick={() => setAnswers({ ...answers, [q.id]: o.key })}
                    className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                      ${answers[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                    <span className="relative z-10 flex items-center gap-3">
                      <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                        ${answers[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>{o.key}</span>
                      <span className={answers[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {questions && (
        <div className="sticky bottom-4 mt-6 flex justify-center">
          <div className="glass liquid relative flex flex-wrap items-center gap-3 rounded-full py-2 pl-4 pr-2 shadow-lg">
            {/* 快速题号跳卡 */}
            <div className="hidden sm:flex items-center gap-1 overflow-x-auto max-w-[260px] py-1 border-r border-line-2 pr-3">
              {questions.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={() => document.getElementById(`assess-q-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  className={`relative size-6 text-[10px] font-bold rounded-md flex items-center justify-center transition flex-none ${
                    answers[item.id]
                      ? 'bg-ok-soft text-ok border border-ok/30'
                      : 'bg-paper-2 text-ink-3 hover:bg-paper'
                  }`}
                  title={`第 ${idx + 1} 题${answers[item.id] ? '（已答）' : '（未答）'}${flagged[item.id] ? ' · 存疑待查' : ''}`}
                >
                  {idx + 1}
                  {flagged[item.id] && (
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-cat-orange ring-1 ring-white" />
                  )}
                </button>
              ))}
            </div>
            <span className="text-xs font-medium text-ink-2">
              已答 <span className={answered === questions.length ? 'font-bold text-ok' : 'font-bold text-ink'}>{answered}/{questions.length}</span>
              {answered < questions.length && (
                <span className="ml-1 text-[11px] text-ink-3">（还剩 {questions.length - answered} 题）</span>
              )}
            </span>
            <button
              onClick={submit}
              disabled={submitting || answered < questions.length}
              className="btn btn-primary !px-7 !py-2.5 shadow-[var(--shadow-lg)] disabled:opacity-50"
            >
              {submitting ? '分析并生成画像中…' : '交卷并生成画像'}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ---------- 第 5 步 · 摸底画像（诊断结论式：一句话结论 + 计数 + 错题清单，替代难读矩阵） ---------- */
