/**
 * FILIATION ET MESSAGES
 *
 * Les arêtes de filiation (qui a lancé qui) sont des tubes le long d'une
 * courbe ; les messages sont des billes qui parcourent la même courbe.
 * En marche arrière, les billes reculent — c'est correct, et c'est ce qui
 * rend le sens de lecture évident sans le dire.
 */

import {
  Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, QuadraticBezierCurve3,
  Quaternion, SphereGeometry, TubeGeometry, Vector3,
} from 'three';
import { PALETTE } from './stage.js';
import type { State } from '../core/reducer.js';

/** Fenêtre pendant laquelle un message reste visible, en ms de temps de run. */
const WINDOW_MS = 3200;

export class LinkField {
  readonly group = new Group();
  private readonly tubes = new Map<string, Mesh<TubeGeometry, MeshBasicMaterial>>();
  private readonly trails = new Group();
  private readonly beads: InstancedMesh<SphereGeometry, MeshBasicMaterial>;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly s = new Vector3();

  constructor(private readonly positionOf: (id: string) => Vector3, capacity = 64) {
    this.beads = new InstancedMesh(
      new SphereGeometry(0.19, 10, 8),
      new MeshBasicMaterial({ color: PALETTE.accent }),
      capacity
    );
    this.beads.count = 0;
    this.group.add(this.trails, this.beads);
  }

  private curve(from: string, to: string, lift: number): QuadraticBezierCurve3 {
    const a = this.positionOf(from).clone().setY(0.6);
    const b = this.positionOf(to).clone().setY(0.6);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y += lift;
    return new QuadraticBezierCurve3(a, mid, b);
  }

  update(state: State, tNow: number, morph: number): void {
    // filiation
    for (const e of state.edges) {
      const key = `${e.from}>${e.to}`;
      const curve = this.curve(e.from, e.to, 2.4 * (1 - morph) + 0.4);
      let tube = this.tubes.get(key);
      if (!tube) {
        tube = new Mesh(
          new TubeGeometry(curve, 26, 0.035, 6, false),
          new MeshBasicMaterial({ color: 0x6d5c45, transparent: true, opacity: 0.55 })
        );
        this.tubes.set(key, tube);
        this.group.add(tube);
      } else {
        tube.geometry.dispose();
        tube.geometry = new TubeGeometry(curve, 26, 0.035, 6, false);
      }
      const alive = state.agents[e.from]?.st !== 'absent' && state.agents[e.to]?.st !== 'absent';
      tube.visible = alive;
    }

    // messages
    this.trails.clear();
    let i = 0;
    for (const msg of state.msgs) {
      const age = tNow - msg.t;
      if (age < 0 || age > WINDOW_MS || i >= this.beads.count + 64) continue;
      const k = Math.min(1, age / 1600);
      const curve = this.curve(msg.from, msg.to, 3.2 * (1 - morph) + 0.8);
      this.s.setScalar(msg.human ? 1.5 : 1);
      this.m.compose(curve.getPoint(k), this.q, this.s);
      this.beads.setMatrixAt(i, this.m);
      i++;

      if (age < 1700) {
        this.trails.add(new Mesh(
          new TubeGeometry(curve, 20, 0.02, 5, false),
          new MeshBasicMaterial({
            color: msg.human ? PALETTE.ink : PALETTE.accent,
            transparent: true,
            opacity: 0.45 * (1 - age / 1700),
          })
        ));
      }
    }
    this.beads.count = i;
    this.beads.instanceMatrix.needsUpdate = true;
  }
}
