import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle, ArrowRight } from '@phosphor-icons/react'
import { api } from '../api'
import { spring } from '../lib/shared'
export function Consent({ userId, onConsented, onBack, onError }: {
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
          ['《隐私政策》', '说明我们收集哪些信息、如何保护与使用。作答与学情数据仅存校内系统；使用问 AI 时，你的提问文本与相关课程资料会发送至外部大模型服务（阿里云）用于生成回答，不含账号等身份信息，不用于营销或对外提供。', 1, true],
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
