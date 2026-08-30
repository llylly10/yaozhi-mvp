# -*- coding: utf-8 -*-
"""前端补全：学习路径 / 学习材料 / 迁移复测（design-taste-frontend-v1 设计语言）。"""
from pathlib import Path

p = Path("src/App.tsx")
src = p.read_text(encoding="utf-8")

# ---------- 1) 步骤轨 13 步 + stepIndex ----------
src = src.replace(
    "const STEPS = ['注册', '同意', '目标', '摸底', '画像', '题库', '作答', '诊断', '追问', '训练', '档案'] as const",
    "const STEPS = ['注册', '同意', '目标', '摸底', '画像', '路径', '学习', '练习', '诊断', '追问', '训练', '复测', '档案'] as const")

src = src.replace('''function stepIndex(screen: Screen, diagnosis: Diagnosis | null): number {
  const map: Record<Screen, number> = {
    register: 0, consent: 1, goal: 2, assessment: 3, portrait: 4,
    list: 5, flow: 6, profile: 10,
  }
  if (screen !== 'flow') return map[screen]
  if (!diagnosis) return 6
  if (diagnosis.state === 'followup_required') return 8
  if (diagnosis.state === 'training' || diagnosis.state === 'retesting') return 6
  return 7
}''',
'''function stepIndex(screen: Screen, diagnosis: Diagnosis | null): number {
  const map: Record<Screen, number> = {
    register: 0, consent: 1, goal: 2, assessment: 3, portrait: 4,
    list: 5, material: 6, flow: 7, profile: 12,
  }
  if (screen !== 'flow') return map[screen]
  if (!diagnosis) return 7
  if (diagnosis.state === 'followup_required') return 9
  if (diagnosis.state === 'training') return 10
  if (diagnosis.state === 'retesting') return 11
  return 8
}''')

src = src.replace("type Screen = 'register' | 'consent' | 'goal' | 'assessment' | 'portrait' | 'list' | 'flow' | 'profile'",
                  "type Screen = 'register' | 'consent' | 'goal' | 'assessment' | 'portrait' | 'list' | 'material' | 'flow' | 'profile'")

src = src.replace("const inLearning = screen === 'list' || screen === 'flow' || screen === 'profile' || screen === 'goal' || screen === 'assessment' || screen === 'portrait'",
                  "const inLearning = ['list', 'flow', 'profile', 'goal', 'assessment', 'portrait', 'material'].includes(screen)")

# ---------- 2) App：状态与渲染 ----------
src = src.replace('''  const [portrait, setPortrait] = useState<PortraitResult | null>(null)''',
'''  const [portrait, setPortrait] = useState<PortraitResult | null>(null)
  const [materialDomain, setMaterialDomain] = useState<string | null>(null)''')

src = src.replace('''            {screen === 'list' && userId && view === 'todo' && (
              <TodoHome key="list" userId={userId}
                onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }} />
            )}''',
'''            {screen === 'list' && userId && view === 'todo' && (
              <LearningPathHome key="plan" userId={userId}
                onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }}
                onMaterial={(domainId) => { setMaterialDomain(domainId); setScreen('material') }} />
            )}
            {screen === 'material' && materialDomain && (
              <MaterialView key={materialDomain} domainId={materialDomain} onError={setError}
                onPractice={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }} />
            )}''')

src = src.replace('''            {screen === 'list' && view === 'material' && (
              <EmptyPanel key="material" text="学习材料（知识点精讲 + 记忆卡）将在 W3 上线，当前版本请先从今日待办进入练习。" />
            )}''', '')

src = src.replace('''            {screen === 'flow' && userId && activeQuestion && (
              <PracticeFlow key={activeQuestion.id} userId={userId} question={activeQuestion}
                onDiagnosis={setDiagnosis} onError={setError}
                onExit={() => { setScreen('list'); setActiveQuestion(null); setDiagnosis(null); setView('todo') }} />
            )}''',
'''            {screen === 'flow' && userId && activeQuestion && (
              <PracticeFlow key={activeQuestion.id} userId={userId} question={activeQuestion}
                onDiagnosis={setDiagnosis} onError={setError}
                onStep={(n) => setStep(n)}
                onExit={() => { setScreen('list'); setActiveQuestion(null); setDiagnosis(null); setView('todo') }} />
            )}''')

# 侧栏：启用学习材料
src = src.replace("{item('material', '学习材料', <BookOpen size={15} />, true)}",
                  "{item('material', '学习材料', <BookOpen size={15} />)}")

# ---------- 3) TodoHome → LearningPathHome + MaterialView ----------
old_todo_start = src.find("/* ---------- 今日待办（题库） ---------- */")
old_todo_end = src.find("/* ---------- 聚光边框卡片 ---------- */")
assert old_todo_start > 0 and old_todo_end > old_todo_start
new_block = '''/* ---------- 学习路径（今日待办） ---------- */

type PlanTask = { type: 'material' | 'practice'; domain_id: string; domain: string; category: string | null; state: string; title: string }

function LearningPathHome({ userId, onPick, onMaterial }: {
  userId: string; onPick: (q: Question) => void; onMaterial: (domainId: string) => void
}) {
  const [plan, setPlan] = useState<{ tasks: PlanTask[]; note: string } | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.learningPlan(userId).then(setPlan).catch((e) => setError(String(e)))
    api.questions().then(setQuestions).catch(() => {})
  }, [userId])

  function practiceFor(domainId: string | null) {
    const pool = (questions ?? []).filter((q) => !domainId)
    return pool[0]
  }

  if (error) return <ErrorPanel message={error} />
  if (!plan) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
  }

  const hasTasks = plan.tasks.length > 0
  return (
    <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 6 · 学习路径</p>
      <h2 className="display mt-2 text-[26px]">今日待办</h2>
      <p className="mt-2 text-sm text-ink-2">{plan.note}</p>

      {!hasTasks && (
        <div className="card mt-6 p-8 text-center">
          <p className="text-sm text-ink-2">当前没有薄弱项待办。</p>
          <p className="mt-1 text-xs text-ink-3">完成一次「作答 → 诊断 → 训练」后，路径会按你的错因画像自动生成。</p>
          {questions && questions.length > 0 && (
            <button onClick={() => { const q = questions[0]; if (q) onPick(q) }}
              className="btn btn-primary mt-5">自由练习一道</button>
          )}
        </div>
      )}

      {hasTasks && (
        <div className="relative mt-6 space-y-4 before:absolute before:left-[19px] before:top-3 before:bottom-3 before:w-px before:bg-line">
          {plan.tasks.map((t, i) => (
            <motion.div key={t.type + t.domain_id + t.category} initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: i * 0.07 }}
              className="relative flex items-center gap-4">
              <span className={`z-10 grid size-10 flex-none place-items-center rounded-xl font-serif font-bold
                ${t.type === 'material' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                {t.type === 'material' ? '学' : '练'}
              </span>
              <div className="card flex-1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.title}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium
                    ${t.state === '薄弱' ? 'bg-cat-red-soft text-cat-red' : t.state === '学习中' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                    {t.state}
                  </span>
                </div>
                {t.type === 'material' ? (
                  <button onClick={() => onMaterial(t.domain_id)}
                    className="btn mt-2.5 items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary">
                    进入学习<ArrowRight size={11} />
                  </button>
                ) : (
                  questions && questions.length > 0 && (
                    <button onClick={() => { const q = questions.find((x) => x.domain_id === t.domain_id) ?? questions[0]; onPick(q) }}
                      className="btn mt-2.5 items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary">
                      开始练习<ArrowRight size={11} />
                    </button>
                  )
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">演示账号 {userId.slice(0, 8)} · 路径按「先学后练」规则生成 · 本系统不提供用药建议</p>
    </motion.div>
  )
}

/* ---------- 学习材料 ---------- */

type MaterialData = {
  domain: { code: string; name: string; chapter_ref: string }
  chain: { level: number; title: string; summary: string }[]
  confusion_pairs: { drug_a: string; drug_b: string; distinction: string }[]
  evidence: { ref: string; text: string }[]
}

function MaterialView({ domainId, onPractice, onError }: {
  domainId: string; onPractice: (q: Question) => void; onError: (m: string) => void
}) {
  const [mat, setMat] = useState<MaterialData | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.materials(domainId).then(setMat).catch((e) => onError(String(e)))
  }, [domainId])

  if (!mat) return <div className="space-y-3 pt-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 7 · 学习材料</p>
      <h2 className="display mt-2 text-[26px]">{mat.domain.name}</h2>
      <p className="mt-2 text-sm text-ink-2">{mat.domain.chapter_ref} · 学完机制链再做练习，效率最高。</p>

      {/* 推理链 */}
      <div className="card mt-6 p-7">
        <h3 className="mb-5 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />药理推理链 · 六环</h3>
        <div className="space-y-0">
          {mat.chain.map((c, i) => (
            <motion.div key={c.level} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring, delay: i * 0.06 }} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="grid size-8 flex-none place-items-center rounded-xl bg-primary-soft font-serif text-sm font-bold text-primary">
                  L{c.level}
                </span>
                {i < mat.chain.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="pb-6">
                <p className="text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.summary}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 混淆对 */}
      {mat.confusion_pairs.length > 0 && (
        <div className="card mt-4 p-7">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />易混药物对 · 双向辨析</h3>
          <div className="space-y-4">
            {mat.confusion_pairs.map((p, i) => (
              <div key={i} className="rounded-xl border border-line-2 p-4">
                <p className="text-sm font-semibold">
                  <span className="text-primary">{p.drug_a}</span>
                  <span className="mx-2 text-ink-3">vs</span>
                  <span className="text-gold">{p.drug_b}</span>
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{p.distinction}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 知识点原文 */}
      {mat.evidence.length > 0 && (
        <div className="card mt-4 p-7">
          <h3 className="mb-4 text-sm font-semibold">知识点原文（引用来源）</h3>
          <div className="space-y-3">
            {mat.evidence.map((e, i) => (
              <div key={i} className="rounded-xl bg-paper px-4 py-3 text-[13px]">
                <p className="mb-0.5 text-xs text-ink-3">{e.ref}</p>
                <p className="leading-relaxed text-ink-2">{e.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">正式版本将替换为授权教材的结构化切片。</p>
        </div>
      )}

      <div className="sticky bottom-4 mt-5 flex justify-center">
        {!done ? (
          <button onClick={() => setDone(true)} className="btn btn-primary !px-8 !py-3.5 shadow-[var(--shadow-lg)]">
            <CheckCircle size={16} />完成学习，进入练习
          </button>
        ) : (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="glass rounded-full px-6 py-3 text-sm text-ink-2">
            学习已标记完成 — 从左侧「今日待办」选择对应练习
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- 聚光边框卡片 ---------- */'''

src = src[:old_todo_start] + new_block + src[old_todo_end:]
p.write_text(src, encoding="utf-8")
print("part A ok")
