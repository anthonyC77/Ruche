/**
 * UN NŒUD PAR AGENT
 *
 * Encodages visuels — chacun porte UNE information, jamais deux :
 *   position  → rôle (ruche) / couloir (rivière)
 *   couleur   → état courant (sémantique : jamais une identité)
 *   hauteur   → coût accumulé (appels)
 *   anneau    → quota consommé, rouge au-delà de 80 %
 *   halo      → l'agent travaille en ce moment
 *   faisceau  → main levée (la seule note froide de la palette, visible de partout)
 *   onde      → un hook vient de refuser
 */

import {
  AdditiveBlending, CanvasTexture, CylinderGeometry, DoubleSide, Group,
  IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  RingGeometry, Sprite, SpriteMaterial, TorusGeometry, Vector3, Color,
} from 'three';
import { PALETTE } from './stage.js';
import type { AgentDecl } from '../core/events.js';
import type { AgentState, AgentView } from '../core/reducer.js';

export const STATE_COLOR: Record<AgentState, number> = {
  absent: PALETTE.absent, idle: PALETTE.idle, think: PALETTE.think,
  tool: PALETTE.tool, wait: PALETTE.wait, deny: PALETTE.deny,
  stop: PALETTE.wait, done: PALETTE.done, human: PALETTE.ink,
};

export const STATE_LABEL: Record<AgentState, string> = {
  absent: 'pas né', idle: 'disponible', think: 'raisonne', tool: 'outil',
  wait: 'attend', deny: 'bloqué par un hook', stop: 'rend la main',
  done: 'terminé', human: 'humain',
};

function halo(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}
const HALO = /* @__PURE__ */ (() => (typeof document === 'undefined' ? null : halo()))();

function label(text: string, sub: string): Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const x = c.getContext('2d')!;
  x.font = '600 52px Archivo, system-ui, sans-serif';
  x.fillStyle = '#f3eada';
  x.textAlign = 'center';
  x.fillText(text, 256, 54);
  x.font = '400 34px "IBM Plex Mono", monospace';
  x.fillStyle = '#a3927a';
  x.fillText(sub, 256, 100);
  const s = new Sprite(new SpriteMaterial({ map: new CanvasTexture(c), transparent: true, depthTest: false }));
  s.scale.set(4.1, 1.02, 1);
  s.renderOrder = 10;
  return s;
}

export class Actor {
  readonly group = new Group();
  readonly body: Mesh<CylinderGeometry | IcosahedronGeometry, MeshStandardMaterial>;
  private readonly ringFg: Mesh<TorusGeometry, MeshBasicMaterial>;
  private readonly haloSprite: Sprite;
  private readonly beam: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly shock: Mesh<RingGeometry, MeshBasicMaterial>;
  private readonly nameplate: Sprite;
  private readonly tmp = new Color();
  private arc = 0;

  constructor(readonly decl: AgentDecl, readonly maxCalls: number) {
    const human = decl.depth < 0;

    this.body = new Mesh(
      human ? new IcosahedronGeometry(0.95, 1) : new CylinderGeometry(1.15, 1.3, 1, 6),
      new MeshStandardMaterial({ color: 0x3a3025, roughness: 0.5, metalness: 0.25 })
    );
    this.body.position.y = 0.5;
    this.group.add(this.body);

    const ringBg = new Mesh(new TorusGeometry(1.62, 0.055, 8, 64), new MeshBasicMaterial({ color: 0x3a3025 }));
    ringBg.rotation.x = -Math.PI / 2;
    ringBg.position.y = 0.06;
    this.group.add(ringBg);

    this.ringFg = new Mesh(new TorusGeometry(1.62, 0.09, 8, 64, 0.001), new MeshBasicMaterial({ color: PALETTE.accent }));
    this.ringFg.rotation.x = -Math.PI / 2;
    this.ringFg.rotation.z = Math.PI / 2;
    this.ringFg.position.y = 0.07;
    this.group.add(this.ringFg);

    this.haloSprite = new Sprite(new SpriteMaterial({
      map: HALO, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    this.haloSprite.scale.set(6, 6, 1);
    this.group.add(this.haloSprite);

    this.beam = new Mesh(
      new CylinderGeometry(0.07, 0.19, 9, 12, 1, true),
      new MeshBasicMaterial({ color: PALETTE.alert, transparent: true, opacity: 0, side: DoubleSide, blending: AdditiveBlending, depthWrite: false })
    );
    this.group.add(this.beam);

    this.shock = new Mesh(
      new RingGeometry(1.7, 2.0, 48),
      new MeshBasicMaterial({ color: PALETTE.deny, transparent: true, opacity: 0, side: DoubleSide })
    );
    this.shock.rotation.x = -Math.PI / 2;
    this.shock.position.y = 0.1;
    this.group.add(this.shock);

    this.nameplate = label(decl.id, decl.role === decl.id ? '' : decl.role);
    this.group.add(this.nameplate);
  }

  /** `denyAge` : ms écoulées depuis le dernier refus, ou null. */
  update(a: AgentView, now: number, denyAge: number | null): void {
    const col = STATE_COLOR[a.st];
    const lit = a.st === 'think' || a.st === 'tool' || a.st === 'deny' || a.st === 'human';

    this.tmp.setHex(col);
    this.body.material.color.lerp(this.tmp, 0.18);
    this.body.material.emissive.lerp(this.tmp.clone().multiplyScalar(lit ? 0.55 : 0.06), 0.18);

    const h = 0.55 + a.calls * 0.42;
    this.body.scale.y += (h - this.body.scale.y) * 0.14;
    this.body.position.y = this.body.scale.y * 0.5;

    const pulse = a.st === 'think' ? 1 + Math.sin(now / 150) * 0.05 : 1;
    this.body.scale.x += (pulse - this.body.scale.x) * 0.2;
    this.body.scale.z = this.body.scale.x;

    this.nameplate.position.y = this.body.scale.y + 1.5;

    const wantHalo = a.st === 'absent' ? 0 : lit ? 0.5 : 0.14;
    this.haloSprite.material.opacity += (wantHalo - this.haloSprite.material.opacity) * 0.15;
    this.haloSprite.material.color.setHex(col);
    this.haloSprite.position.y = this.body.scale.y * 0.6;

    const q = Math.min(1, a.calls / this.maxCalls);
    const want = Math.max(0.001, q * Math.PI * 2);
    if (Math.abs(this.arc - want) > 0.02) {
      this.arc = want;
      this.ringFg.geometry.dispose();
      this.ringFg.geometry = new TorusGeometry(1.62, 0.09, 8, 64, want);
    }
    this.ringFg.material.color.setHex(q > 0.8 ? PALETTE.deny : PALETTE.accent);

    const wantBeam = a.hand ? 0.26 + Math.sin(now / 230) * 0.12 : 0;
    this.beam.material.opacity += (wantBeam - this.beam.material.opacity) * 0.12;
    this.beam.position.y = this.body.scale.y + 4.5;

    if (denyAge !== null && denyAge >= 0 && denyAge < 1400) {
      const k = denyAge / 1400;
      this.shock.material.opacity = (1 - k) * 0.85;
      this.shock.scale.setScalar(1 + k * 2.4);
    } else {
      this.shock.material.opacity = 0;
    }
  }

  place(from: Vector3, to: Vector3, morph: number): void {
    this.group.position.lerpVectors(from, to, morph);
  }
}
