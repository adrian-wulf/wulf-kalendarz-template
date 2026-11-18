import { isoWeekday, localZone } from './logic/dates';
import { getLang, locale, t } from './i18n/index.js';

const cache = new Map<string, Intl.DateTimeFormat>();

/** Formatter w bieżącym języku i strefie z ustawień (tworzony raz na język, strefę i rodzaj). */
function inZone(kind: string, opts: Intl.DateTimeFormatOptions, zone = localZone()): Intl.DateTimeFormat {
	const key = `${kind}|${getLang()}|${zone}`;
	let f = cache.get(key);
	if (!f) cache.set(key, (f = new Intl.DateTimeFormat(locale(), { ...opts, timeZone: zone })));
	return f;
}

/** Data kalendarzowa 'YYYY-MM-DD' jako chwila – formatowana w UTC, więc bez przesunięć strefy. */
const day = (d: string) => new Date(`${d}T12:00:00Z`);
const inUtc = (kind: string, opts: Intl.DateTimeFormatOptions) => inZone(kind, opts, 'UTC');

const upper = (s: string) => (s ? s[0].toLocaleUpperCase(locale()) + s.slice(1) : s);

export const fmtTime = (iso: string | Date) => inZone('time', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Godzina na kafelku wydarzenia w danym dniu: początek; dla trwającego kilka dni – „22:00 →” w dniu
 * rozpoczęcia, „cały dzień” w środku, „do 06:00” w dniu zakończenia. Całodniowe – brak.
 */
export function eventTime(e: { allDay: boolean; start: string; end: string; part?: 'first' | 'middle' | 'last' }): string | null {
	if (e.allDay) return null;
	if (e.part === 'middle') return t('kiosk.allDay');
	if (e.part === 'last') return t('kiosk.until', { time: fmtTime(e.end) });
	return e.part === 'first' ? `${fmtTime(e.start)} →` : fmtTime(e.start);
}

/** „Piątek, 13 listopada” / „Freitag, 13. November” / „Friday 13 November”. */
export function fmtLongDate(at: Date): string {
	return upper(inZone('long', { weekday: 'long', day: 'numeric', month: 'long' }).format(at));
}

/** 'YYYY-MM-DD' → „13 listopada” (bez dnia tygodnia). */
export const fmtDayMonth = (d: string) => inUtc('dm', { day: 'numeric', month: 'long' }).format(day(d));

/** 'YYYY-MM-DD' → „13.11” (krótko, liczbami). */
export const fmtShortDate = (d: string) => inUtc('dmn', { day: 'numeric', month: 'numeric' }).format(day(d));

/** 'YYYY-MM-DD' → „piątek”. */
export const fmtWeekday = (d: string) => inUtc('wd', { weekday: 'long' }).format(day(d));

/** 'YYYY-MM-DD' → { wd: 'Nd', day: 1, weekend: true } – krótki dzień tygodnia ze słownika. */
export function dayHeader(date: string): { wd: string; day: number; weekend: boolean } {
	const n = isoWeekday(date);
	return { wd: weekdaysShort()[n - 1], day: Number(date.slice(8)), weekend: n >= 6 };
}

/** Krótkie nazwy dni od poniedziałku: Pn…Nd / Mo…So / Mon…Sun. */
export const weekdaysShort = () => t('date.weekdaysShort').split(',');

/** Emoji pogody wg kodów WMO (Open-Meteo). */
export function weatherIcon(code: number): string {
	if (code === 0) return '☀️';
	if (code <= 2) return '⛅';
	if (code === 3) return '☁️';
	if (code <= 48) return '🌫️';
	if (code <= 67 || (code >= 80 && code <= 82)) return '🌧️';
	if (code <= 77 || code === 85 || code === 86) return '🌨️';
	return '⛈️';
}

/** '2026-11-13', '2026-11-19' → '13–19 listopada'; przez granicę miesiąca → '28 listopada – 4 grudnia'. */
export function fmtRange(from: string, to: string): string {
	// Intl wstawia wąskie spacje wokół półpauzy – zwykłe spacje jak w reszcie ekranu.
	return inUtc('range', { day: 'numeric', month: 'long' }).formatRange(day(from), day(to)).replace(/[\u2009\u202f]/g, ' ');
}

const monthName = (d: string) => upper(inUtc('month', { month: 'long' }).format(day(d)));

/** Nazwy miesięcy w zakresie: 'Listopad' albo 'Listopad – grudzień'. */
export function fmtMonths(from: string, to: string): string {
	const [a, b] = [monthName(from), monthName(to)];
	if (a === b) return a;
	// W językach z wielkimi literami tylko na początku zdania drugi miesiąc małą literą.
	return `${a} – ${getLang() === 'pl' ? b.toLocaleLowerCase(locale()) : b}`;
}

/** Skrót miesiąca: 'gru' / 'Dez' / 'Dec'. */
export const monthShort = (d: string) => inUtc('mshort', { month: 'short' }).format(day(d)).replace(/\.$/, '');
