/**
 * FORME = IDENTITÉ
 *
 * Vérifie le mapping outil → autel de la maquette (Read/Edit/Write/Bash aux
 * quatre diagonales), le repli sur des outils non canoniques (les vrais
 * runs du harnais), le regroupement au-delà de MAX_AUTELS, et que chaque
 * forme a un glyphe SVG neutre en couleur.
 */

import { describe, expect, it } from 'vitest';
import {
  AUTRES, FORMES_DE_REPLI, GLYPHE, MAX_AUTELS,
  autelDe, outilsDuRun, planAutels,
} from '../src/view3d/formes.js';
import type { Forme, PlanAutel } from '../src/view3d/formes.js';

const TOUTES_LES_FORMES: readonly Forme[] = [
  'livres', 'enclume', 'stele', 'obelisque',
  ...FORMES_DE_REPLI,
  'tore',
];

function formesDistinctes(plan: readonly PlanAutel[]): void {
  const formes = plan.map((a) => a.forme);
  expect(new Set(formes).size).toBe(formes.length);
}

describe('outilsDuRun', () => {
  it('met les outils canoniques en tête, dans l\'ordre Read, Edit, Write, Bash', () => {
    expect(outilsDuRun(['Read', 'Edit', 'Write', 'Bash'], [])).toEqual(['Read', 'Edit', 'Write', 'Bash']);
  });

  it('mélange autorisés et vus sans doublon, canoniques d\'abord', () => {
    expect(outilsDuRun(['Bash', 'zeta', 'Read'], ['alpha', 'Read'])).toEqual(['Read', 'Bash', 'zeta', 'alpha']);
  });
});

describe('planAutels — run de démo', () => {
  const outils = outilsDuRun(['Read', 'Edit', 'Write', 'Bash'], []);
  const plan = planAutels(outils, ['Read', 'Edit', 'Write', 'Bash']);

  it('donne quatre autels dans l\'ordre livres, enclume, stele, obelisque', () => {
    expect(plan.map((a) => a.forme)).toEqual(['livres', 'enclume', 'stele', 'obelisque']);
  });

  it('place les quatre autels sur les diagonales de la maquette', () => {
    const attendus = [-3 * Math.PI / 4, -Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4];
    plan.forEach((a, i) => expect(a.angle).toBeCloseTo(attendus[i]!, 9));
  });

  it('tous les outils sont autorisés', () => {
    expect(plan.every((a) => a.autorise)).toBe(true);
  });
});

describe('planAutels — outils non canoniques (run réel du harnais)', () => {
  const outils = ['rechercher_documents', 'lire_document', 'creer_demande_badge'];
  const plan = planAutels(outils, outils);

  it('reçoivent les trois premières formes de repli', () => {
    expect(plan.map((a) => a.forme)).toEqual(['pyramide', 'arche', 'colonne']);
  });

  it('les formes restent deux à deux distinctes', () => {
    formesDistinctes(plan);
  });
});

describe('planAutels — au-delà de MAX_AUTELS', () => {
  const outils = Array.from({ length: 10 }, (_, i) => `outil_${i}`);
  const autorises = outils.slice(0, 6); // les 4 derniers ne sont pas autorisés, seulement vus
  const plan = planAutels(outils, autorises);

  it('regroupe en 8 autels, le dernier étant AUTRES en forme de tore avec les 3 outils en trop', () => {
    expect(plan).toHaveLength(8);
    const dernier = plan[plan.length - 1]!;
    expect(dernier.cle).toBe(AUTRES);
    expect(dernier.forme).toBe('tore');
    expect(dernier.outils).toHaveLength(3);
    expect(dernier.outils).toEqual(['outil_7', 'outil_8', 'outil_9']);
  });

  it('les formes du plan sont deux à deux distinctes', () => {
    formesDistinctes(plan);
  });

  it('autelDe retrouve le dixième outil dans l\'autel AUTRES', () => {
    const a = autelDe('outil_9', plan);
    expect(a).not.toBeNull();
    expect(a!.cle).toBe(AUTRES);
  });

  it('un outil vu mais non autorisé donne un autel autorise === false', () => {
    const a = autelDe('outil_6', plan);
    expect(a).not.toBeNull();
    expect(a!.autorise).toBe(false);
  });

  it('un outil autorisé et vu donne un autel autorise === true', () => {
    const a = autelDe('outil_0', plan);
    expect(a).not.toBeNull();
    expect(a!.autorise).toBe(true);
  });
});

describe('autelDe', () => {
  it('renvoie null quand l\'outil n\'est représenté par aucun autel', () => {
    const plan = planAutels(['Read'], ['Read']);
    expect(autelDe('Write', plan)).toBeNull();
  });
});

describe('GLYPHE', () => {
  it('chaque forme a un glyphe SVG 16×16 neutre en couleur', () => {
    for (const forme of TOUTES_LES_FORMES) {
      const svg = GLYPHE[forme];
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('currentColor');
      expect(svg).toContain('viewBox="0 0 16 16"');
    }
  });

  it('couvre exactement les douze formes', () => {
    expect(Object.keys(GLYPHE).sort()).toEqual([...TOUTES_LES_FORMES].sort());
  });
});

describe('MAX_AUTELS', () => {
  it('vaut 8', () => {
    expect(MAX_AUTELS).toBe(8);
  });
});
