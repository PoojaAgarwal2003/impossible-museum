import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import * as THREE from 'three';
import { ARTIFACTS } from '../src/escape.ts';

const url = process.env.MUSEUM_URL ?? 'http://127.0.0.1:5175';
const artifacts = resolve('artifacts', 'escape');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: true });
const errors = [];
const external = [];
const passed = [];
const check = message => { passed.push(message); console.log(`PASS ${message}`); };
const artifact = id => ARTIFACTS.find(item => item.id === id);
let page;

function observe(target) {
  target.on('pageerror', error => errors.push(String(error)));
  target.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  target.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  target.on('request', request => { if (request.url().startsWith('http') && new URL(request.url()).origin !== new URL(url).origin) external.push(request.url()); });
}

async function ready(target) {
  await target.goto(url);
  await expect(target.locator('#app')).toHaveClass('ready', { timeout: 60_000 });
  await expect(target.locator('#error')).toBeHidden();
}

async function begin(target) {
  await target.locator('#escape-enter').click();
  await expect(target.locator('#app')).toHaveAttribute('data-escape', 'true');
  await expect(target.locator('#clue-journal')).toBeVisible();
  await target.locator('[data-close="clue-journal"]').click();
}

async function visit(room) {
  await page.locator(`.exhibit-card[data-room="${room}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-room', room);
  await expect(page.locator('#transition')).not.toHaveClass('active');
  await page.waitForTimeout(150);
}

async function coordinate(axis) {
  return Number(await page.locator('#app').getAttribute(`data-${axis}`));
}

async function moveAxis(axis, target) {
  const start = await coordinate(axis);
  if (Math.abs(start - target) < 0.18) return;
  const positive = target > start;
  const key = axis === 'x' ? positive ? 'd' : 'a' : positive ? 's' : 'w';
  await page.keyboard.down(key);
  try {
    await expect.poll(async () => positive ? await coordinate(axis) >= target - 0.18 : await coordinate(axis) <= target + 0.18, { timeout: 20_000, intervals: [100] }).toBe(true);
  } finally { await page.keyboard.up(key); }
}

async function approach(id) {
  const item = artifact(id);
  assert.ok(item);
  const x = item.x === 0 ? 1.35 : item.x - Math.sign(item.x) * 1.35;
  await moveAxis('x', x);
  await moveAxis('z', item.z + 1.35);
  await expect(page.locator('#inspect-nearby')).toHaveAttribute('data-artifact', id);
}

async function inspect(id) {
  await approach(id);
  await page.keyboard.press('e');
  await expect(page.locator('#inspection')).toBeVisible();
  await expect(page.locator('#inspection-title')).toHaveText(artifact(id).title);
}

async function closeInspection() {
  await page.locator('[data-close="inspection"]').click();
  await expect(page.locator('#inspection')).toBeHidden();
}

async function shiftTo(face) {
  for (let i = 0; i < 4; i++) {
    const current = Number(await page.locator('#app').getAttribute('data-gravity'));
    if (current === face) return;
    await page.keyboard.press('q');
    await expect(page.locator('#app')).toHaveAttribute('data-gravity', String((current + 1) % 4));
    await page.waitForTimeout(150);
  }
  throw new Error(`Could not reach gravity face ${face}`);
}

async function submit() {
  await page.locator('#inspection-controls button[type="submit"]').click();
}

async function signs(values) {
  for (let i = 0; i < 3; i++) await page.locator(`#space-symbol-${i}`).selectOption(values[i]);
}

async function snapshot(name) {
  await page.screenshot({ path: resolve(artifacts, `${name}.png`) });
}

try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  observe(page);
  await ready(page);
  await snapshot('01-escape-entry');
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-seals', '0');
  await expect(page.locator('#exhibit-action')).toBeHidden();
  await inspect('curator');
  await expect(page.locator('#inspection-body')).toContainText('CLOSING PROTOCOL');
  await page.waitForTimeout(180);
  const startX = await coordinate('x');
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  assert.equal(await coordinate('x'), startX, 'inspection freezes walking');
  await snapshot('02-curator-notebook');
  await closeInspection();
  const camera = new THREE.PerspectiveCamera(62, 1440 / 900, 0.07, 200);
  camera.position.set(await coordinate('x'), 1.72, await coordinate('z'));
  camera.quaternion.setFromEuler(new THREE.Euler(0.025, 0, 0, 'YXZ'));
  camera.updateMatrixWorld();
  const marker = new THREE.Vector3(artifact('curator').x, 2, artifact('curator').z).project(camera);
  assert.ok(Math.abs(marker.x) < 1 && Math.abs(marker.y) < 1, 'the nearby artifact marker is in view');
  await page.mouse.click((marker.x + 1) * 720, (1 - marker.y) * 450);
  await expect(page.locator('#inspection-title')).toHaveText(artifact('curator').title);
  await expect(page.locator('#inspection')).toBeVisible();
  await closeInspection();
  await page.keyboard.press('j');
  await expect(page.locator('[data-clue="curator"]')).toBeVisible();
  await expect(page.locator('#hint-text')).toContainText('unless you ask');
  await page.locator('[data-close="clue-journal"]').click();
  check('escape starts explicitly; keyboard and ray-cast clicks inspect physical artifacts and pause movement');

  await inspect('exit-lock');
  await page.locator('#escape-code').fill('247');
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('Three seals');
  await expect(page.locator('#app')).toHaveAttribute('data-exit-unlocked', 'false');
  await closeInspection();
  check('knowing the exit code cannot bypass the seal chain');

  await visit('unfolded');
  await expect(page.locator('#exhibit-action kbd')).toHaveText('Q');
  await inspect('space-note');
  await closeInspection();
  await inspect('space-lock');
  await signs(['EYE', 'KEY', 'MOON']);
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('both surveys');
  await closeInspection();
  await inspect('survey');
  await expect(page.locator('#inspection-body')).toContainText('SHELF III      SUN');
  await closeInspection();
  await page.keyboard.press('q');
  await expect(page.locator('#app')).toHaveAttribute('data-unfolded', 'true');
  await page.waitForTimeout(150);
  await inspect('survey');
  await expect(page.locator('#inspection-body')).toContainText('SHELF III      STAR');
  await closeInspection();
  await inspect('space-lock');
  await signs(['MOON', 'KEY', 'EYE']);
  await submit();
  await expect(page.locator('#inspection-feedback')).toHaveAttribute('data-success', 'false');
  await signs(['EYE', 'KEY', 'MOON']);
  await submit();
  await expect(page.locator('#app')).toHaveAttribute('data-seals', '1');
  await snapshot('03-space-seal');
  await closeInspection();
  check('space requires observing both actual hall states and solving the shelf-order cipher');

  await visit('gravity');
  await inspect('gravity-note');
  await closeInspection();
  for (const [id, face] of [['seed', 0], ['branch', 1], ['root', 2], ['flower', 3]]) {
    await shiftTo(face);
    await inspect(id);
    await expect(page.locator('#inspection-body')).toContainText(id.toUpperCase());
    if (id === 'seed') {
      await submit();
      await expect(page.locator('#inspection-feedback')).toContainText('Inspect all four');
    }
    await closeInspection();
  }
  await inspect('flower');
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('chain breaks');
  await expect(page.locator('#app')).toHaveAttribute('data-seals', '1');
  await closeInspection();
  await shiftTo(2);
  await inspect('root');
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('Witness 1 of 4');
  await closeInspection();
  await ready(page);
  await expect(page.locator('#escape-enter')).toContainText('Resume');
  await begin(page);
  await expect(page.locator('#app')).toHaveAttribute('data-seals', '1');
  await visit('gravity');
  for (const [id, face, count] of [['branch', 1, 2], ['flower', 3, 3], ['seed', 0, 4]]) {
    await shiftTo(face);
    await inspect(id);
    await submit();
    if (count < 4) await expect(page.locator('#inspection-feedback')).toContainText(`Witness ${count} of 4`);
    else await expect(page.locator('#app')).toHaveAttribute('data-seals', '2');
    await closeInspection();
  }
  check('the four-surface witness puzzle rejects wrong orders and resumes a partial sequence after reload');

  await visit('recursive');
  await inspect('recursion-note');
  await closeInspection();
  await inspect('registry');
  await page.locator('#escape-word').fill('KEY');
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('both the first and the second');
  await closeInspection();
  for (let depth = 1; depth <= 2; depth++) {
    await page.keyboard.press('q');
    await expect(page.locator('#app')).toHaveAttribute('data-depth', String(depth));
    await visit('recursive');
    await inspect('registry');
    await expect(page.locator('#inspection-body')).toContainText(depth === 1 ? 'TELL' : 'YELL');
    await expect(page.locator('#escape-word')).toHaveCount(0);
    await page.keyboard.press('r');
    await expect(page.locator('#app')).toHaveAttribute('data-depth', String(depth));
    await closeInspection();
  }
  await page.keyboard.press('r');
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '0');
  await visit('recursive');
  await inspect('registry');
  await page.locator('#escape-word').fill('WAY');
  await submit();
  await expect(page.locator('#inspection-feedback')).toHaveAttribute('data-success', 'false');
  await page.locator('#escape-word').fill('key');
  await submit();
  await expect(page.locator('#app')).toHaveAttribute('data-seals', '3');
  await closeInspection();
  await page.keyboard.press('j');
  await expect(page.locator('[data-clue="echo-one"]')).toBeVisible();
  await expect(page.locator('[data-clue="echo-two"]')).toBeVisible();
  await expect(page.locator('.seal-slot.recovered')).toHaveCount(3);
  await snapshot('04-collected-clues');
  await page.locator('[data-close="clue-journal"]').click();
  check('recursion demands two observed echoes and certification at the original registry');

  await page.keyboard.press('q');
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '1');
  await inspect('exit-lock');
  await page.locator('#escape-code').fill('247');
  await submit();
  await expect(page.locator('#inspection-feedback')).toContainText('copy of the exit');
  await closeInspection();
  await page.keyboard.press('r');
  await expect(page.locator('#app')).toHaveAttribute('data-depth', '0');
  await inspect('exit-lock');
  await page.locator('#escape-code').fill('472');
  await submit();
  await expect(page.locator('#inspection-feedback')).toHaveAttribute('data-success', 'false');
  await page.locator('#escape-code').fill('247');
  await submit();
  await expect(page.locator('#app')).toHaveAttribute('data-exit-unlocked', 'true');
  await expect(page.locator('#app')).toHaveAttribute('data-escaped', 'false');
  await closeInspection();
  await page.keyboard.press('r');
  await page.waitForTimeout(200);
  await page.keyboard.down('ArrowLeft');
  try {
    await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-yaw')), { timeout: 8000, intervals: [50] }).toBeGreaterThan(3.03);
  } finally { await page.keyboard.up('ArrowLeft'); }
  await page.mouse.move(720, 340);
  await page.mouse.down();
  await page.mouse.move(720, 240, { steps: 8 });
  await page.mouse.up();
  await snapshot('05-open-departure-door');
  await page.keyboard.down('w');
  try { await expect(page.locator('#escape-ending')).toBeVisible({ timeout: 8000 }); }
  finally { await page.keyboard.up('w'); }
  await expect(page.locator('#escape-ending')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-escaped', 'true');
  await snapshot('06-escaped');
  await page.locator('#ending-explore').click();
  await expect(page.locator('#app')).toHaveAttribute('data-escape', 'false');
  await visit('unfolded');
  await expect(page.locator('#exhibit-action kbd')).toHaveText('E');
  check('copies cannot unlock the exit; departure order plus walking through the door wins, and free exploration remains available');
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  observe(mobile);
  await ready(mobile);
  const entry = await mobile.locator('#escape-enter').boundingBox();
  assert.ok(entry && entry.y >= 0 && entry.y + entry.height < 844, 'escape entry fits the phone viewport');
  await mobile.locator('#escape-enter').tap();
  await mobile.locator('[data-close="clue-journal"]').tap();
  const left = await mobile.locator('[data-move="KeyA"]').boundingBox();
  const touch = await mobile.context().newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: left.x + left.width / 2, y: left.y + left.height / 2 }] });
  await expect(mobile.locator('#inspect-nearby')).toHaveAttribute('data-artifact', 'curator', { timeout: 8000 });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.locator('#inspect-nearby').tap();
  await expect(mobile.locator('#inspection-title')).toHaveText("The curator's notebook");
  await mobile.screenshot({ path: resolve(artifacts, '07-mobile-inspection.png') });
  await mobile.locator('[data-close="inspection"]').tap();
  await mobile.locator('#open-journal').tap();
  await mobile.locator('#reveal-hint').tap();
  await expect(mobile.locator('#hint-text')).toContainText('two versions');
  await mobile.locator('#reveal-hint').tap();
  await expect(mobile.locator('#reveal-hint')).toContainText('solution-level');
  await expect(mobile.locator('#app')).toHaveAttribute('data-seals', '0');
  await mobile.locator('[data-close="clue-journal"]').tap();
  await mobile.setViewportSize({ width: 844, height: 390 });
  await ready(mobile);
  const landscapeEntry = await mobile.locator('#escape-enter').boundingBox();
  assert.ok(landscapeEntry && landscapeEntry.y + landscapeEntry.height <= 390);
  check('touch users can reach artifacts, inspect them, collect clues, and request optional hints in portrait and landscape');
  await mobile.close();

  const blocked = await browser.newPage({ reducedMotion: 'reduce' });
  observe(blocked);
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await ready(blocked);
  await begin(blocked);
  page = blocked;
  await inspect('curator');
  await closeInspection();
  await page.keyboard.press('j');
  await expect(page.locator('#journal-stats')).toContainText('this visit only');
  await expect(page.locator('[data-clue="curator"]')).toBeVisible();
  check('blocked storage is reported while the in-memory escape challenge remains playable');
  await blocked.close();

  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  check('escape playthrough has no browser errors or external requests');
  await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({ passed, errors, external }, null, 2));
  console.log(`\n${passed.length} escape browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: resolve(artifacts, 'failure.png') });
  await writeFile(resolve(artifacts, 'failure.json'), JSON.stringify({ error: String(error), errors, external, passed }, null, 2));
  throw error;
} finally {
  await browser.close();
}
