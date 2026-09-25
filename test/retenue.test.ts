/**
 * La retenue : un appel rapide reste affiché au moins TENUE_MIN_MS, un appel
 * lent ne quitte pas l'écran avant son impact, un appel bloqué n'a ni
 * arrivée ni impact — et chaque transition n'est émise qu'une fois.
 */

import { describe, expect, it } from 'vitest';
import { Retenue, VOL_MS, TENUE_MIN_MS, evenementsFranchis } from '../src/core/retenue.js';

describe('Retenue — appel rapide (120 ms de run)', () => {
  it('reste affiché jusqu’à la tenue minimale, puis disparaît', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    r.fermer(1, 120);

    expect(r.affiche(1, 1000)).toBe(true);
    expect(r.affiche(1, 1399)).toBe(true);
    expect(r.affiche(1, 1400)).toBe(false);
  });

  it("émet 'impact' à l'instant du vol (1000), pas avant (999)", () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    r.fermer(1, 120);

    expect(r.avancer(999).some(t => t.cle === 1 && t.quoi === 'impact')).toBe(false);
    expect(r.avancer(1000).some(t => t.cle === 1 && t.quoi === 'impact')).toBe(true);
  });

  it('progression à mi-vol vaut 0,5', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    expect(r.progression(1, 500)).toBe(0.5);
  });
});

describe('Retenue — appel lent (5000 ms de run)', () => {
  it('reste affiché en plein vol et émet impact à sa fermeture', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    r.fermer(1, 5000);

    expect(r.affiche(1, 4000)).toBe(true);
    expect(r.avancer(5000).some(t => t.cle === 1 && t.quoi === 'impact')).toBe(true);
  });

  it('un appel jamais fermé n’émet jamais fin', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    let vuFin = false;
    for (let t = 100; t <= 10000; t += 100) {
      if (r.avancer(t).some(x => x.quoi === 'fin')) vuFin = true;
    }
    expect(vuFin).toBe(false);
    expect(r.affiche(1, 10000)).toBe(true);
  });
});

describe('Retenue — appel bloqué', () => {
  it("émet 'bouclier' à o+volMs et jamais impact ni arrivee", () => {
    const r = new Retenue();
    r.ouvrir(1, true, 0);
    r.fermer(1, 50);

    const t1 = r.avancer(VOL_MS);
    expect(t1).toContainEqual({ cle: 1, quoi: 'bouclier' });
    expect(t1.some(t => t.quoi === 'arrivee')).toBe(false);

    const t2 = r.avancer(VOL_MS + TENUE_MIN_MS + 1000);
    expect(t2.some(t => t.quoi === 'impact')).toBe(false);
    expect(t2.some(t => t.quoi === 'arrivee')).toBe(false);
  });
});

describe('Retenue — chaque transition n’est émise qu’une fois', () => {
  it('deux appels successifs à avancer ne redonnent pas la même transition', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    r.fermer(1, 120);

    const premier = r.avancer(5000);
    const second = r.avancer(5000);

    expect(premier.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it('vider() oublie tout : plus rien d’actif, progression redevient null', () => {
    const r = new Retenue();
    r.ouvrir(1, false, 0);
    r.fermer(1, 120);
    r.vider();

    expect(r.actifs(5000)).toEqual([]);
    expect(r.progression(1, 500)).toBeNull();
  });
});

describe('evenementsFranchis', () => {
  it('curseur immobile : rien à rejouer', () => {
    expect(evenementsFranchis(3, 3)).toEqual({ seqs: [], saut: false });
  });

  it('petit pas en avant : on rejoue les seq franchis', () => {
    expect(evenementsFranchis(3, 5)).toEqual({ seqs: [4, 5], saut: false });
  });

  it('marche arrière : saut, rien à rejouer', () => {
    expect(evenementsFranchis(5, 3).saut).toBe(true);
  });

  it('bond trop grand : saut', () => {
    expect(evenementsFranchis(0, 40).saut).toBe(true);
  });
});
