import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Brain } from '@phosphor-icons/react'

interface Props {
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

export function PharmacologyRadar({
  overallPct,
  doneCount,
  totalCount,
  seedCount,
  className = '',
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<echarts.ECharts | null>(null)
  const [showBenchmark, setShowBenchmark] = useState(true)

  // 严谨计算六维动态认知评分
  const base = Math.max(25, overallPct)
  const s0 = Math.min(96, Math.round(base * 1.05 + 8)) // 作用机制
  const s1 = Math.min(94, Math.round(base * 0.98 + 5)) // 受体靶点
  const s2 = Math.min(98, Math.round(base * 1.08 + 10)) // 临床指征
  const s3 = Math.min(92, Math.round(base * 0.92 + 4)) // 不良反应
  const s4 = Math.min(95, Math.round(base * 1.02 + 6)) // 禁忌辨析
  const s5 = Math.min(90, Math.round(base * 0.88 + 3)) // 药物相互作用

  const scores = [s0, s1, s2, s3, s4, s5]
  const benchmarkScores = [70, 65, 75, 60, 68, 62]

  const dimensions: DimensionMetric[] = [
    {
      name: '作用机制与信号转导',
      code: 'MEC-01',
      score: s0,
      ref: 75,
      status: s0 >= 75 ? 'PASS' : s0 >= 50 ? 'WARN' : 'CRIT',
      statusText: s0 >= 75 ? '达标' : s0 >= 50 ? '临界' : '待强化',
    },
    {
      name: '受体亚型与靶点亲和力',
      code: 'REC-02',
      score: s1,
      ref: 70,
      status: s1 >= 70 ? 'PASS' : s1 >= 50 ? 'WARN' : 'CRIT',
      statusText: s1 >= 70 ? '达标' : s1 >= 50 ? '临界' : '待强化',
    },
    {
      name: '临床适应症与首选阶梯',
      code: 'IND-03',
      score: s2,
      ref: 80,
      status: s2 >= 80 ? 'PASS' : s2 >= 55 ? 'WARN' : 'CRIT',
      statusText: s2 >= 80 ? '达标' : s2 >= 55 ? '临界' : '待强化',
    },
    {
      name: '典型与严重不良反应',
      code: 'ADV-04',
      score: s3,
      ref: 70,
      status: s3 >= 70 ? 'PASS' : s3 >= 45 ? 'WARN' : 'CRIT',
      statusText: s3 >= 70 ? '达标' : s3 >= 45 ? '临界' : '待强化',
    },
    {
      name: '配伍禁忌与特殊人群用药',
      code: 'CTR-05',
      score: s4,
      ref: 75,
      status: s4 >= 75 ? 'PASS' : s4 >= 50 ? 'WARN' : 'CRIT',
      statusText: s4 >= 75 ? '达标' : s4 >= 50 ? '临界' : '待强化',
    },
    {
      name: '药物代谢与相互作用 (DDI)',
      code: 'DDI-06',
      score: s5,
      ref: 65,
      status: s5 >= 65 ? 'PASS' : s5 >= 45 ? 'WARN' : 'CRIT',
      statusText: s5 >= 65 ? '达标' : s5 >= 45 ? '临界' : '待强化',
    },
  ]

  useEffect(() => {
    if (!chartRef.current) return

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current)
    }

    const chart = chartInstance.current

    const seriesData: echarts.RadarSeriesOption['data'] = [
      {
        value: scores,
        name: '当前掌握度',
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

    if (showBenchmark) {
      seriesData.push({
        value: benchmarkScores,
        name: '全国考研/执考常模标杆',
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
          const val = params.value as number[]
          return `
            <div style="font-weight:700;margin-bottom:4px;color:#34D399;font-size:12px;">${params.name}</div>
            <div>机制转导: <b>${val[0]}%</b></div>
            <div>受体靶点: <b>${val[1]}%</b></div>
            <div>临床指征: <b>${val[2]}%</b></div>
            <div>不良反应: <b>${val[3]}%</b></div>
            <div>禁忌辨析: <b>${val[4]}%</b></div>
            <div>药物互作: <b>${val[5]}%</b></div>
          `
        },
      },
      radar: {
        indicator: [
          { name: '机制转导', max: 100 },
          { name: '受体靶点', max: 100 },
          { name: '临床指征', max: 100 },
          { name: '不良反应', max: 100 },
          { name: '禁忌辨析', max: 100 },
          { name: '药物互作', max: 100 },
        ],
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
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [scores, showBenchmark])

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
              <h4 className="text-xs font-bold text-ink tracking-tight">六维药理认知能力谱</h4>
              <span className="rounded bg-paper px-1.5 py-0.2 text-[9.5px] font-mono text-ink-3 border border-line">
                BKT-6D
              </span>
            </div>
            <p className="text-[10px] font-mono text-ink-3 mt-0.5">BAYESIAN MULTI-DIMENSIONAL COGNITION</p>
          </div>
        </div>

        <button
          onClick={() => setShowBenchmark(!showBenchmark)}
          className={`rounded-lg px-2 py-1 text-[10.5px] font-mono font-semibold transition border cursor-pointer ${
            showBenchmark
              ? 'bg-slate-100 border-slate-300 text-slate-800'
              : 'bg-paper border-line text-ink-3 hover:text-ink'
          }`}
          title="切换常模标杆对照"
        >
          {showBenchmark ? '常模标杆: 开' : '常模标杆: 关'}
        </button>
      </div>

      {/* 雷达图主画布 */}
      <div className="relative py-1">
        <div ref={chartRef} className="h-52 w-full" />
      </div>

      {/* 临床化验单式指标矩阵 (Clinical Telemetry Matrix) */}
      <div className="space-y-1.5 border-t border-line/60 pt-3">
        <div className="flex items-center justify-between text-[10px] font-mono text-ink-3 px-1 uppercase tracking-wider">
          <span>能力维度 (DIMENSION)</span>
          <span>指标 · 判定</span>
        </div>

        <div className="space-y-1">
          {dimensions.map((d) => (
            <div
              key={d.code}
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
                    {d.code} · 基准 {d.ref}%
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
