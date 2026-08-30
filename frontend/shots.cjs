/* 逐屏截图：注册/同意/题库(带左栏)/作答/追问/诊断/训练/档案 */
const { chromium } = require('playwright-core')
const OUT = __dirname
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/shot-1-register.png` })

  // 注册
  await page.fill('input.input >> nth=0', 'yaozhi_student01')
  await page.fill('input.input >> nth=1', 'DEMO2026')
  await page.locator('button:has-text("进入药知")').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/shot-2-consent.png` })

  // 同意：三份文档
  const cards = page.locator('button.rounded-2xl')
  await cards.nth(0).click()
  await cards.nth(1).click()
  await page.locator('div.rounded-2xl:has-text("知情同意书") button').first().click()
  await page.locator('button:has-text("进入学习")').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/shot-3-list.png` })

  // 作答
  await page.locator('.spot-card').first().click()
  await page.waitForTimeout(600)
  await page.locator('button:has(span:text-is("A"))').first().click()
  await page.fill('textarea', '我觉得阿托品会让瞳孔缩小')
  await page.locator('button:has-text("提交答案")').click()
  await page.waitForTimeout(1200)
  await page.getByText('跳过追问').scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/shot-4-followup.png` })

  const fuCard = page.locator('.card', { hasText: '定向追问' }).last()
  await fuCard.locator('button.rounded-2xl').first().click()
  await page.waitForTimeout(900)
  await page.getByText('归因依据').scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/shot-5-diagnosis.png` })

  await page.locator('button:has-text("开具靶向训练")').click()
  await page.waitForTimeout(900)
  await page.getByText('针对性训练').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/shot-6-training.png` })

  // 提交训练
  const qcards = page.locator('.card .rounded-2xl.border.border-line-2')
  const nq = await qcards.count()
  for (let i = 0; i < nq; i++) await qcards.nth(i).locator('button').first().click()
  await page.locator('button:has-text("提交训练")').click()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${OUT}/shot-7-result.png` })

  // 档案（错题本）
  await page.locator('button:has-text("返回今日待办")').click()
  await page.waitForTimeout(500)
  await page.locator('aside button:has-text("错题本")').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/shot-7-profile.png` })

  await browser.close()
  console.log('shots saved')
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
