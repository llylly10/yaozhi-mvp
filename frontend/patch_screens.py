# -*- coding: utf-8 -*-
"""向 App.tsx 注入 目标选择/摸底/画像 三屏组件。"""
from pathlib import Path

p = Path(__file__).parent / "src" / "App.tsx"
src = p.read_text(encoding="utf-8")

anchor = "/* ---------- 今日待办（题库） ---------- */"
assert anchor in src, "anchor missing"

block = """/* ---------- 第 3 步 · 目标选择 ---------- */

const GOALS = [
  ['期末冲绩', '围绕本学期药理学课程的重难点与易错点，提升章节测验成绩。'],
  ['补齐理解缺口', '不急着刷题，先把「为什么错」搞清楚，重建机制理解链。'],
  ['备考执业药师', '对照执业药师考点组织练习，兼顾课程与考证。'],
] as const

function GoalPicker({ onNext, goal }: { onNext: (g: string) => void; goal: string }) {
  const [picked, setPicked] = useState<string>(goal)
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="mx-auto w-full max-w-[760px] pt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 3 · 学习目标</p>
      <h2 className="display mt-2 text-[26px]">你这个阶段最想解决什么？</h2>
      <p className="mt-2 text-sm text-ink-2">目标决定摸底后的学习路径排序，之后可以在学习档案里修改。</p>
      <div className="mt-7 space-y-3.5">
        {GOALS.map(([t, d]) => (
          <motion.button key={t} whileTap={{ scale: 0.99 }} onClick={() => setPicked(t)}
            className={`relative w-full rounded-2xl border p-5 text-left transition-colors
              ${picked === t ? 'border-primary bg-primary-soft' : 'border-line-2 bg-white hover:border-line'}`}>
            {picked === t && <motion.span layoutId="goal-sel" transition={spring}
              className="absolute inset-0 rounded-2xl bg-primary-soft" />}
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
      <button onClick={() => onNext(picked)} className="btn btn-primary mt-7">
        保存目标，开始摸底<ArrowRight size={15} weight="bold" />
      </button>
    </motion.div>
  )
}

/* ---------- 第 4 步 · 摸底测试 ---------- */

function Assessment({ userId, onDone, onError }: {
  userId: string; onDone: (r: PortraitResult) => void; onError: (m: string) => void
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { api.assessment(userId).then((r) => setQuestions(r.questions)).catch((e) => onError(String(e))) }, [userId])

  async function submit() {
    if (!questions) return
    setSubmitting(true)
    try {
      const r = await api.submitAssessment(userId, answers)
      onDone(r as PortraitResult)
    } catch (e) { onError(String(e)) } finally { setSubmitting(false) }
  }

  const answered = Object.keys(answers).length
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mx-auto w-full max-w-[860px] pt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 4 · 摸底测试</p>
      <h2 className="display mt-2 text-[26px]">先摸个底，看看你现在的位置</h2>
      <p className="mt-2 text-sm text-ink-2">
        {questions ? `${questions.length} 道题，约 8 分钟。` : '加载中…'}
        不确定可以凭直觉选——摸底的目的就是暴露薄弱点，答错完全不影响成绩。
      </p>

      {!questions && <div className="mt-7 space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-32" />)}</div>}

      {questions && (
        <div className="mt-7 space-y-5">
          {questions.map((q, i) => (
            <div key={q.id} className="card p-6">
              <div className="mb-3 flex items-center gap-2 text-xs text-ink-3">
                <span className="grid size-6 place-items-center rounded-full bg-primary-soft font-serif font-bold text-primary">{i + 1}</span>
                {q.code}
              </div>
              <p className="mb-4 text-[15px] font-medium leading-relaxed">{q.stem}</p>
              <div className="space-y-2.5">
                {q.options.map((o) => (
                  <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setAnswers({ ...answers, [q.id]: o.key })}
                    className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm
                      ${answers[q.id] === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                    {answers[q.id] === o.key && (
                      <motion.span layoutId={`as-${q.id}`} transition={spring} className="absolute inset-0 rounded-xl bg-primary-soft" />
                    )}
                    <span className="relative z-10 flex items-center gap-3">
                      <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold
                        ${answers[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                      {o.text}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {questions && (
        <div className="sticky bottom-4 mt-6 flex justify-center">
          <button onClick={submit} disabled={submitting || answered < questions.length} className="btn btn-primary !px-8 !py-3.5 shadow-[var(--shadow-lg)]">
            交卷并生成画像（{answered}/{questions.length}）
          </button>
        </div>
      )}
    </motion.div>
  )
}

/* ---------- 第 5 步 · 能力画像（ECharts 热力图 + 薄弱项） ---------- */

export type PortraitResult = {
  total: number
  weak: { question_code: string; stem: string; domain_id?: string; domain?: string; category: string }[]
  domains: { domain: string; correct: number; total: number; rate: number }[]
}

function Heatmap({ data }: { data: { domains: string[]; categories: string[]; values: number[][] } }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const chart = echarts.init(ref.current)
    chart.setOption({
      tooltip: { position: 'top' },
      grid: { left: 110, right: 20, top: 12, bottom: 40 },
      xAxis: { type: 'category', data: data.categories, splitArea: { show: true } },
      yAxis: { type: 'category', data: data.domains, splitArea: { show: true } },
      visualMap: { min: 0, max: 3, calculable: false, orient: 'horizontal', left: 'center', bottom: 0,
        inRange: { color: ['#EDF3EE', '#0E7A63'] }, show: false },
      series: [{ type: 'heatmap', data: data.values.flatMap((row, y) => row.map((v, x) => [x, y, v])),
        label: { show: true }, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.2)' } } }],
    })
    const onResize = () => chart.resize()
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); chart.dispose() }
  }, [data])
  return <div ref={ref} className="h-[220px] w-full" />
}

function Portrait({ result, onEnter }: { result: PortraitResult; onEnter: () => void }) {
  const categories = ['知识遗忘', '概念混淆', '机制理解不足', '审题与应用失误', '待诊断']
  const domains = [...new Set(result.weak.map((w) => w.domain))]
  const values = domains.map((d) => categories.map((c) => result.weak.filter((w) => w.domain === d && w.category === c).length))
  const top3 = [...result.weak].slice(0, 3)
  const weakRate = result.total ? result.weak.length / result.total : 0

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="pt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 5 · 能力画像</p>
      <h2 className="display mt-2 text-[26px]">你的药理学能力画像</h2>
      <p className="mt-2 text-sm text-ink-2">基于摸底作答生成。红色区域就是接下来要攻克的目标。</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">薄弱点分布</h3>
          <p className="mb-2 text-xs text-ink-3">诊断域 × 错因类别 · 数字为摸底答错题数</p>
          {domains.length > 0
            ? <Heatmap data={{ domains, categories, values }} />
            : <p className="py-10 text-center text-sm text-ink-3">摸底全对——先去题库挑几道难一点的题。</p>}
        </div>
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">域级正确率</h3>
          <p className="mb-3 text-xs text-ink-3">低于 70% 的域会进入你的学习路径</p>
          <div className="space-y-3.5">
            {result.domains.map((d) => (
              <div key={d.domain}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{d.domain}</span>
                  <span className={d.rate < 0.7 ? 'font-semibold text-cat-red' : 'text-ink-3'}>{Math.round(d.rate * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line-2">
                  <div className="h-full rounded-full" style={{ width: `${d.rate * 100}%`,
                    background: d.rate < 0.7 ? 'var(--color-cat-red)' : 'var(--color-primary)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card mt-4 p-6">
        <h3 className="mb-4 text-sm font-semibold">识别到的薄弱项（Top 3）</h3>
        {top3.length === 0 && <p className="text-sm text-ink-3">摸底未发现明显薄弱项。</p>}
        <div className="space-y-4">
          {top3.map((w, i) => (
            <div key={i}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium">{w.stem.slice(0, 26)}…</span>
                <CategoryTag category={w.category} />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line-2">
                <div className="h-full rounded-full bg-cat-red" style={{ width: `${Math.max(30, 100 - i * 22)}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-3">{w.domain}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 flex justify-center pb-4">
        <button onClick={onEnter} className="btn btn-primary !px-8 !py-3.5">
          画像已生成，进入今日待办<ArrowRight size={15} weight="bold" />
        </button>
      </div>
      <p className="pb-2 text-center text-xs text-ink-3">整体薄弱占比 {Math.round(weakRate * 100)}% · 画像将随每次练习自动更新</p>
    </motion.div>
  )
}

/* ---------- 今日待办（题库） ---------- */"""

src = src.replace(anchor, block, 1)
p.write_text(src, encoding="utf-8")
print("injected ok")
