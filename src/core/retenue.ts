/**
 * LA RETENUE
 *
 * Le temps de RUN d'un appel n'est pas son temps d'ÉCRAN. Un `dotnet build`
 * de 90 ms ne doit pas clignoter une image et disparaître : son météore vole
 * `VOL_MS`, et l'autel reste tenu au moins `TENUE_MIN_MS` avant de rendre la
 * main — sinon l'œil ne voit jamais l'issue d'un appel rapide.
 *
 * Ce module ne lit jamais l'horloge lui-même : `maintenant` est TOUJOURS
 * fourni par l'appelant (le lecteur 3D, qui lui connaît l'heure de l'écran).
 * C'est ce qui permet de le tester sans DOM et de le rejouer à n'importe
 * quelle vitesse.
 */

export const VOL_MS = 1000;
export const TENUE_MIN_MS = 1400;

export type Transition = { cle: number; quoi: 'arrivee' | 'bouclier' | 'impact' | 'fin' };

interface Entree {
  ouverture: number;
  bloque: boolean;
  fermeture: number | null;
  emis: Set<Transition['quoi']>;
}

/** Une transition candidate, avant filtrage par ce qui a déjà été émis. */
interface Candidate {
  quoi: Transition['quoi'];
  instant: number;
  rang: number; // ordre causal, pour départager les ex æquo d'un même appel
}

export class Retenue {
  private readonly volMs: number;
  private readonly tenueMinMs: number;
  private readonly appels = new Map<number, Entree>();

  constructor(opts: { volMs?: number; tenueMinMs?: number } = {}) {
    this.volMs = opts.volMs ?? VOL_MS;
    this.tenueMinMs = opts.tenueMinMs ?? TENUE_MIN_MS;
  }

  /** Une clé déjà connue est ignorée : la première ouverture fait foi. */
  ouvrir(cle: number, bloque: boolean, maintenant: number): void {
    if (this.appels.has(cle)) return;
    this.appels.set(cle, { ouverture: maintenant, bloque, fermeture: null, emis: new Set() });
  }

  /** Clé inconnue ou déjà fermée : ignoré (la première fermeture fait foi). */
  fermer(cle: number, maintenant: number): void {
    const e = this.appels.get(cle);
    if (!e || e.fermeture !== null) return;
    e.fermeture = maintenant;
  }

  private instantImpact(e: Entree): number {
    // n'a de sens que fermée et non bloquée : `fermeture` est alors non nulle.
    return Math.max(e.ouverture + this.volMs, e.fermeture as number);
  }

  private instantFin(e: Entree): number {
    if (e.bloque) return Math.max(e.ouverture + this.tenueMinMs, e.ouverture + this.volMs);
    return Math.max(e.ouverture + this.tenueMinMs, this.instantImpact(e));
  }

  /** clamp((maintenant - ouverture) / volMs, 0, 1) ; null si clé inconnue ou déjà sortie par 'fin'. */
  progression(cle: number, maintenant: number): number | null {
    const e = this.appels.get(cle);
    if (!e) return null;
    const p = (maintenant - e.ouverture) / this.volMs;
    return Math.max(0, Math.min(1, p));
  }

  /** true si ouverture <= maintenant et (non fermée, ou maintenant < instant de fin). */
  affiche(cle: number, maintenant: number): boolean {
    const e = this.appels.get(cle);
    if (!e) return false;
    if (e.ouverture > maintenant) return false;
    if (e.fermeture === null) return true;
    return maintenant < this.instantFin(e);
  }

  /** Clés affichées à `maintenant`, triées croissant. */
  actifs(maintenant: number): number[] {
    const out: number[] = [];
    for (const cle of this.appels.keys()) {
      if (this.affiche(cle, maintenant)) out.push(cle);
    }
    return out.sort((a, b) => a - b);
  }

  /** Les candidats d'un appel, dans leur ordre causal (instants non décroissants). */
  private candidats(e: Entree): Candidate[] {
    if (e.bloque) {
      const out: Candidate[] = [{ quoi: 'bouclier', instant: e.ouverture + this.volMs, rang: 0 }];
      if (e.fermeture !== null) out.push({ quoi: 'fin', instant: this.instantFin(e), rang: 1 });
      return out;
    }
    const out: Candidate[] = [{ quoi: 'arrivee', instant: e.ouverture + this.volMs, rang: 0 }];
    if (e.fermeture !== null) {
      out.push({ quoi: 'impact', instant: this.instantImpact(e), rang: 1 });
      out.push({ quoi: 'fin', instant: this.instantFin(e), rang: 2 });
    }
    return out;
  }

  /** Transitions d'instant <= maintenant pas encore émises, triées par instant puis cle. */
  avancer(maintenant: number): Transition[] {
    const brut: { cle: number; quoi: Transition['quoi']; instant: number }[] = [];

    for (const [cle, e] of this.appels) {
      for (const c of this.candidats(e)) {
        if (e.emis.has(c.quoi)) continue;
        if (c.instant > maintenant) continue;
        brut.push({ cle, quoi: c.quoi, instant: c.instant });
      }
    }

    brut.sort((a, b) => (a.instant - b.instant) || (a.cle - b.cle));

    const out: Transition[] = [];
    for (const t of brut) {
      const e = this.appels.get(t.cle);
      if (!e) continue; // déjà oublié par une 'fin' traitée plus tôt dans ce même appel
      e.emis.add(t.quoi);
      out.push({ cle: t.cle, quoi: t.quoi });
      if (t.quoi === 'fin') this.appels.delete(t.cle);
    }
    return out;
  }

  /** Oublie tout : pour un saut ou une marche arrière du curseur. */
  vider(): void {
    this.appels.clear();
  }
}

/**
 * La règle de franchissement du curseur : quels événements rejouer quand on
 * passe de `avant` à `apres`. Un bond trop grand ou une marche arrière ne se
 * rejouent pas événement par événement : le lecteur vide ses effets et
 * reconstruit l'état directement au seq visé.
 */
export function evenementsFranchis(avant: number, apres: number, max = 12): { seqs: number[]; saut: boolean } {
  if (apres === avant) return { seqs: [], saut: false };
  const delta = apres - avant;
  if (delta > 0 && delta <= max) {
    const seqs: number[] = [];
    for (let s = avant + 1; s <= apres; s++) seqs.push(s);
    return { seqs, saut: false };
  }
  return { seqs: [], saut: true };
}
