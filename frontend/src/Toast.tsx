import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Info, Warning, X } from '@phosphor-icons/react'

type ToastType = 'success' | 'info' | 'warning'

interface ToastMessage {
  id: string
  text: string
  type: ToastType
  duration?: number
}

interface ToastContextType {
  showToast: (text: string, type?: ToastType, duration?: number) => void
  success: (text: string) => void
  info: (text: string) => void
  warning: (text: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback((text: string, type: ToastType = 'info', duration: number = 2400) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, text, type, duration }])

    setTimeout(() => {
      removeToast(id)
    }, duration)
  }, [removeToast])

  const success = useCallback((text: string) => showToast(text, 'success'), [showToast])
  const info = useCallback((text: string) => showToast(text, 'info'), [showToast])
  const warning = useCallback((text: string) => showToast(text, 'warning'), [showToast])

  return (
    <ToastContext.Provider value={{ showToast, success, info, warning }}>
      {children}
      {/* 悬浮 Toast 容器：屏幕顶端偏下，居中，高层级 */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: -16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 450, damping: 28 }}
              className={`pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-full px-4 py-2 text-xs font-medium shadow-md backdrop-blur-md transition-all border ${
                t.type === 'success'
                  ? 'border-emerald-500/30 bg-white/95 text-emerald-900 shadow-emerald-950/5'
                  : t.type === 'warning'
                  ? 'border-amber-500/30 bg-white/95 text-amber-900 shadow-amber-950/5'
                  : 'border-line bg-white/95 text-ink shadow-slate-900/5'
              }`}
            >
              {t.type === 'success' && <CheckCircle size={16} weight="fill" className="flex-none text-emerald-600" />}
              {t.type === 'warning' && <Warning size={16} weight="fill" className="flex-none text-amber-600" />}
              {t.type === 'info' && <Info size={16} weight="fill" className="flex-none text-primary" />}
              <span className="leading-snug">{t.text}</span>
              <button
                onClick={() => removeToast(t.id)}
                className="ml-1 rounded-full p-0.5 text-ink-3 hover:text-ink transition-colors"
              >
                <X size={12} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
