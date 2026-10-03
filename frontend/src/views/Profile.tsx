import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight, ChatCircle, Sparkle } from '@phosphor-icons/react'
import { api } from '../api'
import { EmptyPanel, ErrorPanel } from '../components/ui'
export type ArchiveData = {
  summary: {
    attempts: number; correct: number; wrong: number; accuracy: number
    wrong_book: number; diagnosed: number; trained: number; training_passed: number
    mastery_rows: number; mastery_done: number; categories: number
  }
  domain_stats: { domain_id: string; domain: string; chapter_ref: string; attempts: number; correct: number; rate: number }[]
  heatmap: { domains: string[]; categories: string[]; values: number[][] }
  category_dist: Record<string, number>
  mastery: { domain_id: string; domain: string; category: string | null; state: string; reason: string; probability?: number; attempts_count?: number }[]
}

export function Profile({ userId, onGoTodo, onAskAi }: { userId: string; onGoTodo: () => void; onAskAi?: (context: string, defaultQ?: string) => void }) {
  const [arch, setArch] = useState<ArchiveData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<'all' | 'weak' | 'solid'>('all')

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.archive(userId).then(setArch).catch((e) => setError(String(e)))
  }, [userId])

  if (error) return <ErrorPanel message={error} />
  if (!arch) return (
    <div className="space-y-4">
      <div className="skeleton h-28 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="skeleton h-64 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    </div>
  )

  const s = arch.summary
  const acc = Math.round(s.accuracy * 100)
  const masteryRatio = s.mastery_rows > 0 ? Math.round((s.mastery_done / s.mastery_rows) * 100) : 0
  const solveRatio = s.wrong_book > 0 ? Math.round((s.training_passed / s.wrong_book) * 100) : (s.attempts > 0 ? 100 : 0)

  // 综合评级判定
  let gradeBadge = { tag: 'A', title: '卓越级', tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', desc: '药理核心机制与临床合理用药掌握全面，建议保持模考实战状态！' }
  if (s.attempts === 0) {
    gradeBadge = { tag: 'Init', title: '待生成', tone: 'text-ink-3 bg-paper-2 border-line', desc: '暂未作答，完成「今日待办」做题后将自动构建贝叶斯学情画像。' }
  } else if (acc < 50) {
    gradeBadge = { tag: 'C', title: '基础攻坚', tone: 'text-rose-700 bg-rose-50 border-rose-200', desc: '概念与机制失分较多，建议重点结合教材图谱，攻坚受体与药效学基础。' }
  } else if (acc < 70) {
    gradeBadge = { tag: 'B', title: '稳步进阶', tone: 'text-amber-700 bg-amber-50 border-amber-200', desc: '核心主干药理已初步建立，需针对高频混淆考点与错题进行靶向突破。' }
  } else if (acc < 85) {
    gradeBadge = { tag: 'B+', title: '良好实战', tone: 'text-primary bg-primary-soft border-primary/30', desc: '基础扎实，答题稳定；建议重点强化疑难病例沙盘与处方审核。' }
  }

  // 4类核心错因统计与主要瓶颈提炼
  const CORE_CATS = [
    { key: '机制理解不足', label: '机制理解不足', color: '#F59E0B', tip: '建议关注药物效应背后的受体亚型与生物信号通路，避免死记硬背' },
    { key: '概念混淆', label: '概念混淆', color: '#8B5CF6', tip: '建议对比同类衍生药异同、作用靶点差异与代际演进规律' },
    { key: '知识遗忘', label: '知识遗忘', color: '#3B82F6', tip: '利用错题本艾宾浩斯抗遗忘卡片进行周期温故与回温' },
    { key: '审题与应用失误', label: '审题与应用失误', color: '#EF4444', tip: '审题特别留心题干中的患者禁忌证、特殊生理状态与合并用药陷阱' },
  ]
  const catTotal = Object.entries(arch.category_dist)
    .filter(([k]) => k !== '待诊断')
    .reduce((a, [, v]) => a + v, 0)

  let topCatKey = ''
  let topCatMax = 0
  CORE_CATS.forEach((c) => {
    const v = arch.category_dist[c.key] ?? 0
    if (v > topCatMax) {
      topCatMax = v
      topCatKey = c.key
    }
  })
  const topCatObj = CORE_CATS.find((c) => c.key === topCatKey)

  // 重点攻坚 Top 3 薄弱考点（过滤薄弱或掌握度偏低的项）
  const weakCandidates = [...arch.mastery]
    .sort((a, b) => (a.probability ?? 0) - (b.probability ?? 0))
    .slice(0, 3)
    .filter((m) => (m.probability ?? 1) < 0.85 || arch.summary.attempts > 0)

  // 过滤后的掌握度列表
  const filteredMastery = arch.mastery.filter((m) => {
    const p = m.probability ?? 0
    if (filterTab === 'weak') return p < 0.70
    if (filterTab === 'solid') return p >= 0.70
    return true
  })

  // 核心章节掌握度排名 (取前 5 个重点章节)
  const topDomainStats = [...arch.domain_stats]
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 5)

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* 1. Hero 评级与学情标头 */}
      <div className="rounded-[22px] border border-line/70 bg-gradient-to-br from-paper via-paper-1 to-paper-2 p-6 shadow-xs">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                学情全景
              </span>
              <span className="text-xs text-ink-3">贝叶斯知识追踪 (BKT) 引擎驱动</span>
            </div>
            <h2 className="display mt-2 text-2xl font-bold text-ink">药理学能力档案与成长轨迹</h2>
            <p className="mt-1 text-xs text-ink-2 max-w-xl leading-relaxed">
              每次作答与复测实时校准知识状态，自动生成精准错因归因与靶向强化建议。
            </p>
          </div>

          {/* 综合评级卡片 */}
          <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-2xl border px-4 py-3.5 ${gradeBadge.tone} shadow-xs flex-none`}>
            <div className="grid size-12 place-items-center rounded-xl bg-white font-serif text-2xl font-black shadow-xs">
              {gradeBadge.tag}
            </div>
            <div className="max-w-[220px]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide">综合评估</span>
                <span className="text-xs font-semibold">{gradeBadge.title}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug opacity-90">{gradeBadge.desc}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 零作答引导 */}
      {s.attempts === 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-primary-soft/50 p-5">
          <div>
            <h4 className="text-sm font-bold text-ink">档案构建准备就绪</h4>
            <p className="text-xs text-ink-2 mt-0.5">完成「今日待办」做题或跑一次摸底，这里将实时呈现你的多维掌握度雷达与错因分布。</p>
          </div>
          <button onClick={onGoTodo} className="btn btn-primary flex-none !py-2 !px-4 text-xs">
            去今日待办
            <ArrowRight size={13} weight="bold" />
          </button>
        </div>
      )}

      {/* 2. 核心 3 大指标高对比度卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 指标 1: 正确率 */}
        <div className="card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">全科答题正确率</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
              acc >= 70 ? 'bg-emerald-100/90 text-emerald-800 border border-emerald-300' : 'bg-amber-100/90 text-amber-800 border border-amber-300'
            }`}>
              {acc >= 70 ? '达到合格线' : '待攻坚'}
            </span>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="display text-4xl font-black text-ink">{acc}%</span>
            <span className="text-xs font-medium text-ink-3">(<strong className="text-ink font-bold">{s.correct}</strong> 正确 / {s.attempts} 题)</span>
          </div>
          <div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-line-2">
              <span className="absolute left-[70%] top-0 h-full w-0.5 bg-line z-10" title="70% 合格线" />
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${acc}%`,
                  background: acc >= 70 ? 'var(--color-ok)' : 'var(--color-gold)'
                }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-ink-3">
              <span className="font-semibold">基准线 70%</span>
              <span>累计错题 <strong className="text-rose-600 font-bold">{s.wrong}</strong> 道</span>
            </div>
          </div>
        </div>

        {/* 指标 2: 掌握度达标率 */}
        <div className="card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">BKT 掌握达标率</span>
            <span className="rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[11px] font-black text-primary">
              稳固率 {masteryRatio}%
            </span>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="display text-4xl font-black text-primary">{s.mastery_done}</span>
            <span className="text-xs font-medium text-ink-3">/ <strong className="text-ink font-bold">{s.mastery_rows}</strong> 项考点达标</span>
          </div>
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-line-2">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${masteryRatio}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">贝叶斯后验概率 P(L) ≥ 0.70 认定为掌握</p>
          </div>
        </div>

        {/* 指标 3: 诊断闭环率 */}
        <div className="card p-5 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">错因归因与强化闭环</span>
            <span className="rounded-full bg-indigo-100/90 border border-indigo-200 px-2.5 py-0.5 text-[11px] font-black text-indigo-800">
              通关 {s.training_passed} 次
            </span>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="display text-4xl font-black text-ink">{solveRatio}%</span>
            <span className="text-xs font-bold text-indigo-700">闭环通关率</span>
          </div>
          <div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-line-2">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${solveRatio}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">已诊断 <strong className="text-ink font-semibold">{s.diagnosed}</strong> 项 · 靶向训练 <strong className="text-ink font-semibold">{s.trained}</strong> 次</p>
          </div>
        </div>
      </div>

      {/* 3. 两列对比：错因归因深度分析 VS 重点章节掌握度 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 左列：4类错因根因分布 */}
        <div className="card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-extrabold text-ink">临床错因归因分布</h3>
              <p className="text-xs text-ink-3">诊断引擎针对答错题目的深度归因统计</p>
            </div>
            <span className="text-xs font-bold text-ink-2 bg-paper-2 px-2 py-0.5 rounded-md">
              已归因 {catTotal} 题
            </span>
          </div>

          {/* 4条归因进度条 */}
          <div className="space-y-3 pt-1">
            {CORE_CATS.map((c) => {
              const count = arch.category_dist[c.key] ?? 0
              const pct = catTotal > 0 ? Math.round((count / catTotal) * 100) : 0
              return (
                <div key={c.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-bold text-ink">
                      <span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.label}
                    </span>
                    <span className="text-ink font-extrabold">
                      {count} 题 <span className="font-semibold text-ink-3">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-line-2">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: c.color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 核心诊断建议提炼 (高对比度重点突出) */}
          <div className="rounded-xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/50 p-3.5 text-xs text-ink-2 shadow-2xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
              <Sparkle size={14} weight="fill" className="text-amber-600" />
              <span>智能攻坚建议 · 错因阻断</span>
            </div>
            {topCatObj && topCatMax > 0 ? (
              <p className="leading-relaxed">
                当前主要失分瓶颈为 <span className="inline-block rounded-md border border-amber-300 bg-white px-2 py-0.5 font-black text-amber-900 shadow-2xs">【{topCatObj.label}】</span>（占失分 <strong className="text-ink font-bold">{Math.round((topCatMax / Math.max(catTotal, 1)) * 100)}%</strong>）。{topCatObj.tip}。
              </p>
            ) : (
              <p className="leading-relaxed">暂无明显失分聚集，建议进入「今日待办」进行高频考点自适应自测。</p>
            )}
          </div>
        </div>

        {/* 右列：核心章节掌握度 Top 5 */}
        <div className="card p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-extrabold text-ink">重点章节掌握度对比</h3>
              <p className="text-xs text-ink-3">高频考试章节做题正确率与基准线</p>
            </div>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2 py-0.5 rounded-full border border-emerald-300">
              基准合格线 70%
            </span>
          </div>

          <div className="space-y-3.5 pt-1">
            {topDomainStats.length === 0 ? (
              <div className="py-10 text-center text-xs text-ink-3">
                暂无章节做题数据，完成题目后自动展示
              </div>
            ) : (
              topDomainStats.map((d) => {
                const pct = Math.round(d.rate * 100)
                const isPass = pct >= 70
                return (
                  <div key={d.domain_id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink truncate max-w-[200px]">{d.domain}</span>
                      <span className={isPass ? 'font-black text-emerald-800' : 'font-black text-amber-800'}>
                        {pct}% <span className="font-medium text-ink-3">({d.attempts} 题)</span>
                      </span>
                    </div>
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-line-2">
                      <span className="absolute left-[70%] top-0 h-full w-0.5 bg-line z-10" />
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isPass ? 'var(--color-ok)' : 'var(--color-gold)'
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. 今日重点攻坚 · 优先强化清单 (Top 3 Weak Points - 直接带行动按钮！) */}
      <div className="rounded-[22px] border border-line bg-paper p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-amber-500/10 text-amber-600 font-bold text-xs">🚨</span>
            <h3 className="text-sm font-bold text-ink">重点攻坚 · 优先强化清单</h3>
          </div>
          <span className="text-xs text-ink-3">结合 BKT 概率与错因诊断智能推荐</span>
        </div>

        {weakCandidates.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-emerald-700 bg-emerald-50/50 rounded-xl border border-emerald-200">
            <CheckCircle size={16} weight="fill" />
            <span>当前所有已测考点掌握率良好，无突出薄弱项！</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {weakCandidates.map((w, idx) => {
              const pPct = w.probability != null ? Math.round(w.probability * 100) : 45
              return (
                <div key={w.domain_id || idx} className="flex flex-col justify-between rounded-xl border border-line/80 bg-paper-1/60 p-4 transition hover:border-primary/40 hover:shadow-xs">
                  <div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded-md bg-rose-100/90 border border-rose-200 px-2 py-0.5 text-[10.5px] font-black text-rose-800">
                        {w.state || '待巩固'}
                      </span>
                      <span className="text-[11.5px] font-black text-amber-800 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-md">掌握度 {pPct}%</span>
                    </div>
                    <h4 className="mt-2.5 text-[15px] font-black text-ink line-clamp-1">{w.domain}</h4>
                    <p className="mt-1 text-xs text-ink-3 line-clamp-2 leading-relaxed">
                      {w.reason || 'BKT贝叶斯知识追踪模型评估需重点强化'}
                    </p>
                  </div>

                  <div className="mt-4 pt-2 border-t border-line/50 flex items-center gap-2">
                    <button
                      onClick={onGoTodo}
                      className="btn btn-primary flex-1 !py-2 !text-xs !font-bold !justify-center shadow-xs"
                    >
                      靶向强化
                      <ArrowRight size={13} weight="bold" />
                    </button>
                    {onAskAi && (
                      <button
                        onClick={() => onAskAi(`请帮我系统梳理【${w.domain}】的核心药理机制、临床考点与易混淆易错陷阱。`)}
                        className="btn rounded-xl border border-line px-2.5 py-1.5 text-xs text-ink-2 hover:text-primary hover:border-primary/40"
                        title="向 AI 助教请教该考点"
                      >
                        <ChatCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 5. 全景章节掌握度细目 (交互式标签筛选) */}
      <div className="card p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-ink">全景知识点掌握度细目</h3>
            <p className="text-[11px] text-ink-3">全量考点 BKT 掌握度与作答动态追踪</p>
          </div>

          {/* 筛选选项卡 */}
          <div className="flex items-center gap-1 rounded-xl bg-paper-2 p-1 text-xs">
            <button
              onClick={() => setFilterTab('all')}
              className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                filterTab === 'all' ? 'bg-white text-primary shadow-xs font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              全部 ({arch.mastery.length})
            </button>
            <button
              onClick={() => setFilterTab('weak')}
              className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                filterTab === 'weak' ? 'bg-white text-amber-700 shadow-xs font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              待巩固 ({arch.mastery.filter(m => (m.probability ?? 0) < 0.70).length})
            </button>
            <button
              onClick={() => setFilterTab('solid')}
              className={`rounded-lg px-2.5 py-1 font-medium transition cursor-pointer ${
                filterTab === 'solid' ? 'bg-white text-emerald-700 shadow-xs font-semibold' : 'text-ink-3 hover:text-ink'
              }`}
            >
              已稳固 ({arch.mastery.filter(m => (m.probability ?? 0) >= 0.70).length})
            </button>
          </div>
        </div>

        {/* 考点列表 */}
        {filteredMastery.length === 0 ? (
          <EmptyPanel text="该分类下暂无考点细目" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
            {filteredMastery.map((m, i) => {
              const pPct = m.probability != null ? Math.round(m.probability * 100) : null
              const isSolid = (m.probability ?? 0) >= 0.70
              return (
                <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-paper-1/40 px-3.5 py-2.5 text-xs transition hover:border-primary/30">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${isSolid ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="font-semibold text-ink truncate">{m.domain}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-3">
                      <span>{m.state}</span>
                      {m.attempts_count != null && m.attempts_count > 0 && (
                        <span>· 练习 {m.attempts_count} 次</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-none">
                    {pPct != null && (
                      <div className="w-20 text-right">
                        <div className={`font-bold ${isSolid ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {pPct}%
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line-2">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pPct}%`,
                              backgroundColor: isSolid ? 'var(--color-ok)' : 'var(--color-gold)'
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {onAskAi && (
                      <button
                        onClick={() => onAskAi(`请简明讲解【${m.domain}】的核心机制与常考要点。`)}
                        className="rounded-lg p-1 text-ink-3 hover:bg-paper-2 hover:text-primary transition cursor-pointer"
                        title="问 AI 助教"
                      >
                        <ChatCircle size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- 错题本一键抗遗忘唤醒弹窗（场景二） ---------- */
/* ---------- 错题本一键抗遗忘唤醒弹窗（场景二 · 现代药房质感重构） ---------- */
