import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, MotionConfig, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion'
import { CheckCircle, XCircle, Warning, MagnifyingGlass, SkipForward, ArrowRight, ArrowUp, CaretDown, Pill, CalendarBlank, ClockCounterClockwise, SquaresFour, Gear, BookOpenText, ChatCircle, ChatCircleText, Lightning, Hourglass, Sparkle, ShareNetwork, FirstAid, Printer } from '@phosphor-icons/react'
import { api, clearAuth, type Diagnosis, type Question, type TikuFeedback } from './api'
import { ToastProvider, useToast } from './Toast'
import { ClinicalCaseView } from './ClinicalCaseView'
import { CommandSearchModal } from './CommandSearchModal'
import { CustomQuizView } from './CustomQuizView'
import { EvalBenchmarkModal } from './EvalBenchmarkModal'
import { SettingsModal } from './SettingsModal'
import { WrongBookExportModal } from './WrongBookExportModal'
import { CategoryTag, EvidenceNote, Hex, NodeChip } from './components/ui'
import { Cconst, Rconst, daysToExam, genUUID, resolveExamDate, spring, type KgEdgeT, type KgEvidence, type KgNodeT, type PortraitResult, type Screen, type View } from './lib/shared'
import { Assessment } from './views/Assessment'
import { Consent } from './views/Consent'
import { GoalPicker } from './views/GoalPicker'
import { KnowledgeGraphView } from './views/KnowledgeGraphView'
import { LearningPathHome } from './views/LearningPathHome'
import { MaterialRoute } from './views/Material'
import { Portrait } from './views/Portrait'
import { Profile } from './views/Profile'
import { QAView } from './views/QAView'
import { StudyMapOnboard } from './views/StudyMapOnboard'
import { Welcome } from './views/Welcome'
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

function WrongBook({ userId, onGoTodo, onAskAi, onGoMap }: { userId: string; onGoTodo: () => void; onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void; onGoMap?: () => void }) {
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
              onAwaken={(aid) => setAwakenAttemptId(aid)} onAskAi={onAskAi} onGoMap={onGoMap} />
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
function WrongGroups({ wrong, openId, loadingRecall, recallMap, onToggle, onAwaken, onAskAi, onGoMap }: {
  wrong: WrongRow[]; openId: string | null; loadingRecall: string | null
  recallMap: Record<string, RecallData | null>; onToggle: (id: string) => void
  onAwaken: (attemptId: string) => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
  onGoMap?: () => void
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
                          {onGoMap && (
                            <button
                              type="button"
                              onClick={onGoMap}
                              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/60 px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary hover:text-white"
                              title="在全景知识图谱中定位该题所属药理章节与易混淆对"
                            >
                              <ShareNetwork size={13} weight="bold" />
                              在全景图谱中溯源
                            </button>
                          )}
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


/** 确定性分层轨道坐标：BFS 定层，子节点按父角扇形展开。返回 positions + angles（弧度）。
    规则：直连中心的药物统一移到外环整圆均分（内环只留结构节点，避免 40 点挤一环）。 */
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
          <p className="display mt-4 text-[20px] md:text-[21px] font-bold text-ink leading-relaxed tracking-normal">{question.stem}</p>
        </div>
        <div className="p-8 pt-6">
          <div className="space-y-3">
            {question.options.map((o) => (
              <motion.button key={o.key} onClick={() => setSelected(o.key)} whileTap={{ scale: 0.99 }}
                className={`relative w-full rounded-2xl border px-5 py-4 text-left text-sm transition-colors duration-150 cursor-pointer
                  ${selected === o.key ? 'border-primary bg-primary-soft/85 shadow-xs font-semibold' : 'border-line bg-white hover:border-ink-3/40 hover:bg-paper-2/40'}`}>
                <span className="relative z-10 flex items-center gap-3.5">
                  <span className={`grid size-7.5 flex-none place-items-center rounded-full border text-xs font-black transition-colors duration-150
                    ${selected === o.key ? 'border-primary bg-primary text-white shadow-xs' : 'border-line text-ink-2 bg-white'}`}>
                    {o.key}
                  </span>
                  <span className={selected === o.key ? 'font-bold text-ink text-[15px]' : 'text-ink-2 text-[14.5px]'}>{o.text}</span>
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
            isCorrect={tikuFeedback.is_correct} question={question} onExit={onExit} onAskAi={onAskAi} />
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
function TikuFeedbackCard({ feedback, isCorrect, question, onExit, onAskAi }: {
  feedback: TikuFeedback; isCorrect: boolean; question: Question; onExit: () => void
  onAskAi?: (ctx: string, defaultQ?: string, qid?: string) => void
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
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button onClick={onExit} className="btn btn-primary">返回今日待办</button>
            {onAskAi && !isCorrect && (
              <button
                type="button"
                onClick={() => {
                  const ctx = `题库考题：
章节：${feedback.chapter_name || question.chapter_name || '药理学'}
题目：${question.stem}
解析依据：${feedback.analysis || '暂无详细文本'}
出处：${feedback.source || '人卫第9版教材考纲'}`
                  onAskAi(ctx, `关于该题考查的 ${feedback.chapter_name || '药理'} 考点，请老师帮我详细剖析核心药理机制与临床易混淆点。`, question.id)
                }}
                className="btn rounded-full border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-500/20 dark:text-sky-300 flex items-center gap-1.5"
              >
                <ChatCircleText size={15} weight="bold" className="text-sky-500" />
                💬 针对此题向 AI 追问
              </button>
            )}
          </div>
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
              <p className="text-[17px] font-bold text-ink">{diagnosis.card.misconception.name}</p>
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
                  由 Qwen 3.7 Flash 基于题干考点、选项药理机制与作答思维链深度比对生成
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
