import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { toggleKidTask } from '#lib/server/kids.js';
import { localParts } from '#lib/logic/dates.js';

/** Odhaczenie (albo cofnięcie) zadania na dziś: `{ taskId, done? }`. */
export const POST = ({ request }) => handle(request, (b) => toggleKidTask(getDb(), b, localParts(new Date()).date));
