/**
 * LES VERDICTS
 *
 * Une ligne par cas, au format harnais/eval/schemas/verdicts.schema.json :
 *   {"task_id": "T-03", "pass": false, "reason": "…"}
 *
 * Ruche ne juge pas : elle colore. Le run dont le `task` de `run.start` est
 * un `task_id` prend la couleur du verdict, et montre `reason` au survol.
 * Un verdict sans run, ou un run sans verdict, reste neutre.
 */

import type { RunEvent, RunFile } from './events.js';

export interface Verdict {
  task_id: string;
  pass: boolean;
  reason: string;
}

export function parseVerdicts(text: string): Verdict[] {
  const out: Verdict[] = [];
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  lines.forEach((l, i) => {
    let v: Partial<Verdict>;
    try {
      v = JSON.parse(l) as Partial<Verdict>;
    } catch {
      throw new Error(`verdict ${i + 1} : JSON illisible`);
    }
    if (typeof v.task_id !== 'string' || v.task_id.length === 0) throw new Error(`verdict ${i + 1} : task_id manquant`);
    if (typeof v.pass !== 'boolean') throw new Error(`verdict ${i + 1} : pass doit être un booléen`);
    if (typeof v.reason !== 'string' || v.reason.trim().length === 0) {
      throw new Error(`verdict ${i + 1} : sans raison — un verdict sans explication ne se conteste pas`);
    }
    out.push({ task_id: v.task_id, pass: v.pass, reason: v.reason });
  });
  return out;
}

/** Le cas d'un run : le `task` de son run.start, sinon le task_id de l'en-tête. */
export function taskOf(run: RunFile): string {
  const start = run.events.find((e): e is Extract<RunEvent, { kind: 'run.start' }> => e.kind === 'run.start');
  return start?.task ?? run.task_id;
}

export function verdictFor(verdicts: readonly Verdict[], taskId: string): Verdict | null {
  return verdicts.find(v => v.task_id === taskId) ?? null;
}

export async function loadVerdicts(url: string): Promise<Verdict[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return parseVerdicts(await res.text());
}
