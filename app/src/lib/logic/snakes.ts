import { daysBetween } from './dates.js';
import { recurringWindow } from './recurring.js';
import { fmtShortDate } from '#lib/format.js';
import { t, tn } from '#lib/i18n/index.js';

/** Terminy karmienia węży – czysta logika, bez bazy. */

export type SnakeEventType = 'feed' | 'refused' | 'shed' | 'clean' | 'weight';

export interface SnakeEvent {
	id: number;
	type: SnakeEventType;
	date: string;
	food: string | null;
	grams: number | null;
}

export interface SnakeInfo {
	id: string;
	name: string;
	species: string;
	sex: 'M' | 'F' | '?';
	born: string;
	color: string;
	intervalDays: number | null;
	intervalMax: number | null;
	pauseUntil: string | null;
}

/** ok – przed oknem; soon – można karmić (okno); due – koniec okna minął lub dziś; paused – wstrzymane */
export type FeedState = 'due' | 'soon' | 'ok' | 'paused';

export interface SnakeView extends SnakeInfo {
	/** odstęp karmienia w dniach (ręczny albo z historii) – początek okna */
	interval: number;
	/** koniec okna (= interval, gdy bez zakresu) */
	intervalTo: number;
	intervalAuto: boolean;
	lastFeed: string | null;
	lastFood: string | null;
	lastRefused: string | null;
	lastShed: string | null;
	lastClean: string | null;
	lastWeight: { date: string; grams: number } | null;
	/** od kiedy można karmić */
	nextFeed: string | null;
	/** najpóźniej kiedy karmić */
	dueBy: string | null;
	state: FeedState;
	events: SnakeEvent[];
}

export const DEFAULT_INTERVAL = 10;
const SAMPLE = 8; // ile ostatnich odstępów bierzemy pod uwagę

/** Typowy odstęp między karmieniami: mediana ostatnich odstępów (5–45 dni). */
export function feedInterval(events: SnakeEvent[]): number | null {
	const dates = [...new Set(events.filter((e) => e.type === 'feed').map((e) => e.date))].sort();
	const gaps = dates
		.slice(1)
		.map((d, i) => daysBetween(dates[i], d))
		.filter((g) => g > 0)
		.slice(-SAMPLE)
		.sort((a, b) => a - b);
	if (gaps.length < 2) return null;
	const mid = gaps.length / 2;
	const median = gaps.length % 2 ? gaps[Math.floor(mid)] : (gaps[mid - 1] + gaps[mid]) / 2;
	return Math.min(45, Math.max(5, Math.round(median)));
}

const last = (events: SnakeEvent[], type: SnakeEventType) =>
	events.filter((e) => e.type === type).reduce<SnakeEvent | null>((a, e) => (!a || e.date >= a.date ? e : a), null);

export function snakeView(s: SnakeInfo, events: SnakeEvent[], today: string): SnakeView {
	const sorted = [...events].sort((a, b) => (b.date === a.date ? b.id - a.id : b.date.localeCompare(a.date)));
	const auto = feedInterval(events);
	const interval = s.intervalDays ?? auto ?? DEFAULT_INTERVAL;
	const intervalTo = Math.max(interval, s.intervalDays != null ? (s.intervalMax ?? interval) : interval);
	const feed = last(events, 'feed');
	const refused = last(events, 'refused');
	const weight = last(events, 'weight');
	// Po odmowie kolejna próba liczy się od dnia odmowy.
	const attempt = [feed?.date, refused?.date].filter(Boolean).sort().at(-1) ?? null;
	// Okno „co X–Y dni” – wspólne z modułem Opieka (logic/recurring.ts).
	const w = recurringWindow({ last: attempt, min: interval, max: intervalTo, pauseUntil: s.pauseUntil }, today);
	const nextFeed = w.from;
	const dueBy = w.dueBy;
	const state: FeedState = w.state === 'paused' ? 'paused' : w.state === 'due' || w.state === 'overdue' ? 'due' : w.state === 'ok' ? 'ok' : 'soon';
	return {
		...s,
		interval,
		intervalTo,
		intervalAuto: s.intervalDays == null,
		lastFeed: feed?.date ?? null,
		lastFood: [...sorted].find((e) => e.type === 'feed' && e.food)?.food ?? null,
		lastRefused: refused && (!feed || refused.date >= feed.date) ? refused.date : null,
		lastShed: last(events, 'shed')?.date ?? null,
		lastClean: last(events, 'clean')?.date ?? null,
		lastWeight: weight?.grams ? { date: weight.date, grams: weight.grams } : null,
		nextFeed,
		dueBy,
		state,
		events: sorted
	};
}

const short = (d: string) => fmtShortDate(d);

/** „dziś”, „wczoraj”, „5 dni temu” */
export function agoLabel(date: string | null, today: string): string {
	if (!date) return '—';
	const d = daysBetween(date, today);
	if (d <= 0) return t('time.today');
	if (d === 1) return t('time.yesterday');
	return tn('time.daysAgo', d);
}

/** „dziś”, „jutro”, „za 3 dni”, „2 dni po terminie” */
export function untilLabel(date: string | null, today: string): string {
	if (!date) return t('time.today');
	const d = daysBetween(today, date);
	if (d === 0) return t('time.today');
	if (d === 1) return t('time.tomorrow');
	if (d > 1) return tn('time.inDays', d);
	return tn('time.daysOverdue', -d);
}

/** „co ~10 dni”, „co 7–10 dni”, „co 3–4 tyg.” */
export function intervalLabel(s: Pick<SnakeView, 'interval' | 'intervalTo' | 'intervalAuto'>): string {
	const { interval: a, intervalTo: b } = s;
	if (a === b) return t('snakes.every', { n: `${s.intervalAuto ? '~' : ''}${a}` });
	if (a % 7 === 0 && b % 7 === 0 && a >= 14) return t('snakes.everyWeeks', { range: `${a / 7}–${b / 7}` });
	return t('snakes.every', { n: `${a}–${b}` });
}

/** Główna linia karty: „Karmienie za 5–12 dni”, „Można karmić · najpóźniej jutro”, „Karmienie 3 dni po terminie”. */
export function feedLine(s: SnakeView, today: string): string {
	if (s.state === 'paused') return `⏸ ${t('snakes.pausedUntil', { date: short(s.pauseUntil!) })}`;
	if (s.state === 'due') return t('snakes.feeding', { when: untilLabel(s.dueBy, today) });
	if (s.state === 'soon' && s.nextFeed! <= today) {
		const left = daysBetween(today, s.dueBy!);
		return t('snakes.canFeed', { when: left === 1 ? t('time.tomorrow') : tn('time.inDays', left) });
	}
	const a = daysBetween(today, s.nextFeed!);
	const b = daysBetween(today, s.dueBy!);
	if (a === b) return t('snakes.feeding', { when: untilLabel(s.nextFeed, today) });
	return t('snakes.feeding', { when: t('time.inDaysRange', { range: `${a}–${b}` }) });
}

/** Krótka wersja na telefon: „za 5–12 dni”, „można · do 12.11”, „dziś”, „3 dni po terminie”. */
export function feedShort(s: SnakeView, today: string): string {
	if (s.state === 'paused') return `⏸ ${t('snakes.until', { date: short(s.pauseUntil!) })}`;
	if (s.state === 'due') return untilLabel(s.dueBy, today);
	if (s.state === 'soon' && s.nextFeed! <= today) return t('snakes.canFeedShort', { date: short(s.dueBy!) });
	const a = daysBetween(today, s.nextFeed!);
	const b = daysBetween(today, s.dueBy!);
	return a === b ? untilLabel(s.nextFeed, today) : t('time.inDaysRange', { range: `${a}–${b}` });
}
