import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { DOOR_X, EXHIBITS, ROOMS } from './navigation.ts';
import type { RoomId } from './navigation.ts';
import { ARTIFACTS } from './escape.ts';
import type { Artifact } from './escape.ts';

export interface Portal {
  room: RoomId;
  target: RoomId;
  root: THREE.Group;
  surface: THREE.Mesh<THREE.ShapeGeometry, THREE.ShaderMaterial>;
  buffer: THREE.WebGLRenderTarget;
  exit?: Portal;
}

export interface MuseumWorld {
  scenes: Record<RoomId, THREE.Scene>;
  portals: Portal[];
  gravityDoor: THREE.Group;
  foldedArchitecture: THREE.Group;
  centerpiece: THREE.Group;
  miniatureSculpture: THREE.Object3D;
  visitor: THREE.Group;
  miniatureVisitor: THREE.Object3D;
  liveBuffer: THREE.WebGLRenderTarget;
  liveCamera: THREE.PerspectiveCamera;
  escape: EscapeCollection;
  animate: (time: number) => void;
}

export interface EscapeCollection {
  groups: THREE.Group[];
  props: { artifact: Artifact; object: THREE.Group; marker: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> }[];
  exitDoor: THREE.Group;
  exitLight: THREE.Mesh;
}

const unitBox = new THREE.BoxGeometry();
const palette = {
  stone: new THREE.MeshStandardMaterial({ color: 0xe4ddc9, roughness: 0.82 }),
  pale: new THREE.MeshStandardMaterial({ color: 0xf1e9d8, roughness: 0.67 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x253e40, roughness: 0.78 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xbda06d, metalness: 0.8, roughness: 0.25 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xdfb976, metalness: 0.72, roughness: 0.2 }),
  terracotta: new THREE.MeshStandardMaterial({ color: 0xc58270, roughness: 0.85 }),
  green: new THREE.MeshStandardMaterial({ color: 0x597e70, roughness: 0.85 }),
};

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material = palette.stone): THREE.Mesh {
  const mesh = new THREE.Mesh(unitBox, material);
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: THREE.Object3D, radius: number, height: number, position: [number, number, number], material: THREE.Material = palette.stone): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 48), material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ring(parent: THREE.Object3D, radius: number, tube: number, position: [number, number, number], material: THREE.Material = palette.brass): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 72), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function glow(color: number, intensity = 2): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.45 });
}

function label(parent: THREE.Object3D, text: string, position: [number, number, number], width: number, color = '#bba579', font = '500 64px sans-serif'): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create a canvas for exhibit labels.');
  context.clearRect(0, 0, 1024, 128);
  context.fillStyle = color;
  context.font = font;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 512, 64, 980);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function floor(parent: THREE.Object3D, width: number, depth: number, centerZ = 0, color = 0xbac2b5): void {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create the museum floor.');
  context.fillStyle = '#e3dfd3';
  context.fillRect(0, 0, 256, 256);
  let seed = 541;
  for (let i = 0; i < 2300; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 256;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = seed % 256;
    context.fillStyle = i % 2 ? '#c5c6b942' : '#ffffff44';
    context.fillRect(x, y, 1 + i % 2, 1);
  }
  context.strokeStyle = '#637c7040';
  context.lineWidth = 1;
  context.strokeRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(width / 3.5, depth / 3.5);
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({ color, map: texture, roughness: 0.48, metalness: 0.12 });
  box(parent, [width, 0.22, depth], [0, -0.12, centerZ], material);
}

function shadow(parent: THREE.Object3D, radius: number, x: number, z: number): void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create a shadow texture.');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, '#11292888');
  gradient.addColorStop(1, '#11292800');
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.008, z);
  parent.add(mesh);
}

function arch(parent: THREE.Object3D, width: number, height: number, position: [number, number, number], material = palette.pale, thickness = 0.35): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  const r = width / 2;
  const spring = height - r;
  box(group, [thickness, spring, 0.55], [-r - thickness / 2, spring / 2, 0], material);
  box(group, [thickness, spring, 0.55], [r + thickness / 2, spring / 2, 0], material);
  const shape = new THREE.Shape();
  shape.absarc(0, spring, r + thickness, 0, Math.PI, false);
  shape.absarc(0, spring, r, Math.PI, 0, true);
  shape.closePath();
  const crown = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false, curveSegments: 40 }), material);
  crown.position.z = -0.275;
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown);
  parent.add(group);
  return group;
}

function tree(parent: THREE.Object3D, x: number, z: number, scale = 1, color = 0x6e8975): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  cylinder(group, 0.7, 0.65, [0, 0.325, 0], palette.terracotta);
  cylinder(group, 0.6, 0.05, [0, 0.66, 0], palette.dark);
  const trunk = cylinder(group, 0.075, 2.4, [0, 1.8, 0], palette.brass);
  trunk.rotation.z = -0.08;
  const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), 55);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 55; i++) {
    const phi = i * 2.399963;
    const y = 1 - (i / 54) * 2;
    const r = Math.sqrt(1 - y * y);
    dummy.position.set(Math.cos(phi) * r * 1.05, 3.1 + y * 0.85, Math.sin(phi) * r * 0.85);
    dummy.rotation.set(i, i * 0.7, 0);
    dummy.scale.setScalar(0.65 + (i % 5) * 0.1);
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
  }
  foliage.castShadow = true;
  group.add(foliage);
  parent.add(group);
  return group;
}

function scene(background: number, fogFar: number): THREE.Scene {
  const result = new THREE.Scene();
  result.background = new THREE.Color(background);
  result.fog = new THREE.Fog(background, fogFar * 0.35, fogFar);
  result.add(new THREE.HemisphereLight(0xf8ecd4, 0x3c6662, 2.3));
  const sun = new THREE.DirectionalLight(0xffecd0, 3.7);
  sun.position.set(-13, 24, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 100 });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.00015;
  result.add(sun);
  const fill = new THREE.DirectionalLight(0xb5d8df, 1.1);
  fill.position.set(15, 10, -20);
  result.add(fill);
  return result;
}

function doorwayShape(width: number, height: number): THREE.Shape {
  const radius = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-radius, 0);
  shape.lineTo(radius, 0);
  shape.lineTo(radius, height - radius);
  shape.absarc(0, height - radius, radius, 0, Math.PI, false);
  shape.closePath();
  return shape;
}

function makePortal(parent: THREE.Object3D, room: RoomId, target: RoomId, x: number, z: number, reverse = false): Portal {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = reverse ? Math.PI : 0;
  const width = 3.8; const height = 6.8; const radius = width / 2;
  const shape = doorwayShape(width, height);
  const buffer = new THREE.WebGLRenderTarget(640, 360, { depthBuffer: true });
  const material = new THREE.ShaderMaterial({
    uniforms: { view: { value: buffer.texture } },
    vertexShader: `
      varying vec4 screenPosition;
      #include <clipping_planes_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        screenPosition = gl_Position;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D view;
      varying vec4 screenPosition;
      #include <clipping_planes_pars_fragment>
      void main() {
        #include <clipping_planes_fragment>
        vec2 uv = screenPosition.xy / screenPosition.w * 0.5 + 0.5;
        gl_FragColor = texture2D(view, uv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.FrontSide,
    clipping: true,
  });
  const surface = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), material);
  surface.userData.portal = true;
  root.add(surface);
  arch(root, width, height, [0, 0, -0.1], palette.pale, 0.48);
  const trim = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.07, 0.035, 8, 60, Math.PI), glow(ROOMS[target].accent, 1.3));
  trim.position.set(0, height - radius, 0.3);
  root.add(trim);
  for (const direction of [-1, 1]) {
    box(root, [0.035, height - radius, 0.035], [direction * (radius + 0.07), (height - radius) / 2, 0.3], glow(ROOMS[target].accent, 1.3));
  }
  box(root, [4.9, 0.12, 1.2], [0, 0.015, 0.15], palette.stone);
  const portalLight = new THREE.PointLight(ROOMS[target].accent, 22, 7, 2);
  portalLight.position.set(0, 2.8, 1.5);
  root.add(portalLight);
  label(root, target === 'atrium' ? 'RETURN TO THE ATRIUM' : `0${EXHIBITS.indexOf(target) + 1}    /    ${target === 'unfolded' ? 'SPACE' : target === 'gravity' ? 'GRAVITY' : 'INFINITY'}`, [0, 7.8, 0.35], 4.8);
  parent.add(root);
  return { room, target, root, surface, buffer };
}

function buildAtrium(atrium: THREE.Scene): { architecture: THREE.Group; sculpture: THREE.Group } {
  const architecture = new THREE.Group();
  atrium.add(architecture);
  floor(architecture, 30, 30);
  box(architecture, [30, 9.7, 0.7], [0, 4.8, -14.5]);
  for (const x of [-14.8, 14.8]) {
    box(architecture, [0.7, 9.7, 30], [x, 4.8, 0]);
    box(architecture, [0.13, 0.14, 29], [x * 0.974, 0.5, 0], palette.brass);
    for (const z of [-9, -1, 7]) {
      const recess = arch(architecture, 4.3, 7.4, [x * 0.97, 0, z], palette.stone, 0.23);
      recess.rotation.y = Math.PI / 2;
      box(architecture, [0.07, 6.7, 3.9], [x * 0.966, 3.4, z], palette.dark);
    }
  }
  box(architecture, [29.2, 0.22, 0.18], [0, 8.8, -14.02], palette.brass);
  for (const x of [-12, 12]) {
    for (const z of [-9, 0, 9]) {
      box(architecture, [0.85, 8.9, 0.85], [x, 4.45, z]);
      box(architecture, [1.3, 0.22, 1.3], [x, 0.12, z], palette.pale);
      box(architecture, [1.2, 0.2, 1.2], [x, 8.6, z], palette.pale);
    }
  }
  const roof = new THREE.Group();
  for (let z = -13; z <= 15; z += 3.4) box(roof, [30, 0.5, 0.65], [0, 9.3, z]);
  for (const x of [-13, 13]) box(roof, [2.1, 0.65, 30], [x, 9.5, 0]);
  atrium.add(roof);
  for (const x of [-10.9, 10.9]) {
    box(architecture, [2.4, 0.16, 1.1], [x, 0.7, 3], palette.dark);
    for (const dx of [-0.8, 0.8]) box(architecture, [0.12, 0.62, 0.7], [x + dx, 0.32, 3], palette.brass);
    tree(architecture, x, -9, 0.93);
  }
  for (const radius of [3.4, 3.46, 5.4]) {
    const inlay = ring(architecture, radius, 0.017, [0, 0.025, -1]);
    inlay.rotation.x = Math.PI / 2;
  }
  shadow(architecture, 3, 0, -1);
  cylinder(architecture, 1.6, 0.32, [0, 0.16, -1], palette.dark);
  cylinder(architecture, 1.5, 0.05, [0, 0.35, -1], palette.brass);
  const sculpture = new THREE.Group();
  sculpture.position.set(0, 3.1, -1);
  const outer = new THREE.Mesh(new THREE.IcosahedronGeometry(1.43, 0), palette.brass);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(outer.geometry), new THREE.LineBasicMaterial({ color: 0xe6cda0 }));
  sculpture.add(edges);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.76), palette.gold);
  inner.castShadow = true;
  sculpture.add(inner);
  for (let i = 0; i < 3; i++) {
    const orbit = ring(sculpture, 1.63 + i * 0.11, 0.022, [0, 0, 0]);
    orbit.rotation.set(i * 0.9 + 0.5, i * 1.1, 0);
  }
  architecture.add(sculpture);
  label(architecture, 'THE STILL POINT', [0, 0.85, 0.62], 2.5, '#d8c29b');
  label(architecture, 'PLEASE QUESTION EVERYTHING', [0, 8.85, -13.95], 7.3, '#8a795b', '400 42px sans-serif');
  for (const x of [-7, 7]) {
    const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), glow(0xffdf9f, 2));
    pendant.position.set(x, 7, 4);
    architecture.add(pendant);
    cylinder(architecture, 0.012, 2.3, [x, 8.2, 4], palette.brass);
  }
  return { architecture, sculpture };
}

function buildUnfolded(room: THREE.Scene): { fold: THREE.Group; mobile: THREE.Mesh } {
  floor(room, 44, 76, -21, 0xc8bba7);
  const architecture = new THREE.Group();
  for (let row = 0; row < 9; row++) {
    const z = -row * 7 - 2;
    arch(architecture, 13.5, 17, [0, 0, z], palette.pale, 0.8);
    for (const side of [-1, 1]) {
      const arcade = arch(architecture, 5.3, 9.2, [side * 13, 0, z], palette.stone, 0.45);
      arcade.rotation.y = Math.PI / 2;
      box(architecture, [3.2, 0.2, 3.2], [side * 9.6, 0.1, z], palette.stone);
    }
  }
  room.add(architecture);
  for (const x of [-21, 21]) box(room, [0.6, 5, 75], [x, 2.5, -21], palette.stone);
  cylinder(room, 2.7, 0.5, [0, 0.25, -9], palette.dark);
  shadow(room, 4, 0, -9);
  const geometry = new ParametricGeometry((u, v, target) => {
    const a = u * Math.PI * 2;
    const w = (v - 0.5) * 1.5;
    target.set((2.35 + w * Math.cos(a / 2)) * Math.cos(a), (2.35 + w * Math.cos(a / 2)) * Math.sin(a), w * Math.sin(a / 2));
  }, 100, 20);
  const material = palette.gold.clone();
  material.side = THREE.DoubleSide;
  const mobile = new THREE.Mesh(geometry, material);
  mobile.position.set(0, 4.5, -9);
  mobile.castShadow = true;
  room.add(mobile);
  label(room, 'A SINGLE SIDE. AN ENDLESS JOURNEY.', [0, 0.94, -6.2], 4, '#c6ad81', '400 42px sans-serif');
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 48, 32), glow(0xffd2a5, 1.3));
  moon.position.set(0, 14, -51);
  room.add(moon);
  for (let i = 0; i < 16; i++) {
    const stair = box(room, [3, 0.3, 1.1], [-12, 0.3 + i * 0.38, -3 - i * 1.05], palette.terracotta);
    stair.rotation.y = i * 0.02;
    const block = box(room, [0.7, 0.7, 0.7], [11 + Math.sin(i * 0.7), 1.5 + i * 0.52, -6 - i * 1.4], palette.brass);
    block.rotation.set(i * 0.23, i * 0.51, i * 0.17);
  }
  return { fold: architecture, mobile };
}

function buildGravity(room: THREE.Scene): THREE.Group {
  const center = new THREE.Group();
  center.position.y = 9;
  const faceMaterials = [palette.pale, new THREE.MeshStandardMaterial({ color: 0xbac9b7, roughness: 0.8 }), palette.pale, new THREE.MeshStandardMaterial({ color: 0xd1baa8, roughness: 0.8 })];
  for (let side = 0; side < 4; side++) {
    const face = new THREE.Group();
    face.rotation.z = side * Math.PI / 2;
    const garden = new THREE.Group();
    garden.position.y = -9;
    box(garden, [18, 0.22, 28], [0, -0.12, 0], faceMaterials[side]);
    for (let x = -7; x <= 7; x += 3.5) box(garden, [0.025, 0.01, 27], [x, 0.02, 0], palette.brass);
    for (let z = -12; z <= 12; z += 4) box(garden, [18, 0.01, 0.025], [0, 0.02, z], palette.brass);
    tree(garden, -5, -3, 1.45, side % 2 ? 0xb79786 : 0x678f7c);
    tree(garden, 5, -6, 1.2, side % 2 ? 0x759785 : 0xc49988);
    for (const x of [-5, 5]) {
      box(garden, [2.6, 0.35, 2.6], [x, 0.16, x < 0 ? -3 : -6], palette.dark);
      ring(garden, 0.7, 0.03, [x, 0.95, 4], palette.gold).rotation.x = Math.PI / 2;
    }
    label(garden, ['FLOOR', 'WALL', 'CEILING', 'OTHER WALL'][side], [0, 0.03, 4], 4, '#526e64').rotation.x = -Math.PI / 2;
    face.add(garden);
    center.add(face);
  }
  room.add(center);
  box(room, [18, 18, 0.3], [0, 9, -13.8], palette.dark);
  const halo = new THREE.Group();
  halo.position.set(0, 9, -5);
  for (let i = 0; i < 3; i++) {
    const orbit = ring(halo, 3.2 + i * 0.35, 0.055, [0, 0, 0], palette.brass);
    orbit.rotation.set(i * 0.9, i * 0.65, 0);
  }
  const stone = new THREE.Mesh(new THREE.IcosahedronGeometry(1.75, 1), palette.pale);
  stone.castShadow = true;
  halo.add(stone);
  room.add(halo);
  const backCircle = ring(room, 6.2, 0.055, [0, 9, -13.58], glow(0xb3d6c3, 1.5));
  backCircle.rotation.z = 0.2;
  label(room, 'DOWN IS A POINT OF VIEW', [0, 15.8, -13.5], 9, '#b7c6ae', '400 42px sans-serif');
  const illumination = new THREE.PointLight(0xc3ffe0, 160, 25, 2);
  illumination.position.set(0, 9, -3);
  room.add(illumination);
  return halo;
}

function buildRecursive(room: THREE.Scene, atrium: THREE.Group, centerpiece: THREE.Group): { miniatureSculpture: THREE.Object3D; liveBuffer: THREE.WebGLRenderTarget; liveCamera: THREE.PerspectiveCamera; model: THREE.Group } {
  floor(room, 25, 29, 0, 0xbfb2b4);
  const wall = new THREE.MeshStandardMaterial({ color: 0xa7a1b2, roughness: 0.88 });
  box(room, [25, 10.5, 0.4], [0, 5.2, -13.8], wall);
  for (const x of [-12.5, 12.5]) {
    box(room, [0.4, 10.5, 29], [x, 5.2, 0], wall);
    for (const z of [-8, 0, 8]) {
      box(room, [0.8, 9.8, 0.55], [x * 0.97, 4.9, z], palette.stone);
      const frame = ring(room, 1.45, 0.055, [x * 0.971, 4.2, z], palette.brass);
      frame.rotation.y = Math.PI / 2;
    }
  }
  for (let z = -12; z < 15; z += 4) box(room, [25, 0.35, 0.45], [0, 10.2, z], palette.stone);
  shadow(room, 4.8, 0, -3);
  cylinder(room, 3.15, 0.22, [0, 0.11, -3], palette.brass);
  cylinder(room, 2.8, 0.84, [0, 0.63, -3], palette.dark);
  cylinder(room, 3.05, 0.09, [0, 1.08, -3], palette.pale);
  const model = new THREE.Group();
  model.position.set(0, 1.16, -3);
  model.scale.setScalar(0.145);
  const miniature = atrium.clone(true);
  let miniatureSculpture: THREE.Object3D | undefined;
  const miniatureLights: THREE.Object3D[] = [];
  miniature.traverse(object => { if (object instanceof THREE.Light) miniatureLights.push(object); });
  miniatureLights.forEach(light => light.removeFromParent());
  // Keep the miniature animated without multiplying light intensity at its much smaller scale.
  atrium.children.forEach((child, index) => {
    if (child === centerpiece) miniatureSculpture = miniature.children[index];
  });
  model.add(miniature);
  room.add(model);
  if (!miniatureSculpture) throw new Error('The miniature centerpiece could not be created.');
  label(room, 'THE MUSEUM, CONTAINING THE MUSEUM', [0, 0.76, 0.04], 4.6, '#e1c798', '400 42px sans-serif');
  label(room, 'YOU HAVE BEEN HERE BEFORE', [0, 8.8, -13.51], 10, '#e6d8b8', '400 42px sans-serif');
  const liveBuffer = new THREE.WebGLRenderTarget(960, 600);
  const painting = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 5.94), new THREE.MeshBasicMaterial({ map: liveBuffer.texture }));
  painting.position.set(0, 5.1, -13.5);
  room.add(painting);
  for (const x of [-4.9, 4.9]) box(room, [0.17, 6.28, 0.16], [x, 5.1, -13.48], palette.brass);
  for (const y of [2, 8.2]) box(room, [9.96, 0.17, 0.16], [0, y, -13.48], palette.brass);
  label(room, 'LIVE / THE ATRIUM', [0, 1.55, -13.48], 3.5, '#f1d8b2', '400 42px sans-serif');
  const liveCamera = new THREE.PerspectiveCamera(49, 1.6, 0.1, 150);
  liveCamera.position.set(12, 7, 13);
  liveCamera.lookAt(0, 2, -5);
  for (const x of [-8.5, 8.5]) tree(room, x, -10, 1.3, 0x969c87);
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 20), glow(0xffe2b2, 2));
  pendant.position.set(0, 8, -3);
  room.add(pendant);
  cylinder(room, 0.018, 2.2, [0, 9.1, -3], palette.brass);
  return { miniatureSculpture, liveBuffer, liveCamera, model };
}

function createEscapeCollection(scenes: Record<RoomId, THREE.Scene>): EscapeCollection {
  const groups = Object.fromEntries(Object.keys(scenes).map(id => {
    const group = new THREE.Group();
    group.visible = false;
    scenes[id as RoomId].add(group);
    return [id, group];
  })) as Record<RoomId, THREE.Group>;
  const props: EscapeCollection['props'] = [];
  for (const artifact of ARTIFACTS) {
    const object = new THREE.Group();
    object.position.set(artifact.x, 0, artifact.z);
    if (artifact.face !== undefined) {
      object.position.y -= 9;
      object.rotation.z = artifact.face * Math.PI / 2;
      object.position.applyAxisAngle(new THREE.Vector3(0, 0, 1), object.rotation.z);
      object.position.y += 9;
    }
    object.userData.artifactId = artifact.id;
    cylinder(object, 0.43, 0.88, [0, 0.44, 0], palette.dark);
    cylinder(object, 0.49, 0.055, [0, 0.91, 0], palette.brass);
    if (artifact.kind === 'book') {
      for (const side of [-1, 1]) {
        const page = box(object, [0.37, 0.055, 0.51], [side * 0.18, 1, 0], palette.pale);
        page.rotation.z = side * 0.14;
        for (let line = 0; line < 4; line++) box(object, [0.24, 0.006, 0.008], [side * 0.18, 1.04, -0.13 + line * 0.07], palette.brass);
      }
    } else {
      const tablet = box(object, [1.1, 0.68, 0.1], [0, 1.27, 0], artifact.kind === 'lock' ? palette.brass : palette.dark);
      tablet.rotation.x = -0.12;
      if (artifact.kind === 'lock') {
        for (let i = -1; i <= 1; i++) ring(object, 0.085, 0.022, [i * 0.24, 1.25, 0.08], palette.dark);
      } else {
        label(object, artifact.kind === 'plate' ? artifact.id.toUpperCase() : 'CATALOGUE', [0, 1.36, 0.08], 0.95, '#ead5ad');
      }
    }
    const marker = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), glow(0xf0c788, 0.65));
    marker.position.y = 2;
    object.add(marker);
    ring(object, 0.22, 0.009, [0, 2, 0], palette.brass);
    groups[artifact.room].add(object);
    props.push({ artifact, object, marker });
  }
  const doorway = new THREE.Group();
  doorway.position.set(0, 0, 13.1);
  doorway.rotation.y = Math.PI;
  arch(doorway, 3.4, 6.3, [0, 0, 0], palette.pale, 0.45);
  label(doorway, 'THE WAY OUT', [0, 7.1, 0.1], 4, '#e1c598');
  const exitDoor = new THREE.Group();
  exitDoor.position.x = -1.7;
  const leaf = new THREE.Mesh(new THREE.ExtrudeGeometry(doorwayShape(3.4, 6.3), { depth: 0.16, bevelEnabled: false }), palette.dark);
  leaf.position.set(1.7, 0, -0.08);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  exitDoor.add(leaf);
  for (const x of [0.12, 3.28]) box(exitDoor, [0.026, 4.55, 0.025], [x, 2.3, 0.1], palette.brass);
  cylinder(exitDoor, 0.05, 0.4, [2.9, 1.65, 0.16], palette.brass);
  doorway.add(exitDoor);
  const exitLight = new THREE.Mesh(new THREE.ShapeGeometry(doorwayShape(3.35, 6.26), 48), glow(0xffecc3, 2.3));
  exitLight.position.z = -0.11;
  doorway.add(exitLight);
  exitLight.visible = false;
  groups.atrium.add(doorway);
  return { groups: Object.values(groups), props, exitDoor, exitLight };
}

export function createWorld(): MuseumWorld {
  const scenes: Record<RoomId, THREE.Scene> = {
    atrium: scene(0x91aaa8, 90),
    unfolded: scene(0xb8a197, 115),
    gravity: scene(0x3c645e, 80),
    recursive: scene(0x868795, 80),
  };
  const { architecture, sculpture } = buildAtrium(scenes.atrium);
  const portals: Portal[] = [];
  for (const id of EXHIBITS) {
    const entry = makePortal(architecture, 'atrium', id, DOOR_X[id], -14);
    const exit = makePortal(scenes[id], id, 'atrium', 0, 14, true);
    entry.exit = exit; exit.exit = entry;
    portals.push(entry, exit);
  }
  const unfolded = buildUnfolded(scenes.unfolded);
  const halo = buildGravity(scenes.gravity);
  const recursive = buildRecursive(scenes.recursive, architecture, sculpture);
  const escape = createEscapeCollection(scenes);
  const visitor = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.9, 5, 10), glow(0xe9c783, 0.25));
  body.position.y = 0.85;
  visitor.add(body);
  visitor.position.set(0, 0, 8);
  scenes.atrium.add(visitor);
  const miniatureVisitor = visitor.clone();
  recursive.model.add(miniatureVisitor);
  const motes: THREE.Points[] = [];
  for (const room of Object.values(scenes)) {
    const positions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      positions[i * 3] = Math.sin(i * 127.1) * 13;
      positions[i * 3 + 1] = 0.6 + (i % 29) / 29 * 8;
      positions[i * 3 + 2] = Math.cos(i * 311.7) * 16;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffe6b3, size: 0.035, transparent: true, opacity: 0.5, depthWrite: false }));
    room.add(particles);
    motes.push(particles);
  }
  return {
    scenes, portals, gravityDoor: portals.find(portal => portal.room === 'gravity')!.root,
    foldedArchitecture: unfolded.fold, centerpiece: sculpture,
    miniatureSculpture: recursive.miniatureSculpture, visitor, miniatureVisitor,
    liveBuffer: recursive.liveBuffer, liveCamera: recursive.liveCamera, escape,
    animate(time) {
      sculpture.rotation.set(Math.sin(time * 0.13) * 0.12, time * 0.15, Math.cos(time * 0.18) * 0.08);
      sculpture.position.y = 3.1 + Math.sin(time * 0.8) * 0.12;
      recursive.miniatureSculpture.rotation.copy(sculpture.rotation);
      recursive.miniatureSculpture.position.y = sculpture.position.y;
      unfolded.mobile.rotation.set(0.2, time * 0.13, Math.sin(time * 0.2) * 0.25);
      halo.rotation.set(time * 0.04, time * 0.11, time * 0.07);
      motes.forEach((particles, index) => { particles.position.y = Math.sin(time * 0.16 + index) * 0.35; });
    },
  };
}
