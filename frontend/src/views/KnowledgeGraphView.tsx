import { useState, useEffect, useMemo, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import * as echarts from 'echarts'
import { MagnifyingGlass, Plus, Minus, ArrowsCounterClockwise, CornersOut, CornersIn } from '@phosphor-icons/react'
import { EvidenceNote, NodeChip } from '../components/ui'
import { type KgEdgeT, type KgNodeT, type KgTabDef } from '../lib/shared'
export const KG_DOT: Record<string, string> = {
  核心: '#0e7a5f', 系统: '#1d4ed8', 章节: '#0e7a5f', 示范: '#b8860b', 已达标: '#2e7d32', 节: '#ffffff', 药物: '#b8860b', 类别: '#9aa0a8', 知识点: '#c3c9c2',
  靶点: '#7c5cd6', 效应: '#2e7d32', 禁忌: '#c0392b', 适应证: '#b8860b', 机制: '#5b7fa6', 其他: '#9aa0a8',
  题目: '#334155', 错因: '#c0392b',
}

export const KG_RING: Record<string, string> = {
  核心: '#0e7a5f', 系统: '#2563eb', 章节: '#0e7a5f', 示范: '#b8860b', 已达标: '#2e7d32', 节: '#0e7a5f', 知识点: '#8a8f98', 类别: '#8a8f98',
}

export const KG_LINE: Record<string, string> = {
  '包含': '#d5dbd7', '属于': '#0e7a5f',
  '作用于': '#7c5cd6', '表现为': '#5b7fa6', '禁忌用于': '#c0392b', '适应证': '#b8860b', '与…相互作用': '#7c5cd6',
  '涉及': '#0e7a5f', '归因': '#b8860b',
}

export const KG_LABEL_TYPES = new Set(['核心', '系统', '章节', '示范', '已达标', '节', '药物'])

/** 自定义视图：错题关联图谱等场景覆盖默认三视图（全部/结构/药物）。 */

export function kgOrbit(names: string[], types: Map<string, string>, adj: Map<string, string[]>, center: string, W: number, H: number): { pos: Map<string, [number, number]>; ang: Map<string, number> } {
  const centerType = types.get(center)
  const layer = new Map<string, number>([[center, 0]])
  const parent = new Map<string, string>()
  const queue = [center]
  while (queue.length) {
    const u = queue.shift()!
    const next = [...(adj.get(u) ?? [])].filter((n) => !layer.has(n)).sort()
    for (const n of next) { layer.set(n, (layer.get(u) ?? 0) + 1); parent.set(n, u); queue.push(n) }
  }
  for (const n of names) if (!layer.has(n)) layer.set(n, 3)
  // 章节型中心：直连药物下沉到外环（parent 仍记中心，布局时整圆均分）
  if (centerType === '章节') {
    for (const n of names) {
      if (n !== center && types.get(n) === '药物' && layer.get(n) === 1) layer.set(n, 2)
    }
  }
  const cx = W / 2; const cy = H / 2
  const R = Math.max(60, Math.min(W, H) / 2 - 46)
  const ring = [0, R * 0.5, R * 0.8, R * 1.0]
  const pos = new Map<string, [number, number]>([[center, [cx, cy]]])
  const ang = new Map<string, number>()
  const at = (d: number) => names.filter((n) => layer.get(n) === d).sort()
  const l1 = at(1)
  l1.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(l1.length, 1)
    ang.set(n, a)
    pos.set(n, [cx + ring[1] * Math.cos(a), cy + ring[1] * Math.sin(a) * 0.94])
  })
  for (let d = 2; d <= 3; d++) {
    const kids = new Map<string, string[]>()
    for (const n of at(d)) {
      const p = parent.get(n) ?? center
      if (!kids.has(p)) kids.set(p, [])
      kids.get(p)!.push(n)
    }
    const orderedParents = [...kids.keys()].sort((a, b) => (ang.get(a) ?? 0) - (ang.get(b) ?? 0))
    for (const p of orderedParents) {
      const group = kids.get(p)!.sort()
      // 直连中心的成组节点（如下沉药物）：整圆均分，保证外环可读
      if (p === center) {
        group.forEach((n, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(group.length, 1)
          ang.set(n, a)
          const r = ring[Math.min(d, 3)] + (i % 2 === 1 ? 26 : 0)
          pos.set(n, [cx + r * Math.cos(a), cy + r * Math.sin(a) * 0.94])
        })
        continue
      }
      const pa = ang.get(p) ?? -Math.PI / 2
      const span = d === 2 ? Math.min(2.4, (2 * Math.PI) / Math.max(orderedParents.length, 1) * 0.95) : 0.9
      group.forEach((n, i) => {
        const a = pa + (group.length === 1 ? 0 : (i - (group.length - 1) / 2) * Math.max(0.2, span / Math.max(group.length, 1)))
        ang.set(n, a)
        // 相邻节点半径交错，给切向标签腾地方
        const r = ring[Math.min(d, 3)] + (i % 2 === 1 ? 26 : 0)
        pos.set(n, [cx + r * Math.cos(a), cy + r * Math.sin(a) * 0.94])
      })
    }
  }
  return { pos, ang }
}

/** 切向标签旋转角（度）：文字沿轨道切线走，左侧翻转保证正读。 */

export function kgLabelRotate(a: number): number {
  let deg = (a * 180) / Math.PI + 90
  while (deg > 90) deg -= 180
  while (deg <= -90) deg += 180
  return Math.round(deg)
}

const KG_HUB_TYPE_ORDER = ['章节', '节', '类别', '靶点', '机制', '效应', '禁忌', '适应证', '知识点', '药物', '错因']

/** 错题关联二部图布局（2026-10-07）：枢纽（章节/药物/错因等）内环按类型分组分扇区，
    题目外环归入主枢纽扇区；跨枢纽的题落在其枢纽圆均值角（扇区交界）——
    「连到同一枢纽的题该一起复习」在角度上直接可见，边短且少交叉。
    纯函数、确定性（同数据同布局），仅错题关联图谱启用（layout="hub"）。 */
export function kgHubLayout(names: string[], types: Map<string, string>, adj: Map<string, string[]>, W: number, H: number): { pos: Map<string, [number, number]>; ang: Map<string, number>; core: string | null } {
  const isQ = (n: string) => types.get(n) === '题目'
  const hubs0 = names.filter((n) => !isQ(n))
  const qs = names.filter(isQ)
  const cx = W / 2; const cy = H / 2
  const R = Math.max(60, Math.min(W, H) / 2 - 46)
  const pos = new Map<string, [number, number]>()
  const ang = new Map<string, number>()
  if (!hubs0.length) { // 纯题目互连：整圆均分兜底
    qs.forEach((n, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(qs.length, 1)
      ang.set(n, a); pos.set(n, [cx + R * 0.8 * Math.cos(a), cy + R * 0.8 * Math.sin(a)])
    })
    return { pos, ang, core: null }
  }
  const deg = (n: string) => (adj.get(n) ?? []).length
  const typeRank = (t: string) => { const i = KG_HUB_TYPE_ORDER.indexOf(t); return i === -1 ? 50 : i }
  const hubs = [...hubs0].sort((a, b) =>
    typeRank(types.get(a) ?? '其他') - typeRank(types.get(b) ?? '其他')
    || deg(b) - deg(a) || a.localeCompare(b))
  // 扇区按 (度+2) 加权：大枢纽多占角度，装得下它的题
  const weights = hubs.map((h) => deg(h) + 2)
  const wSum = weights.reduce((s, x) => s + x, 0)
  const spanOf = new Map<string, [number, number]>()
  const hubAng = new Map<string, number>()
  let acc = -Math.PI / 2
  hubs.forEach((h, i) => {
    const span = 2 * Math.PI * (weights[i] / wSum)
    spanOf.set(h, [acc, acc + span])
    hubAng.set(h, acc + span / 2)
    acc += span
  })
  // 椭圆轨道吃满宽画布；三环：枢纽内环 / 多枢纽题中环 / 单枢纽题外环
  const rx = Math.min(W / 2 - 56, R * 1.42)
  const ry = R
  const ring = (a: number, kx: number, ky: number): [number, number] => [cx + rx * kx * Math.cos(a), cy + ry * ky * Math.sin(a)]
  for (const h of hubs) {
    const a = hubAng.get(h)!
    ang.set(h, a)
    pos.set(h, ring(a, 0.5, 0.46))
  }
  // 连 ≥4 个枢纽的题是这张图的重心候选：取连枢纽最多者为圆心（边全变短辐条）；
  // 其余多枢纽题放中环扇区交界；单枢纽题外环归入主枢纽扇区
  const singles = new Map<string, string[]>()
  const mid: string[] = []
  const heavy: { q: string; n: number }[] = []
  for (const q of qs) {
    const hs = [...new Set(adj.get(q) ?? [])].filter((n) => hubAng.has(n))
    if (!hs.length) { mid.push(q); continue }
    if (hs.length >= 4) { heavy.push({ q, n: hs.length }); continue }
    hs.sort((a, b) => deg(b) - deg(a) || hubs.indexOf(a) - hubs.indexOf(b))
    if (hs.length === 1) {
      const p = hs[0]
      if (!singles.has(p)) singles.set(p, [])
      singles.get(p)!.push(q)
    } else mid.push(q)
  }
  heavy.sort((a, b) => b.n - a.n || deg(b.q) - deg(a.q) || a.q.localeCompare(b.q))
  const core = heavy[0]?.q ?? null
  for (const { q } of heavy) if (q !== core) mid.push(q)
  if (core) { ang.set(core, 0); pos.set(core, [cx, cy]) }
  for (const [h, group] of singles) {
    const [s, e] = spanOf.get(h)!
    group.sort()
    group.forEach((q, i) => {
      const a = s + (e - s) * ((i + 0.5) / group.length)
      ang.set(q, a)
      pos.set(q, ring(a, 0.94, 0.94 - (i % 2) * 0.13))
    })
  }
  mid.sort()
  const bucket = new Map<string, number>()
  mid.forEach((q, i) => {
    const hs = [...new Set(adj.get(q) ?? [])].filter((n) => hubAng.has(n))
    let sx = 0; let sy = 0
    for (const h of hs) { sx += Math.cos(hubAng.get(h)!); sy += Math.sin(hubAng.get(h)!) }
    const base = hs.length ? Math.atan2(sy / hs.length, sx / hs.length) : -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(mid.length, 1)
    const k = bucket.get(base.toFixed(2)) ?? 0
    bucket.set(base.toFixed(2), k + 1)
    const a = base + k * 0.16
    ang.set(q, a)
    pos.set(q, ring(a, 0.8, 0.78 - (i % 3) * 0.1))
  })
  return { pos, ang, core }
}

export function KnowledgeGraphView({ nodes, edges, title, tabDefs, labelTypes, centerMode, palette, onNodeClick, height, layout }: {
  nodes?: KgNodeT[]; edges: KgEdgeT[]; title?: string
  tabDefs?: KgTabDef[]; labelTypes?: Set<string>; centerMode?: 'auto' | 'degree'
  palette?: Record<string, string>; onNodeClick?: (name: string) => void
  height?: number; layout?: 'orbit' | 'hub'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const renderRef = useRef<(() => void) | null>(null)
  const [tab, setTab] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selEdge, setSelEdge] = useState<number | null>(null)
  const [selNode, setSelNode] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const reduceMotion = useReducedMotion()
  const dot = (t: string) => palette?.[t] ?? KG_DOT[t] ?? KG_DOT['其他']
  const showSet = labelTypes ?? KG_LABEL_TYPES
  const defs: KgTabDef[] = useMemo(() => tabDefs ?? [
    { k: 'all', label: `全部 ${edges.length}`, match: () => true },
    { k: 'struct', label: '结构', match: (e) => e.edge === '包含' || (e.edge === '属于' && e.source.type !== '药物') },
    { k: 'drug', label: '药物', match: (e) => e.source.type === '药物' || e.target.type === '药物' },
  ], [tabDefs, edges.length])
  const activeDef = defs.find((d) => d.k === tab) ?? defs[0]
  const shown = useMemo(() => edges.slice(0, 120).filter(activeDef.match), [edges, activeDef])

  const nodeList = useMemo<KgNodeT[]>(() => {
    const m = new Map<string, string>()
    for (const e of shown) {
      if (e.source?.name && !m.has(e.source.name)) m.set(e.source.name, e.source.type || '其他')
      if (e.target?.name && !m.has(e.target.name)) m.set(e.target.name, e.target.type || '其他')
    }
    if (nodes && nodes.length) {
      for (const n of nodes) if (m.has(n.name)) m.set(n.name, n.type || m.get(n.name)!)
    }
    return [...m.entries()].map(([name, type]) => ({ name, type }))
  }, [nodes, shown])

  const degree = useMemo(() => {
    const d = new Map<string, number>()
    for (const e of shown) {
      d.set(e.source.name, (d.get(e.source.name) ?? 0) + 1)
      d.set(e.target.name, (d.get(e.target.name) ?? 0) + 1)
    }
    return d
  }, [shown])

  const center = useMemo(() => {
    if (centerMode !== 'degree') {
      const chap = nodeList.find((n) => n.type === '核心' || n.type === '学科') ?? nodeList.find((n) => n.type === '章节')
      if (chap) return chap.name
    }
    let best = nodeList[0]?.name ?? ''
    let bestScore = -1
    for (const n of nodeList) {
      const s = (degree.get(n.name) ?? 0) * 10 + (n.type === '药物' ? 1 : 0)
      if (s > bestScore) { bestScore = s; best = n.name }
    }
    return best
  }, [nodeList, degree, centerMode])

  // 标签纪律：章节·节·药物常显（切向旋转 + 半径交错处理密度）；知识点/类别悬停才显
  const types = useMemo(() => [...new Set(nodeList.map((n) => n.type || '其他'))], [nodeList])

  useEffect(() => {
    setSelEdge(null); setSelNode(null)
  }, [tab, edges])

  useEffect(() => {
    if (!ref.current) return
    if (nodeList.length === 0) {
      // 空视角：销毁旧图（切 tab 残留），只留头部导航可点回
      chartRef.current?.dispose()
      chartRef.current = null
      return
    }
    let chart = chartRef.current
    if (!chart) {
      try { chart = echarts.init(ref.current); chartRef.current = chart }
      catch { return }
    }
    const render = () => {
      if (!chart || !ref.current) return
      const W = chart.getWidth() || ref.current.clientWidth || 600
      const H = chart.getHeight() || (height ?? 380)
      const adj = new Map<string, string[]>()
      for (const e of shown) {
        if (!adj.has(e.source.name)) adj.set(e.source.name, [])
        if (!adj.has(e.target.name)) adj.set(e.target.name, [])
        adj.get(e.source.name)!.push(e.target.name)
        adj.get(e.target.name)!.push(e.source.name)
      }
      const typesMap = new Map(nodeList.map((n) => [n.name, n.type || '其他']))
      const hub = layout === 'hub' ? kgHubLayout(nodeList.map((n) => n.name), typesMap, adj, W, H) : null
      const { pos, ang } = hub ?? (center ? kgOrbit(nodeList.map((n) => n.name), typesMap, adj, center, W, H) : { pos: new Map<string, [number, number]>(), ang: new Map<string, number>() })
      const coreNode = hub?.core ?? null
      chart.setOption({
        animationDuration: reduceMotion ? 0 : 500,
        animationEasing: 'cubicOut',
        tooltip: {
          trigger: 'item', confine: true,
          backgroundColor: 'rgba(255,255,255,0.97)', borderColor: '#e3e8e5', borderWidth: 1,
          textStyle: { color: '#1f2a26', fontSize: 12 },
          formatter: (p: { dataType?: string; data?: { tip?: string } }) => p.data?.tip ?? '',
        },
        series: [{
          type: 'graph', layout: 'none', roam: true, draggable: false,
          data: nodeList.map((n) => {
            const [x, y] = pos.get(n.name) ?? [W / 2, H / 2]
            const t = n.type || '其他'
            const showLabel = showSet.has(t)
            const isCenter = layout === 'hub' ? n.name === coreNode : n.name === center
            const a = ang.get(n.name) ?? 0
            const outward = Math.cos(a) >= 0
            // 长名截断：节名多为长短语，超过 7 字只显示前 7 字（全名进 tooltip/详情）
            const maxLen = t === '节' ? 7 : (t === '章节' || t === '示范' || t === '已达标') ? 13 : 9
            const lbl = n.name.length > maxLen ? `${n.name.slice(0, maxLen)}…` : n.name
            return {
              name: n.name, x, y, category: t,
              tip: `<b>${n.name}</b><br/>${t} · 连边 ${degree.get(n.name) ?? 0} 条<br/><span style="color:#0e7a5f">${(t === '章节' || t === '示范' || t === '已达标') ? '点击聚焦并在下方进入章节自学' : '点击聚焦邻域'}</span>`,
              symbolSize: t === '核心' ? 44 : t === '系统' ? 32 : (t === '章节' || t === '示范' || t === '已达标') ? (isCenter ? 40 : 20) : t === '题目' ? (isCenter ? 30 : 26) : t === '药物' ? 20 : t === '节' ? 24 : t === '错因' ? 22 : 14,
              itemStyle: {
                color: dot(t),
                borderColor: KG_RING[t] ?? '#ffffff', borderWidth: 2.5,
                shadowColor: 'rgba(14,122,95,0.18)', shadowBlur: 8,
              },
              label: {
                show: showLabel,
                // hub 模式核心题尺寸小，内置标签装不下——与其他节点一致用外置水平标签
                position: isCenter && layout !== 'hub' ? 'inside' : outward ? 'right' : 'left',
                distance: 7, rotate: isCenter || layout === 'hub' ? 0 : kgLabelRotate(a),
                formatter: lbl,
                fontSize: isCenter ? 13 : t === '系统' ? 11 : (t === '章节' || t === '示范' || t === '已达标') ? 10 : 10,
                fontWeight: (isCenter || t === '系统') ? 700 : 500,
                color: isCenter && layout !== 'hub' ? '#ffffff' : '#1f2a26',
                textBorderColor: isCenter && layout !== 'hub' ? 'transparent' : 'rgba(255,255,255,0.92)',
                textBorderWidth: 3,
              },
              emphasis: { scale: 1.3, label: { show: true, rotate: 0 } },
            }
          }),
          links: shown.map((e, i) => ({
            id: `e${i}`, source: e.source.name, target: e.target.name,
            tip: `<b>${e.source.name} —${e.edge}→ ${e.target.name}</b>${e.note ? `<br/>${e.note}` : ''}<br/><span style="color:#0e7a5f">点击查看出处</span>`,
            lineStyle: { width: e.edge === '属于' ? 1.6 : 1.2, opacity: e.edge === '属于' ? 0.55 : 0.8, color: KG_LINE[e.edge] ?? '#c9d1cd', curveness: 0.18 },
            emphasis: { lineStyle: { width: 3, color: '#0e7a5f', opacity: 1 } },
          })),
          emphasis: { focus: 'adjacency' },
        }],
      }, true)
    }
    renderRef.current = render
    render()
    chart.off('click')
    chart.on('click', (p) => {
      const d = p as unknown as { dataType?: string; data?: { id?: string } | null; name?: string }
      if (d.dataType === 'edge' && typeof d.data?.id === 'string' && d.data.id.startsWith('e')) {
        const i = Number(d.data.id.slice(1))
        if (Number.isFinite(i) && shown[i]) { setSelEdge(i); setSelNode(null) }
      } else if (d.dataType === 'node' && d.name) {
        setSelNode(d.name); setSelEdge(null)
        onNodeClick?.(d.name)
      }
    })
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      chart?.resize()
      if (timer) clearTimeout(timer)
      timer = setTimeout(render, 180)
    }
    window.addEventListener('resize', onResize)
    // 容器尺寸自愈：SPA 切页/全屏切换不触发 window resize，而本图是像素级布局
    // （layout:'none' + 显式坐标），容器以旧尺寸初始化后只 resize 不重算坐标照样偏心，
    // 必须防抖重跑 render 按新宽高重建轨道位置。
    let roTimer: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      chart?.resize()
      if (roTimer) clearTimeout(roTimer)
      roTimer = setTimeout(render, 120)
    })
    ro.observe(ref.current)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
      if (roTimer) clearTimeout(roTimer)
      ro.disconnect()
    }
  }, [nodeList, shown, center, degree, reduceMotion, onNodeClick])

  useEffect(() => () => { chartRef.current?.dispose(); chartRef.current = null }, [])

  // 空视角只替换画布区：头部 tabs/搜索/图例常驻，保证随时可点回（此前 early return 吃掉整组导航）
  const empty = nodeList.length === 0
  const edge = !empty && selEdge != null ? shown[selEdge] : null
  const nodeEdges = selNode ? shown.map((e, i) => ({ e, i })).filter(({ e }) => e.source.name === selNode || e.target.name === selNode) : []
  const nodeType = nodeList.find((n) => n.name === selNode)?.type

  function focus(name: string) {
    setSelNode(name); setSelEdge(null)
    const chart = chartRef.current
    if (!chart) return
    const idx = nodeList.findIndex((n) => n.name === name)
    if (idx >= 0) {
      chart.dispatchAction({ type: 'unfocusNodeAdjacency', seriesIndex: 0 })
      chart.dispatchAction({ type: 'focusNodeAdjacency', seriesIndex: 0, dataIndex: idx })
    }
  }

  function submitSearch() {
    const q = query.trim()
    if (!q) return
    const hit = nodeList.find((n) => n.name === q) ?? nodeList.find((n) => n.name.includes(q))
    if (hit) focus(hit.name)
  }

  const handleZoom = (factor: number) => {
    const chart = chartRef.current
    if (!chart || !ref.current) return
    const W = chart.getWidth() || ref.current.clientWidth || 600
    const H = chart.getHeight() || 400
    chart.dispatchAction({
      type: 'graphRoam',
      seriesIndex: 0,
      zoom: factor,
      originX: W / 2,
      originY: H / 2,
    })
  }

  const handleReset = () => {
    if (renderRef.current) {
      renderRef.current()
    }
  }

  const handleToggleFullscreen = () => {
    const next = !isFullscreen
    setIsFullscreen(next)
    setTimeout(() => {
      chartRef.current?.resize()
      renderRef.current?.()
    }, 320)
  }

  return (
    <div className={`overflow-hidden transition-all duration-300 ${
      isFullscreen
        ? 'fixed inset-0 z-50 bg-paper/95 p-6 backdrop-blur-2xl flex flex-col justify-between m-0 rounded-none shadow-2xl'
        : 'mb-3 rounded-2xl border border-line bg-white shadow-[0_8px_28px_-18px_rgba(14,122,95,0.35)]'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3.5 pb-2 border-b border-line/60">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          <p className="text-xs font-bold text-ink tracking-tight">{title ?? '知识图谱'}</p>
          {isFullscreen && (
            <span className="rounded bg-primary/10 border border-primary/25 px-1.5 py-0.2 text-[10px] font-mono font-bold text-primary">
              FULLSCREEN
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitSearch() }}
            placeholder="搜实体，如硝苯地平" className="w-32 sm:w-40 rounded-lg border border-line bg-paper px-2.5 py-1 text-xs text-ink outline-none placeholder:text-ink-3 focus:border-primary" />
          <button onClick={submitSearch} aria-label="搜索实体"
            className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary transition active:scale-[0.95] cursor-pointer hover:bg-primary/20">
            <MagnifyingGlass size={13} weight="bold" />
          </button>
        </div>
        {/* 系统分类选项卡：精密分段器 (Segmented Control) */}
        <div className="w-full overflow-x-auto no-scrollbar scroll-smooth pt-1 touch-pan-x">
          <div className="inline-flex rounded-xl bg-paper-2 p-1 gap-1 border border-line/50">
            {defs.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer active:scale-[0.97] ${tab === t.k ? 'bg-white text-ink font-bold shadow-2xs' : 'text-ink-3 hover:text-ink'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[11px] font-mono text-ink-3">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="inline-block size-2 rounded-full shadow-2xs" style={{ background: dot(t) }} />{t}
          </span>
        ))}
        <span className="ml-auto text-[10px] font-mono font-medium text-ink-3 tracking-wider uppercase">{nodeList.length} NODES · {shown.length} EDGES</span>
      </div>
      {empty && (
        <div className="mx-4 mb-4 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-6 text-center text-xs text-ink-3">
          该视角暂无关联——点上方视图切回，或多做几道同章/同类错题后再看。
        </div>
      )}
      {/* 画布常驻挂载：带有医疗微网格背景与右下角悬浮 HUD 工具条 */}
      <div className="relative overflow-hidden medical-grid">
        {!empty && (
          <div className="absolute right-3.5 bottom-3.5 z-20 flex flex-col gap-1.5 pointer-events-auto">
            <button
              onClick={() => handleZoom(1.25)}
              className="hud-btn size-8 cursor-pointer"
              title="放大星轨拓扑"
              aria-label="放大"
            >
              <Plus size={15} weight="bold" />
            </button>
            <button
              onClick={() => handleZoom(0.8)}
              className="hud-btn size-8 cursor-pointer"
              title="缩小星轨拓扑"
              aria-label="缩小"
            >
              <Minus size={15} weight="bold" />
            </button>
            <button
              onClick={handleReset}
              className="hud-btn size-8 cursor-pointer"
              title="复位视角中心"
              aria-label="复位"
            >
              <ArrowsCounterClockwise size={15} weight="bold" />
            </button>
            <button
              onClick={handleToggleFullscreen}
              className="hud-btn size-8 cursor-pointer"
              title={isFullscreen ? '退出全屏' : '全屏沉浸模式'}
              aria-label={isFullscreen ? '退出全屏' : '全屏'}
            >
              {isFullscreen ? <CornersIn size={15} weight="bold" /> : <CornersOut size={15} weight="bold" />}
            </button>
          </div>
        )}
        <div
          ref={ref}
          style={{
            height: empty ? 0 : isFullscreen ? 'calc(100vh - 160px)' : (height ?? (typeof window !== 'undefined' && window.innerWidth < 768 ? 380 : 580)),
            width: '100%',
            display: empty ? 'none' : undefined
          }}
          className="cursor-grab active:cursor-grabbing"
        />
      </div>
      {!empty && (edge || selNode) && (
        <div className="border-t border-line bg-paper/70 px-4 py-2.5">
          {edge && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <NodeChip type={edge.source.type} name={edge.source.name} />
                <span className="text-[11px] font-medium text-primary">─{edge.edge}→</span>
                <NodeChip type={edge.target.type} name={edge.target.name} />
              </div>
              <EvidenceNote ev={edge.evidence ?? null} reviewStatus={edge.review_status} />
            </>
          )}
          {!edge && selNode && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <NodeChip type={nodeType ?? '其他'} name={selNode} />
                <span className="text-[11px] text-ink-3">连边 {nodeEdges.length} 条，点击行查看出处</span>
              </div>
              <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
                {nodeEdges.map(({ e, i }) => (
                  <button key={i} onClick={() => { setSelEdge(i); setSelNode(null) }}
                    className="flex w-full items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-left text-[11px] text-ink-2 transition-all hover:bg-primary-soft/50 active:scale-[0.99]">
                    <span className="font-medium text-ink">{e.source.name}</span>
                    <span className="flex-none rounded-full bg-paper-2 px-1.5 py-px font-semibold text-ink-3">{e.edge}</span>
                    <span className="font-medium text-ink">{e.target.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* 图谱证据锚点（2026-09-11）：每条边/每组辨析挂一条教材原文出处；无依据时如实标注，不伪造出处 */
