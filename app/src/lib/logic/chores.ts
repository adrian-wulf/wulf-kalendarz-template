import type { Recurrence } from '#lib/server/db/schema.js';
import { addDays, isoWeekday } from './dates';

export interface ChoreDef {
	id: number;
	title: string;
	memberId: string | null;
	recurrence: Recurrence;
	startDate: string;
}

export interface OpenChore {
	choreId: number;
	title: string;
	memberId: string | null;
	dueDate: string;
	overdue: boolean;
}

function lastDayOfMonth(date: string): number {
	const [y, m] = date.split('-').map(Number);
	return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function occursOn(r: Recurrence, startDate: string, date: string): boolean {
	if (date < startDate) return false;
	switch (r.type) {
		case 'once':
			return r.date === date;
		case 'daily':
			return true;
		case 'weekly':
			return r.days.includes(isoWeekday(date));
		case 'monthly': {
			// Dzień 31 w krótszym miesiącu przypada na ostatni dzień miesiąca.
			const day = Number(date.slice(8));
			return day === Math.min(r.day, lastDayOfMonth(date));
		}
	}
}

const LOOKBACK_DAYS = 31;

/**
 * Zadania do pokazania dziś: najnowsze wystąpienie (≤ dziś) każdego zadania,
 * jeśli nie zostało odhaczone. Starsze, pominięte wystąpienia nie mnożą się.
 */
export function openChores(defs: ChoreDef[], done: Set<string>, today: string): OpenChore[] {
	const result: OpenChore[] = [];
	for (const c of defs) {
		const lookback = c.recurrence.type === 'once' ? 3650 : LOOKBACK_DAYS;
		for (let i = 0; i <= lookback; i++) {
			const d = addDays(today, -i);
			if (d < c.startDate) break;
			if (c.recurrence.type === 'once' && c.recurrence.date > today) break;
			if (!occursOn(c.recurrence, c.startDate, d)) continue;
			if (!done.has(completionKey(c.id, d))) {
				result.push({ choreId: c.id, title: c.title, memberId: c.memberId, dueDate: d, overdue: d < today });
			}
			break;
		}
	}
	return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export const completionKey = (choreId: number, dueDate: string) => `${choreId}:${dueDate}`;

/** Wystąpienia zadań w najbliższych dniach (od jutra), bez odhaczonych – podgląd na telefonie. */
export function upcomingChores(defs: ChoreDef[], done: Set<string>, today: string, days = 7): OpenChore[] {
	const result: OpenChore[] = [];
	for (let i = 1; i <= days; i++) {
		const d = addDays(today, i);
		for (const c of defs)
			if (occursOn(c.recurrence, c.startDate, d) && !done.has(completionKey(c.id, d)))
				result.push({ choreId: c.id, title: c.title, memberId: c.memberId, dueDate: d, overdue: false });
	}
	return result;
}

/** Najbliższy nieodhaczony termin zadania (od dziś), np. do panelu. */
export function nextDue(c: ChoreDef, done: Set<string>, today: string, horizon = 400): string | null {
	for (let i = 0; i <= horizon; i++) {
		const d = addDays(today, i);
		if (c.recurrence.type === 'once' && d > c.recurrence.date) return null;
		if (occursOn(c.recurrence, c.startDate, d) && !done.has(completionKey(c.id, d))) return d;
	}
	return null;
}
