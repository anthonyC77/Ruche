# Ruche — squelette

Lecteur 3D de runs agentiques : rejeu, ralenti, marche arrière, main levée.

```bash
npm install
npm run dev            # http://localhost:5173  — le run de démonstration
npm test               # l'oracle du rejeu — 14 tests : rejeu, détecteurs, concordance, verdicts
```

Au démarrage, le lecteur se place sur le premier incident. `Espace` lit,
`←`/`→` avancent d'un événement, les boutons `−4×` / `−1×` rejouent à l'envers,
`V` bascule ruche ↔ rivière.

**Sur une vraie session**, depuis la racine de `coachingia` (dépôt frère) :

```powershell
dotnet run --project src/CoachingIA.Cli -- exporter-run --out ..\ruche\public\runs
```

puis `http://localhost:5173/?run=runs/<identifiant>.events.jsonl`, ou simplement
le glisser-déposer sur la page (bouton « Ouvrir un run… » pour les mêmes effets).

**Les évals dans la ruche.** Un `verdicts.jsonl` (une ligne
`{"task_id", "pass", "reason"}` par cas, format `harnais/eval/schemas/verdicts.schema.json`)
colore le run dont le `task` correspond ; la raison s'affiche au survol du badge.

```
?run=runs/run-t-03-001.events.jsonl&eval=runs/judge.jsonl
```

ou un fichier `*.verdicts.jsonl` glissé sur la page. Pour voir les runs des
oracles du harnais sans attendre une session réelle :

```bash
python3 ../harnais/eval/deplier_runs.py ../harnais/eval/fixtures/runs_tasks.jsonl --out public/runs
cp ../harnais/eval/fixtures/judge.jsonl public/runs/judge.verdicts.jsonl
```

Options de l'export : `--session <début d'identifiant>`, `--tout`, `--contenu`.
Sans `--contenu`, aucun texte de prompt ni de sortie d'outil n'entre dans le
fichier — seulement sa structure et l'empreinte du contenu écarté. C'est la
même coupure que `CaptureContent: false` côté harnais, et c'est le défaut.

---

## Le principe

**Le projet, c'est le journal d'événements — un contrat du harnais. La 3D n'en est qu'un lecteur ; chaque producteur (coachingia, oneiros, deplier_runs.py) l'écrit, Ruche ne fait que lire.**

Si le journal est bon, on le rend dans Three.js aujourd'hui, dans Unity l'an
prochain, dans un terminal en attendant — et on rejoue des runs d'il y a six
mois. Si le journal est mauvais, aucune scène 3D ne le rattrapera : on aura
une belle animation qui ment.

Le sens des dépendances ne s'inverse jamais :

```
core/     ne connaît ni view3d/ ni ui/     ← l'actif du projet
view3d/   connaît core/                    ← jetable, remplaçable
ui/       connaît core/                    ← jetable, remplaçable
main.ts   le seul endroit où tout se rencontre
```

On peut supprimer `view3d/` entier : le moteur, les détecteurs et les tests
continuent de tourner.

---

## 1 · `src/core/events.ts` — le contrat

La seule pièce qui ne doit pas bouger à la légère. Quatre décisions y sont
gravées :

| Champ | Pourquoi |
|---|---|
| `seq` | l'ordre **logique** (compteur unique). Avec cinq sous-agents en parallèle, les horodatages n'ordonnent rien. C'est `seq` qui rend le rejeu déterministe. |
| `t` | l'horloge **vécue**, pour le mode « temps réel ». Deux vérités différentes, on doit pouvoir basculer. |
| `ref` | le gros (prompt, sortie, diff) par empreinte, hors journal. Sinon le journal fait 500 Mo et le lecteur ne le charge pas. Bonus : deux runs qui envoient le même contexte partagent le blob — la déduplication devient une mesure. |
| `origin` | `observed` (jamais recalculé) / `derived` (les drapeaux) / `human`. Mélanger les trois interdit de **rejouer un vieux run avec un détecteur neuf** — l'usage le plus utile. |

**Le schéma est la source, ce fichier est le miroir.** Le contrat vit dans
`harnais/eval/schemas/run_events.schema.json` ; `test/contrat.test.ts` échoue
si la liste des `kind` diffère dans un sens ou dans l'autre, ou si la démo ne
passe pas le schéma. Sans le harnais à côté, le test est sauté avec un message.
La `policy` de l'en-tête a la forme de celle du contrat de run : c'est ce qui
permet à `harnais/eval/plier_evenements.py` de la recopier sans l'inventer.

**Une limite à connaître** : exporté depuis un transcript, `seq` est *dérivé*
des horodatages — le fichier de Claude Code ne porte aucun compteur global. Le
rejeu reste déterministe (même fichier, même ordre), mais deux événements
rigoureusement simultanés sur deux sous-agents sont départagés par l'ordre
d'émission de l'exporteur, pas par une vérité de la source. Un journal produit
en direct par les hooks portera, lui, un vrai compteur.

`v` dès le premier jour, même discipline que `contract_version` du contrat de
run. Sans champ de version, le corpus meurt au premier changement de schéma —
et c'est le corpus qui a de la valeur.

## 2 · `src/core/reducer.ts` + `timeline.ts` — le moteur

```ts
reduce(état, événement) → état     // pure, déterministe, EN AVANT SEULEMENT
```

**La marche arrière ne s'écrit pas.** Un DVD ne lit pas la vidéo à l'envers :
il saute à l'image-clé précédente et rejoue vite en avant. `Timeline`
sérialise l'état complet tous les N événements ; aller à `seq` = copier
l'image-clé précédente + rejouer. Coût constant quelle que soit la taille du
run — l'interface affiche `image-clé + n év.` en bas à droite, c'est la preuve.

Écrire l'inverse de chaque événement double le code et casse au premier effet
de bord non inversible. Ne pas le faire.

« Ralenti », « ×4 », « −1× » et « pas à pas » sont **le même mécanisme** :
seule la vitesse du curseur change (`Playhead.rate`). Il n'y a pas de mode
spécial.

### Rejeu ≠ ré-exécution

Ce squelette fait le **rejeu** : zéro appel LLM, déterministe, marche toujours.

La **ré-exécution** (repartir du seq 40 avec un prompt corrigé) demande en plus
un magnétoscope d'outils — rejouer les sorties enregistrées, patron VCR — un
modèle épinglé et un point de contrôle dans le harnais. Sinon le fork tape sur
la vraie API et les vrais effets de bord. À faire au palier 3, pas avant.

## 3 · `src/core/detectors.ts` — « lève la main »

Cinq règles, **toutes des fonctions pures du flux**, aucune n'appelle de LLM.

| Règle | Signal | Main levée |
|---|---|---|
| R1 · action répétée | même `(outil, chemin)` ≥ 3× en < 60 s | oui |
| R2 · sans progrès | ≥ 4 actions, 0 réussie | non |
| R3 · coût sans progrès | € et appels montent, aucun outil réussi | oui |
| R4 · ping-pong | ≥ 2 cycles stop→refus sur le même hook | non |
| R5 · quota projeté | dépassement de `max_calls_par_agent` prédit | oui |

Deux propriétés qui font toute la valeur :

1. Elles tournent **à l'identique en direct et en rejeu**. Un détecteur écrit
   en novembre se teste sur les runs d'octobre.
2. Donc le détecteur est **évaluable** : on annote un corpus de runs (« ici il
   bouclait », « ici non ») et on mesure précision/rappel. L'oracle avant
   l'agent, y compris pour l'agent qui surveille.

Les seuils sont des points de départ, pas des vérités. Ils se règlent contre
le corpus.

Les drapeaux produits sont des événements `origin: 'derived'`, fusionnés dans
le flux au chargement (`merge`) et recalculables à volonté. `merge` renumérote
les `seq` **et remappe les preuves** — un drapeau pointe toujours vers des
événements qui existent.

## 4 · `src/core/sources.ts` — fichier et direct

Règle non négociable : **le tachymètre ne freine jamais la voiture.**

```
agents ──(écriture append-only, non bloquante)──▶ journal (disque)
                                                       │
                                        tampon circulaire borné
                                                       │
                                              SSE ──▶ lecteurs
```

Le lecteur s'abonne au **journal**, jamais aux agents. S'il prend du retard —
réseau lent, trente spectateurs, onglet en arrière-plan — on jette des
événements, on ne met jamais un agent en attente d'un affichage.
`LiveSource` implémente ce tampon.

Le direct n'est alors qu'« un rejeu dont le curseur est collé à la fin » :
même moteur, un booléen de plus.

Côté serveur, un seul endpoint suffit :

```
GET /api/runs/{id}/stream   →  text/event-stream, un événement JSON par ligne
```

En C#, ~30 lignes de minimal API qui republie le fichier append-only.
`vite.config.ts` proxifie déjà `/api` vers `localhost:5000`.

## 5 · `src/view3d/` — les deux dispositions

Un seul graphe de scène, deux placements, une interpolation entre les deux —
c'est ce qui donne la sensation d'une scène Unity : rien ne disparaît, tout se
déplace.

- **Ruche** : le présent. Qui travaille, qui attend, qui bloque. Pour le direct.
- **Rivière** : le passé. Le temps devient un axe qu'on survole, la profondeur
  porte le niveau de sous-agent. Pour le rejeu et l'eval.

Encodages — chacun porte **une** information, jamais deux :

| Canal | Information |
|---|---|
| position | rôle (ruche) / couloir (rivière) |
| couleur | état courant — sémantique, jamais une identité |
| hauteur | coût accumulé |
| anneau | quota consommé, rouge au-delà de 80 % |
| halo | l'agent travaille en ce moment |
| faisceau cyan | main levée — la seule note froide, visible de partout |
| onde rouge | un hook vient de refuser |

**Perf** : un `InstancedMesh` unique pour toutes les barres (`spans.ts`). Un
run de 50 000 spans reste à un appel de dessin. Ne jamais créer un `Mesh` par
span — c'est le piège qui fait dire « la 3D ne passe pas à l'échelle ».

## 6 · Brancher sur Angular

`core/` est du TypeScript sans dépendance : il s'importe tel quel dans un
service Angular. Pour la scène :

```ts
@Component({ selector: 'app-ruche', template: '<canvas #c></canvas>' })
export class RucheComponent implements AfterViewInit, OnDestroy {
  @ViewChild('c') canvas!: ElementRef<HTMLCanvasElement>;
  private stage?: Stage;

  constructor(private zone: NgZone) {}

  ngAfterViewInit(): void {
    // SANS ceci, la détection de changements tourne à 60 images/seconde.
    this.zone.runOutsideAngular(() => {
      this.stage = new Stage(this.canvas.nativeElement);
      this.stage.start(dt => { /* … */ });
    });
  }

  ngOnDestroy(): void { this.stage?.dispose(); }
}
```

Ne remonter dans la zone Angular que les changements de **sélection**, jamais
la boucle de rendu.

## 7 · D'où viennent les événements

Pas d'un collecteur propre à Ruche : **CoachingIA en a déjà deux**, et un
troisième serait un troisième endroit à réparer le jour où le format bouge.

| Voie | Qui la porte | État |
|---|---|---|
| Transcripts `~/.claude/projects/` | `TranscriptReader` → `SessionBuilder` | existe, rétroactif, tolérant |
| Hooks temps réel | `POST /hooks/{eventName}` + `plugin/coachingia/hooks/hooks.json` | existe |
| Projection vers le contrat | `Transcripts/RunExporter.cs` | **le chaînon** |

`RunExporter` ne parse rien : il lit le modèle que `SessionBuilder` produit
déjà. Une seule frontière avec le JSONL de Claude Code, et elle est dans
`TranscriptReader`.

Le direct reste à faire : `GET /runs/{id}/stream` en SSE, ajouté à `Routes.Map`
(la table explicite segment d'URL → nom canonique, qui ne se dérive pas), plus
un tampon circulaire borné côté serveur. `src/core/sources.ts` contient déjà
`LiveSource`, écrit pour ça.

### Le contrat en double

`harnais/eval/schemas/run_events.schema.json` (la source), `src/core/events.ts`
(ici) et `Transcripts/RunEvent.cs` (côté C#) décrivent la même chose. Deux
définitions dérivent toujours ; trois, à coup sûr. Deux tests s'y opposent :
`test/contrat.test.ts` compare `events.ts` au schéma, `RunExportTests` compare
le C# à `events.ts`. C'est le même geste que « un outil est un type », appliqué
à l'événement.

---

## Ce qui manque volontairement

Le squelette s'arrête là où commencent les choix qui dépendent de ton harnais :

- **Magasin de blobs** — `ref` est déclaré dans le contrat mais rien ne le lit
  encore. À brancher quand les prompts entrent dans le journal.
- **Panneau d'inspection** — cliquer un span devrait ouvrir le contexte envoyé
  et la sortie reçue. C'est ce qui répond à « d'où vient cette phrase ? »
  (nœud 2).
- **Chemin critique** — la plus longue chaîne causale, à surligner dans la vue
  rivière. C'est le plancher de durée du run : accélérer autre chose ne sert
  à rien.
- **Rejeu comparatif** — deux runs de la même tâche côte à côte, alignés sur
  les **jalons** et non sur le temps. Sinon on compare des durées et on conclut
  n'importe quoi.
- **Canal de retour** — geler / injecter un message / tuer, depuis l'alerte.
  Lever la main sans pouvoir répondre ne sert qu'à regarder l'accident.
- **Annotations** — une marque humaine sur un seq. C'est ce qui transforme le
  rejeu en machine à fabriquer des étiquettes, et c'est le seul chemin
  d'auto-apprentissage qui se bonifie au lieu de pourrir.

## La ligne à ne pas franchir

La ruche lit les internes — spans, prompts, mémoire de l'orchestrateur. C'est
son métier : c'est de l'observabilité.

**L'eval, non.** L'eval ne lit que le contrat de run public. Le jour où
`run_tasks_eval.py` importe quoi que ce soit du journal de spans, le juge a
pris un rang et il régressera avec ce qu'il mesure. La ruche peut *illustrer*
un run d'eval ; elle ne doit jamais lui fournir son verdict.
