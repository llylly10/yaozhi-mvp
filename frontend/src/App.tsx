import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { motion, AnimatePresence, MotionConfig, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion'
import {
  CheckCircle, XCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, ArrowUp, CaretDown, Pill,
  CalendarBlank, ClockCounterClockwise, SquaresFour, Gear, BookOpenText, ChatCircle, ChatCircleText,
  Lightning, Hourglass, Sparkle, ShareNetwork, FirstAid, Printer,
} from '@phosphor-icons/react'
import { api, type Diagnosis, type Question, type TikuFeedback, type RetestCapsuleData } from './api'
import { EvalBenchmarkModal } from './EvalBenchmarkModal'
import { CustomQuizView } from './CustomQuizView'
import { KnowledgeDetailModal } from './KnowledgeDetailModal'
import { WrongBookExportModal } from './WrongBookExportModal'
import { ClinicalCaseView } from './ClinicalCaseView'
import { SettingsModal } from './SettingsModal'

/*
 * 药知 · 「现代药房 × 分子美学」
 * 流程（对齐产品原型）：注册 → 同意 → 题库(今日待办) → 作答 → 诊断 → 追问 → 训练 → 档案
 * 布局：通栏玻璃步骤轨 + 左侧学习栏 + 内容区
 */

const USER_KEY = 'yaozhi_user_id_v2'

// 幂等键 UUID 生成：优先 crypto.randomUUID（仅 HTTPS/localhost 可用）；
// 降级 crypto.getRandomValues（非安全上下文也有），再降级纯 JS（极老浏览器/非安全上下文兜底）。
function genUUID(): string {
  // 兼容非安全上下文（HTTP 公网）crypto 不可用：类型上把 crypto 视作可选，避免 TS2774
  const g = globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }
  if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  const grv: (a: Uint8Array) => Uint8Array = g.crypto?.getRandomValues
    ? g.crypto.getRandomValues.bind(g.crypto)
    : (arr: Uint8Array) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr }
  const b = grv(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40 // version 4
  b[8] = (b[8] & 0x3f) | 0x80 // variant 10
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

type Screen = 'register' | 'consent' | 'goal' | 'study' | 'assessment' | 'portrait' | 'list' | 'material' | 'flow' | 'profile' | 'qa' | 'custom_quiz' | 'clinical_cases'
type View = 'todo' | 'material' | 'wrongbook' | 'profile' | 'qa' | 'custom_quiz' | 'clinical_cases'

const STEPS = ['注册', '同意', '目标', '地图', '摸底', '画像', '路径', '学习', '练习', '诊断', '追问', '训练', '复测', '档案'] as const

const spring = { type: 'spring', stiffness: 120, damping: 20 } as const
const Rconst = 52
const Cconst = 2 * Math.PI * Rconst

function stepIndex(screen: Screen, diagnosis: Diagnosis | null): number {
  const map: Record<Screen, number> = {
    register: 0, consent: 1, goal: 2, study: 3, assessment: 4, portrait: 5,
    list: 6, flow: 8, profile: 13,
    material: 7, qa: 6, custom_quiz: 6, clinical_cases: 6,
  }
  if (screen !== 'flow') return map[screen]
  if (!diagnosis) return 8
  if (diagnosis.state === 'diagnosed') return 9
  if (diagnosis.state === 'followup_required') return 10
  if (diagnosis.state === 'training') return 11
  if (diagnosis.state === 'retesting') return 12
  return 8
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
  const [showEvalModal, setShowEvalModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [qaPrefill, setQaPrefill] = useState<{ context?: string; question?: string } | null>(null)

  // 主壳（可切换视图的页面：今日待办/错题本/问AI/档案/自适应组卷/临床沙盘），全屏子流程(材料/练习/onboarding)不显示底部导航
  const isShell = screen === 'list' || screen === 'profile' || screen === 'qa' || screen === 'custom_quiz' || screen === 'clinical_cases'
  function goNav(v: View) {
    setError(null); setView(v)
    setScreen(v === 'todo' ? 'list' : v === 'qa' ? 'qa' : v === 'custom_quiz' ? 'custom_quiz' : v === 'clinical_cases' ? 'clinical_cases' : 'profile')
    setActiveQuestion(null)
  }

  function handleAskAi(context: string, defaultQ?: string) {
    setQaPrefill({ context, question: defaultQ || '' })
    setView('qa')
    setScreen('qa')
    setActiveQuestion(null)
    window.scrollTo(0, 0)
  }

  // 屏幕/视图切换时清掉上一页残留报错，避免错误条跨页误显示
  const prevNavKey = useRef('')
  useEffect(() => {
    const k = `${screen}/${view}`
    if (prevNavKey.current !== k) { prevNavKey.current = k; setError(null) }
  }, [screen, view])

  function onRegistered(id: string, consented?: boolean) {
    localStorage.setItem(USER_KEY, id)
    setUserId(id)
    if (consented) {
      // 老用户重新登录：跳过知情同意，直接回到系统待办列表与学情全景
      setScreen('list')
      setView('todo')
    } else {
      setScreen('consent')
    }
  }
  function onConsented() {
    setScreen('goal')
  }
  function logout() {
    localStorage.removeItem(USER_KEY)
    setUserId(null); setScreen('register'); setActiveQuestion(null); setDiagnosis(null); setView('todo')
  }

  // 本地缓存的 userId 若在服务器已失效(演示库被重置/账号已撤回)，自动清缓存回落注册页，
  // 避免残留下直入主壳报「数据不存在或已被重置」。每次 userId 变更探活一次。
  const checkedUid = useRef<string | null>(null)
  useEffect(() => {
    if (!userId) { checkedUid.current = null; return }
    if (checkedUid.current === userId) return
    checkedUid.current = userId
    api.userExists(userId).then((ok) => { if (!ok) logout() }).catch(() => {})
  }, [userId])

  const step = stepIndex(screen, diagnosis)
  const inLearning = ['list', 'flow', 'profile', 'goal', 'study', 'assessment', 'portrait', 'material', 'qa'].includes(screen)

  // 聚光灯跟随：单次委托 pointermove 写 CSS 变量（--mx/--my），不进 React render，移动端安全
  useEffect(() => {
    function onMove(e: PointerEvent) {
      const t = (e.target as HTMLElement | null)?.closest?.('.spot-card') as HTMLElement | null
      if (!t) return
      const r = t.getBoundingClientRect()
      t.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
      t.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  // 顶部步骤轨点击跳转：注册/同意/目标/摸底/画像/路径/学习/练习/诊断/追问/训练/复测/档案
  function goStep(i: number) {
    setError(null)
    if (i === 0) { setActiveQuestion(null); setView('todo'); setScreen('register'); window.scrollTo(0, 0); return }
    if (!userId) return
    if (i === 1) { setScreen('consent') }
    else if (i === 2) { setActiveQuestion(null); setScreen('goal') }
    else if (i === 3) { setActiveQuestion(null); setScreen('study') }
    else if (i === 4) { setActiveQuestion(null); setDiagnosis(null); setScreen('assessment') }
    else if (i === 5) { if (portrait) setScreen('portrait'); else setScreen('assessment') }
    else if (i === 6) { setActiveQuestion(null); setView('todo'); setScreen('list') }
    else if (i === 7) {
      if (materialDomain) setScreen('material')
      else { setView('todo'); setScreen('list') }
    } else if (i >= 8 && i <= 12) {
      if (activeQuestion) setScreen('flow')
      else { setView('todo'); setScreen('list') }
    } else if (i === 13) { setActiveQuestion(null); setView('profile'); setScreen('profile') }
    window.scrollTo(0, 0)
  }
  function stepHint(i: number): string {
    if (i === 0) return '去注册 / 登录'
    if (!userId) return '请先登录'
    const hints: Record<number, string> = {
      1: '去知情同意', 2: '去学习目标', 3: '去学习地图（知识图谱）', 4: '去摸底测试',
      5: portrait ? '去摸底画像' : '完成摸底后可看画像',
      6: '去今日待办（学习路径）', 7: materialDomain ? '去学习材料' : '去今日待办选一节学习材料',
      8: activeQuestion ? '去练习作答' : '去今日待办选一题开始练习',
      9: activeQuestion ? '去诊断结论' : '去今日待办选一题进入诊断',
      10: activeQuestion ? '去追问诊断' : '去今日待办选一题进入追问',
      11: activeQuestion ? '去靶向训练' : '去今日待办选一题进入训练',
      12: activeQuestion ? '去迁移复测' : '去今日待办选一题进入复测',
      13: '去学习档案',
    }
    return hints[i] ?? ''
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative min-h-[100dvh]">
      <div className="ambient" aria-hidden />
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowEvalModal(true)}
                  className="btn flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/70 px-3 py-1 text-xs font-semibold text-primary shadow-xs transition hover:bg-primary-soft hover:shadow-sm"
                  title="查看错因诊断保护测试集三级红线门禁与混淆矩阵"
                >
                  <Sparkle size={13} weight="fill" />
                  算法评测与门禁
                </button>
                <button onClick={logout} className="btn rounded-full px-3 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink">退出账号</button>
              </div>
            </div>
            <div className="mx-auto flex w-full max-w-[1140px] flex-nowrap items-center gap-0.5 overflow-x-auto py-1.5
              [mask-image:linear-gradient(90deg,transparent,#000_28px,#000_calc(100%-28px),transparent)]">
              {STEPS.map((s, i) => {
                const enabled = i === 0 || !!userId
                return (
                  <span key={s} className="flex flex-none items-center">
                    {i > 0 && <span className="mx-0.5 text-[9px] text-line">▸</span>}
                    <button onClick={() => goStep(i)} disabled={!enabled} title={stepHint(i)}
                      className={`relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] transition-colors
                        ${i === step ? 'font-semibold text-white' : 'text-ink-3 hover:bg-paper-2 hover:text-primary'}
                        ${!enabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-ink-3' : ''}`}>
                      {i === step && (
                        <motion.span layoutId="step-pill" transition={spring}
                          className="absolute inset-0 rounded-full bg-primary" aria-hidden />
                      )}
                      <span className={`relative z-10 size-1.5 rounded-full ${i <= step ? (i === step ? 'bg-white' : 'bg-primary') : 'bg-line'}`} />
                      <span className="relative z-10">{s}</span>
                    </button>
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-[1140px] gap-6 px-5 pb-16 pt-6">
        {/* 左侧学习栏 */}
        {inLearning && (
          <Sidebar
            view={view}
            currentScreen={screen}
            onNav={goNav}
            onGoMap={() => { setActiveQuestion(null); setScreen('study'); window.scrollTo(0, 0); }}
            onOpenSettings={() => setShowSettingsModal(true)}
          />
        )}

        <div className="min-w-0 flex-1">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <AnimatePresence mode="wait">
            {screen === 'register' && <Welcome key="register" onRegistered={onRegistered} onError={setError} onOpenEval={() => setShowEvalModal(true)} />}
            {screen === 'consent' && userId && <Consent key="consent" userId={userId} onConsented={onConsented} onBack={() => setScreen('register')} onError={setError} />}
            {screen === 'goal' && (
              <GoalPicker key="goal" goal={goal}
                onNext={(g) => { setGoal(g); setScreen('study') }}
                onBack={() => setScreen('consent')} />
            )}
            {screen === 'study' && userId && (
              <StudyMapOnboard key="study" userId={userId} goal={goal} onError={setError}
                onProceed={() => setScreen('assessment')}
                onSkip={() => setScreen('assessment')}
                onBack={() => setScreen('goal')}
                onAskAi={handleAskAi} />
            )}
            {screen === 'assessment' && userId && (
              <Assessment key="assess" userId={userId}
                onDone={(r) => { setPortrait(r); setScreen('portrait') }} onError={setError}
                onBack={() => setScreen('study')} />
            )}
            {screen === 'portrait' && portrait && (
              <Portrait key="portrait" result={portrait}
                onEnter={() => { setError(null); setScreen('list'); setView('todo') }}
                onBack={() => setScreen('study')} />
            )}
            {screen === 'list' && userId && view === 'todo' && (
              <LearningPathHome key="plan" userId={userId}
                onPick={(q) => { setError(null); setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }}
                onMaterial={(domainId) => { setMaterialDomain(domainId); setScreen('material') }} />
            )}
            {screen === 'material' && materialDomain && userId && (
              <MaterialRoute key={materialDomain} userId={userId} domainId={materialDomain} goal={goal} onError={setError}
                onPractice={(q) => { setActiveQuestion(q); setScreen('flow'); setDiagnosis(null) }}
                onBack={() => { setScreen('list'); setView('todo') }}
                onAskAi={handleAskAi} />
            )}
            {screen === 'flow' && userId && activeQuestion && (
              <PracticeFlow key={activeQuestion.id} userId={userId} question={activeQuestion}
                onDiagnosis={setDiagnosis} onError={setError}
                onStep={() => {}}
                onAskAi={handleAskAi}
                onExit={() => { setScreen('list'); setActiveQuestion(null); setDiagnosis(null); setView('todo') }} />
            )}
            {screen === 'profile' && userId && view === 'profile' && (
              <Profile key="profile" userId={userId} onGoTodo={() => goNav('todo')} />
            )}
            {screen === 'profile' && userId && view === 'wrongbook' && (
              <WrongBook key="wrongbook" userId={userId} onGoTodo={() => goNav('todo')} onAskAi={handleAskAi} />
            )}
            {screen === 'custom_quiz' && userId && (
              <CustomQuizView key="custom_quiz" userId={userId} onExit={() => goNav('todo')} onAskAi={handleAskAi} />
            )}
            {screen === 'clinical_cases' && userId && (
              <ClinicalCaseView key="clinical_cases" userId={userId} onAskAi={handleAskAi} onBackToTodo={() => goNav('todo')} />
            )}
            {screen === 'qa' && userId && view === 'qa' && (
              <QAView key="qa" userId={userId} onError={setError} prefill={qaPrefill} onClearPrefill={() => setQaPrefill(null)} />
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* 移动端底部导航（仅主壳显示）+ 留白防遮挡 */}
      {isShell && (
        <>
          <div className="h-20 lg:hidden" aria-hidden />
          <MobileTab current={{ screen, view }} onNav={goNav} />
        </>
      )}
      <BackToTop />
      {showEvalModal && <EvalBenchmarkModal onClose={() => setShowEvalModal(false)} />}
      {showSettingsModal && (
        <SettingsModal
          open={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          userId={userId}
          accountName={localStorage.getItem('yaozhi_account_name') || undefined}
          onLogout={logout}
          onResetCache={() => {
            localStorage.clear()
            window.location.reload()
          }}
        />
      )}
    </div>
    </MotionConfig>
  )
}

/* ---------- 苯环分子背景 ---------- */

function Hex({ size, className, style }: { size: number; className?: string; style?: React.CSSProperties }) {
  const h = size, w = size * 0.866
  const pts = `${w / 2},0 ${w},${h * 0.25} ${w},${h * 0.75} ${w / 2},${h} 0,${h * 0.75} 0,${h * 0.25}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style}>
      <polygon points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  )
}

/* 苯环分子背景：退到左右页缘的点缀，不再满屏平铺，避免干扰内容阅读 */
function MolField() {
  const reduce = useReducedMotion()
  // 左上角簇（top-left）与右下角簇（bottom-right），尺寸递减、更淡
  const tl = [
    { left: -30, top: -24, size: 150 }, { left: 44, top: 60, size: 78 }, { left: -14, top: 108, size: 58 },
  ]
  const br = [
    { right: -34, bottom: -30, size: 170 }, { right: 52, bottom: 40, size: 88 }, { right: -8, bottom: 150, size: 62 },
  ]
  type Spot = { size: number } & ({ left: number; top: number } | { right: number; bottom: number })
  const hex = (c: Spot, i: number, flip: boolean) => (
    <motion.div key={`${i}-${c.size}`} className="absolute text-primary/70" style={{
      left: 'left' in c ? `${c.left}%` : undefined, top: 'top' in c ? `${c.top}%` : undefined,
      right: 'right' in c ? `${c.right}%` : undefined, bottom: 'bottom' in c ? `${c.bottom}%` : undefined,
    }}
      animate={reduce ? undefined : { y: [0, -7, 0], rotate: [0, flip ? 5 : -5, 0] }}
      transition={{ duration: 13 + (i % 4) * 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.8 }}>
      <Hex size={c.size} className="opacity-90" />
    </motion.div>
  )
  return (
    <div className="mol-field" aria-hidden>
      {tl.map((c, i) => hex(c, i, true))}
      {br.map((c, i) => hex(c, i, false))}
    </div>
  )
}

/* ---------- 左侧学习栏 ---------- */

function Sidebar({ view, currentScreen, onNav, onGoMap, onOpenSettings }: {
  view: View; currentScreen?: Screen; onNav: (v: View) => void; onGoMap?: () => void; onOpenSettings?: () => void
}) {
  const item = (v: View, label: string, icon: React.ReactNode, disabled = false) => (
    <button key={v + label} disabled={disabled} onClick={() => onNav(v)}
      className={`btn relative !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm
        ${!disabled && currentScreen !== 'study' && view === v ? 'font-semibold text-primary' : 'text-ink-2 hover:bg-paper-2'}
        ${disabled ? 'opacity-45' : ''}`}>
      {!disabled && currentScreen !== 'study' && view === v && (
        <motion.span layoutId="side-active" transition={spring}
          className="absolute inset-0 rounded-xl bg-primary-soft" aria-hidden />
      )}
      <span className="relative z-10 flex items-center gap-2.5">{icon}{label}</span>
      {disabled && <span className="relative z-10 ml-auto text-[10px] text-ink-3">待开放</span>}
    </button>
  )
  return (
    <aside className="hidden w-[212px] flex-none lg:block">
      <div className="glass liquid sticky top-[118px] space-y-5 rounded-[20px] p-3">
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">学习</p>
          {onGoMap && (
            <button onClick={onGoMap}
              className={`btn relative !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition-colors mb-0.5 ${
                currentScreen === 'study' ? 'font-semibold text-primary bg-primary-soft' : 'text-ink-2 hover:bg-paper-2'
              }`}>
              <ShareNetwork size={15} />全景学习地图
            </button>
          )}
          {item('todo', '今日待办', <CalendarBlank size={15} />)}
          {item('custom_quiz', '自适应组卷', <BookOpenText size={15} />)}
          {item('clinical_cases', '临床沙盘', <FirstAid size={15} />)}
          {item('wrongbook', '错题本', <ClockCounterClockwise size={15} />)}
          {item('qa', '问AI', <ChatCircle size={15} />)}
        </div>
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">能力</p>
          {item('profile', '学习档案', <SquaresFour size={15} />)}
        </div>
        <div>
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold text-ink-3">账户</p>
          <button
            onClick={onOpenSettings}
            className="btn !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm text-ink-2 hover:bg-paper-2 transition-colors cursor-pointer"
          >
            <Gear size={15} />设置 · 隐私中心
          </button>
        </div>
      </div>
    </aside>
  )
}

/* 移动端底部导航：窄屏(<lg)时左侧学习栏不可见，用底部 Tab 切换三大主入口 */
function MobileTab({ current, onNav }: { current: { screen: Screen; view: View }; onNav: (v: View) => void }) {
  const active = (screen: Screen, view: View) => current.screen === screen && current.view === view
  const tab = (v: View, label: string, icon: React.ReactNode, screen: Screen, on = false) => (
    <button onClick={() => onNav(v)} disabled={on}
      className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors
        ${active(screen, v) ? 'text-primary' : 'text-ink-3 hover:text-ink-2'} ${on ? 'opacity-45' : ''}`}>
      {active(screen, v) && (
        <motion.span layoutId="mtab-pill" transition={spring}
          className="absolute inset-0 rounded-xl bg-primary-soft" aria-hidden />
      )}
      <span className="relative z-10 flex flex-col items-center gap-0.5">{icon}
        <span className="truncate">{label}</span>
      </span>
    </button>
  )
  return (
    <nav className="glass liquid fixed inset-x-3 bottom-3 z-40 rounded-[26px] px-2 pt-2 lg:hidden"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
      <div className="mx-auto flex w-full max-w-[560px] items-center gap-1">
        {tab('todo', '今日待办', <CalendarBlank size={19} />, 'list')}
        {tab('clinical_cases', '临床沙盘', <FirstAid size={19} />, 'clinical_cases')}
        {tab('qa', '问AI', <ChatCircle size={19} />, 'qa')}
        {tab('wrongbook', '错题本', <ClockCounterClockwise size={19} />, 'profile')}
        {tab('profile', '学习档案', <SquaresFour size={19} />, 'profile')}
      </div>
    </nav>
  )
}

/* 全局回顶：滚动超一屏出现，玻璃圆钮；滚动感知走 useScroll（不直接监听 scroll 事件） */
function BackToTop() {
  const { scrollY } = useScroll()
  const [show, setShow] = useState(false)
  const reduce = useReducedMotion()
  useMotionValueEvent(scrollY, 'change', (v) => setShow(v > 600))
  return (
    <AnimatePresence>
      {show && (
        <motion.button initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          onClick={() => window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })}
          title="回到顶部" aria-label="回到顶部"
          className="glass liquid fixed bottom-24 right-4 z-40 grid size-11 place-items-center rounded-full text-primary lg:bottom-6 lg:right-6">
          <ArrowUp size={18} weight="bold" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}

/* ---------- 第 1 步 · 注册（英雄区 + 演示账号登录） ---------- */

function Welcome({ onRegistered, onError, onOpenEval }: {
  onRegistered: (id: string, consented?: boolean) => void
  onError: (m: string) => void
  onOpenEval?: () => void
}) {
  const [account, setAccount] = useState('yaozhi_student01')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)

  function enter() {
    setBusy(true)
    api.demoSession(account, invite)
      .then((r) => onRegistered(r.user_id, r.consented))
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
        {onOpenEval && (
          <div className="mt-5 pt-4 border-t border-line/60 flex items-center justify-between">
            <span className="text-xs text-ink-3">评委/专家快速核验：</span>
            <button
              onClick={onOpenEval}
              type="button"
              className="btn flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/60 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary-soft"
            >
              <Sparkle size={13} weight="fill" />
              查看算法评测门禁报告
            </button>
          </div>
        )}
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

function GoalPicker({ onNext, goal, onBack }: { onNext: (g: string) => void; goal: string; onBack: () => void }) {
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
          保存目标，开启学习地图<ArrowRight size={15} weight="bold" />
        </button>
        <button onClick={onBack} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:bg-paper">上一步</button>
      </div>
    </motion.div>
  )
}

/* ---------- 学习地图 · 知识图谱（2026-09-09：目标后、摸底前 先学→随堂摸底） ---------- */

type StudyNode = {
  domain_id: string; code: string; is_seed: boolean; title: string
  book_chapter_no: number | null
  source: 'seed' | 'syllabus' | 'none'
  q_published: number; objective: string
  studied: null | { passed: boolean; score: number; total: number }
  mastery: null | { state: string }
}
type StudyMapData = {
  groups: { key: string; name: string; nodes: StudyNode[] }[]
  recommended: string[]
  total_domains: number
  note: string
}

/* 概览：课程知识图谱 = 全景交互星轨图谱 + 各药理系统分组清单 */
function CourseGraph({ data, goal, onOpen, onSkip, onProceed }: {
  data: StudyMapData; goal: string
  onOpen: (n: StudyNode) => void; onSkip: () => void; onProceed: () => void
}) {
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph')
  const [selectedChapter, setSelectedChapter] = useState<StudyNode | null>(null)

  const doneCount = data.groups.reduce((acc, g) => acc + g.nodes.filter((n) => n.studied?.passed).length, 0)

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
    return (
      <button key={n.domain_id} onClick={() => onOpen(n)}
        className={`group flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[12px] transition
          ${done ? 'border-ok/40 bg-[var(--color-ok-soft)]' : seed ? 'border-gold/50 bg-gold-soft/60' : rec ? 'border-primary/40 bg-primary-soft/60' : 'border-line-2 bg-white hover:border-ink-3/40'}`}>
        <span className={`size-2 flex-none rounded-full ${done ? 'bg-ok' : seed ? 'bg-gold' : rec ? 'bg-primary' : 'bg-line'}`} />
        <span className="leading-tight text-ink">{n.title}</span>
        {done && <CheckCircle size={12} weight="fill" className="ml-auto flex-none text-ok" />}
        {!done && seed && <span className="ml-auto flex-none rounded-full bg-gold px-1.5 text-[9px] font-semibold text-white">示范深挖</span>}
        {!done && !seed && rec && <span className="ml-auto flex-none text-[9px] font-semibold text-primary">建议</span>}
      </button>
    )
  }

  return (
    <motion.div key="study-overview" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold">目标驱动 · 学习地图</p>
          <h2 className="display mt-1 text-[26px]">课程知识图谱</h2>
          <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-ink-2">
            {goal}的下一站：按药理系统，把《药理学》拆成全景拓扑星轨。先在全景中了解章节脉络，点击章节可直接进入该章自学、查看知识图谱与完成随堂摸底。
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-white px-4 py-3 text-center">
          <p className="display text-2xl text-primary">{doneCount}<span className="text-sm text-ink-3">/{data.total_domains}</span></p>
          <p className="text-[11px] text-ink-3">已随堂达标</p>
        </div>
      </div>

      {/* 视图切换与图例 */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-center gap-1 rounded-xl bg-paper-2 p-1">
          <button onClick={() => setViewMode('graph')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'graph' ? 'bg-white text-primary shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
            <Sparkle size={14} weight={viewMode === 'graph' ? 'fill' : 'regular'} />
            全景拓扑星轨
          </button>
          <button onClick={() => setViewMode('list')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'text-ink-3 hover:text-ink'}`}>
            <SquaresFour size={14} weight={viewMode === 'list' ? 'fill' : 'regular'} />
            系统章节清单 ({data.groups.length}个药理系统)
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-[#1d4ed8]" />药理系统</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-gold" />顾问深图谱（示范）</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-ok" />已达标</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" />大纲章节</span>
        </div>
      </div>

      {/* 视图区 */}
      {viewMode === 'graph' ? (
        <div className="mt-4 space-y-4">
          <KnowledgeGraphView
            title="药理学全景课程拓扑星轨"
            nodes={macroNodes}
            edges={macroEdges}
            tabDefs={macroTabs}
            height={440}
            onNodeClick={handleNodeClick}
          />

          {/* 选中章节卡片 */}
          {selectedChapter ? (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary-soft/60 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-primary text-white shadow">
                  <Pill size={20} weight="fill" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-ink">{selectedChapter.title}</p>
                    {selectedChapter.is_seed ? (
                      <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold text-white">专家示范深挖</span>
                    ) : (
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] text-ink-3">大纲标准章节</span>
                    )}
                    {selectedChapter.studied?.passed && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-ok">
                        <CheckCircle size={13} weight="fill" />随堂已达标 ({selectedChapter.studied.score}/{selectedChapter.studied.total})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 mt-0.5">支持查看本章知识关系图谱、易混药对辨析及随堂摸底</p>
                </div>
              </div>
              <button onClick={() => onOpen(selectedChapter)} className="btn btn-primary py-2 px-4 text-xs font-semibold shadow">
                进入本章自学与随堂测<ArrowRight size={14} weight="bold" />
              </button>
            </motion.div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-paper/50 px-4 py-2 text-xs text-ink-3">
              <Sparkle size={14} className="text-primary flex-none" />
              <span>提示：在上方全景图谱中点击任意「章节」节点，或切换系统标签聚焦相应分类，即可直接进入该章自学。</span>
            </div>
          )}

          {/* 示范与推荐快捷通道 */}
          <div className="rounded-2xl border border-line bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="capsule" />
                <p className="text-xs font-semibold text-ink">示范深挖与建议先学（快捷通道）</p>
              </div>
              <span className="text-[11px] text-ink-3">点击任意卡片直接开启自学</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.groups.flatMap((g) => g.nodes).filter((n) => n.is_seed || data.recommended.includes(n.domain_id)).map((n) => node(n))}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {data.groups.map((g, gi) => {
            const gDone = g.nodes.filter((n) => n.studied?.passed).length
            return (
              <motion.div key={g.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: gi * 0.05 }} className="spot-card p-5">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="capsule" />
                  <p className="text-sm font-semibold">{g.name}</p>
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] text-ink-3">
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

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button onClick={onProceed} className="btn btn-primary">
          我准备好了，开始正式摸底<ArrowRight size={15} weight="bold" />
        </button>
        <button onClick={onSkip} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:border-primary hover:text-primary">
          跳过学习，直接摸底
        </button>
      </div>
      <p className="mt-4 text-xs text-ink-3">{data.note}</p>
    </motion.div>
  )
}

/* 单章学习内容 + 随堂摸底：真实呈现该章「知识点图谱」，不伪造未整理内容 */
function ChapterStudy({ userId, node, goal, onError, onDone, onAskAi }: {
  userId: string; node: StudyNode; goal: string; onError: (m: string) => void
  onDone: (passed: boolean, score: number, total: number) => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  type Detail =
    | { source: 'seed'; graph: { chain: { level: number; title: string; summary: string }[]; relations: { source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note?: string; evidence?: KgEvidence; review_status?: string }[]; confusion: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[] } }
    | { source: 'syllabus'; chapter: { no: number; title: string; objectives: Record<string, string[]> | Record<string, string>; key_points: string[]; difficulties: string[]; sections: { title: string; points: string[] }[] }; relations?: KgEdgeT[]; confusion?: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[] }
    | { source: 'none'; chapter: null }
  const [detail, setDetail] = useState<Detail | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<{ id: string; code: string; stem: string; options: { key: string; text: string }[] }[] | null>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [res, setRes] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [node.domain_id])
  useEffect(() => {
    setDetail(null); setQuiz(null); setRes(null); setPicks({})
    api.studyDetail(userId, node.domain_id).then(setDetail).catch((e) => onError(String(e)))
    api.studyQuiz(userId, node.domain_id).then((r) => setQuiz(r.questions ?? [])).catch((e) => onError(String(e)))
  }, [userId, node.domain_id])

  async function submit() {
    if (!quiz || busy) return
    setBusy(true)
    try {
      const r = await api.submitStudyQuiz(userId, node.domain_id, picks)
      setRes({ passed: r.passed, correct: r.correct, total: r.total })
      if (r.passed) onDone(true, r.correct / r.total, r.total)
      else onDone(false, 0, r.total)
    } catch (e) { onError(String(e)) } finally { setBusy(false) }
  }

  const answered = Object.keys(picks).length
  return (
    <motion.div key={`cs-${node.domain_id}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">第 {node.book_chapter_no ?? '—'} 章</span>
        <h2 className="display text-[22px]">{node.title}</h2>
        {node.studied?.passed && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-ok-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-ok"><CheckCircle size={12} weight="fill" />已达标</span>}
      </div>
      <p className="mt-1 text-sm text-ink-2">{goal} · 本章知识点图谱 → 学完再做随堂摸底</p>

      {/* 学习内容 */}
      <div className="mt-5 space-y-4">
        {!detail && <div className="skeleton h-48" />}

        {detail?.source === 'seed' && (
          <div className="spot-card p-6">
            <p className="mb-4 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />顾问深图谱 · 药理推理链（六环）</p>
            <div className="space-y-0">
              {detail.graph.chain.map((c, i) => (
                <div key={c.level} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="grid size-7 flex-none place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">L{c.level}</span>
                    {i < detail.graph.chain.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </div>
                  <div className="pb-4">
                    <p className="text-[13px] font-semibold">{c.title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-2">{c.summary}</p>
                  </div>
                </div>
              ))}
            </div>
            {detail.graph.relations.length > 0 && (
              <>
                <p className="mb-3 mt-5 text-sm font-semibold">药效关系（源—边→目标，含教材出处）</p>
                <KnowledgeGraphView edges={detail.graph.relations} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {detail.graph.relations.map((r, i) => (
                    <div key={i} className="rounded-lg border border-line-2 bg-white px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <NodeChip type={r.source.type} name={r.source.name} />
                        <span className="rounded-full bg-paper-2 px-1.5 py-0.5 font-semibold text-ink-3">{r.edge}</span>
                        <NodeChip type={r.target.type} name={r.target.name} />
                      </div>
                      <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {detail?.source === 'syllabus' && detail.chapter && (
          <div className="space-y-4">
            {/* 掌握目标 */}
            <div className="spot-card p-6">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />本章学习目标 · 按掌握深度分层</p>
              {(() => {
                const o = detail.chapter.objectives || {}
                const labels: [string, string, string][] = [
                  ['master', '掌握', 'bg-primary-soft text-primary'],
                  ['familiar', '熟悉', 'bg-gold-soft text-gold'],
                  ['understand', '了解', 'bg-paper-2 text-ink-3'],
                ]
                return (
                  <div className="space-y-2.5">
                    {labels.map(([k, lab, cl]) => {
                      const items = o[k]
                      if (!items || (Array.isArray(items) ? items.length === 0 : !String(items).trim())) return null
                      const arr = Array.isArray(items) ? items : String(items).split(/[；;\n]/).map((s) => s.trim()).filter(Boolean)
                      return (
                        <div key={k} className="flex gap-3">
                          <span className={`mt-0.5 h-fit flex-none rounded-md px-2 py-0.5 text-[11px] font-semibold ${cl}`}>{lab}</span>
                          <ul className="space-y-1 text-[13px] text-ink-2">
                            {arr.map((t, i) => <li key={i} className="leading-relaxed">{t}</li>)}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>

            {/* 知识点树：章节 → 节 → 知识点 */}
            <div className="spot-card p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line-2 pb-3">
                <p className="flex items-center gap-2 text-sm font-semibold"><span className="capsule" />知识点精讲图谱 · {detail.chapter.title}</p>
                <span className="flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary">
                  <Sparkle size={12} weight="fill" />
                  点击任意标签展开人卫 9 版教材精讲与机制卡片
                </span>
              </div>
              {detail.chapter.sections.length === 0 ? (
                <p className="text-[13px] text-ink-3">本章大纲暂未录入分节知识点（待内容化）。可先用下方题库随堂摸底，检验掌握度。</p>
              ) : (
                <div className="space-y-4">
                  {detail.chapter.sections.map((s, si) => (
                    <div key={si} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <span className="mt-1 size-2.5 flex-none rounded-full bg-primary" />
                        {si < detail.chapter.sections.length - 1 && <span className="w-px flex-1 bg-line" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13.5px] font-semibold text-ink">{s.title}</p>
                        {(s.points ?? []).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(s.points ?? []).map((p, pi) => (
                              <button
                                key={pi}
                                type="button"
                                onClick={() => setSelectedPoint(p)}
                                className="group inline-flex items-center gap-1.5 rounded-xl border border-line-2 bg-white px-3 py-1.5 text-xs font-medium text-ink transition-all hover:border-primary/60 hover:bg-primary-soft/40 hover:text-primary active:scale-[0.98] shadow-2xs"
                                title="点击查看该知识点的核心机制、代表药、临床用途与人卫9版教材原文"
                              >
                                <BookOpenText size={13} className="text-primary/70 group-hover:text-primary" />
                                <span>{p}</span>
                                <span className="rounded bg-paper-2 px-1 text-[10px] text-ink-3 group-hover:bg-primary-soft group-hover:text-primary">
                                  精讲 ↗
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {(detail.chapter.key_points.length > 0 || detail.chapter.difficulties.length > 0) && (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-dashed border-line pt-4">
                  {detail.chapter.key_points.map((k, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedPoint(k)}
                      className="rounded-full bg-gold-soft px-3 py-1 text-[11px] font-semibold text-gold transition hover:opacity-80 active:scale-[0.98]"
                      title="点击查看重点精讲"
                    >
                      重点 · {k} ↗
                    </button>
                  ))}
                  {detail.chapter.difficulties.map((d2, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedPoint(d2)}
                      className="rounded-full bg-cat-red-soft px-3 py-1 text-[11px] font-semibold text-cat-red transition hover:opacity-80 active:scale-[0.98]"
                      title="点击查看难点精讲"
                    >
                      难点 · {d2} ↗
                    </button>
                  ))}
                </div>
              )}
              {(detail.relations ?? []).length > 0 && (
                <div className="mt-5 border-t border-dashed border-line pt-4">
                  <p className="mb-2 text-[13px] font-semibold">本章知识图谱 · 章节—节—知识点—药物关系</p>
                  <KnowledgeGraphView edges={detail.relations ?? []} title="本章图谱 · 全部待顾问审校" />
                </div>
              )}
              {(detail.confusion ?? []).length > 0 && (
                <div className="mt-4 space-y-2">
                  {(detail.confusion ?? []).slice(0, 3).map((p, i) => (
                    <div key={i} className="rounded-lg bg-paper px-3 py-2 text-[12px]">
                      <span className="font-semibold text-primary">{p.drug_a}</span>
                      <span className="mx-1.5 text-ink-3">vs</span>
                      <span className="font-semibold text-gold">{p.drug_b}</span>
                      <span className="ml-2 text-ink-2">{p.distinction}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-ink-3">来源：校内《药理学》教学大纲（章节→节→知识点）+ 题库选项共现（药物归属/易混候选）。机制级关系由药理顾问逐章审校后补全，当前图谱为待审校 v1。</p>
            </div>
          </div>
        )}

        {detail?.source === 'none' && (
          <div className="spot-card p-6 text-sm text-ink-2">
            本章暂无整理的学习材料（顾问图谱待补）。可以直接做随堂摸底，用本章题目检验你的掌握情况。
          </div>
        )}
      </div>

      {/* 随堂摸底 */}
      <div className="mt-5 spot-card p-6">
        <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><span className="capsule" />随堂摸底 · 检验学习程度</p>
        <p className="mb-4 text-xs text-ink-3">作答本章 3 道题，答对 ≥60% 即本章达标；未达可回看上方知识点后重试。</p>

        {res ? (
          <div className={`rounded-2xl border p-5 text-sm ${res.passed ? 'border-ok/40 bg-[var(--color-ok-soft)]' : 'border-cat-red/40 bg-[var(--color-cat-red-soft)]'}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              {res.passed
                ? <><CheckCircle size={16} weight="fill" className="flex-none text-ok" />本章达标（{res.correct}/{res.total}）</>
                : <><XCircle size={16} weight="fill" className="flex-none text-cat-red" />未通过（{res.correct}/{res.total}）</>}
            </p>
            <p className="mt-1 text-ink-2">{res.passed ? '很棒，本章知识点已掌握到可进入练习的程度。' : '还有薄弱点：回到上方知识点再看一遍，再试一次。'}</p>
          </div>
        ) : quiz && quiz.length > 0 ? (
          <div className="space-y-4">
            {quiz.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-5">
                <p className="mb-3 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setPicks({ ...picks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-2.5 text-left text-sm
                        ${picks[q.id] === o.key ? 'border-primary bg-primary-soft/50' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      <span className={`mr-2 inline-grid size-5 items-center justify-center rounded-full border text-[11px] font-bold
                        ${picks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                      {o.text}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={submit} disabled={answered < quiz.length || busy} className="btn btn-primary">
              {busy ? '判分中…' : '提交摸底（已答 ' + answered + '/' + quiz.length + '）'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-2">本章暂无自测题，可直接进入正式摸底。</p>
        )}
      </div>

      {selectedPoint && (
        <KnowledgeDetailModal
          userId={userId}
          chapterNo={node.book_chapter_no || (detail && 'chapter' in detail && detail.chapter ? detail.chapter.no : 1) || 1}
          pointName={selectedPoint}
          domainId={node.domain_id}
          onClose={() => setSelectedPoint(null)}
          onAskAi={onAskAi}
        />
      )}
    </motion.div>
  )
}

/* 学习地图编排：目标后进入；默认停在总览，点章节进学习，学完回总览再决定进摸底 */
function StudyMapOnboard({ userId, goal, onError, onBack, onProceed, onSkip, onAskAi }: {
  userId: string; goal: string; onError: (m: string) => void
  onBack: () => void; onProceed: () => void; onSkip: () => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  const [map, setMap] = useState<StudyMapData | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [study, setStudy] = useState<'list' | 'chapter'>('list')

  const load = useCallback(() => {
    api.studyMap(userId).then(setMap).catch((e) => onError(String(e)))
  }, [userId])
  useEffect(() => { load(); window.scrollTo(0, 0) }, [load])

  const open = map ? map.groups.flatMap((g) => g.nodes).find((n) => n.domain_id === openId) ?? null : null

  if (!map) {
    return (
      <div className="pt-4">
        <div className="skeleton h-40" />
        <div className="mt-4 skeleton h-56" />
      </div>
    )
  }

  if (open && study === 'chapter') {
    return (
      <motion.div key="study-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => { setStudy('list'); setOpenId(null) }}
            className="btn items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
            <ArrowRight size={12} className="rotate-180" />返回学习地图
          </button>
          <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink-2">
            <ArrowRight size={12} className="rotate-180" />上一步（改目标）
          </button>
        </div>
        <ChapterStudy userId={userId} node={open} goal={goal} onError={onError}
          onDone={() => load()} onAskAi={onAskAi} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={onProceed} className="btn btn-primary">学得差不多，进入正式摸底<ArrowRight size={15} weight="bold" /></button>
          <button onClick={() => { setStudy('list'); setOpenId(null) }} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:border-primary hover:text-primary">继续学习下一节</button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div key="study-overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
          <ArrowRight size={12} className="rotate-180" />上一步（改目标）
        </button>
      </div>
      <CourseGraph data={map} goal={goal}
        onOpen={(n) => { setOpenId(n.domain_id); setStudy('chapter') }}
        onSkip={onSkip} onProceed={onProceed} />
    </motion.div>
  )
}

/* ---------- 第 4 步 · 摸底测试 ---------- */

function Assessment({ userId, onDone, onError, onBack }: {
  userId: string; onDone: (r: PortraitResult) => void; onError: (m: string) => void; onBack: () => void
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
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 4 · 摸底测试</p>
        <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-xs text-ink-3 transition hover:bg-paper-2 hover:text-ink-2">
          <ArrowRight size={12} className="rotate-180" />返回上一步
        </button>
      </div>
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
                <span className="font-semibold">{q.code}</span>
                {q.chapter_name && (
                  <span className="rounded-full border border-line-2 px-2.5 py-0.5 text-[11px]">{q.chapter_name}</span>
                )}
              </div>
              <p className="mb-4 text-[15px] font-medium leading-relaxed">{q.stem}</p>
              <div className="space-y-2.5">
                {q.options.map((o) => (
                  <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setAnswers({ ...answers, [q.id]: o.key })}
                    className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                      ${answers[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                    <span className="relative z-10 flex items-center gap-3">
                      <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                        ${answers[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>{o.key}</span>
                      <span className={answers[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
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
          <div className="glass liquid relative flex items-center gap-3 rounded-full py-2 pl-5 pr-2 shadow-lg">
            <span className="text-xs font-medium text-ink-2">
              已答 <span className={answered === questions.length ? 'font-bold text-ok' : 'font-bold text-ink'}>{answered}/{questions.length}</span>
              {answered < questions.length && (
                <span className="ml-1 text-[11px] text-ink-3">（还剩 {questions.length - answered} 题）</span>
              )}
            </span>
            <button
              onClick={submit}
              disabled={submitting || answered < questions.length}
              className="btn btn-primary !px-7 !py-2.5 shadow-[var(--shadow-lg)] disabled:opacity-50"
            >
              {submitting ? '分析并生成画像中…' : '交卷并生成画像'}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ---------- 第 5 步 · 摸底画像（诊断结论式：一句话结论 + 计数 + 错题清单，替代难读矩阵） ---------- */

export type PortraitResult = {
  total: number
  weak: { question_code: string; stem: string; domain_id?: string; domain?: string; category: string }[]
  domains: { domain: string; correct: number; total: number; rate: number }[]
}

// 真错因（排除「待诊断」占位）；与错题本 / 档案页共用同一定义与配色
const CAT_KEYS = ['知识遗忘', '概念混淆', '机制理解不足', '审题与应用失误']

function Portrait({ result, onEnter, onBack }: { result: PortraitResult; onEnter: () => void; onBack?: () => void }) {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const total = result.total || result.weak.length
  const wrong = result.weak.length
  const correct = Math.max(total - wrong, 0)
  const judged = result.weak.filter((w) => w.category && w.category !== '待诊断')   // 已归因
  const pending = result.weak.filter((w) => !w.category || w.category === '待诊断')  // 未归因

  // 错因构成：按四类真错因聚合（只统计已归因的错题），数字少也照样直观
  const catN: Record<string, number> = {}
  judged.forEach((w) => { catN[w.category] = (catN[w.category] || 0) + 1 })
  const judgedByCat = CAT_KEYS.map((c) => ({ cat: c, n: catN[c] || 0 })).filter((x) => x.n > 0)

  // 主结论（针对数据本身，绝不臆造）——三种态：全对 / 有真错因 / 只标了待诊断
  let tone: 'ok' | 'warn' | 'focus'
  let title: string
  let desc: string
  if (wrong === 0) {
    tone = 'ok'
    title = '摸底全对 · 基础很扎实'
    desc = `这轮 ${total} 道题全部答对。摸底题量还少、定位有限，建议进「今日待办」多做几道，把还没暴露的薄弱点也找出来。`
  } else if (judgedByCat.length > 0) {
    tone = 'focus'
    const top = judgedByCat[0]
    const topDomains = [...new Set(judged.map((w) => w.domain ?? '').filter(Boolean))]
    const allSame = pending.length === 0  // 错题是否都已归到 top 这类（无待诊断混入）
    title = `你最需要补的是「${top.cat}」`
      + (allSame && top.n > 1 ? `——这 ${top.n} 道错题都是同一类` : '')
    const domainHint = topDomains.length
      ? `它们集中在「${topDomains.slice(0, 2).join('」「')}」这几块。`
      : '这类错题背后其实是同一个根因。'
    const actionHint = `下一步路径会专门针对「${top.cat}」带你补扎实。`
    const pendingHint = pending.length
      ? `另外 ${pending.length} 道错题还需要做一次诊断归因，才能纳入画像。`
      : ''
    desc = domainHint + actionHint + (pendingHint ? ' ' + pendingHint : '')
  } else {
    tone = 'warn'
    title = '有错题，但还没定位到具体原因'
    desc = `${pending.length} 道题只标出了「答错」。需要回作答流程走一次诊断，才知道属于哪种错因、该从哪补。先进「今日待办」把一道错题做进诊断即可自动归因。`
  }
  const hero = {
    ok: { bg: 'linear-gradient(150deg,#E1F1E8,#F3FAF5)', fg: 'var(--color-ok)', icon: <CheckCircle size={22} weight="fill" /> },
    warn: { bg: 'linear-gradient(150deg,#F3E8CD,#FBF6EA)', fg: 'var(--color-gold)', icon: <Warning size={22} weight="fill" /> },
    focus: { bg: 'linear-gradient(150deg,#DFEDE6,#EFF6F1)', fg: 'var(--color-primary)', icon: <MagnifyingGlass size={22} weight="fill" /> },
  }[tone]

  const catTotal = judged.length
  const pendingNote = pending.length
  const [showAllWrong, setShowAllWrong] = useState(false)

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="pt-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 5 · 摸底画像</p>
        {onBack && (
          <button onClick={onBack} className="inline-flex flex-none items-center gap-1 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink-2 transition hover:border-primary hover:text-primary">
            <ArrowRight size={12} className="rotate-180" />返回学习地图
          </button>
        )}
      </div>
      <h2 className="display mt-2 text-[26px]">先看清水平，再知道下一步练什么</h2>
      <p className="mt-2 text-sm text-ink-2">下面会用「一句话」直接告诉你该补哪——不用再看报表自己猜。</p>

      {/* ① 一句话结论（第一屏就抓住重点） */}
      <div className="mt-5 overflow-hidden rounded-[22px] p-6" style={{ background: hero.bg }}>
        <div className="flex items-start gap-4">
          <div className="grid size-11 flex-none place-items-center rounded-2xl text-white" style={{ background: hero.fg }}>{hero.icon}</div>
          <div className="min-w-0">
            <p className="display text-[19px] leading-snug" style={{ color: hero.fg }}>{title}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{desc}</p>
          </div>
        </div>
      </div>

      {/* ② 四个一眼能懂的计数卡 */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">摸底题数</p>
          <p className="display mt-1 text-[22px] leading-none text-ink">{total}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">覆盖 {result.domains.length} 个章节</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">答对</p>
          <p className="display mt-1 text-[22px] leading-none text-ok">{correct}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">正确率 {total ? Math.round((correct / total) * 100) : 100}%</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">答错</p>
          <p className="display mt-1 text-[22px] leading-none" style={{ color: 'var(--color-cat-red)' }}>{wrong}</p>
          <p className="mt-1.5 text-[11px] text-ink-3">{judged.length} 道已定位到错因</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-ink-3">主要错因</p>
          <p className="mt-1 text-[18px] leading-none" style={{ color: hero.fg }}>
            {judgedByCat.length ? judgedByCat[0].cat : '—'}
          </p>
          <p className="mt-1.5 text-[11px] text-ink-3">
            {judgedByCat.length ? `${judgedByCat[0].n} 道` : pendingNote ? '待诊断后再显示' : '本轮无错题'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ③ 错因构成：色条 + 占比，比「域×错因」矩阵更贴近学生理解 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">错题是哪种原因</h3>
          <p className="mb-3 text-xs text-ink-3">把答错的题按错因归堆，找出共性</p>
          {judgedByCat.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">
              {wrong === 0 ? '没有错题，不用诊断。' : `${pendingNote} 道错题还没归因——去「今日待办」走一次诊断就能看到。`}
            </div>
          ) : (
            <div className="space-y-3">
              {judgedByCat.map((x) => {
                const share = x.n / Math.max(catTotal, 1)
                const s = CAT_STYLE[x.cat] ?? { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' }
                return (
                  <div key={x.cat}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{x.cat}</span>
                      <span className="text-ink-3">{x.n} 题 · {Math.round(share * 100)}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-line-2">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(share * 100)}%`, background: s.fg }} />
                    </div>
                  </div>
                )
              })}
              <p className="pt-1 text-[11px] text-ink-3">颜色=错因类型 · 长度=这类错题占的比例，下一轮练习会按它优先安排</p>
            </div>
          )}
        </div>

        {/* ④ 各章节作答：横向短条（比矩阵更直接）+ 是否进路径 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">各章节摸底情况</h3>
          <p className="mb-3 text-xs text-ink-3">绿色=答对 / 红点=低于 70% 会进你的今日待办</p>
          {result.domains.length === 0 && <p className="py-8 text-center text-sm text-ink-3">本轮没有章节作答记录。</p>}
          {result.domains.length > 0 && (
            <div className="space-y-3">
              {result.domains.map((d) => {
                const low = d.rate < 0.7
                return (
                  <div key={d.domain}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        {low && <span className="size-1.5 rounded-full" style={{ background: 'var(--color-cat-red)' }} />}
                        {d.domain}
                      </span>
                      <span className={low ? 'font-semibold text-cat-red' : 'text-ok'}>
                        {d.correct}/{d.total} 对 · {Math.round(d.rate * 100)}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line-2">
                      <div className="h-full rounded-full" style={{
                        width: `${Math.round(d.rate * 100)}%`,
                        background: low ? 'var(--color-cat-red)' : 'var(--color-ok)',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ⑤ 这轮答错的题（逐题清单，最具体、永远可读） */}
      <div className="card mt-4 p-6">
        <h3 className="mb-1 text-sm font-semibold">这轮答错的题</h3>
        <p className="mb-3 text-xs text-ink-3">逐题标出错在哪、属于什么原因，最下面那题可能正好就是你现在该补的</p>
        {wrong === 0 && <p className="py-8 text-center text-sm text-ink-3">本轮没有错题——可以去题库挑几道更难的做做看。</p>}
        {wrong > 0 && (
          <div className="space-y-2.5">
            {(showAllWrong ? result.weak : result.weak.slice(0, 4)).map((w, i) => {
              const isPending = !w.category || w.category === '待诊断'
              return (
                <div key={`${w.question_code}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line px-3.5 py-3">
                  <span className="text-[11px] text-ink-3">{w.question_code}</span>
                  <span className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-ink">{w.stem}</span>
                  {isPending
                    ? <span className="rounded-full bg-line-2 px-2.5 py-1 text-[11px] text-ink-3">待诊断</span>
                    : <CategoryTag category={w.category} />}
                  {w.domain && <span className="text-[11px] text-ink-3">→ 归入「{w.domain}」</span>}
                </div>
              )
            })}
          </div>
        )}
        {wrong > 4 && (
          <button onClick={() => setShowAllWrong(!showAllWrong)}
            className="btn mt-3 items-center gap-1 rounded-full border border-line px-4 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
            {showAllWrong ? '收起' : `展开全部 ${wrong} 道`}
            <CaretDown size={13} weight="bold" className={`transition-transform duration-200 ${showAllWrong ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="mt-7 flex justify-center pb-2">
        <button onClick={onEnter} className="btn btn-primary !px-8 !py-3.5">
          画像已生成，进入今日待办<ArrowRight size={15} weight="bold" />
        </button>
      </div>
      <p className="pb-4 text-center text-xs text-ink-3">画像会随每次练习自动更新 · 学习档案里能看到完整成长轨迹</p>
    </motion.div>
  )
}

/* ---------- 艾宾浩斯抗遗忘长时记忆复测胶囊（场景一） ---------- */
function RetestCapsuleCard({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [capsule, setCapsule] = useState<RetestCapsuleData | null>(null)
  const [loading, setLoading] = useState(true)
  const [inQuiz, setInQuiz] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    passed: boolean; score: number; new_stage: number; next_due_days: number; next_stage_desc?: string; memory_boost: number; message: string
  } | null>(null)

  const loadCapsule = useCallback(() => {
    setLoading(true)
    setError(null)
    api.retestCapsule(userId)
      .then((d: RetestCapsuleData) => {
        setCapsule(d)
        setInQuiz(false)
        setAnswers({})
        setResult(null)
      })
      .catch(() => setCapsule(null))
      .finally(() => setLoading(false))
  }, [userId])

  useEffect(() => { loadCapsule() }, [loadCapsule])

  if (loading || !capsule || !capsule.has_capsule || !capsule.questions?.length) return null

  const handlePick = (qid: string, key: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: key }))
  }

  const handleSubmit = async () => {
    if (!capsule.schedule_id) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.submitRetestCapsule(userId, {
        schedule_id: capsule.schedule_id,
        answers,
      })
      setResult(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const allAnswered = capsule.questions.every((q) => answers[q.id])

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-xs dark:border-amber-400/25 dark:from-amber-950/20"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
            <Lightning size={14} weight="fill" />
          </span>
          <span className="text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400">
            今日遗忘预警 · 艾宾浩斯抗遗忘加固
          </span>
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            {capsule.stage_name}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Hourglass size={14} className="text-amber-500" />
          <span>记忆存留度</span>
          <span className="font-bold text-amber-600 dark:text-amber-400">
            {capsule.retention_pct}%
          </span>
        </div>
      </div>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      {!inQuiz && !result && (
        <div className="mt-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink">
              检测到您在{' '}
              <span className="font-bold text-primary">
                {capsule.domain_name}（{capsule.concept_name}）
              </span>{' '}
              处于记忆衰退临界区！
            </p>
            <p className="mt-1 text-xs text-ink-3">
              只需 2 分钟完成 {capsule.questions.length} 道靶向辨析题，即可阻断遗忘曲线，建立长时专业记忆。
            </p>
          </div>
          <button
            onClick={() => setInQuiz(true)}
            className="btn btn-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold shadow-xs"
          >
            <Lightning size={14} weight="fill" />
            开始闪电复测（{capsule.questions.length}题）
          </button>
        </div>
      )}

      {inQuiz && !result && (
        <div className="mt-4 space-y-5">
          {capsule.questions.map((q, idx) => (
            <div key={q.id} className="rounded-xl border border-line bg-card/60 p-4">
              <p className="text-xs font-semibold text-primary">
                第 {idx + 1} 题 / 共 {capsule.questions!.length} 题
              </p>
              <p className="mt-1.5 text-sm font-medium leading-relaxed">{q.stem}</p>
              <div className="mt-3 space-y-2">
                {q.options?.map((opt) => {
                  const isPicked = answers[q.id] === opt.key
                  return (
                    <button
                      key={opt.key}
                      onClick={() => handlePick(q.id, opt.key)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-xs transition ${
                        isPicked
                          ? 'border-primary bg-primary/10 font-semibold text-primary shadow-xs'
                          : 'border-line hover:border-line-hover hover:bg-card-hover'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          isPicked ? 'bg-primary text-white' : 'border border-line text-ink-3'
                        }`}
                      >
                        {opt.key}
                      </span>
                      <span className="leading-snug">{opt.text}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              onClick={() => setInQuiz(false)}
              className="btn rounded-full border border-line px-4 py-1.5 text-xs text-ink-3 hover:text-ink"
            >
              稍后再测
            </button>
            <button
              onClick={handleSubmit}
              disabled={!allAnswered || submitting}
              className="btn btn-primary rounded-full px-5 py-2 text-xs font-semibold shadow-xs disabled:opacity-50"
            >
              {submitting ? '评估中…' : '提交复测结果'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mt-3.5 space-y-3">
          <div
            className={`flex items-start gap-3 rounded-xl p-4 ${
              result.passed
                ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
            }`}
          >
            <div className="mt-0.5">
              {result.passed ? (
                <CheckCircle size={20} weight="fill" className="text-emerald-500" />
              ) : (
                <Warning size={20} weight="fill" className="text-amber-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">
                {result.passed ? '🎉 长时专业记忆已成功激活！' : '⚠️ 记忆仍需巩固'}
              </p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{result.message}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span>正确率: {Math.round(result.score * 100)}%</span>
                <span>•</span>
                <span>当前进度: {result.next_stage_desc}</span>
                <span>•</span>
                <span>记忆强化度: +{result.memory_boost}%</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => {
                setResult(null)
                loadCapsule()
                onDone()
              }}
              className="btn btn-primary rounded-full px-5 py-1.5 text-xs font-semibold"
            >
              完成并返回待办
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

/* ---------- 学习路径（今日待办） ---------- */

type PlanTask = {
  type: 'material' | 'practice'
  domain_id: string
  domain: string
  category: string | null
  state: string
  title: string
  guide?: string
  goal?: string
  bkt_probability?: number
  urgency_score?: number
  freshness_status?: string
  decay_level?: string
  days_since_update?: number
}
type DoneTask = { domain_id: string; domain: string; category: string | null; state: string; title: string }
type DailyRec = {
  domain_id: string
  domain_name: string
  category: string | null
  bkt_probability: number
  urgency_score: number
  urgency_level: string
  suggested_action: string
  reason: string
}
type MemoryDecayAlert = {
  domain_id: string
  domain_name: string
  category: string | null
  days_passed: number
  decay_pct: number
  freshness_status: string
  tip: string
}

function LearningPathHome({ userId, onPick, onMaterial }: {
  userId: string; onPick: (q: Question) => void; onMaterial: (domainId: string) => void
}) {
  const [plan, setPlan] = useState<{
    tasks: PlanTask[]
    done_tasks?: DoneTask[]
    daily_recommendation?: DailyRec[]
    memory_decay_alerts?: MemoryDecayAlert[]
    note: string
  } | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const load = useCallback(() => {
    setRefreshing(true)
    return Promise.all([
      api.learningPlan(userId).then(setPlan).catch((e) => setError(String(e))),
      api.questions().then(setQuestions).catch(() => {}),
    ]).finally(() => setRefreshing(false))
  }, [userId])

  useEffect(() => { load() }, [load])

  if (error) return <ErrorPanel message={error} />
  if (!plan) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-16" />)}</div>
  }

  const hasTasks = plan.tasks.length > 0
  const doneTasks = plan.done_tasks ?? []
  // 按 域×错因 分组（一组 = 一学一练配对）；分组头可折叠，长待办不再一屏到底
  const groups: { key: string; domain_id: string; domain: string; items: PlanTask[] }[] = []
  for (const t of plan.tasks) {
    const key = `${t.domain_id}::${t.category ?? ''}`
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, domain_id: t.domain_id, domain: t.domain, items: [] }; groups.push(g) }
    g.items.push(t)
  }
  const allShut = groups.length > 0 && groups.every((g) => collapsed[g.key])
  return (
    <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">STEP 6 · 学习路径</p>
      <h2 className="display mt-2 text-[26px]">今日待办</h2>
      <div className="mt-4">
        <RetestCapsuleCard userId={userId} onDone={() => load()} />
      </div>

      {/* 动态时间遗忘衰减引擎预警 */}
      {plan.memory_decay_alerts && plan.memory_decay_alerts.length > 0 && (
        <div className="card mt-4 mb-3 border border-amber-500/40 bg-gradient-to-r from-amber-50 via-orange-50/40 to-white p-4 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Hourglass size={16} className="text-amber-600" weight="fill" />
              BKT 动态时间遗忘预警 · 记忆半衰期衰退探测
            </span>
            <span className="rounded-full bg-amber-200/70 px-2.5 py-0.5 text-[10px] font-semibold text-amber-900">
              {plan.memory_decay_alerts.length} 个薄弱考点临界遗忘
            </span>
          </div>
          <div className="space-y-2">
            {plan.memory_decay_alerts.map((al, idx) => (
              <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/95 p-3 border border-amber-200/70 text-xs">
                <div>
                  <span className="font-bold text-ink-1 mr-2">{al.domain_name}</span>
                  {al.category && <span className="text-ink-3 mr-2 font-mono">[{al.category}]</span>}
                  <span className="text-amber-800">{al.tip}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${al.freshness_status === '严重遗忘' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                  {al.freshness_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BKT 认知追踪驱动的今日自适应推荐 */}
      {plan.daily_recommendation && plan.daily_recommendation.length > 0 && (
        <div className="card relative overflow-hidden mt-5 mb-5 border-2 border-primary/20 bg-gradient-to-br from-primary-soft/40 via-white to-gold-soft/30 p-5 !rounded-[22px] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-white text-xs font-bold font-mono">BKT</span>
              <div>
                <h4 className="text-sm font-bold text-ink flex items-center gap-1.5">
                  今日自适应突破推荐 · 贝叶斯认知模型推断
                </h4>
                <p className="text-xs text-ink-3">动态追踪掌握概率 P(L)，优先攻克失误概率最高的脆弱考点</p>
              </div>
            </div>
            <span className="badge-capsule gold">
              <span className="capsule gold" />
              认知推断
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {plan.daily_recommendation.map((rec) => (
              <div key={rec.domain_id} className="rounded-xl border border-line bg-white/95 p-3.5 flex flex-col justify-between hover:border-primary transition shadow-2xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${rec.urgency_level === '高危薄弱' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                      {rec.urgency_level}
                    </span>
                    <span className="text-[11px] font-semibold text-primary font-mono">
                      掌握度 {Math.round(rec.bkt_probability * 100)}%
                    </span>
                  </div>
                  <p className="text-sm font-bold text-ink truncate">{rec.domain_name}</p>
                  {rec.category && <p className="text-xs text-ink-3 mt-0.5">{rec.category}</p>}
                  <p className="text-[11px] text-ink-3 mt-1.5 line-clamp-2 leading-relaxed">{rec.reason}</p>
                </div>
                <button
                  onClick={() => onMaterial(rec.domain_id)}
                  className="mt-3 w-full btn btn-primary !py-1.5 !text-xs flex items-center justify-center gap-1">
                  <Sparkle size={12} weight="fill" /> {rec.suggested_action}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className="text-sm leading-relaxed text-ink-2">{plan.note}</p>
        {hasTasks && (
          <button onClick={() => {
              if (allShut) setCollapsed({})
              else setCollapsed(Object.fromEntries(groups.map((g) => [g.key, true])))
            }}
            className="btn ml-auto items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-3 hover:border-primary hover:text-primary">
            {allShut ? '全部展开' : '全部收起'}
          </button>
        )}
        <button onClick={() => load()} disabled={refreshing}
          className={`btn items-center gap-1 rounded-full border border-line px-3 py-1 text-xs text-ink-3 hover:border-primary hover:text-primary ${hasTasks ? '' : 'ml-auto'}`}>
          <ClockCounterClockwise size={12} weight="bold" />{refreshing ? '刷新中…' : '刷新'}
        </button>
      </div>
      {hasTasks || doneTasks.length > 0 ? (
        <p className="mt-1 text-xs text-ink-3">
          待完成 <span className="font-semibold text-cat-red">{plan.tasks.length}</span> 项 · 已完成{' '}
          <span className="font-semibold text-ok">{doneTasks.length}</span> 项
        </p>
      ) : null}

      {!hasTasks && doneTasks.length === 0 && (
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
          {/* 按域分组：每组=「一域一个薄弱点 → 学 + 练」的一一配对引导，分组头点击折叠 */}
          {groups.map((g, gi) => {
            const shut = !!collapsed[g.key]
            return (
              <motion.div key={g.key} initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: gi * 0.08 }}
                className="relative">
                <button onClick={() => setCollapsed({ ...collapsed, [g.key]: !shut })}
                  aria-expanded={!shut} title={shut ? '展开该组' : '收起该组'}
                  className="z-10 mb-2 ml-9 flex items-center gap-1.5 rounded-full py-0.5 pr-2 text-xs font-medium text-ink-2 transition-colors hover:text-primary">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />{g.domain} · 逐个突破
                  <span className="rounded-full bg-paper-2 px-1.5 text-[10px] text-ink-3">{g.items.length} 项</span>
                  <CaretDown size={13} weight="bold" className={`text-ink-3 transition-transform duration-200 ${shut ? '-rotate-90' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {!shut && (
                    <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden">
                <div className="space-y-3">
                  {g.items.map((t) => {
                    const isLearn = t.type === 'material'
                    return (
                      <div key={t.type + t.category} className="flex items-start gap-4">
                        <span className={`z-10 mt-1 grid size-10 flex-none place-items-center rounded-xl font-serif font-bold
                          ${isLearn ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                          {isLearn ? '学' : '练'}
                        </span>
                        <div className="spot-card flex-1 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-[15px] font-medium leading-snug">{t.title}</p>
                              {isLearn && <p className="mt-0.5 text-xs text-gold">先学本域材料，再做随堂自测，最后练习</p>}
                            </div>
                            <div className="flex items-center gap-1.5">
                              {t.freshness_status && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  t.freshness_status === '巩固期'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : t.freshness_status === '临界衰退'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {t.freshness_status}
                                </span>
                              )}
                              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium
                                ${t.state === '薄弱' ? 'bg-cat-red-soft text-cat-red' : t.state === '学习中' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                                {t.state}
                              </span>
                            </div>
                          </div>
                          {/* 明确引导：这一步该做什么、做完会怎样 */}
                          {t.guide && <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink-2">{t.guide}</p>}
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {isLearn ? (
                              <button onClick={() => onMaterial(t.domain_id)}
                                className="btn items-center gap-1.5 rounded-full border border-gold/40 bg-gold-soft/60 px-3.5 py-1.5 text-xs text-gold hover:border-gold">
                                进入学习 · 随堂自测<ArrowRight size={11} />
                              </button>
                            ) : (
                              questions && questions.length > 0 && (
                                <button onClick={() => { const q = questions.find((x) => x.domain_id === t.domain_id) ?? questions[0]; onPick(q) }}
                                  className="btn items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs hover:border-primary hover:text-primary">
                                  开始练习<ArrowRight size={11} />
                                </button>
                              )
                            )}
                            {t.goal && <span className="text-xs text-ink-3">达成：{t.goal}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}

      {doneTasks.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <CheckCircle size={14} weight="fill" className="text-ok" />已完成（不再出现在待办）
          </p>
          <div className="space-y-2.5">
            {doneTasks.map((t, i) => (
              <div key={t.domain_id + i} className="card flex items-center gap-3 p-4 opacity-75">
                <span className="grid size-7 flex-none place-items-center rounded-full text-ok" style={{ background: 'var(--color-ok-soft)' }}>
                  <CheckCircle size={15} weight="fill" />
                </span>
                <p className="text-sm text-ink-2 line-through">{t.title}</p>
                <span className="ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-medium text-ok" style={{ background: 'var(--color-ok-soft)' }}>
                  {t.state === '初步掌握' ? '已达标' : '掌握'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-6 text-xs text-ink-3">演示账号 {userId.slice(0, 8)} · 路径按「一学一练」配对生成 · 本系统不提供用药建议</p>
    </motion.div>
  )
}

/* ---------- 问 AI（课程问答：BM25 教材切片 grounded，有引用才答） ---------- */

type QAMsg = {
  q: string; a: string
  // 引用来源：textbook=教材页切片，itembank=题库题目解析（双路混合检索，2026-09-10）
  citations: { ref: string; chapter: string; book_page: number;
    source?: string; label?: string; code?: string }[]
  refused: boolean; provider: string; note?: string
  follow_ups?: string[]
}

const QA_EXAMPLES = [
  '阿托品为什么会散瞳？',
  '去甲肾上腺素和异丙肾上腺素有什么区别？',
  '为什么闭角型青光眼禁用阿托品？',
]

const QA_SMART_SUGGESTIONS = [
  '🔍 为什么该药物选项在此情境下是错误的或禁忌的？',
  '⚖️ 简要辨析我选的干扰药物与正确答案的机制靶点差异',
  '⚠️ 该考点涉及的代表药物有哪些核心不良反应与风险？',
  '💡 请结合人卫第9版教材，总结本题考查的核心受体通路与助记口诀',
]

function QAView({
  userId,
  onError,
  prefill,
  onClearPrefill
}: {
  userId: string
  onError: (m: string) => void
  prefill?: { context?: string; question?: string } | null
  onClearPrefill?: () => void
}) {
  const [msgs, setMsgs] = useState<QAMsg[]>([])
  const [input, setInput] = useState(prefill?.question || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [])

  async function ask(text: string, contextOverride?: string) {
    const question = text.trim().slice(0, 500)
    if (!question || busy) return
    setBusy(true)
    setInput('')
    const ctx = contextOverride !== undefined ? contextOverride : prefill?.context
    const history = msgs.slice(-4).flatMap((m) => [
      { role: 'user', content: m.q },
      { role: 'assistant', content: m.a }
    ])
    try {
      const r = await api.qa(userId, question, ctx, undefined, history)
      setMsgs((m) => [...m, {
        q: question, a: r.answer, citations: r.citations ?? [],
        refused: !!r.refused, provider: r.provider ?? '', note: r.note,
        follow_ups: r.follow_ups ?? [],
      }])
    } catch (e) { onError(String(e)) } finally { setBusy(false) }
  }

  return (
    <motion.div key="qa" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold">课程问答 · 问AI</p>
          <h2 className="display mt-2 text-[26px]">有不会的，直接问</h2>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={() => setMsgs([])}
            className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-3 hover:border-red-300 hover:text-red-700 transition"
          >
            开启新会话 / 清除历史
          </button>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        只讲《药理学》课程内容：支持多轮深度追问，先检索教材切片，有依据才回答，并标出引用章节。
        检索不到会直说不知道；用药决策类问题会拒绝（本系统不提供用药建议）。
      </p>

      {/* 错题 / 诊断卡一键联动上下文与智能追问建议 */}
      {prefill?.context && (
        <div className="card mt-5 p-5 border-2 border-amber-500/30 bg-amber-50/50 rounded-2xl">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
              <ChatCircle size={14} weight="fill" />已深度联动当前错题 / 诊断卡上下文
            </span>
            {onClearPrefill && (
              <button onClick={onClearPrefill} className="text-[11px] text-ink-3 hover:text-ink">
                ✕ 清除关联
              </button>
            )}
          </div>
          <p className="text-xs text-ink-2 whitespace-pre-line leading-relaxed bg-white/80 p-3 rounded-xl border border-amber-200/60 font-mono">
            {prefill.context}
          </p>
          <div className="mt-3">
            <p className="text-xs font-semibold text-ink-2 mb-2">一键追问推荐：</p>
            <div className="flex flex-wrap gap-1.5">
              {QA_SMART_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => ask(sug)}
                  disabled={busy}
                  className="rounded-full border border-amber-500/40 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100/80 transition text-left">
                  {sug}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {msgs.length === 0 && !prefill?.context && (
        <div className="card mt-6 p-6">
          <p className="mb-3 text-sm font-semibold">试试这样问</p>
          <div className="flex flex-wrap gap-2">
            {QA_EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => ask(ex)} disabled={busy}
                className="btn rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 hover:border-primary hover:text-primary">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {msgs.map((m, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
            <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-white">
              {m.q}
            </div>
            <div className={`card mt-2 p-5 ${m.refused ? 'border-gold/40' : ''}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${m.provider === 'external_api' ? 'bg-primary-soft text-primary' : 'bg-paper-2 text-ink-3'}`}>
                  {m.provider === 'external_api' ? '真模型回答' : m.provider === 'rule' || m.provider === 'retriever' ? '规则回复' : '演示模式'}
                </span>
                {m.refused && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">暂未回答</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{m.a}</p>
              {m.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-line pt-3">
                  {m.citations.map((c) => (
                    <span key={c.ref} className={`rounded-full px-2.5 py-1 text-[11px] ${
                      c.source === 'itembank' ? 'bg-gold-soft text-ink-2' : 'bg-paper text-ink-2'}`}>
                      {c.ref} {c.label || `${c.chapter} · p${c.book_page}`}
                    </span>
                  ))}
                </div>
              )}

              {/* Socrates follow-up question bubbles */}
              {m.follow_ups && m.follow_ups.length > 0 && (
                <div className="mt-3 border-t border-dashed border-line/60 pt-3">
                  <p className="text-[11px] font-bold text-amber-800 mb-1.5 flex items-center gap-1">
                    <Sparkle size={13} weight="fill" className="text-amber-600" />
                    苏格拉底启发追问（点击继续深挖）：
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.follow_ups.map((fup, fidx) => (
                      <button
                        key={fidx}
                        type="button"
                        onClick={() => ask(fup)}
                        disabled={busy}
                        className="rounded-full border border-amber-500/30 bg-amber-50/70 px-3 py-1 text-xs text-amber-950 hover:border-amber-500 hover:bg-amber-100 transition text-left"
                      >
                        💡 {fup}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        {busy && <div className="space-y-3"><div className="skeleton h-14" /><div className="skeleton h-32" /></div>}
      </div>

      <div className="sticky bottom-4 mt-6">
        <div className="glass liquid flex items-center gap-2 rounded-full py-2 pl-5 pr-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) } }}
            placeholder="问一个药理学问题（500字内），回车发送"
            maxLength={500} disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3" />
          <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="btn btn-primary flex-none !px-5 !py-2">
            {busy ? '思考中…' : '发送'}
          </button>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-ink-3">
        回答由课程资料切片 grounded 生成，仅供学习参考，引用不保证完全正确；本系统不提供用药建议。对话按知情同意约定保存，可随时撤回并删除。
      </p>
    </motion.div>
  )
}

/* ---------- 学习材料路由（一学一练：种子域走深图谱，章节走大纲学习） ---------- */

/* ---------- 章节前置温故知新微测（场景三） ---------- */
function ChapterWarmupCard({ userId, domainId }: { userId: string; domainId: string }) {
  const [warmup, setWarmup] = useState<{ has_warmup: boolean; title?: string; reason?: string; question?: Question } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ is_correct: boolean; correct_answer: string; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.chapterWarmup(userId, domainId).then(setWarmup).catch(() => setWarmup(null))
  }, [userId, domainId])

  if (!warmup || !warmup.has_warmup || !warmup.question) return null

  const q = warmup.question

  const handleSubmit = async () => {
    if (!picked) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.submitChapterWarmup(userId, domainId, {
        question_id: q.id,
        selected_option: picked,
      })
      setFeedback(res)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-primary/25 bg-primary-soft/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow-xs">
            <Sparkle size={13} weight="fill" />
          </span>
          <span className="text-xs font-bold text-primary">{warmup.title}</span>
        </div>
        {!expanded && !feedback && (
          <button
            onClick={() => setExpanded(true)}
            className="btn btn-primary rounded-full px-3.5 py-1 text-xs font-semibold shadow-xs"
          >
            做 1 道热身题唤醒记忆
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink-2">{warmup.reason}</p>

      {expanded && !feedback && (
        <div className="mt-3.5 rounded-xl border border-line bg-card/80 p-4">
          <p className="text-xs font-semibold text-ink-3">热身微测：</p>
          <p className="mt-1 text-sm font-medium leading-relaxed">{q.stem}</p>
          <div className="mt-3 space-y-1.5">
            {q.options?.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setPicked(opt.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-xs transition ${
                  picked === opt.key
                    ? 'border-primary bg-primary/10 font-semibold text-primary'
                    : 'border-line hover:bg-card-hover'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  picked === opt.key ? 'bg-primary text-white' : 'border border-line text-ink-3'
                }`}>
                  {opt.key}
                </span>
                <span>{opt.text}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="btn rounded-full border border-line px-3.5 py-1 text-xs text-ink-3"
            >
              收起
            </button>
            <button
              disabled={!picked || submitting}
              onClick={handleSubmit}
              className="btn btn-primary rounded-full px-4 py-1 text-xs font-semibold disabled:opacity-50"
            >
              {submitting ? '提交中…' : '提交热身'}
            </button>
          </div>
          {error && <p className="mt-2 text-right text-xs text-red-600">{error}</p>}
        </div>
      )}

      {feedback && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-primary/30 bg-card p-3 text-xs">
          <span className="mt-0.5">{feedback.is_correct ? '🎉' : '💡'}</span>
          <div>
            <p className="font-semibold text-primary">
              {feedback.is_correct ? '回答正确！' : `参考答案：${feedback.correct_answer}`}
            </p>
            <p className="mt-0.5 text-ink-2">{feedback.message}</p>
          </div>
        </div>
      )}
    </div>
  )
}

/* 今日待办「进入学习 · 随堂自测」的统一入口：
 * 先查 study-map 明细判来源 —— 种子域（顾问深图谱）渲染 MaterialView；
 * 章节渲染 ChapterStudy（大纲知识点树 + 随堂自测 + 去本章练习），保证每个薄弱项
 * 都有对等的「学」内容可点，不再出现只有练、没有学的分组。 */
function MaterialRoute({ userId, domainId, goal, onPractice, onBack, onError, onAskAi }: {
  userId: string; domainId: string; goal: string
  onPractice: (q: Question) => void; onBack: () => void; onError: (m: string) => void
  onAskAi?: (ctx: string, defaultQ?: string) => void
}) {
  type RouteDetail = {
    source: 'seed' | 'syllabus' | 'none'; is_seed: boolean
    domain_id: string; code: string; title: string; book_chapter_no: number | null
    chapter?: { title: string } | null
  }
  const [detail, setDetail] = useState<RouteDetail | null>(null)
  const [qBusy, setQBusy] = useState(false)

  useEffect(() => {
    setDetail(null)
    window.scrollTo(0, 0)
    api.studyDetail(userId, domainId).then(setDetail).catch((e) => onError(String(e)))
  }, [userId, domainId])

  async function goPractice() {
    if (qBusy) return
    setQBusy(true)
    try {
      const list: Question[] = await api.questions()
      const q = list.find((x) => x.domain_id === domainId) ?? list[0]
      if (q) onPractice(q)
      else onError('该域暂无练习题，请从今日待办选择其他任务。')
    } catch (e) { onError(String(e)) } finally { setQBusy(false) }
  }

  if (!detail) return <div className="space-y-3 pt-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-20" />)}</div>

  if (detail.is_seed) {
    return (
      <div key={domainId}>
        <div className="mb-4">
          <button onClick={onBack}
            className="btn items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
            <ArrowRight size={12} className="rotate-180" />返回今日待办
          </button>
        </div>
        <ChapterWarmupCard userId={userId} domainId={domainId} />
        <MaterialView userId={userId} domainId={domainId} onError={onError}
          onPractice={onPractice} onBack={onBack} />
      </div>
    )
  }

  const node: StudyNode = {
    domain_id: detail.domain_id, code: detail.code, is_seed: false,
    title: detail.chapter?.title ?? detail.title,
    book_chapter_no: detail.book_chapter_no, source: detail.source,
    q_published: 0, objective: '', studied: null, mastery: null,
  }
  return (
    <motion.div key={`mr-${domainId}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mb-4">
        <button onClick={onBack}
          className="btn items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink-2 hover:border-primary hover:text-primary">
          <ArrowRight size={12} className="rotate-180" />返回今日待办
        </button>
      </div>
      <ChapterWarmupCard userId={userId} domainId={domainId} />
      <ChapterStudy userId={userId} node={node} goal={goal} onError={onError} onDone={() => {}} onAskAi={onAskAi} />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={goPractice} disabled={qBusy} className="btn btn-primary">
          {qBusy ? '进入中…' : '学完了，去本章练习'}<ArrowRight size={15} weight="bold" />
        </button>
        <button onClick={onBack} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm font-medium text-ink-2 hover:border-primary hover:text-primary">
          返回今日待办
        </button>
      </div>
    </motion.div>
  )
}

/* ---------- 学习材料 ---------- */

type MaterialData = {
  domain: { code: string; name: string; chapter_ref: string }
  chain: { level: number; title: string; summary: string }[]
  confusion_pairs: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence }[]
  knowledge_relations?: {
    source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note: string
    evidence?: KgEvidence; review_status?: string
  }[]
  evidence: { ref: string; text: string }[]
}

function MaterialView({ userId, domainId, onPractice, onBack, onError }: {
  userId: string; domainId: string
  onPractice: (q: Question) => void; onBack: () => void; onError: (m: string) => void
}) {
  const [mat, setMat] = useState<MaterialData | null>(null)
  const [starting, setStarting] = useState(false)
  // 随堂自测（学习程度检验，2026-09-08）：读完材料后回答本域未做过的题，通过≥60%即完成本域学习
  const [quiz, setQuiz] = useState<{ id: string; code: string; stem: string; options: { key: string; text: string }[] }[] | null>(null)
  const [quizPicks, setQuizPicks] = useState<Record<string, string>>({})
  const [quizResult, setQuizResult] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [quizBusy, setQuizBusy] = useState(false)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.materials(domainId).then(setMat).catch((e) => onError(String(e)))
    api.materialQuiz(userId, domainId).then((r) => setQuiz(r.questions ?? []))
      .catch((e) => onError(String(e)))
  }, [domainId])

  async function submitQuiz() {
    if (!quiz || quizBusy) return
    setQuizBusy(true)
    try {
      const r = await api.submitMaterialQuiz(userId, domainId, quizPicks)
      setQuizResult({ passed: r.passed, correct: r.correct, total: r.total })
      if (r.passed) { /* 学习已完成：回待办会看到 material 任务出列 */ }
    } catch (e) { onError(String(e)) } finally { setQuizBusy(false) }
  }

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
                <EvidenceNote ev={p.evidence ?? null} reviewStatus="published" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 药效关系图谱（FR-A2 结构化知识关系） */}
      {(mat.knowledge_relations ?? []).length > 0 && (
        <div className="card mt-4 p-7">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-semibold"><span className="capsule gold" />药效关系图谱 · 错题背后的知识点关系</h3>
          </div>
          <p className="mb-4 text-xs text-ink-3">把这道域内的药物/靶点/效应/禁忌关系画成一条条边，帮你看清「错因」所在的一环。</p>
          <KnowledgeGraphView edges={mat.knowledge_relations ?? []} />
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(mat.knowledge_relations ?? []).map((r, i) => (
              <div key={i} className="rounded-xl border border-line-2 bg-white px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <NodeChip type={r.source.type} name={r.source.name} />
                  <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-semibold text-ink-3">{r.edge}</span>
                  <NodeChip type={r.target.type} name={r.target.name} />
                </div>
                {r.note && <p className="mt-1 text-[11px] text-ink-3">{r.note}</p>}
                <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">
            每条关系均标注教材出处页码；标注「待顾问审校」的条目尚未经药理顾问审校，全章节铺开后统一发布。
          </p>
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

      {/* 随堂自测：学习程度检验（读完材料 → 自测 → 通过即完成本域学习） */}
      <div className="card mt-4 p-7">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <span className="capsule" />随堂自测 · 检验学习程度
        </h3>
        <p className="mb-4 text-xs text-ink-3">回答本域 3 道未做过的题，答对 ≥60% 即完成本域学习，今日待办里的「学习材料」任务随之出列。</p>

        {quizResult ? (
          <div className={`rounded-2xl border p-5 text-sm ${quizResult.passed ? 'border-ok/40 bg-[var(--color-ok-soft)]' : 'border-cat-red/40 bg-[var(--color-cat-red-soft)]'}`}>
            <p className="flex items-center gap-1.5 font-semibold">
              {quizResult.passed
                ? <><CheckCircle size={16} weight="fill" className="flex-none text-ok" />自测通过（{quizResult.correct}/{quizResult.total}）</>
                : <><XCircle size={16} weight="fill" className="flex-none text-cat-red" />未通过（{quizResult.correct}/{quizResult.total}）</>}
            </p>
            <p className="mt-1 text-ink-2">
              {quizResult.passed
                ? '本域薄弱错因已完成学习，进入练习阶段。'
                : '还有没掌握的：回到上方材料再看一遍，然后重试。'}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button onClick={() => { setStarting(true); api.questions().then((list) => { const q = list.find((x: Question) => x.domain_id === domainId); if (q) onPractice(q); else onError('该域暂无练习题'); }).catch((e) => onError(String(e))).finally(() => setStarting(false)) }}
                disabled={starting} className="btn btn-primary">
                <CheckCircle size={15} />{starting ? '进入中…' : quizResult.passed ? '进入练习' : '先去练习试试'}
              </button>
              <button onClick={onBack} className="btn border border-line text-ink-2 hover:border-primary hover:text-primary">返回今日待办</button>
            </div>
          </div>
        ) : quiz && quiz.length > 0 ? (
          <div className="space-y-5">
            {quiz.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line-2 p-5">
                <p className="mb-3 text-sm font-medium leading-relaxed">{i + 1}. {q.stem}</p>
                <div className="space-y-2.5">
                  {q.options.map((o) => (
                    <motion.button key={o.key} whileTap={{ scale: 0.99 }} onClick={() => setQuizPicks({ ...quizPicks, [q.id]: o.key })}
                      className={`relative w-full rounded-xl border px-4 py-2.5 text-left text-sm
                        ${quizPicks[q.id] === o.key ? 'border-primary bg-primary-soft/50' : 'border-line bg-white hover:border-ink-3/40'}`}>
                      <span className={`mr-2 inline-grid size-5 items-center justify-center rounded-full border text-[11px] font-bold
                        ${quizPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2'}`}>{o.key}</span>
                      {o.text}
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button onClick={submitQuiz} disabled={Object.keys(quizPicks).length < quiz.length || quizBusy}
                className="btn btn-primary">
                {quizBusy ? '判分中…' : '提交自测'}
              </button>
              <span className="text-xs text-ink-3">全部作答后提交</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-paper p-5 text-sm text-ink-2">
            本域暂无自测题。可直接进入练习，用做题检验掌握程度。
            <button onClick={() => { setStarting(true); api.questions().then((list) => { const q = list.find((x: Question) => x.domain_id === domainId); if (q) onPractice(q); else onError('该域暂无练习题，请从今日待办选择其他任务。'); }).catch((e) => onError(String(e))).finally(() => setStarting(false)) }}
              disabled={starting} className="btn btn-primary mt-4">
              <CheckCircle size={15} />{starting ? '进入中…' : '进入练习'}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  )
}

/* ---------- 聚光边框卡片 ---------- *//* ---------- 聚光边框卡片 ---------- */

type Analysis = {
  question_code: string; stem: string; answer: string
  evidence: { ref: string; text: string }[]
  analysis: { option: string; option_text: string; category: string; misconception: string; note: string }[]
  primary?: { option: string; option_text: string; category: string; misconception: string; note: string } | null
  followups?: { question_text: string; options: { key: string; text: string }[] | null }[]
}

type WrongRow = {
  attempt_id: string; question_id?: string; question_code: string; stem: string
  selected: string; answer: string
  misconception: { name: string; category: string } | null
  case_evidence?: { scenario: string; lesson: string; source: string } | null
  evidence_level: string | null
  retention_pct?: number
  decay_level?: 'fresh' | 'warning' | 'critical'
  days_since?: number
  stage?: number
  schedule_id?: string | null
}

/* 错题记忆卡（wrong/{id}/recall）：图谱 + 临床/教材助记 */
type RecallData = {
  question: { code: string; stem: string; answer: string } | null
  misconception: { code: string; name: string; category: string } | null
  case_evidence: { scenario: string; lesson: string; source: string } | null
  evidence_level: string | null
  ai_rationale?: string | null
  relations: { source: { type: string; name: string }; edge: string; target: { type: string; name: string }; note?: string; evidence?: KgEvidence; review_status?: string }[]
  confusion_pairs: { drug_a: string; drug_b: string; distinction: string; evidence?: KgEvidence; relevant?: boolean }[]
  textbook_anchors: { chapter: string; page: number; book_page: number; score: number; text: string; source_ref: string }[]
  trained: boolean
  linked_entities?: { name: string; type: string }[]
  subgraph?: { nodes: { name: string; type: string }[]; edges: RecallData['relations']; fallback: boolean }
}

type ArchiveData = {
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

function Profile({ userId, onGoTodo }: { userId: string; onGoTodo: () => void }) {
  const [arch, setArch] = useState<ArchiveData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => {
    api.archive(userId).then(setArch).catch((e) => setError(String(e)))
  }, [userId])

  if (error) return <ErrorPanel message={error} />
  if (!arch) return <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}</div>

  const s = arch.summary
  const acc = Math.round(s.accuracy * 100)
  const accColor = s.accuracy >= 0.7 ? 'var(--color-ok)' : s.accuracy >= 0.5 ? 'var(--color-gold)' : 'var(--color-cat-red)'
  const accTone = s.accuracy >= 0.7 ? '达标' : s.accuracy >= 0.5 ? '待提升' : '偏低'
  const masteryOrder = ['薄弱', '学习中', '初步掌握', '掌握', '稳定掌握']
  const masteryByState = masteryOrder
    .map((st) => ({ state: st, items: arch.mastery.filter((m) => m.state === st) }))
    .filter((g) => g.items.length > 0)

  // —— 薄弱点数据整理（用于「看得懂」的自适应视图）——
  const heatDomains = arch.heatmap.domains
  const heatCats = arch.heatmap.categories
  const catColors: Record<string, string> = {
    知识遗忘: 'var(--color-cat-blue)', 概念混淆: 'var(--color-cat-purple)',
    机制理解不足: 'var(--color-cat-orange)', 审题与应用失误: 'var(--color-cat-red)', 待诊断: 'var(--color-ink-3)',
  }
  // 非零薄弱单元 [域, 错因, 错题数]
  const cells: { domain: string; cat: string; n: number }[] = []
  arch.heatmap.values.forEach((row, y) => row.forEach((v, x) => {
    if (v > 0) cells.push({ domain: heatDomains[y] ?? '', cat: heatCats[x] ?? '', n: v })
  }))
  cells.sort((a, b) => b.n - a.n)
  const judged = cells.filter((c) => c.cat !== '待诊断')            // 已归因的薄弱
  const pendingCat = cells.filter((c) => c.cat === '待诊断')         // 待诊断
  // 数据是否丰富到能撑起一张矩阵热力图（否则改用清单，避免全白大图）
  const denseEnough = cells.length >= 6
  const heatRowDomains = [...new Set(cells.map((c) => c.domain))]    // 仅含非零错的域
  const heatColCats = [...new Set(cells.map((c) => c.cat))]          // 仅含非零错的错因
  const cellVal = (d: string, c: string) => arch.heatmap.values
    [heatDomains.indexOf(d)]?.[heatCats.indexOf(c)] ?? 0

  // 错因占比：固定五类（含 0 值）完整展示，避免“看不见的类别”
  const FIXED_CATS = ['知识遗忘', '概念混淆', '机制理解不足', '审题与应用失误']
  const catTotal = Object.values(arch.category_dist).reduce((a, b) => a + b, 0)
  // 诊断完整度：把「待诊断」错题也归因后，画像才准
  const diagnosedComplete = s.wrong_book > 0 ? Math.round((s.diagnosed / s.wrong_book) * 100) : 0

  const stat = (label: string, value: string | number, sub: string, accent = 'var(--color-primary)',
    ratio?: number, ratioLabel?: string) => (
    <div className="card p-4">
      <p className="text-[11px] font-semibold text-ink-3">{label}</p>
      <p className="display mt-1 text-[22px] leading-none" style={{ color: accent }}>{value}</p>
      <p className="mt-1.5 text-[11px] text-ink-3">{sub}</p>
      {typeof ratio === 'number' && (
        <div className="mt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-line-2">
            <div className="h-full rounded-full" style={{ width: `${Math.round(ratio * 100)}%`, background: accent }} />
          </div>
          {ratioLabel && <p className="mt-1 text-[10px] text-ink-3">{ratioLabel}</p>}
        </div>
      )}
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <p className="text-xs font-semibold tracking-[0.18em] text-gold">学习档案</p>
      <h2 className="display mt-2 text-[26px]">你的药理学能力画像</h2>
      <p className="mt-2 text-sm text-ink-2">演示账号 {userId.slice(0, 8)} · 档案随每次练习自动更新 · 数据仅存于校内演示环境</p>

      {/* 全新账号：给明确的第一步引导，而不是只摆四张 0 的卡片 */}
      {arch.summary.attempts === 0 && (
        <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-[20px] border border-primary/20 bg-primary-soft/60 px-6 py-5 sm:flex-row sm:items-center">
          <div>
            <p className="display text-lg text-ink">档案还是空的</p>
            <p className="mt-1 text-sm text-ink-2">先去「今日待办」做几道题或跑一次摸底，这里就会随着练习逐步生成你的画像。</p>
          </div>
          <button onClick={onGoTodo} className="btn btn-primary flex-none">去今日待办<ArrowRight size={15} weight="bold" /></button>
        </div>
      )}

      {/* 顶部统计卡片：每个数字都给含义 + 相对判定，不再是孤立数字 */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('累计作答', s.attempts, '道题已作答',
          'var(--color-primary)', s.attempts ? 1 : 0, s.attempts ? '作答量越高画像越准' : '暂无作答')}
        {stat('正确率', `${acc}%`, `${s.correct} 对 / ${s.wrong} 错 · ${accTone}`,
          accColor, s.attempts ? s.accuracy : 0,
          s.attempts ? (s.accuracy < 0.7 ? '未到 70% 达标线 → 需要加强' : '已达 70% 达标线') : '暂无作答')}
        {stat('薄弱错题', s.wrong_book, `${s.diagnosed} 项已诊断归因`,
          'var(--color-cat-red)', s.wrong_book ? diagnosedComplete / 100 : 0,
          s.diagnosed < s.wrong_book ? '还有错题未诊断 → 画像会偏' : '错题均已归因，画像完整')}
        {stat('靶向训练', `${s.trained}`, `${s.training_passed} 次通过`,
          'var(--color-gold)', s.trained ? s.training_passed / Math.max(s.trained, 1) : 0,
          s.trained ? '训练的通过率' : '暂无训练')}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* 薄弱点分布：自适应——错题少用「清单」，错题够多才出「矩阵」，永远可读 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">薄弱点分布</h3>
          <p className="mb-3 text-xs text-ink-3">错题集中在哪里、是哪种错因 · 数字 = 累计答错题数</p>

          {cells.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-ink-2">还没有错题记录，这里会标出你最该补的薄弱点</p>
              <button onClick={onGoTodo} className="btn btn-primary !px-5 !py-2 text-[13px]">
                去今日待办练几道<ArrowRight size={13} weight="bold" />
              </button>
            </div>
          )}

          {/* A. 数据稀疏：优先给「该补哪里」的清单（demo 现态） */}
          {cells.length > 0 && !denseEnough && (
            <div className="space-y-3">
              {judged.map((c) => (
                <div key={`${c.domain}-${c.cat}`} className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-2.5">
                  <span className="grid size-7 flex-none place-items-center rounded-full text-xs font-bold text-ok" style={{ background: 'var(--color-ok-soft)' }}>{c.n}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.domain}</p>
                    <p className="text-[11px] text-ink-3">主要问题：<CategoryTag category={c.cat} /></p>
                  </div>
                  <span className="ml-auto flex-none text-[11px] text-ink-3">去对应章节巩固</span>
                </div>
              ))}
              {pendingCat.length > 0 && (
                <div className="rounded-xl border border-dashed border-line px-3.5 py-2.5 text-xs text-ink-3">
                  <p className="font-medium text-ink-2">另有 {pendingCat.reduce((a, b) => a + b.n, 0)} 道错题还没完成归因诊断</p>
                  <p className="mt-0.5">重新作答并走完「诊断」后，才能标出它们是哪种错因。</p>
                </div>
              )}
            </div>
          )}

          {/* B. 数据充足：域 × 错因 矩阵（含色阶图例，深浅=错题数） */}
          {denseEnough && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
                  <thead>
                    <tr>
                      <th className="w-[30%] py-1 pr-2 text-left text-[11px] font-medium text-ink-3">诊断域＼错因</th>
                      {heatColCats.map((c) => <th key={c} className="px-1 py-1 text-center text-[11px] font-medium text-ink-3">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatRowDomains.map((d) => (
                      <tr key={d}>
                        <td className="py-1 pr-2 text-right text-[11px] font-medium text-ink-2">{d}</td>
                        {heatColCats.map((c) => {
                          const n = cellVal(d, c)
                          return (
                            <td key={c} className="p-0">
                              <div className="grid h-9 place-items-center rounded-lg text-xs font-bold"
                                style={{ background: n === 0 ? 'var(--color-paper-2)' : n === 1 ? '#CFE6DB' : n === 2 ? '#79B69E' : '#0E7A63',
                                  color: n >= 2 ? '#fff' : '#0E7A63' }}>
                                {n > 0 ? n : ''}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 色阶图例 */}
              <div className="mt-3 flex items-center gap-2 text-[10px] text-ink-3">
                <span>错题数</span>
                {[0, 1, 2, 3].map((n) => (
                  <span key={n} className="inline-flex items-center gap-1">
                    <i className="inline-block size-3 rounded" style={{ background: n === 0 ? 'var(--color-paper-2)' : n === 1 ? '#CFE6DB' : n === 2 ? '#79B69E' : '#0E7A63' }} />
                    {n === 3 ? '3+' : n}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 域级正确率：样本太少标灰不误判，样本够才按 70% 判色 */}
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">各域作答正确率</h3>
          <p className="mb-3 text-xs text-ink-3">
            答过 ≥5 题才判定是否进入学习路径 · <span className="text-cat-red">低于 70% → 进今日待办重点补</span> · 答太少标灰（数字仅供参考）
          </p>
          {arch.domain_stats.length === 0 && <p className="py-10 text-center text-sm text-ink-3">还没有作答记录。</p>}
          {arch.domain_stats.length > 0 && (
            <div className="space-y-3">
              {arch.domain_stats.map((d) => {
                const reliable = d.attempts >= 5
                const low = reliable && d.rate < 0.7
                const pct = Math.round(d.rate * 100)
                return (
                  <div key={d.domain_id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        {d.domain}
                        {!reliable && (
                          <span className="rounded-full bg-line-2 px-2 py-0.5 text-[10px] text-ink-3">样本少</span>
                        )}
                      </span>
                      <span className={reliable ? (low ? 'font-semibold text-cat-red' : 'text-ok') : 'text-ink-3'}>
                        {pct}% · {d.attempts}题{!reliable && ' · 仅供参考'}
                      </span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded-full bg-line-2">
                      {/* 70% 达标刻度 */}
                      <span className="absolute left-[70%] top-[-2px] z-10 h-[18px] w-px bg-line" />
                      <div className="h-full rounded-full"
                        style={{ width: `${pct}%`,
                          background: !reliable ? 'var(--color-ink-3)' : low ? 'var(--color-cat-red)' : 'var(--color-ok)' }} />
                    </div>
                  </div>
                )
              })}
              <p className="border-t border-dashed border-line pt-2 text-[11px] leading-relaxed text-ink-3">
                标灰表示该域答题不足 5 题，正确率仅供参考——多练几题后画像才准；低于 70% 的域今日待办会自动带你补。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 错因类别占比 + 掌握度总览 */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="mb-1 text-sm font-semibold">错因类型分布</h3>
          <p className="mb-3 text-xs text-ink-3">错题被归为哪类学习障碍 · 固定五类，0 也如实显示</p>
          {catTotal === 0 && <p className="py-8 text-center text-sm text-ink-3">还没有错因记录：答错并完成诊断后这里会分类你的薄弱原因。</p>}
          {catTotal > 0 && (
            <>
              {/* 诊断完整度 */}
              <div className="mb-4 rounded-xl border border-line px-3.5 py-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-ink-2">诊断完整度</span>
                  <span className={diagnosedComplete === 100 ? 'text-ok' : 'text-gold'}>
                    {s.diagnosed}/{s.wrong_book} 道错题已归因
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-2">
                  <div className="h-full rounded-full" style={{ width: `${diagnosedComplete}%`,
                    background: diagnosedComplete === 100 ? 'var(--color-ok)' : 'var(--color-gold)' }} />
                </div>
                {diagnosedComplete < 100 && (
                  <p className="mt-1.5 text-[10px] text-ink-3">
                    还有 {s.wrong_book - s.diagnosed} 道错题没归因——先去「错题本」把待诊断的题走完诊断，下方分布才准确。
                  </p>
                )}
              </div>

              <div className="space-y-3.5">
                {[...FIXED_CATS, '待诊断'].map((cat) => {
                  const v = arch.category_dist[cat] ?? 0
                  const share = v / Math.max(catTotal, 1)
                  return (
                    <div key={cat}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <CategoryTag category={cat} />
                          {v === 0 && <span className="text-[10px] text-ink-3">暂未出现</span>}
                        </span>
                        <span className={v === 0 ? 'text-ink-3' : 'font-semibold text-ink-2'}>
                          {v} 题{catTotal > 0 ? ` · ${Math.round(share * 100)}%` : ''}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-line-2">
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.round(share * 100)}%`, minWidth: v > 0 ? 6 : 0,
                            background: v === 0 ? 'transparent' : catColors[cat] ?? 'var(--color-primary)' }} />
                      </div>
                      {cat === '待诊断' && v > 0 && <p className="mt-0.5 text-[10px] text-ink-3">占比高时画像还不准，先去诊断归因</p>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">掌握度总览</h3>
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium text-ok" style={{ background: 'var(--color-ok-soft)' }}>
              已达标 {s.mastery_done}/{s.mastery_rows} 项
            </span>
          </div>
          {arch.mastery.length === 0 && <EmptyPanel text="还没有掌握度记录：完成一次「作答 → 诊断 → 训练 → 复测」后这里会出现。" />}
          <div className="space-y-3">
            {masteryByState.map((g) => (
              <div key={g.state}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold">{g.state}</span>
                  <span className="text-xs text-ink-3">{g.items.length} 项</span>
                </div>
                <div className="space-y-1.5">
                  {g.items.map((m, i) => {
                    const probPct = m.probability != null ? Math.round(m.probability * 100) : null
                    return (
                      <div key={i} className="rounded-xl border border-line bg-paper/60 px-3.5 py-2.5 text-[12px] transition hover:border-primary/40">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-ink">{m.domain}</span>
                            {m.category && <span className="ml-2 text-ink-3">· {m.category}</span>}
                          </div>
                          {probPct != null && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-primary" style={{ background: 'var(--color-primary-soft)' }}>
                              BKT掌握率 {probPct}%
                            </span>
                          )}
                        </div>
                        {probPct != null && (
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line-2">
                            <div className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, Math.max(6, probPct))}%`,
                                background: probPct >= 80 ? 'var(--color-ok)' : probPct >= 60 ? 'var(--color-primary)' : probPct >= 35 ? 'var(--color-gold)' : 'var(--color-cat-red)'
                              }}
                            />
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-3">
                          <span className="truncate">{m.reason || 'BKT贝叶斯追踪计算'}</span>
                          {m.attempts_count != null && m.attempts_count > 0 && (
                            <span className="flex-none ml-2">已作答 {m.attempts_count} 次</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ---------- 错题本一键抗遗忘唤醒弹窗（场景二） ---------- */
/* ---------- 错题本一键抗遗忘唤醒弹窗（场景二 · 现代药房质感重构） ---------- */
function WrongAwakenModal({
  userId,
  attemptId,
  onClose,
}: {
  userId: string
  attemptId: string
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    concept_name: string
    question: Question
    hint: string
  } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.awakenWrong(userId, attemptId)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [userId, attemptId])

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-16 sm:pt-20 bg-black/60 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-xl max-h-[calc(100dvh-6rem)] my-auto flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        {/* 顶部处方笺式装饰头栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line-2 bg-paper px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="capsule gold" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-[0.16em] text-gold">抗遗忘唤醒</span>
                <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">同源变式巩固</span>
              </div>
              <h3 className="display mt-0.5 text-base font-bold text-ink">
                {data?.concept_name ? `「${data.concept_name}」定向靶向唤醒` : '抗遗忘靶向巩固'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-ink-3 shadow-xs transition hover:bg-line-2 hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* 主体内容（自适应垂直滚动） */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          {loading && (
            <div className="py-14 text-center">
              <div className="skeleton mx-auto mb-3 h-8 w-8 rounded-full" />
              <p className="text-xs font-medium text-ink-3">正在检索同章节变式题与药学辨析出处…</p>
            </div>
          )}

          {!loading && data && (
            <div className="space-y-4">
              {/* 知识点提炼提示框（对齐处方笺风格） */}
              <div className="rounded-xl border border-line-2 bg-paper px-4 py-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
                  <Pill size={13} weight="fill" />
                  临床机制与辨析提要
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  {data.hint}
                </p>
              </div>

              {/* 变式题目区 */}
              <div className="rounded-xl border border-line bg-[#FCFDFB] p-4.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    强化变式题 · {data.question.code}
                  </span>
                  <span className="text-xs text-ink-3">单项选择题</span>
                </div>
                <p className="text-[15px] font-medium leading-relaxed text-ink">
                  {data.question.stem}
                </p>

                {/* 选项列表 */}
                <div className="mt-4 space-y-2.5">
                  {data.question.options?.map((opt) => {
                    const isPicked = selected === opt.key
                    const showResult = submitted
                    const isCorrect = opt.key === (data.question as unknown as { answer?: string }).answer

                    let borderClass = 'border-line hover:border-primary/40 bg-white'
                    let textClass = 'text-ink'
                    let badgeClass = 'border border-line bg-paper-2 text-ink-2 font-medium'

                    if (isPicked && !showResult) {
                      borderClass = 'border-primary bg-primary-soft/40 shadow-xs ring-1 ring-primary/30'
                      textClass = 'text-primary font-medium'
                      badgeClass = 'bg-primary text-white font-bold'
                    } else if (showResult && isCorrect) {
                      borderClass = 'border-ok bg-ok-soft/50 ring-1 ring-ok/40'
                      textClass = 'text-ok font-semibold'
                      badgeClass = 'bg-ok text-white font-bold'
                    } else if (showResult && isPicked && !isCorrect) {
                      borderClass = 'border-red-300 bg-red-50 ring-1 ring-red-300'
                      textClass = 'text-red-700'
                      badgeClass = 'bg-red-500 text-white font-bold'
                    }

                    return (
                      <button
                        key={opt.key}
                        disabled={submitted}
                        onClick={() => setSelected(opt.key)}
                        className={`flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left text-xs transition ${borderClass}`}
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${badgeClass}`}>
                          {opt.key}
                        </span>
                        <span className={`leading-relaxed ${textClass}`}>{opt.text}</span>
                        {showResult && isCorrect && (
                          <CheckCircle size={16} weight="fill" className="ml-auto shrink-0 text-ok" />
                        )}
                        {showResult && isPicked && !isCorrect && (
                          <XCircle size={16} weight="fill" className="ml-auto shrink-0 text-red-500" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 作答反馈提示 */}
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2.5 rounded-xl border border-ok/30 bg-ok-soft/60 p-3.5"
                >
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-ok" />
                  <div>
                    <p className="text-xs font-bold text-ok">
                      唤醒作答已完成！神经元长时记忆突触已重新加固。
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
                      错题记忆新鲜度已重置提升，系统将在下次临界衰退时主动提醒您。
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* 底部操作条 */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-line-2 bg-paper px-6 py-3.5">
          <button
            onClick={onClose}
            className="rounded-full border border-line bg-white px-4 py-2 text-xs font-medium text-ink-2 transition hover:bg-paper-2"
          >
            {submitted ? '返回错题本' : '稍后再做'}
          </button>
          {!submitted && (
            <button
              disabled={!selected}
              onClick={() => setSubmitted(true)}
              className="btn btn-primary rounded-full px-6 py-2 text-xs font-semibold disabled:opacity-40"
            >
              确认作答
            </button>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function WrongBook({ userId, onGoTodo, onAskAi }: { userId: string; onGoTodo: () => void; onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void }) {
  const [wrong, setWrong] = useState<WrongRow[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [awakenAttemptId, setAwakenAttemptId] = useState<string | null>(null)
  const [showExportModal, setShowExportModal] = useState(false)
  const [recallMap, setRecallMap] = useState<Record<string, RecallData | null>>({})
  const [loadingRecall, setLoadingRecall] = useState<string | null>(null)
  const [wgraph, setWgraph] = useState<{
    nodes: KgNodeT[]; edges: KgEdgeT[]
    meta: Record<string, { attempt_ids?: string[] }>
    total: number; shown: number
  } | null>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [])
  const loadWrongData = useCallback(() => {
    api.wrongBook(userId).then(setWrong).catch(() => setWrong([]))
    api.wrongGraph(userId).then(setWgraph).catch(() => setWgraph(null))
  }, [userId])

  useEffect(() => {
    loadWrongData()
  }, [loadWrongData])

  const toggleRecall = (attemptId: string) => {
    if (openId === attemptId) { setOpenId(null); return }
    setOpenId(attemptId)
    if (!recallMap[attemptId]) {
      setLoadingRecall(attemptId)
      api.wrongRecall(attemptId)
        .then((d) => setRecallMap((m) => ({ ...m, [attemptId]: d })))
        .catch(() => setRecallMap((m) => ({ ...m, [attemptId]: null })))
        .finally(() => setLoadingRecall(null))
    }
  }

  // 关联图谱点题节点 → 直接展开该错题记忆卡并滚到位置
  const openFromGraph = (name: string) => {
    const aid = wgraph?.meta?.[name]?.attempt_ids?.[0]
    if (!aid) return
    toggleRecall(aid)
    requestAnimationFrame(() => {
      document.getElementById(`wrong-${aid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-gold">错题本</p>
          <h2 className="display mt-2 text-[26px]">按错因归档的错题</h2>
          <p className="mt-2 text-sm text-ink-2">演示账号 {userId.slice(0, 8)} · 数据仅存于校内演示环境</p>
        </div>
        {wrong && wrong.length > 0 && (
          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="btn btn-secondary flex items-center gap-2 border-gold/40 text-xs font-semibold shadow-sm hover:border-gold hover:bg-gold/5 transition"
          >
            <Printer size={16} className="text-gold" weight="bold" />
            一键导出考前必背小册 (PDF / A4)
          </button>
        )}
      </div>

      {wgraph && wgraph.nodes.length > 0 && (
        <section className="card mt-6 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />错题关联图谱 · 同章 / 同药 / 同错因的题自动连边</h3>
          <p className="mb-3 mt-1 text-xs text-ink-3">
            以错题为节点，章节·药物·错因为枢纽——连到同一枢纽的两道题，就是该一起复习的题。点击题节点可直接展开记忆卡。
            {wgraph.total > wgraph.shown && `（最近 ${wgraph.shown} 道，共 ${wgraph.total} 道）`}
          </p>
          <KnowledgeGraphView
            nodes={wgraph.nodes} edges={wgraph.edges}
            title="错题关联图谱"
            tabDefs={[
              { k: 'all', label: `全部 ${wgraph.edges.length}`, match: () => true },
              { k: 'know', label: '同知识', match: (e) => e.edge === '属于' || e.edge === '涉及' },
              { k: 'cause', label: '同错因', match: (e) => e.edge === '归因' },
            ]}
            labelTypes={new Set(['题目', '章节', '药物', '错因', '类别', '靶点'])}
            centerMode="degree"
            palette={{ 题目: '#0e7a5f', 章节: '#ffffff' }}
            onNodeClick={openFromGraph}
          />
        </section>
      )}

      <div className="mt-6 space-y-8">
        <section>
          <h3 className="mb-3.5 flex items-center gap-2 text-sm font-semibold"><span className="capsule gold" />错题本 · 按错因归档</h3>
          {!wrong && <div className="skeleton h-20" />}
          {wrong && wrong.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
              <p className="text-sm text-ink-2">错题本是空的：还没有答错的题，或者答错的题还没完成诊断。</p>
              <button onClick={onGoTodo} className="btn btn-primary">去今日待办做几道题<ArrowRight size={15} weight="bold" /></button>
            </div>
          )}
          {wrong && wrong.length > 0 && (
            <WrongGroups wrong={wrong} openId={openId}
              loadingRecall={loadingRecall} recallMap={recallMap} onToggle={toggleRecall}
              onAwaken={(aid) => setAwakenAttemptId(aid)} onAskAi={onAskAi} />
          )}
        </section>
      </div>

      {awakenAttemptId && (
        <WrongAwakenModal
          userId={userId}
          attemptId={awakenAttemptId}
          onClose={() => {
            setAwakenAttemptId(null)
            loadWrongData()
          }}
        />
      )}

      {showExportModal && (
        <WrongBookExportModal
          userId={userId}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </motion.div>
  )
}

/* 错题分组（按错因归档：同类错因归一组，可折叠；待归因沉底） */
function WrongGroups({ wrong, openId, loadingRecall, recallMap, onToggle, onAwaken, onAskAi }: {
  wrong: WrongRow[]; openId: string | null; loadingRecall: string | null
  recallMap: Record<string, RecallData | null>; onToggle: (id: string) => void
  onAwaken: (attemptId: string) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  const groups: { key: string; label: string | null; items: WrongRow[] }[] = []
  for (const w of wrong) {
    const key = w.misconception?.category ?? '待归因'
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, label: w.misconception?.category ?? null, items: [] }; groups.push(g) }
    g.items.push(w)
  }
  groups.sort((a, b) => (a.key === '待归因' ? 1 : 0) - (b.key === '待归因' ? 1 : 0))
  const [shut, setShut] = useState<Record<string, boolean>>({})
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const closed = !!shut[g.key]
        return (
          <section key={g.key}>
            <button onClick={() => setShut({ ...shut, [g.key]: !closed })} aria-expanded={!closed}
              title={closed ? '展开该类' : '收起该类'}
              className="mb-3 flex items-center gap-2 rounded-full py-0.5 pr-2 transition-opacity hover:opacity-80">
              {g.label
                ? <CategoryTag category={g.label} />
                : <span className="rounded-full bg-line-2 px-3.5 py-1.5 text-xs font-semibold text-ink-3">待归因</span>}
              <span className="text-xs text-ink-3">{g.items.length} 道</span>
              <CaretDown size={13} weight="bold" className={`text-ink-3 transition-transform duration-200 ${closed ? '-rotate-90' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {!closed && (
                <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden">
                  <div className="space-y-3">
                    {g.items.map((w) => (
                      <div key={w.attempt_id} id={`wrong-${w.attempt_id}`} className="card scroll-mt-24 p-5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-xs text-ink-3">{w.question_code}</span>
                          {w.evidence_level && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${w.evidence_level === '低' ? 'bg-gold-soft text-gold' : 'bg-primary-soft text-primary'}`}>
                              证据 · {w.evidence_level}
                            </span>
                          )}
                          {w.retention_pct !== undefined && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                w.decay_level === 'fresh'
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : w.decay_level === 'warning'
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                  : 'bg-rose-500/15 text-rose-700 animate-pulse dark:text-rose-300'
                              }`}
                            >
                              <Hourglass size={12} weight="fill" />
                              新鲜度 {w.retention_pct}% · {w.decay_level === 'fresh' ? '保鲜良好' : w.decay_level === 'warning' ? '遗忘警戒' : '衰退严重'}
                            </span>
                          )}
                          <span className="ml-auto text-xs text-ink-3">选 {w.selected} · 正确 {w.answer}</span>
                        </div>
                        <p className="mt-2.5 text-[15px] font-medium leading-relaxed">{w.stem}</p>
                        {w.misconception && <p className="mt-1.5 text-xs text-ink-2">归因：{w.misconception.name}</p>}
                        {w.case_evidence && (
                          <div className="mt-3 rounded-xl border border-line-2 bg-paper px-4 py-3">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
                              <Pill size={12} weight="fill" />临床案例 · 助记
                            </p>
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{w.case_evidence.scenario}</p>
                            <p className="mt-1 text-[13px] font-medium leading-relaxed text-ink">要点：{w.case_evidence.lesson}</p>
                            <p className="mt-1.5 text-[11px] text-ink-3">来源：{w.case_evidence.source}</p>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-2.5">
                          <button onClick={() => onToggle(w.attempt_id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3.5 py-1.5 text-xs text-ink-3 transition hover:border-primary hover:text-primary">
                            <BookOpenText size={13} />
                            {openId === w.attempt_id ? '收起错因图谱 · 记忆助记' : '看这张错题的图谱 & 临床助记'}
                          </button>
                          <button
                            onClick={() => onAwaken(w.attempt_id)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
                          >
                            <Lightning size={13} weight="fill" className="text-amber-500" />
                            ⚡ 一键抗遗忘唤醒
                          </button>
                          {onAskAi && (
                            <button
                              onClick={() => {
                                const ctx = `错题编码：${w.question_code}
题干：${w.stem}
学生选项：${w.selected}
正确答案：${w.answer}
${w.misconception ? `归因错因：${w.misconception.name} (${w.misconception.category || ''})` : ''}
${w.case_evidence ? `关联临床案例：${w.case_evidence.scenario} (要点：${w.case_evidence.lesson})` : ''}`
                                onAskAi(ctx, `请帮我深入剖析这道错题：我选了 ${w.selected}，正确答案是 ${w.answer}。请结合药理机制与临床考点分析我混淆了什么？`, w.question_id)
                              }}
                              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3.5 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300"
                            >
                              <ChatCircleText size={13} weight="bold" className="text-sky-500" />
                              💬 针对此题向 AI 追问
                            </button>
                          )}
                        </div>
                        {openId === w.attempt_id && (
                          <div className="mt-3 rounded-xl border border-primary/20 bg-primary-soft/40 px-4 py-4">
                            {loadingRecall === w.attempt_id
                              ? <p className="text-xs text-ink-3">正在生成错题记忆卡…</p>
                              : !recallMap[w.attempt_id]
                                ? <p className="text-xs text-ink-3">记忆卡加载失败，请稍后再试。</p>
                                : <RecallCardView data={recallMap[w.attempt_id]!} />}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )
      })}
    </div>
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

function NodeChip({ type, name }: { type: string; name: string }) {
  const tint: Record<string, string> = {
    药物: 'var(--color-primary-soft)',
    靶点: 'var(--color-cat-purple-soft)',
    机制: 'var(--color-cat-blue-soft)',
    效应: 'var(--color-ok-soft)',
    禁忌: 'var(--color-cat-red-soft)',
    适应证: 'var(--color-gold-soft)',
  }
  const bg = tint[type] ?? 'var(--color-paper-2)'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium text-ink"
      style={{ background: bg }}>
      <span className="text-[10px] text-ink-3">{type}</span>{name}
    </span>
  )
}

/* 知识图谱交互视图（2026-09-12 redesign-preserve）：分层轨道布局。
   力导毛球不可读 → 确定性 BFS 分层：中心（章节/核心实体）+ 环带（节/类别/药物/知识点）。
   标签纪律：章节·节·药物常显，其余悬停/聚焦才显；边标签默认隐藏，含义进图例与详情。
   颜色锁主题：emerald 主色 + gold 点缀药物，其余 stone 中性；文字一律墨色 + 白色描边。 */
type KgNodeT = { name: string; type: string }
type KgEdgeT = {
  source: { type: string; name: string }; edge: string; target: { type: string; name: string }
  note?: string; evidence?: KgEvidence; review_status?: string
}

const KG_DOT: Record<string, string> = {
  核心: '#0e7a5f', 系统: '#1d4ed8', 章节: '#0e7a5f', 示范: '#b8860b', 已达标: '#2e7d32', 节: '#ffffff', 药物: '#b8860b', 类别: '#9aa0a8', 知识点: '#c3c9c2',
  靶点: '#7c5cd6', 效应: '#2e7d32', 禁忌: '#c0392b', 适应证: '#b8860b', 机制: '#5b7fa6', 其他: '#9aa0a8',
  题目: '#334155', 错因: '#c0392b',
}
const KG_RING: Record<string, string> = {
  核心: '#0e7a5f', 系统: '#2563eb', 章节: '#0e7a5f', 示范: '#b8860b', 已达标: '#2e7d32', 节: '#0e7a5f', 知识点: '#8a8f98', 类别: '#8a8f98',
}
const KG_LINE: Record<string, string> = {
  '包含': '#d5dbd7', '属于': '#0e7a5f',
  '作用于': '#7c5cd6', '表现为': '#5b7fa6', '禁忌用于': '#c0392b', '适应证': '#b8860b', '与…相互作用': '#7c5cd6',
  '涉及': '#0e7a5f', '归因': '#b8860b',
}
const KG_LABEL_TYPES = new Set(['核心', '系统', '章节', '示范', '已达标', '节', '药物'])

/** 自定义视图：错题关联图谱等场景覆盖默认三视图（全部/结构/药物）。 */
export type KgTabDef = { k: string; label: string; match: (e: KgEdgeT) => boolean }

/** 确定性分层轨道坐标：BFS 定层，子节点按父角扇形展开。返回 positions + angles（弧度）。
    规则：直连中心的药物统一移到外环整圆均分（内环只留结构节点，避免 40 点挤一环）。 */
function kgOrbit(names: string[], types: Map<string, string>, adj: Map<string, string[]>, center: string, W: number, H: number): { pos: Map<string, [number, number]>; ang: Map<string, number> } {
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
function kgLabelRotate(a: number): number {
  let deg = (a * 180) / Math.PI + 90
  while (deg > 90) deg -= 180
  while (deg <= -90) deg += 180
  return Math.round(deg)
}

function KnowledgeGraphView({ nodes, edges, title, tabDefs, labelTypes, centerMode, palette, onNodeClick, height }: {
  nodes?: KgNodeT[]; edges: KgEdgeT[]; title?: string
  tabDefs?: KgTabDef[]; labelTypes?: Set<string>; centerMode?: 'auto' | 'degree'
  palette?: Record<string, string>; onNodeClick?: (name: string) => void
  height?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const [tab, setTab] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selEdge, setSelEdge] = useState<number | null>(null)
  const [selNode, setSelNode] = useState<string | null>(null)
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
      const { pos, ang } = center ? kgOrbit(nodeList.map((n) => n.name), new Map(nodeList.map((n) => [n.name, n.type || '其他'])), adj, center, W, H) : { pos: new Map<string, [number, number]>(), ang: new Map<string, number>() }
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
            const isCenter = n.name === center
            const a = ang.get(n.name) ?? 0
            const outward = Math.cos(a) >= 0
            // 长名截断：节名多为长短语，超过 7 字只显示前 7 字（全名进 tooltip/详情）
            const maxLen = t === '节' ? 7 : (t === '章节' || t === '示范' || t === '已达标') ? 13 : 9
            const lbl = n.name.length > maxLen ? `${n.name.slice(0, maxLen)}…` : n.name
            return {
              name: n.name, x, y, category: t,
              tip: `<b>${n.name}</b><br/>${t} · 连边 ${degree.get(n.name) ?? 0} 条<br/><span style="color:#0e7a5f">${(t === '章节' || t === '示范' || t === '已达标') ? '点击聚焦并在下方进入章节自学' : '点击聚焦邻域'}</span>`,
              symbolSize: t === '核心' ? 44 : t === '系统' ? 32 : (t === '章节' || t === '示范' || t === '已达标') ? (isCenter ? 40 : 20) : t === '题目' ? 26 : t === '药物' ? 20 : t === '节' ? 24 : t === '错因' ? 22 : 14,
              itemStyle: {
                color: dot(t),
                borderColor: KG_RING[t] ?? '#ffffff', borderWidth: 2.5,
                shadowColor: 'rgba(14,122,95,0.18)', shadowBlur: 8,
              },
              label: {
                show: showLabel,
                position: isCenter ? 'inside' : outward ? 'right' : 'left',
                distance: 7, rotate: isCenter ? 0 : kgLabelRotate(a),
                formatter: lbl,
                fontSize: isCenter ? 13 : t === '系统' ? 11 : (t === '章节' || t === '示范' || t === '已达标') ? 10 : 10,
                fontWeight: (isCenter || t === '系统') ? 700 : 500,
                color: isCenter ? '#ffffff' : '#1f2a26',
                textBorderColor: isCenter ? 'transparent' : 'rgba(255,255,255,0.92)',
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
    return () => { window.removeEventListener('resize', onResize); if (timer) clearTimeout(timer) }
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

  return (
    <div className="mb-3 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_8px_28px_-18px_rgba(14,122,95,0.35)]">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <p className="mr-auto text-xs font-semibold text-ink">{title ?? '知识图谱'}</p>
        <div className="flex rounded-full bg-paper p-0.5">
          {defs.map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all active:scale-[0.97] ${tab === t.k ? 'bg-primary text-white shadow' : 'text-ink-3'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitSearch() }}
            placeholder="搜实体，如硝苯地平" className="w-36 rounded-full border border-line bg-paper px-3 py-1 text-[11px] text-ink outline-none placeholder:text-ink-3 focus:border-primary" />
          <button onClick={submitSearch} aria-label="搜索实体"
            className="grid size-7 place-items-center rounded-full bg-primary-soft text-primary transition-all active:scale-[0.95]">
            <MagnifyingGlass size={14} />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2">
        {types.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 text-[10px] text-ink-3">
            <span className="inline-block size-2 rounded-full border border-white shadow" style={{ background: dot(t) }} />{t}
          </span>
        ))}
        <span className="ml-auto text-[10px] text-ink-3">{nodeList.length} 节点 · {shown.length} 边{edges.length > 120 ? '（仅展示前 120 条）' : ''}</span>
      </div>
      {empty && (
        <div className="mx-4 mb-4 rounded-xl border border-dashed border-line bg-paper/60 px-4 py-6 text-center text-xs text-ink-3">
          该视角暂无关联——点上方视图切回，或多做几道同章/同类错题后再看。
        </div>
      )}
      {/* 画布常驻挂载（空态仅隐藏）：卸载会导致 ref 丢失、回切复用僵尸实例 */}
      <div ref={ref} style={{ height: empty ? 0 : (height ?? 380), width: '100%', display: empty ? 'none' : undefined }} className="cursor-grab active:cursor-grabbing" />
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
type KgEvidence = { source?: string; book_page?: number; chapter?: string; text?: string } | null

function EvidenceNote({ ev, reviewStatus }: { ev: KgEvidence; reviewStatus?: string }) {
  const reviewed = reviewStatus === 'published'
  if (!ev || !ev.text) {
    return (
      <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
        <span className="mr-1 rounded bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-3">无教材依据</span>
        该条关系暂未在教材原文中检索到直接表述，保留待药理顾问核实后补充。
      </p>
    )
  }
  // 派生关联（大纲结构/题库共现/做题关联）：如实署名，不冒充教材页码
  if (ev.book_page == null) {
    return (
      <div className="mt-1 text-[11px] leading-relaxed">
        <p className="flex flex-wrap items-center gap-1 text-ink-3">
          <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-2">{ev.source ?? '程序派生'}</span>
          {ev.chapter && <span>{ev.chapter}</span>}
        </p>
        <p className="mt-0.5 text-ink-2">「{ev.text}」</p>
      </div>
    )
  }
  return (
    <div className="mt-1 text-[11px] leading-relaxed">
      <p className="flex flex-wrap items-center gap-1 text-ink-3">
        <span className="rounded bg-[var(--color-gold-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-gold">
          教材 P{ev.book_page ?? '—'}
        </span>
        {ev.chapter && <span>{ev.chapter}</span>}
        {!reviewed && (
          <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-3">待顾问审校</span>
        )}
      </p>
      <p className="mt-0.5 text-ink-2">「{ev.text}」</p>
    </div>
  )
}

/* 错题记忆卡：图谱 + 临床/教材助记（wrong/{id}/recall 数据） */
function RecallCardView({ data }: { data: RecallData }) {
  const rels = data.relations ?? []
  const cps = data.confusion_pairs ?? []
  const anchors = data.textbook_anchors ?? []
  const hasGraph = rels.length > 0
  // 条目列表只列与本题实体直连的边（子图加深到 2 跳后全量可达 40 条，全列即刷屏）
  const linkedNames = new Set((data.linked_entities ?? []).map((e) => e.name))
  const direct = rels.filter((r) => linkedNames.has(r.source.name) || linkedNames.has(r.target.name))
  const listRels = (direct.length ? direct : rels).slice(0, 8)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {data.misconception
          ? (<><CategoryTag category={data.misconception.category} /><span className="font-medium text-ink">{data.misconception.name}</span></>)
          : <span className="text-xs text-ink-3">尚未归因到四类错因（可回到作答流程完成诊断细化）</span>}
      </div>

      {data.ai_rationale && (
        <div className="rounded-xl border border-primary/25 bg-primary-soft/60 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-primary">
            <Sparkle size={13} weight="fill" />AI 导师临床归因剖析 · 大模型智能推理
          </p>
          <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink">{data.ai_rationale}</p>
        </div>
      )}

      {/* 知识关系图谱 */}
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <span className="capsule" />错因背后的知识关系图谱{!hasGraph && '（该章关系表待扩充）'}
        </p>
        {(data.linked_entities ?? []).length > 0 && (
          <p className="mt-1.5 text-[11px] text-ink-3">
            本题关联实体：{(data.linked_entities ?? []).map((e) => e.name).join(' · ')}
          </p>
        )}
        {hasGraph && (
          <KnowledgeGraphView
            nodes={data.subgraph?.nodes}
            edges={(data.subgraph?.edges?.length ? data.subgraph.edges : rels)}
            title={data.subgraph?.fallback ? '本章图谱（本题未链接到具体实体，展示全章）' : '错题子图 · 与本题相关的边（点击边查看出处）'}
          />
        )}
        {hasGraph ? (
          <div className="mt-2.5 space-y-2">
            {rels.length > listRels.length && (
              <p className="text-[10px] text-ink-3">子图共 {rels.length} 条关系，下仅列出与本题实体直接相关的 {listRels.length} 条，其余在上方交互图中查看。</p>
            )}
            {listRels.map((r, i) => (
              <div key={i} className="rounded-lg bg-paper/60 px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <NodeChip type={r.source.type} name={r.source.name} />
                  <span className="text-[11px] font-medium text-primary">─{r.edge}→</span>
                  <NodeChip type={r.target.type} name={r.target.name} />
                </div>
                <EvidenceNote ev={r.evidence ?? null} reviewStatus={r.review_status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-3">这张题所属章节的知识关系表尚未铺开，正式内容由药理顾问标注后开放。</p>
        )}
      </div>

      {/* 易混药对 */}
      {cps.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-primary"><span className="capsule gold" />易混药对辨析</p>
          <div className="mt-2 space-y-1.5">
            {cps.map((p, i) => (
              <div key={i} className="rounded-lg bg-paper px-3 py-2 text-[12px] text-ink-2">
                <span className="font-semibold text-ink">{p.drug_a}</span> × <span className="font-semibold text-ink">{p.drug_b}</span>
                {p.relevant && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">与本题相关</span>}
                <p className="mt-0.5 leading-relaxed">{p.distinction}</p>
                <EvidenceNote ev={p.evidence ?? null} reviewStatus="published" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 教材记忆锚点 */}
      {anchors.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
            <Pill size={11} weight="fill" />教材依据 · 帮你想起来
          </p>
          <div className="mt-2 space-y-2">
            {anchors.map((a, i) => (
              <div key={i} className="rounded-lg border border-line-2 bg-paper px-3 py-2">
                <p className="text-[10.5px] text-ink-3">{a.chapter || '教材'} · 教材定位第{a.book_page || a.page}页</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasGraph && cps.length === 0 && anchors.length === 0 && (
        <p className="text-xs text-ink-3">这道题暂无可展示的图谱与教材助记（该章内容资产待扩充）。</p>
      )}
    </div>
  )
}

function PracticeFlow({ userId, question, onDiagnosis, onError, onExit, onStep, onAskAi }: {
  userId: string; question: Question
  onDiagnosis: (d: Diagnosis | null) => void; onError: (m: string) => void; onExit: () => void
  onStep: (n: number) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [retest, setRetest] = useState<{ training_id: string; questions: { id: string; stem: string; options: { key: string; text: string }[] }[] } | null>(null)
  const [retestPicks, setRetestPicks] = useState<Record<string, string>>({})
  const [retestResult, setRetestResult] = useState<{ passed: boolean; correct: number; total: number } | null>(null)
  const [rationale, setRationale] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  // 题库物化题（无 distractor_signals 标注）：答错走通用四分类归因轻量诊断会话
  // （一级错因 + 证据等级低 + 可细化），答对只给解析型反馈
  const [tikuFeedback, setTikuFeedback] = useState<{ feedback: TikuFeedback; is_correct: boolean } | null>(null)
  const [training, setTraining] = useState<{
    training_id: string; mode: string; note: string
    questions: { id: string; stem: string; options: { key: string; text: string }[]; is_ai_variant?: boolean }[]
    cards?: { front: string; back: string }[]
    reteach?: { level: number; title: string; summary: string } | null
  } | null>(null)
  const [generatingVariant, setGeneratingVariant] = useState(false)
  const [flipped, setFlipped] = useState<Record<number, boolean>>({})
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
        rationale: rationale || undefined, idempotency_key: genUUID(),
      })
      if (r.session_id) {
        setTikuFeedback(null)
        pushDiagnosis(await api.diagnosis(r.session_id))
      } else {
        // 题库题答对：不建会话，直接展示解析型反馈
        pushDiagnosis(null)
        setTikuFeedback({ feedback: r.feedback as TikuFeedback, is_correct: !!r.is_correct })
      }
      onStep(8)
    } catch (e) { setError(String(e)) } finally { setSubmitting(false) }
  }

  async function refresh(id: string) { pushDiagnosis(await api.diagnosis(id)) }

  async function handleGenerateAiVariant() {
    if (!training) return
    setGeneratingVariant(true)
    try {
      const res = await api.generateAiVariant(training.training_id)
      if (res && res.variant) {
        setTraining((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            questions: [...prev.questions, res.variant]
          }
        })
      }
    } catch (e) {
      setError('生成变式题失败：' + String(e))
    } finally {
      setGeneratingVariant(false)
    }
  }

  // 键盘答题：选项键直选 + 回车提交；输入框聚焦 / 已出结论时不劫持
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return
      if (diagnosis || tikuFeedback || submitting) return
      const hit = question.options.find((o) => o.key.toUpperCase() === e.key.toUpperCase())
      if (hit) { setSelected(hit.key); return }
      if (e.key === 'Enter' && selected) { e.preventDefault(); submitRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
    if (!training || !diagnosis) return
    try {
      const r = await api.submitTraining(training.training_id, trainingPicks)
      setTrainingResult({ score: r.score })
      if (r.score >= 0.6) {
        const rt = await api.retest(training.training_id)
        setRetest(rt)
        pushDiagnosis(await api.diagnosis(diagnosis.session_id))
      }
    } catch (e) { onError(String(e)) }
  }

  async function finishRetest() {
    if (!retest) return
    try {
      const r = await api.submitRetest(retest.training_id, retestPicks)
      setRetestResult({ passed: r.passed, correct: r.correct, total: r.total })
    } catch (e) { onError(String(e)) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="card relative overflow-hidden !rounded-[24px]">
        <div className="absolute right-6 top-5 opacity-[0.06]"><Hex size={92} className="text-ink" /></div>
        <div className="border-b border-line-2 px-8 pb-6 pt-7">
          <div className="flex items-center justify-between text-xs text-ink-3">
            <div className="flex items-center gap-2">
              <span className="capsule" />{question.code} · 单选题 · 药理学 / {question.chapter_name || 'M 受体药'}
            </div>
            <button onClick={onExit} className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink-3 transition hover:border-primary hover:text-primary">
              <ArrowRight size={11} className="rotate-180" />返回今日待办
            </button>
          </div>
          <p className="display mt-4 text-[19px] leading-relaxed">{question.stem}</p>
        </div>
        <div className="p-8 pt-6">
          <div className="space-y-3">
            {question.options.map((o) => (
              <motion.button key={o.key} onClick={() => setSelected(o.key)} whileTap={{ scale: 0.99 }}
                className={`relative w-full rounded-2xl border px-5 py-4 text-left text-sm transition-colors duration-150
                  ${selected === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                <span className="relative z-10 flex items-center gap-3.5">
                  <span className={`grid size-7 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                    ${selected === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>
                    {o.key}
                  </span>
                  <span className={selected === o.key ? 'font-semibold text-ink' : 'text-ink-2'}>{o.text}</span>
                </span>
              </motion.button>
            ))}
          </div>

          {!diagnosis && !tikuFeedback && question.options.every((o) => /^[A-Za-z0-9]$/.test(o.key)) && (
            <p className="mt-4 text-xs text-ink-3">
              键盘答题：按 {question.options.map((o) => o.key).join(' / ')} 快速选择，回车提交
            </p>
          )}
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
        {tikuFeedback && (
          <TikuFeedbackCard key={`tiku-${question.id}`} feedback={tikuFeedback.feedback}
            isCorrect={tikuFeedback.is_correct} onExit={onExit} />
        )}
        {diagnosis && (
          <DiagnosisPanel key={diagnosis.session_id}
            diagnosis={diagnosis} questionId={question.id} onRefresh={refresh}
            onStartTraining={startTraining} onExit={onExit} onError={setError} onAskAi={onAskAi} />
        )}
      </AnimatePresence>

      {training && !trainingResult && (
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card mt-5 !rounded-[24px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="display text-[19px]">
                {training.mode === '记忆卡' ? '记忆卡训练' : training.mode === '断环重讲' ? '断环重讲 + 变式训练' : training.mode === '情境拆解' ? '情境拆解训练' : '针对性训练'}
              </h3>
              {training.note && <p className="text-xs text-ink-3 mt-0.5">{training.note}</p>}
            </div>
            <span className="capsule gold" />
          </div>

          {/* 断环重讲：先讲断环环节 */}
          {training.mode === '断环重讲' && training.reteach && (
            <div className="mb-6 rounded-2xl border-2 border-primary/30 bg-primary-soft/60 p-5">
              <p className="text-[11px] font-semibold text-primary mb-1">断环重讲 · L{training.reteach.level} {training.reteach.title}</p>
              <p className="text-sm leading-relaxed text-ink-2">{training.reteach.summary}</p>
            </div>
          )}

          {/* 记忆卡形态：翻卡 */}
          {training.mode === '记忆卡' && (training.cards ?? []).length > 0 && (
            <div className="space-y-3">
              {(training.cards ?? []).map((c, i) => (
                <motion.button key={i} whileTap={{ scale: 0.99 }}
                  onClick={() => setFlipped({ ...flipped, [i]: !flipped[i] })}
                  className="w-full rounded-2xl border border-line-2 bg-white p-5 text-left">
                  <p className="text-[11px] font-semibold text-ink-3 mb-1.5">
                    记忆卡 {i + 1}/{(training.cards ?? []).length} · {flipped[i] ? '要点' : '回忆'}
                  </p>
                  <p className={`leading-relaxed ${flipped[i] ? 'text-sm text-ink-2' : 'display text-[16px]'}`}>
                    {flipped[i] ? c.back : c.front}
                  </p>
                </motion.button>
              ))}
              <p className="text-xs text-ink-3">全部翻看完毕后点击下方按钮标记完成（知识遗忘类先记后测）。</p>
            </div>
          )}

          {training.mode !== '记忆卡' && (
          <div className="space-y-6">
            {training.questions.length === 0 ? (
              <div className="rounded-2xl border border-line-2 bg-paper p-6 text-center text-sm text-ink-2">
                正在加载针对性训练题，请稍候…
              </div>
            ) : (
              training.questions.map((q, i) => (
                <div key={q.id} className={`rounded-2xl border p-6 ${q.is_ai_variant ? 'border-primary/40 bg-primary-soft/20' : 'border-line-2'}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-ink-3">第 {i + 1} 题</span>
                    {q.is_ai_variant && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                        <Sparkle size={12} weight="fill" />
                        ⚡ AI 高仿真变式 · 盲答双审通过
                      </span>
                    )}
                  </div>
                  <p className="mb-3.5 text-sm font-medium leading-relaxed">{q.stem}</p>
                  <div className="space-y-2.5">
                    {q.options.map((o) => (
                      <motion.button key={o.key} whileTap={{ scale: 0.99 }}
                        onClick={() => setTrainingPicks({ ...trainingPicks, [q.id]: o.key })}
                        className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                          ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                        <span className="relative z-10 flex items-center gap-3">
                          <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                            ${trainingPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>
                            {o.key}
                          </span>
                          <span className={trainingPicks[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleGenerateAiVariant}
                disabled={generatingVariant}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-white px-4 py-2 text-xs font-semibold text-primary shadow-xs transition hover:bg-primary-soft disabled:opacity-50"
              >
                <Sparkle size={13} weight="fill" />
                {generatingVariant ? 'AI 正在根据本题考点生成高仿真变式并进行反向交叉盲审…' : '⚡ 现场生成一道 AI 变式题（双盲交叉审校）'}
              </button>
            </div>
          </div>
          )}
          {training.mode !== '记忆卡' && (
          <button onClick={finishTraining}
            disabled={training.questions.length === 0 || Object.keys(trainingPicks).length < training.questions.length}
            className="btn btn-primary mt-7 disabled:opacity-50">
            提交训练{training.questions.length > 0 ? `（已答 ${Object.keys(trainingPicks).length}/${training.questions.length}）` : ''}
          </button>
          )}
          {training.mode === '记忆卡' && (
            <button onClick={finishTraining} className="btn btn-primary mt-7">完成记忆训练</button>
          )}
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
                      className={`relative w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150
                        ${retestPicks[q.id] === o.key ? 'border-primary bg-primary-soft/75 shadow-xs' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                      <span className="relative z-10 flex items-center gap-3">
                        <span className={`grid size-6 flex-none place-items-center rounded-full border text-xs font-bold transition-colors duration-150
                          ${retestPicks[q.id] === o.key ? 'border-primary bg-primary text-white' : 'border-line text-ink-2 bg-white'}`}>{o.key}</span>
                        <span className={retestPicks[q.id] === o.key ? 'font-medium text-ink' : 'text-ink-2'}>{o.text}</span>
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

/* 题库物化题（无错因标注）的解析型反馈卡：答对/答错均即时展示教材解析。
   区别于种子域的错因诊断卡——不硬归因到四分类错因（诚实口径，见演示手册）。 */
function TikuFeedbackCard({ feedback, isCorrect, onExit }: {
  feedback: TikuFeedback; isCorrect: boolean; onExit: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-5 space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
        className="card flex items-center gap-4 p-5"
        style={{ background: isCorrect ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)',
                 borderColor: isCorrect ? 'var(--color-ok-soft)' : 'var(--color-cat-red-soft)' }}>
        {isCorrect
          ? <CheckCircle size={26} weight="fill" className="flex-none text-ok" />
          : <Warning size={26} weight="fill" className="flex-none text-cat-red" />}
        <div>
          <p className="font-semibold">{isCorrect ? '回答正确' : '回答错误'}</p>
          <p className="text-[13px] text-ink-2">
            {feedback.chapter_name ? `${feedback.chapter_name} · ` : ''}题库原题解析已展示
            {!isCorrect && '，可对照下方解析自查错点'}
          </p>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}
        className="card !rounded-[24px] overflow-hidden">
        <div className="border-b border-line-2 px-8 pb-5 pt-7"
          style={{ background: 'linear-gradient(150deg, var(--color-paper-2), #fff 70%)' }}>
          <div className="flex items-center gap-4">
            <span className="rx-badge">Rx</span>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-3">答案解析 · 考点与机制</p>
              <p className="mt-0.5 text-[13px] text-ink-2">
                四分类错因诊断在标注域题目上提供完整流程；本题展示教材锚点解析供自查
              </p>
            </div>
          </div>
        </div>
        <div className="p-8">
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{feedback.analysis || '（该题暂无解析文本）'}</p>
          {feedback.source && (
            <p className="mt-5 flex items-center gap-1.5 rounded-xl border border-line-2 bg-paper px-4 py-3 text-xs text-ink-3">
              <BookOpenText size={15} className="flex-none text-primary" />
              解析来源：{feedback.source}
            </p>
          )}
          <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function DiagnosisPanel({ diagnosis, questionId, onRefresh, onStartTraining, onExit, onError, onAskAi }: {
  diagnosis: Diagnosis; questionId: string; onRefresh: (id: string) => void
  onStartTraining: () => void; onExit: () => void; onError: (m: string) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
}) {
  const [answering, setAnswering] = useState(false)
  const [showEvidence, setShowEvidence] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showFollowup, setShowFollowup] = useState(false)
  const [openAnalysis, setOpenAnalysis] = useState(false)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  useEffect(() => {
    if (diagnosis.is_correct) {
      api.questionAnalysis(questionId).then(setAnalysis).catch((e) => onError(String(e)))
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
            {/* 假设性错因诊断卡（与真实诊断卡同构） */}
            {analysis?.primary && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary-soft/60 p-5 mb-5">
                <div className="flex flex-wrap items-center gap-3">
                  <CategoryTag category={analysis.primary.category} />
                  <p className="text-[15px] font-semibold">假设性主要错因（假设误选 {analysis.primary.option} {analysis.primary.option_text}）</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{analysis.primary.misconception}</p>
                <p className="mt-3 text-xs text-ink-3">
                  真实练习中：若你在后续同域题目上同样在这个干扰项出错，系统即确认此归因并出具完整诊断。
                </p>
              </div>
            )}

            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule" />候选错因（其余错误选项对应的典型误区）
            </p>
            <div className="space-y-2.5">
              {(analysis?.analysis ?? []).filter((a) => a.option !== analysis?.primary?.option).map((a) => (
                <div key={a.option} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line-2 bg-white px-4 py-3 text-sm text-ink-2">
                  <span className="grid size-6 flex-none place-items-center rounded-full border border-line text-xs font-bold">{a.option}</span>
                  <span className="font-medium">{a.option_text}</span>
                  <span className="ml-auto"><CategoryTag category={a.category} /></span>
                </div>
              ))}
            </div>

            <p className="mb-3 mt-6 flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="capsule gold" />衔接追问 · 若进入追问，系统将依次提出（真实练习中为交互对话）
            </p>
            <div className="space-y-3">
              {(analysis?.followups ?? []).map((f, i) => (
                <div key={i} className="rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-3 text-sm">
                  <p className="text-[11px] font-semibold text-ink-3 mb-1">第 {i + 1} 轮追问</p>
                  <p className="leading-relaxed">{f.question_text}</p>
                  {f.options && (
                    <p className="mt-1.5 text-xs text-ink-3">选项：{f.options.map((o) => `${o.key}. ${o.text}`).join('　')}</p>
                  )}
                </div>
              ))}
              {(analysis?.followups ?? []).length === 0 && (
                <p className="text-xs text-ink-3">该错因暂无预置追问，将直接进入靶向训练。</p>
              )}
            </div>

            <button onClick={onExit} className="btn btn-primary mt-7">返回今日待办</button>
          </div>
        </motion.div>
      )}

      {/* 追问对话记录：始终展示，提交后不随 followup 清空而整体消失 */}
      {!diagnosis.is_correct && diagnosis.followup_count > 0 && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold text-ink-3">
            <span className="size-2 rounded-full bg-primary" />定向追问记录 · 定位你的理解缺口
          </p>
          <div className="space-y-3">
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
          </div>
          {/* 追问已结束：明确给出 AI 结论，而不是让整段对话消失 */}
          {!diagnosis.followup && diagnosis.card && (
            <div className="mt-4 rounded-2xl rounded-tl-sm border border-line-2 bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-2">
              {diagnosis.card.evidence_level === '高'
                ? `追问已坐实归因「${diagnosis.card.misconception.category}」，证据等级提升为 高，可据此开具靶向训练。`
                : `已根据你前 ${diagnosis.followup_count} 轮回答完成追问，当前归因维持为「${diagnosis.card.misconception.category}」，证据等级：低。可据此开具靶向训练，或稍后再细化。`}
            </div>
          )}
        </motion.div>
      )}

      {/* 进行中的追问问题 + 作答 */}
      {!diagnosis.is_correct && showFollowup && diagnosis.followup && (
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="card p-8">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
              <span className="size-2 rounded-full bg-primary breath" />药知向你提问
            </p>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: diagnosis.followup.turn_max }).map((_, i) => (
                <span key={i} className={`size-1.5 rounded-full ${i < diagnosis.followup_count + 1 ? 'bg-primary' : 'bg-line'}`} />
              ))}
              <span className="ml-1 text-xs text-ink-3">第 {diagnosis.followup_count + 1} / {diagnosis.followup.turn_max} 轮</span>
            </div>
          </div>
          <div className="mb-6 flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-primary/40 bg-primary-soft px-4.5 py-3">
              <p className="display text-[15px] leading-relaxed">{diagnosis.followup.question_text}</p>
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
              className="btn text-[13px] text-ink-3 hover:text-ink">收起追问</button>
          </div>
        </motion.div>
      )}

      {!diagnosis.is_correct && diagnosis.card?.can_refine && !showFollowup && diagnosis.followup && (
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

            {diagnosis.card.ai_rationale && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft/70 px-5 py-4 shadow-sm">
                <p className="flex items-center gap-1.5 text-[11.5px] font-bold tracking-wide text-primary">
                  <Sparkle size={14} weight="fill" />AI 导师临床归因剖析 · 大模型智能推理
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                  {diagnosis.card.ai_rationale}
                </p>
                <p className="mt-2 text-[11px] text-ink-3">
                  由 GLM-5.2 基于题干考点、选项药理机制与作答思维链深度比对生成
                </p>
              </motion.div>
            )}

            {diagnosis.card.case_evidence && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring}
                className="mt-4 rounded-2xl border-2 border-gold/25 bg-gold-soft/40 px-5 py-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-gold">
                  <Pill size={13} weight="fill" />临床案例 · 帮你记住这个错因
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink">{diagnosis.card.case_evidence.scenario}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">
                  <span className="font-semibold text-ink">记：</span>{diagnosis.card.case_evidence.lesson}
                </p>
                <p className="mt-2 text-[11px] text-ink-3">来源 · {diagnosis.card.case_evidence.source}</p>
              </motion.div>
            )}
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
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={onStartTraining} className="btn btn-primary">
                  按此诊断开具靶向训练<ArrowRight size={15} weight="bold" />
                </button>
                {onAskAi && diagnosis.card && (
                  <button
                    onClick={() => {
                      const card = diagnosis.card
                      if (!card) return
                      const ctx = `错因诊断卡：
类别：${card.misconception.category}
错因：${card.misconception.name}
证据等级：${card.evidence_level}
${card.ai_rationale ? `AI 归因剖析：${card.ai_rationale}` : ''}
${card.case_evidence ? `临床案例：${card.case_evidence.scenario} (要点：${card.case_evidence.lesson})` : ''}`
                      onAskAi(ctx, `我想进一步了解「${card.misconception.name}」相关的药理机制与典型考题辨析，请结合临床案例为我深度拆解。`, questionId)
                    }}
                    className="btn rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300"
                  >
                    <ChatCircleText size={16} weight="bold" className="text-sky-500" />
                    💬 针对此错因向 AI 追问
                  </button>
                )}
                <button onClick={onExit} className="btn rounded-full border border-line bg-white px-5 py-3 text-sm text-ink-2 transition hover:border-primary hover:text-primary">
                  稍后训练，返回待办
                </button>
              </div>
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
