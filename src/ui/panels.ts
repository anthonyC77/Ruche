/** Panneaux HTML. Volontairement en DOM natif : à remplacer par des
 *  composants Angular sans toucher au moteur — c'est le but de la séparation. */

import { STATE_COLOR, STATE_LABEL } from '../view3d/actors.js';
import type { State } from '../core/reducer.js';
import type { Verdict } from '../core/verdicts.js';

const esc = (s: unknown): string =>
  String(s).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!));

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const eur = (v: number): string => v.toFixed(3).replace('.', ',') + ' €';

export interface PanelHandlers {
  onSelectAgent: (id: string) => void;
  onSelectSeq: (seq: number) => void;
}

export function renderAgents(el: HTMLElement, s: State, selected: string | null, maxCalls: number, h: PanelHandlers): void {
  el.innerHTML = Object.values(s.agents).map(a => `
    <button class="agent${selected === a.id ? ' sel' : ''}${a.st === 'absent' ? ' off' : ''}" data-agent="${esc(a.id)}">
      <span class="arow"><b>${esc(a.id)}</b>${a.hand ? '<em class="hand">✋ main levée</em>' : ''}</span>
      <span class="arow small">
        <span class="chip"><i style="background:${hex(STATE_COLOR[a.st])}"></i>${STATE_LABEL[a.st]}</span>
        <span class="num">${a.calls} appels · ${eur(a.eur)}</span>
      </span>
      <span class="gauge"><i style="width:${Math.min(100, (a.calls / maxCalls) * 100).toFixed(0)}%;background:${a.calls / maxCalls > 0.8 ? '#d9503f' : '#e8a33c'}"></i></span>
      <span class="note">${esc(a.note || '—')}</span>
    </button>`).join('');

  for (const b of el.querySelectorAll<HTMLElement>('[data-agent]')) {
    b.onclick = () => h.onSelectAgent(b.dataset['agent']!);
  }
}

export function renderAlert(el: HTMLElement, s: State): void {
  const hands = Object.values(s.agents).filter(a => a.hand);
  const last = s.flags[s.flags.length - 1];
  if (!hands.length || !last) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `
    <b>✋ ${esc(hands.map(a => a.id).join(', '))} — ${esc(last.rule)}</b>
    <p>${esc(last.why)}</p>
    <span class="ev">déclenché par les événements ${last.evidence.join(', ')}</span>`;
}

export function renderLog(el: HTMLElement, s: State, cursor: number, h: PanelHandlers): void {
  const tail = s.log.slice(-30).reverse();
  el.innerHTML = tail.map(e => {
    const cls =
      e.kind === 'hook.deny' ? 'l-deny' :
      e.kind === 'flag' ? 'l-flag' :
      e.kind === 'human' ? 'l-human' :
      e.kind === 'msg' ? 'l-msg' : '';
    const rec = e as unknown as Record<string, unknown>;
    const body = rec['text'] ?? rec['args'] ?? rec['summary'] ?? rec['why'] ?? rec['reason'] ?? rec['title'] ?? '';
    return `<button class="line ${cls}${Math.floor(cursor) === e.seq ? ' now' : ''}" data-seq="${e.seq}">
      <span class="s">${String(e.seq).padStart(2, '0')}</span>
      <span class="a">${esc(e.actor)}</span>
      <span class="k">${esc(e.kind)}</span>
      <span class="b">${esc(body)}</span>
    </button>`;
  }).join('');

  for (const b of el.querySelectorAll<HTMLElement>('[data-seq]')) {
    b.onclick = () => h.onSelectSeq(Number(b.dataset['seq']));
  }
}

/** Le verdict du run courant : couleur sur le badge et sur le titre, raison au survol. */
export function renderVerdict(badge: HTMLElement, task: HTMLElement, v: Verdict | null): void {
  badge.classList.remove('pass', 'fail');
  task.classList.remove('pass', 'fail');
  if (!v) { badge.hidden = true; badge.textContent = ''; badge.title = ''; return; }
  const cls = v.pass ? 'pass' : 'fail';
  badge.hidden = false;
  badge.textContent = v.pass ? '✔ juge : réussi' : '✘ juge : échec';
  badge.title = v.reason;
  badge.classList.add(cls);
  task.classList.add(cls);
}
