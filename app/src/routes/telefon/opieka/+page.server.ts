import { getDb } from '#lib/server/db/index.js';
import { careData } from '#lib/server/care.js';
import { localParts } from '#lib/logic/dates.js';

export function load() {
	const today = localParts(new Date()).date;
	return { today, items: careData(getDb(), today) };
}
