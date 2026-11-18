import { getDb } from '#lib/server/db/index.js';
import { pantryData } from '#lib/server/pantry.js';
import { localParts } from '#lib/logic/dates.js';

export const load = () => pantryData(getDb(), localParts(new Date()).date);
