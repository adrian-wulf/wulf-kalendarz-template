import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { undoDone } from '#lib/server/care.js';

export const POST = ({ request }) => handle(request, (b) => undoDone(getDb(), b));
