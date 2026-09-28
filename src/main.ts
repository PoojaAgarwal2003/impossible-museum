import './style.css';
import * as THREE from 'three';
import { MuseumRenderer } from './renderer.ts';
import type { Quality } from './renderer.ts';
import { MuseumAudio } from './audio.ts';
import { constrain, crossing, DOOR_X, EXHIBITS, recursionLabel, ROOMS, walkingDelta } from './navigation.ts';
import type { ExhibitId, Position, RoomId } from './navigation.ts';

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing museum interface element: ${id}`);
  return found as T;
}

const app = element('app');
const enter = element<HTMLButtonElement>('enter');
const guide = element<HTMLDialogElement>('guide');
const toast = element('toast');
const transition = element('transition');
const action = element<HTMLButtonElement>('exhibit-action');
const audio = new MuseumAudio();
let toastTimer: ReturnType<typeof setTimeout>;
let museum: MuseumRenderer;
let room: RoomId = 'atrium';
let position: Position = { x: 0, z: 8.5 };
let yaw = 0;
let pitch = 0.025;
let entered = false;
let busy = false;
let failed = false;
let depth = 0;
let unfolded = false;
let foldAmount = 1;
let gravityAngle = 0;
let gravityTarget = 0;
let time = 0;
let lastFrame = 0;
let hudTime = 0;
let soundEnabled = false;
let paused = false;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();
const visited = new Set<ExhibitId>();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const roll = new THREE.Quaternion();
const axis = new THREE.Vector3(0, 0, 1);
const doorFlip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const center = new THREE.Vector3(0, 9, 0);
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function notify(message: string): void {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200);
}

function fatal(error: unknown): void {
  failed = true;
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  element('error-message').textContent = error instanceof Error ? error.message : String(error);
  element('error').hidden = false;
  app.classList.remove('loading');
}

function readVisits(): void {
  try {
    const raw = localStorage.getItem('paradox.visits.v1');
    if (!raw) return;
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(item => EXHIBITS.includes(item))) throw new Error('The saved museum visit is not valid.');
    data.forEach(item => visited.add(item as ExhibitId));
  } catch {
    notify('Saved discoveries could not be loaded. You can still explore the entire museum.');
  }
}

function saveVisits(): void {
  try {
    localStorage.setItem('paradox.visits.v1', JSON.stringify([...visited]));
  } catch {
    notify('Your browser could not save discoveries. They will remain available for this visit.');
  }
}

function updateExhibit(): void {
  const spec = ROOMS[room];
  app.dataset.room = room;
  app.dataset.depth = String(depth);
  app.dataset.gravity = String(Math.round(gravityTarget / (Math.PI / 2)) % 4);
  app.dataset.unfolded = String(unfolded);
  element('room-title').textContent = spec.title;
  element('room-index').textContent = `${spec.index} / ${spec.title.toUpperCase()}`;
  element('room-category').textContent = spec.category;
  element('room-description').textContent = spec.description;
  element('depth-label').textContent = recursionLabel(depth);
  element('map-title').textContent = room === 'atrium' ? 'ATRIUM PLAN' : `EXHIBIT ${spec.index}`;
  element('map-doors').style.opacity = room === 'atrium' ? '1' : '0';
  element('map-bearing').textContent = room === 'gravity' ? `${Math.round(gravityTarget * 180 / Math.PI) % 360}° ↓` : 'N ↑';
  element('discovered').textContent = `${visited.size} / 3 DISCOVERED`;
  action.hidden = room === 'atrium';
  element('action-label').textContent = room === 'unfolded' ? unfolded ? 'Fold the hall' : 'Unfold the hall' : room === 'gravity' ? 'Shift gravity' : 'Enter the miniature';
  element('mechanic-status').textContent = room === 'atrium'
    ? depth > 0 ? 'THE MODEL IS NOW YOUR ENTIRE WORLD. R RETURNS TO THE SURFACE.' : 'WALK THROUGH A DOORWAY TO BEGIN.'
    : room === 'unfolded' ? unfolded ? 'SPACE: UNFOLDED / STILL LARGER ON THE INSIDE' : 'EXTERIOR: 4 METRES / INTERIOR: IMPOSSIBLE'
    : room === 'gravity' ? `CURRENT FLOOR: ${['THE FLOOR', 'THE RIGHT WALL', 'THE CEILING', 'THE LEFT WALL'][Math.round(gravityTarget / (Math.PI / 2)) % 4]}`
    : `RECURSION DEPTH: ${String(depth).padStart(2, '0')} / THE VIEW ON THE WALL IS LIVE`;
  document.querySelectorAll<HTMLButtonElement>('.exhibit-card').forEach(button => {
    button.setAttribute('aria-current', String(button.dataset.room === room));
    button.classList.toggle('visited', visited.has(button.dataset.room as ExhibitId));
  });
  element('home').setAttribute('aria-label', depth > 0 ? 'Return to the original atrium' : 'Return to the atrium');
}

function cameraPose(): void {
  if (!entered) {
    museum.camera.position.set(9.7, 3.35, 9.8);
    museum.camera.lookAt(-1.3, 3.2, -9);
    return;
  }
  museum.camera.quaternion.setFromEuler(euler.set(pitch, yaw, 0));
  museum.camera.position.set(position.x, 1.72, position.z);
  if (room === 'gravity') {
    museum.camera.position.sub(center).applyQuaternion(roll).add(center);
    museum.camera.quaternion.premultiply(roll);
  }
}

function updateMap(): void {
  const bounds = ROOMS[room].bounds;
  const x = 20 + (position.x + bounds.x) / (bounds.x * 2) * 110;
  const y = 20 + (position.z - bounds.far) / (bounds.near - bounds.far) * 105;
  element('map-player').setAttribute('transform', `translate(${x} ${y}) rotate(${-yaw * 180 / Math.PI})`);
  element('map').setAttribute('aria-label', `${ROOMS[room].title}. Position ${position.x.toFixed(1)}, ${position.z.toFixed(1)}.`);
  app.dataset.x = position.x.toFixed(3);
  app.dataset.z = position.z.toFixed(3);
  app.dataset.yaw = yaw.toFixed(3);
}

async function travel(target: RoomId, options: { portal?: boolean; miniature?: boolean; surface?: boolean } = {}): Promise<void> {
  if (busy || failed) return;
  busy = true;
  keys.clear();
  clearTimeout(toastTimer);
  toast.classList.remove('visible');
  const previous = room;
  if (room === 'atrium') {
    museum.world.visitor.position.set(position.x, 0, position.z);
    museum.world.miniatureVisitor.position.copy(museum.world.visitor.position);
  }
  if (!reducedMotion) {
    transition.classList.add('active');
    await delay(270);
  }
  if (options.miniature) depth++;
  if (options.surface) depth = 0;
  room = target;
  if (target === 'atrium') {
    position = options.portal && previous !== 'atrium' ? { x: DOOR_X[previous], z: -11.8 } : { x: 0, z: 8.5 };
    yaw = options.portal ? Math.PI : 0;
    pitch = 0.025;
  } else {
    position = { x: 0, z: options.portal ? 11.5 : target === 'recursive' ? 5.5 : 8.5 };
    yaw = 0;
    pitch = options.portal ? 0.04 : target === 'gravity' ? 0.28 : target === 'unfolded' ? 0.12 : -0.06;
    const newVisit = !visited.has(target);
    visited.add(target);
    if (newVisit) saveVisits();
  }
  cameraPose();
  updateMap();
  updateExhibit();
  audio.tune(room);
  museum.warmup();
  museum.render(room);
  if (!reducedMotion) await delay(90);
  transition.classList.remove('active');
  busy = false;
  if (options.miniature) notify(`Recursion ${depth}. The small museum is now the whole museum.`);
  else if (options.surface) notify('Back at the surface. Probably.');
}

function requestTravel(target: RoomId, options: Parameters<typeof travel>[1] = {}): void {
  void travel(target, options).catch(fatal);
}

function changeReality(): void {
  if (busy || !entered || guide.open || failed) return;
  if (room === 'unfolded') {
    unfolded = !unfolded;
    updateExhibit();
    notify(unfolded ? 'The same doorway. Considerably more space.' : 'The architecture folds back into place.');
  } else if (room === 'gravity') {
    if (Math.abs(gravityTarget - gravityAngle) > 0.02) return;
    gravityTarget += Math.PI / 2;
    updateExhibit();
    notify('The wall would like to be a floor now.');
  } else if (room === 'recursive') {
    requestTravel('atrium', { miniature: true });
  }
}

function begin(): void {
  if (entered || failed) return;
  entered = true;
  element('intro').hidden = true;
  element('intro-caption').hidden = true;
  element('experience').hidden = false;
  app.dataset.entered = 'true';
  cameraPose();
  updateExhibit();
  museum.renderer.domElement.focus({ preventScroll: true });
  notify(matchMedia('(pointer: coarse)').matches ? 'Swipe to look. Use the arrows to walk, or choose an exhibit.' : 'W A S D to walk. Drag to look. Your curiosity does the rest.');
}

function openGuide(): void {
  keys.clear();
  if (document.pointerLockElement) document.exitPointerLock();
  if (!guide.open) guide.showModal();
}

async function fullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (app.requestFullscreen) await app.requestFullscreen();
    else notify('Fullscreen is not supported by this browser. The museum still fills the window.');
  } catch {
    notify('Fullscreen was not allowed by your browser.');
  }
}

function setupInput(): void {
  const canvas = museum.renderer.domElement;
  const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
  let dragPointer: number | null = null;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('pointerdown', event => {
    if (!entered || busy || guide.open || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    if (document.pointerLockElement) return;
    dragPointer = event.pointerId;
    lastX = event.clientX; lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!entered || busy || guide.open) return;
    const locked = document.pointerLockElement === canvas;
    if (!locked && event.pointerId !== dragPointer) return;
    const dx = locked ? event.movementX : event.clientX - lastX;
    const dy = locked ? event.movementY : event.clientY - lastY;
    yaw -= dx * 0.003;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -1.35, 1.35);
    lastX = event.clientX; lastY = event.clientY;
  });
  const stopDrag = () => { dragPointer = null; };
  canvas.addEventListener('pointerup', stopDrag);
  canvas.addEventListener('pointercancel', stopDrag);
  canvas.addEventListener('lostpointercapture', stopDrag);
  document.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && (event.target.matches('input, select, textarea') || event.target.isContentEditable)) return;
    if (guide.open) return;
    if (movementKeys.has(event.code) && entered && !busy) {
      keys.add(event.code);
      event.preventDefault();
    }
    if (event.repeat) return;
    if (event.code === 'KeyH') openGuide();
    if (event.code === 'KeyF') void fullscreen();
    if (event.code === 'KeyE') changeReality();
    if (event.code === 'KeyR' && entered) requestTravel('atrium', { surface: true });
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); stopDrag(); });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    element('look-lock').setAttribute('aria-pressed', String(locked));
    element('look-lock').querySelector('span')!.textContent = locked ? 'Esc to release' : 'Free look';
    keys.clear(); stopDrag();
  });
  element('look-lock').addEventListener('click', () => {
    if (document.pointerLockElement) { document.exitPointerLock(); return; }
    if (!canvas.requestPointerLock) { notify('Free look is unavailable. Drag anywhere in the museum to look around.'); return; }
    const result = canvas.requestPointerLock();
    if (result) void result.catch(() => notify('Mouse locking was not allowed. You can still drag to look around.'));
  });
  document.addEventListener('pointerlockerror', () => notify('Mouse locking was not allowed. You can still drag to look around.'));
  document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      if (busy || guide.open) return;
      event.preventDefault();
      keys.add(button.dataset.move!);
      button.setPointerCapture(event.pointerId);
    });
    const release = () => keys.delete(button.dataset.move!);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });
}

function setupUI(): void {
  enter.addEventListener('click', begin);
  element('brand').addEventListener('click', event => {
    event.preventDefault();
    if (entered) requestTravel('atrium', { surface: true });
  });
  element('home').addEventListener('click', () => requestTravel('atrium', { surface: true }));
  document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach(button => {
    button.addEventListener('click', () => requestTravel(button.dataset.room as ExhibitId));
  });
  action.addEventListener('click', changeReality);
  element('help').addEventListener('click', openGuide);
  element('close-guide').addEventListener('click', () => guide.close());
  guide.addEventListener('click', event => {
    if (event.target !== guide) return;
    const bounds = guide.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) guide.close();
  });
  element('fullscreen').addEventListener('click', () => void fullscreen());
  document.addEventListener('fullscreenchange', () => {
    element('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
  });
  const sound = element<HTMLButtonElement>('sound');
  sound.addEventListener('click', async () => {
    sound.disabled = true;
    try {
      await audio.setEnabled(!soundEnabled);
      soundEnabled = !soundEnabled;
      audio.tune(room);
      sound.setAttribute('aria-pressed', String(soundEnabled));
      sound.setAttribute('aria-label', soundEnabled ? 'Mute ambient sound' : 'Enable ambient sound');
      sound.innerHTML = soundEnabled
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>';
    } catch (error) {
      notify(`Sound could not start: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      sound.disabled = false;
    }
  });
  element('capture').addEventListener('click', async () => {
    try {
      const blob = await museum.postcard(room);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `paradox-${room}-${Date.now()}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      notify('A little piece of the impossible, saved as a postcard.');
    } catch (error) {
      notify(`The postcard could not be saved: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const motion = element<HTMLInputElement>('reduced-motion');
  motion.checked = reducedMotion;
  motion.addEventListener('change', () => { reducedMotion = motion.checked; });
  element<HTMLInputElement>('pause').addEventListener('change', event => { paused = (event.target as HTMLInputElement).checked; });
  element<HTMLSelectElement>('quality').addEventListener('change', event => {
    museum.setQuality((event.target as HTMLSelectElement).value as Quality);
  });
  window.addEventListener('resize', () => museum.resize());
  document.addEventListener('visibilitychange', () => {
    keys.clear();
    lastFrame = 0;
    void audio.visibility(!document.hidden).catch(() => notify('Ambient sound could not resume. Toggle the sound button to restart it.'));
  });
  museum.renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    fatal(new Error('The graphics connection was interrupted. Close other graphics-heavy tabs, then choose Try again. Your discoveries have been saved when browser storage is available.'));
  });
}

function animate(timestamp: number): void {
  if (failed) return;
  requestAnimationFrame(animate);
  if (document.hidden) return;
  const dt = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.05) : 0;
  lastFrame = timestamp;
  try {
    if (!paused && !reducedMotion && !guide.open) time += dt;
    gravityAngle = reducedMotion ? gravityTarget : THREE.MathUtils.damp(gravityAngle, gravityTarget, 4.2, dt);
    foldAmount = reducedMotion ? unfolded ? 1.72 : 1 : THREE.MathUtils.damp(foldAmount, unfolded ? 1.72 : 1, 2.2, dt);
    roll.setFromAxisAngle(axis, gravityAngle);
    museum.world.gravityDoor.position.set(0, -9, 14).applyQuaternion(roll).add(center);
    museum.world.gravityDoor.quaternion.copy(roll).multiply(doorFlip);
    museum.world.foldedArchitecture.scale.z = foldAmount;
    museum.world.animate(time);
    if (entered && !busy && !guide.open && (room !== 'gravity' || Math.abs(gravityTarget - gravityAngle) < 0.025)) {
      if (keys.has('ArrowLeft')) yaw += dt * 1.6;
      if (keys.has('ArrowRight')) yaw -= dt * 1.6;
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const strafe = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6 : 3.8;
      const delta = walkingDelta(forward, strafe, yaw, speed, dt);
      const next = { x: position.x + delta.x, z: position.z + delta.z };
      const target = crossing(room, position, next);
      if (target) requestTravel(target, { portal: true });
      else position = constrain(room, next);
    }
    cameraPose();
    if (timestamp - hudTime > 120) { updateMap(); hudTime = timestamp; }
    museum.render(room);
  } catch (error) {
    fatal(error);
  }
}

element('retry').addEventListener('click', () => location.reload());

async function boot(): Promise<void> {
  await document.fonts.ready;
  museum = new MuseumRenderer(element('viewport'));
  if (matchMedia('(max-width: 700px)').matches) {
    museum.setQuality('low');
    element<HTMLSelectElement>('quality').value = 'low';
  }
  setupInput();
  setupUI();
  cameraPose();
  museum.warmup();
  museum.render('atrium');
  readVisits();
  updateExhibit();
  updateMap();
  app.classList.replace('loading', 'ready');
  enter.disabled = false;
  enter.innerHTML = '<span>Enter the museum</span><span aria-hidden="true">↗</span>';
  requestAnimationFrame(animate);
}

void boot().catch(error => {
  fatal(new Error(`A WebGL 2 browser with hardware acceleration is required. ${error instanceof Error ? error.message : String(error)}`));
});
