/**
 * LA FORME PORTE L'IDENTITÉ, LA COULEUR PORTE L'ÉTAT
 *
 * Règle de ruche : on ne doit jamais avoir à lire une couleur pour savoir
 * quel outil a été appelé — sinon la teinte finit par coder deux choses à
 * la fois (qui, et comment ça se passe), et l'œil ne peut plus démêler les
 * deux d'un coup d'œil. La forme de l'autel (et son glyphe) est donc la
 * seule porteuse de cette identité ; la couleur reste libre pour l'état.
 *
 * Ce module ne décide QUE de ça : quel outil obtient quel autel, sous
 * quelle forme, à quelle position. Il est volontairement pur — aucun
 * import de three, aucun accès au DOM — pour rester testable sous vitest
 * sans contexte WebGL. La construction des géométries three.js à partir de
 * ce plan est une tâche séparée (src/view3d/autels.ts).
 *
 * Les runs réels du harnais n'utilisent presque jamais Read/Edit/Write/Bash
 * (ce sont les outils du run de démo) : la plupart des outils vus sont donc
 * « non canoniques » et reçoivent une forme de repli, dans un ordre stable
 * pour qu'un même outil garde toujours la même forme d'un rendu à l'autre.
 */

/** Les douze silhouettes d'autel disponibles — quatre canoniques, sept de repli, une pour le fourre-tout. */
export type Forme =
  | 'livres' | 'enclume' | 'stele' | 'obelisque'
  | 'pyramide' | 'arche' | 'colonne' | 'cage' | 'prisme' | 'sablier' | 'tour'
  | 'tore';

/** Les quatre outils du run de démo ont une forme fixe, héritée de la maquette validée. */
export const FORME_CANONIQUE: Readonly<Record<string, Forme>> = {
  Read: 'livres', Edit: 'enclume', Write: 'stele', Bash: 'obelisque',
};

/** Ordre de priorité des outils canoniques, utilisé pour le tri de outilsDuRun. */
const ORDRE_CANONIQUE: readonly string[] = ['Read', 'Edit', 'Write', 'Bash'];

/** Formes attribuées aux outils non canoniques, dans l'ordre où elles se libèrent. */
export const FORMES_DE_REPLI: readonly Forme[] = [
  'pyramide', 'arche', 'colonne', 'cage', 'prisme', 'sablier', 'tour',
];

/** Au-delà, les outils les moins fréquents se regroupent sous un même autel « autres ». */
export const MAX_AUTELS = 8;

/** Clé du dernier autel quand il faut regrouper. Les points de suspension évitent toute collision avec un vrai nom d'outil. */
export const AUTRES = '…autres';

/**
 * L'ensemble des outils à représenter pour un run : l'union sans doublon
 * des outils permis par la policy et des outils réellement vus, triée pour
 * que les outils canoniques (s'ils sont présents) arrivent en tête dans
 * l'ordre Read, Edit, Write, Bash, puis les autres outils autorisés dans
 * leur ordre d'origine, puis les outils vus mais non listés dans autorises.
 */
export function outilsDuRun(autorises: readonly string[], vus: readonly string[]): string[] {
  const union = new Set<string>([...autorises, ...vus]);
  const resultat: string[] = [];
  const deja = new Set<string>();
  const ajouter = (outil: string): void => {
    if (deja.has(outil)) return;
    deja.add(outil);
    resultat.push(outil);
  };

  for (const canonique of ORDRE_CANONIQUE) {
    if (union.has(canonique)) ajouter(canonique);
  }
  for (const outil of autorises) ajouter(outil);
  for (const outil of vus) ajouter(outil);
  return resultat;
}

/** Un autel du HUD : sa forme, les outils qu'il représente, et sa place autour du cercle. */
export interface PlanAutel {
  cle: string;
  forme: Forme;
  outils: string[];
  autorise: boolean;
  angle: number;
  x: number;
  z: number;
}

/**
 * Construit le plan des autels pour une liste d'outils déjà ordonnée
 * (typiquement le résultat de outilsDuRun). Au-delà de MAX_AUTELS outils,
 * les derniers se regroupent sous un autel unique AUTRES de forme 'tore'.
 */
export function planAutels(
  outils: readonly string[],
  autorises: readonly string[],
  rayon = 12.2,
): PlanAutel[] {
  const permis = new Set(autorises);
  const groupes: { cle: string; outils: string[] }[] = [];

  if (outils.length <= MAX_AUTELS) {
    for (const outil of outils) groupes.push({ cle: outil, outils: [outil] });
  } else {
    for (const outil of outils.slice(0, MAX_AUTELS - 1)) groupes.push({ cle: outil, outils: [outil] });
    groupes.push({ cle: AUTRES, outils: outils.slice(MAX_AUTELS - 1) });
  }

  const formesUtilisees = new Set<Forme>();
  let curseurRepli = 0;
  const prochaineFormeDeRepli = (): Forme => {
    while (curseurRepli < FORMES_DE_REPLI.length && formesUtilisees.has(FORMES_DE_REPLI[curseurRepli]!)) {
      curseurRepli++;
    }
    // FORMES_DE_REPLI a exactement MAX_AUTELS - 1 entrées : il ne peut en manquer
    // que si un plan sans autel AUTRES demande MAX_AUTELS formes non canoniques
    // distinctes en même temps ; 'tore' sert alors de dernier recours.
    const forme = curseurRepli < FORMES_DE_REPLI.length ? FORMES_DE_REPLI[curseurRepli]! : 'tore';
    formesUtilisees.add(forme);
    return forme;
  };

  const n = groupes.length;
  return groupes.map((groupe, i) => {
    let forme: Forme;
    if (groupe.cle === AUTRES) {
      forme = 'tore';
      formesUtilisees.add(forme);
    } else {
      const canonique = FORME_CANONIQUE[groupe.outils[0]!];
      forme = canonique ?? prochaineFormeDeRepli();
      formesUtilisees.add(forme);
    }
    const angle = (-3 * Math.PI) / 4 + i * ((2 * Math.PI) / n);
    return {
      cle: groupe.cle,
      forme,
      outils: groupe.outils,
      autorise: groupe.outils.some((o) => permis.has(o)),
      angle,
      x: Math.cos(angle) * rayon,
      z: Math.sin(angle) * rayon,
    };
  });
}

/** Retrouve l'autel qui représente un outil donné dans un plan, ou null s'il n'y en a pas. */
export function autelDe(outil: string, plan: readonly PlanAutel[]): PlanAutel | null {
  return plan.find((a) => a.outils.includes(outil)) ?? null;
}

/** Glyphes SVG 16×16, un par forme — pas de couleur figée, `currentColor` hérite de l'état. */
export const GLYPHE: Readonly<Record<Forme, string>> = {
  // Read : pile de livres entrouverts.
  livres: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 4.2C6.4 3 4 2.8 1.8 3.3v9.2C4 12 6.4 12.2 8 13.4c1.6-1.2 4-1.4 6.2-.9V3.3C12 2.8 9.6 3 8 4.2z"/><path d="M8 4.2v9.2"/></svg>',
  // Edit : crayon.
  enclume: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M10.6 2.4l3 3-8.2 8.2-3.6.6.6-3.6z"/><path d="M9 4l3 3"/></svg>',
  // Write : page avec un plus.
  stele: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 1.8h6.5L13 5.3v8.9H3z"/><path d="M9.3 1.8v3.6H13"/><path d="M8 8v4.2M5.9 10.1h4.2" stroke-linecap="round"/></svg>',
  // Bash : invite de commande.
  obelisque: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6.5 8l-4 3.5"/><path d="M8 12h5.5"/></svg>',
  pyramide: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M8 2.5L14.5 13.5H1.5z"/></svg>',
  arche: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 13.5V8a5.5 5.5 0 0111 0v5.5"/></svg>',
  colonne: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 2.5h10M3 13.5h10M5 2.5v11M8 2.5v11M11 2.5v11"/></svg>',
  cage: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 2.5h11v11h-11z"/><path d="M2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11"/></svg>',
  prisme: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 11L5.5 4h5L13 11z"/><path d="M3 11h10"/></svg>',
  sablier: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 2.5h10L8 8 13 13.5H3L8 8z"/></svg>',
  tour: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M4 13.5V6h8v7.5z"/><path d="M4 6V3h2v1.5h1.5V3h1v1.5H10V3h2v3"/></svg>',
  tore: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="8" cy="8" rx="6" ry="3.2"/><ellipse cx="8" cy="8" rx="2.4" ry="1.2"/></svg>',
};
