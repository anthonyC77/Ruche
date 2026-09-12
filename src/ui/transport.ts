/**
 * LES COMMANDES DVD
 *
 * Rien ici ne connaît la 3D : le transport pilote un Playhead, point.
 * C'est pour ça qu'on peut brancher un lecteur en tableau ou en terminal
 * sur exactement le même moteur.
 */

import type { Playhead, Timeline } from '../core/timeline.js';
import type { RunEvent } from '../core/events.js';

const INCIDENTS: RunEvent['kind'][] = ['flag', 'hook.deny'];

export interface TransportElements {
  play: HTMLButtonElement;
  stepF: HTMLButtonElement;
  stepB: HTMLButtonElement;
  prevFlag: HTMLButtonElement;
  nextFlag: HTMLButtonElement;
  scrub: HTMLInputElement;
  rates: NodeListOf<HTMLButtonElement>;
}

/**
 * Renvoie de quoi se défaire : charger un autre run remonte tout, et un
 * écouteur clavier oublié à chaque chargement finirait par répondre dix fois.
 */
export function wireTransport(
  el: TransportElements, tl: Timeline, ph: Playhead, onChange: () => void
): () => void {
  el.scrub.max = String(tl.last);

  const sync = (): void => {
    el.play.textContent = ph.playing ? '⏸' : '▶';
    el.play.setAttribute('aria-label', ph.playing ? 'Pause' : 'Lire');
    el.scrub.value = String(ph.cursor);
    for (const b of el.rates) b.classList.toggle('on', Number(b.dataset['rate']) === ph.rate);
    onChange();
  };

  el.play.onclick = () => {
    if (ph.cursor >= tl.last && ph.rate > 0) ph.seek(0);
    ph.playing = !ph.playing;
    sync();
  };
  el.stepF.onclick = () => { ph.playing = false; ph.seek(Math.floor(ph.cursor) + 1); sync(); };
  el.stepB.onclick = () => { ph.playing = false; ph.seek(Math.floor(ph.cursor) - 1); sync(); };
  el.nextFlag.onclick = () => { ph.playing = false; ph.seek(tl.next(ph.cursor, INCIDENTS) ?? tl.last); sync(); };
  el.prevFlag.onclick = () => { ph.playing = false; ph.seek(tl.prev(ph.cursor, INCIDENTS) ?? 0); sync(); };
  el.scrub.oninput = () => { ph.playing = false; ph.seek(Number(el.scrub.value)); sync(); };
  for (const b of el.rates) {
    b.onclick = () => { ph.rate = Number(b.dataset['rate']); ph.playing = true; sync(); };
  }

  const clavier = (e: KeyboardEvent): void => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); el.play.click(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); el.stepF.click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); el.stepB.click(); }
  };
  addEventListener('keydown', clavier);

  sync();
  return () => removeEventListener('keydown', clavier);
}
