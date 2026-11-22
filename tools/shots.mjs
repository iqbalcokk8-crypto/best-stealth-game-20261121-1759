// BAYANG SENJA — screenshot + playtest runner.
// Serves game/ on localhost, captures every scene in shots.json through the
// real ?shot= staging (the autopilot plays the real rules forward), then
// playtests the live game: start, walk, throw a coin, pause.
// Usage: node tools/shots.mjs [repo-dir]
// Needs playwright-core (tools/node_modules is a symlink to shot-tools').
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] ?? '.');
const PORT = 8091;
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`http://localhost:${PORT}/index.html`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('server did not come up');
}

let code = 0;
try {
  await waitServer();
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });

  for (const shot of shots) {
    await page.goto(`http://localhost:${PORT}/index.html${shot.query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 30000 });
    await page.waitForTimeout(150);
    const out = join(repo, 'screenshots', shot.name);
    await page.screenshot({ path: out, type: 'jpeg', quality: 82 });
    const size = statSync(out).size;
    console.log(`${shot.name}: ${size} bytes${size > 262144 ? '  *** OVER 256 KiB CAP ***' : ''}`);
  }

  // --- click-to-start: a click on the title must start the game (R3 fix) ---
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const titleBefore = await page.evaluate(() => window.__bayang.screen);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  const clickStart = await page.evaluate(() => ({ screen: window.__bayang.screen, coinsLeft: window.__bayang.state.coinsLeft }));
  const clickOk = titleBefore === 'title' && clickStart.screen === 'play' && clickStart.coinsLeft === 3;
  console.log('click-to-start:', JSON.stringify({ titleBefore, ...clickStart }), clickOk ? 'PASS (start click did not become a coin throw)' : '*** FAIL ***');

  // --- same-frame Space + click must not leak the click into a coin throw (R4) ---
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  const bothStart = await page.evaluate(() => ({ screen: window.__bayang.screen, coinsLeft: window.__bayang.state.coinsLeft }));
  const bothOk = bothStart.screen === 'play' && bothStart.coinsLeft === 3;
  console.log('space+click same frame:', JSON.stringify(bothStart), bothOk ? 'PASS (click consumed, no coin thrown)' : '*** FAIL ***');

  // --- live playtest: start, walk right, throw a coin, pause ---
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => ({ x: Math.round(window.__bayang.state.player.x), screen: window.__bayang.screen }));
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyD');
  await page.mouse.click(640, 400);
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({
    x: Math.round(window.__bayang.state.player.x),
    screen: window.__bayang.screen,
    coinsLeft: window.__bayang.state.coinsLeft,
    status: document.querySelector('#status')?.textContent ?? '',
  }));
  console.log('playtest before:', JSON.stringify(before), 'after:', JSON.stringify(after));
  await page.screenshot({ path: '/tmp/bayang-playtest.jpg', type: 'jpeg', quality: 82 });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
} catch (err) {
  console.error('FAILED:', err.message);
  code = 1;
} finally {
  server.kill();
}
process.exit(code);
