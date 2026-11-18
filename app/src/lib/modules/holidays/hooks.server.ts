import { getSetting, readCache } from '#lib/server/sync.js';
import { ferienTitle, schoolHolidaysSource } from '#lib/server/sources/index.js';
import { holidayOn } from '#lib/logic/holidays.js';
import type { CalEvent } from '#lib/types.js';
import { defineServer } from '../server-types.js';

export default defineServer('holidays', {
	sources: (db) => [schoolHolidaysSource(getSetting(db, 'region'))],
	dashboard: ({ db, today }) => {
		const ferien = readCache<CalEvent[]>(db, 'ferien');
		return { data: { today: holidayOn(today)?.name ?? null }, events: (ferien.data ?? []).map((e) => ({ ...e, title: ferienTitle(e.title) })), status: { ferien: ferien.status } };
	}
});
