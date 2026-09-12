/**
 * LES SOURCES
 *
 * Règle non négociable du temps réel : LE TACHYMÈTRE NE FREINE JAMAIS LA
 * VOITURE. Le lecteur s'abonne au journal, pas aux agents. S'il prend du
 * retard — réseau lent, trente spectateurs, onglet en arrière-plan — on
 * saute des images. On ne met jamais un agent en attente d'un affichage.
 *
 * D'où le tampon circulaire borné ci-dessous et le `flush` par lot.
 */

import { assertWellFormed } from './events.js';
import type { RunEvent, RunFile } from './events.js';

/** Un run enregistré : en-tête JSON + une ligne JSON par événement. */
export function parseJsonl(text: string): RunFile {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) throw new Error('journal vide');

  const header = JSON.parse(lines[0]!) as Omit<RunFile, 'events'>;
  const events = lines.slice(1).map(l => JSON.parse(l) as RunEvent);
  assertWellFormed(events);
  return { ...header, events };
}

export async function loadRun(url: string): Promise<RunFile> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return parseJsonl(await res.text());
}

export interface LiveOptions {
  /** Taille max du tampon. Au-delà, on jette les PLUS ANCIENS non affichés. */
  buffer?: number;
  /** Période de vidage, en ms. Un lot par image d'affichage suffit. */
  flushMs?: number;
}

/**
 * Flux temps réel par SSE. Côté serveur : un endpoint qui republie le journal
 * append-only, pas les agents eux-mêmes.
 *
 *   GET /api/runs/{id}/stream   →  text/event-stream, un événement par ligne
 *
 * Le direct n'est alors qu'« un rejeu dont le curseur est collé à la fin » :
 * même moteur, un booléen de plus.
 */
export class LiveSource {
  private es: EventSource | null = null;
  private queue: RunEvent[] = [];
  private timer: number | null = null;
  private dropped = 0;

  constructor(
    private readonly url: string,
    private readonly onBatch: (events: RunEvent[], dropped: number) => void,
    private readonly opts: LiveOptions = {}
  ) {}

  start(): void {
    const max = this.opts.buffer ?? 2000;
    this.es = new EventSource(this.url);
    this.es.onmessage = (m) => {
      try {
        this.queue.push(JSON.parse(m.data) as RunEvent);
        if (this.queue.length > max) {
          this.dropped += this.queue.length - max;
          this.queue = this.queue.slice(-max);
        }
      } catch { /* une ligne illisible ne doit pas tuer le flux */ }
    };
    this.timer = window.setInterval(() => {
      if (this.queue.length === 0) return;
      const batch = this.queue;
      this.queue = [];
      const d = this.dropped;
      this.dropped = 0;
      this.onBatch(batch, d);
    }, this.opts.flushMs ?? 100);
  }

  stop(): void {
    this.es?.close();
    if (this.timer !== null) window.clearInterval(this.timer);
    this.es = null;
    this.timer = null;
  }
}
