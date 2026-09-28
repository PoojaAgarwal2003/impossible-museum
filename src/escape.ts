import type { ExhibitId, Position, RoomId } from './navigation.ts';

export type ArtifactId = 'curator' | 'exit-lock' | 'space-note' | 'survey' | 'space-lock' | 'gravity-note' | 'seed' | 'branch' | 'root' | 'flower' | 'recursion-note' | 'registry';
export interface Artifact {
  id: ArtifactId;
  room: RoomId;
  title: string;
  x: number;
  z: number;
  kind: 'book' | 'panel' | 'lock' | 'plate';
  face?: number;
}
export const REACH = 2.75;
export const ARTIFACTS: readonly Artifact[] = [
  { id: 'curator', room: 'atrium', title: "The curator's notebook", x: -3.6, z: 7, kind: 'book' },
  { id: 'exit-lock', room: 'atrium', title: 'The departure lock', x: 3.6, z: 9.8, kind: 'lock' },
  { id: 'space-note', room: 'unfolded', title: "The surveyor's instruction", x: -3.6, z: 7, kind: 'book' },
  { id: 'survey', room: 'unfolded', title: 'The shifting catalogue', x: -3.6, z: 1.6, kind: 'panel' },
  { id: 'space-lock', room: 'unfolded', title: 'The invariant cabinet', x: 3.6, z: 5.5, kind: 'lock' },
  { id: 'gravity-note', room: 'gravity', title: "The gardener's last page", x: -3.6, z: 7, kind: 'book', face: 0 },
  { id: 'seed', room: 'gravity', title: 'The seed plate', x: 0, z: 3.5, kind: 'plate', face: 0 },
  { id: 'branch', room: 'gravity', title: 'The branch plate', x: 0, z: 3.5, kind: 'plate', face: 1 },
  { id: 'root', room: 'gravity', title: 'The root plate', x: 0, z: 3.5, kind: 'plate', face: 2 },
  { id: 'flower', room: 'gravity', title: 'The flower plate', x: 0, z: 3.5, kind: 'plate', face: 3 },
  { id: 'recursion-note', room: 'recursive', title: "The archivist's warning", x: -3.8, z: 5, kind: 'book' },
  { id: 'registry', room: 'recursive', title: 'The echo registry', x: 3.8, z: 5, kind: 'lock' },
];

export interface PuzzleContext {
  room: RoomId;
  position: Position;
  depth: number;
  face: number;
  unfolded: boolean;
  settled: boolean;
}

export const CLUES = {
  curator: {
    title: "The curator's notebook",
    text: 'CLOSING PROTOCOL / THE LAST VISITOR\n\nThree keepers misplaced the way out. The surveyor trusted what stayed. The gardener trusted what followed. The archivist trusted what changed.\n\nRecover SPACE, then GRAVITY, then INFINITY. Each seal bears a number, but their catalogue order is not their departure order.\n\nThe door stands behind your arrival. Only the original museum has an outside.',
  },
  'space-note': {
    title: "The surveyor's instruction",
    text: 'THE HONEST SIGNS\n\nTake one survey while the hall sleeps, and another when it opens. Most of its catalogue lies. Keep only the signs which refuse to change.\n\nThe shelves know their order. Your eyes do not.\n\nThree survivors open the invariant cabinet.',
  },
  'survey-folded': {
    title: 'Catalogue / folded hall',
    text: 'SHELF VIII     MOON\nSHELF III      SUN\nSHELF V        KEY\nSHELF I        EYE\nSHELF VI       WAVE\nSHELF II       STAR',
  },
  'survey-open': {
    title: 'Catalogue / unfolded hall',
    text: 'SHELF VIII     MOON\nSHELF III      STAR\nSHELF V        KEY\nSHELF I        EYE\nSHELF VI       SUN\nSHELF II       WAVE',
  },
  'gravity-note': {
    title: "The gardener's last page",
    text: 'A LIFE, NOT A COMPASS\n\nFirst find all four witnesses. The SPACE seal will wake them.\n\nBegin with the mouth that drinks in darkness.\nNext, the arm that carries a hundred hands.\nThen, the face that opens only to the light.\nLast, the promise of a life not yet begun.\n\nPress their plates in that order. Turning the room is not a press. A wrong witness breaks the chain, not your seals.',
  },
  seed: { title: 'Witness / seed', text: 'SEED\n\nA future folded into a shell.\nThis plate belongs to the original floor.' },
  branch: { title: 'Witness / branch', text: 'BRANCH\n\nA wooden arm, its hands all leaves.\nThis plate belongs to the original right wall.' },
  root: { title: 'Witness / root', text: 'ROOT\n\nAn unseen mouth drinking beneath the ground.\nThis plate belongs to the original ceiling.' },
  flower: { title: 'Witness / flower', text: 'FLOWER\n\nA face unfolded toward the light.\nThis plate belongs to the original left wall.' },
  'recursion-note': {
    title: "The archivist's warning",
    text: 'ONLY TWO ECHOES ARE RELIABLE\n\nThe original is not an echo. Catalogue the first reflection and the second. Ignore what they agree on; retain only the letters the second changes.\n\nShelf order, not display order. Their replacements name what you need.\n\nBring the word and the GRAVITY seal back to this registry in the original museum. Beyond the second echo, ink forgets itself.',
  },
  'echo-one': { title: 'Echo registry / depth 1', text: 'SHELF VIII     TELL\nSHELF II       LATE\nSHELF V        SAND' },
  'echo-two': { title: 'Echo registry / depth 2', text: 'SHELF VIII     YELL\nSHELF II       LAKE\nSHELF V        SEND' },
  'exit-rule': {
    title: 'The departure inscription',
    text: 'DO NOT LEAVE AS YOU ARRIVED\n\nFirst, what contains itself.\nNext, what makes room for it.\nLast, what gives that room a down.\n\nRead the numbers carried by the three seals in this order. The original museum alone remembers the outside.',
  },
} as const;
export type ClueId = keyof typeof CLUES;
export type Stage = 'arrival' | 'space' | 'gravity' | 'recursive' | 'exit' | 'leave';
export const STAGES: Stage[] = ['arrival', 'space', 'gravity', 'recursive', 'exit', 'leave'];
export const SEALS: Record<ExhibitId, { name: string; number: string }> = {
  unfolded: { name: 'SPACE', number: '4' },
  gravity: { name: 'GRAVITY', number: '7' },
  recursive: { name: 'INFINITY', number: '2' },
};
export const SYMBOLS = ['EYE', 'KEY', 'MOON', 'SUN', 'STAR', 'WAVE'] as const;
const GRAVITY_ORDER: ArtifactId[] = ['root', 'branch', 'flower', 'seed'];

export interface EscapeState {
  version: 1;
  clues: ClueId[];
  seals: ExhibitId[];
  gravityStep: number;
  hints: Record<Stage, number>;
  mistakes: number;
  unlocked: boolean;
  escaped: boolean;
}

export function freshEscape(): EscapeState {
  return { version: 1, clues: [], seals: [], gravityStep: 0, hints: { arrival: 0, space: 0, gravity: 0, recursive: 0, exit: 0, leave: 0 }, mistakes: 0, unlocked: false, escaped: false };
}

export function stageFor(state: EscapeState): Stage {
  if (!state.clues.includes('curator') && state.seals.length === 0) return 'arrival';
  if (!state.seals.includes('unfolded')) return 'space';
  if (!state.seals.includes('gravity')) return 'gravity';
  if (!state.seals.includes('recursive')) return 'recursive';
  return state.unlocked ? 'leave' : 'exit';
}

export const OBJECTIVES: Record<Stage, string> = {
  arrival: "Find the curator's notebook near the atrium entrance.",
  space: 'Recover the SPACE seal from the invariant cabinet.',
  gravity: 'Recover the GRAVITY seal from the four witnesses.',
  recursive: 'Recover the INFINITY seal from the echo registry.',
  exit: 'Return to the original atrium and decipher the departure lock.',
  leave: 'The door is open. Walk through it at the back of the original atrium.',
};

export const HINTS: Record<Stage, readonly string[]> = {
  arrival: ["Brass diamonds mark things you can inspect. The first book is to your left as you enter.", 'Walk within reach, then press E or tap the item prompt. Q changes the room; J keeps your clues.', "Read the curator's notebook, then visit The Unfolded Hall."],
  space: ['The catalogue has two versions. Inspect it before and after unfolding the hall with Q.', 'Compare the symbols shelf by shelf, then sort only the unchanged shelves by Roman numeral.', 'Solution-level hint: shelves I, V, and VIII never change. Enter EYE, KEY, MOON into the invariant cabinet.'],
  gravity: ['Inspect all four plates. Q lets you walk on each of their original surfaces.', 'The gardener describes a root, a branch, a flower, and a seed. Pressing and inspecting are different actions.', 'Solution-level hint: press ROOT on the ceiling, BRANCH on the right wall, FLOWER on the left wall, then SEED on the floor. Turning past a surface is harmless.'],
  recursive: ['Inspect the echo registry inside the first miniature, then inside the second. The depth counter matters.', 'Compare the words at each shelf. Keep the replacement letter from the second echo, then sort shelves II, V, VIII.', 'Solution-level hint: LATE → LAKE gives K; SAND → SEND gives E; TELL → YELL gives Y. Return to depth 0 with R and submit KEY.'],
  exit: ['Each seal carries one digit. The departure inscription supplies a new order.', 'What contains itself is INFINITY. What makes room is SPACE. What decides down is GRAVITY.', 'Solution-level hint: INFINITY 2, SPACE 4, GRAVITY 7. Submit 247 at depth 0, then walk through the opened door.'],
  leave: ['The escape door is behind where you first appeared, opposite the exhibit portals.', 'The departure lock is beside it. Turn toward the pale opening and walk into it.', 'Use R to return to the original atrium. Walk backward from the arrival point, centered at x = 0.'],
};

export interface PuzzleResult { state: EscapeState; success: boolean; message: string }

function reject(state: EscapeState, message: string, mistake = false): PuzzleResult {
  return { state: mistake ? { ...state, mistakes: state.mistakes + 1 } : state, success: false, message };
}

function award(state: EscapeState, seal: ExhibitId): PuzzleResult {
  const item = SEALS[seal];
  return { state: { ...state, seals: [...state.seals, seal], gravityStep: 0 }, success: true, message: `${item.name} seal recovered. A ${item.number} is engraved on its edge. It has been added to your journal.` };
}

export function recordClue(state: EscapeState, clue: ClueId): EscapeState {
  return state.clues.includes(clue) ? state : { ...state, clues: [...state.clues, clue] };
}

export function inspectClue(id: ArtifactId, context: PuzzleContext): ClueId | undefined {
  if (id === 'survey') return context.unfolded ? 'survey-open' : 'survey-folded';
  if (id === 'registry') return context.depth === 1 ? 'echo-one' : context.depth === 2 ? 'echo-two' : undefined;
  if (id === 'exit-lock') return 'exit-rule';
  return id in CLUES ? id as ClueId : undefined;
}

export function inReach(artifact: Artifact, context: PuzzleContext): boolean {
  return artifact.room === context.room && context.settled
    && (artifact.face === undefined || artifact.face === context.face)
    && Math.hypot(artifact.x - context.position.x, artifact.z - context.position.z) <= REACH;
}

export function solveSpace(state: EscapeState, symbols: string[]): PuzzleResult {
  if (state.seals.includes('unfolded')) return reject(state, 'This cabinet is empty. You already carry its seal.');
  if (!state.clues.includes('survey-folded') || !state.clues.includes('survey-open')) return reject(state, 'The comparison mechanism needs both surveys. Inspect the catalogue in both states of the hall.');
  if (symbols.join('|') !== 'EYE|KEY|MOON') return reject(state, 'The signs do not hold still. Compare their shelves, not their position on the page.', true);
  return award(state, 'unfolded');
}

export function pressWitness(state: EscapeState, id: ArtifactId, context: PuzzleContext): PuzzleResult {
  const artifact = ARTIFACTS.find(item => item.id === id);
  if (!artifact || !GRAVITY_ORDER.includes(id) || !inReach(artifact, context)) return reject(state, 'You must stand beside this witness on its own surface.');
  if (state.seals.includes('gravity')) return reject(state, 'The witnesses are at rest. You already carry their seal.');
  if (!state.seals.includes('unfolded')) return reject(state, 'The witnesses have no power. The SPACE seal must be recovered first.');
  if (!GRAVITY_ORDER.every(witness => state.clues.includes(witness as ClueId))) return reject(state, 'The ledger is incomplete. Inspect all four witnesses before pressing a sequence.');
  if (id !== GRAVITY_ORDER[state.gravityStep]) return { state: { ...state, gravityStep: 0, mistakes: state.mistakes + 1 }, success: false, message: 'The chain breaks. All four plates reset; your clues and seals are safe. Begin again with the first witness.' };
  if (state.gravityStep === 3) return award(state, 'gravity');
  return { state: { ...state, gravityStep: state.gravityStep + 1 }, success: true, message: `Witness ${state.gravityStep + 1} of 4 accepted. Close this page and find the next. Turning gravity does not reset the chain.` };
}

export function solveRecursion(state: EscapeState, word: string, context: PuzzleContext): PuzzleResult {
  if (context.room !== 'recursive') return reject(state, 'The word must be certified at the echo registry.');
  if (state.seals.includes('recursive')) return reject(state, 'The registry has already surrendered its seal.');
  if (context.depth !== 0) return reject(state, 'A copy cannot certify its original. Return to recursion depth 0.');
  if (!state.seals.includes('gravity')) return reject(state, 'The registry needs the GRAVITY seal to steady its ink.');
  if (!state.clues.includes('echo-one') || !state.clues.includes('echo-two')) return reject(state, 'The registry needs evidence from both the first and the second echo.');
  if (word.trim().toUpperCase() !== 'KEY') return reject(state, 'The word dissolves. Read the replacement letters from the second echo in shelf order.', true);
  return award(state, 'recursive');
}

export function unlockExit(state: EscapeState, code: string, context: PuzzleContext): PuzzleResult {
  if (state.unlocked) return reject(state, 'The door is already open. Walk through it to leave.');
  if (context.room !== 'atrium' || context.depth !== 0) return reject(state, 'This is a copy of the exit. Only the original atrium has an outside.');
  if (state.seals.length !== 3) return reject(state, 'Three seals must be recovered before the departure lock can turn.');
  if (code.trim() !== '247') return reject(state, 'The lock refuses catalogue order. Read the departure inscription again.', true);
  return { state: { ...state, unlocked: true }, success: true, message: 'The departure door is open. Close this page and walk through the pale doorway beside the lock. Unlocking is not the same as leaving.' };
}

export function finishEscape(state: EscapeState, context: PuzzleContext): EscapeState {
  return state.unlocked && !state.escaped && context.room === 'atrium' && context.depth === 0
    && Math.abs(context.position.x) < 1.45 && context.position.z >= 12.4
    ? { ...state, escaped: true } : state;
}

export function revealHint(state: EscapeState): EscapeState {
  const stage = stageFor(state);
  return { ...state, hints: { ...state.hints, [stage]: Math.min(3, state.hints[stage] + 1) } };
}

export function parseEscapeSave(raw: string): EscapeState {
  const value: unknown = JSON.parse(raw);
  const isRecord = (entry: unknown): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry);
  const integer = (entry: unknown, max: number): entry is number => typeof entry === 'number' && Number.isSafeInteger(entry) && entry >= 0 && entry <= max;
  const isClue = (entry: unknown): entry is ClueId => typeof entry === 'string' && Object.hasOwn(CLUES, entry);
  const isSeal = (entry: unknown): entry is ExhibitId => typeof entry === 'string' && Object.hasOwn(SEALS, entry);
  if (!isRecord(value) || value.version !== 1
    || !Array.isArray(value.clues) || !value.clues.every(isClue)
    || new Set(value.clues).size !== value.clues.length
    || !Array.isArray(value.seals) || !value.seals.every(isSeal)
    || new Set(value.seals).size !== value.seals.length
    || !integer(value.gravityStep, 3) || !integer(value.mistakes, Number.MAX_SAFE_INTEGER)
    || !isRecord(value.hints)
    || typeof value.unlocked !== 'boolean' || typeof value.escaped !== 'boolean') {
    throw new Error('The saved escape challenge is invalid.');
  }
  const hints = freshEscape().hints;
  for (const stage of STAGES) {
    const count = value.hints[stage];
    if (!integer(count, 3)) throw new Error('The saved hint progress is invalid.');
    hints[stage] = count;
  }
  const state: EscapeState = {
    version: 1, clues: value.clues, seals: value.seals, gravityStep: value.gravityStep,
    mistakes: value.mistakes, hints, unlocked: value.unlocked, escaped: value.escaped,
  };
  if ((state.seals.includes('gravity') && !state.seals.includes('unfolded'))
    || (state.seals.includes('recursive') && !state.seals.includes('gravity'))
    || (state.unlocked && state.seals.length !== 3)
    || (state.escaped && !state.unlocked)
    || (state.seals.includes('unfolded') && (!state.clues.includes('survey-folded') || !state.clues.includes('survey-open')))
    || (state.seals.includes('gravity') && !GRAVITY_ORDER.every(id => state.clues.includes(id as ClueId)))
    || (state.seals.includes('recursive') && (!state.clues.includes('echo-one') || !state.clues.includes('echo-two')))
    || (state.gravityStep > 0 && (!state.seals.includes('unfolded') || state.seals.includes('gravity') || !GRAVITY_ORDER.every(id => state.clues.includes(id as ClueId))))) {
    throw new Error('The saved escape challenge has inconsistent progress.');
  }
  return state;
}
