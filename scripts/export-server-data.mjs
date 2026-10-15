import { mkdir, writeFile } from 'node:fs/promises';
import { cards } from '../src/deck.js';
import { SPREADS, TOPICS } from '../src/engine.js';

const directory = new URL('../server/render/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('tarot_data.json', directory), `${JSON.stringify({ cards, spreads: SPREADS, topics: TOPICS }, null, 2)}\n`);
console.log(`Exported ${cards.length} cards and ${SPREADS.length} spreads for the Render backend.`);
