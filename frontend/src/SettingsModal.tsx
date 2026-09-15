import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  Gear,
  X,
  User,
  ShieldCheck,
  Cpu,
  CheckCircle,
  WarningCircle,
  ClockCounterClockwise,
  SignOut,
  Trash,
  FileText,
  LockKey,
  Database,
  CloudCheck,
} from '@phosphor-icons/react'
import { api } from './api'

interface Props {
  open: boolean
  onClose: () => void
  userId: string | null
  accountName?: string
  onLogout: () => void
  onResetCache: () => void
}

interface ConsentStatus {
  user_id: string
  display_name: string
  consented: boolean
  consented_at: string | null
  withdrawn_at: string | null
  deletion_receipt: string | null
  logical_deleted_at: string | null
  purged_at: string | null
  physical_delete_after_days: number
}

export const SettingsModal: React.FC<Props> = ({
  open,
  onClose,
  userId,
  accountName,
  onLogout,
  onResetCache,
}) => {
  const [tab, setTab] = useState<'profile' | 'privacy' | 'specs'>('profile')
  const [consentInfo, setConsentInfo] = useState<ConsentStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawResult, setWithdrawResult] = useState<{
    receipt: string
    logicalTime: string
    days: number
  } | null>(null)
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false)

  useEffect(() => {
    if (open && userId) {
      setLoading(true)
      api
        .getConsent(userId)
        .then((res) => {
          setConsentInfo(res)
          if (res.deletion_receipt) {
            setWithdrawResult({
              receipt: res.deletion_receipt,
              logicalTime: res.logical_deleted_at || '',
              days: res.physical_delete_after_days || 30,
            })
          }
        })
        .catch((err) => console.warn('Failed to load consent details', err))
        .finally(() => setLoading(false))
    }
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleWithdraw = async () => {
    if (!userId) return
    setWithdrawing(true)
    try {
      const res = await api.withdrawConsent(userId, '学生端主动撤回同意并要求粉碎学习数据')
      setWithdrawResult({
        receipt: res.deletion_receipt,
        logicalTime: res.logical_deleted_at,
        days: res.physical_delete_after_days,
      })
      setShowWithdrawConfirm(false)
    } catch (e) {
      alert('撤回申请失败: ' + String(e))
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 背景毛玻璃遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-ink/40 backdrop-blur-sm"
      />

      {/* 弹窗主体 */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="glass liquid relative z-10 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/95 shadow-2xl"
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between border-b border-line/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <Gear size={18} weight="fill" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink">系统设置 · 知情同意与数据中心</h2>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-ink-3">管理个人学习账号、知情同意书授权与合规数据生命周期</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-3 transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        {/* 标签栏 */}
        <div className="flex border-b border-line/40 bg-paper-1/60 px-6">
          <button
            onClick={() => setTab('profile')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'profile'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <User size={14} />
            账号与演示状态
          </button>
          <button
            onClick={() => setTab('privacy')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'privacy'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <ShieldCheck size={14} />
            知情同意与数据主权
          </button>
          <button
            onClick={() => setTab('specs')}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors ${
              tab === 'specs'
                ? 'border-primary text-primary'
                : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            <Cpu size={14} />
            技术基线与规范
          </button>
        </div>

        {/* 弹窗内容区 */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-ink-2">
          {tab === 'profile' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-line/60 bg-paper-2/60 p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-3">当前登录学生信息</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-ink-3">账号身份：</span>
                    <span className="font-semibold text-ink">{accountName || '药学本科生体验账号'}</span>
                  </div>
                  <div>
                    <span className="text-ink-3">用户识别码：</span>
                    <span className="font-mono text-ink">{userId ? userId.slice(0, 16) + '...' : '未登录'}</span>
                  </div>
                  <div>
                    <span className="text-ink-3">学习目标：</span>
                    <span className="font-semibold text-primary">药理学期末提分 · 人卫第9版</span>
                  </div>
                  <div>
                    <span className="text-ink-3">会话状态：</span>
                    <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                      <CheckCircle size={12} weight="fill" /> 已通过演示邀请码验证
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-line/60 p-4">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-3">演示环境快捷操作</h3>
                <p className="mb-4 text-xs text-ink-3">
                  若您希望重新完整演示或测试从「注册 → 三份知情同意书签署 → 摸底测试」的全流程，可一键重置当前浏览器的本地缓存。
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={onResetCache}
                    className="btn flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/80 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    <ClockCounterClockwise size={14} />
                    重置本地演示缓存（重新开卷）
                  </button>
                  <button
                    onClick={onLogout}
                    className="btn flex items-center gap-2 rounded-xl border border-line px-4 py-2 text-xs font-semibold text-ink-2 transition hover:bg-paper-2"
                  >
                    <SignOut size={14} />
                    退出当前账号
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab === 'privacy' && (
            <div className="space-y-5">
              {/* 撤回结果回执卡片 */}
              {withdrawResult ? (
                <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4.5 text-xs">
                  <div className="mb-2 flex items-center gap-2 font-bold text-red-700">
                    <WarningCircle size={16} weight="fill" />
                    已成功申请撤回知情同意（数据合规粉碎回执）
                  </div>
                  <p className="mb-3 text-red-600">
                    根据《个人信息保护法》与项目合规规范，您的个人学习记录与错因归因已立即进入逻辑隔离队列，并在 {withdrawResult.days} 天内执行物理清空。
                  </p>
                  <div className="rounded-xl border border-red-200/60 bg-white/80 p-3 font-mono text-[11px] text-ink-2 space-y-1">
                    <div><span className="text-ink-3">回执编号：</span>{withdrawResult.receipt}</div>
                    <div><span className="text-ink-3">生效时间：</span>{withdrawResult.logicalTime}</div>
                    <div><span className="text-ink-3">物理销毁周期：</span>{withdrawResult.days} 天内全表 PURGE</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-line/60 bg-paper-2/50 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3">已生效知情授权清单</h3>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                        <CheckCircle size={12} weight="fill" /> {loading ? '核验中...' : consentInfo?.consented_at ? `已签署 (${consentInfo.consented_at.slice(0, 10)})` : '合规已签署'}
                      </span>
                    </div>
                    <ul className="space-y-2 text-xs">
                      <li className="flex items-start gap-2 text-ink-2">
                        <FileText size={14} className="mt-0.5 text-primary flex-none" />
                        <div>
                          <strong className="text-ink">《药知学生服务知情同意书》</strong>
                          <p className="text-ink-3">明确智能体仅用于辅助备考学习，非临床处方下达与高利害考试工具。</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2 text-ink-2">
                        <LockKey size={14} className="mt-0.5 text-primary flex-none" />
                        <div>
                          <strong className="text-ink">《敏感个人信息与学习轨迹授权》</strong>
                          <p className="text-ink-3">作答日志仅用于 BKT 掌握度与错因归因，传输至大模型时执行最小必要去标识化。</p>
                        </div>
                      </li>
                      <li className="flex items-start gap-2 text-ink-2">
                        <ShieldCheck size={14} className="mt-0.5 text-primary flex-none" />
                        <div>
                          <strong className="text-ink">《学术研究与竞赛盲审使用许可》</strong>
                          <p className="text-ink-3">仅允许用于算法准确率（Recall / Macro-F1）宏观统计，绝不公开个人作答原件。</p>
                        </div>
                      </li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-red-700">数据主权与撤回权利（US-0 AC4）</h4>
                        <p className="mt-0.5 text-xs text-red-600/80">
                          学生可随时撤回授权。撤回后将立即注销登录并获得带时间戳的删除回执。
                        </p>
                      </div>
                      <button
                        onClick={() => setShowWithdrawConfirm(true)}
                        className="btn flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 shadow-xs transition hover:bg-red-50"
                      >
                        <Trash size={14} />
                        申请撤回同意
                      </button>
                    </div>

                    {showWithdrawConfirm && (
                      <div className="mt-4 rounded-xl border border-red-200 bg-white p-3 text-xs">
                        <p className="mb-2 font-semibold text-red-700">确认撤回知情同意？</p>
                        <p className="mb-3 text-ink-3">
                          撤回后，系统将清除您的做题轨迹、错因诊断与掌握度画像，且无法恢复。
                        </p>
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setShowWithdrawConfirm(false)}
                            className="btn rounded-lg border border-line px-2.5 py-1 text-xs text-ink-3"
                          >
                            取消
                          </button>
                          <button
                            onClick={handleWithdraw}
                            disabled={withdrawing}
                            className="btn rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-red-700"
                          >
                            {withdrawing ? '提交中...' : '确认撤回并生成回执'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'specs' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line/60 bg-paper-2/40 p-4">
                <div className="flex items-center gap-2 font-bold text-xs text-ink">
                  <CloudCheck size={16} className="text-primary" />
                  云端与容器拓扑实测
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-ink-3">公网节点：</span>59.110.213.120</div>
                  <div><span className="text-ink-3">反向代理：</span>Nginx (静态托管 + /api 转发)</div>
                  <div><span className="text-ink-3">后端引擎：</span>FastAPI 模块化单体 (Python 3.12)</div>
                  <div><span className="text-ink-3">内网 DNS：</span>100.100.2.136/138 (毫秒级外部解析)</div>
                </div>
              </div>

              <div className="rounded-2xl border border-line/60 p-4">
                <div className="flex items-center gap-2 font-bold text-xs text-ink">
                  <Database size={16} className="text-primary" />
                  教学数据资产与算法基线
                </div>
                <div className="mt-2.5 space-y-2 text-xs text-ink-3">
                  <p>• <strong>题库与大纲：</strong>人卫第 9 版《药理学》全 35 章教学大纲；题库 786 题（已发布 723 题单章题）；</p>
                  <p>• <strong>知识图谱：</strong>全量 34 章覆盖，839 条结构边 + 119 组易错考点混淆候选，BFS 分层轨道确定性可视化；</p>
                  <p>• <strong>真实临床沙盘：</strong>8 大核心篇章 16 套真实病历，权威文献溯源，三步临床思维链交互审核；</p>
                  <p>• <strong>掌握度引擎：</strong>BKT 贝叶斯动态更新 + 艾宾浩斯遗忘衰减模型（支持纯 Python 原生回退）。</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 底部信息栏 */}
        <div className="flex items-center justify-between border-t border-line/60 bg-paper-1/40 px-6 py-3 text-[11px] text-ink-3">
          <span>药知 · 药学专业能力提升智能体 · Datawhale 星跃三期</span>
          <button
            onClick={onClose}
            className="btn rounded-xl bg-paper-2 px-4 py-1.5 text-xs font-semibold text-ink-2 hover:bg-paper-3"
          >
            完成
          </button>
        </div>
      </motion.div>
    </div>
  )
}
