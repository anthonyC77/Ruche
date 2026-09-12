/**
 * CÂBLAGE
 *
 * Le seul fichier où les couches se rencontrent. L'ordre de dépendance ne
 * s'inverse jamais : core ne connaît ni view3d ni ui.
 *
 *   journal ──▶ détecteurs ──▶ Timeline (images-clés) ──▶ Playhead
 *                                   │
 *                            State à chaque image
 *                                   ├──▶ view3d (acteurs, barres, liens)
 *                                   └──▶ ui (panneaux, transport)
 *
 * Trois sources possibles, même suite :
 *   - ?run=<chemin>        un fichier produit par `coachingia exporter-run`
 *   - un .jsonl déposé     glisser-déposer, ou le bouton « Ouvrir un run »
 *   - rien                 le run de démonstration
 */

import { Vector3 } from 'three';
import { loadRun, parseJsonl } from './core/sources.js';
import { DEFAULT_RULES, detect, merge } from './core/detectors.js';
import { Playhead, Timeline } from './core/timeline.js';
import { approach, buildLayout } from './view3d/layout.js';
import type { ViewName } from './view3d/layout.js';
import { Stage } from './view3d/stage.js';
import { Actor } from './view3d/actors.js';
import { SpanField } from './view3d/spans.js';
import { LinkField } from './view3d/links.js';
import { wireTransport } from './ui/transport.js';
import { renderAgents, renderAlert, renderLog } from './ui/panels.js';
import type { State } from './core/reducer.js';
import type { RunFile } from './core/events.js';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} absent du document`);
  return el as T;
};

/** Ce qu'il faut défaire avant de charger un autre run. */
let demonter: (() => void) | null = null;

/**
 * Le canevas est remplacé plutôt que réutilisé : un WebGLRenderer ne se
 * reconstruit pas sur un canevas dont le contexte a déjà été rendu.
 */
function canevasNeuf(): HTMLCanvasElement {
  const ancien = $<HTMLCanvasElement>('stage');
  const neuf = document.createElement('canvas');
  neuf.id = 'stage';
  ancien.replaceWith(neuf);
  return neuf;
}

function afficherErreur(message: string): void {
  $('erreur').hidden = false;
  $('erreur').textContent = message;
}

function monter(run: RunFile, source: string): void {
  demonter?.();
  $('erreur').hidden = true;

  /* 1 · les détecteurs — dérivés, recalculables, fusionnés dans le flux */
  const flags = detect(run.events, DEFAULT_RULES(run.policy.quotas.max_calls_par_agent));
  const events = merge(run.events, flags);

  /* 2 · le moteur de rejeu */
  const tl = new Timeline(events, run.agents, { keyframeEvery: 8 });
  const premierIncident = events.find(e => e.kind === 'flag' && e.hand)?.seq ?? 0;
  const ph = new Playhead(tl, premierIncident);

  /* 3 · la scène */
  const stage = new Stage(canevasNeuf());
  const layout = buildLayout(run.agents, tl.duration);
  const maxCalls = run.policy.quotas.max_calls_par_agent;

  const actors = new Map<string, Actor>();
  for (const decl of run.agents) {
    const a = new Actor(decl, maxCalls);
    a.group.position.copy(layout.hive[decl.id] ?? new Vector3());
    stage.scene.add(a.group);
    actors.set(decl.id, a);
  }

  const spans = new SpanField(layout, tl.duration);
  stage.scene.add(spans.mesh, spans.decor);

  const links = new LinkField(id => actors.get(id)?.group.position ?? new Vector3());
  stage.scene.add(links.group);

  /* 4 · index des refus, pour l'onde de choc (précalculé une fois) */
  const denies = new Map<string, number[]>();
  for (const e of events) {
    if (e.kind !== 'hook.deny') continue;
    const list = denies.get(e.actor) ?? [];
    list.push(e.t);
    denies.set(e.actor, list);
  }
  const lastDeny = (id: string, tNow: number): number | null => {
    const list = denies.get(id);
    if (!list) return null;
    let best: number | null = null;
    for (const t of list) if (t <= tNow && (best === null || t > best)) best = t;
    return best === null ? null : tNow - best;
  };

  /* 5 · état courant et panneaux */
  let state: State = tl.stateAt(ph.cursor);
  let selected: string | null = null;
  let view: ViewName = 'ruche';
  let morph = 0;

  const handlers = {
    onSelectAgent: (id: string) => { selected = id; refresh(); },
    onSelectSeq: (seq: number) => { ph.playing = false; ph.seek(seq); state = tl.stateAt(seq); refresh(); },
  };

  function refresh(): void {
    renderAgents($('agents'), state, selected, maxCalls, handlers);
    renderAlert($('alert'), state);
    renderLog($('log'), state, ph.cursor, handlers);
    $('task').textContent = state.task || run.task_id;
    $('source').textContent = source;
    $('clock').textContent =
      `seq ${String(Math.floor(ph.cursor)).padStart(2, '0')}/${tl.last} · ` +
      `${(state.t / 1000).toFixed(1).replace('.', ',')} s`;
    $('seekcost').textContent = `image-clé + ${tl.lastSeekCost} év.`;
  }

  const debrancherTransport = wireTransport({
    play: $('play'), stepF: $('stepF'), stepB: $('stepB'),
    prevFlag: $('prevFlag'), nextFlag: $('nextFlag'),
    scrub: $<HTMLInputElement>('scrub'),
    rates: document.querySelectorAll<HTMLButtonElement>('[data-rate]'),
  }, tl, ph, () => { state = tl.stateAt(ph.cursor); refresh(); });

  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    b.onclick = () => {
      view = b.dataset['view'] as ViewName;
      for (const x of document.querySelectorAll('[data-view]')) x.classList.toggle('on', x === b);
      stage.frame(view);
    };
  }

  const surCanevas = (ev: PointerEvent): void => {
    const hit = stage.pick(ev, [...actors.values()].map(a => a.body));
    if (!hit) return;
    for (const [id, a] of actors) if (a.body === hit) { selected = id; refresh(); }
  };
  stage.renderer.domElement.addEventListener('pointerdown', surCanevas);

  /* 6 · la boucle */
  stage.start((dt) => {
    if (ph.advance(dt)) { state = tl.stateAt(ph.cursor); refresh(); }

    morph = approach(morph, view === 'ruche' ? 0 : 1, dt);
    const tNow = tl.timeAt(ph.cursor);
    const now = performance.now();

    for (const [id, actor] of actors) {
      const a = state.agents[id];
      if (!a) continue;
      actor.place(layout.hive[id]!, layout.river[id]!, morph);
      actor.update(a, now, lastDeny(id, tNow));
      actor.group.visible = a.st !== 'absent' || morph > 0.5;
    }

    spans.update(state, tNow, morph);
    links.update(state, tNow, morph);

    stage.floor.material.opacity = 1 - morph * 0.75;
    (stage.polar.material as { opacity: number }).opacity = 0.35 * (1 - morph);
  });

  stage.resize();
  refresh();

  demonter = () => {
    debrancherTransport();
    stage.renderer.domElement.removeEventListener('pointerdown', surCanevas);
    stage.dispose();
  };
}

/* ── Les sources ──────────────────────────────────────────────────────── */

async function depuisUrl(url: string): Promise<void> {
  try {
    monter(await loadRun(url), url);
  } catch (err: unknown) {
    afficherErreur(
      `${url} illisible : ${String(err)}\n\n` +
      `Produisez un fichier avec :\n` +
      `  dotnet run --project src/CoachingIA.Cli -- exporter-run --out web/ruche/public/runs`
    );
  }
}

function depuisTexte(texte: string, nom: string): void {
  try {
    monter(parseJsonl(texte), nom);
  } catch (err: unknown) {
    afficherErreur(`${nom} illisible : ${String(err)}`);
  }
}

/* glisser-déposer sur toute la page, plus un bouton pour ceux qui ne devinent pas */
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drop'); });
addEventListener('dragleave', () => document.body.classList.remove('drop'));
addEventListener('drop', e => {
  e.preventDefault();
  document.body.classList.remove('drop');
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  f.text().then(t => depuisTexte(t, f.name));
});

const picker = document.getElementById('file');
if (picker instanceof HTMLInputElement) {
  picker.addEventListener('change', () => {
    const f = picker.files?.[0];
    if (f) f.text().then(t => depuisTexte(t, f.name));
  });
}

const demande = new URLSearchParams(location.search).get('run');
void depuisUrl(demande ?? '/demo-run.jsonl');
