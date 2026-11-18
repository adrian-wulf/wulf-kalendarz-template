/**
 * Zadania dzieci – czysta logika: kiedy zadanie jest do zrobienia, okres odhaczenia
 * (dzień albo tydzień), postęp dnia i saldo punktów.
 */
import type { KidRepeat } from '#lib/server/db/schema.js';
import { addDays, isoWeekday } from './dates.js';

export interface KidTask {
	id: number;
	memberId: string;
	title: string;
	emoji: string;
	points: number;
	repeat: KidRepeat;
}

/** Poniedziałek tygodnia, w którym leży `date`. */
export const weekStart = (date: string) => addDays(date, 1 - isoWeekday(date));

/** Czy zadanie jest na liście danego dnia (zadanie tygodniowe – przez cały tydzień, aż do odhaczenia). */
export function kidTaskOn(r: KidRepeat, date: string): boolean {
	if (r.type === 'days') return r.days.includes(isoWeekday(date));
	return r.type === 'daily' || r.type === 'weekly';
}

/** Okres, za który liczy się odhaczenie: dzień, a dla „raz w tygodniu” – poniedziałek tygodnia. */
export const periodOf = (r: KidRepeat, date: string) => (r.type === 'weekly' ? weekStart(date) : date);

export const doneKey = (taskId: number, period: string) => `${taskId}:${period}`;

export interface KidTaskToday extends KidTask {
	period: string;
	done: boolean;
}

export interface KidDay {
	memberId: string;
	tasks: KidTaskToday[];
	done: number;
	total: number;
	/** punkty do zdobycia dziś (z nieodhaczonych) */
	open: number;
}

/**
 * Zadania na dziś dla każdego dziecka (w kolejności `kids`). `done` – klucze `taskId:okres`.
 * Dziecko bez zadań na dziś też jest na liście (pusty postęp).
 */
export function kidsDay(kids: string[], tasks: KidTask[], done: Set<string>, date: string): KidDay[] {
	return kids.map((memberId) => {
		const list = tasks
			.filter((t) => t.memberId === memberId && kidTaskOn(t.repeat, date))
			.map((t) => {
				const period = periodOf(t.repeat, date);
				return { ...t, period, done: done.has(doneKey(t.id, period)) };
			});
		const finished = list.filter((t) => t.done);
		return {
			memberId,
			tasks: list,
			done: finished.length,
			total: list.length,
			open: list.filter((t) => !t.done).reduce((a, t) => a + t.points, 0)
		};
	});
}

/** Postęp 0–1 (pusty dzień = 0, żeby pasek nie udawał sukcesu). */
export const progress = (d: Pick<KidDay, 'done' | 'total'>) => (d.total ? d.done / d.total : 0);

/**
 * Punkty do wydania: suma księgi minus prośby czekające na zgodę (zarezerwowane),
 * żeby dziecko nie poprosiło o więcej, niż ma.
 */
export function balances(ledger: { memberId: string; delta: number }[], pending: { memberId: string; cost: number }[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const e of ledger) out.set(e.memberId, (out.get(e.memberId) ?? 0) + e.delta);
	for (const p of pending) out.set(p.memberId, (out.get(p.memberId) ?? 0) - p.cost);
	return out;
}

export const canAfford = (balance: number, cost: number) => cost > 0 && balance >= cost;

/** Opis powtarzania do sprawdzenia formularza: tylko znane rodzaje i dni 1–7. */
export function checkRepeat(v: unknown): KidRepeat | null {
	if (!v || typeof v !== 'object') return null;
	const r = v as Record<string, unknown>;
	if (r.type === 'daily' || r.type === 'weekly') return { type: r.type };
	if (r.type === 'days' && Array.isArray(r.days)) {
		const days = [...new Set(r.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort();
		return days.length ? { type: 'days', days } : null;
	}
	return null;
}
