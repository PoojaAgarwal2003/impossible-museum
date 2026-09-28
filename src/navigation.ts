export type RoomId = 'atrium' | 'unfolded' | 'gravity' | 'recursive';
export type ExhibitId = Exclude<RoomId, 'atrium'>;
export interface Position { x: number; z: number }
export interface Obstacle extends Position { radius: number }
export interface RoomSpec {
  title: string;
  category: string;
  description: string;
  index: string;
  accent: number;
  bounds: { x: number; near: number; far: number };
  obstacles: Obstacle[];
}

export const EXHIBITS: ExhibitId[] = ['unfolded', 'gravity', 'recursive'];
export const DOOR_X: Record<ExhibitId, number> = { unfolded: -8, gravity: 0, recursive: 8 };
export const PLAYER_RADIUS = 0.28;
export const PORTAL_THRESHOLD = 13.35;
export const DOOR_HALF_WIDTH = 1.68;

export const ROOMS: Record<RoomId, RoomSpec> = {
  atrium: {
    title: 'The Atrium', category: 'The space between spaces', index: '00',
    description: 'Three doorways. Three small disagreements with reality. Walk through one, or choose an exhibit below.',
    accent: 0xe5c18d, bounds: { x: 13.7, near: 13, far: -13.8 },
    obstacles: [{ x: 0, z: -1, radius: 2 }, { x: -10.9, z: 3, radius: 1.45 }, { x: 10.9, z: 3, radius: 1.45 }],
  },
  unfolded: {
    title: 'The Unfolded Hall', category: 'Exhibit 01 / A disagreement with space', index: '01',
    description: 'This hall is wider than the building that contains it. Pull at the seam, and watch the architecture unfold.',
    accent: 0xedba8c, bounds: { x: 20, near: 13.8, far: -45 },
    obstacles: [{ x: 0, z: -9, radius: 3.2 }],
  },
  gravity: {
    title: 'The Gravity Garden', category: 'Exhibit 02 / A disagreement with down', index: '02',
    description: 'Four floors. Not a single wall. Shift gravity and discover that down is only a point of view.',
    accent: 0x9ecbbd, bounds: { x: 8.5, near: 13.8, far: -12.5 },
    obstacles: [{ x: -5, z: -3, radius: 1.7 }, { x: 5, z: -6, radius: 1.7 }],
  },
  recursive: {
    title: 'The Museum Within', category: 'Exhibit 03 / A disagreement with infinity', index: '03',
    description: 'A living model of the place you just left. Step inside it. Find this room again. Repeat, if you dare.',
    accent: 0xc7aed8, bounds: { x: 12, near: 13.8, far: -12.5 },
    obstacles: [{ x: 0, z: -3, radius: 3.4 }],
  },
};

export function crossing(room: RoomId, from: Position, to: Position): RoomId | null {
  const edge = room === 'atrium' ? -PORTAL_THRESHOLD : PORTAL_THRESHOLD;
  const crossed = room === 'atrium' ? from.z > edge && to.z <= edge : from.z < edge && to.z >= edge;
  if (!crossed || to.z === from.z) return null;
  const x = from.x + (to.x - from.x) * ((edge - from.z) / (to.z - from.z));
  if (room !== 'atrium') return Math.abs(x) < DOOR_HALF_WIDTH ? 'atrium' : null;
  return EXHIBITS.find(id => Math.abs(x - DOOR_X[id]) < DOOR_HALF_WIDTH) ?? null;
}

export function constrain(room: RoomId, point: Position): Position {
  const { bounds, obstacles } = ROOMS[room];
  const result = {
    x: Math.max(-bounds.x, Math.min(bounds.x, point.x)),
    z: Math.max(bounds.far, Math.min(bounds.near, point.z)),
  };
  const doorway = room === 'atrium'
    ? EXHIBITS.some(id => Math.abs(result.x - DOOR_X[id]) < DOOR_HALF_WIDTH)
    : Math.abs(result.x) < DOOR_HALF_WIDTH;
  if (!doorway) {
    // Keep the player in front of solid wall sections so sidestepping cannot bypass a crossing.
    result.z = room === 'atrium'
      ? Math.max(-PORTAL_THRESHOLD + 0.01, result.z)
      : Math.min(PORTAL_THRESHOLD - 0.01, result.z);
  }
  for (const obstacle of obstacles) {
    const dx = result.x - obstacle.x;
    const dz = result.z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const radius = obstacle.radius + PLAYER_RADIUS;
    if (distance < radius) {
      result.x = obstacle.x + (distance > 0 ? dx / distance : 1) * radius;
      result.z = obstacle.z + (distance > 0 ? dz / distance : 0) * radius;
    }
  }
  return result;
}

export function walkingDelta(forward: number, strafe: number, yaw: number, speed: number, dt: number): Position {
  const length = Math.max(1, Math.hypot(forward, strafe));
  const distance = speed * Math.min(Math.max(dt, 0), 0.05);
  return {
    x: (strafe * Math.cos(yaw) - forward * Math.sin(yaw)) / length * distance,
    z: (-forward * Math.cos(yaw) - strafe * Math.sin(yaw)) / length * distance,
  };
}

export function recursionLabel(depth: number): string {
  return depth === 0 ? 'SCALE 1:1' : `RECURSION ${String(depth).padStart(2, '0')} / SCALE 1:10${superscript(depth)}`;
}

function superscript(value: number): string {
  return String(value).split('').map(digit => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(digit)]).join('');
}
