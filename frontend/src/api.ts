/* API 客户端：后端即唯一事实来源（v1.1 §5.3 前端数据原则） */

const jsonHeaders = { 'Content-Type': 'application/json' }

async function handle(res: Response) {
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${detail.slice(0, 200)}`)
  }
  return res.json()
}

export const api = {
  demoSession: (consent: boolean) =>
    fetch('/api/sessions/demo', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ consent }) }).then(handle),

  questions: () => fetch('/api/questions?usage=diagnostic').then(handle),

  submitAttempt: (body: {
    user_id: string; question_id: string; selected_option: string;
    rationale?: string; idempotency_key: string;
  }) =>
    fetch('/api/attempts', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle),

  diagnosis: (sessionId: string) => fetch(`/api/diagnoses/${sessionId}`).then(handle),

  answerFollowup: (sessionId: string, body: { option_key?: string; text?: string }) =>
    fetch(`/api/diagnoses/${sessionId}/followups`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle),

  skipFollowup: (sessionId: string) =>
    fetch(`/api/diagnoses/${sessionId}/skip-followup`, { method: 'POST' }).then(handle),

  training: (sessionId: string) => fetch(`/api/training/${sessionId}`).then(handle),

  submitTraining: (trainingId: string, answers: Record<string, string>) =>
    fetch(`/api/training/${trainingId}/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),
}

export type Diagnosis = {
  session_id: string
  state: string
  is_correct: boolean
  answer: string
  chain_focus: number | null
  followup_count: number
  card: null | {
    misconception: { code: string; name: string; category: string }
    evidence_level: string
    evidences: { type: string; source: string; content: string }[]
  }
  followup: null | { node_id: string; question_text: string; options: { key: string; text: string }[] | null; turn_max: number }
}

export type Question = { id: string; code: string; stem: string; options: { key: string; text: string }[]; type: string }
