/**
 * LES DEUX DISPOSITIONS
 *
 * Un seul graphe de scène, deux placements, une interpolation entre les deux.
 * C'est ce qui donne l'impression d'une scène Unity : les objets ne
 * disparaissent pas, ils se déplacent.
 *
 *  - RUCHE   : le présent. Qui travaille, qui attend, qui bloque. Pour le direct.
 *  - RIVIÈRE : le passé. Le temps devient un axe qu'on survole. Pour le rejeu
 *              et l'eval — un flamegraph en 3D, la profondeur porte le
 *              niveau de sous-agent.
 */

import { Vector3 } from 'three';
import type { AgentDecl } from '../core/events.js';

export type ViewName = 'ruche' | 'riviere';

export interface Layout {
  hive: Record<string, Vector3>;
  river: Record<string, Vector3>;
  /** Bornes de l'axe temps dans la vue rivière. */
  x0: number;
  x1: number;
  xOfT: (t: number) => number;
  laneOrder: string[];
}

export function buildLayout(agents: readonly AgentDecl[], duration: number): Layout {
  const hive: Record<string, Vector3> = {};
  const river: Record<string, Vector3> = {};

  const root = agents.find(a => a.depth === 0);
  const subs = agents.filter(a => a.depth === 1);
  const humans = agents.filter(a => a.depth < 0);

  if (root) hive[root.id] = new Vector3(0, 0, 0);
  subs.forEach((a, i) => {
    const ang = (i / Math.max(1, subs.length)) * Math.PI * 2 - Math.PI / 2;
    hive[a.id] = new Vector3(Math.cos(ang) * 7.2, 0, Math.sin(ang) * 7.2);
  });
  humans.forEach((a, i) => { hive[a.id] = new Vector3(i * 3, 0, 13.5); });

  const x0 = -13, x1 = 15;
  const laneOrder = [...agents].sort((a, b) => a.depth - b.depth).map(a => a.id);
  laneOrder.forEach((id, i) => {
    river[id] = new Vector3(x0 - 2.4, 0, (i - (laneOrder.length - 1) / 2) * 3.2);
  });

  const xOfT = (t: number) => x0 + (duration > 0 ? t / duration : 0) * (x1 - x0);

  return { hive, river, x0, x1, xOfT, laneOrder };
}

/** Interpolation douce, indépendante du framerate. */
export function approach(current: number, target: number, dt: number, speed = 4.5): number {
  return current + (target - current) * Math.min(1, dt * speed);
}
