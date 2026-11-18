import { getDb } from '#lib/server/db/index.js';
import { countdownItems } from '#lib/server/countdown.js';
import { localParts } from '#lib/logic/dates.js';

export function load() {
	return { items: countdownItems(getDb(), localParts(new Date()).date) };
}
