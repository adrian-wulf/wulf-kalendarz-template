/**
 * Odliczanie – czysta logika. Wszystko na datach kalendarzowych ('YYYY-MM-DD') w strefie regionu,
 * więc zmiana czasu (23 albo 25 godzin w dobie) nie przesuwa licznika.
 */
import { daysBetween, localParts } from './dates.js';
import { birthdayParts } from './profiles.js';

export interface CountdownDef {
	id: number | string;
	title: string;
	emoji: string;
	date: string;
	yearly: boolean;
	memberId: string | null;
}

export interface Countdown extends CountdownDef {
	/** najbliższe wystąpienie (dla `yearly` – w tym albo przyszłym roku) */
	next: string;
	/** dni do `next` (0 = dziś) */
	days: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Ta sama data w danym roku; 29 lutego w zwykłym roku → 28 lutego. */
export function inYear(date: string, year: number): string {
	const md = date.slice(5);
	return `${year}-${md === '02-29' && !isLeap(year) ? '02-28' : md}`;
}

/** Najbliższe wystąpienie od `today` (włącznie); jednorazowe po terminie → null. */
export function nextOccurrence(c: Pick<CountdownDef, 'date' | 'yearly'>, today: string): string | null {
	if (!c.yearly) return c.date >= today ? c.date : null;
	const y = Number(today.slice(0, 4));
	const thisYear = inYear(c.date, y);
	return thisYear >= today ? thisYear : inYear(c.date, y + 1);
}

/** Dni do daty liczone od dzisiejszej daty w strefie `tz` w chwili `at` (odporne na zmianę czasu). */
export const daysLeft = (target: string, at: Date, tz?: string) => daysBetween(localParts(at, tz).date, target);

/** Nadchodzące odliczania, najbliższe najpierw. */
export function upcoming(list: CountdownDef[], today: string, limit = Infinity): Countdown[] {
	return list
		.flatMap((c) => {
			const next = nextOccurrence(c, today);
			return next ? [{ ...c, next, days: daysBetween(today, next) }] : [];
		})
		.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title))
		.slice(0, limit);
}

/**
 * Urodziny domowników (pole `members.birthday` z profilu: 'YYYY-MM-DD' albo '--MM-DD' bez roku) jako odliczania.
 * Zły albo pusty zapis – pomijany. Rok bez znaczenia (co roku), dla zapisu bez roku bierzemy przestępny 2000,
 * żeby 29 lutego przeszedł (`inYear` przesuwa go na 28 lutego w zwykłym roku).
 */
export function birthdayCountdowns(members: { id: string; name: string; birthday?: string | null }[], title: (name: string) => string): CountdownDef[] {
	return members.flatMap((m) => {
		const p = birthdayParts(m.birthday);
		if (!p) return [];
		const date = `${p.year ?? 2000}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
		return [{ id: `bday:${m.id}`, title: title(m.name), emoji: '🎂', date, yearly: true, memberId: m.id }];
	});
}

/**
 * Własne odliczanie urodzin domownika (np. z danych przykładowych albo dodane ręcznie przed wpisaniem daty
 * w profilu) i urodziny z profilu w tym samym dniu – zostaje jedno, własne.
 */
export function withoutDuplicateBirthdays(own: CountdownDef[], birthdays: CountdownDef[]): CountdownDef[] {
	const taken = new Set(own.filter((c) => c.memberId && c.yearly).map((c) => `${c.memberId}:${c.date.slice(5)}`));
	return birthdays.filter((b) => !taken.has(`${b.memberId}:${b.date.slice(5)}`));
}
