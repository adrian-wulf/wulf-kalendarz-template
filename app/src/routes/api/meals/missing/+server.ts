import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { addMissing, missingFor } from '#lib/server/meals.js';
import { localParts } from '#lib/logic/dates.js';

const today = () => localParts(new Date()).date;

/** Brakujące składniki do dań od dziś (liczba dni z ustawień modułu). */
export const GET = () => handle(null, () => missingFor(getDb(), today()));

/** Dopisanie wybranych braków do listy zakupów: `{ names: string[] }`. */
export const POST = ({ request }) => handle(request, (b) => addMissing(getDb(), today(), b.names));
