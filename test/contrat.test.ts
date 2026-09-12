/**
 * LE TEST DE CONCORDANCE
 *
 * Le schéma du harnais est la source du contrat d'événements ; events.ts en
 * est le miroir. Ce test échoue si la liste des `kind` diffère dans un sens
 * ou dans l'autre, ou si la démo ne passe pas le schéma.
 *
 * Le harnais est un dépôt frère : s'il n'est pas à côté, le test est SAUTÉ
 * avec un message, pas en échec — Ruche doit rester clonable seule.
 */

import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv/dist/2020.js';
import { parseJsonl } from '../src/core/sources.js';

/** Chemin relatif au dépôt frère. Une constante, pas une découverte. */
const SCHEMA = '../harnais/eval/schemas/run_events.schema.json';
const present = existsSync(SCHEMA);
if (!present) console.warn(`harnais absent (${SCHEMA}) : test de concordance sauté`);

/** Les genres déclarés par events.ts — lus dans la source, les types n'existent pas à l'exécution. */
function kindsDeEventsTs(): string[] {
  const src = readFileSync('src/core/events.ts', 'utf8');
  return [...src.matchAll(/\{ kind: '([a-z.]+)'/g)].map(m => m[1]!).sort();
}

describe.skipIf(!present)('concordance avec le harnais', () => {
  /**
   * Chargé dans beforeAll (et non au niveau du describe) : le corps d'un
   * describe.skipIf s'exécute quand même pendant la collecte des tests,
   * même sauté — seuls les hooks et les it() sont réellement ignorés.
   * Lire le schéma ici planterait donc la suite au lieu de la sauter.
   */
  let schema: { $defs: { kinds: Record<string, unknown> } };
  let ajv: Ajv2020;
  let validerEvenement: ValidateFunction;
  let validerEntete: ValidateFunction;

  beforeAll(() => {
    schema = JSON.parse(readFileSync(SCHEMA, 'utf8')) as {
      $defs: { kinds: Record<string, unknown> };
    };
    ajv = new Ajv2020({ strict: false, allErrors: true });
    ajv.addSchema(schema, 'ev');
    validerEvenement = ajv.getSchema('ev')!;
    validerEntete = ajv.getSchema('ev#/$defs/header')!;
  });

  it('events.ts et le schéma déclarent les mêmes genres', () => {
    expect(kindsDeEventsTs()).toEqual(Object.keys(schema.$defs.kinds).sort());
  });

  it('la démo passe le schéma, en-tête et événements', () => {
    const texte = readFileSync('public/demo-run.jsonl', 'utf8');
    const { events, ...entete } = parseJsonl(texte);
    expect(validerEntete(entete), ajv.errorsText(validerEntete.errors)).toBe(true);
    for (const e of events) {
      expect(validerEvenement(e), `seq ${e.seq} (${e.kind}) : ${ajv.errorsText(validerEvenement.errors)}`).toBe(true);
    }
  });

  it('la policy de la démo a la forme du contrat de run', () => {
    const run = parseJsonl(readFileSync('public/demo-run.jsonl', 'utf8'));
    expect(run.policy.identity.principal).toBeTruthy();
    expect(run.policy.allowed_tools.length).toBeGreaterThan(0);
    expect(run.policy.quotas.max_calls).toBeGreaterThanOrEqual(run.policy.quotas.max_calls_par_agent ?? 0);
  });
});
