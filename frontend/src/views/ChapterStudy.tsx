import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, BookOpenText, Sparkle, ShareNetwork, ArrowsLeftRight } from '@phosphor-icons/react'
import { api } from '../api'
import { highlightPharmacyKeywords, splitClauses, splitDistinction } from '../pharmacyHighlight'
import { KnowledgeDetailModal } from '../KnowledgeDetailModal'
import { EvidenceNote, NodeChip } from '../components/ui'
import { spring, type KgEdgeT, type KgEvidence, type StudyNode } from '../lib/shared'
import { KnowledgeGraphView } from './KnowledgeGraphView'
export function ConfusionPairCard({ p }: { p: { drug_a: string; drug_b: string; distinction: string; evidence?: { source?: string; book_page?: number; chapter?: string; text?: string } | null } }) {
  const { partA, partB, single } = splitDistinction(p.distinction, p.drug_a, p.drug_b)

  return (
    <div className="rounded-2xl border border-line-2 bg-white/95 p-4 text-xs shadow-2xs hover:shadow-xs transition">
      {/* 标题栏：药物 A VS 药物 B */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-primary-soft/90 px-3 py-1 text-[12px] font-extrabold text-primary border border-primary/20">
            💊 {p.drug_a}
          </span>
          <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-black text-ink-3">
            VS
          </span>
          <span className="rounded-xl bg-amber-50 px-3 py-1 text-[12px] font-extrabold text-amber-800 border border-amber-200">
            💊 {p.drug_b}
          </span>
        </div>
        <span className="text-[11px] font-semibold text-ink-3">常考机制对比</span>
      </div>

      {/* 对比主体：分栏对比，两句话各自独立完整 */}
      {single ? (
        <div className="rounded-xl bg-paper-1/50 p-3 leading-relaxed text-ink-2 font-medium">
          {highlightPharmacyKeywords(single)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {/* 药 A 卡片 */}
          <div className="rounded-xl border border-primary/20 bg-primary-soft/20 p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-primary mb-1.5 text-[12.5px]">
                <span className="size-2 rounded-full bg-primary" />
                <span>【{p.drug_a}】机制与临床特征</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-2 font-medium">
                {highlightPharmacyKeywords(partA)}
              </p>
            </div>
          </div>

          {/* 药 B 卡片 */}
          <div className="rounded-xl border border-amber-300/50 bg-amber-50/40 p-3.5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1.5 text-[12.5px]">
                <span className="size-2 rounded-full bg-amber-600" />
                <span>【{p.drug_b}】机制与临床特征</span>
              </div>
              <p className="text-xs leading-relaxed text-ink-2 font-medium">
                {highlightPharmacyKeywords(partB)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 教材权威依据 */}
      {p.evidence && p.evidence.text && (
        <div className="mt-3">
          <EvidenceNote ev={p.evidence} />
        </div>
      )}
    </div>
  )
}

/* 单章学习内容 + 随堂摸底：真实呈现该章「知识点图谱」，不伪造未整理内容 */

export function ChapterStudy({ userId, node, goal, onError, onDone, onAskAi }: {
  userId: string; node: StudyNode; goal: string; onError: (m: string) => void
  onDone: (passed: boolean, score: number, total: number) => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  type Detail =
    | { source: 'seed'; graph: { chain: { level: number; title: string; summary: string }[]; relations: { source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note?: string; evidence?: KgEvidence; review_status?: string }[]; confusion: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[] } }
    | { source: 'syllabus'; chapter: { no: number; title: string; objectives: Record<string, string[]> | Record<string, string>; key_points: string[]; difficulties: string[]; sections: { title: string; points: string[] }[] }; relations?: KgEdgeT[]; confusion?: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[] }
    | { source: 'none'; chapter: null }
  const [detail, setDetail] = useState<Detail | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<{ id: string; code: string; stem: string; options: { key: string; text: string }[] }[] | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [res, setRes] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [node.domain_id])
  useEffect(() => {
    setDetail(null); setQuiz(null); setRes(null); setPicks({})
    api.studyDetail(userId, node.domain_id).then(setDetail).catch((e) => onError(String(e)))
    api.studyQuiz(userId, node.domain_id).then((r) => setQuiz(r.questions ?? [])).catch((e) => onError(String(e)))
  }, [userId, node.domain_id])

  async function submit() {
    if (!quiz || busy) return
    setBusy(true)
    try {
      const r = await api.submitStudyQuiz(userId, node.domain_id, picks)
      setRes({ passed: r.passed, correct: r.correct, total: r.total })
      if (r.passed) onDone(true, r.correct / r.total, r.total)
      else onDone(false, 0, r.total)
    } catch (e) { onError(String(e)) } finally { setBusy(false) }
  }

  const answered = Object.keys(picks).length
  return (
    <motion.div key={`cs-${node.domain_id}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">第 {node.book_chapter_no ?? '—'} 章</span>
        <h2 className="display text-[22px]">{node.title}</h2>
        {node.studied?.passed && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ok-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-ok"><CheckCircle size={12} weight="fill" />已达标</span>}
      </div>
      <p className="mt-1 text-sm text-ink-2">{goal} · 本章知识点图谱 → 学完再做随堂摸底</p>

      {/* 学习内容 */}
      <div className="mt-5 space-y-4">
        {!detail && <div className="skeleton h-48" />}

        {detail?.source === 'seed' && (
          <div className="spot-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-black text-ink">
                <span className="capsule gold" />
                药理顾问深度推演链 · 六环递进结构
              </p>
              <span className="rounded-full bg-gold/15 border border-gold/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                ★ 专家精编考点链
              </span>
            </div>

            {/* 六环递进推演卡片 */}
            <div className="space-y-3">
              {detail.graph.chain.map((c, i) => {
                const clauses = splitClauses(c.summary)
                const levelColors = [
                  'border-blue-300 bg-blue-50 text-blue-800',
                  'border-cyan-300 bg-cyan-50 text-cyan-800',
                  'border-sky-300 bg-sky-50 text-sky-800',
                  'border-emerald-300 bg-emerald-50 text-emerald-800',
                  'border-amber-300 bg-amber-50 text-amber-900',
                  'border-rose-300 bg-rose-50 text-rose-800',
                ]
                const levelBadge = levelColors[c.level - 1] || 'border-primary/30 bg-primary-soft text-primary'

                return (
                  <div key={c.level} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`grid size-8 flex-none place-items-center rounded-xl border text-xs font-black shadow-2xs ${levelBadge}`}>
                        L{c.level}
                      </span>
                      {i < detail.graph.chain.length - 1 && <span className="w-0.5 flex-1 bg-line-2 my-1" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="rounded-2xl border border-line-2 bg-paper-1/40 hover:bg-paper-1/80 transition p-3.5 shadow-2xs">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[13.5px] font-black text-ink">{c.title}</p>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10.5px] font-bold text-ink-3 border border-line">
                            第 {c.level} 环
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {clauses.length > 1 ? (
                            clauses.map((clause, ci) => (
                              <div key={ci} className="flex items-start gap-2 text-xs leading-relaxed text-ink-2 bg-white/85 rounded-xl p-2.5 border border-line-2 shadow-3xs">
                                <span className="size-1.5 rounded-full bg-primary/70 mt-1.5 flex-none" />
                                <div className="flex-1 font-medium">{highlightPharmacyKeywords(clause)}</div>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs leading-relaxed text-ink-2 bg-white/85 rounded-xl p-2.5 border border-line-2 font-medium shadow-3xs">
                              {highlightPharmacyKeywords(c.summary)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 药效关系图谱与教材出处卡片 */}
            {detail.graph.relations.length > 0 && (
              <div className="mt-6 border-t border-dashed border-line pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-black text-ink flex items-center gap-2">
                    <ShareNetwork size={16} className="text-primary" />
                    药效微观关系图谱（源—边→目标，含人卫教材精确出处）
                  </p>
                  <span className="text-[11px] text-ink-3">共 {detail.graph.relations.length} 条已审校药理关系</span>
                </div>
                <KnowledgeGraphView edges={detail.graph.relations} />
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {detail.graph.relations.map((r, i) => (
                    <div key={i} className="rounded-2xl border border-line-2 bg-white p-3 shadow-2xs hover:border-primary/40 transition">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <NodeChip type={r.source.type} name={r.source.name} />
                        <span className="rounded-full bg-paper-2 px-2 py-0.5 font-bold text-ink-3">{r.edge}</span>
                        <NodeChip type={r.target.type} name={r.target.name} />
                      </div>
                      <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 种子域易混药物辨析 */}
            {detail.graph.confusion && detail.graph.confusion.length > 0 && (
              <div className="mt-6 border-t border-dashed border-line pt-5">
                <p className="mb-3 text-sm font-black text-ink flex items-center gap-1.5">
                  <ArrowsLeftRight size={15} weight="bold" className="text-primary" />
                  本章易混药对鉴别与机制深度辨析
                </p>
                <div className="space-y-3">
                  {detail.graph.confusion.map((p, i) => (
                    <ConfusionPairCard key={i} p={p} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {detail?.source === 'syllabus' && detail.chapter && (
          <div className="space-y-4">
            {/* 掌握目标 */}
            <div className="spot-card p-6">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />本章学习目标 · 按掌握深度分层</p>
              {(() => {
                const o = detail.chapter.objectives || {}
                const labels: [string, string, string][] = [
                  ['master', '掌握', 'bg-primary-soft text-primary'],
                  ['familiar', '熟悉', 'bg-gold-soft text-gold'],
                  ['understand', '了解', 'bg-paper-2 text-ink-3'],
                ]
                return (
                  <div className="space-y-2.5">
                    {labels.map(([k, lab, cl]) => {
                      const items = o[k]
                      if (!items || (Array.isArray(items) ? items.length === 0 : !String(items).trim())) return null
                      const arr = Array.isArray(items) ? items : String(items).split(/[；;\n]/).map((s) => s.trim()).filter(Boolean)
                      return (
                        <div key={k} className="flex gap-3">
                          <span className={`mt-0.5 h-fit flex-none rounded-md px-2 py-0.5 text-[11px] font-semibold ${cl}`}>{lab}</span>
                          <ul className="space-y-1 text-[13px] text-ink-2">
                            {arr.map((t, i) => <li key={i} className="leading-relaxed">{t}</li>)}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* 知识点树：章节 → 节 → 知识点 */}
            <div className="spot-card p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line-2 pb-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><span className="capsule" />知识点精讲图谱 · {detail.chapter.title}</p>
                <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  <Sparkle size={12} weight="fill" />
                  点击任意标签展开人卫 9 版教材精讲与机制卡片
                </span>
              </div>
              {detail.chapter.sections.length === 0 ? (
                <p className="text-[13px] text-ink-3">本章大纲暂未录入分节知识点（待内容化）。可先用下方题库随堂摸底，检验掌握度。</p>
              ) : (
                <div className="space-y-4">
                  {detail.chapter.sections.map((s, si) => (
                    <div key={si} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1 size-2.5 flex-none rounded-full bg-primary" />
                        {si < detail.chapter.sections.length - 1 && <span className="w-px flex-1 bg-line" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13.5px] font-semibold text-ink">{s.title}</p>
                        {(s.points ?? []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(s.points ?? []).map((p, pi) => (
                              <button
                                key={pi}
                                type="button"
                                onClick={() => setSelectedPoint(p)}
                                className="group inline-flex items-center gap-1.5 rounded-xl border border-line-2 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-all hover:border-primary/60 hover:bg-primary-soft/40 hover:text-primary active:scale-[0.98] shadow-2xs"
                                title="点击查看该知识点的核心机制、代表药、临床用途与人卫9版教材原文"
                              >
                                <BookOpenText size={13} className="text-primary/70 group-hover:text-primary" />
                                <span>{p}</span>
                                <span className="rounded bg-paper-2 px-1 text-[10px] text-ink-3 group-hover:bg-primary-soft group-hover:text-primary">
                                  精讲 ↗
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(detail.chapter.key_points.length > 0 || detail.chapter.difficulties.length > 0) && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-dashed border-line pt-4">
                  {detail.chapter.key_points.map((k, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedPoint(k)}
                      className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-semibold text-gold transition hover:opacity-80 active:scale-[0.98]"
                      title="点击查看重点精讲"
                    >
                      重点 · {k} ↗
                    </button>
                  ))}
                  {detail.chapter.difficulties.map((d2, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedPoint(d2)}
                      className="rounded-full bg-cat-red-soft px-3 py-1 text-[11px] font-semibold text-cat-red transition hover:opacity-80 active:scale-[0.98]"
                      title="点击查看难点精讲"
                    >
                      难点 · {d2} ↗
                    </button>
                  ))}
                </div>
              )}
              {(detail.relations ?? []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-line pt-4">
                  <p className="mb-2 text-[13px] font-semibold">本章知识图谱 · 章节—节—知识点—药物关系</p>
                  <KnowledgeGraphView edges={detail.relations ?? []} title="本章图谱 · 全部待顾问审校" />
                </div>
              )}
              {(detail.confusion ?? []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-line pt-4 space-y-3">
                  <p className="text-xs font-bold text-ink flex items-center gap-1.5 mb-2">
                    <ArrowsLeftRight size={14} className="text-primary" />
                    高频常考易混药对机制辨析与鉴别
                  </p>
                  {(detail.confusion ?? []).slice(0, 3).map((p, i) => (
                    <ConfusionPairCard key={i} p={p} />
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-ink-3">来源：校内《药理学》教学大纲（章节→节→知识点）+ 题库选项共现（药物归属/易混候选）。机制级关系由药理顾问逐章审校后补全，当前图谱为待审校 v1。</p>
            </div>
          </div>
        )}

        {detail?.source === 'none' && (
          <div className="spot-card p-6 text-sm text-ink-2">
            本章暂无整理的学习材料（顾问图谱待补）。可以直接做随堂摸底，用本章题目检验你的掌握情况。
          </div>
        )}
      </div>

      {/* 随堂摸底 */}
      <div className="mt-5 spot-card p-6">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />随堂摸底 · 检验学习程度</p>
        <p className="mb-4 text-xs text-ink-3">作答本章 3 道题，答对 ≥60% 即本章达标；未达可回看上方知识点后重试。</p>

        {res ? (
          <div className={`rounded-2xl border p-5 text-sm ${res.passed ? 'border-ok/40 bg-[var(--color-ok-soft)]' : 'border-cat-red/40 bg-[var(--color-cat-red-soft)]'}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              {res.passed
                ? <><CheckCircle size={16} weight="fill" className="flex-none text-ok" />本章达标（{res.correct}/{res.total}）</>
                : <><XCircle size={16} weight="fill" className="flex-none text-cat-red" />未通过（{res.correct}/{res.total}）</>}
            </p>
            <p className="mt-1 text-ink-2">{res.passed ? '很棒，本章知识点已掌握到可进入练习的程度。' : '还有薄弱点：回到上方知识点再看一遍，再试一次。'}</p>
          </div>
        ) : quiz && quiz.length > 0 ? (
          <div className="space-y-4">
            {quiz.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-5">
                <p className="mb-3 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setPicks({ ...picks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-2.5 text-left text-sm
                        ${picks[q.id] === o.key ? 'border-primary bg-primary-soft/50' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      <span className={`mr-2 inline-grid size-5 items-center justify-center rounded-full border text-[11px] font-bold
                        ${picks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                      {o.text}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submit} disabled={answered < quiz.length || busy} className="btn btn-primary">
              {busy ? '判分中…' : '提交摸底（已答 ' + answered + '/' + quiz.length + '）'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-2">本章暂无自测题，可直接进入正式摸底。</p>
        )}
      </div>

      {selectedPoint && (
        <KnowledgeDetailModal
          userId={userId}
          chapterNo={node.book_chapter_no || (detail && 'chapter' in detail && detail.chapter ? detail.chapter.no : 1) || 1}
          pointName={selectedPoint}
          domainId={node.domain_id}
          onClose={() => setSelectedPoint(null)}
          onAskAi={onAskAi}
        />
      )}
    </motion.div>
  )
}

/* 学习地图编排：目标后进入；默认停在总览，点章节进学习，学完回总览再决定进摸底 */
