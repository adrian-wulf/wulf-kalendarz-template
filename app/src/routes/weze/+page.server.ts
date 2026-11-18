import { getDb } from '#lib/server/db/index.js';
import { getSetting } from '#lib/server/sync.js';
import { snakesData } from '#lib/server/snakes.js';
import { localParts } from '#lib/logic/dates.js';
import { phaseAt } from '#lib/logic/schedule.js';

export function load() {
	const db = getDb();
	const now = new Date();
	return { ...snakesData(db, localParts(now).date), phase: phaseAt(now, getSetting(db, 'schedule')) };
}
