import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight, SquaresFour, BookOpenText, Lightning, Sparkle, X } from '@phosphor-icons/react'
import { PharmacologyRadar } from '../PharmacologyRadar'
import { spring, type KgEdgeT, type KgNodeT, type KgTabDef, type StudyMapData, type StudyNode } from '../lib/shared'
import { KnowledgeGraphView } from './KnowledgeGraphView'
import { QuickQuizModal } from './QuickQuizModal'
export function CourseGraph({ data, goal, userId, onOpen, onSkip, onProceed, onGoTodo, onGoQuiz, onAskAi, onRefreshMap }: {
  data: StudyMapData; goal: string; userId?: string
  onOpen: (n: StudyNode) => void; onSkip: () => void; onProceed: () => void
  onGoTodo?: () => void; onGoQuiz?: () => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
  onRefreshMap?: () => void
}) {
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [selectedChapter, setSelectedChapter] = useState<StudyNode | null>(null)
  const [activeQuizChapter, setActiveQuizChapter] = useState<StudyNode | null>(null)

  const doneCount = data.groups.reduce((acc, g) => acc + g.nodes.filter((n) => n.studied?.passed).length, 0)
  const totalDomains = data.total_domains || 48
  const overallPct = Math.round((doneCount / (totalDomains || 1)) * 100)
  const seedCount = data.groups.reduce((acc, g) => acc + g.nodes.filter((n) => n.is_seed).length, 0)
  // 六大系统真实达标率（随堂摸底通过章节占比）——供掌握度雷达使用（替代此前由总评推导的假六维）
  const groupStats = data.groups.map((g) => {
    const total = g.nodes.length
    const passed = g.nodes.filter((n) => n.studied?.passed).length
    return { name: g.name, passed, total, pct: total ? Math.round((passed / total) * 100) : 0 }
  })

  // 构建课程全景图谱的宏观节点与拓扑关系
  const { macroNodes, macroEdges, allChaptersMap } = useMemo(() => {
    const rootName = '药理学课程'
    const edges: KgEdgeT[] = []
    const nodes: KgNodeT[] = [{ name: rootName, type: '核心' }]
    const chMap = new Map<string, StudyNode>()

    for (const g of data.groups) {
      nodes.push({ name: g.name, type: '系统' })
      edges.push({
        source: { type: '核心', name: rootName },
        edge: '包含',
        target: { type: '系统', name: g.name },
      })
      for (const n of g.nodes) {
        chMap.set(n.title, n)
        const isPassed = n.studied?.passed
        const nodeType = isPassed ? '已达标' : n.is_seed ? '示范' : '章节'
        nodes.push({ name: n.title, type: nodeType })
        edges.push({
          source: { type: '系统', name: g.name },
          edge: '包含',
          target: { type: nodeType, name: n.title },
          note: `${g.name} · ${n.is_seed ? '顾问深度示范章' : '全国统编教学大纲'}${isPassed ? '（已随堂达标）' : ''}`,
        })
      }
    }
    return { macroNodes: nodes, macroEdges: edges, allChaptersMap: chMap }
  }, [data])

  // 全景图谱顶部切换标签
  const macroTabs: KgTabDef[] = useMemo(() => [
    { k: 'all', label: `全景 ${data.total_domains}章`, match: () => true },
    { k: 'featured', label: '示范与重点', match: (e) => e.source.type === '核心' || e.target.type === '示范' || data.recommended.some((id) => allChaptersMap.get(e.target.name)?.domain_id === id) },
    ...data.groups.map((g) => ({
      k: g.key,
      label: g.name.replace('系统药理', '').replace('及代谢系统', '').replace('药物', ''),
      match: (e: KgEdgeT) => (e.source.name === '药理学课程' && e.target.name === g.name) || e.source.name === g.name,
    })),
  ], [data, allChaptersMap])

  const handleNodeClick = (name: string) => {
    const ch = allChaptersMap.get(name)
    if (ch) {
      setSelectedChapter(ch)
    }
  }

  const node = (n: StudyNode) => {
    const done = n.studied?.passed
    const rec = data.recommended.includes(n.domain_id)
    const seed = n.is_seed
    const isSelected = selectedChapter?.domain_id === n.domain_id
    return (
      <button key={n.domain_id} onClick={() => setSelectedChapter(n)}
        className={`group flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs transition cursor-pointer
          ${isSelected
            ? 'ring-2 ring-primary border-primary bg-primary-soft/90 font-bold shadow-xs'
            : done
            ? 'border-line bg-white hover:border-emerald-500/50 hover:bg-emerald-50/20 text-ink shadow-2xs'
            : seed
            ? 'border-line bg-white hover:border-slate-400 hover:bg-slate-50 text-ink shadow-2xs'
            : rec
            ? 'border-line bg-white hover:border-primary/50 hover:bg-primary-soft/20 text-ink shadow-2xs'
            : 'border-line bg-white hover:border-line hover:bg-paper-1/40 text-ink-2'}`}>
        <span className={`size-2 flex-none rounded-full ${
          done ? 'bg-emerald-600 ring-2 ring-emerald-200' :
          seed ? 'bg-amber-600 ring-2 ring-amber-200' :
          rec ? 'bg-primary ring-2 ring-primary/20' : 'bg-slate-300'
        }`} />
        <span className="leading-tight font-medium text-ink truncate">{n.title}</span>
        {done && <CheckCircle size={13} weight="fill" className="ml-auto flex-none text-emerald-600" />}
        {!done && seed && (
          <span className="ml-auto flex-none rounded px-1.5 py-0.2 text-[9px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
            示范
          </span>
        )}
        {!done && !seed && rec && (
          <span className="ml-auto flex-none rounded px-1.5 py-0.2 text-[9px] font-mono font-bold bg-primary/10 text-primary border border-primary/20">
            推荐
          </span>
        )}
      </button>
    )
  }

  // 计算所选章节所属系统
  const selectedGroup = useMemo(() => {
    if (!selectedChapter) return null
    return data.groups.find((g) => g.nodes.some((n) => n.domain_id === selectedChapter.domain_id)) ?? null
  }, [data, selectedChapter])

  return (
    <motion.div key="study-overview" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      {/* 顶部临床驾驶舱状态控制台 */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-3 border-b border-line/70">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono tracking-wider text-ink-3 uppercase">
            <span className="size-1.5 rounded-full bg-primary" />
            <span>Pharmacology Topology OS</span>
            <span>/</span>
            <span className="text-primary font-bold">BKT Orbit Console</span>
            <span className="hidden sm:inline text-ink-3">· 备考: {goal}</span>
          </div>
          <h2 className="display mt-1 text-2xl sm:text-3xl font-black text-ink tracking-tight">
            全景药理知识拓扑星图
          </h2>
          <p className="mt-1 text-xs text-ink-3 max-w-xl">
            6 大药理系统 · 35 个大纲教学单元 · 贝叶斯知识追踪 (BKT) 多维认知投影
          </p>
        </div>

        {/* 视图切换：精密分段器 */}
        <div className="flex items-center gap-1 rounded-xl bg-paper-2 p-1 border border-line flex-none self-start sm:self-auto">
          <button onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${viewMode === 'graph' ? 'bg-white text-primary shadow-xs font-bold' : 'text-ink-3 hover:text-ink'}`}>
            <Sparkle size={13} weight={viewMode === 'graph' ? 'fill' : 'regular'} />
            全景拓扑星轨
          </button>
          <button onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${viewMode === 'list' ? 'bg-white text-primary shadow-xs font-bold' : 'text-ink-3 hover:text-ink'}`}>
            <SquaresFour size={13} weight={viewMode === 'list' ? 'fill' : 'regular'} />
            六大系统清单 ({data.groups.length})
          </button>
        </div>
      </div>

      {/* 视图区 */}
      {viewMode === 'graph' ? (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-5 items-start">
          {/* 左侧主图谱与操作区 */}
          <div className="space-y-4 min-w-0">
            <KnowledgeGraphView
              title="药理学全景课程拓扑星轨"
              nodes={macroNodes}
              edges={macroEdges}
              tabDefs={macroTabs}
              height={typeof window !== 'undefined' && window.innerWidth < 768 ? 380 : 580}
              onNodeClick={handleNodeClick}
            />

            {/* 示范与推荐快捷通道 */}
            <div className="rounded-2xl border border-line bg-white p-4 shadow-xs">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-md bg-slate-100 text-slate-700 font-bold text-xs">★</span>
                  <p className="text-xs font-bold text-ink">人卫九版示范深挖与高频考点章节</p>
                </div>
                <span className="text-[11px] font-mono text-ink-3">点击卡片聚焦右侧档案 ➜</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.groups.flatMap((g) => g.nodes).filter((n) => n.is_seed || data.recommended.includes(n.domain_id)).map((n) => node(n))}
              </div>
            </div>

            {/* 底部功能导航操作栏 */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {onGoTodo && (
                <button onClick={onGoTodo} className="btn btn-primary !py-2.5 !px-5 !text-[13.5px] !font-bold rounded-xl shadow-xs hover:shadow-md transition cursor-pointer">
                  进入今日自适应练习路径<ArrowRight size={15} weight="bold" />
                </button>
              )}
              {onGoQuiz && (
                <button onClick={onGoQuiz} className="btn rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink hover:border-primary hover:text-primary transition cursor-pointer">
                  自适应模考组卷 (723题)
                </button>
              )}
              <button onClick={onProceed} className="btn rounded-xl border border-line bg-white px-4 py-2.5 text-xs font-semibold text-ink-2 hover:border-primary hover:text-primary transition cursor-pointer">
                全真摸底自测
              </button>
              <button onClick={onSkip} className="btn rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-ink-3 hover:text-ink transition cursor-pointer">
                跳过学习，直接摸底
              </button>
            </div>
          </div>

          {/* 右侧智能驾驶舱 HUD */}
          <div className="space-y-4 lg:sticky lg:top-20">
            {selectedChapter ? (
              /* 状态 B：已选中章节临床档案 (Clinical Dossier) */
              <motion.div
                key={`inspector-${selectedChapter.domain_id}`}
                initial={{ opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="rounded-2xl border border-line bg-white p-5 shadow-xs space-y-4"
              >
                {/* 顶栏：章节编码与关闭按钮 */}
                <div className="flex items-start justify-between border-b border-line/60 pb-3">
                  <div>
                    <p className="text-[10px] font-mono tracking-wider text-ink-3 uppercase">
                      CH.{selectedChapter.book_chapter_no ?? '00'} // {selectedGroup?.name ?? 'PHARMACOLOGY'}
                    </p>
                    <h3 className="text-lg font-bold text-ink leading-tight mt-0.5">{selectedChapter.title}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedChapter(null)}
                    title="返回能力雷达概览"
                    className="grid size-7 place-items-center rounded-lg text-ink-3 hover:bg-paper-2 hover:text-ink transition cursor-pointer"
                  >
                    <X size={15} weight="bold" />
                  </button>
                </div>

                {/* 状态徽标 */}
                <div className="flex flex-wrap items-center gap-2">
                  {selectedChapter.studied?.passed ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-mono font-bold text-emerald-800">
                      <CheckCircle size={12} weight="fill" /> 随堂已达标 ({selectedChapter.studied.score}/{selectedChapter.studied.total})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-paper border border-line px-2 py-0.5 text-xs font-mono text-ink-3">
                      待随堂速测考核
                    </span>
                  )}
                  {selectedChapter.is_seed && (
                    <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10.5px] font-mono font-bold text-slate-700">
                      人卫九版示范重点
                    </span>
                  )}
                </div>

                {/* 核心大纲与教学目标 */}
                <div className="rounded-xl border border-line bg-paper-1/40 p-3 text-xs text-ink-2 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-ink">
                    <BookOpenText size={13} className="text-primary" />
                    <span>统编教材教学目标与考纲要点</span>
                  </div>
                  <p className="leading-relaxed text-[12px] text-ink-2">
                    {selectedChapter.objective || '统编教材大纲核心章节，涵盖该类药物的作用机制、受体靶点效应、临床适应症及典型不良反应。'}
                  </p>
                </div>

                {/* 章节操作流 */}
                <div className="space-y-2 pt-1">
                  {userId && (
                    <button
                      onClick={() => setActiveQuizChapter(selectedChapter)}
                      className="w-full btn btn-primary font-bold py-2.5 px-4 rounded-xl shadow-xs hover:shadow-md transition flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                      <Lightning size={14} weight="fill" />
                      即刻随堂自测 (3题速测)
                    </button>
                  )}
                  <button
                    onClick={() => onOpen(selectedChapter)}
                    className="w-full btn rounded-xl border border-line bg-white text-ink font-semibold py-2 px-4 hover:border-primary hover:text-primary transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                  >
                    <BookOpenText size={13} />
                    查看微观图谱与教学大纲 ➜
                  </button>
                  {onAskAi && (
                    <button
                      onClick={() => onAskAi(`药理学 - ${selectedChapter.title}`, `老师好，请为我系统梳理《${selectedChapter.title}》的核心考点、药效关系推导与常考易混药对。`)}
                      className="w-full btn rounded-xl border border-transparent text-ink-3 hover:text-ink transition flex items-center justify-center gap-1.5 cursor-pointer text-xs"
                    >
                      <Sparkle size={12} />
                      药学助教本章深度导学
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
              /* 状态 A：默认全域掌握度雷达与六大系统概览 */
              <div className="space-y-4">
                {/* 六大系统掌握度雷达（真实达标率） */}
                <PharmacologyRadar
                  groupStats={groupStats}
                  overallPct={overallPct}
                  doneCount={doneCount}
                  totalCount={totalDomains}
                  seedCount={seedCount}
                />

                {/* 六大药理系统达标分解 */}
                <div className="rounded-3xl border border-line bg-white p-5 shadow-xs space-y-3">
                  <p className="text-xs font-black text-ink tracking-tight">
                    六大药理系统掌握分解
                  </p>
                  <div className="space-y-2.5">
                    {data.groups.map((g) => {
                      const gDone = g.nodes.filter((n) => n.studied?.passed).length
                      const gTotal = g.nodes.length
                      const gPct = Math.round((gDone / (gTotal || 1)) * 100)
                      return (
                        <div
                          key={g.key}
                          onClick={() => {
                            const firstSeed = g.nodes.find((n) => n.is_seed) || g.nodes[0]
                            if (firstSeed) setSelectedChapter(firstSeed)
                          }}
                          className="group rounded-xl border border-line-2 bg-paper-1/40 p-2.5 hover:border-primary/40 hover:bg-primary-soft/30 transition cursor-pointer"
                        >
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-bold text-ink group-hover:text-primary transition">{g.name}</span>
                            <span className="text-[11px] font-semibold text-ink-3">
                              {gDone}/{gTotal} ({gPct}%)
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                              style={{ width: `${Math.max(gPct, 4)}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[11px] text-ink-3 text-center pt-1">
                    💡 点击图谱中任意节点或上方系统，调取深入巡航卡
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 列表视图 */
        <div className="mt-6 space-y-4">
          {data.groups.map((g, gi) => {
            const gDone = g.nodes.filter((n) => n.studied?.passed).length
            return (
              <motion.div key={g.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: gi * 0.05 }} className="spot-card p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="capsule" />
                  <p className="text-sm font-bold text-ink">{g.name}</p>
                  <span className="rounded-full bg-paper-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
                    {gDone}/{g.nodes.length} 达标
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.nodes.map((n) => node(n))}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* 随堂自测弹窗 */}
      {activeQuizChapter && userId && (
        <QuickQuizModal
          userId={userId}
          chapter={activeQuizChapter}
          onClose={() => setActiveQuizChapter(null)}
          onSuccess={() => {
            onRefreshMap?.()
          }}
          onAskAi={onAskAi}
        />
      )}

      <p className="mt-4 text-xs text-ink-3">{data.note}</p>
    </motion.div>
  )
}

/* 易混药对鉴别卡片：左右分栏对比呈现，确保两药机制各成连贯完整的句子 */
