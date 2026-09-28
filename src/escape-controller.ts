import './escape.css';
import * as THREE from 'three';
import { element } from './dom.ts';
import { ARTIFACTS, CLUES, HINTS, OBJECTIVES, SEALS, SYMBOLS, finishEscape, freshEscape, inReach, inspectClue, parseEscapeSave, pressWitness, recordClue, revealHint, solveRecursion, solveSpace, stageFor, unlockExit } from './escape.ts';
import type { Artifact, EscapeState, PuzzleContext, PuzzleResult } from './escape.ts';
import type { MuseumRenderer } from './renderer.ts';
import type { Position } from './navigation.ts';

interface EscapeHost {
  context: () => PuzzleContext;
  ready: () => boolean;
  interrupt: () => void;
  notify: (message: string) => void;
  modeChanged: () => void;
  returnHome: () => void;
}

const SAVE_KEY = 'paradox.escape.v1';

export class EscapeController {
  active = false;
  private state: EscapeState = freshEscape();
  private nearby?: Artifact;
  private inspected?: Artifact;
  private storageUnavailable = false;
  private openAmount = 0;
  private readonly inspection = element<HTMLDialogElement>('inspection');
  private readonly journal = element<HTMLDialogElement>('clue-journal');
  private readonly ending = element<HTMLDialogElement>('escape-ending');
  private readonly controls = element<HTMLFormElement>('inspection-controls');
  private readonly raycaster = new THREE.Raycaster();
  private readonly museum: MuseumRenderer;
  private readonly host: EscapeHost;

  constructor(museum: MuseumRenderer, host: EscapeHost) {
    this.museum = museum;
    this.host = host;
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) this.state = parseEscapeSave(saved);
    } catch {
      host.notify('Escape progress could not be loaded. A fresh challenge is available; free exploration is unaffected.');
    }
    if (this.state.clues.length && !this.state.escaped) element('escape-enter').textContent = 'Resume the escape challenge ↗';
    element('open-journal').addEventListener('click', () => this.openJournal());
    element('inspect-nearby').addEventListener('click', () => this.inspectNearest());
    document.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(button => {
      button.addEventListener('click', () => element<HTMLDialogElement>(button.dataset.close!).close());
    });
    this.controls.addEventListener('submit', event => { event.preventDefault(); this.submit(); });
    element('reveal-hint').addEventListener('click', () => { this.update(revealHint(this.state)); this.renderJournal(); });
    element('leave-challenge').addEventListener('click', () => { this.stop(); host.notify('Escape progress kept. Resume the challenge from the visitor guide.'); });
    element('ending-explore').addEventListener('click', () => { this.stop(); host.returnHome(); });
    element('ending-restart').addEventListener('click', () => {
      this.ending.close();
      this.update(freshEscape());
      host.returnHome();
      this.start();
    });
    this.ending.addEventListener('cancel', event => { event.preventDefault(); this.stop(); host.returnHome(); });
  }

  get modalOpen(): boolean {
    return this.inspection.open || this.journal.open || this.ending.open;
  }

  start(): void {
    if (this.state.escaped) this.update(freshEscape());
    this.active = true;
    this.museum.world.escape.groups.forEach(group => { group.visible = true; });
    element('escape-hud').hidden = false;
    this.syncStatus();
    this.host.modeChanged();
    this.openJournal();
  }

  private stop(): void {
    this.active = false;
    this.nearby = undefined;
    element('inspect-nearby').hidden = true;
    this.museum.world.escape.groups.forEach(group => { group.visible = false; });
    element('escape-hud').hidden = true;
    this.inspection.close(); this.journal.close(); this.ending.close();
    this.host.interrupt();
    this.syncStatus();
    this.host.modeChanged();
  }

  private update(state: EscapeState): void {
    const changed = state !== this.state;
    this.state = state;
    this.syncStatus();
    if (!changed || this.storageUnavailable) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      this.storageUnavailable = true;
      this.host.notify('Escape progress could not be saved. Your clues and seals will last for this visit only.');
    }
  }

  private syncStatus(): void {
    const app = element('app');
    app.dataset.escape = String(this.active);
    app.dataset.seals = String(this.state.seals.length);
    app.dataset.escapeStage = stageFor(this.state);
    app.dataset.exitUnlocked = String(this.state.unlocked);
    app.dataset.escaped = String(this.state.escaped);
    element('seal-count').textContent = `${this.state.seals.length} / 3 SEALS RECOVERED`;
    this.museum.world.escape.exitLight.visible = this.state.unlocked;
  }

  openJournal(): void {
    if (!this.active) return;
    this.host.interrupt();
    this.inspection.close();
    this.renderJournal();
    if (!this.journal.open) this.journal.showModal();
  }

  private renderJournal(): void {
    const stage = stageFor(this.state);
    element('escape-objective').textContent = OBJECTIVES[stage];
    const inventory = element('escape-inventory');
    inventory.replaceChildren();
    for (const id of ['unfolded', 'gravity', 'recursive'] as const) {
      const recovered = this.state.seals.includes(id);
      const slot = document.createElement('div');
      slot.className = `seal-slot${recovered ? ' recovered' : ''}`;
      const digit = document.createElement('strong');
      digit.textContent = recovered ? SEALS[id].number : '◇';
      const name = document.createElement('span');
      name.textContent = SEALS[id].name;
      slot.append(digit, name);
      inventory.append(slot);
    }
    const clues = element('journal-clues');
    clues.replaceChildren();
    if (this.state.clues.length === 0) {
      const instruction = document.createElement('p');
      instruction.textContent = 'The museum has closed around you. Look for floating brass diamonds above books, catalogues, and locks. Walk close to an object and press E or tap its prompt. Q changes reality. Collected clues appear here; you do not need to memorize them.';
      clues.append(instruction);
    }
    for (const id of this.state.clues) {
      const clue = CLUES[id];
      const entry = document.createElement('details');
      entry.dataset.clue = id;
      const title = document.createElement('summary');
      title.textContent = clue.title;
      const body = document.createElement('pre');
      body.textContent = clue.text;
      entry.append(title, body);
      clues.append(entry);
    }
    const count = this.state.hints[stage];
    element('hint-text').textContent = count ? HINTS[stage][count - 1] : 'The museum will not give away its secrets unless you ask.';
    const hintButton = element<HTMLButtonElement>('reveal-hint');
    hintButton.disabled = count >= 3;
    hintButton.textContent = count === 0 ? 'Reveal a small hint' : count === 1 ? 'Reveal a stronger hint' : count === 2 ? 'Reveal the solution-level hint' : 'All hints for this step revealed';
    element('journal-stats').textContent = `${this.state.clues.length} inscriptions · ${this.state.mistakes} unsuccessful attempts · ${Object.values(this.state.hints).reduce((sum, value) => sum + value, 0)} hints used. ${this.storageUnavailable ? 'Progress is available for this visit only.' : 'Progress saves automatically. Returning to the atrium does not remove clues or seals.'}`;
  }

  inspectNearest(): void {
    if (!this.active || !this.host.ready() || this.modalOpen) return;
    const nearest = this.findNearby();
    if (nearest) this.inspect(nearest);
    else this.host.notify('No artifact within reach. Approach a floating brass diamond. Q changes reality; J opens your journal.');
  }

  inspectAt(clientX: number, clientY: number, locked: boolean): void {
    if (!this.active || !this.host.ready() || this.modalOpen) return;
    const rect = this.museum.renderer.domElement.getBoundingClientRect();
    const pointer = locked ? new THREE.Vector2() : new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.museum.camera);
    const scene = this.museum.world.scenes[this.host.context().room];
    const hit = this.raycaster.intersectObjects(scene.children, true).find(intersection => {
      let current: THREE.Object3D | null = intersection.object;
      while (current) { if (!current.visible) return false; current = current.parent; }
      return true;
    });
    let target = hit?.object;
    while (target && !target.userData.artifactId) target = target.parent ?? undefined;
    if (!target) return;
    const artifact = ARTIFACTS.find(item => item.id === target?.userData.artifactId);
    if (artifact) this.inspect(artifact);
  }

  private inspect(artifact: Artifact): void {
    if (!inReach(artifact, this.host.context())) {
      this.host.notify('Move closer to this artifact, on its own surface, to inspect it.');
      return;
    }
    this.host.interrupt();
    this.inspected = artifact;
    const clue = inspectClue(artifact.id, this.host.context());
    if (clue) this.update(recordClue(this.state, clue));
    this.renderInspection();
    if (!this.inspection.open) this.inspection.showModal();
  }

  private renderInspection(): void {
    if (!this.inspected) return;
    const { id, title } = this.inspected;
    const context = this.host.context();
    const clue = inspectClue(id, context);
    element('inspection-title').textContent = title;
    element('inspection-location').textContent = clue ? 'INSCRIPTION COPIED TO YOUR JOURNAL' : 'A MECHANISM WAITING FOR AN ANSWER';
    const body = element('inspection-body');
    body.classList.toggle('catalogue', id === 'survey' || (id === 'registry' && context.depth > 0 && context.depth < 3));
    body.textContent = clue ? CLUES[clue].text
      : id === 'space-lock' ? 'THE INVARIANT CABINET\n\nThree signs. Three shelves. Only what survives the opening of the hall is admitted.\n\nThe comparison plates must both be recorded before the cabinet can turn.'
      : context.depth > 2 ? `UNRELIABLE ECHO / DEPTH ${context.depth}\n\nThe letters have forgotten their shelves. Only the first two echoes can be catalogued. R returns you to the original.`
      : 'THE ORIGINAL REGISTRY\n\nTwo echoes disagree. Their replacement letters make a word. Return that word to this original registry with the GRAVITY seal.';
    const feedback = element('inspection-feedback');
    feedback.textContent = '';
    delete feedback.dataset.success;
    this.controls.replaceChildren();
    if (id === 'space-lock') {
      for (let i = 0; i < 3; i++) {
        const label = document.createElement('label');
        label.textContent = `SIGN ${i + 1}`;
        const select = document.createElement('select');
        select.name = `symbol-${i}`;
        select.id = `space-symbol-${i}`;
        select.setAttribute('aria-label', `Sign ${i + 1}`);
        for (const symbol of SYMBOLS) select.add(new Option(symbol, symbol));
        label.append(select);
        this.controls.append(label);
      }
      this.submitButton(this.state.seals.includes('unfolded') ? 'Seal recovered' : 'Try the signs', this.state.seals.includes('unfolded'));
    } else if (this.inspected.kind === 'plate') {
      this.submitButton(this.state.seals.includes('gravity') ? 'Seal recovered' : `Press this witness · ${this.state.gravityStep}/4`, this.state.seals.includes('gravity'));
    } else if (id === 'registry' && context.depth === 0) {
      this.answerInput('word', 'THE REPLACEMENT WORD', false);
      this.submitButton(this.state.seals.includes('recursive') ? 'Seal recovered' : 'Certify the word', this.state.seals.includes('recursive'));
    } else if (id === 'exit-lock') {
      this.answerInput('code', 'THREE SEAL NUMBERS', true);
      this.submitButton(this.state.unlocked ? 'Door unlocked' : 'Turn the departure lock', this.state.unlocked);
    }
  }

  private answerInput(name: string, caption: string, numeric: boolean): void {
    const label = document.createElement('label');
    label.textContent = caption;
    const input = document.createElement('input');
    input.name = name;
    input.id = `escape-${name}`;
    input.required = true;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = numeric ? 3 : 12;
    if (numeric) { input.inputMode = 'numeric'; input.pattern = '[0-9]{3}'; input.title = 'Enter exactly three digits.'; }
    label.append(input);
    this.controls.append(label);
  }

  private submitButton(caption: string, disabled: boolean): void {
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'action-button';
    button.textContent = caption;
    button.disabled = disabled;
    this.controls.append(button);
  }

  private submit(): void {
    if (!this.inspected || !this.active) return;
    const context = this.host.context();
    if (!inReach(this.inspected, context)) {
      element('inspection-feedback').textContent = 'This artifact is no longer within reach. Close the page and approach it again.';
      return;
    }
    const data = new FormData(this.controls);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    let result: PuzzleResult;
    if (this.inspected.id === 'space-lock') result = solveSpace(this.state, [0, 1, 2].map(index => text(`symbol-${index}`)));
    else if (this.inspected.kind === 'plate') result = pressWitness(this.state, this.inspected.id, context);
    else if (this.inspected.id === 'registry') result = solveRecursion(this.state, text('word'), context);
    else if (this.inspected.id === 'exit-lock') result = unlockExit(this.state, text('code'), context);
    else return;
    const priorSeals = this.state.seals.length;
    this.update(result.state);
    if (this.state.seals.length !== priorSeals || this.state.unlocked) this.renderInspection();
    const feedback = element('inspection-feedback');
    feedback.textContent = result.message;
    feedback.dataset.success = String(result.success);
    if (this.inspected.kind === 'plate' && !this.state.seals.includes('gravity')) {
      this.controls.querySelector('button')!.textContent = `Press this witness · ${this.state.gravityStep}/4`;
    }
  }

  private findNearby(): Artifact | undefined {
    const context = this.host.context();
    return ARTIFACTS.filter(item => inReach(item, context))
      .sort((a, b) => Math.hypot(a.x - context.position.x, a.z - context.position.z) - Math.hypot(b.x - context.position.x, b.z - context.position.z))[0];
  }

  restrictPosition(next: Position): Position {
    if (!this.active) return next;
    const context = this.host.context();
    const result = { ...next };
    for (const artifact of ARTIFACTS) {
      if (artifact.room !== context.room || (artifact.face !== undefined && artifact.face !== context.face)) continue;
      const dx = result.x - artifact.x;
      const dz = result.z - artifact.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.78) {
        result.x = artifact.x + (distance > 0 ? dx / distance : 1) * 0.78;
        result.z = artifact.z + (distance > 0 ? dz / distance : 0) * 0.78;
      }
    }
    if (context.room === 'atrium' && (!this.state.unlocked || context.depth !== 0) && Math.abs(result.x) < 1.9) result.z = Math.min(12.1, result.z);
    return result;
  }

  tick(dt: number, time: number, reducedMotion: boolean): void {
    if (!this.active) return;
    const outside = this.state.unlocked && this.host.context().depth === 0;
    this.openAmount = reducedMotion ? Number(outside) : THREE.MathUtils.damp(this.openAmount, Number(outside), 4, dt);
    this.museum.world.escape.exitDoor.rotation.y = -this.openAmount * Math.PI * 0.48;
    this.museum.world.escape.exitLight.visible = outside;
    const nearby = this.host.ready() && !this.modalOpen ? this.findNearby() : undefined;
    if (nearby?.id !== this.nearby?.id) {
      this.nearby = nearby;
      const prompt = element('inspect-nearby');
      prompt.hidden = !nearby;
      prompt.dataset.artifact = nearby?.id ?? '';
      element('nearby-name').textContent = nearby ? `Inspect ${nearby.title}` : '';
    }
    for (const prop of this.museum.world.escape.props) {
      prop.marker.position.y = 2 + Math.sin(time * 1.7) * 0.06;
      prop.marker.rotation.y = time * 0.5;
      prop.marker.material.emissiveIntensity = prop.artifact.id === nearby?.id ? 2.2 : 0.65;
    }
    if (this.modalOpen || !this.host.ready()) return;
    const escaped = finishEscape(this.state, this.host.context());
    if (escaped !== this.state) {
      this.update(escaped);
      this.host.interrupt();
      element('ending-stats').textContent = `3 seals recovered · ${this.state.clues.length} inscriptions collected · ${Object.values(this.state.hints).reduce((sum, value) => sum + value, 0)} hints used · ${this.state.mistakes} unsuccessful attempts`;
      this.ending.showModal();
    }
  }
}
