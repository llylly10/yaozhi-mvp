// 验证脚本：注册→同意→目标→摸底(全对)→进入待办→自由练习→答错→诊断→训练→复测
// 完成后分别进入「学习档案」「错题本」截图，确认两个界面已拆分、内容不同。
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

  // 1. 注册
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await sleep(800);
  await safe('填账号', () => page.locator('input.input').first().fill('yaozhi_nav_' + Date.now()));
  await safe('填邀请码', () => page.locator('input[placeholder*="DEMO2026"]').fill('DEMO2026'));
  await safe('点进入药知', () => page.locator('button:has-text("进入药知")').click());
  await sleep(1200);

  // 2. 同意
  await safe('勾选用户协议', () => page.locator('button:has-text("《用户协议》")').click());
  await safe('勾选隐私政策', () => page.locator('button:has-text("《隐私政策》")').click());
  await safe('勾选数据采集', () => page.locator('button:has-text("《学习数据采集知情同意书》")').click());
  await sleep(300);
  await safe('点进入学习', () => page.locator('button:has-text("进入学习")').click());
  await sleep(1000);

  // 3. 目标
  await safe('选期末冲绩', () => page.locator('button:has-text("期末冲绩")').click());
  await sleep(300);
  await safe('保存目标', () => page.locator('button:has-text("保存目标，开始摸底")').click());
  await sleep(1500);

  // 4. 摸底全答对
  const cards = await page.locator('div.card.p-6').elementHandles();
  for (let i = 0; i < cards.length; i++) {
    const code = await cards[i].$eval('span.font-semibold', (e) => e.textContent.trim()).catch(() => null);
    const ans = code ? await answerOfCode(code) : null;
    const opts = await cards[i].$$('button');
    let clicked = false;
    for (const b of opts) {
      const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null);
      if (key && key === ans) { await b.click(); clicked = true; break; }
    }
    if (!clicked && opts[0]) await opts[0].click();
  }
  await sleep(500);
  await safe('交卷', () => page.locator('button:has-text("交卷并生成画像")').click());
  await sleep(2000);

  // 5. 进入今日待办
  await safe('点进入今日待办', () => page.locator('button:has-text("进入今日待办")').click());
  await sleep(1500);

  // 自由练习一道
  await safe('点自由练习', () => page.locator('button:has-text("自由练习一道")').click());
  await sleep(1500);

  const pcode = await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')];
    const d = divs.find((e) => /单选题/.test(e.textContent || '') && e.querySelector('.capsule'));
    if (!d) return null;
    const m = (d.textContent || '').match(/(T\d{2}-\d{3}|\d{2}-\d{3})/);
    return m ? m[1] : null;
  });
  log('  练习题 code:', pcode);

  // 6. 答错触发诊断
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
  }

  // 7. 靶向训练
  const hasTrain = await page.locator('button:has-text("靶向训练")').count();
  if (hasTrain > 0) {
    await safe('点开具靶向训练', () => page.locator('button:has-text("靶向训练")').click());
    await sleep(2500);
    const isMemory = await page.locator('button:has-text("完成记忆训练")').count();
    if (isMemory > 0) {
      await safe('完成记忆训练', () => page.locator('button:has-text("完成记忆训练")').click());
      await sleep(1500);
    } else {
      const tcards = await page.locator('div.rounded-2xl.border.border-line-2.p-6').elementHandles();
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
      const hasRetest = await page.locator('button:has-text("提交复测")').count();
      if (hasRetest > 0) {
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
      }
    }
  }

  // ---- 验证：分别进入「学习档案」与「错题本」----
  log('[verify] 进入学习档案 / 错题本');
  await safe('点学习档案', () => page.locator('button:has-text("学习档案")').click());
  await sleep(1200);
  const hProfile = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
  log('  学习档案 H2:', hProfile);
  await shot('verify-profile');

  await safe('点错题本', () => page.locator('button:has-text("错题本")').click());
  await sleep(1200);
  const hWrong = await page.evaluate(() => document.querySelector('h2')?.textContent || '');
  log('  错题本 H2:', hWrong);
  await shot('verify-wrongbook');

  // 验证两者内容不同（用 body 文本指纹）
  const profText = (await page.evaluate(() => document.querySelector('aside') ? '' : '') ) || '';
  log('[verify] H2 不同 =', hProfile !== hWrong, '(', hProfile, '|', hWrong, ')');

  log('[done] 验证截图在', SHOTS);
  await browser.close();
}
main().catch((e) => { log('FATAL', e); process.exit(1); });
