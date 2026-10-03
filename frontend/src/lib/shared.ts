
export const EXAM_PRESETS: { match: RegExp; label: string; short: string; iso: string }[] = [
  { match: /执业/, label: '执业药师考试', short: '执考', iso: '2026-10-17' },
]

/* 生效考期：自定义 > 目标预设 > 无（无则头部胶囊隐藏，不显示无意义倒计时） */

export function resolveExamDate(goal: string, custom: string): { label: string; short: string; iso: string } | null {
  if (custom) return { label: '自定义考期', short: '考期', iso: custom }
  const p = EXAM_PRESETS.find((x) => x.match.test(goal))
  return p ? { label: p.label, short: p.short, iso: p.iso } : null
}

/* 距考期天数（按本地日历日；目标日当天=0，已过为负） */

export function daysToExam(iso: string): number {
  const d = new Date(`${iso}T00:00:00`)
  if (isNaN(d.getTime())) return NaN
  const now = new Date()
  return Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000)
}

/* 本地日期 ISO 串（不用 toISOString：UTC 偏移会让晚间差一天） */

export function todayIso(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

// 幂等键 UUID 生成：优先 crypto.randomUUID（仅 HTTPS/localhost 可用）；
// 降级 crypto.getRandomValues（非安全上下文也有），再降级纯 JS（极老浏览器/非安全上下文兜底）。

export function genUUID(): string {
  // 兼容非安全上下文（HTTP 公网）crypto 不可用：类型上把 crypto 视作可选，避免 TS2774
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }
  if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  const grv: (a: Uint8Array) => Uint8Array = g.crypto?.getRandomValues
    ? g.crypto.getRandomValues.bind(g.crypto)
    : (arr: Uint8Array) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr }
  const b = grv(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export type Screen = 'register' | 'consent' | 'goal' | 'study' | 'assessment' | 'portrait' | 'list' | 'material' | 'flow' | 'profile' | 'qa' | 'custom_quiz' | 'clinical_cases'

export type View = 'study' | 'todo' | 'material' | 'wrongbook' | 'profile' | 'qa' | 'custom_quiz' | 'clinical_cases'

export const spring = { type: 'spring', stiffness: 120, damping: 20 } as const

export const Rconst = 52

export const Cconst = 2 * Math.PI * Rconst

export type StudyNode = {
  domain_id: string; code: string; is_seed: boolean; title: string
  book_chapter_no: number | null
  source: 'seed' | 'syllabus' | 'none'
  q_published: number; objective: string
  studied: null | { passed: boolean; score: number; total: number }
  mastery: null | { state: string }
}

export type StudyMapData = {
  groups: { key: string; name: string; nodes: StudyNode[] }[]
  recommended: string[]
  total_domains: number
  note: string
}

/* 随堂自测弹窗：3题速测，即刻判卷并点亮图谱节点，无需跳离全景驾驶舱 */

export const CAT_KEYS = ['知识遗忘', '概念混淆', '机制理解不足', '审题与应用失误']

export const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  '知识遗忘': { bg: 'var(--color-cat-blue-soft)', fg: 'var(--color-cat-blue)' },
  '概念混淆': { bg: 'var(--color-cat-purple-soft)', fg: 'var(--color-cat-purple)' },
  '机制理解不足': { bg: 'var(--color-cat-orange-soft)', fg: 'var(--color-cat-orange)' },
  '审题与应用失误': { bg: 'var(--color-cat-red-soft)', fg: 'var(--color-cat-red)' },
}

export type KgNodeT = { name: string; type: string }

export type KgEdgeT = {
  source: { type: string; name: string }; edge: string; target: { type: string; name: string }
  note?: string; evidence?: KgEvidence; review_status?: string
}

export type KgEvidence = { source?: string; book_page?: number; chapter?: string; text?: string } | null
export type KgTabDef = { k: string; label: string; match: (e: KgEdgeT) => boolean }

export type PortraitResult = {
  total: number
  weak: { question_code: string; stem: string; domain_id?: string; domain?: string; category: string }[]
  domains: { domain: string; correct: number; total: number; rate: number }[]
}
