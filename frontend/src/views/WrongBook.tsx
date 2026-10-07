import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, ArrowRight, CaretDown, Pill, BookOpenText, ChatCircleText, Lightning, Hourglass, Sparkle, ShareNetwork, Printer } from '@phosphor-icons/react'
import { api, type Question } from '../api'
import { WrongBookExportModal } from '../WrongBookExportModal'
import { CategoryTag, EvidenceNote, NodeChip } from '../components/ui'
import { type KgEdgeT, type KgEvidence, type KgNodeT } from '../lib/shared'
import { KnowledgeGraphView } from './KnowledgeGraphView'
export type WrongRow = {
  attempt_id: string; question_id?: string; question_code: string; stem: string
  selected: string; answer: string
  misconception: { name: string; category: string } | null
  case_evidence?: { scenario: string; lesson: string; source: string } | null
  evidence_level: string | null
  retention_pct?: number
  decay_level?: 'fresh' | 'warning' | 'critical'
  days_since?: number
  stage?: number
  schedule_id?: string | null
}

/* 错题记忆卡（wrong/{id}/recall）：图谱 + 临床/教材助记 */

export type RecallData = {
  question: { code: string; stem: string; answer: string } | null
  misconception: { code: string; name: string; category: string } | null
  case_evidence: { scenario: string; lesson: string; source: string } | null
  evidence_level: string | null
  ai_rationale?: string | null
  relations: { source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note?: string; evidence?: KgEvidence; review_status?: string }[]
  confusion_pairs: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence; relevant?: boolean }[]
  textbook_anchors: { chapter: string; page: number; book_page: number; score: number; text: string; source_ref: string }[]
  trained: boolean
  linked_entities?: { name: string; type: string }[]
  subgraph?: { nodes: { name: string; type: string }[]; edges: RecallData['relations']; fallback: boolean }
}

export function WrongAwakenModal({
  userId,
  attemptId,
  onClose,
}: {
  userId: string
  attemptId: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    concept_name: string
    question: Question
    hint: string
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.awakenWrong(userId, attemptId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, attemptId])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-16 sm:pt-20 bg-black/60 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl max-h-[calc(100dvh-6rem)] my-auto flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        {/* 顶部处方笺式装饰头栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 bg-paper px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="capsule gold" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-gold">抗遗忘唤醒</span>
                <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">同源变式巩固</span>
              </div>
              <h3 className="display mt-0.5 text-base font-bold text-ink">
                {data?.concept_name ? `「${data.concept_name}」定向靶向唤醒` : '抗遗忘靶向巩固'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink-3 shadow-xs transition hover:bg-line-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* 主体内容（自适应垂直滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          {loading && (
            <div className="py-14 text-center">
              <div className="skeleton mx-auto mb-3 h-8 w-8 rounded-full" />
              <p className="text-xs font-medium text-ink-3">正在检索同章节变式题与药学辨析出处…</p>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-4">
              {/* 知识点提炼提示框（对齐处方笺风格） */}
              <div className="rounded-xl border border-line-2 bg-paper px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
                  <Pill size={13} weight="fill" />
                  临床机制与辨析提要
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  {data.hint}
                </p>
              </div>

              {/* 变式题目区 */}
              <div className="rounded-xl border border-line bg-[#FCFDFB] p-4.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    强化变式题 · {data.question.code}
                  </span>
                  <span className="text-xs text-ink-3">单项选择题</span>
                </div>
                <p className="text-[15px] font-medium leading-relaxed text-ink">
                  {data.question.stem}
                </p>

                {/* 选项列表 */}
                <div className="mt-4 space-y-2.5">
                  {data.question.options?.map((opt) => {
                    const isPicked = selected === opt.key
                    const showResult = submitted
                    const isCorrect = opt.key === (data.question as unknown as { answer?: string }).answer

                    let borderClass = 'border-line hover:border-primary/40 bg-white'
                    let textClass = 'text-ink'
                    let badgeClass = 'border border-line bg-paper-2 text-ink-2 font-medium'

                    if (isPicked && !showResult) {
                      borderClass = 'border-primary bg-primary-soft/40 shadow-xs ring-1 ring-primary/30'
                      textClass = 'text-primary font-medium'
                      badgeClass = 'bg-primary text-white font-bold'
                    } else if (showResult && isCorrect) {
                      borderClass = 'border-ok bg-ok-soft/50 ring-1 ring-ok/40'
                      textClass = 'text-ok font-semibold'
                      badgeClass = 'bg-ok text-white font-bold'
                    } else if (showResult && isPicked && !isCorrect) {
                      borderClass = 'border-red-300 bg-red-50 ring-1 ring-red-300'
                      textClass = 'text-red-700'
                      badgeClass = 'bg-red-500 text-white font-bold'
                    }

                    return (
                      <button
                        key={opt.key}
                        disabled={submitted}
                        onClick={() => setSelected(opt.key)}
                        className={`flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left text-xs transition ${borderClass}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${badgeClass}`}>
                          {opt.key}
                        </span>
                        <span className={`leading-relaxed ${textClass}`}>{opt.text}</span>
                        {showResult && isCorrect && (
                          <CheckCircle size={16} weight="fill" className="ml-auto shrink-0 text-ok" />
                        )}
                        {showResult && isPicked && !isCorrect && (
                          <XCircle size={16} weight="fill" className="ml-auto shrink-0 text-red-500" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 作答反馈提示 */}
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok-soft/60 p-3.5"
                >
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" />
                  <div>
                    <p className="text-xs font-bold text-ok">
                      唤醒作答已完成！神经元长时记忆突触已重新加固。
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                      错题记忆新鲜度已重置提升，系统将在下次临界衰退时主动提醒您。
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作条 */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line-2 bg-paper px-6 py-3.5">
          <button
            onClick={onClose}
            className="rounded-full border border-line bg-white px-4 py-2 text-xs font-medium text-ink-2 transition hover:bg-paper-2"
          >
            {submitted ? '返回错题本' : '稍后再做'}
          </button>
          {!submitted && (
            <button
              disabled={!selected}
              onClick={() => setSubmitted(true)}
              className="btn btn-primary rounded-full px-6 py-2 text-xs font-semibold disabled:opacity-40"
            >
              确认作答
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export function WrongBook({ userId, onGoTodo, onAskAi, onGoMap }: { userId: string; onGoTodo: () => void; onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void; onGoMap?: () => void }) {
  const [wrong, setWrong] = useState<WrongRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [awakenAttemptId, setAwakenAttemptId] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [recallMap, setRecallMap] = useState<Record<string, RecallData | null>>({})
  const [loadingRecall, setLoadingRecall] = useState<string | null>(null)
  const [wgraph, setWgraph] = useState<{
    nodes: KgNodeT[]; edges: KgEdgeT[]
    meta: Record<string, { attempt_ids?: string[] }>
    total: number; shown: number
  } | null>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  const loadWrongData = useCallback(() => {
    api.wrongBook(userId).then(setWrong).catch(() => setWrong([]))
    api.wrongGraph(userId).then(setWgraph).catch(() => setWgraph(null))
  }, [userId])

  useEffect(() => {
    loadWrongData()
  }, [loadWrongData])

  const toggleRecall = (attemptId: string) => {
    if (openId === attemptId) { setOpenId(null); return }
    setOpenId(attemptId)
    if (!recallMap[attemptId]) {
      setLoadingRecall(attemptId)
      api.wrongRecall(attemptId)
        .then((d) => setRecallMap((m) => ({ ...m, [attemptId]: d })))
        .catch(() => setRecallMap((m) => ({ ...m, [attemptId]: null })))
        .finally(() => setLoadingRecall(null))
    }
  }

  // 关联图谱点题节点 → 直接展开该错题记忆卡并滚到位置
  const openFromGraph = (name: string) => {
    const aid = wgraph?.meta?.[name]?.attempt_ids?.[0]
    if (!aid) return
    toggleRecall(aid)
    requestAnimationFrame(() => {
      document.getElementById(`wrong-${aid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold">错题本</p>
          <h2 className="display mt-2 text-[26px]">按错因归档的错题</h2>
          <p className="mt-2 text-sm text-ink-2">演示账号 {userId.slice(0, 8)} · 数据仅存于校内演示环境</p>
        </div>
        {wrong && wrong.length > 0 && (
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn btn-secondary flex items-center gap-2 border-gold/40 text-xs font-semibold shadow-sm hover:border-gold hover:bg-gold/5 transition"
          >
            <Printer size={16} className="text-gold" weight="bold" />
            一键导出考前必背小册 (PDF / A4)
          </button>
        )}
      </div>

      {wgraph && wgraph.nodes.length > 0 && (
        <section className="card mt-6 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />错题关联图谱 · 同章 / 同药 / 同错因的题自动连边</h3>
          <p className="mb-3 mt-1 text-xs text-ink-3">
            以错题为节点，章节·药物·错因为枢纽——连到同一枢纽的两道题，就是该一起复习的题。点击题节点可直接展开记忆卡。
            {wgraph.total > wgraph.shown && `（最近 ${wgraph.shown} 道，共 ${wgraph.total} 道）`}
          </p>
          <KnowledgeGraphView
            nodes={wgraph.nodes} edges={wgraph.edges}
            title="错题关联图谱"
            tabDefs={[
              { k: 'all', label: `全部 ${wgraph.edges.length}`, match: () => true },
              { k: 'know', label: '同知识', match: (e) => e.edge === '属于' || e.edge === '涉及' },
              { k: 'cause', label: '同错因', match: (e) => e.edge === '归因' },
            ]}
            labelTypes={new Set(['题目', '章节', '药物', '错因', '类别', '靶点'])}
            centerMode="degree"
            palette={{ 题目: '#0e7a5f', 章节: '#ffffff' }}
            onNodeClick={openFromGraph}
          />
        </section>
      )}

      <div className="mt-6 space-y-8">
        <section>
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />错题本 · 按错因归档</h3>
          {!wrong && <div className="skeleton h-20" />}
          {wrong && wrong.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="text-sm text-ink-2">错题本是空的：还没有答错的题，或者答错的题还没完成诊断。</p>
              <button onClick={onGoTodo} className="btn btn-primary">去今日待办做几道题<ArrowRight size={15} weight="bold" /></button>
            </div>
          )}
          {wrong && wrong.length > 0 && (
            <WrongGroups wrong={wrong} openId={openId}
              loadingRecall={loadingRecall} recallMap={recallMap} onToggle={toggleRecall}
              onAwaken={(aid) => setAwakenAttemptId(aid)} onAskAi={onAskAi} onGoMap={onGoMap} />
          )}
        </section>
      </div>

      {awakenAttemptId && (
        <WrongAwakenModal
          userId={userId}
          attemptId={awakenAttemptId}
          onClose={() => {
            setAwakenAttemptId(null)
            loadWrongData()
          }}
        />
      )}

      {showExportModal && (
        <WrongBookExportModal
          userId={userId}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </motion.div>
  )
}

/* 错题分组（按错因归档：同类错因归一组，可折叠；待归因沉底） */

export function WrongGroups({ wrong, openId, loadingRecall, recallMap, onToggle, onAwaken, onAskAi, onGoMap }: {
  wrong: WrongRow[]; openId: string | null; loadingRecall: string | null
  recallMap: Record<string, RecallData | null>; onToggle: (id: string) => void
  onAwaken: (attemptId: string) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
  onGoMap?: () => void
}) {
  const groups: { key: string; label: string | null; items: WrongRow[] }[] = []
  for (const w of wrong) {
    const key = w.misconception?.category ?? '待归因'
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, label: w.misconception?.category ?? null, items: [] }; groups.push(g) }
    g.items.push(w)
  }
  groups.sort((a, b) => (a.key === '待归因' ? 1 : 0) - (b.key === '待归因' ? 1 : 0))
  const [shut, setShut] = useState<Record<string, boolean>>({})
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const closed = !!shut[g.key]
        return (
          <section key={g.key}>
            <button onClick={() => setShut({ ...shut, [g.key]: !closed })} aria-expanded={!closed}
              title={closed ? '展开该类' : '收起该类'}
              className="mb-3 flex items-center gap-2 rounded-full py-0.5 pr-2 transition-opacity hover:opacity-80">
              {g.label
                ? <CategoryTag category={g.label} />
                : <span className="rounded-full bg-line-2 px-3.5 py-1.5 text-xs font-semibold text-ink-3">待归因</span>}
              <span className="text-xs text-ink-3">{g.items.length} 道</span>
              <CaretDown size={13} weight="bold" className={`text-ink-3 transition-transform duration-200 ${closed ? '-rotate-90' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {!closed && (
                <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden">
                  <div className="space-y-3">
                    {g.items.map((w) => (
                      <div key={w.attempt_id} id={`wrong-${w.attempt_id}`} className="card scroll-mt-24 p-5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs text-ink-3">{w.question_code}</span>
                          {w.evidence_level && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${w.evidence_level === '低' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                              证据 · {w.evidence_level}
                            </span>
                          )}
                          {w.retention_pct !== undefined && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                w.decay_level === 'fresh'
                                  ? 'bg-ok-soft text-ok'
                                  : w.decay_level === 'warning'
                                  ? 'bg-cat-orange-soft text-cat-orange'
                                  : 'bg-cat-red-soft text-cat-red'
                              }`}
                            >
                              <Hourglass size={12} weight="fill" />
                              新鲜度 {w.retention_pct}% · {w.decay_level === 'fresh' ? '保鲜良好' : w.decay_level === 'warning' ? '遗忘警戒' : '衰退严重'}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-ink-3">
                            选 <span className="font-bold text-cat-red">{w.selected}</span>
                            <span className="mx-1 text-line">·</span>
                            正确 <span className="font-bold text-ok">{w.answer}</span>
                          </span>
                        </div>
                        <p className="mt-2.5 text-[15px] font-medium leading-relaxed">{w.stem}</p>
                        {w.misconception && <p className="mt-1.5 text-xs text-ink-2">归因：{w.misconception.name}</p>}
                        {w.case_evidence && (
                          <div className="mt-3 rounded-xl border border-line-2 bg-paper px-4 py-3">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
                              <Pill size={12} weight="fill" />临床案例 · 助记
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{w.case_evidence.scenario}</p>
                            <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">要点：{w.case_evidence.lesson}</p>
                            <p className="mt-1.5 text-[11px] text-ink-3">来源：{w.case_evidence.source}</p>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          <button onClick={() => onToggle(w.attempt_id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-3 transition hover:border-primary hover:text-primary">
                            <BookOpenText size={13} />
                            {openId === w.attempt_id ? '收起错因图谱 · 记忆助记' : '看这张错题的图谱 & 临床助记'}
                          </button>
                          {onGoMap && (
                            <button
                              type="button"
                              onClick={onGoMap}
                              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/60 px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
                              title="在全景知识图谱中定位该题所属药理章节与易混淆对"
                            >
                              <ShareNetwork size={13} weight="bold" />
                              在全景图谱中溯源
                            </button>
                          )}
                          <button
                            onClick={() => onAwaken(w.attempt_id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
                          >
                            <Lightning size={13} weight="fill" className="text-amber-500" />
                            ⚡ 一键抗遗忘唤醒
                          </button>
                          {onAskAi && (
                            <button
                              onClick={() => {
                                const ctx = `错题编码：${w.question_code}
题干：${w.stem}
学生选项：${w.selected}
正确答案：${w.answer}
${w.misconception ? `归因错因：${w.misconception.name} (${w.misconception.category || ''})` : ''}
${w.case_evidence ? `关联临床案例：${w.case_evidence.scenario} (要点：${w.case_evidence.lesson})` : ''}`
                                onAskAi(ctx, `请帮我深入剖析这道错题：我选了 ${w.selected}，正确答案是 ${w.answer}。请结合药理机制与临床考点分析我混淆了什么？`, w.question_id)
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300"
                            >
                              <ChatCircleText size={13} weight="bold" className="text-sky-500" />
                              💬 针对此题向 AI 追问
                            </button>
                          )}
                        </div>
                        {openId === w.attempt_id && (
                          <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-4">
                            {loadingRecall === w.attempt_id
                              ? <p className="text-xs text-ink-3">正在生成错题记忆卡…</p>
                              : !recallMap[w.attempt_id]
                                ? <p className="text-xs text-ink-3">记忆卡加载失败，请稍后再试。</p>
                                : <RecallCardView data={recallMap[w.attempt_id]!} />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
  )
}


/** 确定性分层轨道坐标：BFS 定层，子节点按父角扇形展开。返回 positions + angles（弧度）。
    规则：直连中心的药物统一移到外环整圆均分（内环只留结构节点，避免 40 点挤一环）。 */

export function RecallCardView({ data }: { data: RecallData }) {
  const rels = data.relations ?? []
  const cps = data.confusion_pairs ?? []
  const anchors = data.textbook_anchors ?? []
  const hasGraph = rels.length > 0
  // 条目列表只列与本题实体直连的边（子图加深到 2 跳后全量可达 40 条，全列即刷屏）
  const linkedNames = new Set((data.linked_entities ?? []).map((e) => e.name))
  const direct = rels.filter((r) => linkedNames.has(r.source.name) || linkedNames.has(r.target.name))
  const listRels = (direct.length ? direct : rels).slice(0, 8)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {data.misconception
          ? (<><CategoryTag category={data.misconception.category} /><span className="font-medium text-ink">{data.misconception.name}</span></>)
          : <span className="text-xs text-ink-3">尚未归因到四类错因（可回到作答流程完成诊断细化）</span>}
      </div>

      {data.ai_rationale && (
        <div className="rounded-xl border border-primary/25 bg-primary-soft/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
            <Sparkle size={13} weight="fill" />AI 导师临床归因剖析 · 大模型智能推理
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">{data.ai_rationale}</p>
        </div>
      )}

      {/* 知识关系图谱 */}
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <span className="capsule" />错因背后的知识关系图谱{!hasGraph && '（该章关系表待扩充）'}
        </p>
        {(data.linked_entities ?? []).length > 0 && (
          <p className="mt-1.5 text-[11px] text-ink-3">
            本题关联实体：{(data.linked_entities ?? []).map((e) => e.name).join(' · ')}
          </p>
        )}
        {hasGraph && (
          <KnowledgeGraphView
            nodes={data.subgraph?.nodes}
            edges={(data.subgraph?.edges?.length ? data.subgraph.edges : rels)}
            title={data.subgraph?.fallback ? '本章图谱（本题未链接到具体实体，展示全章）' : '错题子图 · 与本题相关的边（点击边查看出处）'}
          />
        )}
        {hasGraph ? (
          <div className="mt-2.5 space-y-2">
            {rels.length > listRels.length && (
              <p className="text-[10px] text-ink-3">子图共 {rels.length} 条关系，下仅列出与本题实体直接相关的 {listRels.length} 条，其余在上方交互图中查看。</p>
            )}
            {listRels.map((r, i) => (
              <div key={i} className="rounded-lg bg-paper/60 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <NodeChip type={r.source.type} name={r.source.name} />
                  <span className="text-[11px] font-medium text-primary">─{r.edge}→</span>
                  <NodeChip type={r.target.type} name={r.target.name} />
                </div>
                <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-3">这张题所属章节的知识关系表尚未铺开，正式内容由药理顾问标注后开放。</p>
        )}
      </div>

      {/* 易混药对 */}
      {cps.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-primary"><span className="capsule gold" />易混药对辨析</p>
          <div className="mt-2 space-y-1.5">
            {cps.map((p, i) => (
              <div key={i} className="rounded-lg bg-paper px-3 py-2 text-[12px] text-ink-2">
                <span className="font-semibold text-ink">{p.drug_a}</span> × <span className="font-semibold text-ink">{p.drug_b}</span>
                {p.relevant && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">与本题相关</span>}
                <p className="mt-0.5 leading-relaxed">{p.distinction}</p>
                <EvidenceNote ev={p.evidence ?? null} reviewStatus="published" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 教材记忆锚点 */}
      {anchors.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
            <Pill size={11} weight="fill" />教材依据 · 帮你想起来
          </p>
          <div className="mt-2 space-y-2">
            {anchors.map((a, i) => (
              <div key={i} className="rounded-lg border border-line-2 bg-paper px-3 py-2">
                <p className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-ink-3">
                  <span className="rounded bg-gold-soft px-1.5 py-0.5 font-bold text-gold">📖 教材 P{a.book_page || a.page}</span>
                  {a.chapter && <span>{a.chapter}</span>}
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasGraph && cps.length === 0 && anchors.length === 0 && (
        <p className="text-xs text-ink-3">这道题暂无可展示的图谱与教材助记（该章内容资产待扩充）。</p>
      )}
    </div>
  )
}
