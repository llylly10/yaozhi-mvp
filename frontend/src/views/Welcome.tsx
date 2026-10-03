import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkle } from '@phosphor-icons/react'
import { api } from '../api'
import { Hex } from '../components/ui'
import { spring } from '../lib/shared'
export function Welcome({ onRegistered, onError, onOpenEval }: {
  onRegistered: (id: string, consented?: boolean) => void
  onError: (m: string) => void
  onOpenEval?: () => void
}) {
  const [account, setAccount] = useState('yaozhi_student01')
  const [invite, setInvite] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  function enter() {
    setBusy(true)
    api.demoSession(account, invite, password.trim() || undefined)
      .then((r) => {
        localStorage.setItem('yaozhi_account_name', account)
        onRegistered(r.user_id, r.consented)
      })
      .catch((e) => {
        const m = String(e)
        onError(m.includes('403') ? '邀请码不正确（演示邀请码：DEMO2026）' : m)
      })
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
        <p className="mt-1.5 text-[13px] text-ink-2">演示账号 + 邀请码进入；设置密码后，下次可凭密码登录</p>

        <label className="mb-1.5 mt-7 block text-[13px] font-semibold text-ink-2">演示账号</label>
        <input value={account} onChange={(e) => setAccount(e.target.value)} className="input" maxLength={32} />

        <label className="mb-1.5 mt-5 block text-[13px] font-semibold text-ink-2">邀请码</label>
        <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="演示邀请码：DEMO2026"
          className="input" maxLength={32} />

        <label className="mb-1.5 mt-5 block text-[13px] font-semibold text-ink-2">
          密码 <span className="font-normal text-ink-3">（可选）</span>
        </label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="设置后可用账号 + 密码登录" className="input" maxLength={64} />

        <button onClick={enter} disabled={busy || !account.trim() || (!invite.trim() && !password.trim())} className="btn btn-primary mt-7 w-full !py-3.5">
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
