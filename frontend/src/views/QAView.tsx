import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MagnifyingGlass, CaretDown, ChatCircle, Hourglass, Sparkle, Brain, PaperPlaneRight } from '@phosphor-icons/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import { spring } from '../lib/shared'
export type QAMsg = {
  q: string; a: string
  // 引用来源：textbook=教材页切片，itembank=题库题目解析（双路混合检索，2026-09-10）
  citations: { ref: string; chapter: string; book_page: number;
    source?: string; label?: string; code?: string }[]
  refused: boolean; provider: string; note?: string
  follow_ups?: string[]
  thinking?: string
  timestamp?: string
  streaming?: boolean
  streamPhase?: 'thinking' | 'content' | 'done'
  statusLine?: string
}

export const QA_EXAMPLES = [
  '阿托品为什么会散瞳？',
  '去甲肾上腺素和异丙肾上腺素有什么区别？',
  '为什么闭角型青光眼禁用阿托品？',
]

export const QA_SMART_SUGGESTIONS = [
  '🔍 为什么该药物选项在此情境下是错误的或禁忌的？',
  '⚖️ 简要辨析我选的干扰药物与正确答案的机制靶点差异',
  '⚠️ 该考点涉及的代表药物有哪些核心不良反应与风险？',
  '💡 请结合人卫第9版教材，总结本题考查的核心受体通路与助记口诀',
]

/* ---------- DeepSeek 风格可折叠思考链组件 ---------- */

export function ThinkingBox({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)
  if (!thinking || !thinking.trim()) return null

  // 流式推导中默认展开，推导完毕后默认折叠；用户一旦手动点击则遵从用户操作
  const expanded = userExpanded !== null ? userExpanded : !!isStreaming
  const charCount = thinking.trim().length

  return (
    <div className={`my-3 overflow-hidden rounded-xl border transition-all ${
      isStreaming
        ? 'border-indigo-300 bg-gradient-to-r from-indigo-50/90 to-purple-50/70 shadow-xs ring-1 ring-indigo-200/50'
        : 'border-indigo-200/70 bg-gradient-to-r from-indigo-50/70 to-purple-50/40 shadow-2xs'
    }`}>
      <button
        type="button"
        onClick={() => setUserExpanded(!expanded)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-indigo-950 transition hover:bg-indigo-100/50"
      >
        <div className="flex items-center gap-2">
          <div className={`flex h-5 w-5 items-center justify-center rounded-full text-indigo-600 shadow-2xs ${
            isStreaming ? 'bg-indigo-200 animate-pulse' : 'bg-indigo-100'
          }`}>
            <Brain size={13} weight="duotone" />
          </div>
          <span className="font-semibold text-indigo-900">
            {isStreaming ? '正在深度思考推导中…' : '已深度思考'}
          </span>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] text-indigo-700/90 border border-indigo-200/70">
            {charCount} 字临床推演
          </span>
          {isStreaming && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-indigo-600 font-normal">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500 animate-ping" />
              实时推导中
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-indigo-600 font-medium">
          <span>{expanded ? '收起思考' : '展开推导'}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={12} weight="bold" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-indigo-100/80 bg-white/85 px-4 py-3.5 text-xs leading-relaxed">
              <div className="border-l-2 border-indigo-400 pl-3 font-mono whitespace-pre-wrap selection:bg-indigo-100 text-slate-700 leading-relaxed text-[12px]">
                {thinking.trim()}
                {isStreaming && (
                  <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-600 align-middle animate-pulse" />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function QAView({
  userId,
  onError,
  prefill,
  onClearPrefill
}: {
  userId: string
  onError: (m: string) => void
  prefill?: { context?: string; question?: string } | null
  onClearPrefill?: () => void
}) {
  const storageKey = `yaozhi_qa_msgs_${userId}`
  const [msgs, setMsgs] = useState<QAMsg[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [input, setInput] = useState(prefill?.question || '')
  const [busy, setBusy] = useState(false)
  const [enableThinking, setEnableThinking] = useState(true)

  // 切换页面或刷新自动保留对话记录
  useEffect(() => {
    try {
      const cleaned = msgs.map((m) => ({ ...m, streaming: false }))
      localStorage.setItem(storageKey, JSON.stringify(cleaned))
    } catch (e) {
      console.error('Failed to save QA messages', e)
    }
  }, [msgs, storageKey])

  useEffect(() => { window.scrollTo(0, 0) }, [])

  // 错题联动 prefill 变更时自动填入输入框
  useEffect(() => {
    if (prefill?.question) {
      setInput(prefill.question)
    }
  }, [prefill])

  function handleClearHistory() {
    setMsgs([])
    try {
      localStorage.removeItem(storageKey)
    } catch {}
    if (onClearPrefill) onClearPrefill()
  }

  async function ask(text: string, contextOverride?: string) {
    const question = text.trim().slice(0, 500)
    if (!question || busy) return
    setBusy(true)
    setInput('')
    const ctx = contextOverride !== undefined ? contextOverride : prefill?.context
    const history = msgs.slice(-4).flatMap((m) => [
      { role: 'user', content: m.q },
      { role: 'assistant', content: m.a }
    ])
    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    // 立即推入新消息，初始进入流式状态
    setMsgs((prev) => [
      ...prev,
      {
        q: question,
        a: '',
        citations: [],
        refused: false,
        provider: 'external_api',
        thinking: '',
        timestamp: nowStr,
        streaming: true,
        streamPhase: enableThinking ? 'thinking' : 'content',
      }
    ])

    try {
      await api.qaStream(
        userId,
        question,
        ctx,
        undefined,
        history,
        enableThinking,
        (stEv) => {
          setMsgs((prev) => {
            const next = [...prev]
            const target = next[next.length - 1]
            if (target && target.streaming) {
              next[next.length - 1] = { ...target, statusLine: stEv.message }
            }
            return next
          })
        },
        (thinkingDelta) => {
          setMsgs((prev) => {
            const next = [...prev]
            const target = next[next.length - 1]
            if (target && target.streaming) {
              next[next.length - 1] = {
                ...target,
                thinking: (target.thinking || '') + thinkingDelta,
                streamPhase: 'thinking',
              }
            }
            return next
          })
        },
        (contentDelta) => {
          setMsgs((prev) => {
            const next = [...prev]
            const target = next[next.length - 1]
            if (target && target.streaming) {
              next[next.length - 1] = {
                ...target,
                a: (target.a || '') + contentDelta,
                streamPhase: 'content',
              }
            }
            return next
          })
        },
        (r) => {
          setMsgs((prev) => {
            const next = [...prev]
            const target = next[next.length - 1]
            if (target) {
              next[next.length - 1] = {
                ...target,
                a: r.answer || target.a,
                thinking: r.thinking !== undefined ? r.thinking : target.thinking,
                citations: r.citations ?? [],
                follow_ups: r.follow_ups ?? [],
                refused: !!r.refused,
                provider: r.provider ?? target.provider,
                note: (r as any).note || target.note,
                streaming: false,
                streamPhase: 'done',
              }
            }
            return next
          })
        },
        (err) => {
          onError(String(err))
          setMsgs((prev) => {
            const next = [...prev]
            const target = next[next.length - 1]
            if (target && target.streaming) {
              next[next.length - 1] = {
                ...target,
                a: target.a || '抱歉，生成回答时遇到网络问题，请稍后重试。',
                streaming: false,
                streamPhase: 'done',
              }
            }
            return next
          })
        }
      )
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div key="qa" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <p className="text-xs font-semibold tracking-[0.18em] text-gold">课程问答 · 问AI</p>
            {msgs.length > 0 && (
              <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[10.5px] font-medium text-ink-3">
                已保留 {msgs.length} 轮对话记录
              </span>
            )}
          </div>
          <h2 className="display mt-2 text-[26px]">有不会的，直接问</h2>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-3 hover:border-red-300 hover:text-red-700 transition"
          >
            开启新会话 / 清空历史
          </button>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        只讲《药理学》课程内容：支持多轮深度追问与 DeepSeek 风格思维链，先检索教材切片，有依据才回答，并标出引用章节。
        检索不到会直说不知道；用药决策类问题会拒绝（本系统不提供用药建议）。
      </p>

      {/* 错题 / 诊断卡一键联动上下文与智能追问建议 */}
      {prefill?.context && (
        <div className="card mt-5 p-5 border-2 border-amber-500/30 bg-amber-50/50 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <ChatCircle size={14} weight="fill" />已深度联动当前错题 / 诊断卡上下文
            </span>
            {onClearPrefill && (
              <button onClick={onClearPrefill} className="text-[11px] text-ink-3 hover:text-ink">
                ✕ 清除关联
              </button>
            )}
          </div>
          <p className="text-xs text-ink-2 whitespace-pre-line leading-relaxed bg-white/80 p-3 rounded-xl border border-amber-200/60 font-mono">
            {prefill.context}
          </p>
          <div className="mt-3">
            <p className="text-xs font-semibold text-ink-2 mb-2">一键追问推荐：</p>
            <div className="flex flex-wrap gap-1.5">
              {QA_SMART_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => ask(sug)}
                  disabled={busy}
                  className="rounded-full border border-amber-500/40 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100/80 transition text-left">
                  {sug}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {msgs.length === 0 && !prefill?.context && (
        <div className="card mt-6 p-6">
          <p className="mb-3 text-sm font-semibold">试试这样问</p>
          <div className="flex flex-wrap gap-2">
            {QA_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => ask(ex)} disabled={busy}
                className="btn rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 hover:border-primary hover:text-primary">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <div className="flex flex-col items-end">
              <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white shadow-xs">
                {m.q}
              </div>
              {m.timestamp && (
                <span className="mt-1 mr-1 text-[10.5px] text-ink-3">
                  {m.timestamp}
                </span>
              )}
            </div>
            <div className={`card mt-2 p-5 ${m.refused ? 'border-gold/40' : ''}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.provider === 'external_api' ? 'bg-primary-soft text-primary' : m.provider === 'rule' || m.provider === 'retriever' ? 'bg-paper-2 text-ink-3' : 'bg-paper-2 text-ink-3'}`}>
                  {m.provider === 'external_api' ? 'Qwen 3.7 Flash 真模型' : m.provider === 'rule' || m.provider === 'retriever' ? '规则回复' : '演示模式'}
                </span>
                {m.thinking && (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 border border-indigo-200/50 flex items-center gap-1">
                    <Brain size={11} weight="fill" /> 已展开临床思维链
                  </span>
                )}
                {m.refused && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">暂未回答</span>}
              </div>

              {m.statusLine && (
                <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-paper-1/70 px-2.5 py-1.5 text-[11px] font-mono text-ink-3">
                  <MagnifyingGlass size={11} weight="bold" className="text-primary/50" />
                  {m.statusLine}
                </div>
              )}

              {/* DeepSeek 风格可折叠思考过程 */}
              {m.thinking && (
                <ThinkingBox
                  thinking={m.thinking}
                  isStreaming={m.streaming && m.streamPhase === 'thinking'}
                />
              )}

              {/* 思考中但正文尚未吐字时的提示 */}
              {m.streaming && m.streamPhase === 'thinking' && !m.a && (
                <div className="flex items-center gap-2 py-2 text-xs text-indigo-600/80 animate-pulse">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-ping" />
                  <span>正在深度推导演绎药理学逻辑，完成后将即刻输出正式解答…</span>
                </div>
              )}

              {/* 回答正文（含流式打字光标） */}
              {(m.a || (m.streaming && m.streamPhase === 'content')) && (
                <div className="md-answer text-sm leading-relaxed text-ink">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.a || ''}</ReactMarkdown>
                  {m.streaming && m.streamPhase === 'content' && (
                    <span className="inline-block w-1.5 h-4 ml-1 bg-primary align-middle animate-pulse" />
                  )}
                </div>
              )}

              {m.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
                  {m.citations.map((c) => (
                    <span key={c.ref} className={`rounded-full px-2.5 py-1 text-[11px] ${
                      c.source === 'itembank' ? 'bg-gold-soft text-ink-2' : 'bg-paper text-ink-2'}`}>
                      {c.ref} {c.label || `${c.chapter} · p${c.book_page}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Socrates follow-up question bubbles */}
              {m.follow_ups && m.follow_ups.length > 0 && (
                <div className="mt-3 border-t border-dashed border-line/60 pt-3">
                  <p className="text-[11px] font-bold text-amber-800 mb-1.5 flex items-center gap-1">
                    <Sparkle size={13} weight="fill" className="text-amber-600" />
                    苏格拉底启发追问（点击继续深挖）：
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.follow_ups.map((fup, fidx) => (
                      <button
                        key={fidx}
                        type="button"
                        onClick={() => ask(fup)}
                        disabled={busy}
                        className="rounded-full border border-amber-500/30 bg-amber-50/70 px-3 py-1 text-xs text-amber-950 hover:border-amber-500 hover:bg-amber-100 transition text-left"
                      >
                        💡 {fup}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {busy && msgs.every((m) => !m.streaming) && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card mt-2 p-5 border border-indigo-200 bg-indigo-50/30 rounded-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                <Brain size={15} weight="fill" className="animate-pulse text-indigo-600" />
                <span>{enableThinking ? 'AI 导师正在展开药理逻辑推演与人卫教材依据排查…' : 'AI 导师正在研读人卫第9版教材并提炼解析…'}</span>
              </div>
              <span className="text-[11px] text-indigo-600/80 font-mono">
                {enableThinking ? '🧠 深度思考中…' : '⚡ 极速检索中…'}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              <div className="skeleton h-3.5 w-4/5 rounded-md bg-indigo-100/60" />
              <div className="skeleton h-3.5 w-3/5 rounded-md bg-indigo-100/60" />
            </div>
          </motion.div>
        )}
      </div>

      <div className="sticky bottom-4 mt-6">
        <div className="rounded-2xl border border-line bg-white p-3 shadow-[0_10px_30px_rgba(31,42,38,0.10)]">
          {/* 模式行：思考开关 + 会话计数 */}
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setEnableThinking(!enableThinking)}
                title={enableThinking ? '展开药理推导思维链后再回答' : '极速直出模式：不展开思考链'}
                className={`flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  enableThinking
                    ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border border-line bg-paper text-ink-3 hover:text-ink'
                }`}
              >
                <Brain size={12} weight={enableThinking ? 'fill' : 'regular'} />
                <span>{enableThinking ? '深度思考' : '极速直出'}</span>
              </button>
              <span className="hidden min-w-0 truncate text-[11px] text-ink-3 sm:inline">
                {enableThinking ? '先展开药理推导思维链，再输出正式解答' : '不展开思考链，1~2 秒极速响应'}
              </span>
            </div>
            {msgs.length > 0 && (
              <span className="flex-none text-[10.5px] text-ink-3 hidden md:inline">
                {msgs.length} 轮问答已保留
              </span>
            )}
          </div>

          {/* 输入行：聚焦时边框亮起 */}
          <div className="flex items-center gap-2 rounded-xl border border-line bg-paper-1/60 py-1.5 pl-4 pr-1.5 transition focus-within:border-primary/50 focus-within:bg-white">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
              placeholder={enableThinking ? "输入药理学考点或机制问题，AI将展开深度思维链推导…" : "问一个药理学问题（500字内），极速回复…"}
              maxLength={500} disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3 disabled:opacity-60" />
            <button onClick={() => ask(input)} disabled={busy || !input.trim()}
              title="发送"
              className="grid size-9 flex-none place-items-center rounded-lg bg-primary text-white transition hover:bg-primary-focus disabled:bg-paper-2 disabled:text-ink-3">
              {busy ? <Hourglass size={15} className="animate-pulse" /> : <PaperPlaneRight size={15} weight="fill" />}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        回答由课程资料切片 grounded 生成，仅供学习参考，引用不保证完全正确；本系统不提供用药建议。对话按知情同意约定保存，可随时撤回并删除。
      </p>
    </motion.div>
  )
}

/* ---------- 学习材料路由（一学一练：种子域走深图谱，章节走大纲学习） ---------- */

/* ---------- 章节前置温故知新微测（场景三） ---------- */
