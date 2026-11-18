import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { adjustPantry } from '#lib/server/pantry.js';

export const POST = ({ request }) => handle(request, (b) => adjustPantry(getDb(), b));
