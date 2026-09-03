// 单进程浏览器走查：注册→同意→目标→摸底(全对)→画像→自由练习(T01-001 tiku)→答错→诊断→训练→复测
// 使用 agent-browser 自带的 playwright-core 直驱 Chrome，绕开 daemon（daemon 跨调用不持久）。
const PW = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/openclaw/node_modules/playwright-core';
const { chromium } = require(PW);
const CHROME = 'C:/Users/Administrator/.agent-browser/browsers/chrome-152.0.7977.75/chrome.exe';
const BASE = 'http://127.0.0.1:5173';
const API = 'http://127.0.0.1:8000';
const SHOTS = 'D:/ceshi/yaozhi-mvp/corpus/tools/shots';
const fs = require('fs');
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') log('  [browser-error]', m.text()); });
  page.on('pageerror', (e) => log('  [pageerror]', e.message));

  const shot = async (name) => {
    try { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); log('  SHOT', name); }
    catch (e) { log('  shot-fail', name, e.message); }
  };
  const safe = async (label, fn) => { try { await fn(); } catch (e) { log('  !! ' + label + ' 失败:', e.message); } };

  // ---- 构建 code/id/answer 映射 ----
  log('[init] 拉取题目映射 ...');
  const allDiag = await (await fetch(`${API}/questions?usage=diagnostic&limit=3000`)).json();
  const allTrain = await (await fetch(`${API}/questions?usage=training&limit=3000`)).json();
  const byCode = {}; [...allDiag, ...allTrain].forEach((q) => { byCode[q.code] = q; });
  const stemToId = {}; [...allDiag, ...allTrain].forEach((q) => { if (q.stem) stemToId[q.stem.trim()] = q.id; });
  const ansCache = {};
  async function answerOfCode(code) {
    if (ansCache[code]) return ansCache[code];
    const id = byCode[code] && byCode[code].id; if (!id) return null;
    try { const r = await (await fetch(`${API}/questions/${id}/analysis`)).json(); ansCache[code] = r.answer; return r.answer; }
    catch { return null; }
  }
  async function answerOfStem(stem) {
    const id = stemToId[stem.trim()]; if (!id) return null;
    try { const r = await (await fetch(`${API}/questions/${id}/analysis`)).json(); return r.answer; }
    catch { return null; }
  }

  // ---- 1. 注册 ----
  log('[1] 注册');
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await sleep(800);
  await shot('01-register');
  await safe('填账号', () => page.locator('input.input').first().fill('yaozhi_' + Date.now()));
  await safe('填邀请码', () => page.locator('input[placeholder*="DEMO2026"]').fill('DEMO2026'));
  await safe('点进入药知', () => page.locator('button:has-text("进入药知")').click());
  await sleep(1200);

  // ---- 2. 同意 ----
  log('[2] 同意三份文档');
  await safe('勾选用户协议', () => page.locator('button:has-text("《用户协议》")').click());
  await safe('勾选隐私政策', () => page.locator('button:has-text("《隐私政策》")').click());
  await safe('勾选数据采集', () => page.locator('button:has-text("《学习数据采集知情同意书》")').click());
  await sleep(300);
  await shot('02-consent');
  await safe('点进入学习', () => page.locator('button:has-text("进入学习")').click());
  await sleep(1000);

  // ---- 3. 目标 ----
  log('[3] 选目标');
  await safe('选期末冲绩', () => page.locator('button:has-text("期末冲绩")').click());
  await sleep(300);
  await shot('03-goal');
  await safe('保存目标', () => page.locator('button:has-text("保存目标，开始摸底")').click());
  await sleep(1500);
  await shot('04-assessment');

  // ---- 4. 摸底：全答对 ----
  log('[4] 摸底全答对');
  const cards = await page.locator('div.card.p-6').elementHandles();
  log('  摸底题卡数:', cards.length);
  for (let i = 0; i < cards.length; i++) {
    const code = await cards[i].$eval('span.font-semibold', (e) => e.textContent.trim()).catch(() => null);
    const ans = code ? await answerOfCode(code) : null;
    const opts = await cards[i].$$('button');
    let clicked = false;
    for (const b of opts) {
      const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null);
      if (key && key === ans) { await b.click(); clicked = true; break; }
    }
    if (!clicked && opts[0]) await opts[0].click(); // 兜底：答错也至少作答
  }
  await sleep(500);
  await safe('交卷', () => page.locator('button:has-text("交卷并生成画像")').click());
  await sleep(2000);
  await shot('05-portrait');

  // ---- 5. 进入今日待办 ----
  log('[5] 进入今日待办');
  await safe('点进入今日待办', () => page.locator('button:has-text("进入今日待办")').click());
  await sleep(1500);
  await shot('05b-plan');

  // 自由练习一道（全对时无薄弱任务，按钮在今日待办出现）
  log('[5b] 自由练习一道');
  await safe('点自由练习', () => page.locator('button:has-text("自由练习一道")').click());
  await sleep(1500);
  await shot('06-practice-tiku');

  // 读取当前题 code：练习卡片的 header div 包含 "· 单选题 ·" 且内部有 capsule 子元素
  const pcode = await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')];
    const d = divs.find((e) => /单选题/.test(e.textContent || '') && e.querySelector('.capsule'));
    if (!d) return null;
    const m = (d.textContent || '').match(/(T\d{2}-\d{3}|\d{2}-\d{3})/);
    return m ? m[1] : null;
  });
  log('  练习题 code:', pcode, ' (应为 T 开头 tiku 题)');

  // ---- 6. 答错（点一个非正确答案）----
  log('[6] 答错 tiku 题 → 触发诊断');
  const pAns = pcode ? await answerOfCode(pcode) : null;
  if (pAns) {
    await page.evaluate((ans) => {
      const card = document.querySelector('.card.relative.overflow-hidden') || document.querySelector('.card');
      const btns = [...card.querySelectorAll('button')].filter((b) => {
        const s = b.querySelector('span span'); return s && /^[A-E]$/.test((s.textContent || '').trim());
      });
      const wrong = btns.find((b) => { const s = b.querySelector('span span'); return (s.textContent || '').trim() !== ans; });
      (wrong || btns[0]).click();
    }, pAns);
    await sleep(400);
    await safe('提交答案', () => page.locator('button:has-text("提交答案")').click());
    await sleep(2500);
  } else {
    log('  !! 无法解析答案，跳过答错');
  }
  await shot('07-diagnosis');
  await safe('诊断面板文本', async () => {
    const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900);
    log('  [诊断面板]', t);
  });

  // ---- 7. 开具靶向训练 ----
  log('[7] 靶向训练');
  const hasTrain = await page.locator('button:has-text("靶向训练")').count();
  if (hasTrain > 0) {
    await safe('点开具靶向训练', () => page.locator('button:has-text("靶向训练")').click());
    await sleep(2500);
    await shot('08-training');
    await safe('训练面板文本', async () => {
      const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900);
      log('  [训练面板]', t);
    });

    // 判断训练形态：记忆卡 / 变式题
    const isMemory = await page.locator('button:has-text("完成记忆训练")').count();
    if (isMemory > 0) {
      log('  训练形态=记忆卡，翻看后完成');
      await safe('完成记忆训练', () => page.locator('button:has-text("完成记忆训练")').click());
      await sleep(1500);
      await shot('09-training-result');
    } else {
      // 变式题：逐题确定性答对
      const tcards = await page.locator('div.rounded-2xl.border.border-line-2.p-6').elementHandles();
      log('  变式题卡数:', tcards.length);
      for (let i = 0; i < tcards.length; i++) {
        const stem = await tcards[i].$eval('p', (e) => e.textContent.replace(/^\d+\.\s*/, '').trim()).catch(() => null);
        const ans = stem ? await answerOfStem(stem) : null;
        const opts = await tcards[i].$$('button');
        let clicked = false;
        for (const b of opts) {
          const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null);
          if (key && key === ans) { await b.click(); clicked = true; break; }
        }
        if (!clicked && opts[0]) await opts[0].click();
      }
      await sleep(400);
      await safe('提交训练', () => page.locator('button:has-text("提交训练")').click());
      await sleep(2000);
      await shot('09-training-result');
      // 复测
      const hasRetest = await page.locator('button:has-text("提交复测")').count();
      if (hasRetest > 0) {
        log('  进入复测');
        const rcards = await page.locator('div.rounded-2xl.border.border-line-2.p-6').elementHandles();
        for (let i = 0; i < rcards.length; i++) {
          const stem = await rcards[i].$eval('p', (e) => e.textContent.replace(/^\d+\.\s*/, '').trim()).catch(() => null);
          const ans = stem ? await answerOfStem(stem) : null;
          const opts = await rcards[i].$$('button');
          let clicked = false;
          for (const b of opts) {
            const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null);
            if (key && key === ans) { await b.click(); clicked = true; break; }
          }
          if (!clicked && opts[0]) await opts[0].click();
        }
        await sleep(400);
        await safe('提交复测', () => page.locator('button:has-text("提交复测")').click());
        await sleep(2000);
        await shot('10-retest');
        await safe('复测面板文本', async () => {
          const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 900);
          log('  [复测面板]', t);
        });
      } else {
        log('  本次训练 score<0.6 或未触发复测（仍截图留存）');
      }
    }
  } else {
    log('  !! 未出现靶向训练按钮（诊断面板可能未渲染或题型非预期）');
  }

  log('[done] 走查完成，截图在', SHOTS);
  await browser.close();
}
main().catch((e) => { log('FATAL', e); process.exit(1); });
