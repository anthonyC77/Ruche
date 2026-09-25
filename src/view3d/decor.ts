/**
 * DÉCOR — sol alvéolé et poussière en suspension
 *
 * Le sol est une seule grille hexagonale rendue en un InstancedMesh : le
 * README interdit un Mesh par élément répété, et une ruche en a des
 * centaines. Chaque alvéole part d'une teinte de base sombre et tire vers la
 * couleur des agents actifs à proximité — c'est `illuminer` qui recalcule ce
 * mélange à chaque image, jamais l'inverse.
 */

import {
  BufferAttribute, BufferGeometry, Color, CylinderGeometry, InstancedMesh, Matrix4,
  MeshStandardMaterial, Points, PointsMaterial, Vector3,
} from 'three';
import { hdr } from './postfx.js';

/** Portée d'influence d'une source lumineuse sur les alvéoles voisines. */
const PORTEE = 4.2;

export class SolAlveole {
  readonly mesh: InstancedMesh<CylinderGeometry, MeshStandardMaterial>;
  readonly centres: readonly Vector3[];

  private readonly base: readonly Color[];
  private readonly c = new Color();

  constructor(taille = 1.32, anneaux = 8) {
    const centres: Vector3[] = [];
    for (let q = -anneaux; q <= anneaux; q++) {
      for (let r = -anneaux; r <= anneaux; r++) {
        if (Math.abs(q + r) > anneaux) continue;
        centres.push(new Vector3(taille * Math.sqrt(3) * (q + r / 2), 0, taille * 1.5 * r));
      }
    }
    this.centres = centres;

    this.mesh = new InstancedMesh(
      new CylinderGeometry(taille * 0.94, taille * 0.94, 0.3, 6),
      new MeshStandardMaterial({ roughness: 0.82, metalness: 0.2, transparent: true }),
      centres.length
    );

    const base: Color[] = [];
    const m = new Matrix4();
    centres.forEach((p, i) => {
      const h = 0.15 * Math.sin(p.x * 0.7) * Math.cos(p.z * 0.6) * (p.length() > 10 ? 1 : 0.25);
      m.makeTranslation(p.x, -0.15 + h, p.z);
      this.mesh.setMatrixAt(i, m);
      const v = 0.055 + ((i * 7919) % 13) / 13 * 0.02;
      const c = new Color().setRGB(v * 1.25, v, v * 0.72);
      base.push(c);
      this.mesh.setColorAt(i, c);
    });
    this.base = base;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Chaque alvéole proche d'une source tire sa couleur de base vers celle-ci. */
  illuminer(sources: readonly { x: number; z: number; couleur: Color; force: number }[]): void {
    this.centres.forEach((p, i) => {
      this.c.copy(this.base[i] ?? this.base[0]!);
      for (const s of sources) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d >= PORTEE) continue;
        const t = Math.min(1, s.force * (1 - d / PORTEE));
        this.c.lerp(s.couleur, t);
      }
      this.mesh.setColorAt(i, this.c);
    });
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  set opacite(o: number) {
    this.mesh.material.opacity = o;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

export class Poussiere {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(n = 260) {
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 36;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.points = new Points(
      g,
      new PointsMaterial({ color: hdr(0xe8a33c, 0.5), size: 0.06, transparent: true, opacity: 0.55, depthWrite: false })
    );
  }

  /** Rotation lente, seul mouvement du nuage de poussière. */
  update(dt: number): void {
    this.points.rotation.y += dt * 0.01;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
