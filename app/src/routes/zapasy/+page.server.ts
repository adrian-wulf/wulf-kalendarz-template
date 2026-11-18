import { getDb } from '#lib/server/db/index.js';
import { getSetting } from '#lib/server/sync.js';
import { pantryData } from '#lib/server/pantry.js';
import { localParts } from '#lib/logic/dates.js';
import { phaseAt } from '#lib/logic/schedule.js';

export function load() {
	const db = getDb();
	const now = new Date();
	return { ...pantryData(db, localParts(now).date), phase: phaseAt(now, getSetting(db, 'schedule')) };
}
