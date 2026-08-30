/* 全流程截图 v2：注册→同意→目标→摸底→画像→练习→追问→诊断→训练→档案 */
const { chromium } = require('playwright-core')
const OUT = __dirname
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  // 注册
  await page.fill('input.input >> nth=0', 'yaozhi_student02')
  await page.fill('input.input >> nth=1', 'DEMO2026')
  await page.locator('button:has-text("进入药知")').click()
  await page.waitForTimeout(600)
  // 同意
  const cards = page.locator('button.rounded-2xl')
  await cards.nth(0).click()
  await cards.nth(1).click()
  await page.locator('div.rounded-2xl:has-text("知情同意书") button').first().click()
  await page.locator('button:has-text("进入学习")').click()
  await page.waitForTimeout(500)
  // 目标
  await page.locator('button:has-text("补齐理解缺口")').click()
  await page.locator('button:has-text("保存目标，开始摸底")').click()
  await page.waitForTimeout(700)
  // 摸底：每题选第一个选项
  const n = await page.locator('.card button.rounded-xl').count()
  for (let i = 0; i < n; i++) await page.locator('.card button.rounded-xl').nth(i).click()
  await page.locator('button:has-text("交卷并生成画像")').click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/v2-portrait.png` })

  // 进入题库，作答第一题（错）
  await page.locator('button:has-text("进入今日待办")').click()
  await page.waitForTimeout(600)
  await page.locator('.spot-card').first().click()
  await page.waitForTimeout(500)
  await page.locator('button:has(span:text-is("A"))').first().click()
  await page.locator('button:has-text("提交答案")').click()
  await page.waitForTimeout(900)
  // 追问（对话气泡）
  const fuCard = page.locator('.card', { hasText: '定向追问' }).last()
  await fuCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/v2-followup.png` })
  await fuCard.locator('button.rounded-2xl').first().click()
  await page.waitForTimeout(900)
  // 诊断卡（圆点/折叠/候选/反馈）
  await page.getByText('归因依据').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/v2-diagnosis.png` })
  // 展开证据
  await page.locator('button:has-text("展开证据")').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/v2-diagnosis-expanded.png` })

  await browser.close()
  console.log('v2 shots saved')
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
