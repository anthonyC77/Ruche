/**
 * COMÈTES — les messages entre agents, vus depuis l'écran
 *
 * Une comète suit un arc entre deux agents : tête ronde et traînée
 * additive. Son temps est celui de l'ÉCRAN, pas celui du run — sinon un
 * ralenti ou une marche arrière figerait ou inverserait des comètes en plein
 * vol, ce qui n'a pas de sens pour un effet purement visuel. `update(dt)`
 * avance donc toujours vers l'avant, indépendamment de la lecture du run.
 */

import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial,
  Mesh, MeshBasicMaterial, QuadraticBezierCurve3, SphereGeometry, Vector3,
} from 'three';
import { hdr } from './postfx.js';

/** Élévation du point de contrôle de l'arc, au-dessus du segment départ-arrivée. */
const ELEVATION = 4.2;
/** Durée du vol, puis de la traînée qui s'éteint. */
const DUREE_VOL = 1.5;
const DUREE_FONDU = 0.3;
/** Nombre de points de la traînée, et portion de courbe qu'elle couvre derrière la tête. */
const POINTS_TRAINEE = 20;
const PORTION_TRAINEE = 0.35;

interface Comete {
  readonly head: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly trail: Line<BufferGeometry, LineBasicMaterial>;
  readonly pts: Float32Array;
  courbe: QuadraticBezierCurve3 | null;
  age: number;
  humain: boolean;
  actif: boolean;
}

export class Cometes {
  readonly group = new Group();

  private readonly cometes: Comete[];
  private prochaine = 0;

  constructor(capacite = 8) {
    this.cometes = Array.from({ length: capacite }, () => {
      const head = new Mesh(new SphereGeometry(0.2, 14, 10), new MeshBasicMaterial());
      const pts = new Float32Array(POINTS_TRAINEE * 3);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pts, 3));
      const trail = new Line(g, new LineBasicMaterial({
        transparent: true, blending: AdditiveBlending, depthWrite: false,
      }));
      head.visible = trail.visible = false;
      this.group.add(head, trail);
      return { head, trail, pts, courbe: null, age: 0, humain: false, actif: false };
    });
  }

  /** Lance une comète le long d'un arc ; au-delà de la capacité, la plus ancienne est réutilisée. */
  lancer(depart: Vector3, arrivee: Vector3, humain: boolean): void {
    const c = this.cometes[this.prochaine % this.cometes.length]!;
    this.prochaine++;

    const mid = depart.clone().add(arrivee).multiplyScalar(0.5);
    mid.y += ELEVATION;
    c.courbe = new QuadraticBezierCurve3(depart.clone(), mid, arrivee.clone());
    c.age = 0;
    c.humain = humain;
    c.actif = true;
    c.head.visible = true;
    c.trail.visible = true;
    this.appliquer(c);
  }

  update(dt: number): void {
    for (const c of this.cometes) {
      if (!c.actif) continue;
      c.age += dt;
      if (c.age > DUREE_VOL + DUREE_FONDU) {
        c.actif = false;
        c.head.visible = false;
        c.trail.visible = false;
        continue;
      }
      this.appliquer(c);
    }
  }

  /** Tout rendre invisible d'un coup — saut dans le temps, marche arrière. */
  vider(): void {
    for (const c of this.cometes) {
      c.actif = false;
      c.head.visible = false;
      c.trail.visible = false;
    }
  }

  dispose(): void {
    for (const c of this.cometes) {
      c.head.geometry.dispose();
      c.head.material.dispose();
      c.trail.geometry.dispose();
      c.trail.material.dispose();
    }
  }

  private appliquer(c: Comete): void {
    const courbe = c.courbe;
    if (!courbe) return;

    const k = Math.min(1, c.age / DUREE_VOL);
    const couleur = c.humain ? hdr(0xffd37a, 3) : hdr(0xe8a33c, 2.6);

    c.head.visible = c.age <= DUREE_VOL;
    if (c.head.visible) {
      c.head.position.copy(courbe.getPoint(k));
      c.head.scale.setScalar(c.humain ? 1.5 : 1);
      c.head.material.color.copy(couleur);
    }

    for (let j = 0; j < POINTS_TRAINEE; j++) {
      const t = Math.max(0, k - PORTION_TRAINEE + (PORTION_TRAINEE * j) / (POINTS_TRAINEE - 1));
      const p = courbe.getPoint(t);
      c.pts[j * 3] = p.x;
      c.pts[j * 3 + 1] = p.y;
      c.pts[j * 3 + 2] = p.z;
    }
    c.trail.geometry.attributes['position']!.needsUpdate = true;
    c.trail.material.color.copy(couleur);
    c.trail.material.opacity = c.age <= DUREE_VOL ? 1 : 1 - (c.age - DUREE_VOL) / DUREE_FONDU;
  }
}
