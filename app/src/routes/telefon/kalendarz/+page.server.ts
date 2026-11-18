import { getDb } from '#lib/server/db/index.js';
import { buildDashboard } from '#lib/server/dashboard.js';
import { chipOf, phoneHidden, resolveLayers } from '#lib/server/calendars.js';
import { addDays } from '#lib/logic/dates.js';

/** Telefon → Kalendarz: najbliższe 2 tygodnie z kalendarzy widocznych na telefonie; wybór kalendarzy per osoba. */
export function load() {
	const db = getDb();
	const d = buildDashboard(db, new Date(), 'phone');
	const until = addDays(d.today, 14);
	const layers = resolveLayers(db).filter((l) => l.showPhone);
	return {
		events: d.events.filter((e) => e.start.slice(0, 10) < until),
		days: Array.from({ length: 14 }, (_, i) => addDays(d.today, i)),
		calendars: layers.map((l) => chipOf(l, d.members, new Set())),
		/** ukryte w widoku każdej osoby (wybór na telefonie) */
		hiddenBy: Object.fromEntries(d.members.map((m) => [m.id, phoneHidden(db, m.id)])),
		publicHolidays: d.publicHolidays
	};
}
