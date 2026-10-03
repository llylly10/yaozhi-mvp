import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence, MotionConfig, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion'
import { MagnifyingGlass, ArrowRight, ArrowUp, Pill, CalendarBlank, ClockCounterClockwise, SquaresFour, Gear, BookOpenText, ChatCircle, Sparkle, ShareNetwork, FirstAid } from '@phosphor-icons/react'
import { api, clearAuth, type Diagnosis, type Question } from './api'
import { ToastProvider, useToast } from './Toast'
import { ClinicalCaseView } from './ClinicalCaseView'
import { CommandSearchModal } from './CommandSearchModal'
import { CustomQuizView } from './CustomQuizView'
import { EvalBenchmarkModal } from './EvalBenchmarkModal'
import { SettingsModal } from './SettingsModal'
import { Hex } from './components/ui'
import { daysToExam, resolveExamDate, spring, type PortraitResult, type Screen, type View } from './lib/shared'
import { Assessment } from './views/Assessment'
import { Consent } from './views/Consent'
import { GoalPicker } from './views/GoalPicker'
import { LearningPathHome } from './views/LearningPathHome'
import { MaterialRoute } from './views/Material'
import { Portrait } from './views/Portrait'
import { PracticeFlow } from './views/PracticeFlow'
import { Profile } from './views/Profile'
import { QAView } from './views/QAView'
import { StudyMapOnboard } from './views/StudyMapOnboard'
import { Welcome } from './views/Welcome'
import { WrongBook } from './views/WrongBook'
/*
 * 药知 · 「现代药房 × 分子美学」
 * 流程（对齐产品原型）：注册 → 同意 → 题库(今日待办) → 作答 → 诊断 → 追问 → 训练 → 档案
 * 布局：通栏玻璃步骤轨 + 左侧学习栏 + 内容区
 */

// v3（2026-09-28）：鉴权上线后凭据体系升级（uid+token），旧缓存无 token，强制一次重新进入
const USER_KEY = 'yaozhi_user_id_v3'

// ---- 考期倒计时（2026-09-29 做真：此前头部胶囊是硬编码「D-38」纯装饰）----
const GOAL_KEY = 'yaozhi_goal'           // 备考目标持久化（此前刷新即丢，考期预设会跟着丢）
const EXAM_DATE_KEY = 'yaozhi_exam_date' // 用户自定义考期（ISO yyyy-mm-dd），优先于目标预设

/* 考期预设：仅配全国统一考期的目标；日期以当年官方公告为准（执业药师约每年 10 月中旬） */
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  )
}

function AppInner() {
  const toast = useToast()
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_KEY))
  // 核心主入口：已登录用户默认直入「全景知识地图」大本营
  const [screen, setScreen] = useState<Screen>(() => (localStorage.getItem(USER_KEY) ? 'study' : 'register'))
  const [view, setView] = useState<View>('study')
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [goal, setGoal] = useState<string>(() => localStorage.getItem(GOAL_KEY) || '期末冲绩')
  const [examDate, setExamDate] = useState<string>(() => localStorage.getItem(EXAM_DATE_KEY) || '')
  const examInfo = resolveExamDate(goal, examDate)
  const examDays = examInfo ? daysToExam(examInfo.iso) : NaN

  const handleExamDate = (iso: string) => {
    setExamDate(iso)
    if (iso) localStorage.setItem(EXAM_DATE_KEY, iso)
    else localStorage.removeItem(EXAM_DATE_KEY)
  }
  const [portrait, setPortrait] = useState<PortraitResult | null>(null)
  const [materialDomain, setMaterialDomain] = useState<string | null>(null)
  const [showEvalModal, setShowEvalModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [qaPrefill, setQaPrefill] = useState<{ context?: string; question?: string } | null>(null)
  const [showCommandModal, setShowCommandModal] = useState(false)

  // 全局快捷键 ⌘K / Ctrl+K 唤起药理指令控制台
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandModal((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // 主壳（可切换视图的页面：全景知识地图/今日待办/错题本/问AI/档案/自适应组卷/临床沙盘）
  const isShell = screen === 'study' || screen === 'list' || screen === 'profile' || screen === 'qa' || screen === 'custom_quiz' || screen === 'clinical_cases'
  const isDedicatedHub = screen === 'clinical_cases' || screen === 'custom_quiz' || screen === 'qa' || screen === 'profile' || screen === 'list'

  function goNav(v: View) {
    setError(null); setView(v)
    if (v === 'study') {
      setScreen('study')
    } else if (v === 'todo') {
      setScreen('list')
    } else if (v === 'qa') {
      setScreen('qa')
    } else if (v === 'custom_quiz') {
      setScreen('custom_quiz')
    } else if (v === 'clinical_cases') {
      setScreen('clinical_cases')
    } else if (v === 'wrongbook') {
      setScreen('profile')
    } else if (v === 'profile') {
      setScreen('profile')
    }
    setActiveQuestion(null)
    window.scrollTo(0, 0)
  }

  function handleAskAi(context: string, defaultQ?: string) {
    toast.info('已提取考点与错因上下文，正在跳转「问 AI」...')
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
      // 老用户重新登录：跳过知情同意，直接直入「全景知识地图」核心主页
      setScreen('study')
      setView('study')
    } else {
      setScreen('consent')
    }
  }
  function onConsented() {
    setScreen('goal')
  }
  function logout() {
    api.logoutServer()  // 撤销服务端 token（须在清本地凭据前发出；失败静默）
    clearAuth()
    localStorage.removeItem(USER_KEY)
    setUserId(null); setScreen('register'); setActiveQuestion(null); setDiagnosis(null); setView('study')
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

  // 顶栏与侧边栏显示范围：仅在主学习壳与流转界面显示；onboarding(注册/知情同意/目标/摸底答题/摸底画像)保持纯净全屏引导，避免侧边栏干扰与误高亮
  const showSidebar = ['study', 'list', 'flow', 'profile', 'material', 'qa', 'custom_quiz', 'clinical_cases'].includes(screen)
  const inLearning = showSidebar

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

  return (
    <MotionConfig reducedMotion="user">
    <div className="relative min-h-[100dvh]">
      <div className="ambient" aria-hidden />
      <MolField />

      {/* 顶栏品牌与极简导航（突出全景地图核心主线与备考目标） */}
      {inLearning && (
        <header className="sticky top-0 z-30 glass border-x-0 border-t-0 !rounded-none px-5 py-2.5 backdrop-blur-md">
          <div className={`mx-auto flex w-full ${screen === 'study' ? 'max-w-[1560px] xl:max-w-[1640px]' : 'max-w-[1240px]'} items-center justify-between transition-all duration-300`}>
            {/* 左侧：Logo + 药知 + 备考目标胶囊 */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => goNav('study')}
                title="返回全景知识地图首页"
              >
                <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-focus text-white shadow-sm shadow-primary/25">
                  <Pill size={16} weight="fill" />
                </span>
                <span className="font-serif text-[16px] font-bold text-ink">药知</span>
                <span className="rounded-full border border-gold/40 bg-gold-soft px-2 py-0.5 text-[10px] font-semibold text-gold">v1.0</span>
              </div>
              <div
                onClick={() => setScreen('goal')}
                className="hidden sm:flex items-center gap-1.5 rounded-full border border-line bg-paper-1/70 px-2.5 py-1 text-xs text-ink-2 hover:border-primary/40 cursor-pointer transition"
                title="点击修改备考目标"
              >
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>备考目标：<strong className="font-medium text-ink">{goal || '执业西药师'}</strong></span>
              </div>
              {/* 考期倒计时（真实日期：自定义 > 目标预设；备考目标页设置。无考期时常驻「未设」占位，不隐藏） */}
              {examInfo && Number.isFinite(examDays) ? (
                <div
                  onClick={() => setScreen('goal')}
                  title={`目标考期：${examInfo.label} ${examInfo.iso} · 点击修改`}
                  className="hidden xl:flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-50/70 px-2.5 py-1 text-[11px] font-semibold text-amber-900 cursor-pointer transition hover:border-amber-500/50"
                >
                  <ClockCounterClockwise size={12} className="text-amber-600" />
                  <span>{examInfo.short}倒计：<strong>{examDays > 0 ? `D-${examDays}` : examDays === 0 ? '今日' : '已结束'}</strong></span>
                </div>
              ) : (
                <div
                  onClick={() => setScreen('goal')}
                  title="在「备考目标」页设置考期后，此处显示真实倒计时"
                  className="hidden xl:flex items-center gap-1 rounded-full border border-line bg-paper-1/70 px-2.5 py-1 text-[11px] font-medium text-ink-3 cursor-pointer transition hover:border-primary/40"
                >
                  <ClockCounterClockwise size={12} />
                  <span>考期未设</span>
                </div>
              )}
            </div>

            {/* 中间：智能流转轨（做题时显示 4 步轨迹；子模块显示当前模块与返回知识地图按钮；全景知识地图主页保持呼吸感） */}
            {screen === 'flow' ? (
              <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft/60 px-3.5 py-1 text-xs text-primary font-medium shadow-xs">
                <span className="flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${!diagnosis ? 'bg-primary ring-2 ring-primary/30' : 'bg-primary/50'}`} />
                  ① 作答
                </span>
                <span className="text-[10px] text-primary/40">▸</span>
                <span className="flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${diagnosis?.state === 'diagnosed' || diagnosis?.state === 'followup_required' ? 'bg-primary ring-2 ring-primary/30' : 'bg-primary/50'}`} />
                  ② 诊断
                </span>
                <span className="text-[10px] text-primary/40">▸</span>
                <span className="flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${diagnosis?.state === 'training' ? 'bg-primary ring-2 ring-primary/30' : 'bg-primary/50'}`} />
                  ③ 强化
                </span>
                <span className="text-[10px] text-primary/40">▸</span>
                <span className="flex items-center gap-1">
                  <span className={`size-1.5 rounded-full ${diagnosis?.state === 'retesting' ? 'bg-primary ring-2 ring-primary/30' : 'bg-primary/50'}`} />
                  ④ 复测
                </span>
              </div>
            ) : screen !== 'study' && isDedicatedHub ? (
              <div className="hidden md:flex items-center gap-2 text-xs text-ink-2">
                <span className="font-semibold text-ink flex items-center gap-1.5">
                  {screen === 'list' && <><CalendarBlank size={14} className="text-primary" /> 今日待办 · 自适应任务路径</>}
                  {screen === 'clinical_cases' && <><FirstAid size={14} className="text-rose-600" /> 临床病例沙盘 · 16套权威住院病历审核</>}
                  {screen === 'custom_quiz' && <><BookOpenText size={14} className="text-primary" /> 自适应模考 · 723题动态组卷</>}
                  {screen === 'qa' && <><ChatCircle size={14} className="text-sky-600" /> 问 AI 药学助教 · 双路检索与思考链</>}
                  {screen === 'profile' && view === 'wrongbook' && <><ClockCounterClockwise size={14} className="text-amber-600" /> 错题本 · 艾宾浩斯抗遗忘小册</>}
                  {screen === 'profile' && view === 'profile' && <><SquaresFour size={14} className="text-primary" /> 学习档案 · 贝叶斯能力全景画像</>}
                </span>
                <button
                  onClick={() => goNav('study')}
                  className="ml-2 flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-0.5 text-[11px] text-ink-3 hover:border-primary hover:text-primary transition cursor-pointer"
                  title="返回全景知识地图首页"
                >
                  <ArrowRight size={11} className="rotate-180" />
                  返回知识地图
                </button>
              </div>
            ) : null}

            {/* 右侧：⌘K 全局速查 + 算法评测 + 设置 + 退出 */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowCommandModal(true)}
                className="hidden lg:flex items-center gap-2 rounded-xl border border-line bg-white/90 px-3 py-1 text-xs text-ink-3 hover:border-primary/50 hover:bg-white hover:text-ink transition cursor-pointer shadow-2xs"
                title="快捷键 ⌘K / Ctrl+K 全局药理指令检索"
              >
                <MagnifyingGlass size={13} className="text-primary" />
                <span className="text-[11.5px] font-medium">速查药物/靶点...</span>
                <kbd className="rounded bg-paper border border-line px-1.5 py-0.2 text-[10px] font-mono text-ink-3 font-semibold">⌘K</kbd>
              </button>
              <button
                onClick={() => setShowEvalModal(true)}
                className="btn flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary-soft/60 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary-soft hover:shadow-xs"
                title="查看错因诊断保护测试集三级红线门禁与混淆矩阵"
              >
                <Sparkle size={13} weight="fill" />
                <span className="hidden sm:inline">算法评测</span>
              </button>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="btn rounded-full p-1.5 text-ink-3 hover:bg-paper-2 hover:text-ink transition"
                title="系统设置与隐私中心"
              >
                <Gear size={15} />
              </button>
              <button
                onClick={logout}
                className="btn rounded-full px-2.5 py-1 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink transition"
              >
                退出
              </button>
            </div>
          </div>
        </header>
      )}

      <div className={`relative z-10 mx-auto flex w-full ${screen === 'study' ? 'max-w-[1560px] xl:max-w-[1640px]' : 'max-w-[1240px]'} gap-6 px-4 sm:px-6 pb-32 lg:pb-16 pt-6 transition-all duration-300`}>
        {/* 左侧学习栏（在全景地图与主要学习场景呈现，onboarding流保持聚焦无侧栏） */}
        {showSidebar && (
          <Sidebar
            view={view}
            currentScreen={screen}
            onNav={goNav}
            onOpenSettings={() => setShowSettingsModal(true)}
          />
        )}

        <div className="min-w-0 flex-1">
          {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <AnimatePresence mode="wait">
            {screen === 'register' && <Welcome key="register" onRegistered={onRegistered} onError={setError} onOpenEval={() => setShowEvalModal(true)} />}
            {screen === 'consent' && userId && <Consent key="consent" userId={userId} onConsented={onConsented} onBack={() => setScreen('register')} onError={setError} />}
            {screen === 'goal' && (
              <GoalPicker key="goal" goal={goal} isSubPage={Boolean(userId)}
                examDate={examDate} onExamDate={handleExamDate}
                onNext={(g) => { setGoal(g); localStorage.setItem(GOAL_KEY, g); setScreen('study'); setView('study') }}
                onBack={() => setScreen(userId ? 'study' : 'consent')} />
            )}
            {screen === 'study' && userId && (
              <StudyMapOnboard key="study" userId={userId} goal={goal} onError={setError}
                onProceed={() => setScreen('assessment')}
                onSkip={() => setScreen('assessment')}
                onBack={() => setScreen('goal')}
                onGoTodo={() => goNav('todo')}
                onGoQuiz={() => goNav('custom_quiz')}
                onAskAi={handleAskAi} />
            )}
            {screen === 'assessment' && userId && (
              <Assessment key="assess" userId={userId}
                onDone={(r) => { setPortrait(r); setScreen('portrait') }} onError={setError}
                onBack={() => setScreen('study')} />
            )}
            {screen === 'portrait' && portrait && (
              <Portrait key="portrait" result={portrait}
                onEnter={() => { setError(null); setScreen('study'); setView('study') }}
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
              <Profile key="profile" userId={userId} onGoTodo={() => goNav('todo')} onAskAi={handleAskAi} />
            )}
            {screen === 'profile' && userId && view === 'wrongbook' && (
              <WrongBook key="wrongbook" userId={userId} onGoTodo={() => goNav('todo')} onAskAi={handleAskAi} onGoMap={() => { setActiveQuestion(null); setScreen('study'); window.scrollTo(0, 0); }} />
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

      {/* 移动端底部导航（仅主壳显示）+ 充足留白防遮挡 */}
      {isShell && (
        <>
          <div className="h-28 lg:hidden" aria-hidden />
          <MobileTab current={{ screen, view }} onNav={goNav} />
        </>
      )}
      <BackToTop />
      {showEvalModal && <EvalBenchmarkModal onClose={() => setShowEvalModal(false)} />}
      <CommandSearchModal
        isOpen={showCommandModal}
        onClose={() => setShowCommandModal(false)}
        onNavigate={(v) => goNav(v as View)}
        onAskAi={handleAskAi}
      />
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

function Sidebar({ view, currentScreen, onNav, onOpenSettings }: {
  view: View; currentScreen?: Screen; onNav: (v: View) => void; onOpenSettings?: () => void
}) {
  const item = (v: View, label: string, icon: React.ReactNode, isActive: boolean) => (
    <button key={v + label} onClick={() => onNav(v)}
      className={`btn relative !justify-start w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-[13.5px] transition-all cursor-pointer
        ${isActive ? 'font-bold text-primary' : 'font-medium text-ink-2 hover:bg-paper-2 hover:text-ink'}`}>
      {isActive && (
        <motion.span layoutId="side-active" transition={spring}
          className="absolute inset-0 rounded-xl bg-primary-soft border border-primary/25 shadow-2xs" aria-hidden />
      )}
      <span className="relative z-10 flex items-center gap-2.5">{icon}{label}</span>
    </button>
  )
  return (
    <aside className="hidden w-[205px] flex-none lg:block">
      <div className="glass liquid sticky top-[68px] space-y-3.5 rounded-[22px] p-3 border border-line/60 shadow-xs">
        <div>
          <p className="mb-1.5 px-3 text-[11px] font-bold text-ink-3 uppercase tracking-wider">核心总览</p>
          <div className="space-y-0.5">
            {item('study', '全景知识地图', <ShareNetwork size={16} weight="bold" />, currentScreen === 'study')}
          </div>
        </div>

        <div className="border-t border-line/50 pt-3">
          <p className="mb-1.5 px-3 text-[11px] font-bold text-ink-3 uppercase tracking-wider">日常学习</p>
          <div className="space-y-0.5">
            {item('todo', '今日待办', <CalendarBlank size={16} weight="bold" />, currentScreen === 'list' && view === 'todo')}
            {item('wrongbook', '错题本', <ClockCounterClockwise size={16} weight="bold" />, currentScreen === 'profile' && view === 'wrongbook')}
            {item('qa', '问AI 助教', <ChatCircle size={16} weight="bold" />, currentScreen === 'qa')}
          </div>
        </div>

        <div className="border-t border-line/50 pt-3">
          <p className="mb-1.5 px-3 text-[11px] font-bold text-ink-3 uppercase tracking-wider">实战进阶</p>
          <div className="space-y-0.5">
            {item('clinical_cases', '临床沙盘', <FirstAid size={16} weight="bold" />, currentScreen === 'clinical_cases')}
            {item('custom_quiz', '自适应模考', <BookOpenText size={16} weight="bold" />, currentScreen === 'custom_quiz')}
          </div>
        </div>

        <div className="border-t border-line/50 pt-3">
          <p className="mb-1.5 px-3 text-[11px] font-bold text-ink-3 uppercase tracking-wider">学情分析</p>
          <div className="space-y-0.5">
            {item('profile', '学习档案', <SquaresFour size={16} weight="bold" />, currentScreen === 'profile' && view === 'profile')}
          </div>
        </div>

        <div className="border-t border-line/50 pt-2.5">
          <button
            onClick={onOpenSettings}
            className="btn !justify-start w-full items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs text-ink-3 hover:bg-paper-2 hover:text-ink transition-colors cursor-pointer"
          >
            <Gear size={14} />隐私与设置
          </button>
        </div>
      </div>
    </aside>
  )
}

/* 移动端底部导航：窄屏(<lg)时左侧学习栏不可见，用底部 Tab 切换入口 */
function MobileTab({ current, onNav }: { current: { screen: Screen; view: View }; onNav: (v: View) => void }) {
  const active = (screen: Screen, view: View) => {
    if (screen === 'study') return current.screen === 'study'
    return current.screen === screen && current.view === view
  }
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
        {tab('study', '知识地图', <ShareNetwork size={19} />, 'study')}
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


// 真错因（排除「待诊断」占位）；与错题本 / 档案页共用同一定义与配色