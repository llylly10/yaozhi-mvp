import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MagnifyingGlass, X, Pill, BookOpenText, SquaresFour, ArrowRight
} from '@phosphor-icons/react'

export interface SearchItem {
  id: string
  title: string
  subtitle: string
  category: '章节' | '药物实体' | '受体靶点' | '系统模块'
  badge?: string
  action: () => void
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelectChapter?: (domainId: string) => void
  onNavigate?: (view: string) => void
  onAskAi?: (context: string, question: string) => void
}

export function CommandSearchModal({ isOpen, onClose, onSelectChapter, onNavigate, onAskAi }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 预置专业药理知识检索库（覆盖考研与执考核心高频实体）
  const allItems: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [
      // 模块级
      {
        id: 'mod-cases',
        title: '临床沙盘 (Clinical Sandbox)',
        subtitle: '16 套三甲医院权威住院病历 · 审方与配伍禁忌',
        category: '系统模块',
        badge: '全真演练',
        action: () => { onNavigate?.('clinical_cases'); onClose() },
      },
      {
        id: 'mod-todo',
        title: '今日自适应练习 (Daily Tasks)',
        subtitle: 'BKT 认知状态追踪推荐路径',
        category: '系统模块',
        badge: '自适应',
        action: () => { onNavigate?.('todo'); onClose() },
      },
      {
        id: 'mod-quiz',
        title: '自适应模考组卷 (Adaptive Exam)',
        subtitle: '723 题多维知识点动态模考',
        category: '系统模块',
        badge: '全真模拟',
        action: () => { onNavigate?.('custom_quiz'); onClose() },
      },
      {
        id: 'mod-wrongbook',
        title: '错题本 (Memory Mistake Book)',
        subtitle: '艾宾浩斯抗遗忘小册与错因归因卡',
        category: '系统模块',
        badge: '复习',
        action: () => { onNavigate?.('wrongbook'); onClose() },
      },
      {
        id: 'mod-ai',
        title: '问 AI 药学助教 (AI Tutor)',
        subtitle: '双路药理知识库检索与思考链推理',
        category: '系统模块',
        badge: '智能答疑',
        action: () => { onNavigate?.('qa'); onClose() },
      },

      // 核心药物实体与易混药对
      {
        id: 'drug-ne',
        title: '去甲肾上腺素 (Noradrenaline / NE)',
        subtitle: 'α1、α2、微弱β1激动剂 · 强缩血管 · 早期神经性/休克升压 · 忌外漏致局部坏死',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-ad',
        title: '肾上腺素 (Adrenaline / AD / 负交感逆转)',
        subtitle: 'α与β受体全激动剂 · 强心/扩支/升压 · 过敏性休克一线首选 · 酚妥拉明可引起翻转',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-da',
        title: '多巴胺 (Dopamine / DA)',
        subtitle: '小剂量激活D1扩肾血管，中剂量激动β1强心，大剂量激动α缩血管 · 感染性休克伴少尿首选',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-iso',
        title: '异丙肾上腺素 (Isoprenaline / ISO)',
        subtitle: '选择性β1、β2纯激动剂 · 心脏兴奋/支气管舒张 · 房室传导阻滞与支气管哮喘急性发作',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-atropine',
        title: '阿托品 (Atropine / M 受体阻断剂)',
        subtitle: '竞争性阻断M胆碱受体 · 扩瞳/升心率/抑腺/解痉 · 有机磷酸酯类中毒特异性解救',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-pilocarpine',
        title: '毛果芸香碱 (Pilocarpine / 匹鲁卡品)',
        subtitle: 'M受体激动剂 · 缩瞳/降眼内压/调节痉挛 · 闭角型青光眼首选药',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-neostigmine',
        title: '新斯的明 (Neostigmine / 易逆性胆碱酯酶抑制剂)',
        subtitle: '抑制AChE，直接激动NM受体 · 骨骼肌兴奋作用极强 · 重症肌无力首选 · 忌用于机械性肠梗阻',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-pralidoxime',
        title: '碘解磷定 (Pralidoxime / 胆碱酯酶复活药)',
        subtitle: '肟基与磷酰化AChE结合脱去磷酰基，恢复AChE活性 · 有机磷中毒抢救早期足量使用',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-propranolol',
        title: '普萘洛尔 (Propranolol / 心得安)',
        subtitle: '非选择性β阻断剂(β1+β2) · 减慢心率/降心肌氧耗 · 支气管哮喘与重度房室传导阻滞绝对禁忌',
        category: '药物实体',
        badge: '传出神经',
        action: () => {
          onSelectChapter?.('domain_01_ans')
          onClose()
        },
      },
      {
        id: 'drug-nifedipine',
        title: '硝苯地平 (Nifedipine / 二氢吡啶类 CCB)',
        subtitle: '选择性阻滞L型钙通道 · 舒张动脉血管平滑肌 · 常见面红、头痛、踝部水肿及反射性交感激活',
        category: '药物实体',
        badge: '心血管',
        action: () => {
          onSelectChapter?.('domain_03_cvs')
          onClose()
        },
      },
      {
        id: 'drug-verapamil',
        title: '维拉帕米 (Verapamil / 异搏定)',
        subtitle: '非二氢吡啶类CCB · 显著抑制心肌与窦房结房室结传导 · 阵发性室上性心动过速(PSVT)首选',
        category: '药物实体',
        badge: '心血管',
        action: () => {
          onSelectChapter?.('domain_03_cvs')
          onClose()
        },
      },
      {
        id: 'drug-captopril',
        title: '卡托普利 (Captopril / ACEI 类降压药)',
        subtitle: '抑制血管紧张素转化酶，阻断缓激肽降解 · 顽固性干咳发生率高 · 妊娠期禁用',
        category: '药物实体',
        badge: '心血管',
        action: () => {
          onSelectChapter?.('domain_03_cvs')
          onClose()
        },
      },
      {
        id: 'drug-digoxin',
        title: '地高辛 (Digoxin / 强心苷)',
        subtitle: '抑制心肌细胞膜Na+-K+-ATP酶 · 正性肌力/负性频率 · 治疗窗窄(0.8-2.0ng/mL) · 低钾极易中毒',
        category: '药物实体',
        badge: '心血管',
        action: () => {
          onSelectChapter?.('domain_03_cvs')
          onClose()
        },
      },
      {
        id: 'drug-furosemide',
        title: '呋塞米 (Furosemide / 速尿)',
        subtitle: '髓袢升支粗段抑制Na+-K+-2Cl-同向转运体 · 强效利尿 · 警惕低血钾、低血钠与耳毒性',
        category: '药物实体',
        badge: '心血管',
        action: () => {
          onSelectChapter?.('domain_03_cvs')
          onClose()
        },
      },
      {
        id: 'drug-morphine',
        title: '吗啡 (Morphine / 阿片类镇痛药)',
        subtitle: '激动中枢阿片μ受体 · 强镇痛/镇静/镇咳 · 严重不良反应：呼吸抑制与便秘 · 纳洛酮特异性解救',
        category: '药物实体',
        badge: '中枢神经',
        action: () => {
          onSelectChapter?.('domain_02_cns')
          onClose()
        },
      },
      {
        id: 'drug-aspirin',
        title: '阿司匹林 (Aspirin / 乙酰水杨酸)',
        subtitle: '不可逆抑制COX-1/COX-2 · 小剂量(75-100mg)抗血小板聚集 · 大剂量解热镇痛抗炎 · 警惕雷氏综合征',
        category: '药物实体',
        badge: '中枢神经',
        action: () => {
          onSelectChapter?.('domain_02_cns')
          onClose()
        },
      },
      {
        id: 'drug-metformin',
        title: '二甲双胍 (Metformin / 双胍类降糖药)',
        subtitle: '激活AMPK，抑制肝糖原异生并改善外周胰岛素敏感性 · 2型糖尿病超重患者首选 · 严重肾功不全忌用',
        category: '药物实体',
        badge: '血液内分泌',
        action: () => {
          onSelectChapter?.('domain_04_blood')
          onClose()
        },
      },

      // 受体靶点
      {
        id: 'rec-alpha1',
        title: 'α1 肾上腺素受体 (Gq-PLC-IP3/DAG 通路)',
        subtitle: '血管平滑肌收缩、瞳孔开大肌收缩 · 典型激动剂：去甲肾上腺素/苯肾上腺素 · 阻断剂：酚妥拉明/哌唑嗪',
        category: '受体靶点',
        badge: '分子受体',
        action: () => {
          onAskAi?.('药理受体机制', '请详细讲解 α1 肾上腺素受体的细胞信号转导通路、效应器官分布与典型激动/阻断药物对比。')
          onClose()
        },
      },
      {
        id: 'rec-beta1',
        title: 'β1 肾上腺素受体 (Gs-cAMP-PKA 通路)',
        subtitle: '主要分布于心脏 · 正性肌力/正性频率/加速传导/促进肾素释放 · 典型阻断剂：美托洛尔/比索洛尔',
        category: '受体靶点',
        badge: '分子受体',
        action: () => {
          onAskAi?.('药理受体机制', '请详细讲解 β1 肾上腺素受体在心衰与高血压治疗中的调节机制，以及心选择性与非选择性β阻断剂的差异。')
          onClose()
        },
      },
      {
        id: 'rec-m3',
        title: 'M3 胆碱受体 (Gq 偶联受体)',
        subtitle: '外分泌腺分泌亢进、胃肠道与支气管平滑肌收缩、血管内皮释放NO扩血管 · 阿托品为非选择性阻断药',
        category: '受体靶点',
        badge: '分子受体',
        action: () => {
          onAskAi?.('药理受体机制', '请详细讲解 M3 胆碱受体的组织分布、生理效应及相关药物在青光眼、哮喘中的应用禁忌。')
          onClose()
        },
      },

      // 大纲核心章节
      {
        id: 'ch-ans-intro',
        title: '第 5 章 · 传出神经系统药理概论',
        subtitle: '乙酰胆碱与去甲肾上腺素合成、储存、释放与灭活 · 人卫9版 P42-50',
        category: '章节',
        badge: '大纲章节',
        action: () => { onSelectChapter?.('domain_01_ans'); onClose() },
      },
      {
        id: 'ch-ans-cholin',
        title: '第 6 章 · 胆碱受体激动药与抗胆碱酯酶药',
        subtitle: '毛果芸香碱、新斯的明、有机磷酸酯类中毒机制 · 专家示范重点章',
        category: '章节',
        badge: '示范章节',
        action: () => { onSelectChapter?.('domain_01_ans'); onClose() },
      },
      {
        id: 'ch-ans-anticholin',
        title: '第 8 章 · 胆碱受体阻断药 (阿托品类)',
        subtitle: '阿托品、山莨菪碱、东莨菪碱效应与禁忌症对比 · 执考必考考点',
        category: '章节',
        badge: '高频考点',
        action: () => { onSelectChapter?.('domain_01_ans'); onClose() },
      },
      {
        id: 'ch-ans-adren',
        title: '第 9 章 · 肾上腺素受体激动药 (去甲/肾上/异丙/多巴胺)',
        subtitle: 'α/β受体选择性与血流动力学效应对比 · 经典易混淆考题集聚地',
        category: '章节',
        badge: '示范章节',
        action: () => { onSelectChapter?.('domain_01_ans'); onClose() },
      },
      {
        id: 'ch-ans-antiadren',
        title: '第 10 章 · 肾上腺素受体阻断药 (酚妥拉明/普萘洛尔)',
        subtitle: '肾上腺素作用翻转现象 · β受体阻断药分类与禁忌症',
        category: '章节',
        badge: '大纲章节',
        action: () => { onSelectChapter?.('domain_01_ans'); onClose() },
      },
      {
        id: 'ch-cvs-ccb',
        title: '第 20 章 · 钙通道阻滞药 (CCB)',
        subtitle: '选择性L型钙通道阻滞剂(二氢吡啶类 vs 维拉帕米/地尔硫䓬)',
        category: '章节',
        badge: '心血管',
        action: () => { onSelectChapter?.('domain_03_cvs'); onClose() },
      },
      {
        id: 'ch-cvs-bp',
        title: '第 24 章 · 抗高血压药 (ACEI / ARB / 利尿剂 / β阻断)',
        subtitle: '一线降压五大类药物的作用机制、靶器官保护与禁忌症',
        category: '章节',
        badge: '示范章节',
        action: () => { onSelectChapter?.('domain_03_cvs'); onClose() },
      },
      {
        id: 'ch-chemo-beta',
        title: '第 37 章 · β-内酰胺类抗生素 (青霉素与头孢菌素)',
        subtitle: '抑制细胞壁黏肽合成 · 杀菌机制、耐药机制与过敏性休克抢救',
        category: '章节',
        badge: '化学治疗',
        action: () => { onSelectChapter?.('domain_05_chemo'); onClose() },
      },
    ]
    return items
  }, [onNavigate, onSelectChapter, onAskAi, onClose])

  // 模糊匹配过滤
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems.slice(0, 10)
    const q = query.trim().toLowerCase()
    return allItems.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(q)
      const subMatch = item.subtitle.toLowerCase().includes(q)
      const badgeMatch = item.badge?.toLowerCase().includes(q)
      return titleMatch || subMatch || badgeMatch
    })
  }, [allItems, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [filtered])

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // 键盘快捷键支持：上下切换、回车确认、ESC关闭
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filtered, selectedIndex, onClose])

  // 随选中项滚动列表
  useEffect(() => {
    const activeEl = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4">
          {/* 背景暗光毛玻璃遮罩 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-ink/60 backdrop-blur-md"
          />

          {/* 聚光灯居中指令面板 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-2xl backdrop-blur-xl ring-1 ring-black/5"
          >
            {/* 顶部搜索输入框 */}
            <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
              <span className="grid size-8 place-items-center rounded-xl bg-primary-soft text-primary">
                <MagnifyingGlass size={18} weight="bold" />
              </span>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="键入药名、靶点受体、大纲章节或首字母 (如: 去甲 / NE / beta2 / 钙拮抗)..."
                className="flex-1 bg-transparent text-[15px] font-medium text-ink placeholder:text-ink-3 outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="rounded-full p-1 text-ink-3 hover:bg-paper hover:text-ink transition cursor-pointer"
                >
                  <X size={15} />
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-ink-3">
                <kbd className="rounded bg-paper-2 border border-line px-1.5 py-0.5 shadow-2xs">ESC</kbd>
                <span>退出</span>
              </div>
            </div>

            {/* 结果列表 */}
            <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-3">
                  <Pill size={32} className="mx-auto mb-2 opacity-30 text-primary" />
                  <p>未找到匹配的药理实体或章节</p>
                  <p className="mt-1 text-xs text-ink-3">尝试输入：肾上腺素、阿托品、降压药、β受体...</p>
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const isSelected = idx === selectedIndex
                  return (
                    <div
                      key={item.id}
                      onClick={item.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 transition cursor-pointer ${
                        isSelected
                          ? 'bg-primary-soft/80 border border-primary/30 text-ink'
                          : 'hover:bg-paper-1/60 border border-transparent text-ink-2'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <span
                          className={`grid size-7 flex-none place-items-center rounded-lg text-xs font-bold ${
                            item.category === '药物实体'
                              ? 'bg-emerald-100 text-emerald-800'
                              : item.category === '受体靶点'
                              ? 'bg-blue-100 text-blue-800'
                              : item.category === '章节'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-purple-100 text-purple-900'
                          }`}
                        >
                          {item.category === '药物实体' ? <Pill size={14} /> :
                           item.category === '受体靶点' ? 'Ω' :
                           item.category === '章节' ? <BookOpenText size={14} /> : <SquaresFour size={14} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13.5px] font-bold text-ink">{item.title}</p>
                            {item.badge && (
                              <span className="rounded-full bg-paper px-2 py-0.2 text-[10.5px] font-semibold text-ink-3 border border-line">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-ink-3 mt-0.5">{item.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-none text-xs">
                        {isSelected ? (
                          <span className="flex items-center gap-1 rounded-md bg-white border border-primary/25 px-2 py-1 text-[11px] font-bold text-primary shadow-2xs">
                            跳转 <ArrowRight size={12} weight="bold" />
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-3">{item.category}</span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* 底部快捷键说明与 BKT 提示 */}
            <div className="flex items-center justify-between border-t border-line bg-paper-1/40 px-4 py-2 text-[11px] text-ink-3">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-paper-2 border border-line px-1 py-0.2 font-mono">↑</kbd>
                  <kbd className="rounded bg-paper-2 border border-line px-1 py-0.2 font-mono">↓</kbd> 导航
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-paper-2 border border-line px-1.5 py-0.2 font-mono">↵</kbd> 直达
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>药知 Pharmacology OS · 指挥控制台</span>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
