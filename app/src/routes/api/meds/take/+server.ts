import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { takeDose } from '#lib/server/meds.js';
import { localParts } from '#lib/logic/dates.js';

export const POST = ({ request }) => handle(request, (b) => takeDose(getDb(), b, localParts(new Date()).date));
