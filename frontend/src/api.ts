/* API 客户端：后端即唯一事实来源（v1.1 §5.3 前端数据原则） */

const jsonHeaders = { 'Content-Type': 'application/json' }

async function handle(res: Response) {
  if (!res.ok) {
    if (res.status === 404) throw new Error('数据不存在或已被重置，请刷新页面后重试')
    if (res.status >= 500) throw new Error('服务器开小差了，请稍后重试（已记录日志）')
    const detail = await res.text().catch(() => '')
    throw new Error(`请求失败 ${res.status}: ${detail.slice(0, 150)}`)
  }
  return res.json()
}

export const api = {
  demoSession: (account: string, inviteCode: string) =>
    fetch('/api/sessions/demo', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ account, invite_code: inviteCode }) }).then(handle),

  consent: (userId: string, docs: { user_agreement: boolean; privacy_policy: boolean; data_collection: boolean }) =>
    fetch(`/api/users/${userId}/consent`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(docs) }).then(handle),

  wrongBook: (userId: string) => fetch(`/api/users/${userId}/wrong-book`).then(handle),

  mastery: (userId: string) => fetch(`/api/mastery/me?user_id=${userId}`).then(handle),

  assessment: (userId: string) => fetch(`/api/assessment/${userId}`).then(handle),

  submitAssessment: (userId: string, answers: Record<string, string>) =>
    fetch(`/api/assessment/${userId}/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

  profileSummary: (userId: string) => fetch(`/api/users/${userId}/profile-summary`).then(handle),

  feedback: (sessionId: string, matches: boolean) =>
    fetch(`/api/diagnoses/${sessionId}/feedback`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ matches }) }).then(handle),

  learningPlan: (userId: string) => fetch(`/api/learning-plan/${userId}`).then(handle),

  questionAnalysis: (questionId: string) => fetch(`/api/questions/${questionId}/analysis`).then(handle),

  materials: (domainId: string) => fetch(`/api/materials/${domainId}`).then(handle),

  retest: (trainingId: string) => fetch(`/api/retest/${trainingId}`).then(handle),

  submitRetest: (trainingId: string, answers: Record<string, string>) =>
    fetch(`/api/retest/${trainingId}/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

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
    alternatives?: { code: string; name: string; primary: boolean }[]
    can_refine?: boolean
  },
  turns: { who: 'ai' | 'student'; text: string }[]
  training?: boolean
  followup: null | { node_id: string; question_text: string; options: { key: string; text: string }[] | null; turn_max: number }
}

export type Question = { id: string; code: string; stem: string; options: { key: string; text: string }[]; type: string; domain_id: string }
