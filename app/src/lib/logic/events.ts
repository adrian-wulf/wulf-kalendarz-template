import type { CalEvent } from '#lib/types.js';
import { localParts } from './dates';

const KIND_ORDER: Record<CalEvent['kind'], number> = { ferien: 0, kita: 1, birthday: 2, event: 3, waste: 4 };

/**
 * Wydarzenie w danym dniu. Godzinowe trwające kilka dni (np. nocna zmiana 22:00–06:00) ma `part`:
 * `first` – dzień rozpoczęcia, `middle` – cały dzień w trakcie, `last` – dzień zakończenia („do 06:00”).
 */
export type DayEvent = CalEvent & { part?: 'first' | 'middle' | 'last' };

/** Lokalne daty pierwszego i ostatniego dnia wydarzenia godzinowego (koniec jest wyłączny: 00:00 nie zajmuje dnia). */
export function timedSpan(e: CalEvent): { first: string; last: string } {
	const start = Date.parse(e.start);
	const end = Math.max(Date.parse(e.end) - 1, start);
	return { first: localParts(new Date(start)).date, last: localParts(new Date(end)).date };
}

/** Wydarzenia przypadające na dany dzień: całodniowe najpierw, potem trwające od wczoraj, potem wg godziny. */
export function eventsOnDay(events: CalEvent[], date: string): DayEvent[] {
	const out: DayEvent[] = [];
	for (const e of events) {
		if (e.allDay) {
			if (e.start <= date && date < e.end) out.push(e);
			continue;
		}
		const { first, last } = timedSpan(e);
		if (date < first || date > last) continue;
		out.push(first === last ? e : { ...e, part: date === first ? 'first' : date === last ? 'last' : 'middle' });
	}
	// Trwające od poprzedniego dnia zaczynają się w tym dniu o północy – przed pozostałymi godzinowymi.
	const key = (e: DayEvent) => (e.part === 'middle' || e.part === 'last' ? '' : e.start);
	return out.sort((a, b) => {
		if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
		if (a.allDay) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
		return key(a).localeCompare(key(b)) || a.start.localeCompare(b.start);
	});
}
