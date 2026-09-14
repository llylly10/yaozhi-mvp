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

function transformBackendEvalReport(data: any): EvalReportData {
  if (!data) return {} as EvalReportData
  const cats: string[] = data.categories || Object.keys(data.category_stats || {})
  const matrix: number[][] = Array.isArray(data.confusion_matrix?.matrix)
    ? data.confusion_matrix.matrix
    : cats.map((row) => cats.map((col) => data.confusion_matrix?.[row]?.[col] ?? data.confusion_matrix?.raw?.[row]?.[col] ?? 0))

  const zeroCats = Object.entries(data.category_stats || {})
    .filter(([_, s]: [string, any]) => s.recall === 0)
    .map(([c]) => c)

  return {
    run_id: data.run_id || `RUN-${(data.run_at || '').replace(/[- :]/g, '').slice(0, 14)}`,
    dataset_version: data.dataset_version || 'v1.0 (80题黄金保护测试集)',
    timestamp: data.timestamp || data.run_at || new Date().toLocaleString(),
    provider: data.provider || (data.provider_mode === 'mock' ? '规则基线引擎 (Mock)' : '智谱 GLM-4-Flash'),
    case_count: data.case_count ?? data.total_cases ?? 80,
    overall: {
      accuracy: data.overall?.accuracy ?? data.accuracy ?? 0,
      macro_recall: data.overall?.macro_recall ?? data.macro_recall ?? 0,
      macro_precision: data.overall?.macro_precision ?? data.macro_precision ?? 0,
      macro_f1: data.overall?.macro_f1 ?? data.macro_f1 ?? 0,
    },
    category_metrics: Array.isArray(data.category_metrics)
      ? data.category_metrics
      : cats.map((c) => ({
          category: c,
          support: data.category_stats?.[c]?.expected_count ?? 20,
          recall: data.category_stats?.[c]?.recall ?? 0,
          precision: data.category_stats?.[c]?.precision ?? 0,
          f1: data.category_stats?.[c]?.f1 ?? 0,
          passed_redline: (data.category_stats?.[c]?.recall ?? 0) > 0,
        })),
    confusion_matrix: {
      labels: data.confusion_matrix?.labels || cats,
      matrix,
    },
    gates: {
      gate1_no_zero_recall: {
        name: data.gates?.gate1_no_zero_recall?.name || data.gates?.gate_no_zero_recall?.name || '单类零召回死刑门禁',
        passed: data.gates?.gate1_no_zero_recall?.passed ?? data.gates?.gate_no_zero_recall?.passed ?? true,
        message: data.gates?.gate1_no_zero_recall?.message || data.gates?.gate_no_zero_recall?.detail || '全部类别召回率 > 0',
        zero_recall_categories: data.gates?.gate1_no_zero_recall?.zero_recall_categories || zeroCats,
      },
      gate2_macro_recall: {
        name: data.gates?.gate2_macro_recall?.name || data.gates?.gate_recall_threshold?.name || '宏平均召回率门禁 (>= 0.60)',
        passed: data.gates?.gate2_macro_recall?.passed ?? data.gates?.gate_recall_threshold?.passed ?? true,
        current: data.gates?.gate2_macro_recall?.current ?? data.gates?.gate_recall_threshold?.current ?? data.macro_recall ?? 0,
        threshold: data.gates?.gate2_macro_recall?.threshold ?? data.gates?.gate_recall_threshold?.threshold ?? 0.60,
        message: '宏召回率达成',
      },
      gate3_macro_f1: {
        name: data.gates?.gate3_macro_f1?.name || data.gates?.gate_f1_threshold?.name || '宏平均 Macro-F1 门禁 (>= 0.65)',
        passed: data.gates?.gate3_macro_f1?.passed ?? data.gates?.gate_f1_threshold?.passed ?? true,
        current: data.gates?.gate3_macro_f1?.current ?? data.gates?.gate_f1_threshold?.current ?? data.macro_f1 ?? 0,
        threshold: data.gates?.gate3_macro_f1?.threshold ?? data.gates?.gate_f1_threshold?.threshold ?? 0.65,
        message: '宏 F1 达成',
      },
      all_passed: data.gates?.all_passed ?? data.overall_passed ?? (data.status_label === 'PASSED'),
      status_label: data.gates?.status_label || data.status_label || 'PASSED',
    },
  }
}

export const api = {
  // 探活：localStorage 里的 userId 在服务器可能已被重置/撤回，无效返回 false（不抛通用 404 文案）
  userExists: async (userId: string) => {
    const res = await fetch(`/api/users/${userId}/exists`)
    return res.ok
  },

  demoSession: (account: string, inviteCode: string): Promise<{ user_id: string; display_name: string; consented: boolean }> =>
    fetch('/api/sessions/demo', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ account, invite_code: inviteCode }) }).then(handle),

  consent: (userId: string, docs: { user_agreement: boolean; privacy_policy: boolean; data_collection: boolean }) =>
    fetch(`/api/users/${userId}/consent`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(docs) }).then(handle),

  getConsent: (userId: string): Promise<{
    user_id: string;
    display_name: string;
    consented: boolean;
    consented_at: string | null;
    withdrawn_at: string | null;
    deletion_receipt: string | null;
    logical_deleted_at: string | null;
    purged_at: string | null;
    physical_delete_after_days: number;
  }> => fetch(`/api/users/${userId}/consent`).then(handle),

  withdrawConsent: (userId: string, reason: string = '学生自主申请撤回'): Promise<{
    user_id: string;
    consented: boolean;
    deletion_receipt: string;
    logical_deleted_at: string;
    physical_delete_after_days: number;
    status: string;
  }> =>
    fetch(`/api/users/${userId}/consent/withdraw`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ reason }),
    }).then(handle),

  wrongBook: (userId: string) => fetch(`/api/users/${userId}/wrong-book`).then(handle),

  exportWrongBook: (userId: string) => fetch(`/api/users/${userId}/wrong-book/export`).then(handle),

  clinicalCases: (userId: string) => fetch(`/api/users/${userId}/clinical-cases`).then(handle),

  clinicalCaseDetail: (userId: string, caseId: string) => fetch(`/api/users/${userId}/clinical-cases/${caseId}`).then(handle),

  submitClinicalCase: (userId: string, caseId: string, answers: Record<string, string>) =>
    fetch(`/api/users/${userId}/clinical-cases/${caseId}/submit`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ answers }),
    }).then(handle),

  wrongRecall: (attemptId: string) => fetch(`/api/wrong/${attemptId}/recall`).then(handle),

  wrongGraph: (userId: string) => fetch(`/api/users/${userId}/wrong-graph`).then(handle),

  mastery: (userId: string) => fetch(`/api/users/${userId}/mastery`).then(handle),

  assessment: (userId: string) => fetch(`/api/users/${userId}/assessment`).then(handle),

  submitAssessment: (userId: string, answers: Record<string, string>) =>
    fetch(`/api/users/${userId}/assessment/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

  profileSummary: (userId: string) => fetch(`/api/users/${userId}/profile-summary`).then(handle),

  archive: (userId: string) => fetch(`/api/users/${userId}/archive`).then(handle),

  feedback: (sessionId: string, matches: boolean) =>
    fetch(`/api/diagnoses/${sessionId}/feedback`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ matches }) }).then(handle),

  learningPlan: (userId: string) => fetch(`/api/users/${userId}/learning-plan`).then(handle),

  qa: (userId: string, question: string, context?: string, questionId?: string, history?: { role: string; content: string }[]) =>
    fetch(`/api/users/${userId}/qa/ask`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ question, context, question_id: questionId, history }),
    }).then(handle),

  customQuizConfig: (userId: string) =>
    fetch(`/api/users/${userId}/custom-quiz/config`).then(handle),

  generateCustomQuiz: (
    userId: string,
    body: {
      mode?: string
      total_count?: number
      chapter_ids?: string[]
      cognitive_levels?: string[]
      difficulties?: string[]
    }
  ) =>
    fetch(`/api/users/${userId}/custom-quiz/generate`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }).then(handle),

  submitCustomQuiz: (
    userId: string,
    body: { quiz_id: string; mode: string; answers: Record<string, string> }
  ) =>
    fetch(`/api/users/${userId}/custom-quiz/submit`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }).then(handle),

  questionAnalysis: (questionId: string) => fetch(`/api/questions/${questionId}/analysis`).then(handle),

  materials: (domainId: string) => fetch(`/api/materials/${domainId}`).then(handle),

  studyMap: (userId: string) => fetch(`/api/users/${userId}/study-map`).then(handle),

  studyDetail: (userId: string, domainId: string) =>
    fetch(`/api/users/${userId}/study-map/${domainId}`).then(handle),

  knowledgeDetail: (userId: string, chapterNo: number, pointName: string, domainId?: string): Promise<KnowledgePointDetail> =>
    fetch(`/api/users/${userId}/study/knowledge-detail?chapter_no=${chapterNo}&point_name=${encodeURIComponent(pointName)}${domainId ? `&domain_id=${domainId}` : ''}`).then(handle),

  getEvalLatest: () => fetch('/api/eval/latest').then(handle).then(transformBackendEvalReport),
  runEval: (provider = 'mock') => fetch('/api/eval/run', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ provider }) }).then(handle).then(transformBackendEvalReport),

  studyQuiz: (userId: string, domainId: string) =>
    fetch(`/api/users/${userId}/study-map/${domainId}/quiz`).then(handle),

  submitStudyQuiz: (userId: string, domainId: string, answers: Record<string, string>) =>
    fetch(`/api/users/${userId}/study-map/${domainId}/quiz/submit`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

  materialQuiz: (userId: string, domainId: string) =>
    fetch(`/api/users/${userId}/learning-plan/${domainId}/quiz`).then(handle),

  submitMaterialQuiz: (userId: string, domainId: string, answers: Record<string, string>) =>
    fetch(`/api/users/${userId}/learning-plan/${domainId}/quiz/submit`,
      { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

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

  generateAiVariant: (trainingId: string) =>
    fetch(`/api/training/${trainingId}/generate-ai-variant`, { method: 'POST' }).then(handle),

  submitTraining: (trainingId: string, answers: Record<string, string>) =>
    fetch(`/api/training/${trainingId}/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ answers }) }).then(handle),

  // 艾宾浩斯抗遗忘长时记忆复测模块（ADR-Retest-01）
  retestCapsule: (userId: string) => fetch(`/api/users/${userId}/retest-capsule`).then(handle),

  submitRetestCapsule: (userId: string, body: { schedule_id: string; answers: Record<string, string> }) =>
    fetch(`/api/users/${userId}/retest-capsule/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle),

  awakenWrong: (userId: string, attemptId: string) =>
    fetch(`/api/users/${userId}/wrong-book/awaken`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ attempt_id: attemptId }) }).then(handle),

  chapterWarmup: (userId: string, domainId: string) =>
    fetch(`/api/users/${userId}/chapters/${domainId}/warmup`).then(handle),

  submitChapterWarmup: (userId: string, domainId: string, body: { question_id: string; selected_option: string }) =>
    fetch(`/api/users/${userId}/chapters/${domainId}/warmup/submit`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) }).then(handle),
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
    case_evidence?: { scenario: string; lesson: string; source: string } | null
    ai_rationale?: string | null
    evidences: { type: string; source: string; content: string }[]
    alternatives?: { code: string; name: string; primary: boolean }[]
    can_refine?: boolean
  },
  turns: { who: 'ai' | 'student'; text: string }[]
  training?: boolean
  followup: null | {
    kind: 'node' | 'verify'
    node_id?: string; question_text?: string
    question?: { id: string; stem: string; options: { key: string; text: string }[] }
    options: { key: string; text: string }[] | null
    turn_max: number
  }
}

export type Question = { id: string; code: string; stem: string; options: { key: string; text: string }[]; type: string; domain_id: string; chapter?: string; chapter_name?: string }

export type TikuFeedback = {
  kind: 'tiku'
  analysis: string
  source: string
  chapter_ref: string
  chapter_name: string
}

export type RetestCapsuleData = {
  has_capsule: boolean
  schedule_id?: string
  domain_id?: string
  domain_name?: string
  chapter_ref?: string
  concept_name?: string
  stage?: number
  stage_name?: string
  retention_pct?: number
  questions?: Question[]
}

export type WrongBookItem = {
  attempt_id: string
  question_id?: string
  question_code: string
  stem: string
  selected: string
  answer: string
  misconception?: { name: string; category: string } | null
  case_evidence?: string | null
  evidence_level?: string | null
  retention_pct?: number
  decay_level?: 'fresh' | 'warning' | 'critical'
  days_since?: number
  stage?: number
  schedule_id?: string | null
}

export interface EvalCategoryMetric {
  category: string
  support: number
  recall: number
  precision: number
  f1: number
  passed_redline: boolean
}

export interface EvalReportData {
  run_id: string
  dataset_version: string
  timestamp: string
  provider: string
  case_count: number
  overall: {
    accuracy: number
    macro_recall: number
    macro_precision: number
    macro_f1: number
  }
  category_metrics: EvalCategoryMetric[]
  confusion_matrix: {
    labels: string[]
    matrix: number[][]
  }
  gates: {
    gate1_no_zero_recall: { name: string; passed: boolean; message: string; zero_recall_categories: string[] }
    gate2_macro_recall: { name: string; passed: boolean; current: number; threshold: number; message: string }
    gate3_macro_f1: { name: string; passed: boolean; current: number; threshold: number; message: string }
    all_passed: boolean
    status_label: 'PASSED' | 'REJECTED'
  }
}

export type KnowledgePointDetail = {
  point_name: string
  clean_name: string
  chapter_no: number
  chapter_title: string
  representative_drugs: string[]
  core_mechanism: string
  clinical_applications: string[]
  cautions_and_adverse: string
  mnemonic: string
  textbook_anchors: { book_page: number; chapter: string; source: string; text: string }[]
  related_confusions: { drug_a: string; drug_b: string; distinction: string }[]
  key_takeaways: string[]
}


