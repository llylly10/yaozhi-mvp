/* 逐屏截图：欢迎/题库/作答/追问/诊断卡/训练/结果，供视觉验收 */
const { chromium } = require('playwright-core')

const OUT = __dirname
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/shot-1-welcome.png`, fullPage: true })

  // 勾选三个同意项
  const checks = page.locator('button.w-full.rounded-xl')
  const n = await checks.count()
  console.log('consent cards:', n)
  for (let i = 0; i < n; i++) await checks.nth(i).click()
  await page.getByRole('button', { name: /进入学习/ }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/shot-2-list.png`, fullPage: true })

  // 进入第一题
  await page.locator('.grid button').first().click()
  await page.waitForTimeout(500)
  await page.locator('button:has-text("提交答案")').scrollIntoViewIfNeeded()

  // 选错误答案 A（第一题正确为 B）
  await page.locator('button:has(span:text-is("A"))').first().click()
  await page.fill('textarea', '我觉得阿托品会让瞳孔缩小')
  await page.screenshot({ path: `${OUT}/shot-3-answer.png`, fullPage: true })
  await page.locator('button:has-text("提交答案")').click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/shot-4-followup.png`, fullPage: true })

  // 回答追问：定位"定向追问"卡片内的第一个选项
  const fuCard = page.locator('.card', { hasText: '定向追问' }).last()
  await fuCard.locator('button.rounded-xl').first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/shot-5-diagnosis.png`, fullPage: true })

  // 训练
  await page.locator('button:has-text("进入针对性训练")').click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/shot-6-training.png`, fullPage: true })

  await browser.close()
  console.log('shots saved')
}

main().catch((e) => { console.error(e); process.exit(1) })
