import React from 'react'

// 药理核心关键词词典（仅高亮确定的药名、受体亚型、禁忌警示词，不切分动词，保持中文语句流畅自然）
const DRUG_KEYWORDS = [
  '去甲肾上腺素', '异丙肾上腺素', '毛果芸香碱', '阿托品', '新斯的明', '碘解磷定',
  '肾上腺素', '酚妥拉明', '普萘洛尔', '美托洛尔', '间羟胺', '多巴胺', '麻黄碱',
  '氯丙嗪', '地西泮', '吗啡', '哌替啶', '纳洛酮', '阿司匹林', '对乙酰氨基酚',
  '布洛芬', '硝酸甘油', '硝苯地平', '卡托普利', '氯沙坦', '氢氯噻嗪',
  '呋塞米', '螺内酯', '肝素', '华法林', '阿托伐他汀', '奥美拉唑', '雷尼替丁',
  '氨茶碱', '沙丁胺醇', '二甲双胍', '格列本脲', '胰岛素', '青霉素', '头孢唑林',
  '阿莫西林', '红霉素', '庆大霉素', '环丙沙星', '左氧氟沙星', '异烟肼', '利福平',
  '毒扁豆碱', '琥珀胆碱', '筒箭毒碱', '地高辛', '胺碘酮', '利多卡因', '硝普钠',
  '氨氯地平', '替格瑞洛', '氯吡格雷', '瑞舒伐他汀', '阿卡波糖', '达格列净',
  '西格列汀', '利拉鲁肽', '泼尼松', '地塞米松', '甲氨蝶呤', '环磷酰胺', '氟尿嘧啶'
]

const RECEPTOR_KEYWORDS = [
  'M1受体', 'M2受体', 'M3受体', 'M受体',
  'N1受体', 'N2受体', 'N受体',
  'α1受体', 'α2受体', 'α受体',
  'β1受体', 'β2受体', 'β3受体', 'β受体',
  'D1受体', 'D2受体', 'DA受体',
  'AChE', 'ACh', '乙酰胆碱酯酶', '乙酰胆碱', '胆碱酯酶'
]

const DANGER_KEYWORDS = [
  '绝对禁忌', '禁用于', '禁用', '慎用', '局部坏死', '急性肾衰',
  '有机磷中毒', '机械性肠梗阻', '支气管哮喘', '闭角型青光眼', '前列腺肥大',
  '严重低血压', '心脏骤停', '呼吸抑制', '窦性心动过缓', '快速耐受性'
]

// 组合构建正则，按长度降序保证长词优先匹配
const ALL_PATTERNS = [
  ...DANGER_KEYWORDS.map(k => ({ key: k, type: 'danger' as const })),
  ...DRUG_KEYWORDS.map(k => ({ key: k, type: 'drug' as const })),
  ...RECEPTOR_KEYWORDS.map(k => ({ key: k, type: 'receptor' as const })),
].sort((a, b) => b.key.length - a.key.length)

const ESCAPED_KEYS = ALL_PATTERNS.map(p => p.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
const PHARMACY_REGEX = new RegExp(`(${ESCAPED_KEYS.join('|')})`, 'g')

const TYPE_MAP = new Map<string, 'danger' | 'drug' | 'receptor'>(
  ALL_PATTERNS.map(p => [p.key, p.type])
)

/**
 * 将药理文本中的核心药物、受体/递质、禁忌警示词以自然的排版色彩加粗突出，
 * 绝不插入 emoji 或外边框，保证中文语句原样连贯可读。
 */
export function highlightPharmacyKeywords(text: string): React.ReactNode {
  if (!text) return text

  const parts = text.split(PHARMACY_REGEX)
  if (parts.length === 1) return text

  return (
    <>
      {parts.map((part, i) => {
        const type = TYPE_MAP.get(part)
        if (!type) return <React.Fragment key={i}>{part}</React.Fragment>

        if (type === 'drug') {
          return (
            <span
              key={i}
              className="font-bold text-primary dark:text-primary-light"
            >
              {part}
            </span>
          )
        }

        if (type === 'danger') {
          return (
            <span
              key={i}
              className="font-bold text-rose-600 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/40 px-1 py-0.5 rounded"
            >
              {part}
            </span>
          )
        }

        if (type === 'receptor') {
          return (
            <span
              key={i}
              className="font-bold text-sky-700 dark:text-sky-300 font-mono"
            >
              {part}
            </span>
          )
        }

        return <strong key={i} className="font-bold text-ink">{part}</strong>
      })}
    </>
  )
}

/**
 * 将长段落拆解为结构化分句列表（按；/;\n切分），避免大段文字堆积
 */
export function splitClauses(text: string): string[] {
  if (!text) return []
  return text
    .split(/[；;\n]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * 将易混药物的 distinction 拆解为对比结构（药A内容 vs 药B内容）
 */
export function splitDistinction(distinction: string, _drugA?: string, drugB?: string): {
  partA: string
  partB: string
  single?: string
} {
  if (!distinction) return { partA: '', partB: '' }
  
  // 多数 distinction 以中文分号或换行区分药 A 与药 B
  const parts = distinction.split(/[；;\n]+/).map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { partA: parts[0], partB: parts.slice(1).join('；') }
  }
  
  // 若无分号但包含药 B 名称，尝试按药 B 切分
  if (drugB && distinction.includes(drugB)) {
    const idx = distinction.indexOf(drugB)
    if (idx > 10) {
      return {
        partA: distinction.slice(0, idx).replace(/[,，]+$/, '').trim(),
        partB: distinction.slice(idx).trim()
      }
    }
  }

  return { partA: distinction, partB: '', single: distinction }
}
