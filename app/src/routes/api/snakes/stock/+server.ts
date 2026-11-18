import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { adjustStock } from '#lib/server/snakes.js';

export const POST = ({ request }) => handle(request, (b) => adjustStock(getDb(), b));
