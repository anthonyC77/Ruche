/**
 * LA TÊTE DE LECTURE
 *
 * Le principe du DVD : un DVD ne lit pas la vidéo à l'envers, il saute à
 * l'image-clé précédente et rejoue vite en avant. Ici pareil.
 *
 *   - on sérialise l'état complet tous les `keyframeEvery` événements ;
 *   - aller à `seq` = copier l'image-clé précédente + rejouer en avant ;
 *   - « ralenti », « ×4 », « −1× » et « pas à pas » sont LE MÊME mécanisme,
 *     seule la vitesse du curseur change. Il n'y a pas de mode spécial.
 *
 * Coût : O(keyframeEvery) par saut, quelle que soit la taille du run.
 * Mémoire : une copie d'état tous les N événements — c'est le bon compromis
 * jusqu'à ~10⁵ événements ; au-delà, ne garder que les images-clés « rondes »
 * (tous les 1000) et recalculer les intermédiaires à la demande.
 */

import { blankState, reduce } from './reducer.js';
import type { State } from './reducer.js';
import type { AgentDecl, RunEvent } from './events.js';

export interface TimelineOptions {
  /** Une image-clé tous les N événements. 8 pour du confort, 250 pour du volume. */
  keyframeEvery?: number;
}

export class Timeline {
  readonly events: readonly RunEvent[];
  readonly last: number;
  readonly duration: number;
  /** Nombre d'événements rejoués lors du dernier `stateAt` — à afficher : c'est la preuve que le scrub reste constant. */
  lastSeekCost = 0;

  private readonly keyframes: { seq: number; state: State }[] = [];
  private readonly every: number;

  constructor(events: readonly RunEvent[], agents: readonly AgentDecl[], opts: TimelineOptions = {}) {
    this.events = events;
    this.last = events.length - 1;
    this.duration = events.length ? events[events.length - 1]!.t : 0;
    this.every = opts.keyframeEvery ?? 8;

    let s = blankState(agents);
    this.keyframes.push({ seq: -1, state: structuredClone(s) });
    for (const e of events) {
      s = reduce(s, e);
      if (e.seq % this.every === this.every - 1) {
        this.keyframes.push({ seq: e.seq, state: structuredClone(s) });
      }
    }
  }

  /** État exact au seq donné. Déterministe : même seq ⇒ même état, toujours. */
  stateAt(seq: number): State {
    const target = Math.max(-1, Math.min(this.last, Math.floor(seq)));
    let kf = this.keyframes[0]!;
    for (const k of this.keyframes) {
      if (k.seq <= target) kf = k; else break;
    }
    const s = structuredClone(kf.state);
    this.lastSeekCost = 0;
    for (let i = kf.seq + 1; i <= target; i++) {
      reduce(s, this.events[i]!);
      this.lastSeekCost++;
    }
    return s;
  }

  /** Horloge vécue au seq donné. */
  timeAt(seq: number): number {
    const i = Math.max(0, Math.min(this.last, Math.floor(seq)));
    return this.events[i]?.t ?? 0;
  }

  /** Prochain événement d'un des types donnés, pour les boutons « incident ». */
  next(seq: number, kinds: readonly RunEvent['kind'][]): number | null {
    for (let i = Math.floor(seq) + 1; i <= this.last; i++) {
      if (kinds.includes(this.events[i]!.kind)) return i;
    }
    return null;
  }

  prev(seq: number, kinds: readonly RunEvent['kind'][]): number | null {
    for (let i = Math.floor(seq) - 1; i >= 0; i--) {
      if (kinds.includes(this.events[i]!.kind)) return i;
    }
    return null;
  }
}

/**
 * Le curseur : une position fractionnaire + une vitesse signée.
 * Négatif = marche arrière. C'est tout ce que « rejouer à l'envers » demande.
 */
export class Playhead {
  cursor: number;
  rate = 1;
  playing = false;
  /** Événements par seconde à la vitesse 1×. */
  eventsPerSecond = 7.5;

  constructor(private readonly tl: Timeline, start = 0) {
    this.cursor = start;
  }

  /** Avance d'un pas de temps réel. Renvoie true si le seq entier a changé. */
  advance(dtSeconds: number): boolean {
    if (!this.playing) return false;
    const before = Math.floor(this.cursor);
    const next = this.cursor + this.rate * dtSeconds * this.eventsPerSecond;

    if (next >= this.tl.last) { this.cursor = this.tl.last; this.playing = false; }
    else if (next <= 0) { this.cursor = 0; this.playing = false; }
    else this.cursor = next;

    return Math.floor(this.cursor) !== before;
  }

  seek(seq: number): void {
    this.cursor = Math.max(0, Math.min(this.tl.last, seq));
  }
}
