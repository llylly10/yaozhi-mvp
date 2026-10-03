import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, Warning, MagnifyingGlass, ArrowRight, CaretDown } from '@phosphor-icons/react'
import { CategoryTag } from '../components/ui'
import { CAT_KEYS, CAT_STYLE, spring, type PortraitResult } from '../lib/shared'
export function Portrait({ result, onEnter, onBack }: { result: PortraitResult; onEnter: () => void; onBack?: () => void }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const total = result.total || result.weak.length
  const wrong = result.weak.length
  const correct = Math.max(total - wrong, 0)
  const judged = result.weak.filter((w) => w.category && w.category !== '待诊断')   // 已归因
  const pending = result.weak.filter((w) => !w.category || w.category === '待诊断')  // 未归因

  // 错因构成：按四类真错因聚合（只统计已归因的错题），数字少也照样直观
  const catN: Record<string, number> = {}
  judged.forEach((w) => { catN[w.category] = (catN[w.category] || 0) + 1 })
  const judgedByCat = CAT_KEYS.map((c) => ({ cat: c, n: catN[c] || 0 })).filter((x) => x.n > 0)

  // 主结论（针对数据本身，绝不臆造）——三种态：全对 / 有真错因 / 只标了待诊断
  let tone: 'ok' | 'warn' | 'focus'
  let title: string
  let desc: string
  if (wrong === 0) {
    tone = 'ok'
    title = '摸底全对 · 基础很扎实'
    desc = `这轮 ${total} 道题全部答对。摸底题量还少、定位有限，建议进「今日待办」多做几道，把还没暴露的薄弱点也找出来。`
  } else if (judgedByCat.length > 0) {
    tone = 'focus'
    const top = judgedByCat[0]
    const topDomains = [...new Set(judged.map((w) => w.domain ?? '').filter(Boolean))]
    const allSame = pending.length === 0  // 错题是否都已归到 top 这类（无待诊断混入）
    title = `你最需要补的是「${top.cat}」`
      + (allSame && top.n > 1 ? `——这 ${top.n} 道错题都是同一类` : '')
    const domainHint = topDomains.length
      ? `它们集中在「${topDomains.slice(0, 2).join('」「')}」这几块。`
      : '这类错题背后其实是同一个根因。'
    const actionHint = `下一步路径会专门针对「${top.cat}」带你补扎实。`
    const pendingHint = pending.length
      ? `另外 ${pending.length} 道错题还需要做一次诊断归因，才能纳入画像。`
      : ''
    desc = domainHint + actionHint + (pendingHint ? ' ' + pendingHint : '')
  } else {
    tone = 'warn'
    title = '有错题，但还没定位到具体原因'
    desc = `${pending.length} 道题只标出了「答错」。需要回作答流程走一次诊断，才知道属于哪种错因、该从哪补。先进「今日待办」把一道错题做进诊断即可自动归因。`
  }
  const hero = {
    ok: { bg: 'linear-gradient(150deg,#E1F1E8,#F3FAF5)', fg: 'var(--color-ok)', icon: <CheckCircle size={22} weight="fill" /> },
    warn: { bg: 'linear-gradient(150deg,#F3E8CD,#FBF6EA)', fg: 'var(--color-gold)', icon: <Warning size={22} weight="fill" /> },
    focus: { bg: 'linear-gradient(150deg,#DFEDE6,#EFF6F1)', fg: 'var(--color-primary)', icon: <MagnifyingGlass size={22} weight="fill" /> },
  }[tone]

  const catTotal = judged.length
  const pendingNote = pending.length
  const [showAllWrong, setShowAllWrong] = useState(false)

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="pt-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 5 · 摸底画像</p>
        {onBack && (
          <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-2 transition hover:border-primary hover:text-primary">
            <ArrowRight size={12} className="rotate-180" />返回学习地图
          </button>
        )}
      </div>
      <h2 className="display mt-2 text-[26px]">先看清水平，再知道下一步练什么</h2>
      <p className="mt-2 text-sm text-ink-2">下面会用「一句话」直接告诉你该补哪——不用再看报表自己猜。</p>

      {/* ① 一句话结论（第一屏就抓住重点） */}
      <div className="mt-5 overflow-hidden rounded-[22px] p-6" style={{ background: hero.bg }}>
        <div className="flex items-start gap-4">
          <div className="grid size-11 flex-none place-items-center rounded-2xl text-white" style={{ background: hero.fg }}>{hero.icon}</div>
          <div className="min-w-0">
            <p className="display text-[19px] leading-snug" style={{ color: hero.fg }}>{title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{desc}</p>
          </div>
        </div>
      </div>

      {/* ② 四个一眼能懂的计数卡 */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">摸底题数</p>
          <p className="display mt-1 text-[22px] leading-none text-ink">{total}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">覆盖 {result.domains.length} 个章节</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">答对</p>
          <p className="display mt-1 text-[22px] leading-none text-ok">{correct}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">正确率 {total ? Math.round((correct / total) * 100) : 100}%</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">答错</p>
          <p className="display mt-1 text-[22px] leading-none" style={{ color: 'var(--color-cat-red)' }}>{wrong}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">{judged.length} 道已定位到错因</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">主要错因</p>
          <p className="mt-1 text-[18px] leading-none" style={{ color: hero.fg }}>
            {judgedByCat.length ? judgedByCat[0].cat : '—'}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-3">
            {judgedByCat.length ? `${judgedByCat[0].n} 道` : pendingNote ? '待诊断后再显示' : '本轮无错题'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ③ 错因构成：色条 + 占比，比「域×错因」矩阵更贴近学生理解 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">错题是哪种原因</h3>
          <p className="mb-3 text-xs text-ink-3">把答错的题按错因归堆，找出共性</p>
          {judgedByCat.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              {wrong === 0 ? '没有错题，不用诊断。' : `${pendingNote} 道错题还没归因——去「今日待办」走一次诊断就能看到。`}
            </div>
          ) : (
            <div className="space-y-3">
              {judgedByCat.map((x) => {
                const share = x.n / Math.max(catTotal, 1)
                const s = CAT_STYLE[x.cat] ?? { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' }
                return (
                  <div key={x.cat}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{x.cat}</span>
                      <span className="text-ink-3">{x.n} 题 · {Math.round(share * 100)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-line-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: s.fg }} />
                    </div>
                  </div>
                )
              })}
              <p className="pt-1 text-[11px] text-ink-3">颜色=错因类型 · 长度=这类错题占的比例，下一轮练习会按它优先安排</p>
            </div>
          )}
        </div>

        {/* ④ 各章节作答：横向短条（比矩阵更直接）+ 是否进路径 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">各章节摸底情况</h3>
          <p className="mb-3 text-xs text-ink-3">绿色=答对 / 红点=低于 70% 会进你的今日待办</p>
          {result.domains.length === 0 && <p className="py-8 text-center text-sm text-ink-3">本轮没有章节作答记录。</p>}
          {result.domains.length > 0 && (
            <div className="space-y-3">
              {result.domains.map((d) => {
                const low = d.rate < 0.7
                return (
                  <div key={d.domain}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        {low && <span className="size-1.5 rounded-full" style={{ background: 'var(--color-cat-red)' }} />}
                        {d.domain}
                      </span>
                      <span className={low ? 'font-semibold text-cat-red' : 'text-ok'}>
                        {d.correct}/{d.total} 对 · {Math.round(d.rate * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line-2">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.round(d.rate * 100)}%`,
                        background: low ? 'var(--color-cat-red)' : 'var(--color-ok)',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ⑤ 这轮答错的题（逐题清单，最具体、永远可读） */}
      <div className="card mt-4 p-6">
        <h3 className="mb-1 text-sm font-semibold">这轮答错的题</h3>
        <p className="mb-3 text-xs text-ink-3">逐题标出错在哪、属于什么原因，最下面那题可能正好就是你现在该补的</p>
        {wrong === 0 && <p className="py-8 text-center text-sm text-ink-3">本轮没有错题——可以去题库挑几道更难的做做看。</p>}
        {wrong > 0 && (
          <div className="space-y-2.5">
            {(showAllWrong ? result.weak : result.weak.slice(0, 4)).map((w, i) => {
              const isPending = !w.category || w.category === '待诊断'
              return (
                <div key={`${w.question_code}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line px-3.5 py-3">
                  <span className="text-[11px] text-ink-3">{w.question_code}</span>
                  <span className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-ink">{w.stem}</span>
                  {isPending
                    ? <span className="rounded-full bg-line-2 px-2.5 py-1 text-[11px] text-ink-3">待诊断</span>
                    : <CategoryTag category={w.category} />}
                  {w.domain && <span className="text-[11px] text-ink-3">→ 归入「{w.domain}」</span>}
                </div>
              )
            })}
          </div>
        )}
        {wrong > 4 && (
          <button onClick={() => setShowAllWrong(!showAllWrong)}
            className="btn mt-3 items-center gap-1 rounded-full border border-line px-4 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
            {showAllWrong ? '收起' : `展开全部 ${wrong} 道`}
            <CaretDown size={13} weight="bold" className={`transition-transform duration-200 ${showAllWrong ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="mt-7 flex justify-center pb-2">
        <button onClick={onEnter} className="btn btn-primary !px-8 !py-3.5">
          画像已生成，进入今日待办<ArrowRight size={15} weight="bold" />
        </button>
      </div>
      <p className="pb-4 text-center text-xs text-ink-3">画像会随每次练习自动更新 · 学习档案里能看到完整成长轨迹</p>
    </motion.div>
  )
}

/* ---------- 艾宾浩斯抗遗忘长时记忆复测胶囊（场景一） ---------- */
