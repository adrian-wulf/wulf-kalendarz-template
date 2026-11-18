import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { untakeDose } from '#lib/server/meds.js';

export const POST = ({ request }) => handle(request, (b) => untakeDose(getDb(), b));
