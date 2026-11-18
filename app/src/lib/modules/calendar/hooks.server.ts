import { asc } from 'drizzle-orm';
import { localEvents, members } from '#lib/server/db/schema.js';
import { seedMembers } from '#lib/server/db/seed.js';
import { fetchGoogle, isConnected, type GoogleData } from '#lib/server/google.js';
import { getSetting, readCache } from '#lib/server/sync.js';
import { demoEvents } from '#lib/server/demo.js';
import { localParts } from '#lib/logic/dates.js';
import type { CalEvent, SourceStatus } from '#lib/types.js';
import type { DB } from '#lib/server/db/index.js';
import type { Source } from '#lib/server/sources/index.js';
// --- 26a: calendar layers ---
import { subscriptions } from '#lib/server/calendars.js';
import { subscriptionSource } from '#lib/server/sources/subscription.js';
import { defineServer } from '../server-types.js';

function googleSource(db: DB): Source<GoogleData> {
	return {
		name: 'google',
		intervalMs: 60_000,
		fetch: (f, now) => fetchGoogle(db, db.select().from(members).orderBy(asc(members.sortOrder)).all(), localParts(now).date, now, f)
	};
}

export default defineServer('calendar', {
	seed: seedMembers,
	// Google i subskrypcje iCal (każda subskrypcja to osobne źródło z własnym rytmem odświeżania).
	sources: (db) => [...(isConnected(db) ? [googleSource(db)] : []), ...subscriptions(db).map(subscriptionSource)],
	dashboard: ({ db, today }) => {
		const google = isConnected(db) ? readCache<GoogleData>(db, 'google') : null;
		const local: CalEvent[] = db
			.select()
			.from(localEvents)
			.all()
			.map(({ uid: _uid, location, description, ...e }) => ({ ...e, kind: 'event', ...(location ? { location } : {}), ...(description ? { description } : {}) }));
		const fromGoogle = google ? (google.data?.events ?? []) : getSetting(db, 'demoData') ? demoEvents(today, db.select().from(members).orderBy(asc(members.sortOrder)).all().map((m) => m.id)) : [];
		const status: Record<string, SourceStatus> = google ? { google: google.status } : {};
		const subs: CalEvent[] = [];
		for (const s of subscriptions(db)) {
			const c = readCache<CalEvent[]>(db, s.id);
			subs.push(...(c.data ?? []));
			status[s.id] = c.status;
		}
		return { events: [...fromGoogle, ...local, ...subs], status };
	}
});
