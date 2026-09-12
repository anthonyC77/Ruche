/**
 * LE CONTRAT D'ÉVÉNEMENT
 *
 * C'est la seule pièce du projet qui ne doit pas bouger à la légère.
 * Un lecteur (3D, tableau, terminal) est remplaçable ; un corpus de runs
 * enregistrés dans un format qu'on ne sait plus lire est perdu.
 *
 * Trois règles portées par les types ci-dessous :
 *  1. `seq` est l'ordre LOGIQUE (compteur unique). `t` est l'horloge vécue.
 *     Avec des sous-agents en parallèle, `t` ne donne aucun ordre fiable.
 *  2. `ref` porte le gros (prompt, sortie, diff) par empreinte ; le journal
 *     reste petit et deux runs qui envoient le même contexte partagent le blob.
 *  3. `origin` sépare ce qui est OBSERVÉ (jamais recalculé) de ce qui est
 *     DÉRIVÉ (recalculable : les drapeaux des détecteurs) et de ce qui est
 *     HUMAIN. Mélanger les trois interdit de rejouer un vieux run avec un
 *     détecteur neuf — qui est l'usage le plus utile.
 */

export const CONTRACT_VERSION = 1 as const;

export type AgentId = string;

export type Origin = 'observed' | 'derived' | 'human';

export interface Cost {
  calls: number;
  tok_in: number;
  tok_out: number;
  eur: number;
}

/** Enveloppe commune à tout événement. */
export interface Envelope {
  v: number;
  seq: number;
  t: number;
  run: string;
  actor: AgentId;
  origin: Origin;
  /** Empreinte du contenu volumineux, stocké hors journal. */
  ref?: string;
  cost?: Partial<Cost>;
}

/* ── Les charges utiles, une par nature d'événement ─────────────────── */

export type RunEvent =
  | (Envelope & { kind: 'run.start'; task: string; title: string; policy: RunPolicy })
  | (Envelope & { kind: 'run.end'; status: RunStatus; totals: Cost & { wall_clock_ms: number; human_interventions: number } })
  | (Envelope & { kind: 'agent.spawn'; role: string; parent: AgentId | null; depth: number })
  | (Envelope & { kind: 'agent.end'; status: RunStatus })
  | (Envelope & { kind: 'agent.stop.attempt' })
  | (Envelope & { kind: 'think.start'; summary: string })
  | (Envelope & { kind: 'think.end'; summary: string })
  | (Envelope & { kind: 'tool.start'; tool: string; args: string })
  | (Envelope & { kind: 'tool.end'; tool: string; args: string; ok: boolean; ms: number; out?: string })
  | (Envelope & { kind: 'hook.allow'; hook: string; event: string; exit: number; reason: string })
  | (Envelope & { kind: 'hook.deny'; hook: string; event: string; exit: number; reason: string; tool?: string })
  | (Envelope & { kind: 'wait.start'; on: string })
  | (Envelope & { kind: 'wait.end'; on: string })
  | (Envelope & { kind: 'msg'; to: AgentId; text: string })
  | (Envelope & { kind: 'human'; to: AgentId; text: string })
  | (Envelope & { kind: 'flag'; rule: string; severity: Severity; why: string; evidence: number[]; hand: boolean })
  | (Envelope & { kind: 'flag.clear'; reason: string });

export type EventKind = RunEvent['kind'];
export type Severity = 'low' | 'medium' | 'high';
export type RunStatus = 'completed' | 'refused' | 'clarification' | 'failed' | 'cancelled' | 'quota_exceeded';

/** Les quotas du contrat de run (harnais/eval/schemas/run_contract.schema.json) ;
 *  `max_calls_par_agent` est le seul champ en plus, lu par les détecteurs (R5). */
export interface Quotas {
  max_calls: number;
  max_calls_par_agent?: number;
  max_tokens: number;
  max_wall_clock_ms: number;
  max_eur: number;
}

export interface Identity {
  principal: string;
  si_role?: string;
}

/** La même forme que `policy` du contrat de run : c'est ce qui permet à
 *  plier_evenements.py de la recopier sans l'inventer. */
export interface RunPolicy {
  agent: string;
  allowed_tools: string[];
  quotas: Quotas;
  identity: Identity;
}

export interface AgentDecl {
  id: AgentId;
  role: string;
  depth: number;
}

/** Ce qu'un fichier de run contient : un en-tête, puis des événements. */
export interface RunFile {
  run_id: string;
  task_id: string;
  contract_version: number;
  agents: AgentDecl[];
  policy: RunPolicy;
  events: RunEvent[];
}

/* ── Garde-fou minimal ───────────────────────────────────────────────
   Pas de bibliothèque de validation : trois invariants suffisent à
   attraper 99 % des journaux cassés, et ils doivent tourner vite. */

export function assertWellFormed(events: readonly RunEvent[]): void {
  let prev = -1;
  for (const e of events) {
    if (e.v !== CONTRACT_VERSION) throw new Error(`seq ${e.seq} : version ${e.v} inconnue`);
    if (e.seq !== prev + 1) throw new Error(`trou dans la séquence : ${prev} → ${e.seq}`);
    if (e.t < 0) throw new Error(`seq ${e.seq} : horloge négative`);
    prev = e.seq;
  }
}

/** Somme de deux coûts, avec les champs manquants à zéro. */
export function addCost(a: Cost, b?: Partial<Cost>): Cost {
  if (!b) return a;
  return {
    calls: a.calls + (b.calls ?? 0),
    tok_in: a.tok_in + (b.tok_in ?? 0),
    tok_out: a.tok_out + (b.tok_out ?? 0),
    eur: a.eur + (b.eur ?? 0),
  };
}

export const ZERO_COST: Cost = { calls: 0, tok_in: 0, tok_out: 0, eur: 0 };
