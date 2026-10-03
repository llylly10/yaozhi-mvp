// 拆分重构终验：真实注册流走查全部屏幕，逐屏截图 + 监听 chunk 加载失败与运行时错误。
// 用法: node walkthrough.mjs   （前置：后端 :8001、vite :5174 已起）
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = 'http://localhost:5174'
const OUT = 'scratch_shots'
fs.mkdirSync(OUT, { recursive: true })

const consoleErrors = []
const failedJs = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 220))
})
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${String(err).slice(0, 220)}`))
page.on('requestfailed', (req) => {
  if (req.url().endsWith('.js') || req.url().includes('.js?')) failedJs.push(req.url().split('/').pop())
})

async function shot(name, ms = 1800) {
  await page.waitForTimeout(ms)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('shot:', name)
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 })
  await shot('01-welcome')

  // 注册（唯一账号 + 演示邀请码）
  const account = `uiwalk_${Date.now().toString().slice(-8)}`
  await page.locator('input').nth(0).fill(account)
  await page.locator('input[placeholder*="DEMO2026"]').fill('DEMO2026')
  await page.getByRole('button', { name: /进入药知/ }).click()

  // 知情同意：三份文档分别独立勾选
  await page.getByText('使用前，请阅读并同意').waitFor({ timeout: 20000 })
  await shot('02-consent')
  for (const t of ['《用户协议》', '《隐私政策》', '《学习数据采集知情同意书》']) {
    await page.locator('button').filter({ hasText: t }).first().click()
    await page.waitForTimeout(200)
  }
  await page.getByRole('button', { name: /进入学习/ }).click()

  // 备考目标
  await page.locator('.btn-primary').first().waitFor({ timeout: 20000 })
  await shot('03-goal')
  await page.locator('.btn-primary').first().click()

  // 全景知识地图（echarts canvas，最重的懒加载分包）
  await page.locator('canvas').first().waitFor({ timeout: 25000 }).catch(() => console.log('WARN: canvas 未出现'))
  await shot('04-study-map', 2600)

  // 摸底入口（触发 Assessment 分包，不完成作答）
  try {
    const probe = page.locator('button').filter({ hasText: /摸底|开始学习/ }).first()
    if (await probe.count()) {
      await probe.click({ timeout: 3000 })
      await page.waitForTimeout(2200)
      await shot('05-assessment-entry', 800)
      // 返回地图
      const back = page.locator('button').filter({ hasText: /返回|知识地图/ }).first()
      if (await back.count()) await back.click({ timeout: 3000 })
      await page.waitForTimeout(1200)
    }
  } catch (e) { console.log('skip assessment:', String(e).slice(0, 80)) }

  // 侧边栏逐屏
  const navSteps = [
    ['今日待办', '06-todo'],
    ['错题本', '07-wrongbook'],
    ['问AI 助教', '08-qa'],
    ['学习档案', '09-profile'],
    ['临床沙盘', '10-clinical'],
    ['自适应模考', '11-custom-quiz'],
  ]
  for (const [label, name] of navSteps) {
    try {
      await page.locator('aside button').filter({ hasText: label }).first().click({ timeout: 8000 })
      await shot(name, 2400)
    } catch (e) { console.log(`skip ${label}:`, String(e).slice(0, 80)) }
  }

  // 今日待办 → 进练习流（触发 PracticeFlow 分包，仅截图题面）
  try {
    await page.locator('aside button').filter({ hasText: '今日待办' }).first().click({ timeout: 8000 })
    await page.waitForTimeout(1500)
    const start = page.locator('button').filter({ hasText: /开始|作答|练习/ }).first()
    if (await start.count()) {
      await start.click({ timeout: 3000 })
      await shot('12-practice-flow', 2200)
    }
  } catch (e) { console.log('skip practice:', String(e).slice(0, 80)) }
} finally {
  console.log('\n=== 汇总 ===')
  console.log('console errors:', consoleErrors.length ? consoleErrors : '无')
  console.log('failed js chunks:', failedJs.length ? failedJs : '无')
  await browser.close()
}
