import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { addShopping } from '#lib/server/store.js';

export const POST = ({ request }) => handle(request, (b) => addShopping(getDb(), b));
