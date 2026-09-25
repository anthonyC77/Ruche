/**
 * L'index des appels sur le run de démo : appariement tool.start/tool.end,
 * bouclier des hook.deny qui portent un outil, et compétences par agent —
 * y compris leur indépendance à l'ordre d'appel (ce qui rend la marche
 * arrière juste).
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJsonl } from '../src/core/sources.js';
import { DEFAULT_RULES, detect, merge } from '../src/core/detectors.js';
import { IndexAppels, issue } from '../src/core/appels.js';

const run = parseJsonl(readFileSync('public/demo-run.jsonl', 'utf8'));
const dernierSeq = run.events[run.events.length - 1]!.seq;

describe('IndexAppels sur les événements bruts', () => {
  const idx = new IndexAppels(run.events);

  it('trouve les 14 appels du run', () => {
    expect(idx.appels).toHaveLength(14);
  });

  it("l'appel Write 29 est bloqué par le bouclier avant exécution", () => {
    const a = idx.parDebut(29);
    expect(a?.outil).toBe('Write');
    expect(a?.bloquePar).toBe('guard-eval-files.sh');
    expect(a?.seqFin).toBe(30);
    expect(a && issue(a)).toBe('bouclier');
  });

  it("l'appel Bash 24 a échoué (dotnet test rouge)", () => {
    const a = idx.parDebut(24);
    expect(a?.ok).toBe(false);
    expect(a?.ms).toBe(6100);
    expect(a && issue(a)).toBe('echec');
  });

  it('le premier Read a réussi en 120 ms', () => {
    const a = idx.parDebut(4);
    expect(a && issue(a)).toBe('reussite');
    expect(a?.ms).toBe(120);
  });

  it('parFin retrouve l’appel par le seq qui le clôt', () => {
    expect(idx.parFin(30)?.cle).toBe(29);
  });

  it('un refus sans outil (SubagentStop) ne clôt ni n’ouvre d’appel', () => {
    expect(idx.parFin(42)).toBeNull();
    expect(idx.appels).toHaveLength(14);
  });

  it('ouvertsA(20) contient l’appel Bash ouvert à ce seq', () => {
    const ouverts = idx.ouvertsA(20);
    expect(ouverts.some(a => a.cle === 20)).toBe(true);
  });

  it('competences du codeur au dernier seq', () => {
    const c = idx.competences('codeur', dernierSeq, ['Read', 'Edit', 'Write', 'Bash']);
    expect(c).toEqual([
      { outil: 'Read', appels: 0, echecs: 0, refus: 0, dernier: '' },
      { outil: 'Edit', appels: 2, echecs: 0, refus: 1, dernier: expect.any(String) },
      { outil: 'Write', appels: 1, echecs: 0, refus: 1, dernier: expect.any(String) },
      { outil: 'Bash', appels: 5, echecs: 1, refus: 1, dernier: expect.any(String) },
    ]);
  });

  it('avant le refus du Write (seq 28), le codeur n’a encore tenté aucun Write', () => {
    const c = idx.competences('codeur', 28, ['Read', 'Edit', 'Write', 'Bash']);
    expect(c.find(x => x.outil === 'Write')?.appels).toBe(0);
  });
});

describe('IndexAppels sur les événements fusionnés (avec drapeaux)', () => {
  const flags = detect(run.events, DEFAULT_RULES(run.policy.quotas.max_calls_par_agent ?? run.policy.quotas.max_calls));
  const events = merge(run.events, flags);
  const idx = new IndexAppels(events);

  it('compte toujours 14 appels dont exactement 3 boucliers', () => {
    expect(idx.appels).toHaveLength(14);
    const boucliers = idx.appels.filter(a => issue(a) === 'bouclier');
    expect(boucliers).toHaveLength(3);
  });

  it('competences ne dépend pas de l’ordre des appels (un seq après un plus grand redonne le même résultat)', () => {
    const outils = idx.outilsVus();
    // sur ce même index : d'abord un seq plus grand, puis le plus petit —
    // aucun état interne mutable ne doit faire dériver le résultat.
    idx.competences('codeur', 60, outils);
    const apresGrand = idx.competences('codeur', 30, outils);

    // calcul direct pour 30, sur un index frais, sans être passé par 60 avant.
    const idxFrais = new IndexAppels(events);
    const direct = idxFrais.competences('codeur', 30, outils);

    expect(apresGrand).toEqual(direct);
  });
});
