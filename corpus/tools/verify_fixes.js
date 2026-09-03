// 验证两处修复：① 追问提交后对话保留且给出 AI 结论（不再整体消失）；② 完成闭环后待办出现「已完成 ✓」
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
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--proxy-server=direct://', '--proxy-bypass-list=*'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') log('  [browser-error]', m.text()); });
  page.on('pageerror', (e) => log('  [pageerror]', e.message));
  const shot = async (n) => { try { await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); log('  SHOT', n); } catch (e) { log('  shot-fail', n, e.message); } };
  const safe = async (l, fn) => { try { await fn(); } catch (e) { log('  !! ' + l + ' 失败:', e.message); } };
  const body = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  const allDiag = await (await fetch(`${API}/questions?usage=diagnostic&limit=3000`)).json();
  const allTrain = await (await fetch(`${API}/questions?usage=training&limit=3000`)).json();
  const allRetest = await (await fetch(`${API}/questions?usage=retest&limit=3000`)).json();
  const byCode = {}; [...allDiag, ...allTrain, ...allRetest].forEach((q) => { byCode[q.code] = q; });
  const stemToId = {}; [...allDiag, ...allTrain, ...allRetest].forEach((q) => { if (q.stem) stemToId[q.stem.trim()] = q.id; });
  const ansCache = {};
  async function answerOfCode(code) { if (ansCache[code]) return ansCache[code]; const id = byCode[code] && byCode[code].id; if (!id) return null; try { const r = await (await fetch(`${API}/questions/${id}/analysis`)).json(); ansCache[code] = r.answer; return r.answer; } catch { return null; } }
  async function answerOfStem(stem) { const id = stemToId[stem.trim()]; if (!id) return null; try { const r = await (await fetch(`${API}/questions/${id}/analysis`)).json(); return r.answer; } catch { return null; } }

  // 1-5 登录到自由练习
  log('[1] 注册'); await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await sleep(800);
  await safe('账号', () => page.locator('input.input').first().fill('yaozhi_' + Date.now()));
  await safe('邀请码', () => page.locator('input[placeholder*="DEMO2026"]').fill('DEMO2026'));
  await safe('进入', () => page.locator('button:has-text("进入药知")').click()); await sleep(1200);
  log('[2] 同意'); await safe('协议', () => page.locator('button:has-text("《用户协议》")').click()); await safe('隐私', () => page.locator('button:has-text("《隐私政策》")').click()); await safe('采集', () => page.locator('button:has-text("《学习数据采集知情同意书》")').click()); await sleep(300);
  await safe('进入学习', () => page.locator('button:has-text("进入学习")').click()); await sleep(1000);
  log('[3] 目标'); await safe('期末', () => page.locator('button:has-text("期末冲绩")').click()); await sleep(300); await safe('保存', () => page.locator('button:has-text("保存目标，开始摸底")').click()); await sleep(1500);
  log('[4] 摸底全对'); const cards = await page.locator('div.card.p-6').elementHandles();
  for (let i = 0; i < cards.length; i++) { const code = await cards[i].$eval('span.font-semibold', (e) => e.textContent.trim()).catch(() => null); const ans = code ? await answerOfCode(code) : null; const opts = await cards[i].$$('button'); let clicked = false; for (const b of opts) { const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null); if (key && key === ans) { await b.click(); clicked = true; break; } } if (!clicked && opts[0]) await opts[0].click(); }
  await sleep(500); await safe('交卷', () => page.locator('button:has-text("交卷并生成画像")').click()); await sleep(2000);
  log('[5] 进入待办'); await safe('进入今日待办', () => page.locator('button:has-text("进入今日待办")').click()); await sleep(1500);
  await safe('自由练习', () => page.locator('button:has-text("自由练习一道")').click()); await sleep(1500);
  const pcode = await page.evaluate(() => { const divs = [...document.querySelectorAll('div')]; const d = divs.find((e) => /单选题/.test(e.textContent || '') && e.querySelector('.capsule')); if (!d) return null; const m = (d.textContent || '').match(/(T\d{2}-\d{3}|\d{2}-\d{3})/); return m ? m[1] : null; });
  log('  练习题 code:', pcode);

  // 6 答错
  log('[6] 答错 → 诊断'); const pAns = pcode ? await answerOfCode(pcode) : null;
  if (pAns) { await page.evaluate((ans) => { const card = document.querySelector('.card.relative.overflow-hidden') || document.querySelector('.card'); const btns = [...card.querySelectorAll('button')].filter((b) => { const s = b.querySelector('span span'); return s && /^[A-E]$/.test((s.textContent || '').trim()); }); const wrong = btns.find((b) => { const s = b.querySelector('span span'); return (s.textContent || '').trim() !== ans; }); (wrong || btns[0]).click(); }, pAns); await sleep(400); await safe('提交', () => page.locator('button:has-text("提交答案")').click()); await sleep(2500); }
  await shot('11-diagnosis');

  // 7 追问：点开并提交
  log('[7] 追问'); const hasFollowupBtn = await page.locator('button:has-text("追问对话")').count();
  log('  追问对话按钮数:', hasFollowupBtn);
  if (hasFollowupBtn > 0) {
    await safe('点开追问', () => page.locator('button:has-text("追问对话")').click()); await sleep(1500);
    await shot('12-followup-open');
    // 判断追问形态：选项题 / 开放题
    const hasOptions = await page.locator('div.card.p-8').last().locator('button').filter({ has: page.locator('span span:text-matches("^[A-E]$")') }).count();
    if (hasOptions > 0) {
      await page.evaluate(() => { const cards = [...document.querySelectorAll('div.card.p-8')]; const fc = cards.find((c) => /药知向你提问/.test(c.textContent || '')); if (!fc) return; const btns = [...fc.querySelectorAll('button')].filter((b) => { const s = b.querySelector('span span'); return s && /^[A-E]$/.test((s.textContent || '').trim()); }); (btns[0] || fc.querySelector('button')).click(); });
    } else {
      await safe('填开放追问', () => page.locator('div.card.p-8').last().locator('textarea').fill('我不太确定，需要再理解一下机制'));
      await sleep(300);
      await safe('提交回答', () => page.locator('div.card.p-8').last().locator('button:has-text("提交回答")').click());
    }
    await sleep(3500);
    await shot('13-followup-after');
    const t = await body();
    const kept = /定向追问记录|追问已|已根据你前|可据此开具靶向训练/.test(t);
    log('  [断言] 追问提交后对话保留/结论出现:', kept, kept ? '✅' : '⚠️');
    log('  [正文片段]', t.slice(0, 260));
  } else {
    log('  ⚠️ 本题无「追问对话」入口（followup 未生成），跳过追问断言');
  }

  // 8 训练 + 复测
  log('[8] 靶向训练 → 复测');
  const hasTrain = await page.locator('button:has-text("靶向训练")').count();
  if (hasTrain > 0) {
    await safe('开具训练', () => page.locator('button:has-text("靶向训练")').click()); await sleep(2500); await shot('14-training');
    const isMemory = await page.locator('button:has-text("完成记忆训练")').count();
    if (isMemory > 0) { await safe('记忆训练完成', () => page.locator('button:has-text("完成记忆训练")').click()); await sleep(1500); await shot('15-train-result'); }
    else {
      const tcards = await page.locator('div.rounded-2xl.border.border-line-2.p-6').elementHandles();
      for (let i = 0; i < tcards.length; i++) { const stem = await tcards[i].$eval('p', (e) => e.textContent.replace(/^\d+\.\s*/, '').trim()).catch(() => null); const ans = stem ? await answerOfStem(stem) : null; const opts = await tcards[i].$$('button'); let clicked = false; for (const b of opts) { const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null); if (key && key === ans) { await b.click(); clicked = true; break; } } if (!clicked && opts[0]) await opts[0].click(); }
      await sleep(400); await safe('提交训练', () => page.locator('button:has-text("提交训练")').click()); await sleep(2000); await shot('15-train-result');
      const hasRetest = await page.locator('button:has-text("提交复测")').count();
      if (hasRetest > 0) { const rcards = await page.locator('div.rounded-2xl.border.border-line-2.p-6').elementHandles(); for (let i = 0; i < rcards.length; i++) { const stem = await rcards[i].$eval('p', (e) => e.textContent.replace(/^\d+\.\s*/, '').trim()).catch(() => null); const ans = stem ? await answerOfStem(stem) : null; const opts = await rcards[i].$$('button'); let clicked = false; for (const b of opts) { const key = await b.$eval('span span', (e) => e.textContent.trim()).catch(() => null); if (key && key === ans) { await b.click(); clicked = true; break; } } if (!clicked && opts[0]) await opts[0].click(); } await sleep(400); await safe('提交复测', () => page.locator('button:has-text("提交复测")').click()); await sleep(2000); await shot('16-retest'); }
    }
  } else { log('  ⚠️ 未出现靶向训练按钮'); }

  // 9 返回待办，检查「已完成」
  log('[9] 返回今日待办'); await safe('返回待办', () => page.locator('button:has-text("返回今日待办")').click()); await sleep(2000); await shot('17-todo-after');
  const t2 = await body();
  const doneShown = /已完成/.test(t2) && /掌握/.test(t2);
  log('  [断言] 待办出现「已完成 ✓ 掌握」:', doneShown, doneShown ? '✅' : '⚠️（可能仍在薄弱/学习中，或本次未触发复测通过）');
  log('  [正文片段]', t2.slice(0, 260));

  log('[done] 验证完成'); await browser.close();
}
main().catch((e) => { log('FATAL', e); process.exit(1); });
