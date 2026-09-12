/**
 * LE TEST QUI FRANCHIT LE PALIER 1
 *
 * « Franchi quand : on rejoue un run enregistré et on tombe exactement sur le
 *   même état à chaque seq. »
 *
 * C'est l'oracle mécanique du rejeu. S'il casse, la marche arrière ment, et
 * tout ce qu'on voit dans la 3D est faux — sans qu'on s'en aperçoive.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJsonl } from '../src/core/sources.js';
import { DEFAULT_RULES, detect, merge } from '../src/core/detectors.js';
import { Timeline } from '../src/core/timeline.js';
import { blankState, reduce } from '../src/core/reducer.js';
import type { RunEvent } from '../src/core/events.js';

const run = parseJsonl(readFileSync('public/demo-run.jsonl', 'utf8'));
const flags = detect(run.events, DEFAULT_RULES(run.policy.quotas.max_calls_par_agent ?? run.policy.quotas.max_calls));
const events: RunEvent[] = merge(run.events, flags);

describe('rejeu', () => {
  it('les images-clés donnent le même état que le rejeu depuis zéro', () => {
    const tl = new Timeline(events, run.agents, { keyframeEvery: 8 });

    for (let seq = 0; seq <= tl.last; seq++) {
      // référence : on rejoue tout depuis l'état vide
      const ref = blankState(run.agents);
      for (let i = 0; i <= seq; i++) reduce(ref, events[i]!);

      // candidat : on passe par l'image-clé la plus proche
      const got = tl.stateAt(seq);

      expect(got, `divergence au seq ${seq}`).toEqual(ref);
    }
  });

  it('un saut coûte au plus keyframeEvery événements, quelle que soit la position', () => {
    const tl = new Timeline(events, run.agents, { keyframeEvery: 8 });
    for (const seq of [0, 12, 40, tl.last]) {
      tl.stateAt(seq);
      expect(tl.lastSeekCost).toBeLessThanOrEqual(8);
    }
  });

  it('la marche arrière repasse par les mêmes états que la marche avant', () => {
    const tl = new Timeline(events, run.agents, { keyframeEvery: 8 });
    const forward = [];
    for (let s = 0; s <= tl.last; s++) forward.push(tl.stateAt(s));
    for (let s = tl.last; s >= 0; s--) {
      expect(tl.stateAt(s)).toEqual(forward[s]);
    }
  });
});

describe('détecteurs', () => {
  it('R1 repère les trois tentatives d’écriture sur eval/schemas/**', () => {
    const r1 = flags.filter(f => f.kind === 'flag' && f.rule.startsWith('R1'));
    expect(r1.length).toBeGreaterThanOrEqual(1);
    expect(r1[0]!.kind === 'flag' && r1[0]!.actor).toBe('codeur');
  });

  it('au moins un drapeau lève la main', () => {
    expect(flags.some(f => f.kind === 'flag' && f.hand)).toBe(true);
  });

  it('les preuves pointent vers des seq qui existent après fusion', () => {
    for (const e of events) {
      if (e.kind !== 'flag') continue;
      for (const s of e.evidence) {
        expect(events[s], `preuve ${s} hors bornes`).toBeDefined();
      }
    }
  });

  it('la main finit par se baisser (le run se termine sans alerte)', () => {
    const tl = new Timeline(events, run.agents);
    const end = tl.stateAt(tl.last);
    expect(Object.values(end.agents).some(a => a.hand)).toBe(false);
  });
});
