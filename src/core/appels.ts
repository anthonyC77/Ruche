/**
 * L'INDEX DES APPELS D'OUTIL
 *
 * Un run n'est pas qu'une suite d'événements : c'est une suite d'APPELS, chacun
 * ouvert par un `tool.start` et fermé soit par son `tool.end` (succès ou échec),
 * soit par un `hook.deny` qui porte l'outil visé — le bouclier qui l'arrête avant
 * exécution. C'est cette notion d'appel, pas l'événement brut, que le HUD affiche :
 * un météore par appel, tenu jusqu'à son issue.
 *
 * Module pur, sans three ni DOM : l'index se recalcule à l'identique en direct,
 * en rejeu, et à l'envers — ce qui rend la marche arrière du lecteur honnête.
 */

import type { AgentId, RunEvent } from './events.js';

export interface Appel {
  cle: number; // seq du tool.start : la clé de l'appel
  agent: AgentId;
  outil: string;
  args: string;
  t0: number; // t du tool.start
  seqFin: number | null; // seq de l'événement qui clôt l'appel (tool.end, ou hook.deny portant un champ tool), null si jamais clos
  t1: number | null;
  ok: boolean | null; // null tant que non clos ; false si refusé
  bloquePar: string | null; // nom du hook (champ hook) qui a refusé l'appel avant exécution, sinon null
  sortie: string; // out du tool.end, ou reason du hook.deny, '' sinon
  ms: number; // ms du tool.end ; pour un refus t1 - t0 ; 0 si non clos
}

export type Issue = 'reussite' | 'echec' | 'bouclier' | 'en-cours';

/** Le sort qu'a subi un appel : bloqué avant, échoué pendant, réussi, ou encore en vol. */
export function issue(a: Appel): Issue {
  if (a.bloquePar !== null) return 'bouclier';
  if (a.ok === true) return 'reussite';
  if (a.ok === false) return 'echec';
  return 'en-cours';
}

export interface Competence {
  outil: string;
  appels: number;
  echecs: number;
  refus: number;
  dernier: string;
}

/** Un appel en cours de construction — mutable le temps de parcourir le flux. */
interface AppelEnCours {
  cle: number;
  agent: AgentId;
  outil: string;
  args: string;
  t0: number;
  seqFin: number | null;
  t1: number | null;
  ok: boolean | null;
  bloquePar: string | null;
  sortie: string;
  ms: number;
}

export class IndexAppels {
  readonly appels: readonly Appel[]; // triés par cle croissante

  constructor(events: readonly RunEvent[]) {
    const appels: AppelEnCours[] = [];
    /** Appels encore ouverts, par acteur, dans l'ordre d'ouverture (le plus récent en fin de liste). */
    const ouverts = new Map<AgentId, AppelEnCours[]>();

    for (const e of events) {
      if (e.kind === 'tool.start') {
        const a: AppelEnCours = {
          cle: e.seq, agent: e.actor, outil: e.tool, args: e.args, t0: e.t,
          seqFin: null, t1: null, ok: null, bloquePar: null, sortie: '', ms: 0,
        };
        appels.push(a);
        const liste = ouverts.get(e.actor) ?? [];
        liste.push(a);
        ouverts.set(e.actor, liste);
        continue;
      }

      if (e.kind === 'tool.end') {
        const liste = ouverts.get(e.actor);
        if (!liste || liste.length === 0) continue; // un tool.end sans appel ouvert est ignoré
        // le plus récent du même outil, à défaut le plus récent tout court
        let idx = -1;
        for (let i = liste.length - 1; i >= 0; i--) {
          if (liste[i]!.outil === e.tool) { idx = i; break; }
        }
        if (idx === -1) idx = liste.length - 1;
        const a = liste[idx]!;
        liste.splice(idx, 1);
        a.seqFin = e.seq;
        a.t1 = e.t;
        a.ok = e.ok;
        a.sortie = e.out ?? '';
        a.ms = e.ms;
        continue;
      }

      if (e.kind === 'hook.deny') {
        if (e.tool === undefined) continue; // refus d'arrêt : n'ouvre ni ne clôt aucun appel
        const liste = ouverts.get(e.actor);
        if (!liste || liste.length === 0) continue;
        const a = liste.pop()!; // le plus récent
        a.seqFin = e.seq;
        a.t1 = e.t;
        a.ok = false;
        a.bloquePar = e.hook;
        a.sortie = e.reason;
        a.ms = e.t - a.t0;
        continue;
      }
    }

    this.appels = appels
      .slice()
      .sort((x, y) => x.cle - y.cle)
      .map((a): Appel => ({ ...a }));
  }

  parDebut(seq: number): Appel | null {
    return this.appels.find(a => a.cle === seq) ?? null;
  }

  parFin(seq: number): Appel | null {
    return this.appels.find(a => a.seqFin === seq) ?? null;
  }

  ouvertsA(seq: number): Appel[] {
    return this.appels.filter(a => a.cle <= seq && (a.seqFin === null || a.seqFin > seq));
  }

  /** Noms d'outils des tool.start, dans l'ordre de première apparition, sans doublon. */
  outilsVus(): string[] {
    const vus: string[] = [];
    for (const a of this.appels) {
      if (!vus.includes(a.outil)) vus.push(a.outil);
    }
    return vus;
  }

  competences(agent: AgentId, seq: number, outils: readonly string[]): Competence[] {
    const miens = this.appels.filter(a => a.agent === agent && a.cle <= seq);
    return outils.map((outil): Competence => {
      const dOutil = miens.filter(a => a.outil === outil);
      const echecs = dOutil.filter(a => a.ok === false && a.bloquePar === null).length;
      const refus = dOutil.filter(a => a.bloquePar !== null).length;
      const dernier = dOutil.length > 0 ? dOutil[dOutil.length - 1]!.args : '';
      return { outil, appels: dOutil.length, echecs, refus, dernier };
    });
  }
}
