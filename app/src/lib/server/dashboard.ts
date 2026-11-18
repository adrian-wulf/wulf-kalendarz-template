import { asc } from 'drizzle-orm';
import type { DB } from './db';
import { members } from './db/schema';
import type { CalEvent, Dashboard, SourceStatus, TaskItem } from '#lib/types.js';
import { addDays, localParts } from '#lib/logic/dates.js';
import { phaseAt } from '#lib/logic/schedule.js';
import { getSetting, readCache } from './sync.js';
import { isConnected, REAUTH_MSG, type GoogleData } from './google.js';
import { activeServers } from '#lib/modules/registry.server.js';
import type { DashboardCtx } from '#lib/modules/server-types.js';
// --- 26a: calendar layers ---
import { applyLayers, hiddenToday, kioskLayers, resolveLayers, visibleOn, type Surface } from './calendars.js';

/** Zakres danych: dziś + 5 tygodni (nawigacja tygodniami na kiosku). */
const DAYS_AHEAD = 36;

/**
 * Składa wszystko, co pokazuje ekran główny, na chwilę `at` – tylko z aktywnych modułów.
 * `surface`: kiosk (warstwy widoczne na kiosku, bez ukrytych do północy) albo telefon.
 */
export function buildDashboard(db: DB, at: Date, surface: Surface = 'kiosk'): Dashboard {
	const { date: today, minutes } = localParts(at);
	const until = addDays(today, DAYS_AHEAD);
	const ctx: DashboardCtx = { db, at, today, minutes, until, modules: getSetting(db, 'modules') };

	const events: CalEvent[] = [];
	const tasks: TaskItem[] = [];
	const sources: Record<string, SourceStatus> = {};
	const modules: Record<string, unknown> = {};
	const enabled: string[] = [];
	for (const { manifest, server } of activeServers(db)) {
		enabled.push(manifest.id);
		const part = server.dashboard?.(ctx);
		if (!part) continue;
		if ('data' in part) modules[manifest.id] = part.data;
		events.push(...(part.events ?? []));
		tasks.push(...(part.tasks ?? []));
		Object.assign(sources, part.status);
	}

	// Kalendarze: ukryte warstwy znikają, reszta dostaje kolor i ikonę kalendarza.
	const layers = resolveLayers(db);
	const hidden = surface === 'kiosk' ? hiddenToday(db, today) : new Set<string>();
	const memberList = db
		.select()
		.from(members)
		.orderBy(asc(members.sortOrder))
		.all()
		.map(({ id, name, color, avatar }) => ({ id, name, color, avatar }));
	const holidaysLayer = layers.find((l) => l.id === 'holidays');
	const publicHolidays = enabled.includes('holidays') && (!holidaysLayer || visibleOn(holidaysLayer, surface, hidden));
	const holidaysData = modules.holidays as { today: string | null } | undefined;
	if (holidaysData && !publicHolidays) modules.holidays = { ...holidaysData, today: null };

	// „Offline”, gdy pogoda (najczęściej odświeżane źródło) nie odświeża się od ponad godziny.
	const weather = sources.weather;
	const weatherAge = weather?.fetchedAt ? at.getTime() - Date.parse(weather.fetchedAt) : 0;
	const google = isConnected(db) ? readCache<GoogleData>(db, 'google') : null;

	return {
		now: at.toISOString(),
		today,
		phase: phaseAt(at, getSetting(db, 'schedule')),
		members: memberList,
		enabled,
		// Godzinowe: także trwające od kilku dni (nocna zmiana, wyjazd) – liczy się koniec, nie początek.
		events: applyLayers(
			events.filter((e) => e.start.slice(0, 10) < until && (e.allDay ? e.end > today : e.end.slice(0, 10) >= addDays(today, -1))),
			layers,
			surface,
			hidden
		),
		tasks,
		modules,
		sources,
		offlineSince: weather && !weather.ok && weatherAge > 3_600_000 ? weather.fetchedAt : null,
		googleReauth: !!google && !google.status.ok && google.status.error === REAUTH_MSG,
		calendars: kioskLayers(db, layers, hidden, memberList),
		publicHolidays
	};
}
