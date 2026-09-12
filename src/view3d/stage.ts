/**
 * LA SCÈNE — socle Three.js
 *
 * Volontairement mince : renderer, caméra, lumières, sol, boucle.
 * Tout ce qui dépend de l'état du run vit dans actors.ts / spans.ts.
 *
 * Pour Angular : instancier Stage dans `ngZone.runOutsideAngular(() => …)`,
 * sinon la détection de changements tourne à 60 images/seconde pour rien.
 * Remonter vers Angular uniquement les changements de sélection.
 */

import {
  AmbientLight, CircleGeometry, Color, DirectionalLight, Fog, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PolarGridHelper, Raycaster,
  Scene, Vector2, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const PALETTE = {
  ground: 0x13100c,
  accent: 0xe8a33c,
  ink: 0xf3eada,
  idle: 0x6d5c45,
  think: 0xe8a33c,
  tool: 0xf0e0c4,
  wait: 0x5e6e7a,
  deny: 0xd9503f,
  done: 0x86b36a,
  alert: 0x48d6e0,
  absent: 0x2a2219,
} as const;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(46, 1, 0.1, 400);
  readonly controls: OrbitControls;
  readonly floor: Mesh<CircleGeometry, MeshStandardMaterial>;
  readonly polar: PolarGridHelper;

  private readonly ray = new Raycaster();
  private readonly ptr = new Vector2();
  private raf = 0;
  private prev = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.scene.background = new Color(PALETTE.ground);
    this.scene.fog = new Fog(PALETTE.ground, 34, 125);

    this.camera.position.set(15, 13, 21);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 1.5, 0);
    this.controls.minDistance = 6;
    this.controls.maxDistance = 70;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    this.scene.add(new AmbientLight(0xffe9c9, 0.5));
    const key = new DirectionalLight(0xffd9a0, 1.5);
    key.position.set(9, 16, 7);
    this.scene.add(key);
    const rim = new DirectionalLight(0x6fa8c9, 0.5);
    rim.position.set(-11, 5, -9);
    this.scene.add(rim);

    this.floor = new Mesh(
      new CircleGeometry(34, 72),
      new MeshStandardMaterial({ color: 0x1a150f, roughness: 0.96, transparent: true })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.scene.add(this.floor);

    this.polar = new PolarGridHelper(30, 6, 8, 72, 0x3a3025, 0x2a2219);
    const pm = this.polar.material as { opacity: number; transparent: boolean };
    pm.opacity = 0.35;
    pm.transparent = true;
    this.scene.add(this.polar);

    addEventListener('resize', this.resize);
    this.resize();
  }

  readonly resize = (): void => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
  };

  /** `onFrame(dt)` est appelé à chaque image, dt en secondes. */
  start(onFrame: (dt: number) => void): void {
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.prev) / 1000);
      this.prev = now;
      onFrame(dt);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.renderer.dispose();
  }

  /** Sélection par lancer de rayon. Renvoie le premier objet touché. */
  pick(ev: PointerEvent, targets: readonly import('three').Object3D[]): import('three').Object3D | null {
    const r = this.canvas.getBoundingClientRect();
    this.ptr.set(
      ((ev.clientX - r.left) / r.width) * 2 - 1,
      -((ev.clientY - r.top) / r.height) * 2 + 1
    );
    this.ray.setFromCamera(this.ptr, this.camera);
    return this.ray.intersectObjects(targets as import('three').Object3D[], false)[0]?.object ?? null;
  }

  frame(view: 'ruche' | 'riviere'): void {
    if (view === 'ruche') {
      this.controls.target.set(0, 1.5, 0);
      this.camera.position.set(15, 13, 21);
    } else {
      this.controls.target.set(1.5, 0, 0);
      this.camera.position.set(0, 29, 29);
    }
  }
}
