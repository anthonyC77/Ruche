/**
 * LES DÉTECTEURS — « lève la main »
 *
 * Toutes les règles sont des FONCTIONS PURES DU FLUX. Aucune n'appelle de LLM.
 * Deux conséquences qui font toute la valeur :
 *
 *  1. Elles tournent à l'identique en direct et en rejeu. Un détecteur écrit
 *     en novembre se teste sur les runs d'octobre.
 *  2. Donc le détecteur est ÉVALUABLE : on annote un corpus de runs
 *     (« ici il bouclait », « ici non ») et on mesure précision/rappel.
 *     L'oracle avant l'agent, y compris pour l'agent qui surveille.
 *
 * Les drapeaux produits sont des événements `origin: 'derived'` : on les
 * fusionne dans le flux au chargement, et on peut les recalculer à volonté
 * sans toucher aux événements observés.
 *
 * Les seuils ci-dessous sont des points de départ, pas des vérités. Ils se
 * règlent contre le corpus — c'est le but de la note de rappel.
 */

import type { RunEvent, Severity } from './events.js';

export interface Rule {
  id: string;
  label: string;
  severity: Severity;
  /** true ⇒ l'agent lève la main (alerte visible), false ⇒ simple marqueur. */
  hand: boolean;
  run: (ctx: Ctx) => Finding | null;
}

export interface Finding {
  why: string;
  evidence: number[];
}

/** Ce que voit une règle : tout ce qui précède, jamais ce qui suit. */
export interface Ctx {
  event: RunEvent;
  history: readonly RunEvent[];
  /** Index dans `history` de l'événement courant. */
  i: number;
}

/* ── Utilitaires ─────────────────────────────────────────────────────── */

/** Empreinte d'intention : ce que l'agent essaie de faire, pas comment. */
function intent(e: RunEvent): string | null {
  if (e.kind === 'tool.start') {
    // On normalise pour que `Write X`, `Edit X` et `cat > X` se ressemblent.
    const path = String(e.args).match(/[\w./-]*\/[\w./*-]+/)?.[0] ?? String(e.args);
    return `écrire:${path}`;
  }
  if (e.kind === 'hook.deny') return `refus:${e.hook}`;
  return null;
}

function since(ctx: Ctx, n: number): readonly RunEvent[] {
  return ctx.history.slice(Math.max(0, ctx.i - n), ctx.i + 1);
}

/* ── Les règles ──────────────────────────────────────────────────────── */

export const R1_ACTION_REPETEE: Rule = {
  id: 'R1', label: 'action répétée', severity: 'high', hand: true,
  run: (ctx) => {
    const key = intent(ctx.event);
    if (!key || !key.startsWith('écrire:')) return null;
    const window = since(ctx, 30).filter(e => e.actor === ctx.event.actor);
    const hits = window.filter(e => intent(e) === key);
    if (hits.length < 3) return null;
    const span = (hits[hits.length - 1]!.t - hits[0]!.t) / 1000;
    if (span > 60) return null;
    return {
      why: `${hits.length} tentatives identiques (${key}) en ${span.toFixed(0)} s, sans artefact produit entre-temps.`,
      evidence: hits.map(e => e.seq),
    };
  },
};

export const R2_SANS_PROGRES: Rule = {
  id: 'R2', label: 'sans progrès', severity: 'medium', hand: false,
  run: (ctx) => {
    const window = since(ctx, 20).filter(e => e.actor === ctx.event.actor);
    const produced = window.filter(e => e.kind === 'tool.end' && e.ok);
    const attempted = window.filter(e => e.kind === 'tool.start');
    if (attempted.length < 4 || produced.length > 0) return null;
    return {
      why: `${attempted.length} actions tentées, aucune réussie. L'agent n'a rien produit depuis le seq ${attempted[0]!.seq}.`,
      evidence: attempted.map(e => e.seq),
    };
  },
};

export const R3_COUT_SANS_PROGRES: Rule = {
  id: 'R3', label: 'coût sans progrès', severity: 'high', hand: true,
  run: (ctx) => {
    const window = since(ctx, 24).filter(e => e.actor === ctx.event.actor);
    const eur = window.reduce((n, e) => n + (e.cost?.eur ?? 0), 0);
    const calls = window.reduce((n, e) => n + (e.cost?.calls ?? 0), 0);
    const ok = window.some(e => e.kind === 'tool.end' && e.ok);
    if (ok || calls < 5 || eur < 0.02) return null;
    return {
      why: `${calls} appels et ${eur.toFixed(3).replace('.', ',')} € brûlés sans un seul outil réussi.`,
      evidence: [ctx.event.seq],
    };
  },
};

export const R4_PING_PONG: Rule = {
  id: 'R4', label: 'ping-pong', severity: 'medium', hand: false,
  run: (ctx) => {
    // Hisser la narration hors de la fermeture : TypeScript perd le
    // rétrécissement de type sur `ctx.event` à l'intérieur d'un callback.
    const cur = ctx.event;
    if (cur.kind !== 'hook.deny' || cur.event !== 'SubagentStop') return null;
    const window = since(ctx, 24).filter(
      (e): e is Extract<RunEvent, { kind: 'hook.deny' }> =>
        e.kind === 'hook.deny' && e.event === 'SubagentStop' &&
        e.actor === cur.actor && e.hook === cur.hook
    );
    if (window.length < 2) return null;
    return {
      why: `${window.length} cycles stop→refus sur ${cur.hook}. L'agent ne peut ni finir ni corriger : il lui manque un outil, pas une instruction.`,
      evidence: window.map(e => e.seq),
    };
  },
};

/** Demande les quotas de la RunPolicy — d'où le paramètre. */
export function R5_QUOTA_PROJETE(maxCallsParAgent: number): Rule {
  return {
    id: 'R5', label: 'quota projeté', severity: 'high', hand: true,
    run: (ctx) => {
      const mine = ctx.history.slice(0, ctx.i + 1).filter(e => e.actor === ctx.event.actor);
      const calls = mine.reduce((n, e) => n + (e.cost?.calls ?? 0), 0);
      if (calls < maxCallsParAgent - 1) return null;
      const done = mine.some(e => e.kind === 'agent.end');
      if (done) return null;
      return {
        why: `${calls}/${maxCallsParAgent} appels consommés et l'agent n'a pas fini. Projection : quota dépassé avant la fin.`,
        evidence: [ctx.event.seq],
      };
    },
  };
}

/* ── Le moteur ───────────────────────────────────────────────────────── */

export const DEFAULT_RULES = (maxCalls: number): Rule[] => [
  R1_ACTION_REPETEE, R2_SANS_PROGRES, R3_COUT_SANS_PROGRES, R4_PING_PONG, R5_QUOTA_PROJETE(maxCalls),
];

/**
 * Passe les règles sur le flux et renvoie les drapeaux, chacun rattaché au
 * seq de l'événement qui l'a déclenché. Ne modifie pas le flux d'entrée.
 *
 * Anti-spam : une même règle ne se redéclenche pas pour le même acteur tant
 * qu'elle n'est pas retombée (sinon l'alerte se répète à chaque événement).
 */
export type Derived = Extract<RunEvent, { kind: 'flag' | 'flag.clear' }>;

export function detect(events: readonly RunEvent[], rules: readonly Rule[]): Derived[] {
  const out: Derived[] = [];
  const armed = new Set<string>();
  /** Règles « main levée » actuellement actives, par acteur. */
  const hands = new Map<string, Set<string>>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.origin === 'derived') continue;
    const base = { v: e.v, seq: e.seq, t: e.t, run: e.run, actor: e.actor, origin: 'derived' as const };

    for (const r of rules) {
      const key = `${r.id}:${e.actor}`;
      const found = r.run({ event: e, history: events, i });

      if (!found) {
        armed.delete(key);
        if (r.hand) hands.get(e.actor)?.delete(r.id);
        continue;
      }
      if (armed.has(key)) continue;

      armed.add(key);
      if (r.hand) {
        const set = hands.get(e.actor) ?? new Set<string>();
        set.add(r.id);
        hands.set(e.actor, set);
      }
      out.push({
        ...base, kind: 'flag',
        rule: `${r.id} · ${r.label}`, severity: r.severity,
        why: found.why, evidence: found.evidence, hand: r.hand,
      });
    }

    // La main se baisse toute seule quand plus aucune règle ne tient.
    const set = hands.get(e.actor);
    if (set && set.size === 0) {
      hands.delete(e.actor);
      out.push({ ...base, kind: 'flag.clear', reason: 'plus aucune règle active' });
    }
  }
  return out;
}

/**
 * Fusionne les drapeaux dans le flux et renumérote les `seq`.
 * Les événements dérivés se placent juste APRÈS ce qui les a déclenchés.
 */
export function merge(observed: readonly RunEvent[], derived: readonly Derived[]): RunEvent[] {
  const byTrigger = new Map<number, Derived[]>();
  for (const d of derived) {
    const list = byTrigger.get(d.seq) ?? [];
    list.push(d);
    byTrigger.set(d.seq, list);
  }

  const remap = new Map<number, number>();
  const out: RunEvent[] = [];
  let seq = 0;

  for (const e of observed) {
    remap.set(e.seq, seq);
    out.push({ ...e, seq: seq++ });
    for (const d of byTrigger.get(e.seq) ?? []) out.push({ ...d, seq: seq++ });
  }

  // Les preuves pointaient vers l'ancienne numérotation.
  for (const e of out) {
    if (e.kind === 'flag') e.evidence = e.evidence.map(s => remap.get(s) ?? s);
  }
  return out;
}
