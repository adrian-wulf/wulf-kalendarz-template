import { addDays, daysBetween } from './dates';
import type { Lang } from '#lib/i18n/index.js';

/**
 * Profile domowników: awatar (emoji albo zdjęcie), urodziny z odliczaniem, odmiana imienia
 * („Urodziny Oli”, „Olas Geburtstag”, „Ola's birthday”). Czysta logika – serwer i przeglądarka.
 */

/** Zdjęcie leży pod `/media/avatars/…`; wszystko inne w polu `avatar` to emoji. */
export const isPhotoAvatar = (a: string | null | undefined): a is string => !!a && a.startsWith('/media/avatars/');

const FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
const NO_YEAR = /^--(\d{2})-(\d{2})$/;

export interface BirthdayParts {
	year: number | null;
	month: number;
	day: number;
}

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Urodziny z zapisu ('YYYY-MM-DD' albo '--MM-DD'); zły zapis → null. */
export function birthdayParts(b: string | null | undefined): BirthdayParts | null {
	if (!b) return null;
	const full = FULL.exec(b);
	const m = full ?? NO_YEAR.exec(b);
	if (!m) return null;
	const [year, month, day] = full ? [Number(m[1]), Number(m[2]), Number(m[3])] : [null, Number(m[1]), Number(m[2])];
	if (month < 1 || month > 12 || day < 1 || day > DAYS_IN[month - 1]) return null;
	return { year, month, day };
}

/** Zapis urodzin z pola daty panelu; `noYear` – rok nieznany (zapis '--MM-DD'). Puste → null. */
export function normalizeBirthday(date: string, noYear: boolean): string | null | undefined {
	if (!date) return null;
	const p = birthdayParts(date) ?? birthdayParts(`--${date.slice(-5)}`);
	if (!p) return undefined; // błąd
	const mmdd = `${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
	return noYear || p.year === null ? `--${mmdd}` : `${p.year}-${mmdd}`;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Dzień urodzin w danym roku; 29 lutego w roku nieprzestępnym obchodzimy 28 lutego. */
export function birthdayIn(p: BirthdayParts, year: number): string {
	const day = p.month === 2 && p.day === 29 && !isLeap(year) ? 28 : p.day;
	return `${year}-${String(p.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface NextBirthday {
	date: string;
	/** dni do urodzin (0 = dziś) */
	days: number;
	/** ile lat kończy; null, gdy rok nieznany */
	age: number | null;
}

/** Najbliższe urodziny od `today` (włącznie). */
export function nextBirthday(b: string | null | undefined, today: string): NextBirthday | null {
	const p = birthdayParts(b);
	if (!p) return null;
	const y = Number(today.slice(0, 4));
	let date = birthdayIn(p, y);
	if (date < today) date = birthdayIn(p, y + 1);
	const year = Number(date.slice(0, 4));
	return { date, days: daysBetween(today, date), age: p.year !== null && p.year <= year ? year - p.year : null };
}

/** Wszystkie urodziny w zakresie [from, until) – zwykle rok albo dwa lata. */
export function birthdaysBetween(b: string | null | undefined, from: string, until: string): { date: string; age: number | null }[] {
	const p = birthdayParts(b);
	if (!p) return [];
	const out: { date: string; age: number | null }[] = [];
	for (let y = Number(from.slice(0, 4)); y <= Number(until.slice(0, 4)); y++) {
		const date = birthdayIn(p, y);
		if (date >= from && date < until && (p.year === null || y >= p.year)) out.push({ date, age: p.year === null ? null : y - p.year });
	}
	return out;
}

export interface UpcomingBirthday extends NextBirthday {
	memberId: string;
}

/** Urodziny domowników w ciągu `within` dni (dziś też), od najbliższych. */
export function upcomingBirthdays(members: readonly { id: string; birthday: string | null }[], today: string, within: number): UpcomingBirthday[] {
	return members
		.map((m) => ({ memberId: m.id, next: nextBirthday(m.birthday, today) }))
		.filter((x) => x.next && x.next.days <= within)
		.map((x) => ({ memberId: x.memberId, ...x.next! }))
		.sort((a, b) => a.days - b.days || a.memberId.localeCompare(b.memberId));
}

/** Koniec zakresu odliczania – do testów i dashboardu. */
export const countdownUntil = (today: string, days: number) => addDays(today, days + 1);

// --- odmiana imienia ---

/**
 * Dopełniacz imienia po polsku: najpierw forma najbardziej prawdopodobna, potem inne możliwe
 * (do porównania z listą imienin). Reguły dla typowych imion: Ola → Oli, Ania → Ani, Maria → Marii,
 * Agnieszka → Agnieszki, Maja → Mai, Alicja → Alicji, Marek → Marka, Paweł → Pawła, Jerzy → Jerzego,
 * Antoni → Antoniego, Mieszko → Mieszka, Kacper → Kacpra, Adam → Adama.
 */
export function genitivePlForms(name: string): string[] {
	const n = name.trim();
	if (!n) return [];
	const lower = n.toLocaleLowerCase('pl');
	const cut = (k: number) => n.slice(0, n.length - k);
	const has = (re: RegExp) => re.test(lower);
	let forms: string[];
	if (has(/[kg]a$/)) forms = [cut(1) + 'i'];
	else if (has(/(si|zi|ci|dzi)a$/)) forms = [cut(1), cut(1) + 'i'];
	else if (has(/nia$/)) forms = n.length <= 5 ? [cut(1), cut(1) + 'i'] : [cut(1) + 'i', cut(1)];
	else if (has(/ia$/)) forms = [cut(1) + 'i'];
	else if (has(/[aeiouyó]ja$/)) forms = [cut(2) + 'i'];
	else if (has(/ja$/)) forms = [cut(1) + 'i'];
	else if (has(/la$/)) forms = [cut(1) + 'i'];
	else if (has(/a$/)) forms = [cut(1) + 'y'];
	else if (has(/ko$/)) forms = [cut(1) + 'a'];
	else if (has(/o$/)) forms = [n + 'na', cut(1) + 'a'];
	else if (has(/y$/)) forms = [cut(1) + 'ego'];
	else if (has(/i$/)) forms = [n + 'ego'];
	else if (has(/ek$/)) forms = [cut(2) + 'ka', n + 'a'];
	else if (has(/eł$/)) forms = [cut(2) + 'ła'];
	else if (has(/niec$/)) forms = [cut(4) + 'ńca', cut(2) + 'ca'];
	else if (has(/ec$/)) forms = [cut(2) + 'ca', n + 'a'];
	else if (has(/[dp]er$/)) forms = [cut(2) + 'ra', n + 'a'];
	else forms = [n + 'a'];
	return [...new Set(forms)];
}

export const genitivePl = (name: string) => genitivePlForms(name)[0] ?? name;

/** Forma „czyje” do zdań o urodzinach: PL dopełniacz, DE „Olas” / „Jonas’”, EN „Ola's”. */
export function possessive(name: string, lang: Lang): string {
	const n = name.trim();
	if (lang === 'pl') return genitivePl(n);
	if (lang === 'de') return /[sßxz]$/i.test(n) ? `${n}’` : `${n}s`;
	return `${n}’s`;
}
