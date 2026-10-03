import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Pill, Sparkle, X } from '@phosphor-icons/react'
import { api } from '../api'
import { type StudyNode } from '../lib/shared'
export function QuickQuizModal({
  userId,
  chapter,
  onClose,
  onSuccess,
  onAskAi,
}: {
  userId: string
  chapter: StudyNode
  onClose: () => void
  onSuccess: () => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  const [quiz, setQuiz] = useState<{ id: string; code: string; stem: string; options: { key: string; text: string }[] }[] | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [res, setRes] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setErrMsg(null)
    setRes(null)
    setPicks({})
    api.studyQuiz(userId, chapter.domain_id)
      .then((r) => {
        setQuiz(r.questions ?? [])
      })
      .catch((e) => setErrMsg(String(e)))
      .finally(() => setLoading(false))
  }, [userId, chapter.domain_id])

  async function handleSubmit() {
    if (!quiz || busy) return
    setBusy(true)
    try {
      const r = await api.submitStudyQuiz(userId, chapter.domain_id, picks)
      setRes({ passed: r.passed, correct: r.correct, total: r.total })
      if (r.passed) {
        onSuccess()
      }
    } catch (e) {
      setErrMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  const answeredCount = Object.keys(picks).length
  const totalCount = quiz?.length || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-3xl border border-line bg-white shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-paper-1/60">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Pill size={20} weight="duotone" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-bold text-primary">
                  随堂自测 · 3题速测
                </span>
                <span className="text-xs text-ink-3">第 {chapter.book_chapter_no ?? '—'} 章</span>
              </div>
              <h3 className="text-base font-black text-ink">{chapter.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink transition cursor-pointer"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="space-y-4 py-8">
              <div className="skeleton h-6 w-1/3" />
              <div className="skeleton h-20 w-full" />
              <div className="skeleton h-20 w-full" />
            </div>
          )}

          {errMsg && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              {errMsg}
            </div>
          )}

          {!loading && !errMsg && (!quiz || quiz.length === 0) && (
            <div className="py-12 text-center text-ink-3">
              <p className="text-sm font-semibold">该章节题库暂在编校中</p>
              <p className="mt-1 text-xs">建议直接查阅微观图谱或呼叫 AI 助教导读</p>
            </div>
          )}

          {!loading && quiz && quiz.length > 0 && !res && (
            <div className="space-y-6">
              {quiz.map((q, idx) => (
                <div key={q.id || idx} className="rounded-2xl border border-line-2 bg-paper-1/40 p-4">
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 flex-none place-items-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                      {idx + 1}
                    </span>
                    <p className="text-[13.5px] font-bold text-ink leading-relaxed">
                      {q.stem}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {q.options.map((opt) => {
                      const isPicked = picks[q.id] === opt.key
                      return (
                        <button
                          key={opt.key}
                          onClick={() => setPicks((p) => ({ ...p, [q.id]: opt.key }))}
                          className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-xs transition cursor-pointer ${
                            isPicked
                              ? 'border-primary bg-primary-soft/80 font-bold text-primary shadow-xs ring-1 ring-primary/40'
                              : 'border-line bg-white text-ink-2 hover:border-primary/40 hover:bg-paper-1'
                          }`}
                        >
                          <span
                            className={`grid size-5.5 flex-none place-items-center rounded-full text-[11px] font-black ${
                              isPicked ? 'bg-primary text-white' : 'bg-paper-2 text-ink-3'
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
            </div>
          )}

          {/* Quiz Result View */}
          {res && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-6 text-center space-y-4">
              <div className={`mx-auto grid size-16 place-items-center rounded-3xl ${res.passed ? 'bg-ok/10 text-ok' : 'bg-amber-500/10 text-amber-600'}`}>
                {res.passed ? <CheckCircle size={36} weight="fill" /> : <Sparkle size={36} weight="fill" />}
              </div>
              <div>
                <h4 className="text-xl font-black text-ink">
                  {res.passed ? '🎉 恭喜！随堂自测达标' : '随堂自测未达标，再接再厉'}
                </h4>
                <p className="mt-1 text-xs text-ink-2">
                  答对 <span className="font-bold text-ink">{res.correct}</span> / {res.total} 题
                  {res.passed ? ' · 知识星轨对应章节已实时点亮达标勋章！' : ' · 建议对照微观图谱复习或请助教答疑'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {onAskAi && (
                  <button
                    onClick={() => {
                      onClose()
                      onAskAi(`药理学 - ${chapter.title}`, `老师，我在${chapter.title}随堂测中有错题，请帮我讲解本章常考混淆点与机制`)
                    }}
                    className="btn rounded-xl border border-primary/30 bg-primary-soft/70 px-4 py-2 text-xs font-bold text-primary hover:bg-primary-soft cursor-pointer"
                  >
                    <Sparkle size={13} weight="fill" />
                    药学助教错因精讲
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="btn btn-primary rounded-xl px-5 py-2 text-xs font-bold shadow-sm cursor-pointer"
                >
                  返回全景驾驶舱
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer */}
        {!res && (
          <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-paper-1/40">
            <div className="text-xs text-ink-3">
              已作答 <span className="font-bold text-ink">{answeredCount}</span> / {totalCount} 题
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="btn rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs font-medium text-ink-2 hover:border-primary/40 cursor-pointer"
              >
                取消
              </button>
              <button
                disabled={answeredCount < totalCount || busy || totalCount === 0}
                onClick={handleSubmit}
                className="btn btn-primary rounded-xl px-5 py-2 text-xs font-bold shadow-sm disabled:opacity-40 cursor-pointer"
              >
                {busy ? '正在判卷与同步BKT...' : '提交判卷'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

/* 概览：药理全景交互驾驶舱 = 拓扑星轨主驾舱 + 实时智能监测巡航卡 */
