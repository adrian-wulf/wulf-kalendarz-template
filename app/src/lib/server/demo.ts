import type { CalEvent, ShoppingItem, Weather } from '#lib/types.js';
import type { Pickup, WasteRule } from '#lib/logic/waste.js';
import { addDays, localTime } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';

/**
 * Dane przykładowe dla rozwoju i testów wizualnych, liczone względem `today`.
 * Zastępowane przez prawdziwe źródła w kolejnych zadaniach.
 */
/** Osoby z przykładowych wydarzeń (domownicy z `seedMembers`). */
const DEMO_MEMBERS = ['tata', 'mama', 'babcia', 'wujek', 'ola', 'kuba'];

/**
 * Przykładowe wydarzenia; z `memberIds` osoby spoza bazy (np. po kreatorze z własnymi imionami)
 * dostają po kolei prawdziwych domowników, żeby przykład miał ich kolory.
 */
export function demoEvents(today: string, memberIds?: readonly string[]): CalEvent[] {
	const list = demoEventsRaw(today);
	if (!memberIds?.length) return list;
	const map = (id: string | null) => (id === null || memberIds.includes(id) ? id : memberIds[DEMO_MEMBERS.indexOf(id) % memberIds.length] ?? null);
	return list.map((e) => ({ ...e, memberId: map(e.memberId) }));
}

function demoEventsRaw(today: string): CalEvent[] {
	const at = (dayOffset: number, hh: number, mm = 0) => localTime(addDays(today, dayOffset), hh, mm).toISOString();
	const ev = (
		id: string,
		memberId: string | null,
		title: string,
		d: number,
		from: [number, number] | null,
		to: [number, number] | null = null,
		extra: Partial<CalEvent> = {}
	): CalEvent =>
		from
			? { id, memberId, title, kind: 'event', allDay: false, start: at(d, ...from), end: at(d, ...(to ?? [from[0] + 1, from[1]])), ...extra }
			: { id, memberId, title, kind: 'event', allDay: true, start: addDays(today, d), end: addDays(today, d + 1), ...extra };

	return [
		ev('e1', 'tata', t('demo.e1'), 0, [10, 0], [11, 30]),
		ev('e2', 'mama', t('demo.e2'), 0, [12, 0], [18, 0]),
		ev('e3', 'ola', t('demo.e3'), 0, [16, 0], [18, 0], { location: t('demo.location') }),
		ev('e4', 'babcia', t('demo.e4'), 1, [10, 0]),
		ev('e5', 'mama', t('demo.e2'), 2, [11, 0], [19, 0]),
		ev('e6', 'kuba', t('demo.e6'), 2, [9, 30]),
		ev('e7', 'tata', t('demo.e7'), 3, [8, 0]),
		ev('e8', 'wujek', t('demo.e8'), 4, [6, 45]),
		ev('e9', 'babcia', t('demo.e9'), 5, [11, 15]),
		ev('e10', null, t('demo.e10'), 6, null, null, { kind: 'kita' }),
		ev('e11', 'mama', t('demo.e2'), 6, [10, 0], [16, 0]),
		ev('e12', null, t('demo.e12'), 7, [18, 0], [21, 0]),
		ev('e13', 'ola', t('demo.e13'), 3, [15, 30])
	];
}

/** Przykładowe wywozy z pierwszych czterech pojemników z aktualnych reguł. */
export function demoPickups(today: string, rules: WasteRule[]): Pickup[] {
	const unique = rules.filter((r, i) => rules.findIndex((x) => x.bin === r.bin) === i);
	return [1, 4, 6, 7].flatMap((d, i) =>
		unique[i] ? [{ date: addDays(today, d), kind: unique[i].bin, label: unique[i].label, color: unique[i].color }] : []
	);
}

export function demoWeather(today: string): Weather {
	const codes = [3, 61, 0, 2, 45, 1, 80];
	return {
		now: { temp: 9, code: 3 },
		days: codes.map((code, i) => ({ date: addDays(today, i), code, max: 9 + (i % 3), min: 3 + (i % 2) }))
	};
}

export function demoShopping(): ShoppingItem[] {
	return [
		{ id: 's1', name: t('demo.s1'), icon: '🥛' },
		{ id: 's2', name: t('demo.s2'), icon: '🍞' },
		{ id: 's3', name: t('demo.s3'), spec: 'gouda', icon: '🧀' },
		{ id: 's4', name: t('demo.s4'), icon: '🍌' },
		{ id: 's5', name: t('demo.s5'), spec: t('demo.s5spec'), icon: '🥚' },
		{ id: 's6', name: t('demo.s6'), spec: t('demo.s6spec'), icon: '🧷' },
		{ id: 's7', name: t('demo.s7'), icon: '☕' }
	];
}
