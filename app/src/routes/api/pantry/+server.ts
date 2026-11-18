import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { addPantry } from '#lib/server/pantry.js';
import { localParts } from '#lib/logic/dates.js';

export const POST = ({ request }) => handle(request, (b) => addPantry(getDb(), b, localParts(new Date()).date));
