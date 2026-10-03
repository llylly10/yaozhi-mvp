import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight } from '@phosphor-icons/react'
import { api } from '../api'
import { type StudyMapData } from '../lib/shared'
import { ChapterStudy } from './ChapterStudy'
import { CourseGraph } from './CourseGraph'
export function StudyMapOnboard({ userId, goal, onError, onBack, onProceed, onSkip, onGoTodo, onGoQuiz, onAskAi }: {
  userId: string; goal: string; onError: (m: string) => void
  onBack: () => void; onProceed: () => void; onSkip: () => void
  onGoTodo?: () => void; onGoQuiz?: () => void
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
            <ArrowRight size={12} className="rotate-180" />调整学习目标
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
      <CourseGraph
        data={map}
        goal={goal}
        userId={userId}
        onOpen={(n) => { setOpenId(n.domain_id); setStudy('chapter') }}
        onSkip={onSkip}
        onProceed={onProceed}
        onGoTodo={onGoTodo}
        onGoQuiz={onGoQuiz}
        onAskAi={onAskAi}
        onRefreshMap={load}
      />
    </motion.div>
  )
}

/* ---------- 第 4 步 · 摸底测试 ---------- */
