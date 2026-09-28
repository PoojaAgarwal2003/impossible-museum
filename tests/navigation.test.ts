import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { constrain, crossing, DOOR_X, EXHIBITS, recursionLabel, ROOMS, walkingDelta } from '../src/navigation.ts';
import { destinationClipPlane, portalCameraMatrix } from '../src/portal-math.ts';

test('each atrium doorway crosses into the correct exhibit', () => {
  for (const room of EXHIBITS) {
    const x = DOOR_X[room];
    assert.equal(crossing('atrium', { x, z: -13 }, { x, z: -13.5 }), room);
    assert.equal(crossing('atrium', { x, z: -13.5 }, { x, z: -13 }), null);
  }
});

test('the return doorway works in every exhibit, but walls do not teleport', () => {
  for (const room of EXHIBITS) {
    assert.equal(crossing(room, { x: 0, z: 13 }, { x: 0, z: 13.5 }), 'atrium');
    assert.equal(crossing(room, { x: 3, z: 13 }, { x: 3, z: 13.5 }), null);
  }
  assert.equal(crossing('atrium', { x: 4, z: -13 }, { x: 4, z: -14 }), null);
  assert.equal(crossing('atrium', { x: 0, z: 0 }, { x: 0, z: 0 }), null);
});

test('crossings use the segment intersection, not just the final x coordinate', () => {
  assert.equal(crossing('atrium', { x: 0, z: -13.3 }, { x: 5, z: -14.3 }), 'gravity');
  assert.equal(crossing('atrium', { x: 5, z: -13.3 }, { x: 0, z: -14.3 }), null);
});

test('movement respects room boundaries and circular exhibit plinths', () => {
  for (const room of ['atrium', ...EXHIBITS] as const) {
    const { bounds } = ROOMS[room];
    const result = constrain(room, { x: 999, z: -999 });
    assert.equal(result.x, bounds.x);
    assert.equal(result.z, room === 'atrium' ? -13.34 : bounds.far);
  }
  const result = constrain('atrium', { x: 0, z: -1 });
  assert.ok(Number.isFinite(result.x) && Number.isFinite(result.z));
  assert.ok(Math.hypot(result.x, result.z + 1) >= 2.28 - 1e-9);
});

test('solid doorway walls keep the player on the correct side of the crossing plane', () => {
  assert.equal(constrain('atrium', { x: 4, z: -14 }).z, -13.34);
  assert.equal(constrain('gravity', { x: 3, z: 14 }).z, 13.34);
  const atWall = constrain('atrium', { x: 4, z: -14 });
  const atDoor = constrain('atrium', { x: 0, z: atWall.z });
  assert.equal(crossing('atrium', atDoor, { x: 0, z: -13.5 }), 'gravity');
});
test('diagonal walking is normalized; slow frames and background gaps are bounded', () => {
  const diagonal = walkingDelta(1, 1, 0, 4, 0.05);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 0.2) < 1e-10);
  assert.deepEqual(walkingDelta(1, 0, 0, 4, 30), { x: 0, z: -0.2 });
  assert.deepEqual(walkingDelta(1, 0, 0, 4, -1), { x: 0, z: -0 });
  const rotated = walkingDelta(1, 0, Math.PI / 2, 4, 0.05);
  assert.ok(Math.abs(rotated.x + 0.2) < 1e-10);
  assert.ok(Math.abs(rotated.z) < 1e-10);
});

test('recursion labels do not overflow by calculating enormous scales', () => {
  assert.equal(recursionLabel(0), 'SCALE 1:1');
  assert.equal(recursionLabel(1), 'RECURSION 01 / SCALE 1:10¹');
  assert.equal(recursionLabel(312), 'RECURSION 312 / SCALE 1:10³¹²');
});

test('portal camera transforms are reversible, including rotated gravity doors', () => {
  const source = new THREE.Matrix4().makeTranslation(-8, 0, -14);
  const destination = new THREE.Matrix4().compose(
    new THREE.Vector3(9, 9, 14),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, Math.PI / 2)),
    new THREE.Vector3(1, 1, 1),
  );
  const camera = new THREE.Matrix4().compose(
    new THREE.Vector3(-7, 1.72, -10),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.3, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  const mapped = portalCameraMatrix(source, destination, camera);
  const roundtrip = portalCameraMatrix(destination, source, mapped);
  camera.elements.forEach((value, index) => assert.ok(Math.abs(roundtrip.elements[index] - value) < 1e-9));
  assert.equal(new THREE.Vector3().setFromMatrixPosition(source).x, -8, 'input matrices are not modified');
});

test('portal clipping retains the interior and removes the destination back wall', () => {
  const destination = new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 14), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
  const plane = destinationClipPlane(destination);
  assert.ok(plane.distanceToPoint(new THREE.Vector3(0, 2, 10)) > 0);
  assert.ok(plane.distanceToPoint(new THREE.Vector3(0, 2, 15)) < 0);
});
