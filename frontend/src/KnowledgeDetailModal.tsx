import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Pill, BookOpenText, Sparkle, Warning, ChatCircleText,
  BookmarkSimple, ArrowsLeftRight, Check
} from '@phosphor-icons/react'
import { api, type KnowledgePointDetail } from './api'
import { highlightPharmacyKeywords } from './pharmacyHighlight'

interface Props {
  userId: string
  chapterNo: number
  pointName: string
  domainId?: string
  onClose: () => void
  onAskAi?: (context: string, defaultQuestion?: string) => void
}

export function KnowledgeDetailModal({
  userId,
  chapterNo,
  pointName,
  domainId,
  onClose,
  onAskAi,
}: Props) {
  const [data, setData] = useState<KnowledgePointDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .knowledgeDetail(userId, chapterNo, pointName, domainId)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err) => {
        if (!cancelled) setError(String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
    }
  }, [userId, chapterNo, pointName, domainId, onClose])

  const handleAskTutor = () => {
    if (!data || !onAskAi) return
    const ctx = `知识点：${data.point_name}（第 ${data.chapter_no} 章 · ${data.chapter_title}）
代表药物：${data.representative_drugs.join('、')}
核心机制：${data.core_mechanism}
临床应用：${data.clinical_applications.join('；')}
安全警示/禁忌：${data.cautions_and_adverse}
${data.related_confusions.length > 0 ? `易混药物辨析：${data.related_confusions.map((c) => `${c.drug_a} vs ${c.drug_b} (${c.distinction})`).join('；')}` : ''}`
    
    const defaultQ = `请帮我深入剖析【${data.point_name}】的药理机制推导与典型临床考点，有哪些容易混淆的陷阱和快速记忆口诀？`
    onAskAi(ctx, defaultQ)
    onClose()
  }

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* 背景遮罩 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink/50 backdrop-blur-xs z-0"
        />

        {/* 弹窗主体 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="relative z-10 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden rounded-[28px] border border-line bg-white shadow-2xl my-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 顶栏卡头 */}
          <div className="shrink-0 border-b border-line-2 bg-paper/90 backdrop-blur-md px-6 py-4 sm:px-8">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    第 {chapterNo} 章 · 知识点详解
                  </span>
                  {data?.chapter_title && (
                    <span className="text-xs text-ink-3">
                      {data.chapter_title}
                    </span>
                  )}
                </div>
                <h3 className="display text-xl sm:text-2xl font-bold text-ink">
                  {pointName}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="grid size-8 place-items-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink transition"
                title="关闭"
              >
                <X size={18} weight="bold" />
              </button>
            </div>
          </div>

          {/* 内容展示区 */}
          <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8 space-y-6">
            {loading && (
              <div className="space-y-4 py-8">
                <div className="skeleton h-8 w-1/3" />
                <div className="skeleton h-24 w-full" />
                <div className="skeleton h-20 w-full" />
                <p className="text-center text-xs text-ink-3">正在调取人卫第 9 版教材切片与药理考点精讲…</p>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
                <p className="text-sm font-medium text-rose-700">知识点详情加载失败：{error}</p>
                <button onClick={onClose} className="btn btn-primary mt-4 !px-4 !py-2 text-xs">
                  关闭
                </button>
              </div>
            )}

            {data && !loading && (
              <>
                {/* 代表药物 */}
                {data.representative_drugs.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink-3 uppercase tracking-wider mb-2">
                      <Pill size={14} weight="fill" className="text-primary" />
                      代表药物 / 关键活性物
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {data.representative_drugs.map((d, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-xl border border-primary/25 bg-primary-soft/50 px-3 py-1 text-xs font-semibold text-primary"
                        >
                          <Check size={12} weight="bold" />
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 核心机制与药理效应 */}
                <div className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-5">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-primary mb-2">
                    <Sparkle size={15} weight="fill" />
                    核心药理机制与器官效应
                  </h4>
                  <p className="text-xs sm:text-sm leading-relaxed text-ink whitespace-pre-line font-medium">
                    {highlightPharmacyKeywords(data.core_mechanism)}
                  </p>
                </div>

                {/* 临床应用 */}
                {data.clinical_applications.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink-3 uppercase tracking-wider mb-2.5">
                      <BookmarkSimple size={15} weight="fill" className="text-gold" />
                      临床应用与治疗适应证
                    </h4>
                    <div className="space-y-2">
                      {data.clinical_applications.map((app, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2.5 rounded-xl border border-line-2 bg-paper/40 p-3 text-xs sm:text-sm"
                        >
                          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gold-soft text-[10px] font-bold text-gold">
                            {i + 1}
                          </span>
                          <span className="text-ink leading-relaxed font-medium">{highlightPharmacyKeywords(app)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 不良反应与用药警示/禁忌 */}
                {data.cautions_and_adverse && (
                  <div className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-5 dark:border-amber-500/20 dark:bg-amber-950/20">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-amber-800 dark:text-amber-300 mb-2">
                      <Warning size={15} weight="fill" />
                      不良反应与用药禁忌红线
                    </h4>
                    <p className="text-xs sm:text-sm leading-relaxed text-amber-950 dark:text-amber-200 font-medium">
                      {highlightPharmacyKeywords(data.cautions_and_adverse)}
                    </p>
                  </div>
                )}

                {/* 趣味药理记忆口诀 */}
                {data.mnemonic && (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4.5 dark:border-teal-800 dark:bg-teal-950/20">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">
                      💡 药理速记口诀
                    </p>
                    <p className="text-xs sm:text-sm font-semibold tracking-wide text-teal-900 dark:text-teal-200 italic">
                      “{data.mnemonic}”
                    </p>
                  </div>
                )}

                {/* 高频易混用药辨析 */}
                {data.related_confusions.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink-3 uppercase tracking-wider mb-2.5">
                      <ArrowsLeftRight size={15} weight="bold" className="text-primary" />
                      高频易混用药鉴别与对比
                    </h4>
                    <div className="space-y-2.5">
                      {data.related_confusions.map((cp, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-line-2 bg-white p-4 shadow-2xs"
                        >
                          <p className="text-xs font-bold text-ink">
                            <span className="text-primary font-semibold">{cp.drug_a}</span>
                            <span className="mx-2 text-ink-3">vs</span>
                            <span className="text-gold font-semibold">{cp.drug_b}</span>
                          </p>
                          <div className="mt-1.5 text-xs leading-relaxed text-ink-2 pl-2 border-l-2 border-gold/50 font-medium">
                            {highlightPharmacyKeywords(cp.distinction)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 人卫 9 版教材原书权威锚点 */}
                {data.textbook_anchors.length > 0 && (
                  <div>
                    <h4 className="flex items-center gap-1.5 text-xs font-bold text-ink-3 uppercase tracking-wider mb-2.5">
                      <BookOpenText size={15} weight="fill" className="text-primary" />
                      人卫第 9 版《药理学》教材原文出处
                    </h4>
                    <div className="space-y-2">
                      {data.textbook_anchors.map((anc, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-line-2 bg-paper/60 p-3.5 text-xs"
                        >
                          <p className="font-semibold text-primary mb-1">
                            {anc.source || `教材第 ${anc.chapter || chapterNo} 章 · P${anc.book_page || '—'}`}
                          </p>
                          <div className="leading-relaxed text-ink-2 whitespace-pre-line pl-2 border-l-2 border-primary/40 font-medium">
                            “{highlightPharmacyKeywords(anc.text)}”
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* 底栏操作区 */}
          <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-line-2 bg-paper/60 px-6 py-4 sm:px-8">
            {onAskAi && data ? (
              <button
                type="button"
                onClick={handleAskTutor}
                className="btn inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-5 py-2.5 text-xs sm:text-sm font-semibold text-sky-700 transition hover:bg-sky-500/20 active:scale-[0.98] dark:text-sky-300"
              >
                <ChatCircleText size={16} weight="bold" className="text-sky-500" />
                💬 针对此知识点向 AI 导师提问
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary !rounded-full !px-6 !py-2.5 text-xs sm:text-sm"
            >
              已掌握，关闭卡片
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  )
}
