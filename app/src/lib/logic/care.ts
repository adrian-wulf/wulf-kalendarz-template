import { daysBetween } from './dates.js';
import { isActionable, recurringWindow, type WindowState } from './recurring.js';
import { t, tn } from '#lib/i18n/index.js';

/**
 * Opieka „co X dni”: rośliny, filtr, odkamienianie, kuweta… Każda pozycja ma odstęp albo okno
 * (od–do dni) i datę ostatniego wykonania. Okno liczy `logic/recurring.ts` (to samo co u węży).
 */

export interface CareItem {
	id: number;
	name: string;
	icon: string;
	minDays: number;
	maxDays: number;
	memberId: string | null;
	pauseUntil: string | null;
}

export interface CareView extends CareItem {
	lastDone: string | null;
	/** ostatni wpis w historii (do cofnięcia) */
	lastLogId: number | null;
	from: string | null;
	dueBy: string | null;
	state: WindowState;
	/** do zrobienia teraz: dziś, po terminie albo w oknie */
	actionable: boolean;
}

export interface CareLog {
	id: number;
	itemId: number;
	date: string;
}

const ORDER: Record<WindowState, number> = { overdue: 0, due: 1, open: 2, soon: 3, ok: 4, paused: 5 };

export function careView(item: CareItem, logs: CareLog[], today: string): CareView {
	const mine = logs.filter((l) => l.itemId === item.id).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
	const lastLog = mine.at(-1) ?? null;
	const w = recurringWindow({ last: lastLog?.date ?? null, min: item.minDays, max: item.maxDays, pauseUntil: item.pauseUntil }, today);
	return { ...item, lastDone: lastLog?.date ?? null, lastLogId: lastLog?.id ?? null, ...w, actionable: isActionable(w.state) };
}

/** Wszystkie pozycje: najpierw po terminie, potem dziś, w oknie, wkrótce… (w grupie – wcześniejszy termin). */
export function careList(items: CareItem[], logs: CareLog[], today: string): CareView[] {
	return items
		.map((i) => careView(i, logs, today))
		.sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.dueBy ?? '').localeCompare(b.dueBy ?? '') || a.name.localeCompare(b.name));
}

/** „co 7 dni”, „co 7–10 dni” */
export function careInterval(i: Pick<CareItem, 'minDays' | 'maxDays'>): string {
	return i.maxDays > i.minDays ? t('care.everyRange', { a: i.minDays, b: i.maxDays }) : tn('care.every', i.minDays);
}

/** Krótki opis stanu: „dziś”, „2 dni po terminie”, „można · do pt”, „za 3 dni”. */
export function careWhen(v: CareView, today: string): string {
	switch (v.state) {
		case 'paused':
			return t('care.paused');
		case 'due':
			return v.lastDone ? t('time.today') : t('care.never');
		case 'overdue':
			return tn('time.daysOverdue', daysBetween(v.dueBy!, today));
		case 'open': {
			const left = daysBetween(today, v.dueBy!);
			return t('care.open', { when: left === 1 ? t('time.tomorrow') : tn('time.inDays', left) });
		}
		default: {
			const d = daysBetween(today, v.from!);
			return d === 1 ? t('time.tomorrow') : tn('time.inDays', d);
		}
	}
}

/** Walidacja okna z formularza: 1–365, „do” ≥ „od” (puste „do” = bez zakresu). */
export function parseWindow(minRaw: unknown, maxRaw: unknown): { minDays: number; maxDays: number } | null {
	const min = Number(minRaw);
	const max = maxRaw === undefined || maxRaw === null || maxRaw === '' ? min : Number(maxRaw);
	if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 365 || max < min) return null;
	return { minDays: min, maxDays: max };
}
