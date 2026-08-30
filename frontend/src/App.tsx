import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, Pill,
  CalendarBlank, BookOpen, ClockCounterClockwise, SquaresFour, Gear,
} from '@phosphor-icons/react'
import * as echarts from 'echarts'
import { api, type Diagnosis, type Question } from './api'

/*
 * 药知 · 「现代药房 × 分子美学」
 * 流程（对齐产品原型）：注册 → 同意 → 题库(今日待办) → 作答 → 诊断 → 追问 → 训练 → 档案
 * 布局：通栏玻璃步骤轨 + 左侧学习栏 + 内容区
 */

const USER_KEY = 'yaozhi_user_id_v2'

type Screen = 'register' | 'consent' | 'goal' | 'assessment' | 'portrait' | 'list' | 'material' | 'flow' | 'profile'
type View = 'todo' | 'material' | 'wrongbook' | 'profile'

const STEPS = ['注册', '同意', '目标', '摸底', '画像', '路径', '学习', '练习', '诊断', '追问', '训练', '复测', '档案'] as const

const spring = { type: 'spring', stiffness: 120, damping: 20 } as const
const Rconst = 52
const Cconst = 2 * Math.PI * Rconst

function stepIndex(screen: Screen, diagnosis: Diagnosis | null): number {
  const map: Record<Screen, number> = {
    register: 0, consent: 1, goal: 2, assessment: 3, portrait: 4,
    list: 5, flow: 6, profile: 10,
    material: 6,
  }
  if (screen !== 'flow') return map[screen]
  if (!diagnosis) return 6
  if (diagnosis.state === 'followup_required') return 8
  if (diagnosis.state === 'training' || diagnosis.state === 'retesting') return 9
  return 7
}

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(USER_KEY) ? 'list' : 'register'))
  const [view, setView] = useState<View>('todo')
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<string>('期末冲绩')
  const [portrait, setPortrait] = useState<PortraitResult | null>(null)
  const [materialDomain, setMaterialDomain] = useState<string | null>(null)

  function onRegistered(id: string) {
    localStorage.setItem(USER_KEY, id)
    setUserId(id); setScreen('consent')
  }
  function onConsented() {
    setScreen('goal')
  }
  function logout() {
    localStorage.removeItem(USER_KEY)
    setUserId(null); setScreen('register'); setActiveQuestion(null); setDiagnosis(null); setView('todo')
  }

  const step = stepIndex(screen, diagnosis)
  const inLearning = ['list', 'flow', 'profile', 'goal', 'assessment', 'portrait', 'material'].includes(screen)

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
            {screen === 'goal' && (
              <GoalPicker key="goal" onNext={(goal) => { setGoal(goal); setScreen('assessment') }} goal={goal} />
            )}
            {screen === 'assessment' && userId && (
              <Assessment key="assess" userId={userId}
                onDone={(r) => { setPortrait(r); setScreen('portrait') }} onError={setError} />
            )}
            {screen === 'portrait' && portrait && (
              <Portrait key="portrait" result={portrait} onEnter={() => { setScreen('list'); setView('todo') }} />
            )}
            {screen === 'list' && userId && view === 'todo' && (
              <LearningPathHome key="plan" userId={userId}
                onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }}
                onMaterial={(domainId) => { setMaterialDomain(domainId); setScreen('material') }} />
            )}
            {screen === 'material' && materialDomain && (
              <MaterialView key={materialDomain} domainId={materialDomain} onError={setError}
                onPractice={(q) => { setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }} />
            )}
            {screen === 'flow' && userId && activeQuestion && (
              <PracticeFlow key={activeQuestion.id} userId={userId} question={activeQuestion}
                onDiagnosis={setDiagnosis} onError={setError}
                onStep={() => {}}
                onExit={() => { setScreen('list'); setActiveQuestion(null); setDiagnosis(null); setView('todo') }} />
            )}
            {screen === 'profile' && userId && (view === 'wrongbook' || view === 'profile') && (
              <Profile key={view} userId={userId} />
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
          {item('material', '学习材料', <BookOpen size={15} />)}
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

/* ---------- 第 3 步 · 目标选择 ---------- */

const GOALS = [
  ['期末冲绩', '围绕本学期药理学课程的重难点与易错点，提升章节测验成绩。'],
  ['补齐理解缺口', '不急着刷题，先把「为什么错」搞清楚，重建机制理解链。'],
  ['备考执业药师', '对照执业药师考点组织练习，兼顾课程与考证。'],
] as const

function GoalPicker({ onNext, goal }: { onNext: (g: string) => void; goal: string }) {
  const [picked, setPicked] = useState<string>(goal)
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

  useEffect(() => { window.scrollTo(0, 0) }, [])
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
      xAxis: { type: 'category', data: data.categories, splitArea: { show: true },
        axisLabel: { rotate: 18, fontSize: 11, interval: 0, color: '#45594F' } },
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
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const categories = ['知识遗忘', '概念混淆', '机制理解不足', '审题与应用失误', '待诊断']
  const domains = [...new Set(result.weak.map((w) => w.domain ?? '未知域'))]
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

/* ---------- 学习路径（今日待办） ---------- */

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
  const [starting, setStarting] = useState(false)

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
        <button
          onClick={() => {
            setStarting(true)
            api.questions().then((list) => {
              const q = list.find((x: Question) => x.domain_id === domainId)
              if (q) onPractice(q)
              else onError("该诊断域暂无练习题，请从今日待办选择其他任务。")
            }).catch((e) => onError(String(e))).finally(() => setStarting(false))
          }}
          disabled={starting}
          className="btn btn-primary !px-8 !py-3.5 shadow-[var(--shadow-lg)]">
          <CheckCircle size={16} />{starting ? "正在进入…" : "完成学习，进入练习"}
        </button>
      </div>
    </motion.div>
  )
}

/* ---------- 聚光边框卡片 ---------- *//* ---------- 聚光边框卡片 ---------- */

type Analysis = {
  question_code: string; stem: string; answer: string
  evidence: { ref: string; text: string }[]
  analysis: { option: string; option_text: string; category: string; misconception: string; note: string }[]
}

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

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.mastery(userId).then(setMastery).catch(() => setMastery([]))
    api.wrongBook(userId).then(setWrong).catch(() => setWrong([]))
  }, [userId])

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">学习档案</p>
      <h2 className="display mt-2 text-[26px]">你的错因画像与错题本</h2>
      <p className="mt-2 text-sm text-ink-2">演示账号 {userId.slice(0, 8)} · 数据仅存于校内演示环境</p>

      <div className="mt-6 space-y-8">
        <section>
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />掌握状态</h3>
          {!mastery && <div className="skeleton h-20" />}
          {mastery && mastery.length === 0 && <EmptyPanel text="还没有掌握度记录：完成一次「作答 → 诊断 → 训练 → 复测」后这里会出现你的错因画像。" />}
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

function PracticeFlow({ userId, question, onDiagnosis, onError, onExit, onStep }: {
  userId: string; question: Question
  onDiagnosis: (d: Diagnosis | null) => void; onError: (m: string) => void; onExit: () => void
  onStep: (n: number) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [retest, setRetest] = useState<{ retest_id: string; questions: { id: string; stem: string; options: { key: string; text: string }[] }[] } | null>(null)
  const [retestPicks, setRetestPicks] = useState<Record<string, string>>({})
  const [retestResult, setRetestResult] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
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
      onStep(8)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(id: string) { pushDiagnosis(await api.diagnosis(id)) }

  async function startTraining() {
    if (!diagnosis) return
    try {
      const t = await api.training(diagnosis.session_id)
      setTraining(t)
      pushDiagnosis(await api.diagnosis(diagnosis.session_id))
      onStep(10)
    } catch (e) { onError(String(e)) }
  }

  async function finishTraining() {
    if (!training) return
    try {
      const r = await api.submitTraining(training.training_id, trainingPicks)
      setTrainingResult({ score: r.score })
      if (r.score >= 0.6) {
        const rt = await api.retest(training.training_id)
        setRetest(rt)
        onStep(11)
      }
    } catch (e) { onError(String(e)) }
  }

  async function finishRetest() {
    if (!retest) return
    try {
      const r = await api.submitRetest(retest.retest_id, retestPicks)
      setRetestResult({ passed: r.passed, correct: r.correct, total: r.total })
    } catch (e) { onError(String(e)) }
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
          <DiagnosisPanel key={diagnosis.session_id}
            diagnosis={diagnosis} questionId={question.id} onRefresh={refresh}
            onStartTraining={startTraining} onExit={onExit} onError={setError} />
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

      {trainingResult && !retest && <TrainingResult score={trainingResult.score} onExit={onExit} />}

      {retest && !retestResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="display text-[19px]">迁移复测 · 新情境检验</h3>
            <span className="rounded-full bg-gold-soft px-3 py-1 text-xs font-semibold text-gold">通过后标记「已突破」</span>
          </div>
          <p className="mb-5 text-xs text-ink-3">以下题目换了情境但考查同一个推理链——这才是真正掌握的检验。</p>
          <div className="space-y-6">
            {retest.questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-6">
                <p className="mb-3.5 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                      onClick={() => setRetestPicks({ ...retestPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm
                        ${retestPicks[q.id] === o.key ? 'border-primary' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      {retestPicks[q.id] === o.key && (
                        <motion.span layoutId={`rt-${q.id}`} transition={spring} className="absolute inset-0 rounded-xl bg-primary-soft" />
                      )}
                      <span className="relative z-10 flex items-center gap-3">
                        <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold
                          ${retestPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                        {o.text}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={finishRetest} disabled={Object.keys(retestPicks).length < retest.questions.length}
            className="btn btn-primary mt-7">提交复测</button>
        </motion.div>
      )}

      {retestResult && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
          className="card mt-5 !rounded-[24px] p-10 text-center"
          style={{ background: retestResult.passed ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
          <div className="relative mx-auto size-[110px]">
            <svg className="size-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={Rconst} fill="none" stroke="#fff" strokeWidth={9} />
              <motion.circle cx="60" cy="60" r={Rconst} fill="none" strokeWidth={9} strokeLinecap="round"
                strokeDasharray={Cconst}
                initial={{ strokeDashoffset: Cconst }}
                animate={{ strokeDashoffset: Cconst * (1 - retestResult.correct / Math.max(retestResult.total, 1)) }}
                transition={{ ...spring, delay: 0.25 }}
                style={{ stroke: retestResult.passed ? 'var(--color-ok)' : 'var(--color-cat-red)' }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <p className="display text-[24px]">{retestResult.correct}/{retestResult.total}</p>
            </div>
          </div>
          <h3 className="display mt-5 text-[20px]">{retestResult.passed ? '复测通过 · 已标记「掌握」' : '复测未通过 · 已退回薄弱项'}</h3>
          <p className="mt-2 text-sm text-ink-2">
            {retestResult.passed
              ? '迁移情境下推理依然成立，这个缺口真正补上了。'
              : '换个情境就没答对，说明之前是短期记忆——材料再看一遍，隔两天再来。'}
          </p>
          <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
        </motion.div>
      )}
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

function DiagnosisPanel({ diagnosis, questionId, onRefresh, onStartTraining, onExit, onError }: {
  diagnosis: Diagnosis; questionId: string; onRefresh: (id: string) => void
  onStartTraining: () => void; onExit: () => void; onError: (m: string) => void
}) {
  const [answering, setAnswering] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showFollowup, setShowFollowup] = useState(false)
  const [openAnalysis, setOpenAnalysis] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [data, setData] = useState<{ question_code: string } | null>(null)

  useEffect(() => {
    if (diagnosis.is_correct) {
      api.questionAnalysis(questionId).then((r: Analysis) => { setAnalysis(r); setData({ question_code: r.question_code }) }).catch((e) => onError(String(e)))
    }
  }, [diagnosis.is_correct])

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
          {!diagnosis.is_correct
            ? <p className="text-[13px] text-ink-2">正确答案 {diagnosis.answer} · 系统正在定位你的错因</p>
            : <p className="text-[13px] text-ink-2">这道题的坑你已经避开了 — 可选：看看其他错误选项背后的典型误区</p>}
        </div>
        {diagnosis.is_correct && (
          <button onClick={() => setOpenAnalysis(!openAnalysis)}
            className="btn ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: 'var(--color-cat-red)' }}>
            查看错因分析
          </button>
        )}
      </motion.div>
      {diagnosis.is_correct && openAnalysis && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-4 !rounded-[24px] overflow-hidden">
          <div className="border-b border-line-2 px-8 pb-5 pt-7" style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
            <div className="flex items-center gap-4">
              <span className="rx-badge">Rx</span>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">错因分析 · 防坑指南</p>
                <p className="mt-0.5 text-[13px] text-ink-2">答对了也值得看看：每个错误选项背后是什么典型误区</p>
              </div>
            </div>
          </div>
          <div className="p-8">
            {analysis?.analysis.map((a: Analysis['analysis'][number]) => (
              <div key={a.option} className="mb-4 rounded-xl bg-paper px-5 py-4">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="grid size-6 place-items-center rounded-full border border-line text-xs font-bold text-ink-2">{a.option}</span>
                  <span className="text-sm font-medium">{a.option_text}</span>
                  <CategoryTag category={a.category} />
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-2">若误选此项，会被归因为：{a.misconception}{a.note ? `（${a.note}）` : ''}</p>
              </div>
            ))}
            {analysis && analysis.evidence.length > 0 && (
              <div className="rounded-xl bg-paper px-5 py-4 text-[13px]">
                <p className="mb-1 text-xs text-ink-3">解析（{data?.question_code ?? ''}）</p>
                <p className="leading-relaxed text-ink-2">{analysis.evidence[0]?.text}</p>
              </div>
            )}
            <button onClick={onExit} className="btn btn-primary mt-6">返回今日待办</button>
          </div>
        </motion.div>
      )}

      {!diagnosis.is_correct && showFollowup && diagnosis.followup && (
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
          <div className="mb-6 space-y-3">
            {diagnosis.turns.map((t, i) => (
              <div key={i} className={`flex ${t.who === 'student' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4.5 py-3 text-sm leading-relaxed
                  ${t.who === 'ai' ? 'rounded-tl-sm bg-paper text-ink border border-line-2' : 'rounded-tr-sm bg-primary text-white'}`}>
                  {t.who === 'ai' && <span className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold text-ink-3">
                    <span className="grid size-4 place-items-center rounded-full bg-primary text-white"><Pill size={9} weight="fill" /></span>药知</span>}
                  {t.text}
                </div>
              </div>
            ))}
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-primary/40 bg-primary-soft px-4.5 py-3">
                <p className="display text-[15px] leading-relaxed">{diagnosis.followup.question_text}</p>
              </div>
            </div>
          </div>
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
          <div className="mt-5 flex items-center gap-3">
            <button onClick={skip} disabled={answering}
              className="btn items-center gap-1 text-[13px] text-ink-3 hover:text-ink">
              <SkipForward size={13} />跳过追问，维持低证据归因
            </button>
            <button onClick={() => setShowFollowup(false)}
              className="btn text-[13px] text-ink-3 hover:text-ink">返回诊断卡</button>
          </div>
        </motion.div>
      )}

      {!diagnosis.is_correct && diagnosis.card?.can_refine && !showFollowup && (
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => setShowFollowup(true)}
          className="btn card w-full items-center gap-3 p-5 text-left hover:shadow-[var(--shadow-lg)]">
          <span className="grid size-9 flex-none place-items-center rounded-xl bg-gold-soft font-serif font-bold text-gold">问</span>
          <span>
            <span className="block text-sm font-medium">追问对话 · 进一步定位你的理解缺口</span>
            <span className="block text-xs text-ink-3 mt-0.5">证据等级为低——回答几个定向问题，可将归因细化到高证据（可选，最多 3 轮）</span>
          </span>
          <ArrowRight size={15} className="ml-auto text-ink-3" />
        </motion.button>
      )}

      {!diagnosis.is_correct && diagnosis.card && (
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
            {diagnosis.followup_count > 0 && !diagnosis.card.can_refine && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring}
                className="mb-5 flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-2.5 text-[13px] text-ink-2">
                  {diagnosis.card.evidence_level === '高'
                    ? `证据已足够，归因收敛为「${diagnosis.card.misconception.category}」，证据等级提升为 高。`
                    : `追问已完成。当前归因维持为「${diagnosis.card.misconception.category}」，证据等级：低——稍后可再来细化。`}
                </div>
              </motion.div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <CategoryTag category={diagnosis.card.misconception.category} />
              <p className="text-[15.5px] font-medium">{diagnosis.card.misconception.name}</p>
            </div>
            <hr className="rx-divider my-6" />
            <div className="mb-3.5 flex items-center justify-between">
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
                <span className="capsule gold" />归因依据（证据链）
              </p>
              <button onClick={() => setShowEvidence(!showEvidence)}
                className="btn rounded-full border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
                {showEvidence ? '收起证据' : '展开证据'}
              </button>
            </div>
            {showEvidence && <div className="space-y-3.5">
              {diagnosis.card.evidences.map((e, i) => (
                <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.15 + i * 0.08 }}
                  className="rounded-xl bg-paper px-5 py-3.5 text-sm">
                  <p className="mb-0.5 text-xs text-ink-3">{e.type}{e.source ? ` · ${e.source}` : ''}</p>
                  <p className="leading-relaxed text-ink-2">{e.content}</p>
                </motion.div>
              ))}
            </div>}

            {diagnosis.card.alternatives && diagnosis.card.alternatives.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold text-ink-3">候选错因</p>
                <div className="space-y-2">
                  {diagnosis.card.alternatives.map((a) => (
                    <div key={a.code}
                      className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm
                        ${a.primary ? 'border-primary/40 bg-primary-soft' : 'border-line-2 bg-white text-ink-2'}`}>
                      <span className={a.primary ? 'font-medium' : ''}>{a.name}</span>
                      <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold
                        ${a.primary ? 'bg-primary text-white' : 'bg-paper-2 text-ink-3'}`}>
                        {a.primary ? '主要' : '次要'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs text-ink-3">
              这个诊断符合你的情况吗？
              <button onClick={() => { api.feedback(diagnosis.session_id, true).catch(() => {}); setFeedback('matches') }}
                disabled={feedback !== null}
                className={`btn rounded-full border px-3 py-1.5 ${feedback === 'matches' ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:border-primary'}`}>
                <CheckCircle size={12} />归因与我相符
              </button>
              <button onClick={() => { api.feedback(diagnosis.session_id, false).catch(() => {}); setFeedback('not_matches') }}
                disabled={feedback !== null}
                className={`btn rounded-full border px-3 py-1.5 ${feedback === 'not_matches' ? 'border-gold bg-gold text-white' : 'border-line bg-white hover:border-gold'}`}>
                <Warning size={12} />与我并不相符
              </button>
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
  const dots = level === '高' ? 3 : level === '中' ? 2 : 1
  return (
    <div className="flex flex-col items-end gap-1.5">
      <motion.span initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 0.92 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.2 }}
        className="stamp text-[13px]" style={{ color }}>
        证据<br />{level}
      </motion.span>
      <span className="flex items-center gap-1" title={`证据等级 ${level}`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 rounded-full"
            style={{ background: i < dots ? color : 'var(--color-line)' }} />
        ))}
      </span>
    </div>
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
