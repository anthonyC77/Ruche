/**
 * Les verdicts colorent le bon run — et un verdict orphelin n'est pas une erreur.
 * Format : harnais/eval/schemas/verdicts.schema.json, une ligne par cas.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJsonl } from '../src/core/sources.js';
import { parseVerdicts, taskOf, verdictFor } from '../src/core/verdicts.js';

const run = parseJsonl(readFileSync('public/demo-run.jsonl', 'utf8'));
const verdicts = parseVerdicts([
  '{"task_id": "T-07", "pass": false, "reason": "le schéma a été écrit à la main avant d\'être régénéré"}',
  '{"task_id": "T-99", "pass": true, "reason": "orphelin : aucun run ne porte ce cas"}',
].join('\n'));

describe('verdicts', () => {
  it('le run prend le verdict dont le task_id est le task de son run.start', () => {
    expect(taskOf(run)).toBe('T-07');
    const v = verdictFor(verdicts, taskOf(run));
    expect(v?.pass).toBe(false);
    expect(v?.reason).toContain('écrit à la main');
  });

  it('un verdict orphelin ne dérange personne, un run sans verdict reste neutre', () => {
    expect(verdicts).toHaveLength(2);
    expect(verdictFor(verdicts, 'T-01')).toBeNull();
  });

  it('un verdict sans raison, ou sans pass booléen, est refusé', () => {
    expect(() => parseVerdicts('{"task_id": "T-01", "pass": true, "reason": ""}')).toThrow(/raison/);
    expect(() => parseVerdicts('{"task_id": "T-01", "pass": "oui", "reason": "x"}')).toThrow(/booléen/);
    expect(() => parseVerdicts('{"pass": true, "reason": "x"}')).toThrow(/task_id/);
  });

  it('une ligne de verdict illisible dit son numéro', () => {
    expect(() => parseVerdicts('{oops')).toThrow(/illisible/);
  });
});
