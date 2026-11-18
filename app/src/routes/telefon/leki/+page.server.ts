import { getDb } from '#lib/server/db/index.js';
import { medsAdmin, medsSummary } from '#lib/server/meds.js';
import { getSetting } from '#lib/server/sync.js';
import { localParts } from '#lib/logic/dates.js';
import { moduleConfig } from '#lib/modules/index.js';
import { medsSettings } from '#lib/modules/meds/index.js';

export function load() {
	const db = getDb();
	const now = new Date();
	const today = localParts(now).date;
	return { today, ...medsSummary(db, today, now, moduleConfig(medsSettings, getSetting(db, 'modules'), 'meds')), ...medsAdmin(db, today) };
}
