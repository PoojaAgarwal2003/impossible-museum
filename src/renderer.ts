import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { destinationClipPlane, portalCameraMatrix } from './portal-math.ts';
import { createWorld } from './world.ts';
import type { Portal } from './world.ts';
import type { RoomId } from './navigation.ts';

export type Quality = 'low' | 'balanced' | 'high';

export class MuseumRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.07, 200);
  readonly world = createWorld();
  private readonly portalCamera = new THREE.PerspectiveCamera();
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly bloom: UnrealBloomPass;
  private portalIndex = 0;
  private frame = 0;
  private quality: Quality = 'balanced';
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x152a2e);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'Museum view. Drag to look, W A S D to walk, E to interact, R to return.');
    host.append(this.renderer.domElement);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    const env = pmrem.fromScene(environment, 0.04);
    for (const room of Object.values(this.world.scenes)) {
      room.environment = env.texture;
      room.environmentIntensity = 0.38;
    }
    environment.dispose();
    pmrem.dispose();
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.world.scenes.atrium, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.23, 0.55, 1.1);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  setQuality(quality: Quality): void {
    this.quality = quality;
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.bloom.enabled = quality !== 'low';
    this.resize();
  }

  resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cap = this.quality === 'high' ? 2 : this.quality === 'low' ? 1 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    const portalWidth = Math.min(width, this.quality === 'high' ? 1280 : this.quality === 'low' ? 512 : 900);
    for (const portal of this.world.portals) portal.buffer.setSize(portalWidth, Math.max(1, Math.round(portalWidth * height / width)));
  }

  private renderPortal(portal: Portal): void {
    if (!portal.exit) return;
    const destination = this.world.scenes[portal.target];
    portal.root.updateWorldMatrix(true, false);
    portal.exit.root.updateWorldMatrix(true, false);
    this.portalCamera.copy(this.camera);
    const matrix = portalCameraMatrix(portal.root.matrixWorld, portal.exit.root.matrixWorld, this.camera.matrixWorld);
    matrix.decompose(this.portalCamera.position, this.portalCamera.quaternion, this.portalCamera.scale);
    this.portalCamera.updateMatrixWorld();
    this.renderer.clippingPlanes = [destinationClipPlane(portal.exit.root.matrixWorld)];
    const hidden: THREE.Object3D[] = [];
    // Never sample a render target while writing into it, including surfaces in the miniature.
    destination.traverse(object => {
      if (object.userData.portal && object.visible) { object.visible = false; hidden.push(object); }
    });
    this.renderer.setRenderTarget(portal.buffer);
    this.renderer.render(destination, this.portalCamera);
    hidden.forEach(object => { object.visible = true; });
    this.renderer.clippingPlanes = [];
    this.renderer.setRenderTarget(null);
  }

  render(room: RoomId): void {
    this.camera.updateMatrixWorld();
    for (const scene of Object.values(this.world.scenes)) scene.updateMatrixWorld();
    this.world.visitor.visible = room !== 'atrium';
    this.projection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const visible = this.world.portals.filter(portal => portal.room === room && this.frustum.intersectsObject(portal.surface));
    if (visible.length) this.renderPortal(visible[this.portalIndex++ % visible.length]);
    if (room === 'recursive' && this.frame % (this.quality === 'low' ? 8 : 3) === 0) {
      this.world.visitor.visible = true;
      this.renderer.setRenderTarget(this.world.liveBuffer);
      this.renderer.render(this.world.scenes.atrium, this.world.liveCamera);
      this.renderer.setRenderTarget(null);
    }
    this.renderPass.scene = this.world.scenes[room];
    this.composer.render();
    this.frame++;
  }

  warmup(): void {
    this.camera.updateMatrixWorld();
    for (const room of Object.values(this.world.scenes)) room.updateMatrixWorld(true);
    for (const portal of this.world.portals) this.renderPortal(portal);
    this.renderer.setRenderTarget(this.world.liveBuffer);
    this.renderer.render(this.world.scenes.atrium, this.world.liveCamera);
    this.renderer.setRenderTarget(null);
  }

  async postcard(room: RoomId): Promise<Blob> {
    this.render(room);
    const blob = await new Promise<Blob | null>(resolve => this.renderer.domElement.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Your browser could not create the postcard image.');
    return blob;
  }
}
