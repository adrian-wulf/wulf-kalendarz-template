import { addDays } from './dates';

/**
 * Terminy wywozu wpisywane ręcznie dla całego roku naraz (gdy gmina daje tylko PDF albo aplikację):
 * seria „pierwszy wywóz + co N tygodni do dnia X” albo lista dat wklejona z harmonogramu.
 * Ta sama logika liczy podgląd w przeglądarce i zapis na serwerze.
 */

/** Najwięcej terminów z jednego wpisu (rok co tydzień = 53). */
export const MAX_SERIES = 120;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Czy `YYYY-MM-DD` to prawdziwa data (bez 31.02). */
export function isRealDate(d: string): boolean {
	if (!DATE.test(d)) return false;
	const [y, m, day] = d.split('-').map(Number);
	const x = new Date(Date.UTC(y, m - 1, day));
	return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === day;
}

/** Dzień tygodnia 0 = niedziela … 6 = sobota. */
export const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Który to raz ten dzień tygodnia w miesiącu (1–5). */
export const nthInMonth = (d: string) => Math.floor((Number(d.slice(8, 10)) - 1) / 7) + 1;

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** N-ty dzień tygodnia w miesiącu; 5. może nie istnieć – wtedy ostatni. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
	const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
	let day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
	const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
	while (day > days) day -= 7;
	return iso(y, m, day);
}

export interface Series {
	/** pierwszy wywóz (wyznacza też dzień tygodnia) */
	first: string;
	/** ostatni dzień zakresu (włącznie) */
	to: string;
	/** co ile tygodni (1–4); 0 = raz w miesiącu, ten sam dzień tygodnia (np. 2. wtorek) */
	every: number;
}

/** Terminy serii od `first` do `to` włącznie (najwyżej MAX_SERIES). Błędne dane → pusta lista. */
export function seriesDates({ first, to, every }: Series): string[] {
	if (!isRealDate(first) || !isRealDate(to) || to < first || !Number.isInteger(every) || every < 0 || every > 4) return [];
	const out: string[] = [];
	if (every === 0) {
		const wd = weekdayOf(first);
		const n = nthInMonth(first);
		let y = Number(first.slice(0, 4));
		let m = Number(first.slice(5, 7));
		for (let d = first; d <= to && out.length < MAX_SERIES; ) {
			if (d >= first) out.push(d);
			m += 1;
			if (m > 12) [m, y] = [1, y + 1];
			d = nthWeekday(y, m, wd, n);
		}
		return out;
	}
	for (let d = first; d <= to && out.length < MAX_SERIES; d = addDays(d, every * 7)) out.push(d);
	return out;
}

/** Miesiące po pierwszych trzech literach (PL, DE, EN; bez znaków diakrytycznych). */
const MONTHS: Record<string, number> = {
	sty: 1, lut: 2, mar: 3, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, paz: 10, lis: 11, gru: 12,
	jan: 1, jae: 1, feb: 2, mae: 3, apr: 4, mai: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dez: 12,
	may: 5, oct: 10, dec: 12
};
const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

const fold = (s: string) =>
	s
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ł/g, 'l')
		.normalize('NFD')
		.replace(/\p{M}/gu, '');

/** Miesiąc z linii: słowo („styczeń”, „Januar”, „stycznia”) albo liczba rzymska na początku („III: 5, 19”). */
function monthOf(line: string): number | null {
	for (const w of fold(line).match(/\p{L}{3,}/gu) ?? []) {
		const m = MONTHS[w.slice(0, 3)];
		if (m) return m;
	}
	const r = fold(line).match(/^\s*([ivx]{1,4})\b\s*[:.\-–)]?/);
	return r ? (ROMAN[r[1]] ?? null) : null;
}

const FULL = /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/g;

export interface ParsedList {
	/** poprawne daty (posortowane, bez powtórzeń) */
	dates: string[];
	/** fragmenty, których nie udało się odczytać */
	bad: string[];
}

/**
 * Daty przepisane z harmonogramu: jedna lub wiele w linii, rozdzielone przecinkiem, średnikiem lub spacją.
 * Rozumie `12.01.2027`, `12.01.`, `12/01`, `2027-01-12` oraz linie z miesiącem: `styczeń: 12, 26`,
 * `Januar 12 26`, `III – 5, 19`. Bez roku w tekście – rok z parametru `year`.
 */
export function parseDateList(text: string, year: number): ParsedList {
	const dates = new Set<string>();
	const bad: string[] = [];
	const add = (y: number, m: number, d: number, raw: string) => {
		const full = iso(y < 100 ? 2000 + y : y, m, d);
		if (isRealDate(full)) dates.add(full);
		else bad.push(raw.trim());
	};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line) continue;
		const full = [...line.matchAll(FULL)];
		if (full.length) {
			for (const f of full) {
				if (f[1]) add(Number(f[1]), Number(f[2]), Number(f[3]), f[0]);
				else add(f[6] ? Number(f[6]) : year, Number(f[5]), Number(f[4]), f[0]);
			}
			continue;
		}
		const month = monthOf(line);
		const days = (line.replace(/^\s*[ivxIVX]{1,4}\b/, '').match(/\b\d{1,2}\b/g) ?? []).map(Number);
		if (month && days.length) for (const d of days) add(year, month, d, `${d} (${line})`);
		else bad.push(line);
	}
	return { dates: [...dates].sort(), bad };
}
