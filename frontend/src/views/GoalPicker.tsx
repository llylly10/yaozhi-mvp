import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { daysToExam, resolveExamDate, spring, todayIso } from '../lib/shared'
export const GOALS = [
  ['期末冲绩', '围绕本学期药理学课程的重难点与易错点，提升章节测验成绩。'],
  ['补齐理解缺口', '不急着刷题，先把「为什么错」搞清楚，重建机制理解链。'],
  ['备考执业药师', '对照执业药师考点组织练习，兼顾课程与考证。'],
] as const

export function GoalPicker({ onNext, goal, onBack, isSubPage, examDate, onExamDate }: {
  onNext: (g: string) => void; goal: string; onBack: () => void; isSubPage?: boolean
  examDate: string; onExamDate: (iso: string) => void
}) {
  const [picked, setPicked] = useState<string>(goal)
  // 考期预设跟随当前选中目标（picked），而非已保存的 goal——否则页面上选了新目标，卡片提示仍停在旧目标
  const preset = resolveExamDate(picked, '')
  const effectiveIso = examDate || (preset ? preset.iso : '')
  const days = effectiveIso ? daysToExam(effectiveIso) : NaN
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="mx-auto w-full max-w-[760px] pt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 3 · 学习目标</p>
      <h2 className="display mt-2 text-[26px]">你这个阶段最想解决什么？</h2>
      <p className="mt-2 text-sm text-ink-2">目标决定摸底后的学习路径排序，之后可以在学习档案里修改。</p>
      <div className="mt-7 space-y-3.5">
        {GOALS.map(([t, d]) => (
          <motion.button key={t} whileTap={{ scale: 0.99 }} onClick={() => setPicked(t)}
            className={`relative w-full rounded-2xl border p-5 text-left transition-colors duration-150
              ${picked === t ? 'border-primary bg-primary-soft/80 shadow-xs' : 'border-line-2 bg-white hover:border-line hover:bg-paper-2/40'}`}>
            <span className="relative z-10 flex items-start gap-3.5">
              <span className={`mt-0.5 grid size-[22px] flex-none place-items-center rounded-full border-2
                ${picked === t ? 'border-primary bg-primary' : 'border-line bg-white'}`}>
                {picked === t && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span>
                <span className="block text-[15px] font-semibold">{t}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{d}</span>
              </span>
            </span>
          </motion.button>
        ))}
      </div>
      <div className="mt-7 flex items-center gap-3">
        <button onClick={() => onNext(picked)} className="btn btn-primary">
          保存目标，开启全景地图<ArrowRight size={15} weight="bold" />
        </button>
        <button onClick={onBack} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:bg-paper">
          {isSubPage ? '返回全景地图' : '上一步'}
        </button>
      </div>

      {/* 考期倒计时设置（2026-09-29 做真：自定义日期 > 目标预设，存 localStorage） */}
      <div className="mt-6 rounded-2xl border border-line-2 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold text-ink">考期倒计时</p>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
              顶部胶囊按此日期计算；预设日期以官方公告为准，可自定义覆盖。
            </p>
          </div>
          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[12px] font-bold text-amber-700">
            {effectiveIso ? (days >= 0 ? `D-${days}` : '已结束') : '未设置'}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <input type="date" value={effectiveIso} min={todayIso()}
            onChange={(e) => onExamDate(e.target.value)}
            className="rounded-xl border border-line-2 bg-paper-1/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-primary/50" />
          {preset && examDate && (
            <button onClick={() => onExamDate('')}
              className="rounded-full border border-line bg-white px-3.5 py-2 text-[12px] font-medium text-ink-2 hover:bg-paper">
              恢复默认（{preset.label} {preset.iso}）
            </button>
          )}
        </div>
        {!effectiveIso && (
          <p className="mt-2 text-[11px] text-ink-3">
            当前目标（{picked}）没有全国统一考期预设，可自行设置日期（如期末考试日）。
          </p>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- 学习地图 · 知识图谱（2026-09-09：目标后、摸底前 先学→随堂摸底） ---------- */
