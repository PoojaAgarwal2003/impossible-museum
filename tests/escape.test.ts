import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTIFACTS, CLUES, REACH, finishEscape, freshEscape, inReach, inspectClue, parseEscapeSave, pressWitness, recordClue, revealHint, solveRecursion, solveSpace, stageFor, unlockExit } from '../src/escape.ts';
import type { ArtifactId, ClueId, EscapeState, PuzzleContext } from '../src/escape.ts';

const context = (overrides: Partial<PuzzleContext> = {}): PuzzleContext => ({
  room: 'atrium', position: { x: 0, z: 8.5 }, depth: 0, face: 0, unfolded: false, settled: true, ...overrides,
});
const collect = (state: EscapeState, ...clues: ClueId[]) => clues.reduce(recordClue, state);
const spaceSeal = () => solveSpace(collect(freshEscape(), 'curator', 'survey-folded', 'survey-open'), ['EYE', 'KEY', 'MOON']).state;
const witnessContext = (face: number) => context({ room: 'gravity', face, position: { x: 0, z: 5 } });

function gravitySeal(): EscapeState {
  let state = collect(spaceSeal(), 'root', 'branch', 'flower', 'seed');
  for (const [id, face] of [['root', 2], ['branch', 1], ['flower', 3], ['seed', 0]] as const) state = pressWitness(state, id, witnessContext(face)).state;
  return state;
}

function allSeals(): EscapeState {
  return solveRecursion(collect(gravitySeal(), 'echo-one', 'echo-two'), 'KEY', context({ room: 'recursive' })).state;
}

test('a fresh challenge has no answers, inventory, or unlocked exit', () => {
  const state = freshEscape();
  assert.equal(stageFor(state), 'arrival');
  assert.deepEqual(state.clues, []);
  assert.deepEqual(state.seals, []);
  assert.equal(state.unlocked, false);
  assert.equal(state.escaped, false);
  assert.notEqual(state.hints, freshEscape().hints);
});

test('clues are copied once; inspection depends on fold state and exact recursion depth', () => {
  const first = recordClue(freshEscape(), 'curator');
  assert.equal(recordClue(first, 'curator'), first);
  assert.equal(stageFor(first), 'space');
  assert.equal(inspectClue('survey', context()), 'survey-folded');
  assert.equal(inspectClue('survey', context({ unfolded: true })), 'survey-open');
  assert.equal(inspectClue('registry', context({ depth: 0 })), undefined);
  assert.equal(inspectClue('registry', context({ depth: 1 })), 'echo-one');
  assert.equal(inspectClue('registry', context({ depth: 2 })), 'echo-two');
  assert.equal(inspectClue('registry', context({ depth: 3 })), undefined);
});

test('items cannot be inspected across rooms, across surfaces, or during a gravity transition', () => {
  const root = ARTIFACTS.find(item => item.id === 'root')!;
  assert.equal(inReach(root, witnessContext(2)), true);
  assert.equal(inReach(root, witnessContext(0)), false);
  assert.equal(inReach(root, context({ position: { x: 0, z: 5 }, face: 2 })), false);
  assert.equal(inReach(root, { ...witnessContext(2), settled: false }), false);
  assert.equal(inReach(root, { ...witnessContext(2), position: { x: REACH + 0.01, z: 3.5 } }), false);
});

test('space requires two observed surveys, not just a lucky answer', () => {
  assert.equal(solveSpace(freshEscape(), ['EYE', 'KEY', 'MOON']).success, false);
  assert.equal(solveSpace(collect(freshEscape(), 'survey-folded'), ['EYE', 'KEY', 'MOON']).success, false);
  const state = collect(freshEscape(), 'survey-folded', 'survey-open');
  const wrong = solveSpace(state, ['MOON', 'KEY', 'EYE']);
  assert.equal(wrong.success, false);
  assert.equal(wrong.state.mistakes, 1);
  assert.equal(state.mistakes, 0, 'reducers do not mutate prior state');
  assert.deepEqual(spaceSeal().seals, ['unfolded']);
  assert.equal(stageFor(spaceSeal()), 'gravity');
});

test('the space solution is derivable by comparing and ordering the actual inscriptions', () => {
  const parse = (clue: 'survey-folded' | 'survey-open') => new Map(CLUES[clue].text.split('\n').map(line => {
    const [, shelf, symbol] = line.trim().split(/\s+/);
    return [shelf, symbol];
  }));
  const folded = parse('survey-folded');
  const open = parse('survey-open');
  const order = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const solution = order.filter(shelf => folded.has(shelf) && folded.get(shelf) === open.get(shelf)).map(shelf => folded.get(shelf)!);
  assert.deepEqual(solution, ['EYE', 'KEY', 'MOON']);
  assert.equal(solveSpace(collect(freshEscape(), 'survey-folded', 'survey-open'), solution).success, true);
});

test('gravity needs the space seal, all witnesses, and physical access to the chosen plate', () => {
  assert.equal(pressWitness(freshEscape(), 'root', witnessContext(2)).success, false);
  assert.equal(pressWitness(spaceSeal(), 'root', witnessContext(2)).success, false);
  const state = collect(spaceSeal(), 'root', 'branch', 'flower', 'seed');
  assert.equal(pressWitness(state, 'root', witnessContext(0)).success, false);
  assert.equal(pressWitness(state, 'curator', witnessContext(2)).success, false);
});

test('a wrong witness resets only the chain; all seals and clues survive', () => {
  let state = collect(spaceSeal(), 'root', 'branch', 'flower', 'seed');
  state = pressWitness(state, 'root', witnessContext(2)).state;
  assert.equal(state.gravityStep, 1);
  const wrong = pressWitness(state, 'seed', witnessContext(0));
  assert.equal(wrong.state.gravityStep, 0);
  assert.equal(wrong.state.mistakes, 1);
  assert.deepEqual(wrong.state.seals, state.seals);
  assert.deepEqual(wrong.state.clues, state.clues);
  assert.deepEqual(gravitySeal().seals, ['unfolded', 'gravity']);
});

test('gravity accepts only the complete intended sequence, not other permutations', () => {
  const permutations = (items: ArtifactId[]): ArtifactId[][] => items.length ? items.flatMap((id, index) => permutations(items.filter((_, i) => i !== index)).map(rest => [id, ...rest])) : [[]];
  for (const sequence of permutations(['root', 'branch', 'flower', 'seed'])) {
    let state = collect(spaceSeal(), 'root', 'branch', 'flower', 'seed');
    for (const id of sequence) state = pressWitness(state, id, witnessContext(ARTIFACTS.find(item => item.id === id)!.face!)).state;
    assert.equal(state.seals.includes('gravity'), sequence.join() === 'root,branch,flower,seed');
  }
});

test('recursion requires both echoes, gravity, and the original registry', () => {
  const original = context({ room: 'recursive' });
  assert.equal(solveRecursion(spaceSeal(), 'KEY', original).success, false);
  assert.equal(solveRecursion(gravitySeal(), 'KEY', original).success, false);
  const state = collect(gravitySeal(), 'echo-one', 'echo-two');
  assert.equal(solveRecursion(state, 'KEY', context({ room: 'recursive', depth: 1 })).success, false);
  assert.equal(solveRecursion(state, 'KEY', context()).success, false);
  assert.equal(solveRecursion(state, 'SKY', original).success, false);
  assert.equal(solveRecursion(state, ' key ', original).success, true);
});

test('the echo word is derived from actual replacement letters, in Roman shelf order', () => {
  const parse = (id: 'echo-one' | 'echo-two') => new Map(CLUES[id].text.split('\n').map(line => {
    const [, shelf, word] = line.trim().split(/\s+/);
    return [shelf, word];
  }));
  const first = parse('echo-one'); const second = parse('echo-two');
  const answer = ['II', 'V', 'VIII'].map(shelf => [...second.get(shelf)!].filter((letter, i) => letter !== first.get(shelf)![i]).join('')).join('');
  assert.equal(answer, 'KEY');
});

test('seals cannot be awarded twice', () => {
  assert.deepEqual(solveSpace(spaceSeal(), ['EYE', 'KEY', 'MOON']).state.seals, ['unfolded']);
  assert.deepEqual(solveRecursion(allSeals(), 'KEY', context({ room: 'recursive' })).state.seals, allSeals().seals);
});

test('the exit rejects missing seals, copies, wrong rooms, and catalogue-order digits', () => {
  assert.equal(unlockExit(freshEscape(), '247', context()).success, false);
  const state = allSeals();
  assert.equal(unlockExit(state, '247', context({ depth: 1 })).success, false);
  assert.equal(unlockExit(state, '247', context({ room: 'recursive' })).success, false);
  assert.equal(unlockExit(state, '472', context()).success, false);
  assert.equal(unlockExit(state, '2470', context()).success, false);
  assert.equal(unlockExit(state, '247', context()).success, true);
});

test('unlocking alone does not win; the visitor must physically cross the original exit', () => {
  const unlocked = unlockExit(allSeals(), '247', context()).state;
  assert.equal(unlocked.escaped, false);
  assert.equal(finishEscape(unlocked, context()).escaped, false);
  assert.equal(finishEscape(unlocked, context({ position: { x: 2, z: 12.8 } })).escaped, false);
  assert.equal(finishEscape(unlocked, context({ position: { x: 0, z: 12.8 }, depth: 1 })).escaped, false);
  assert.equal(finishEscape(allSeals(), context({ position: { x: 0, z: 12.8 } })).escaped, false);
  assert.equal(finishEscape(unlocked, context({ position: { x: 0, z: 12.8 } })).escaped, true);
});

test('hints are opt-in, per-stage, capped, and do not grant progress', () => {
  let state = freshEscape();
  for (let i = 0; i < 8; i++) state = revealHint(state);
  assert.equal(state.hints.arrival, 3);
  assert.equal(state.hints.space, 0);
  assert.equal(state.clues.length, 0);
  assert.equal(state.seals.length, 0);
});

test('partial sequences and completed challenges survive validated save roundtrips', () => {
  const pending = pressWitness(collect(spaceSeal(), 'root', 'branch', 'flower', 'seed'), 'root', witnessContext(2)).state;
  for (const state of [freshEscape(), spaceSeal(), pending, gravitySeal(), allSeals(), unlockExit(allSeals(), '247', context()).state]) {
    assert.deepEqual(parseEscapeSave(JSON.stringify(state)), state);
  }
});

test('malformed, unsupported, inconsistent, and prototype-name saves are rejected', () => {
  for (const value of [
    null, [], { ...freshEscape(), version: 9 }, { ...freshEscape(), clues: ['constructor'] },
    { ...freshEscape(), clues: ['curator', 'curator'] }, { ...freshEscape(), seals: ['gravity'] },
    { ...freshEscape(), unlocked: true }, { ...freshEscape(), escaped: true },
    { ...freshEscape(), gravityStep: 1 }, { ...freshEscape(), hints: {} },
    { ...freshEscape(), hints: { ...freshEscape().hints, space: 4 } },
    { ...freshEscape(), mistakes: -1 }, { ...freshEscape(), seals: ['unfolded'] },
  ]) assert.throws(() => parseEscapeSave(JSON.stringify(value)));
  assert.throws(() => parseEscapeSave('{broken'));
});
