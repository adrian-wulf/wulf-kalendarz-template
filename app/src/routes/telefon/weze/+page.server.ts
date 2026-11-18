import { getDb } from '#lib/server/db/index.js';
import { snakesData } from '#lib/server/snakes.js';
import { localParts } from '#lib/logic/dates.js';

export const load = () => snakesData(getDb(), localParts(new Date()).date);
