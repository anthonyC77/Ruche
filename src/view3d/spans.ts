/**
 * LES BARRES DE LA VUE RIVIÈRE
 *
 * Un InstancedMesh unique : un run de 50 000 spans reste à un seul appel de
 * dessin. Ne jamais créer un Mesh par span — c'est le piège qui tue la perf
 * et qui fait dire « la 3D ne passe pas à l'échelle ».
 *
 * Le décor (couloirs, graduations, tête de lecture) vit ici aussi : il n'a de
 * sens que dans cette vue et s'efface avec elle.
 */

import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, Group, InstancedBufferAttribute,
  InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Quaternion, Sprite, SpriteMaterial, Vector3,
} from 'three';
import { PALETTE } from './stage.js';
import type { Layout } from './layout.js';
import type { Span, State } from '../core/reducer.js';

const SPAN_COLOR: Record<Span['kind'], number> = {
  think: PALETTE.think,
  tool: PALETTE.tool,
  toolfail: 0x9e4638,
  deny: PALETTE.deny,
  wait: PALETTE.wait,
  stop: 0x6d5c45,
};

export class SpanField {
  readonly mesh: InstancedMesh<BoxGeometry, MeshStandardMaterial>;
  readonly decor = new Group();
  private readonly playhead: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();
  private readonly c = new Color();

  constructor(private readonly layout: Layout, duration: number, readonly capacity = 4096) {
    this.mesh = new InstancedMesh(
      new BoxGeometry(1, 0.5, 1.5),
      new MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.95 }),
      capacity
    );
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.count = 0;
    this.mesh.visible = false;

    // couloirs
    for (const id of layout.laneOrder) {
      const z = layout.river[id]!.z;
      const g = new BufferGeometry().setFromPoints([
        new Vector3(layout.x0, 0.01, z), new Vector3(layout.x1, 0.01, z),
      ]);
      this.decor.add(new Line(g, new LineBasicMaterial({ color: 0x3a3025, transparent: true, opacity: 0.75 })));
    }

    // graduations de temps
    const step = niceStep(duration);
    for (let ms = 0; ms <= duration; ms += step) {
      const x = layout.xOfT(ms);
      const g = new BufferGeometry().setFromPoints([
        new Vector3(x, 0.01, -9.5), new Vector3(x, 0.01, 9.5),
      ]);
      this.decor.add(new Line(g, new LineBasicMaterial({ color: 0x2a2219, transparent: true, opacity: 0.7 })));
      this.decor.add(tick(`${Math.round(ms / 1000)} s`, x));
    }

    this.playhead = new Mesh(
      new PlaneGeometry(0.09, 20),
      new MeshBasicMaterial({ color: 0xffd37a, transparent: true, opacity: 0.75, side: 2 })
    );
    this.playhead.rotation.x = -Math.PI / 2;
    this.playhead.position.y = 0.05;
    this.decor.add(this.playhead);
    this.decor.visible = false;
  }

  update(state: State, tNow: number, morph: number): void {
    this.mesh.visible = morph > 0.05;
    this.decor.visible = morph > 0.03;
    this.playhead.position.x = this.layout.xOfT(tNow);
    if (!this.mesh.visible) return;

    let i = 0;
    for (const sp of state.spans) {
      if (i >= this.capacity) break;
      const lane = this.layout.river[sp.agent];
      if (!lane) continue;

      const x0 = this.layout.xOfT(sp.t0);
      const x1 = Math.max(x0 + 0.12, this.layout.xOfT(Math.min(sp.t1, tNow)));
      const depth = state.agents[sp.agent]?.depth ?? 0;
      const y = 0.35 + (depth === 1 ? 0.55 : 0);

      this.s.set(x1 - x0, sp.kind === 'deny' ? 1.5 : 0.62, 1.5);
      this.m.compose(new Vector3((x0 + x1) / 2, y * morph - (1 - morph) * 4, lane.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.c.setHex(SPAN_COLOR[sp.kind]);
      this.mesh.setColorAt(i, this.c);
      i++;
    }

    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.material.opacity = 0.25 + morph * 0.72;
  }
}

function niceStep(durationMs: number): number {
  const target = durationMs / 8;
  for (const s of [1e3, 2e3, 5e3, 1e4, 3e4, 6e4, 3e5, 6e5]) if (target <= s) return s;
  return 6e5;
}

function tick(text: string, x: number): Sprite {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 48;
  const g = c.getContext('2d')!;
  g.font = '400 30px "IBM Plex Mono", monospace';
  g.fillStyle = '#72634f';
  g.textAlign = 'center';
  g.fillText(text, 64, 34);
  const s = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(1.4, 0.52, 1);
  s.position.set(x, 0.2, 10.6);
  return s;
}
