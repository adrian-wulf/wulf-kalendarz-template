import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { saveCountdown } from '#lib/server/countdown.js';

/** Nowe odliczanie (telefon): `{ title, emoji, date, yearly }`. */
export const POST = ({ request }) => handle(request, (b) => saveCountdown(getDb(), b));
