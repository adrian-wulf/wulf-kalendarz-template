import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { markDone } from '#lib/server/care.js';
import { localParts } from '#lib/logic/dates.js';

// Z kiosku i telefonu zawsze „dziś” – inna data tylko w panelu.
export const POST = ({ request }) => handle(request, (b) => markDone(getDb(), { id: b.id }, localParts(new Date()).date));
