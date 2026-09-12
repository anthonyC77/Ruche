/**
 * Génère un run de démonstration au format du contrat (JSONL).
 *
 *   node tools/make-demo-trace.mjs public/demo-run.jsonl
 *
 * Le scénario est celui du harnais Horus, tâche T-07 : le codeur tente
 * d'écrire à la main un schéma qui est GÉNÉRÉ, `guard-eval-files.sh` refuse
 * trois fois, `gate-tests.sh` refuse l'arrêt, et une reprise humaine débloque.
 *
 * IMPORTANT : ce fichier n'émet QUE des événements observés (et l'événement
 * humain). Aucun `flag`. Les drapeaux sont produits par les détecteurs au
 * chargement — c'est la preuve qu'ils fonctionnent sur un vrai flux.
 *
 * Le premier événement est `run.start`, le dernier `run.end`, `seq` part de 0
 * sans trou : c'est ce que harnais/eval/schemas/run_events.schema.json impose.
 */

import { writeFileSync } from 'node:fs';

const RUN = 'run_2026-09-11_T07_a3f91c';
const V = 1;

let seq = 0, t = 0;
const events = [];
const cum = { calls: 0, tok_in: 0, tok_out: 0, eur: 0 };

const ev = (kind, actor, payload = {}, dt = 0, origin = 'observed') => {
  t += dt;
  const e = { v: V, seq: seq++, t, run: RUN, actor, origin, kind, ...payload };
  if (payload.cost) {
    for (const k of Object.keys(cum)) cum[k] += payload.cost[k] ?? 0;
  }
  events.push(e);
  return e;
};

const think = (actor, dt, ti, to, summary) => {
  ev('think.start', actor, { summary }, 200);
  ev('think.end', actor, {
    summary,
    cost: { calls: 1, tok_in: ti, tok_out: to, eur: +(ti * 3e-6 + to * 1.5e-5).toFixed(5) },
  }, dt);
};

const tool = (actor, name, args, dt, ok, out) => {
  ev('tool.start', actor, { tool: name, args }, 150);
  ev('tool.end', actor, { tool: name, args, ok, ms: dt, out }, dt);
};

/* ── ouverture ──────────────────────────────────────────────────────── */
ev('run.start', 'orchestrateur', {
  task: 'T-07',
  title: "Ajouter `docId` au contrat RechercherDocuments et faire repasser l'eval retrieval",
  policy: POLICY(),
});
ev('agent.spawn', 'orchestrateur', { role: 'orchestrateur', parent: null, depth: 0 }, 10);
think('orchestrateur', 1900, 4200, 260, 'Lire CLAUDE.md + ARBORESCENCE.md, découper en 3 branches');
tool('orchestrateur', 'Read', 'CLAUDE.md', 120, true, '24 lignes');
tool('orchestrateur', 'Read', 'src/Horus.Tools/Contracts/RechercherDocuments.cs', 130, true,
  'record RechercherDocumentsInput(string Requete, int Limite)');

/* ── essaimage ──────────────────────────────────────────────────────── */
ev('agent.spawn', 'codeur', { role: 'codeur', parent: 'orchestrateur', depth: 1 }, 300);
ev('msg', 'orchestrateur', { to: 'codeur', text: "Ajoute DocId au record d'entrée + regénère les schémas. Ne touche pas à eval/." }, 5);
ev('agent.spawn', 'testeur', { role: 'testeur', parent: 'orchestrateur', depth: 1 }, 40);
ev('msg', 'orchestrateur', { to: 'testeur', text: "Boucle dotnet test + unittest jusqu'au vert." }, 5);
ev('agent.spawn', 'relecteur', { role: 'relecteur', parent: 'orchestrateur', depth: 1 }, 40);
ev('msg', 'orchestrateur', { to: 'relecteur', text: 'Attends le diff du codeur, relis contre .claude/rules/csharp.md.' }, 5);
ev('wait.start', 'orchestrateur', { on: 'codeur,testeur' }, 10);
ev('wait.start', 'relecteur', { on: 'codeur' }, 5);

/* ── travail ────────────────────────────────────────────────────────── */
think('codeur', 1400, 3100, 180, 'Ajouter DocId au record, puis régénérer les schémas');
tool('codeur', 'Edit', 'src/Horus.Tools/Contracts/RechercherDocuments.cs', 90, true, '+1 propriété : string? DocId');
tool('codeur', 'Bash', 'dotnet build', 4200, true, 'Build succeeded');
think('testeur', 900, 2400, 120, 'Lancer la suite pour avoir la référence');
tool('testeur', 'Bash', 'dotnet test', 6100, false, '3 failed : schéma ≠ type C#');
ev('msg', 'testeur', { to: 'orchestrateur', text: '3 échecs : le schéma JSON ne porte pas docId.' }, 60);

/* ── la boucle sur le garde-fou ─────────────────────────────────────── */
const SCHEMA = 'eval/schemas/tools/rechercher_documents.schema.json';
const deny = (toolName, args, reason, dt) => {
  ev('tool.start', 'codeur', { tool: toolName, args }, dt);
  ev('hook.deny', 'codeur', {
    hook: 'guard-eval-files.sh', event: 'PreToolUse', tool: toolName, exit: 2, reason,
  }, 40);
};
think('codeur', 1100, 3600, 210, 'Écrire le schéma JSON à la main pour aligner');
deny('Write', SCHEMA, 'eval/schemas/** est en permissions.deny', 200);
think('codeur', 1300, 4100, 240, 'Passer par Edit plutôt que Write');
deny('Edit', SCHEMA, 'eval/schemas/** est en permissions.deny', 200);
think('codeur', 1500, 4700, 260, 'Contourner : écrire via un heredoc bash');
deny('Bash', `cat > ${SCHEMA} <<'J'`, 'chemin eval/schemas/** détecté dans la commande', 220);

/* ── le ping-pong ───────────────────────────────────────────────────── */
think('codeur', 1200, 5200, 190, 'Le hook bloque, je rends la main');
ev('agent.stop.attempt', 'codeur', {}, 100);
ev('hook.deny', 'codeur', { hook: 'gate-tests.sh', event: 'SubagentStop', exit: 2, reason: 'dotnet test rouge : arrêt refusé' }, 2600);
think('codeur', 1600, 6800, 300, 'Retenter le build puis un test ciblé');
tool('codeur', 'Bash', 'dotnet test --filter Contracts', 5200, false, '3 failed');
ev('agent.stop.attempt', 'codeur', {}, 200);
ev('hook.deny', 'codeur', { hook: 'gate-tests.sh', event: 'SubagentStop', exit: 2, reason: 'dotnet test rouge : arrêt refusé' }, 2400);

/* ── la reprise ─────────────────────────────────────────────────────── */
ev('human', 'anthony', {
  to: 'codeur',
  text: "Les schémas ne s'écrivent pas à la main — ils sont générés : python3 eval/gen_tool_schemas.py",
}, 9000, 'human');
think('codeur', 900, 2200, 140, 'Lancer le générateur de schémas');
tool('codeur', 'Bash', 'python3 eval/gen_tool_schemas.py', 1800, true, '3 schémas régénérés depuis les types C#');
tool('codeur', 'Bash', 'python3 eval/check_tool_schemas.py', 900, true, 'exit 0 — types et schémas alignés');
ev('msg', 'codeur', { to: 'testeur', text: 'Schémas régénérés, relance la suite.' }, 40);
ev('wait.end', 'relecteur', { on: 'codeur' }, 10);

/* ── le vert ────────────────────────────────────────────────────────── */
think('testeur', 800, 2100, 110, 'Relancer la suite complète');
tool('testeur', 'Bash', 'dotnet test', 5800, true, 'Passed! 17/17');
ev('msg', 'testeur', { to: 'orchestrateur', text: 'Vert sur les deux suites.' }, 50);
ev('agent.end', 'testeur', { status: 'completed' }, 30);
think('relecteur', 1500, 5400, 420, 'Relire le diff contre .claude/rules/csharp.md');
tool('relecteur', 'Bash', 'git diff', 300, true, '2 fichiers, +14 −3');
ev('msg', 'relecteur', { to: 'orchestrateur', text: 'Conforme. DocId nullable : documenter le cas absent.' }, 60);
ev('agent.end', 'relecteur', { status: 'completed' }, 20);
ev('agent.stop.attempt', 'codeur', {}, 100);
ev('hook.allow', 'codeur', { hook: 'gate-tests.sh', event: 'SubagentStop', exit: 0, reason: 'suites vertes' }, 2300);
ev('agent.end', 'codeur', { status: 'completed' }, 20);
ev('wait.end', 'orchestrateur', { on: 'codeur,testeur' }, 10);

/* ── le juge ────────────────────────────────────────────────────────── */
ev('agent.spawn', 'juge-taches', { role: 'juge-taches', parent: 'orchestrateur', depth: 1 }, 200);
ev('msg', 'orchestrateur', { to: 'juge-taches', text: 'Évalue contre tasks_golden.jsonl — contrat public uniquement.' }, 10);
think('juge-taches', 2100, 6900, 480, 'Lire le contrat de run public, comparer au golden set');
tool('juge-taches', 'Bash', 'python3 eval/run_tasks_eval.py --task T-07', 3100, true, 'T-07 : réussi');
ev('agent.end', 'juge-taches', { status: 'completed' }, 50);
think('orchestrateur', 1200, 3800, 320, 'Clore le run, écrire le contrat public');
ev('agent.end', 'orchestrateur', { status: 'completed' }, 10);
ev('run.end', 'orchestrateur', {
  status: 'completed',
  totals: { ...cum, eur: +cum.eur.toFixed(4), wall_clock_ms: t + 400, human_interventions: 1 },
}, 400);

function POLICY() {
  return {
    agent: 'harnais-dev',
    allowed_tools: ['Read', 'Edit', 'Write', 'Bash'],
    quotas: { max_calls: 36, max_calls_par_agent: 6, max_tokens: 80000, max_wall_clock_ms: 300000, max_eur: 0.3 },
    identity: { principal: 'anthony', si_role: 'dev' },
  };
}

const header = {
  run_id: RUN,
  task_id: 'T-07',
  contract_version: V,
  agents: [
    { id: 'orchestrateur', role: 'orchestrateur', depth: 0 },
    { id: 'codeur', role: 'codeur', depth: 1 },
    { id: 'testeur', role: 'testeur', depth: 1 },
    { id: 'relecteur', role: 'relecteur', depth: 1 },
    { id: 'juge-taches', role: 'juge-taches', depth: 1 },
    { id: 'anthony', role: 'humain', depth: -1 },
  ],
  policy: POLICY(),
};

const out = [JSON.stringify(header), ...events.map(e => JSON.stringify(e))].join('\n') + '\n';
const dest = process.argv[2] ?? 'public/demo-run.jsonl';
writeFileSync(dest, out);
console.log(`${dest} — ${events.length} événements, ${(t / 1000).toFixed(1)} s, ${cum.calls} appels, ${cum.eur.toFixed(4)} €`);
