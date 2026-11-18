import type { CalEvent, Weather } from '#lib/types.js';
import { addDays, localParts, localZone } from '#lib/logic/dates.js';
import { ruleFor, type Pickup, type WasteRule } from '#lib/logic/waste.js';
import type { Region } from '#lib/region.js';
import { parseIcal } from './ical';
import { getLang, t, type TextKey } from '#lib/i18n/index.js';

export type Fetcher = typeof fetch;

export interface Source<T> {
	name: string;
	intervalMs: number;
	fetch(f: Fetcher, now: Date): Promise<T>;
}

async function getJson(f: Fetcher, url: string): Promise<unknown> {
	const res = await f(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} z ${new URL(url).host}`);
	return res.json();
}

async function getText(f: Fetcher, url: string): Promise<string> {
	const res = await f(url, { signal: AbortSignal.timeout(15_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} z ${new URL(url).host}`);
	return res.text();
}

export function weatherSource(lat: number, lon: number): Source<Weather> {
	return {
		name: 'weather',
		intervalMs: 30 * 60_000,
		async fetch(f) {
			const url =
				`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
				'&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min' +
				`&timezone=${encodeURIComponent(localZone())}&forecast_days=8`;
			const d = (await getJson(f, url)) as {
				current: { temperature_2m: number; weather_code: number };
				daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
			};
			return {
				now: { temp: d.current.temperature_2m, code: d.current.weather_code },
				days: d.daily.time.map((date, i) => ({
					date,
					code: d.daily.weather_code[i],
					max: d.daily.temperature_2m_max[i],
					min: d.daily.temperature_2m_min[i]
				}))
			};
		}
	};
}

/**
 * Nazwy ferii z API (niemieckie dla DE, polskie dla PL) → klucz słownika. W pamięci podręcznej
 * zostaje nazwa z API, a tłumaczenie dzieje się przy wyświetlaniu – zmiana języka działa od razu.
 */
const FERIEN_KEYS: Record<string, TextKey> = {
	Herbstferien: 'ferien.autumn',
	Weihnachtsferien: 'ferien.christmas',
	Halbjahresferien: 'ferien.winter',
	Winterferien: 'ferien.winter',
	Frühjahrsferien: 'ferien.spring',
	Osterferien: 'ferien.easter',
	Pfingstferien: 'ferien.whitsun',
	Sommerferien: 'ferien.summer',
	Halbjahrespause: 'ferien.winter',
	Fastnachtsferien: 'ferien.carnival',
	'Buß- und Bettag': 'ferien.repentance',
	'Ferie zimowe': 'ferien.winter',
	'Ferie letnie': 'ferien.summer',
	'Wiosenna przerwa świąteczna': 'ferien.easterBreak',
	'Zimowa przerwa świąteczna': 'ferien.christmasBreak'
};

/**
 * Pojedyncze dni wolne od szkoły w landach (pełna lista nazw z /SchoolHolidays DE 2026–2027, 11.2026).
 * Po niemiecku zostaje nazwa z API (mówi więcej), w innych językach – „dzień wolny od szkoły”.
 */
const DAY_OFF = new Set([
	'Himmelfahrt',
	'Tag nach Himmelfahrt',
	'Zusätzlicher Ferientag',
	'Unterrichtsfreier Tag',
	'Schulfreier Tag',
	'Variabler Ferientag',
	'Beweglicher Ferientag',
	'Reformationsfest',
	'Gründonnerstag'
]);

/** Nazwa ferii w bieżącym języku (nieznana – tak, jak podało API). */
export function ferienTitle(raw: string): string {
	if (FERIEN_KEYS[raw]) return t(FERIEN_KEYS[raw]);
	if (DAY_OFF.has(raw)) return getLang() === 'de' ? raw : t('ferien.dayOff');
	return raw || t('ferien.generic');
}

/**
 * Ferie szkolne z OpenHolidays API dla kraju i landu/województwa (np. DE-NI, PL-MZ).
 * Nazwy w języku kraju (API nie ma innych); tłumaczy je `ferienTitle` przy wyświetlaniu.
 */
export function schoolHolidaysSource(region: Pick<Region, 'country' | 'subdivision'> = { country: 'DE', subdivision: 'DE-NI' }): Source<CalEvent[]> {
	return {
		name: 'ferien',
		intervalMs: 24 * 3_600_000,
		async fetch(f, now) {
			const from = `${now.getUTCFullYear()}-01-01`;
			const to = `${now.getUTCFullYear() + 1}-12-31`;
			const url =
				`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=${region.country}&subdivisionCode=${encodeURIComponent(region.subdivision)}` +
				`&languageIsoCode=${region.country}&validFrom=${from}&validTo=${to}`;
			const d = (await getJson(f, url)) as { id: string; startDate: string; endDate: string; name: { text: string }[] }[];
			return d.map((h) => ({
				id: `ferien-${h.id}`,
				title: h.name[0]?.text ?? '',
				start: h.startDate,
				end: addDays(h.endDate, 1), // API podaje dzień końcowy włącznie
				allDay: true,
				memberId: null,
				kind: 'ferien'
			}));
		}
	};
}

/** Terminy wywozu z iCal wg reguł „słowo w tytule → pojemnik”; wydarzenia bez pasującej reguły są pomijane. */
export function pickupsFromIcal(text: string, rules: readonly WasteRule[]): Pickup[] {
	const seen = new Set<string>();
	const pickups: Pickup[] = [];
	for (const e of parseIcal(text)) {
		const r = ruleFor(e.summary, rules);
		if (!r) continue;
		// Czas UTC (…Z) → dzień lokalny; data i czas „pływający” – dzień jak w pliku.
		const date = e.start.endsWith('Z') ? localParts(new Date(e.start)).date : e.start.slice(0, 10);
		if (seen.has(`${date}:${r.bin}`)) continue;
		seen.add(`${date}:${r.bin}`);
		pickups.push({ date, kind: r.bin, label: r.label, color: r.color });
	}
	return pickups.sort((a, b) => a.date.localeCompare(b.date));
}

/** Terminy wywozu z kalendarza iCal: adres URL albo plik wgrany w panelu (Abfuhrkalender, harmonogram gminy). */
export function wasteSource(source: { url: string } | { text: string }, rules: readonly WasteRule[]): Source<Pickup[]> {
	return {
		name: 'waste',
		intervalMs: 12 * 3_600_000,
		async fetch(f) {
			return pickupsFromIcal('url' in source ? await getText(f, source.url) : source.text, rules);
		}
	};
}
