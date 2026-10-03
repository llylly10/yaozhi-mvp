import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, ArrowRight, Sparkle } from '@phosphor-icons/react'
import { api, type Question } from '../api'
import { EvidenceNote, NodeChip } from '../components/ui'
import { spring, type KgEvidence, type StudyNode } from '../lib/shared'
import { ChapterStudy } from './ChapterStudy'
import { KnowledgeGraphView } from './KnowledgeGraphView'
export function ChapterWarmupCard({ userId, domainId }: { userId: string; domainId: string }) {
  const [warmup, setWarmup] = useState<{ has_warmup: boolean; title?: string; reason?: string; question?: Question } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ is_correct: boolean; correct_answer: string; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.chapterWarmup(userId, domainId).then(setWarmup).catch(() => setWarmup(null))
  }, [userId, domainId])

  if (!warmup || !warmup.has_warmup || !warmup.question) return null

  const q = warmup.question

  const handleSubmit = async () => {
    if (!picked) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.submitChapterWarmup(userId, domainId, {
        question_id: q.id,
        selected_option: picked,
      })
      setFeedback(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/25 bg-primary-soft/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-xs">
            <Sparkle size={13} weight="fill" />
          </span>
          <span className="text-xs font-bold text-primary">{warmup.title}</span>
        </div>
        {!expanded && !feedback && (
          <button
            onClick={() => setExpanded(true)}
            className="btn btn-primary rounded-full px-3.5 py-1 text-xs font-semibold shadow-xs"
          >
            做 1 道热身题唤醒记忆
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-2">{warmup.reason}</p>

      {expanded && !feedback && (
        <div className="mt-3.5 rounded-xl border border-line bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-3">热身微测：</p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{q.stem}</p>
          <div className="mt-3 space-y-1.5">
            {q.options?.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPicked(opt.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition ${
                  picked === opt.key
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-line hover:bg-card-hover'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  picked === opt.key ? 'bg-primary text-white' : 'border border-line text-ink-3'
                }`}>
                  {opt.key}
                </span>
                <span>{opt.text}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="btn rounded-full border border-line px-3.5 py-1 text-xs text-ink-3"
            >
              收起
            </button>
            <button
              disabled={!picked || submitting}
              onClick={handleSubmit}
              className="btn btn-primary rounded-full px-4 py-1 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? '提交中…' : '提交热身'}
            </button>
          </div>
          {error && <p className="mt-2 text-right text-xs text-red-600">{error}</p>}
        </div>
      )}

      {feedback && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-card p-3 text-xs">
          <span className="mt-0.5">{feedback.is_correct ? '🎉' : '💡'}</span>
          <div>
            <p className="font-semibold text-primary">
              {feedback.is_correct ? '回答正确！' : `参考答案：${feedback.correct_answer}`}
            </p>
            <p className="mt-0.5 text-ink-2">{feedback.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* 今日待办「进入学习 · 随堂自测」的统一入口：
 * 先查 study-map 明细判来源 —— 种子域（顾问深图谱）渲染 MaterialView；
 * 章节渲染 ChapterStudy（大纲知识点树 + 随堂自测 + 去本章练习），保证每个薄弱项
 * 都有对等的「学」内容可点，不再出现只有练、没有学的分组。 */

export function MaterialRoute({ userId, domainId, goal, onPractice, onBack, onError, onAskAi }: {
  userId: string; domainId: string; goal: string
  onPractice: (q: Question) => void; onBack: () => void; onError: (m: string) => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  type RouteDetail = {
    source: 'seed' | 'syllabus' | 'none'; is_seed: boolean
    domain_id: string; code: string; title: string; book_chapter_no: number | null
    chapter?: { title: string } | null
  }
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [qBusy, setQBusy] = useState(false)

  useEffect(() => {
    setDetail(null)
    window.scrollTo(0, 0)
    api.studyDetail(userId, domainId).then(setDetail).catch((e) => onError(String(e)))
  }, [userId, domainId])

  async function goPractice() {
    if (qBusy) return
    setQBusy(true)
    try {
      const list: Question[] = await api.questions()
      const q = list.find((x) => x.domain_id === domainId) ?? list[0]
      if (q) onPractice(q)
      else onError('该域暂无练习题，请从今日待办选择其他任务。')
    } catch (e) { onError(String(e)) } finally { setQBusy(false) }
  }

  if (!detail) return <div className="space-y-3 pt-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>

  if (detail.is_seed) {
    return (
      <div key={domainId}>
        <div className="mb-4">
          <button onClick={onBack}
            className="btn items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
            <ArrowRight size={12} className="rotate-180" />返回今日待办
          </button>
        </div>
        <ChapterWarmupCard userId={userId} domainId={domainId} />
        <MaterialView userId={userId} domainId={domainId} onError={onError}
          onPractice={onPractice} onBack={onBack} />
      </div>
    )
  }

  const node: StudyNode = {
    domain_id: detail.domain_id, code: detail.code, is_seed: false,
    title: detail.chapter?.title ?? detail.title,
    book_chapter_no: detail.book_chapter_no, source: detail.source,
    q_published: 0, objective: '', studied: null, mastery: null,
  }
  return (
    <motion.div key={`mr-${domainId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4">
        <button onClick={onBack}
          className="btn items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
          <ArrowRight size={12} className="rotate-180" />返回今日待办
        </button>
      </div>
      <ChapterWarmupCard userId={userId} domainId={domainId} />
      <ChapterStudy userId={userId} node={node} goal={goal} onError={onError} onDone={() => {}} onAskAi={onAskAi} />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={goPractice} disabled={qBusy} className="btn btn-primary">
          {qBusy ? '进入中…' : '学完了，去本章练习'}<ArrowRight size={15} weight="bold" />
        </button>
        <button onClick={onBack} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:border-primary hover:text-primary">
          返回今日待办
        </button>
      </div>
    </motion.div>
  )
}

/* ---------- 学习材料 ---------- */

export type MaterialData = {
  domain: { code: string; name: string; chapter_ref: string }
  chain: { level: number; title: string; summary: string }[]
  confusion_pairs: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[]
  knowledge_relations?: {
    source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note: string
    evidence?: KgEvidence; review_status?: string
  }[]
  evidence: { ref: string; text: string }[]
}

export function MaterialView({ userId, domainId, onPractice, onBack, onError }: {
  userId: string; domainId: string
  onPractice: (q: Question) => void; onBack: () => void; onError: (m: string) => void
}) {
  const [mat, setMat] = useState<MaterialData | null>(null)
  const [starting, setStarting] = useState(false)
  // 随堂自测（学习程度检验，2026-09-08）：读完材料后回答本域未做过的题，通过≥60%即完成本域学习
  const [quiz, setQuiz] = useState<{ id: string; code: string; stem: string; options: { key: string; text: string }[] }[] | null>(null)
  const [quizPicks, setQuizPicks] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [quizBusy, setQuizBusy] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.materials(domainId).then(setMat).catch((e) => onError(String(e)))
    api.materialQuiz(userId, domainId).then((r) => setQuiz(r.questions ?? []))
      .catch((e) => onError(String(e)))
  }, [domainId])

  async function submitQuiz() {
    if (!quiz || quizBusy) return
    setQuizBusy(true)
    try {
      const r = await api.submitMaterialQuiz(userId, domainId, quizPicks)
      setQuizResult({ passed: r.passed, correct: r.correct, total: r.total })
      if (r.passed) { /* 学习已完成：回待办会看到 material 任务出列 */ }
    } catch (e) { onError(String(e)) } finally { setQuizBusy(false) }
  }

  if (!mat) return <div className="space-y-3 pt-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 7 · 学习材料</p>
      <h2 className="display mt-2 text-[26px]">{mat.domain.name}</h2>
      <p className="mt-2 text-sm text-ink-2">{mat.domain.chapter_ref} · 学完机制链再做练习，效率最高。</p>

      {/* 推理链 */}
      <div className="card mt-6 p-7">
        <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />药理推理链 · 六环</h3>
        <div className="space-y-0">
          {mat.chain.map((c, i) => (
            <motion.div key={c.level} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: i * 0.06 }} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="grid size-8 flex-none place-items-center rounded-xl bg-primary-soft font-serif text-sm font-bold text-primary">
                  L{c.level}
                </span>
                {i < mat.chain.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="pb-6">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.summary}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 混淆对 */}
      {mat.confusion_pairs.length > 0 && (
        <div className="card mt-4 p-7">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />易混药物对 · 双向辨析</h3>
          <div className="space-y-4">
            {mat.confusion_pairs.map((p, i) => (
              <div key={i} className="rounded-xl border border-line-2 p-4">
                <p className="text-sm font-semibold">
                  <span className="text-primary">{p.drug_a}</span>
                  <span className="mx-2 text-ink-3">vs</span>
                  <span className="text-gold">{p.drug_b}</span>
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{p.distinction}</p>
                <EvidenceNote ev={p.evidence ?? null} reviewStatus="published" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 药效关系图谱（FR-A2 结构化知识关系） */}
      {(mat.knowledge_relations ?? []).length > 0 && (
        <div className="card mt-4 p-7">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold"><span className="capsule gold" />药效关系图谱 · 错题背后的知识点关系</h3>
          </div>
          <p className="mb-4 text-xs text-ink-3">把这道域内的药物/靶点/效应/禁忌关系画成一条条边，帮你看清「错因」所在的一环。</p>
          <KnowledgeGraphView edges={mat.knowledge_relations ?? []} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(mat.knowledge_relations ?? []).map((r, i) => (
              <div key={i} className="rounded-xl border border-line-2 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <NodeChip type={r.source.type} name={r.source.name} />
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">{r.edge}</span>
                  <NodeChip type={r.target.type} name={r.target.name} />
                </div>
                {r.note && <p className="mt-1 text-[11px] text-ink-3">{r.note}</p>}
                <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">
            每条关系均标注教材出处页码；标注「待顾问审校」的条目尚未经药理顾问审校，全章节铺开后统一发布。
          </p>
        </div>
      )}

      {/* 知识点原文 */}
      {mat.evidence.length > 0 && (
        <div className="card mt-4 p-7">
          <h3 className="mb-4 text-sm font-semibold">知识点原文（引用来源）</h3>
          <div className="space-y-3">
            {mat.evidence.map((e, i) => (
              <div key={i} className="rounded-xl bg-paper px-4 py-3 text-[13px]">
                <p className="mb-0.5 text-xs text-ink-3">{e.ref}</p>
                <p className="leading-relaxed text-ink-2">{e.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">正式版本将替换为授权教材的结构化切片。</p>
        </div>
      )}

      {/* 随堂自测：学习程度检验（读完材料 → 自测 → 通过即完成本域学习） */}
      <div className="card mt-4 p-7">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <span className="capsule" />随堂自测 · 检验学习程度
        </h3>
        <p className="mb-4 text-xs text-ink-3">回答本域 3 道未做过的题，答对 ≥60% 即完成本域学习，今日待办里的「学习材料」任务随之出列。</p>

        {quizResult ? (
          <div className={`rounded-2xl border p-5 text-sm ${quizResult.passed ? 'border-ok/40 bg-[var(--color-ok-soft)]' : 'border-cat-red/40 bg-[var(--color-cat-red-soft)]'}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              {quizResult.passed
                ? <><CheckCircle size={16} weight="fill" className="flex-none text-ok" />自测通过（{quizResult.correct}/{quizResult.total}）</>
                : <><XCircle size={16} weight="fill" className="flex-none text-cat-red" />未通过（{quizResult.correct}/{quizResult.total}）</>}
            </p>
            <p className="mt-1 text-ink-2">
              {quizResult.passed
                ? '本域薄弱错因已完成学习，进入练习阶段。'
                : '还有没掌握的：回到上方材料再看一遍，然后重试。'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={() => { setStarting(true); api.questions().then((list) => { const q = list.find((x: Question) => x.domain_id === domainId); if (q) onPractice(q); else onError('该域暂无练习题'); }).catch((e) => onError(String(e))).finally(() => setStarting(false)) }}
                disabled={starting} className="btn btn-primary">
                <CheckCircle size={15} />{starting ? '进入中…' : quizResult.passed ? '进入练习' : '先去练习试试'}
              </button>
              <button onClick={onBack} className="btn border border-line text-ink-2 hover:border-primary hover:text-primary">返回今日待办</button>
            </div>
          </div>
        ) : quiz && quiz.length > 0 ? (
          <div className="space-y-5">
            {quiz.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-5">
                <p className="mb-3 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setQuizPicks({ ...quizPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-2.5 text-left text-sm
                        ${quizPicks[q.id] === o.key ? 'border-primary bg-primary-soft/50' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      <span className={`mr-2 inline-grid size-5 items-center justify-center rounded-full border text-[11px] font-bold
                        ${quizPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                      {o.text}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={submitQuiz} disabled={Object.keys(quizPicks).length < quiz.length || quizBusy}
                className="btn btn-primary">
                {quizBusy ? '判分中…' : '提交自测'}
              </button>
              <span className="text-xs text-ink-3">全部作答后提交</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-paper p-5 text-sm text-ink-2">
            本域暂无自测题。可直接进入练习，用做题检验掌握程度。
            <button onClick={() => { setStarting(true); api.questions().then((list) => { const q = list.find((x: Question) => x.domain_id === domainId); if (q) onPractice(q); else onError('该域暂无练习题，请从今日待办选择其他任务。'); }).catch((e) => onError(String(e))).finally(() => setStarting(false)) }}
              disabled={starting} className="btn btn-primary mt-4">
              <CheckCircle size={15} />{starting ? '进入中…' : '进入练习'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- 聚光边框卡片 ---------- *//* ---------- 聚光边框卡片 ---------- */
