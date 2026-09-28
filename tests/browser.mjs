import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const url = process.env.MUSEUM_URL ?? 'http://127.0.0.1:5175';
const artifacts = resolve('artifacts', 'browser');
await mkdir(artifacts, { recursive: true });
const channel = process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ channel, headless: true });
const errors = [];
const external = [];
const passed = [];
const check = name => { passed.push(name); console.log(`PASS ${name}`); };

function observe(page, includeErrors = true) {
  if (includeErrors) {
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  }
  page.on('request', request => {
    if (request.url().startsWith('http') && new URL(request.url()).origin !== new URL(url).origin) external.push(request.url());
  });
}

async function ready(page) {
  await page.goto(url);
  await expect(page.locator('#app')).toHaveClass('ready', { timeout: 60_000 });
  await expect(page.locator('#error')).toBeHidden();
  await expect(page.locator('#enter')).toBeEnabled();
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`) });
}

async function visit(page, room) {
  await page.locator(`.exhibit-card[data-room="${room}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-room', room);
  await expect(page.locator('#transition')).not.toHaveClass('active');
  await page.waitForTimeout(350);
}

async function holdUntil(page, key, condition) {
  await page.keyboard.down(key);
  try { await expect.poll(condition, { timeout: 20_000, intervals: [150] }).toBe(true); }
  finally { await page.keyboard.up(key); }
}

async function imageStats(page) {
  return page.evaluate(() => {
    const source = document.querySelector('#viewport canvas');
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 80;
    const context = canvas.getContext('2d');
    context.drawImage(source, 0, 0, 120, 80);
    const data = context.getImageData(0, 0, 120, 80).data;
    const colors = new Set();
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      if (data[i] + data[i + 1] + data[i + 2] > 160) lit++;
    }
    return { colors: colors.size, lit, width: source.width, height: source.height };
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  observe(page);
  await ready(page);
  await capture(page, '01-arrival');
  const initial = await imageStats(page);
  assert.ok(initial.colors > 100 && initial.lit > 2000, `Rendered architecture must not be blank: ${JSON.stringify(initial)}`);
  check('landing scene renders substantial nonblank architecture');
  await page.locator('#enter').click();
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('.exhibit-card')).toHaveCount(3);
  await capture(page, '02-atrium');
  const frameRate = await page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    let frames = 0;
    function sample(now) {
      frames++;
      if (now - start >= 1800) resolve(Math.round(frames * 1000 / (now - start)));
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
  console.log(`Balanced desktop frame rate: ${frameRate} fps`);
  await page.locator('#help').click();
  await page.locator('#reduced-motion').check();
  await page.locator('#close-guide').click();

  await visit(page, 'unfolded');
  await page.locator('#exhibit-action').click();
  await expect(page.locator('#app')).toHaveAttribute('data-unfolded', 'true');
  await page.waitForTimeout(200);
  await capture(page, '03-unfolded-hall');
  await page.keyboard.press('e');
  await expect(page.locator('#app')).toHaveAttribute('data-unfolded', 'false');
  check('the oversized hall unfolds and folds with button and keyboard');

  await visit(page, 'gravity');
  await capture(page, '04-gravity-garden');
  const before = createHash('sha256').update(await page.locator('canvas').screenshot()).digest('hex');
  await page.locator('#exhibit-action').click();
  await expect(page.locator('#app')).toHaveAttribute('data-gravity', '1');
  await page.waitForTimeout(300);
  const after = createHash('sha256').update(await page.locator('canvas').screenshot()).digest('hex');
  assert.notEqual(before, after, 'gravity changes the rendered viewpoint');
  await capture(page, '05-walking-on-the-wall');
  const startZ = Number(await page.locator('#app').getAttribute('data-z'));
  await holdUntil(page, 'w', async () => Number(await page.locator('#app').getAttribute('data-z')) < startZ - 0.5);
  check('gravity rotates the viewpoint and walking works on the wall');

  await holdUntil(page, 's', async () => await page.locator('#app').getAttribute('data-room') === 'atrium');
  await expect(page.locator('#transition')).not.toHaveClass('active');
  await page.waitForTimeout(300);
  await holdUntil(page, 's', async () => await page.locator('#app').getAttribute('data-room') === 'gravity');
  await expect(page.locator('#transition')).not.toHaveClass('active');
  check('walking crosses the rotated return portal and re-enters through the atrium portal');
  for (let i = 2; i <= 4; i++) {
    await page.locator('#exhibit-action').click();
    await expect(page.locator('#app')).toHaveAttribute('data-gravity', String(i % 4));
    await page.waitForTimeout(100);
  }
  check('all four gravity orientations cycle back to the original floor');

  await visit(page, 'recursive');
  await capture(page, '06-museum-within');
  await page.locator('#exhibit-action').click();
  await expect(page.locator('#app')).toHaveAttribute('data-room', 'atrium');
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '1');
  await visit(page, 'recursive');
  await page.keyboard.press('e');
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '2');
  await page.locator('#home').click();
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '0');
  await expect(page.locator('#discovered')).toHaveText('3 / 3 DISCOVERED');
  check('miniature recursion is repeatable; returning to the surface resets scale');

  await page.keyboard.down('w');
  await page.keyboard.press('h');
  await expect(page.locator('#guide')).toBeVisible();
  await page.keyboard.up('w');
  await page.waitForTimeout(150);
  const guideZ = await page.locator('#app').getAttribute('data-z');
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#app').getAttribute('data-z'), guideZ);
  await page.locator('#quality').selectOption('low');
  await page.locator('#pause').check();
  await page.locator('#close-guide').click();
  await page.waitForTimeout(250);
  assert.ok((await imageStats(page)).colors > 100);
  check('visitor guide suspends walking; low-power rendering and pause remain usable');

  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-pressed', 'false');
  check('ambient sound starts only by gesture and can be muted');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#capture').click();
  const download = await downloadEvent;
  const postcard = resolve(artifacts, 'postcard.png');
  await download.saveAs(postcard);
  const png = await readFile(postcard);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(png.length > 40_000);
  check('postcard export downloads a substantial valid PNG');
  await ready(page);
  await page.locator('#enter').click();
  await expect(page.locator('#discovered')).toHaveText('3 / 3 DISCOVERED');
  check('discoveries persist across reloads');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  observe(mobile);
  await ready(mobile);
  await capture(mobile, '07-mobile-arrival');
  await mobile.locator('#enter').click();
  await expect(mobile.locator('.touch-controls')).toBeVisible();
  const mobileZ = Number(await mobile.locator('#app').getAttribute('data-z'));
  const forward = mobile.locator('[data-move="KeyW"]');
  const forwardBounds = await forward.boundingBox();
  assert.ok(forwardBounds);
  const touch = await mobile.context().newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: forwardBounds.x + forwardBounds.width / 2, y: forwardBounds.y + forwardBounds.height / 2 }] });
  await expect.poll(async () => Number(await mobile.locator('#app').getAttribute('data-z')), { timeout: 5000 }).toBeLessThan(mobileZ - 0.3);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 290, y: 260 }] });
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 290 - i * 9, y: 260 + i }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => Math.abs(Number(await mobile.locator('#app').getAttribute('data-yaw')))).toBeGreaterThan(0.1);
  await visit(mobile, 'gravity');
  await mobile.locator('#exhibit-action').click();
  await expect(mobile.locator('#app')).toHaveAttribute('data-gravity', '1');
  await capture(mobile, '08-mobile-gravity');
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  check('mobile layout, directional controls, drag looking, and gravity work without horizontal overflow');
  await mobile.setViewportSize({ width: 844, height: 390 });
  await ready(mobile);
  const landscapeButton = await mobile.locator('#enter').boundingBox();
  assert.ok(landscapeButton && landscapeButton.y >= 0 && landscapeButton.y + landscapeButton.height <= 390, 'landscape entry button remains inside the viewport');
  await mobile.locator('#enter').click();
  await expect(mobile.locator('.touch-controls')).toBeVisible();
  await capture(mobile, '09-mobile-landscape');
  check('phone landscape keeps the entry and movement controls reachable');
  await mobile.close();

  const storage = await browser.newPage({ viewport: { width: 1000, height: 750 }, reducedMotion: 'reduce' });
  observe(storage);
  await storage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await ready(storage);
  await expect(storage.locator('#toast')).toContainText('could not be loaded');
  await storage.locator('#enter').click();
  await visit(storage, 'unfolded');
  await expect(storage.locator('#toast')).toContainText('could not save');
  await expect(storage.locator('#error')).toBeHidden();
  check('blocked browser storage is reported without breaking exploration');
  await storage.close();

  const unsupported = await browser.newPage();
  observe(unsupported, false);
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === 'webgl2' ? null : original.call(this, type, ...args);
    };
  });
  await unsupported.goto(url);
  await expect(unsupported.locator('#error')).toBeVisible({ timeout: 30_000 });
  await expect(unsupported.locator('#error-message')).toContainText('WebGL 2');
  await expect(unsupported.locator('#retry')).toBeVisible();
  check('missing WebGL presents an actionable error and retry control');
  await unsupported.close();

  assert.deepEqual(errors, [], 'No runtime, shader, network, or browser errors');
  assert.deepEqual(external, [], 'No runtime third-party requests');
  check('no browser errors or external requests');
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ passed, frameRate, initial, errors, external }, null, 2));
  console.log(`\n${passed.length} browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  await writeFile(resolve(artifacts, 'failure.json'), JSON.stringify({ error: String(error), errors, external, passed }, null, 2));
  throw error;
} finally {
  await browser.close();
}
