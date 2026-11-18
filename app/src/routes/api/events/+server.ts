import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { addEvent } from '#lib/server/store.js';

export const POST = ({ request }) => handle(request, (b) => addEvent(getDb(), b));
