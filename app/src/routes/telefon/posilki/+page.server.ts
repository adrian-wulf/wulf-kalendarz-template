import { getDb } from '#lib/server/db/index.js';
import { mealsData, missingFor } from '#lib/server/meals.js';
import { localParts } from '#lib/logic/dates.js';

export function load() {
	const db = getDb();
	const today = localParts(new Date()).date;
	return { meals: mealsData(db, today, 7), missing: missingFor(db, today) };
}
