import { getDb } from '#lib/server/db/index.js';
import { handle } from '#lib/server/api.js';
import { addSnakeEvent } from '#lib/server/snakes.js';
import { localParts } from '#lib/logic/dates.js';

export const POST = ({ request }) => handle(request, (b) => addSnakeEvent(getDb(), { ...b, date: undefined }, localParts(new Date()).date));
