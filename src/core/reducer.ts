/**
 * LE MOTEUR DE REJEU
 *
 * Une seule fonction : reduce(état, événement) → état.
 * Pure, déterministe, EN AVANT SEULEMENT.
 *
 * La marche arrière ne s'écrit pas : elle se fabrique avec des images-clés
 * (voir timeline.ts). Écrire l'inverse de chaque événement double le code et
 * casse au premier effet de bord non inversible.
 */

import { addCost, ZERO_COST } from './events.js';
import type { AgentDecl, AgentId, Cost, RunEvent, RunStatus } from './events.js';

export type AgentState =
  | 'absent' | 'idle' | 'think' | 'tool' | 'wait' | 'deny' | 'stop' | 'done' | 'human';

export interface Span {
  agent: AgentId;
  kind: 'think' | 'tool' | 'toolfail' | 'deny' | 'wait' | 'stop';
  label: string;
  t0: number;
  t1: number;
  seq0: number;
  seq1: number;
  ok: boolean;
}

export interface AgentView {
  id: AgentId;
  role: string;
  depth: number;
  parent: AgentId | null;
  alive: boolean;
  st: AgentState;
  calls: number;
  tokens: number;
  eur: number;
  denies: number;
  hand: boolean;
  waitOn: string | null;
  note: string;
  /** Span ouvert, fermé au prochain `.end`. */
  open: Omit<Span, 't1' | 'seq1' | 'ok'> | null;
}

export interface State {
  seq: number;
  t: number;
  status: RunStatus | 'en cours';
  task: string;
  agents: Record<AgentId, AgentView>;
  edges: { from: AgentId; to: AgentId }[];
  spans: Span[];
  msgs: { from: AgentId; to: AgentId; t: number; seq: number; text: string; human: boolean }[];
  flags: Extract<RunEvent, { kind: 'flag' }>[];
  cum: Cost;
  humanInterventions: number;
  /** Fenêtre glissante, pour le panneau de journal. */
  log: RunEvent[];
}

const LOG_WINDOW = 120;

export function blankState(agents: readonly AgentDecl[]): State {
  const map: Record<AgentId, AgentView> = {};
  for (const a of agents) {
    map[a.id] = {
      id: a.id, role: a.role, depth: a.depth, parent: null,
      alive: false, st: 'absent', calls: 0, tokens: 0, eur: 0,
      denies: 0, hand: false, waitOn: null, note: '', open: null,
    };
  }
  return {
    seq: -1, t: 0, status: 'en cours', task: '',
    agents: map, edges: [], spans: [], msgs: [], flags: [],
    cum: { ...ZERO_COST }, humanInterventions: 0, log: [],
  };
}

function open(s: State, id: AgentId, kind: Span['kind'], label: string): void {
  const a = s.agents[id];
  if (a) a.open = { agent: id, kind, label, t0: s.t, seq0: s.seq };
}

function close(s: State, id: AgentId, kind?: Span['kind'], ok = true, label?: string): void {
  const a = s.agents[id];
  if (!a?.open) return;
  s.spans.push({
    ...a.open,
    kind: kind ?? a.open.kind,
    label: label ?? a.open.label,
    t1: s.t, seq1: s.seq, ok,
  });
  a.open = null;
}

/**
 * Applique un événement. MUTE `s` et le renvoie : c'est voulu, le rejeu
 * repart toujours d'une copie d'image-clé, jamais de l'état courant.
 */
export function reduce(s: State, e: RunEvent): State {
  s.seq = e.seq;
  s.t = e.t;
  s.cum = addCost(s.cum, e.cost);

  s.log.push(e);
  if (s.log.length > LOG_WINDOW) s.log.shift();

  const a = s.agents[e.actor];

  switch (e.kind) {
    case 'run.start':
      s.task = e.title;
      s.status = 'en cours';
      break;

    case 'run.end':
      s.status = e.status;
      break;

    case 'agent.spawn':
      if (!a) break;
      a.alive = true; a.st = 'idle'; a.parent = e.parent; a.depth = e.depth;
      if (e.parent) s.edges.push({ from: e.parent, to: e.actor });
      break;

    case 'agent.end':
      if (!a) break;
      close(s, e.actor);
      a.alive = false; a.st = 'done';
      break;

    case 'think.start':
      if (!a) break;
      a.st = 'think'; a.note = e.summary;
      open(s, e.actor, 'think', e.summary);
      break;

    case 'think.end':
      if (!a) break;
      close(s, e.actor, 'think', true);
      a.st = 'idle';
      a.calls += e.cost?.calls ?? 0;
      a.tokens += (e.cost?.tok_in ?? 0) + (e.cost?.tok_out ?? 0);
      a.eur += e.cost?.eur ?? 0;
      break;

    case 'tool.start':
      if (!a) break;
      a.st = 'tool'; a.note = `${e.tool} · ${e.args}`;
      open(s, e.actor, 'tool', `${e.tool} ${e.args}`);
      break;

    case 'tool.end':
      if (!a) break;
      close(s, e.actor, e.ok ? 'tool' : 'toolfail', e.ok);
      a.st = 'idle';
      break;

    case 'agent.stop.attempt':
      if (!a) break;
      a.st = 'stop'; a.note = 'demande à rendre la main';
      open(s, e.actor, 'stop', 'stop');
      break;

    case 'hook.deny':
      if (!a) break;
      close(s, e.actor, 'deny', false, e.hook);
      a.st = 'deny'; a.denies += 1; a.note = `${e.hook} → refus`;
      // un refus n'a pas de durée : on lui en donne une pour qu'il soit visible
      s.spans.push({
        agent: e.actor, kind: 'deny', label: e.hook,
        t0: s.t, t1: s.t + 900, seq0: e.seq, seq1: e.seq, ok: false,
      });
      break;

    case 'hook.allow':
      if (!a) break;
      close(s, e.actor, 'stop', true, e.hook);
      a.st = 'idle';
      break;

    case 'wait.start':
      if (!a) break;
      a.st = 'wait'; a.waitOn = e.on;
      open(s, e.actor, 'wait', `attend ${e.on}`);
      break;

    case 'wait.end':
      if (!a) break;
      close(s, e.actor, 'wait', true);
      a.st = 'idle'; a.waitOn = null;
      break;

    case 'msg':
      s.msgs.push({ from: e.actor, to: e.to, t: e.t, seq: e.seq, text: e.text, human: false });
      break;

    case 'human':
      s.humanInterventions += 1;
      s.msgs.push({ from: e.actor, to: e.to, t: e.t, seq: e.seq, text: e.text, human: true });
      if (a) { a.alive = true; a.st = 'human'; }
      break;

    case 'flag':
      s.flags.push(e);
      if (a && e.hand) a.hand = true;
      break;

    case 'flag.clear':
      if (a) a.hand = false;
      break;

    default: {
      // Compatibilité avant : un événement d'une version plus récente est
      // ignoré, jamais fatal. Le journal survit à son lecteur.
      const _never: never = e;
      void _never;
    }
  }

  return s;
}
