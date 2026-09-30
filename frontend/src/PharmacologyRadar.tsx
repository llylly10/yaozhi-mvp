import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Brain } from '@phosphor-icons/react'

export interface GroupStat {
  name: string
  passed: number
  total: number
  pct: number
}

interface Props {
  groupStats: GroupStat[]
  overallPct: number
  doneCount: number
  totalCount: number
  seedCount: number
  className?: string
}

interface DimensionMetric {
  name: string
  code: string
  score: number
  ref: number
  status: 'PASS' | 'WARN' | 'CRIT'
  statusText: string
}

// 雷达轴短标签（group 全名在 h-52 小图上过挤）
const AXIS_SHORT: Record<string, string> = {
  '总论·自主神经': '总论·自主',
  '中枢神经系统药': '中枢神经',
  '心血管·血液系统药': '心血管血液',
  '呼吸消化·内分泌代谢': '呼吸消化代谢',
  '抗感染药': '抗感染',
  '肿瘤与其他': '肿瘤其他',
}
const axisName = (n: string) => AXIS_SHORT[n] ?? n

const TARGET = 60 // 目标参考线：自设口径（随堂摸底通过章节占比），非官方常模

export function PharmacologyRadar({
  groupStats,
  overallPct,
  doneCount,
  totalCount,
  seedCount,
  className = '',
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const [showTarget, setShowTarget] = useState(true)

  // 六大系统真实达标率：随堂摸底通过章节占比（学习地图真实数据，非推导值）
  const scores = groupStats.map((g) => g.pct)

  const dimensions: DimensionMetric[] = groupStats.map((g) => ({
    name: g.name,
    code: `${g.passed}/${g.total} 章`,
    score: g.pct,
    ref: TARGET,
    status: g.pct >= TARGET ? 'PASS' : g.pct >= 30 ? 'WARN' : 'CRIT',
    statusText: g.pct >= TARGET ? '达标' : g.pct >= 30 ? '推进中' : '待启动',
  }))

  useEffect(() => {
    if (!chartRef.current) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    const chart = chartInstance.current

    const seriesData: echarts.RadarSeriesOption['data'] = [
      {
        value: scores,
        name: '系统达标率（真实）',
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          color: '#0E7A63',
          width: 2.2,
          shadowColor: 'rgba(14, 122, 99, 0.25)',
          shadowBlur: 6,
        },
        itemStyle: {
          color: '#0E7A63',
          borderColor: '#ffffff',
          borderWidth: 1.5,
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(14, 122, 99, 0.35)' },
            { offset: 1, color: 'rgba(14, 122, 99, 0.05)' },
          ]),
        },
      },
    ]

    if (showTarget) {
      seriesData.push({
        value: groupStats.map(() => TARGET),
        name: `目标线（自设 ${TARGET}%）`,
        symbol: 'none',
        lineStyle: {
          color: '#64748B',
          width: 1.5,
          type: 'dashed',
        },
        areaStyle: {
          color: 'rgba(100, 116, 139, 0.06)',
        },
      })
    }

    const option: echarts.EChartsOption = {
      tooltip: {
        trigger: 'item',
        backgroundColor: '#1E293B',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        textStyle: { color: '#F8FAFC', fontSize: 11, fontFamily: 'monospace' },
        formatter: (params: any) => {
          const val = (params.value as number[]) || []
          const rows = groupStats
            .map(
              (g, i) =>
                `<div>${g.name}: <b>${val[i] ?? 0}%</b>（${g.passed}/${g.total} 章）</div>`,
            )
            .join('')
          return `
            <div style="font-weight:700;margin-bottom:4px;color:#34D399;font-size:12px;">${params.name}</div>
            ${rows}
          `
        },
      },
      radar: {
        indicator: groupStats.map((g) => ({ name: axisName(g.name), max: 100 })),
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          color: '#475569',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        },
        splitLine: {
          lineStyle: {
            color: 'rgba(15, 23, 42, 0.08)',
          },
        },
        splitArea: {
          show: true,
          areaStyle: {
            color: ['rgba(255, 255, 255, 0.6)', 'rgba(248, 250, 252, 0.4)'],
          },
        },
        axisLine: {
          lineStyle: {
            color: 'rgba(15, 23, 42, 0.10)',
          },
        },
        radius: '66%',
        center: ['50%', '50%'],
      },
      series: [
        {
          type: 'radar',
          data: seriesData,
        },
      ],
    }

    chart.setOption(option)

    const handleResize = () => chart.resize()
    window.addEventListener('resize', handleResize)
    // SPA 切页不触发 window resize：容器尺寸变化靠 ResizeObserver 自愈
    // （雷达坐标系 resize 即按新尺寸重排；observe 的首次回调顺带修正初始化时机的尺寸偏差）
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)
    return () => {
      window.removeEventListener('resize', handleResize)
      ro.disconnect()
    }
  }, [groupStats, showTarget])

  return (
    <div className={`rounded-2xl border border-line bg-white p-4.5 shadow-xs space-y-3.5 ${className}`}>
      {/* 临床仪器级头部 */}
      <div className="flex items-center justify-between border-b border-line/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-lg bg-primary/10 text-primary">
            <Brain size={15} weight="bold" />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-ink tracking-tight">六大系统掌握度谱</h4>
              <span className="rounded bg-paper px-1.5 py-0.2 text-[9.5px] font-mono text-ink-3 border border-line">
                SYS·6
              </span>
            </div>
            <p className="text-[10px] font-mono text-ink-3 mt-0.5">MASTERY BY SIX SYSTEM GROUPS · REAL DATA</p>
          </div>
        </div>
        <button
          onClick={() => setShowTarget(!showTarget)}
          className={`rounded-lg px-2 py-1 text-[10.5px] font-mono font-semibold transition border cursor-pointer ${
            showTarget
              ? 'bg-slate-100 border-slate-300 text-slate-800'
              : 'bg-paper border-line text-ink-3 hover:text-ink'
          }`}
          title="切换 60% 目标参考线（自设口径，非官方常模）"
        >
          {showTarget ? '目标线: 开' : '目标线: 关'}
        </button>
      </div>

      {/* 雷达图主画布 */}
      <div className="relative py-1">
        <div ref={chartRef} className="h-52 w-full" />
      </div>

      <div className="space-y-1.5 border-t border-line/60 pt-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-3 px-1 uppercase tracking-wider">
          <span>系统维度 (SYSTEM GROUP)</span>
          <span>达标 · 判定</span>
        </div>

        <div className="space-y-1">
          {dimensions.map((d) => (
            <div
              key={d.name}
              className="flex items-center justify-between rounded-lg p-1.5 hover:bg-paper-1/60 transition"
            >
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <span
                  className="size-1.5 flex-none rounded-full"
                  style={{
                    background:
                      d.status === 'PASS' ? '#0E7A63' : d.status === 'WARN' ? '#D97706' : '#E11D48',
                  }}
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-ink truncate leading-tight">{d.name}</p>
                  <p className="text-[9.5px] font-mono text-ink-3 leading-none mt-0.5">
                    {d.code} · 目标 {d.ref}%（自设）
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 flex-none">
                {/* 极简发丝级进度条 */}
                <div className="w-14 h-1.5 rounded-full bg-paper-2 overflow-hidden hidden sm:block">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${d.score}%`,
                      background:
                        d.status === 'PASS' ? '#0E7A63' : d.status === 'WARN' ? '#D97706' : '#E11D48',
                    }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-[11.5px] font-bold text-ink">
                  {d.score}%
                </span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${
                    d.status === 'PASS'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : d.status === 'WARN'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {d.statusText}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部全域达标状态条 */}
      <div className="flex items-center justify-between border-t border-line/60 pt-2.5 text-[11px] text-ink-3 font-mono">
        <span>全域达标: <strong className="text-primary font-bold">{doneCount}</strong>/{totalCount} 章</span>
        <span>示范重点: <strong className="text-slate-800 font-bold">{seedCount}</strong> 章</span>
        <span className="font-bold text-ink">总评: {overallPct}%</span>
      </div>
    </div>
  )
}
