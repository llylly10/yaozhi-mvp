import { highlightPharmacyKeywords } from '../pharmacyHighlight'
import { CAT_STYLE, type KgEvidence } from '../lib/shared'
export function Hex({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  const h = size, w = size * 0.866
  const pts = `${w / 2},0 ${w},${h * 0.25} ${w},${h * 0.75} ${w / 2},${h} 0,${h * 0.75} 0,${h * 0.25}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style}>
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

/* 苯环分子背景：退到左右页缘的点缀，不再满屏平铺，避免干扰内容阅读 */

export function CategoryTag({ category }: { category: string }) {
  const s = CAT_STYLE[category] ?? { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' }
  return (
    <span className="inline-flex items-center rounded-full border border-current/20 px-3 py-1 text-xs font-bold shadow-2xs"
      style={{ background: s.bg, color: s.fg }}>
      {category}
    </span>
  )
}

export function NodeChip({ type, name }: { type: string; name: string }) {
  const tint: Record<string, string> = {
    药物: 'var(--color-primary-soft)',
    靶点: 'var(--color-cat-purple-soft)',
    机制: 'var(--color-cat-blue-soft)',
    效应: 'var(--color-ok-soft)',
    禁忌: 'var(--color-cat-red-soft)',
    适应证: 'var(--color-gold-soft)',
  }
  const bg = tint[type] ?? 'var(--color-paper-2)'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/70 px-2.5 py-1 text-[12.5px] font-semibold text-ink shadow-2xs"
      style={{ background: bg }}>
      <span className="text-[10px] font-bold text-ink-3 uppercase">{type}</span>{name}
    </span>
  )
}

/* 知识图谱交互视图（2026-09-12 redesign-preserve）：分层轨道布局。
   力导毛球不可读 → 确定性 BFS 分层：中心（章节/核心实体）+ 环带（节/类别/药物/知识点）。
   标签纪律：章节·节·药物常显，其余悬停/聚焦才显；边标签默认隐藏，含义进图例与详情。
   颜色锁主题：emerald 主色 + gold 点缀药物，其余 stone 中性；文字一律墨色 + 白色描边。 */

export function EvidenceNote({ ev, reviewStatus }: { ev: KgEvidence; reviewStatus?: string }) {
  const reviewed = reviewStatus === 'published'
  if (!ev || !ev.text) {
    return (
      <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
        <span className="mr-1 rounded bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-3">无教材依据</span>
        该条关系暂未在教材原文中检索到直接表述，保留待药理顾问核实后补充。
      </p>
    )
  }
  // 派生关联（大纲结构/题库共现/做题关联）：如实署名，不冒充教材页码
  if (ev.book_page == null) {
    return (
      <div className="mt-2 rounded-xl border border-line-2 bg-paper-1/40 p-2.5 text-[11.5px] leading-relaxed">
        <p className="flex flex-wrap items-center gap-1.5 text-ink-3 mb-1.5">
          <span className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[10px] font-bold text-ink-2">{ev.source ?? '程序派生'}</span>
          {ev.chapter && <span className="font-medium text-ink-2">{ev.chapter}</span>}
        </p>
        <div className="text-ink-2 pl-2 border-l-2 border-primary/30 leading-relaxed font-medium">
          {highlightPharmacyKeywords(ev.text)}
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-xl border border-line-2 bg-paper-1/40 p-2.5 text-[11.5px] leading-relaxed">
      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5 text-ink-3">
        <div className="flex items-center gap-1.5">
          <span className="rounded-md bg-[var(--color-gold-soft)] border border-gold/30 px-1.5 py-0.5 text-[10px] font-extrabold text-gold">
            📖 教材 P{ev.book_page ?? '—'}
          </span>
          {ev.chapter && <span className="font-semibold text-ink-2">{ev.chapter}</span>}
        </div>
        {!reviewed ? (
          <span className="rounded bg-paper-2 px-1.5 py-0.2 text-[9.5px] font-semibold text-ink-3">待顾问审校</span>
        ) : (
          <span className="rounded bg-emerald-50 px-1.5 py-0.2 text-[9.5px] font-bold text-emerald-700">专家已审校</span>
        )}
      </div>
      <div className="text-ink-2 pl-2 border-l-2 border-primary/50 leading-relaxed font-medium">
        {highlightPharmacyKeywords(ev.text)}
      </div>
    </div>
  )
}

/* 错题记忆卡：图谱 + 临床/教材助记（wrong/{id}/recall 数据） */

export function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="card p-14 text-center">
      <div className="mx-auto w-fit opacity-30"><Hex size={64} className="text-primary" /></div>
      <p className="mt-4 text-sm text-ink-3">{text}</p>
    </div>
  )
}

export function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
}
