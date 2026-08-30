import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, Pill,
  CalendarBlank, BookOpen, ClockCounterClockwise, SquaresFour, Gear,
} from '@phosphor-icons/react'
import { api, type Diagnosis, type Question } from './api'

/*
 * 药知 · 「现代药房 × 分子美学」
 * 流程（对齐产品原型）：注册 → 同意 → 题库(今日待办) → 作答 → 诊断 → 追问 → 训练 → 档案
 * 布局：通栏玻璃步骤轨 + 左侧学习栏 + 内容区
 */

const USER_KEY = 'yaozhi_user_id_v2'

type Screen = 'register' | 'consent' | 'list' | 'flow' | 'profile'
type View = 'todo' | 'material' | 'wrongbook' | 'profile'

const STEPS = ['注册', '同意', '今日待办', '作答', '诊断', '追问', '训练', '学习档案'] as const

const spring = { type: 'spring', stiffness: 120, damping: 20 } as const

function stepIndex(screen: Screen, diagnosis: Diagnosis | null): number {
  if (screen === 'register') return 0
  if (screen === 'consent') return 1
  if (screen === 'list') return 2
  if (screen === 'profile') return 7
  if (!diagnosis) return 3
  if (diagnosis.state === 'followup_required') return 5
  if (diagnosis.state === 'training' || diagnosis.state === 'retesting') return 6
  return 4
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(USER_KEY) ? 'list' : 'register'))
  const [view, setView] = useState<View>('todo')
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [error, setError] = useState<string | null>(null)

  function onRegistered(id: string) {
    localStorage.setItem(USER_KEY, id)
    setUserId(id); setScreen('consent')
  }
  function onConsented() {
    setScreen('list'); setView('todo')
  }
  function logout() {
    localStorage.removeItem(USER_KEY)
    setUserId(null); setScreen('register'); setActiveQuestion(null); setDiagnosis(null); setView('todo')
  }

  const step = stepIndex(screen, diagnosis)
  const inLearning = screen === 'list' || screen === 'flow' || screen === 'profile'

  return (
    <div className="relative min-h-[100dvh]">
      <MolField />

      {/* 顶栏品牌 + 通栏步骤轨 */}
      {inLearning && (
        <div className="sticky top-0 z-30">
          <div className="glass border-x-0 border-t-0 !rounded-none px-5 pt-2 pb-1">
            <div className="mx-auto flex w-full max-w-[1140px] items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary text-white"><Pill size={14} weight="fill" /></span>
                <span className="font-serif text-[15px] font-bold">药知</span>
                <span className="rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[10.5px] font-semibold text-gold">演示原型 · MVP</span>
              </div>
              <button onClick={logout} className="btn rounded-full px-3 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink">退出账号</button>
            </div>
            <div className="mx-auto flex w-full max-w-[1140px] items-center gap-0.5 overflow-x-auto py-1.5">
              {STEPS.map((s, i) => (
                <span key={s} className="flex items-center">
                  {i > 0 && <span className="mx-0.5 text-[9px] text-line">▸</span>}
                  <span className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs
                    ${i === step ? 'bg-primary font-semibold text-white' : 'text-ink-3'}`}>
                    <span className={`size-1.5 rounded-full ${i <= step ? (i === step ? 'bg-white' : 'bg-primary') : 'bg-line'}`} />
                    {s}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-[1140px] gap-6 px-5 pb-16 pt-6">
        {/* 左侧学习栏 */}
        {inLearning && <Sidebar view={view} onNav={(v) => { setError(null); setView(v); setScreen(v === 'todo' ? 'list' : 'profile'); setActiveQuestion(null) }} />}

        <div className="min-w-0 flex-1">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <AnimatePresence mode="wait">
            {screen === 'register' && <Welcome key="register" onRegistered={onRegistered} onError={setError} />}
            {screen === 'consent' && userId && <Consent key="consent" userId={userId} onConsented={onConsented} onBack={() => setScreen('register')} onError={setError} />}
            {screen === 'list' && userId && view === 'todo' && (
              <TodoHome key="list" userId={userId}
                onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }} />
            )}
            {screen === 'flow' && userId && activeQuestion && (
              <PracticeFlow key={activeQuestion.id} userId={userId} question={activeQuestion}
                onDiagnosis={setDiagnosis} onError={setError}
                onExit={() => { setScreen('list'); setActiveQuestion(null); setDiagnosis(null); setView('todo') }} />
            )}
            {screen === 'profile' && userId && (view === 'wrongbook' || view === 'profile') && (
              <Profile key={view} userId={userId} />
            )}
            {screen === 'list' && view === 'material' && (
              <EmptyPanel key="material" text="学习材料（知识点精讲 + 记忆卡）将在 W3 上线，当前版本请先从今日待办进入练习。" />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

/* ---------- 苯环分子背景 ---------- */

const HEXES = [
  [4, 10, 46], [12, 26, 30], [22, 8, 58], [33, 20, 36], [45, 6, 50], [58, 16, 42],
  [70, 7, 54], [82, 22, 34], [92, 10, 46], [8, 55, 40], [26, 68, 56], [50, 60, 44],
  [72, 72, 52], [90, 58, 38], [60, 85, 34], [16, 86, 44], [40, 40, 28],
] as const

function Hex({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  const h = size, w = size * 0.866
  const pts = `${w / 2},0 ${w},${h * 0.25} ${w},${h * 0.75} ${w / 2},${h} 0,${h * 0.75} 0,${h * 0.25}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style}>
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

function MolField() {
  return (
    <div className="mol-field text-primary/25" aria-hidden>
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
        {HEXES.slice(0, 12).map(([x, y], i) => (
          <line key={`b${i}`} x1={`${x}%`} y1={`${y}%`} x2={`${HEXES[(i + 3) % HEXES.length][0]}%`}
            y2={`${HEXES[(i + 3) % HEXES.length][1]}%`} stroke="currentColor" strokeWidth={0.7} opacity={0.35} />
        ))}
      </svg>
      {HEXES.map(([x, y, s], i) => (
        <motion.div key={i} className="absolute text-primary/60" style={{ left: `${x}%`, top: `${y}%` }}
          animate={{ y: [0, -9, 0], rotate: [0, i % 2 ? 6 : -6, 0] }}
          transition={{ duration: 10 + (i % 5) * 2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}>
          <Hex size={s} />
        </motion.div>
      ))}
    </div>
  )
}

/* ---------- 左侧学习栏 ---------- */

function Sidebar({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  const item = (v: View, label: string, icon: React.ReactNode, disabled = false) => (
    <button key={v + label} disabled={disabled} onClick={() => onNav(v)}
      className={`btn !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm
        ${!disabled && view === v ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-2 hover:bg-paper-2'}
        ${disabled ? 'opacity-45' : ''}`}>
      {icon}{label}
      {disabled && <span className="ml-auto text-[10px] text-ink-3">W3</span>}
    </button>
  )
  return (
    <aside className="hidden w-[190px] flex-none lg:block">
      <div className="sticky top-[118px] space-y-6">
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">学习</p>
          {item('todo', '今日待办', <CalendarBlank size={15} />)}
          {item('material', '学习材料', <BookOpen size={15} />, true)}
          {item('wrongbook', '错题本', <ClockCounterClockwise size={15} />)}
        </div>
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">能力</p>
          {item('profile', '学习档案', <SquaresFour size={15} />)}
        </div>
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">账户</p>
          <button disabled className="btn !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-ink-2 opacity-45">
            <Gear size={15} />设置 · 隐私<span className="ml-auto text-[10px] text-ink-3">W3</span>
          </button>
        </div>
      </div>
    </aside>
  )
}

/* ---------- 第 1 步 · 注册（英雄区 + 演示账号登录） ---------- */

function Welcome({ onRegistered, onError }: { onRegistered: (id: string) => void; onError: (m: string) => void }) {
  const [account, setAccount] = useState('yaozhi_student01')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)

  function enter() {
    setBusy(true)
    api.demoSession(account, invite)
      .then((r) => onRegistered(r.user_id))
      .catch((e) => onError(String(e).replace('API 403: ', '邀请码不正确 — ')))
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex min-h-[calc(100dvh-24px)] w-full items-center justify-center">
      <div className="grid w-full max-w-[1080px] items-stretch gap-7 lg:grid-cols-[1.05fr_0.95fr]">
      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="relative flex flex-col overflow-hidden rounded-[28px] p-10 text-white"
        style={{ background: 'linear-gradient(155deg, var(--color-primary-deep) 0%, #0C6150 55%, #128A70 100%)' }}>
        <div className="pointer-events-none absolute -right-8 -top-10 opacity-20">
          {[0, 1, 2].map((i) => (
            <motion.div key={i} className="absolute text-white" style={{ right: i * 66, top: i * 88 }}
              animate={{ y: [0, -12, 0], rotate: [0, 8, 0] }}
              transition={{ duration: 11 + i * 2, repeat: Infinity, ease: 'easeInOut' }}>
              <Hex size={150 - i * 30} />
            </motion.div>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-xl border border-white/30 bg-white/10 px-3.5 py-1.5 text-xs font-medium">
          AI + 高等教育 · 校内试点
        </span>
        <h1 className="display mt-8 text-[36px] leading-[1.4] md:text-[40px]">从「知道答案」<br />走向「理解原因」</h1>
        <p className="mt-5 max-w-[430px] text-sm leading-relaxed opacity-85">
          依托通用大模型与药理学垂类能力，以公开合法教育资源为底座，帮助药学专业学生构建「学习 → 练习 → 反馈 → 再验证」的完整学习闭环。
        </p>
        <div className="mt-9">
          <div className="flex flex-wrap items-center gap-2">
            {['摸底定位', '错因诊断', '靶向训练', '迁移复测', '画像成长'].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                {i > 0 && <ArrowRight size={11} className="opacity-55" />}
                <span className="rounded-xl border border-white/35 bg-white/10 px-3.5 py-2 text-[13px]">{s}</span>
              </span>
            ))}
          </div>
        </div>
        <p className="mt-auto pt-10 text-xs leading-relaxed opacity-70">
          MVP 课程范围：药理学（总论 + 1–2 个代表性药物章节）· 数据合规：单独勾选知情同意，可随时撤销删除
        </p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }} className="glass flex flex-col justify-center rounded-[28px] p-9">
      
        <h2 className="display text-[22px]">演示账号登录</h2>
        <p className="mt-1.5 text-[13px] text-ink-2">MVP 阶段仅支持演示账号 / 邀请码，不对接学工系统</p>

        <label className="mb-1.5 mt-7 block text-[13px] font-semibold text-ink-2">演示账号</label>
        <input value={account} onChange={(e) => setAccount(e.target.value)} className="input" maxLength={32} />

        <label className="mb-1.5 mt-5 block text-[13px] font-semibold text-ink-2">邀请码</label>
        <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="向项目组索取（演示：DEMO2026）"
          className="input" maxLength={32} />

        <button onClick={enter} disabled={busy || !account.trim() || !invite.trim()} className="btn btn-primary mt-7 w-full !py-3.5">
          {busy ? '进入中…' : '进入药知'}<ArrowRight size={15} weight="bold" />
        </button>
        <p className="mt-4 text-center text-xs text-ink-3">
          进入后将要求逐份确认<span className="font-semibold text-ink-2">《用户协议》《隐私政策》《学习数据采集知情同意书》</span>
        </p>
      </motion.div>
      </div>
    </div>
  )
}

/* ---------- 第 2 步 · 同意（三份文档独立勾选） ---------- */

function Consent({ userId, onConsented, onBack, onError }: {
  userId: string; onConsented: () => void; onBack: () => void; onError: (m: string) => void
}) {
  const [reads, setReads] = useState([false, false])
  const [collect, setCollect] = useState(false)
  const busyRef = useRef(false)

  const all = reads[0] && reads[1] && collect

  function enter() {
    if (busyRef.current) return
    busyRef.current = true
    api.consent(userId, { user_agreement: true, privacy_policy: true, data_collection: collect })
      .then(onConsented)
      .catch((e) => { onError(String(e)); busyRef.current = false })
  }

  return (
    <motion.div key="consent" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      className="mx-auto w-full max-w-[980px] pt-4">
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 2 · 隐私合规</p>
      <h2 className="display mt-2 text-[26px]">使用前，请阅读并同意以下文档</h2>
      <p className="mt-2 max-w-[720px] text-sm leading-relaxed text-ink-2">
        为保障你的个人信息安全，以下三份文档需<span className="font-semibold">分别独立勾选</span>。
        个性化学习功能需要你单独同意《学习数据采集知情同意书》后方可使用。
      </p>

      <div className="mt-7 space-y-4">
        {[
          ['《用户协议》', '约定服务范围、账号使用规范与用户责任。MVP 阶段为演示账号，不涉及付费与虚拟财产。', 0, true],
          ['《隐私政策》', '说明我们收集哪些信息、如何保护、如何共享（不共享给任何第三方）以及你的权利。', 1, true],
        ].map(([title, desc, idx]) => (
          <button key={title as string} onClick={() => setReads(reads.map((v, j) => (j === idx ? !v : v)))}
            className={`w-full rounded-2xl border p-5 text-left transition-colors
              ${reads[idx as number] ? 'border-primary/50 bg-primary-soft' : 'border-line-2 bg-white hover:border-line'}`}>
            <span className="flex items-start gap-3.5">
              <span className={`mt-0.5 grid size-[22px] flex-none place-items-center rounded-md border-2 transition-colors
                ${reads[idx as number] ? 'border-primary bg-primary' : 'border-line bg-white'}`}>
                {reads[idx as number] && <CheckCircle size={13} weight="bold" className="text-white" />}
              </span>
              <span>
                <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {title}
                  <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok">
                    {reads[idx as number] ? '已阅' : '待阅读'}
                  </span>
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">{desc}</span>
              </span>
            </span>
          </button>
        ))}

        <div className={`rounded-2xl border p-5 ${collect ? 'border-gold/50 bg-gold-soft/40' : 'border-line-2 bg-white'}`}>
          <button onClick={() => setCollect(!collect)} className="flex w-full items-start gap-3.5 text-left">
            <span className={`mt-0.5 grid size-[22px] flex-none place-items-center rounded-md border-2 transition-colors
              ${collect ? 'border-gold bg-gold' : 'border-line bg-white'}`}>
              {collect && <CheckCircle size={13} weight="bold" className="text-white" />}
            </span>
            <span>
              <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                《学习数据采集知情同意书》
                <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">需单独勾选</span>
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-2">
                仅采集完成学习闭环所需的：章节掌握度、四类错因标签、学习路径进度、答题轨迹与对话原文。
                <span className="font-semibold">不采集</span>民族、宗教、收入、健康史等敏感属性。你可随时撤回同意并删除全部数据（24h 逻辑删除 + 30d 物理删除 + 回执）。
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="mt-7 flex items-center gap-3">
        <button onClick={enter} disabled={!all} className="btn btn-primary">进入学习<ArrowRight size={15} weight="bold" /></button>
        <button onClick={onBack} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:bg-paper">返回</button>
      </div>
    </motion.div>
  )
}

/* ---------- 今日待办（题库） ---------- */

function TodoHome({ userId, onPick }: { userId: string; onPick: (q: Question) => void }) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { api.questions().then(setQuestions).catch((e) => setError(String(e))) }, [])

  return (
    <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 3 · 今日待办</p>
      <h2 className="display mt-2 text-[26px]">今天练什么</h2>
      <p className="mt-2 text-sm text-ink-2">选择一道题开始。答错时，系统会定位你错在哪，而不是只告诉你错了。</p>

      {error && <ErrorPanel message={error} />}
      {!questions && !error && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[120px]" />)}
        </div>
      )}
      {questions && questions.length === 0 && <div className="mt-6"><EmptyPanel text="当前没有可练习的题目，等待内容生产。" /></div>}

      {questions && questions.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {questions.map((q, i) => (
            <SpotCard key={q.id} onClick={() => onPick(q)} delay={i * 0.05}>
              <span className="grid size-9 flex-none place-items-center rounded-full bg-primary-soft font-serif text-sm font-bold text-primary">
                {q.code.slice(-1)}
              </span>
              <span className="mt-3.5 block text-[14.5px] font-medium leading-relaxed">{q.stem}</span>
              <span className="mt-3 flex items-center gap-2 text-xs text-ink-3">开始练习 <ArrowRight size={12} /></span>
            </SpotCard>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">演示账号 {userId.slice(0, 8)} · 作答记录已匿名保存 · 本系统不提供用药建议</p>
    </motion.div>
  )
}

/* ---------- 聚光边框卡片 ---------- */

function SpotCard({ children, onClick, delay = 0 }: {
  children: React.ReactNode; onClick?: () => void; delay?: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <motion.button ref={ref} onClick={onClick}
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay }}
      whileTap={{ scale: 0.985 }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect()
        ref.current!.style.setProperty('--mx', `${e.clientX - r.left}px`)
        ref.current!.style.setProperty('--my', `${e.clientY - r.top}px`)
      }}
      className="spot-card w-full p-5 text-left">
      {children}
    </motion.button>
  )
}

/* ---------- 学习档案 + 错题本 ---------- */

type MasteryRow = { domain: string; category: string | null; state: string; reason: string }
type WrongRow = {
  attempt_id: string; question_code: string; stem: string
  selected: string; answer: string
  misconception: { name: string; category: string } | null
  evidence_level: string | null
}

function Profile({ userId }: { userId: string }) {
  const [mastery, setMastery] = useState<MasteryRow[] | null>(null)
  const [wrong, setWrong] = useState<WrongRow[] | null>(null)

  useEffect(() => {
    api.mastery(userId).then(setMastery).catch(() => setMastery([]))
    api.wrongBook(userId).then(setWrong).catch(() => setWrong([]))
  }, [userId])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {view_title(userId)}
      <div className="mt-6 space-y-8">
        <section>
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />掌握状态</h3>
          {!mastery && <div className="skeleton h-20" />}
          {mastery && mastery.length === 0 && <EmptyPanel text="还没有掌握度记录：完成一次「作答 → 诊断 → 训练」后这里会出现你的错因画像。" />}
          {mastery && mastery.length > 0 && (
            <div className="space-y-3">
              {mastery.map((m, i) => (
                <div key={i} className="card flex flex-wrap items-center gap-3 p-5">
                  <CategoryTag category={m.category ?? '域级'} />
                  <span className="text-sm font-semibold text-primary">{m.state}</span>
                  <span className="text-xs text-ink-3">{m.reason}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />错题本 · 按错因归档</h3>
          {!wrong && <div className="skeleton h-20" />}
          {wrong && wrong.length === 0 && <EmptyPanel text="错题本是空的：还没有答错的题，或者错的题还没完成诊断。" />}
          {wrong && wrong.length > 0 && (
            <div className="space-y-3">
              {wrong.map((w) => (
                <div key={w.attempt_id} className="card p-5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs text-ink-3">{w.question_code}</span>
                    {w.misconception ? <CategoryTag category={w.misconception.category} /> : null}
                    {w.evidence_level && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${w.evidence_level === '低' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                        证据 · {w.evidence_level}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-ink-3">选 {w.selected} · 正确 {w.answer}</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed">{w.stem}</p>
                  {w.misconception && <p className="mt-2 text-xs text-ink-2">归因：{w.misconception.name}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  )
}

function view_title(userId: string) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">学习档案</p>
      <h2 className="display mt-2 text-[26px]">你的错因画像与错题本</h2>
      <p className="mt-2 text-sm text-ink-2">演示账号 {userId.slice(0, 8)} · 数据仅存于校内演示环境</p>
    </div>
  )
}

/* ---------- 作答 → 诊断（处方笺） → 追问 → 训练 ---------- */

const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  '知识遗忘': { bg: 'var(--color-cat-blue-soft)', fg: 'var(--color-cat-blue)' },
  '概念混淆': { bg: 'var(--color-cat-purple-soft)', fg: 'var(--color-cat-purple)' },
  '机制理解不足': { bg: 'var(--color-cat-orange-soft)', fg: 'var(--color-cat-orange)' },
  '审题与应用失误': { bg: 'var(--color-cat-red-soft)', fg: 'var(--color-cat-red)' },
}

function CategoryTag({ category }: { category: string }) {
  const s = CAT_STYLE[category] ?? { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' }
  return (
    <span className="inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}>
      {category}
    </span>
  )
}

function PracticeFlow({ userId, question, onDiagnosis, onError, onExit }: {
  userId: string; question: Question
  onDiagnosis: (d: Diagnosis | null) => void; onError: (m: string) => void; onExit: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [training, setTraining] = useState<{ training_id: string; questions: { id: string; stem: string; options: { key: string; text: string }[] }[] } | null>(null)
  const [trainingPicks, setTrainingPicks] = useState<Record<string, string>>({})
  const [trainingResult, setTrainingResult] = useState<{ score: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pushDiagnosis(d: Diagnosis | null) { setDiagnosis(d); onDiagnosis(d) }

  async function submit() {
    if (!selected) return
    setSubmitting(true); setError(null)
    try {
      const r = await api.submitAttempt({
        user_id: userId, question_id: question.id, selected_option: selected,
        rationale: rationale || undefined, idempotency_key: crypto.randomUUID(),
      })
      pushDiagnosis(await api.diagnosis(r.session_id))
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(id: string) { pushDiagnosis(await api.diagnosis(id)) }

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t)
      pushDiagnosis(await api.diagnosis(diagnosis.session_id))
    } catch (e) { onError(String(e)) }
  }

  async function finishTraining() {
    if (!training) return
    try {
      const r = await api.submitTraining(training.training_id, trainingPicks)
      setTrainingResult({ score: r.score })
    } catch (e) { setError(String(e)) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card relative overflow-hidden !rounded-[24px]">
        <div className="absolute right-6 top-5 opacity-[0.06]"><Hex size={92} className="text-ink" /></div>
        <div className="border-b border-line-2 px-8 pb-6 pt-7">
          <div className="flex items-center gap-2 text-xs text-ink-3">
            <span className="capsule" />{question.code} · 单选题 · 药理学 / M 受体药
          </div>
          <p className="display mt-4 text-[19px] leading-relaxed">{question.stem}</p>
        </div>
        <div className="p-8 pt-6">
          <div className="space-y-3">
            {question.options.map((o) => (
              <motion.button key={o.key} onClick={() => setSelected(o.key)} whileTap={{ scale: 0.99 }}
                className={`relative w-full rounded-2xl border px-5 py-4 text-left text-sm
                  ${selected === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                {selected === o.key && (
                  <motion.span layoutId={`opt-${question.id}`} transition={spring}
                    className="absolute inset-0 rounded-2xl bg-primary-soft" />
                )}
                <span className="relative z-10 flex items-center gap-3.5">
                  <span className={`grid size-7 flex-none place-items-center rounded-full border text-xs font-bold
                    ${selected === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>
                    {o.key}
                  </span>
                  <span className={selected === o.key ? 'font-medium' : ''}>{o.text}</span>
                </span>
              </motion.button>
            ))}
          </div>

          <label className="mb-1.5 mt-7 block text-[13px] font-semibold text-ink-2">你的解题思路（选填）</label>
          <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2}
            placeholder="写下你的推理，例如它作用于哪类受体、产生了什么效应。写得越清楚，归因越准。"
            className="input" />
          {!diagnosis && (
            <button onClick={submit} disabled={!selected || submitting} className="btn btn-primary mt-6">
              {submitting ? '判分中…' : '提交答案'}
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {diagnosis && (
          <DiagnosisPanel key={diagnosis.state + diagnosis.followup_count}
            diagnosis={diagnosis} onRefresh={refresh} onStartTraining={startTraining} onError={setError} />
        )}
      </AnimatePresence>

      {training && !trainingResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="display text-[19px]">针对性训练</h3>
            <div className="flex items-center gap-2 text-xs text-ink-3">
              已答 {Object.keys(trainingPicks).length} / {training.questions.length}
              <span className="capsule gold" />
            </div>
          </div>
          <div className="space-y-6">
            {training.questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-6">
                <p className="mb-3.5 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                      onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm
                        ${trainingPicks[q.id] === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      {trainingPicks[q.id] === o.key && (
                        <motion.span layoutId={`tr-${q.id}`} transition={spring}
                          className="absolute inset-0 rounded-xl bg-primary-soft" />
                      )}
                      <span className="relative z-10 flex items-center gap-3">
                        <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold
                          ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>
                          {o.key}
                        </span>
                        {o.text}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishTraining}
            disabled={Object.keys(trainingPicks).length < training.questions.length}
            className="btn btn-primary mt-7">提交训练</button>
        </motion.div>
      )}

      {trainingResult && <TrainingResult score={trainingResult.score} onExit={onExit} />}
    </motion.div>
  )
}

function TrainingResult({ score, onExit }: { score: number; onExit: () => void }) {
  const R = 52
  const C = 2 * Math.PI * R
  return (
    <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
      className="card mt-5 !rounded-[24px] p-10 text-center">
      <div className="relative mx-auto size-[132px]">
        <svg className="size-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-line-2)" strokeWidth={9} />
          <motion.circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-primary)" strokeWidth={9}
            strokeLinecap="round" strokeDasharray={C}
            initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - score) }}
            transition={{ ...spring, delay: 0.25 }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div>
            <p className="display text-[28px] leading-none">{Math.round(score * 100)}<span className="text-[15px]">%</span></p>
            <p className="mt-1 text-[11px] text-ink-3">训练正确率</p>
          </div>
        </div>
      </div>
      <h3 className="display mt-6 text-[20px]">本轮训练完成</h3>
      <p className="mt-2 text-sm text-ink-2">
        {score >= 0.8 ? '掌握状态已更新，巩固得不错。' : '错因画像已更新，建议针对薄弱项再练一轮。'}
      </p>
      <p className="mt-2 text-xs text-ink-3">错题已归档到「错题本」，可从左侧栏查看</p>
      <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
    </motion.div>
  )
}

function DiagnosisPanel({ diagnosis, onRefresh, onStartTraining, onError }: {
  diagnosis: Diagnosis; onRefresh: (id: string) => void; onStartTraining: () => void; onError: (m: string) => void
}) {
  const [answering, setAnswering] = useState(false)

  async function answer(optionKey?: string) {
    if (!diagnosis.followup) return
    setAnswering(true)
    try {
      await api.answerFollowup(diagnosis.session_id, optionKey ? { option_key: optionKey } : { text: '不确定' })
      onRefresh(diagnosis.session_id)
    } catch (e) { onError(String(e)) } finally { setAnswering(false) }
  }

  async function skip() {
    setAnswering(true)
    try {
      await api.skipFollowup(diagnosis.session_id)
      onRefresh(diagnosis.session_id)
    } catch (e) { onError(String(e)) } finally { setAnswering(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-5 space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
        className="card flex items-center gap-4 p-5"
        style={{ background: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)',
                 borderColor: diagnosis.is_correct ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {diagnosis.is_correct
          ? <CheckCircle size={26} weight="fill" className="flex-none text-ok" />
          : <Warning size={26} weight="fill" className="flex-none text-cat-red" />}
        <div>
          <p className="font-semibold">{diagnosis.is_correct ? '回答正确' : '回答错误'}</p>
          {!diagnosis.is_correct && <p className="text-[13px] text-ink-2">正确答案 {diagnosis.answer} · 系统正在定位你的错因</p>}
        </div>
      </motion.div>

      {diagnosis.state === 'followup_required' && !diagnosis.followup && (
        <div className="card p-8">
          <div className="skeleton mb-3 h-6 w-2/3" />
          <div className="skeleton h-14 w-full" />
          <p className="mt-3 text-xs text-ink-3">正在生成定向追问…</p>
        </div>
      )}

      {diagnosis.state === 'followup_required' && diagnosis.followup && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <div className="mb-1 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="size-2 rounded-full bg-primary breath" />
              定向追问 · 正在定位你的理解缺口
            </p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diagnosis.followup.turn_max }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < diagnosis.followup_count + 1 ? 'bg-primary' : 'bg-line'}`} />
              ))}
              <span className="ml-1 text-xs text-ink-3">第 {diagnosis.followup_count + 1} / {diagnosis.followup.turn_max} 轮</span>
            </div>
          </div>
          <p className="display mb-6 text-[17px]">{diagnosis.followup.question_text}</p>
          {diagnosis.followup.options ? (
            <div className="space-y-2.5">
              {diagnosis.followup.options.map((o) => (
                <motion.button key={o.key} disabled={answering} whileTap={{ scale: 0.99 }} onClick={() => answer(o.key)}
                  className="btn !justify-start w-full rounded-2xl border border-line bg-white px-5 py-3.5 text-left text-sm hover:border-primary hover:bg-primary-soft">
                  <span className="mr-3 grid size-7 flex-none place-items-center rounded-full border border-line text-xs font-bold text-ink-2">{o.key}</span>
                  {o.text}
                </motion.button>
              ))}
            </div>
          ) : (
            <OpenAnswer onAnswer={() => answer()} disabled={answering} />
          )}
          <button onClick={skip} disabled={answering}
            className="btn mt-5 items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
            <SkipForward size={13} />跳过追问，生成低证据归因
          </button>
        </motion.div>
      )}

      {diagnosis.card && (
        <motion.div initial={{ opacity: 0, y: 16, rotate: -0.4 }} animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={spring} className="card relative overflow-hidden !rounded-[24px]">
          <div className="border-b border-line-2 px-8 pb-5 pt-7" style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <span className="rx-badge">Rx</span>
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">错因诊断卡 · YAOZHI DIAGNOSIS</p>
                  <p className="mt-0.5 text-[13px] text-ink-2">依据你的作答证据与追问回答出具</p>
                </div>
              </div>
              <Stamp level={diagnosis.card.evidence_level} />
            </div>
          </div>
          <div className="p-8">
            <div className="flex flex-wrap items-center gap-3">
              <CategoryTag category={diagnosis.card.misconception.category} />
              <p className="text-[15.5px] font-medium">{diagnosis.card.misconception.name}</p>
            </div>
            <hr className="rx-divider my-6" />
            <p className="mb-3.5 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule gold" />归因依据（证据链）
            </p>
            <div className="space-y-3.5">
              {diagnosis.card.evidences.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.15 + i * 0.08 }}
                  className="rounded-xl bg-paper px-5 py-3.5 text-sm">
                  <p className="mb-0.5 text-xs text-ink-3">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                  <p className="leading-relaxed text-ink-2">{e.content}</p>
                </motion.div>
              ))}
            </div>
            {diagnosis.state === 'diagnosed' && (
              <button onClick={onStartTraining} className="btn btn-primary mt-7">
                按此诊断开具靶向训练<ArrowRight size={15} weight="bold" />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

function Stamp({ level }: { level: string }) {
  const color = level === '高' ? 'var(--color-ok)' : level === '中' ? 'var(--color-primary)' : 'var(--color-warn)'
  return (
    <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.92 }}
      transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
      className="stamp text-[13px]" style={{ color }}>
      证据<br />{level}
    </motion.span>
  )
}

function OpenAnswer({ onAnswer, disabled }: { onAnswer: () => void; disabled: boolean }) {
  const [text, setText] = useState('')
  return (
    <div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder="用你自己的话回答" className="input" />
      <button onClick={() => onAnswer()} disabled={disabled || !text.trim()} className="btn btn-primary mt-4">
        <MagnifyingGlass size={14} />提交回答
      </button>
    </div>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="card p-14 text-center">
      <div className="mx-auto w-fit opacity-30"><Hex size={64} className="text-primary" /></div>
      <p className="mt-4 text-sm text-ink-3">{text}</p>
    </div>
  )
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
}
