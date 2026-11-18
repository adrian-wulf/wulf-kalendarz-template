import { describe, expect, it } from 'vitest';
import { weatherSource, schoolHolidaysSource } from './sources/index';
import { searchPlaces } from './setup';
import { setLang } from '#lib/i18n/index.js';
import { setTimeZone } from '#lib/logic/dates.js';
import { publicHolidays } from '#lib/logic/holidays.js';
import { SUBDIVISIONS } from '#lib/region.js';
import { catalogUrl } from './bring';
import { hafasDepartures, searchStops } from './transit/hafas';
import { HAFAS_URLS } from '#lib/modules/transit/index.js';

/**
 * Testy na PRAWDZIWYCH publicznych usługach (Open-Meteo, OpenHolidays, transport.rest, Bring!).
 * Domyślnie pomijane; uruchomienie: `LIVE=1 npx vitest run src/lib/server/live.test.ts`.
 * Kilka zapytań na usługę, bez pętli – szanujemy publiczne API.
 */
const live = describe.skipIf(!process.env.LIVE);
const T = { timeout: 60_000 };
const now = new Date();
const Y = now.getUTCFullYear();

async function json(url: string) {
	const r = await fetch(url, { headers: { accept: 'application/json' } });
	expect(r.ok, `${url} → HTTP ${r.status}`).toBe(true);
	return r.json();
}

live('Open-Meteo', T, () => {
	it('prognoza Hannover (Europe/Berlin) i Poznań (Europe/Warsaw)', async () => {
		for (const [lat, lon, tz] of [
			[52.37, 9.73, 'Europe/Berlin'],
			[52.41, 16.93, 'Europe/Warsaw']
		] as const) {
			setTimeZone(tz);
			const w = await weatherSource(lat, lon).fetch(fetch, now);
			expect(w.days).toHaveLength(8);
			expect(Number.isFinite(w.now.temp)).toBe(true);
			expect(w.days[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			// pierwszy dzień prognozy = dziś w strefie regionu
			expect(w.days[0].date).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now));
			console.log(tz, JSON.stringify(w.now), w.days.slice(0, 2));
		}
		setTimeZone('Europe/Berlin');
	});

	it('geokodowanie jak w kreatorze (pl/de/en, countryCode)', async () => {
		for (const [lang, q, cc] of [
			['pl', 'Poznań', 'PL'],
			['de', 'Hannover', 'DE'],
			['en', 'Warszawa', 'PL'],
			['pl', 'Poznan', 'PL'],
			['de', 'München', 'DE']
		] as const) {
			setLang(lang);
			const r = await searchPlaces(q, cc);
			console.log(lang, q, cc, r.slice(0, 2));
			expect(r.length).toBeGreaterThan(0);
		}
		setLang('pl');
	});
});

live('OpenHolidays', T, () => {
	it('ferie szkolne DE-NI, DE-BY, PL-MZ, PL-WP (bieżący i następny rok)', async () => {
		for (const sub of ['DE-NI', 'DE-BY', 'PL-MZ', 'PL-WP']) {
			const ev = await schoolHolidaysSource({ country: sub.slice(0, 2) as 'DE' | 'PL', subdivision: sub }).fetch(fetch, now);
			const years = new Set(ev.map((e) => e.start.slice(0, 4)));
			console.log(sub, ev.length, [...years], ev.map((e) => `${e.start}..${e.end} ${e.title}`).join(' | '));
			expect(ev.length).toBeGreaterThan(2);
		}
	});

	it('kody województw/landów z aplikacji = kody z /Subdivisions', async () => {
		for (const c of ['PL', 'DE'] as const) {
			const d = (await json(`https://openholidaysapi.org/Subdivisions?countryIsoCode=${c}&languageIsoCode=${c}`)) as {
				code: string;
				name: { text: string }[];
				children?: { code: string }[];
			}[];
			const api = new Map(d.map((s) => [s.code, s.name[0]?.text]));
			console.log(c, [...api].map(([k, v]) => `${k}=${v}`).join(', '));
			const ours = SUBDIVISIONS[c].map((s) => s.code);
			for (const code of ours) expect(api.has(code), code).toBe(true);
			// nazwa z API vs nazwa w aplikacji (PL)
			if (c === 'PL') {
				setLang('pl');
				const bad = SUBDIVISIONS.PL.filter((s) => !api.get(s.code)?.toLowerCase().includes(s.name.toLowerCase().replace(/^woj\. /, '').slice(0, 5)));
				console.log('PL nazwy niezgodne:', bad.map((s) => `${s.code} app=${s.name} api=${api.get(s.code)}`));
				expect(bad).toEqual([]);
			}
		}
	});

	it('święta liczone w aplikacji = święta z OpenHolidays (PL + 16 landów, 2026–2027)', async () => {
		const mismatches: string[] = [];
		for (const c of ['PL', 'DE'] as const) {
			const d = (await json(
				`https://openholidaysapi.org/PublicHolidays?countryIsoCode=${c}&languageIsoCode=${c}&validFrom=2026-01-01&validTo=2027-12-31`
			)) as { startDate: string; endDate: string; name: { text: string }[]; nationwide: boolean; subdivisions?: { code: string }[] }[];
			for (const s of SUBDIVISIONS[c]) {
				const api = new Set<string>();
				for (const h of d) {
					if (!h.nationwide && !h.subdivisions?.some((x) => x.code === s.code || s.code.startsWith(x.code + '-') || x.code.startsWith(s.code + '-')))
						continue;
					// część landu (np. DE-BY-AU, DE-SN-…) – zaznaczamy osobno
					const partial = !h.nationwide && !h.subdivisions?.some((x) => x.code === s.code);
					api.add(`${h.startDate}${partial ? '*' : ''} ${h.name[0]?.text}`);
				}
				const ours = new Set([2026, 2027].flatMap((y) => publicHolidays(y, { country: c, subdivision: s.code }, c === 'PL' ? 'pl' : 'de').map((h) => h.date)));
				const apiFull = new Set([...api].filter((x) => !x.includes('*')).map((x) => x.slice(0, 10)));
				// Świadomie pominięte (święto tylko w części landu, patrz logic/holidays.ts): 15.08 w Bawarii
				// (ok. 1700 z 2056 gmin) – OpenHolidays podaje je dla całego DE-BY.
				const known = (x: string) => s.code === 'DE-BY' && x.slice(5, 10) === '08-15';
				const missing = [...api].filter((x) => !x.includes('*') && !ours.has(x.slice(0, 10)) && !known(x));
				const extra = [...ours].filter((x) => !apiFull.has(x));
				const partial = [...api].filter((x) => x.includes('*'));
				if (missing.length || extra.length) mismatches.push(`${s.code}: brak u nas ${JSON.stringify(missing)}, nadmiarowe ${JSON.stringify(extra)}`);
				if (partial.length) console.log(`${s.code} tylko część regionu:`, partial);
			}
		}
		console.log('NIEZGODNOŚCI:', mismatches);
		expect(mismatches).toEqual([]);
	});
});

live('Bring! katalog', T, () => {
	it('pl-PL, de-DE, en-GB', async () => {
		for (const lang of ['pl', 'de', 'en'] as const) {
			const d = (await json(catalogUrl(lang))) as Record<string, unknown>;
			const strings = Object.entries(d).filter(([, v]) => typeof v === 'string');
			console.log(lang, catalogUrl(lang), Object.keys(d).length, 'kluczy,', strings.length, 'tekstowych;', strings.slice(0, 3), 'Milch=', d['Milch']);
			expect(d['Milch']).toBeTypeOf('string');
		}
	});
});

live('transport.rest (HAFAS)', T, () => {
	it('VBB: Alexanderplatz + odjazdy', async () => {
		const hits = await searchStops(fetch, HAFAS_URLS.vbb, 'Alexanderplatz');
		console.log(hits.slice(0, 3));
		expect(hits.length).toBeGreaterThan(0);
		const deps = await hafasDepartures(fetch, HAFAS_URLS.vbb, hits[0].id, 10);
		console.log(deps.slice(0, 4));
		expect(deps.length).toBeGreaterThan(0);
	});

	it('BVG: ta sama odpowiedź co VBB', async () => {
		const hits = await searchStops(fetch, HAFAS_URLS.bvg, 'Alexanderplatz');
		expect(hits.length).toBeGreaterThan(0);
	});

	// v6.db.transport.rest usunięto z listy dostawców (11.2026: brak DNS). Gdyby wrócił – ten test to pokaże.
	it('DB: nadal niedostępne?', async () => {
		const DB = 'https://v6.db.transport.rest';
		try {
			const hits = await searchStops(fetch, DB, 'Hannover Hbf');
			console.log('DB DZIAŁA – można przywrócić dostawcę', hits.slice(0, 2));
		} catch (e) {
			console.log('DB niedostępne:', e instanceof Error ? e.message : e);
		}
	});
});

/**
 * GTFS: plik pobrany ręcznie RAZ (nie w teście), ścieżka w zmiennej, np.
 * `LIVE=1 LIVE_GTFS="/tmp/GTFS_KRK_T.zip|Teatr Bagatela" npx vitest run src/lib/server/live.test.ts -t GTFS`
 */
describe.skipIf(!process.env.LIVE || !process.env.LIVE_GTFS)('GTFS (plik lokalny)', () => {
	it(
		'wyszukiwanie przystanku i odjazdy: czas, pamięć, wiarygodność',
		async () => {
			const { gtfsDepartures, gtfsSearchStops } = await import('./transit/gtfs');
			setTimeZone('Europe/Warsaw');
			for (const spec of process.env.LIVE_GTFS!.split(';')) {
				const [file, query, pick] = spec.split('|');
				let peak = process.memoryUsage().rss;
				const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
				const base = process.memoryUsage().rss;
				let t = performance.now();
				const hits = await gtfsSearchStops(file, query);
				console.log(file, `szukaj „${query}”: ${(performance.now() - t).toFixed(0)} ms`, hits.slice(0, 6));
				const stop = hits.find((h) => !pick || h.id === pick) ?? hits[0];
				t = performance.now();
				const deps = await gtfsDepartures(file, { stopId: stop.id, now });
				const ms = performance.now() - t;
				clearInterval(timer);
				const fmt = (iso: string) => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
				console.log(
					`${stop.id} ${stop.name}: ${deps.length} odjazdów w ${ms.toFixed(0)} ms; RSS ${(base / 2 ** 20).toFixed(0)}→szczyt ${(peak / 2 ** 20).toFixed(0)} MB`,
					deps.slice(0, 8).map((d) => `${fmt(d.plannedWhen)} ${d.line} → ${d.direction}`),
					'po północy:',
					deps.filter((d) => { const h = Number(fmt(d.plannedWhen).slice(-5, -3)); return h < 4; }).slice(0, 5).map((d) => `${fmt(d.plannedWhen)} ${d.line}`)
				);
				const lines = new Map<string, number>();
				for (const d of deps) lines.set(d.line, (lines.get(d.line) ?? 0) + 1);
				console.log('linie:', [...lines].sort((a, b) => b[1] - a[1]).slice(0, 12));
				expect(deps.length).toBeGreaterThan(0);
			}
		},
		300_000
	);
});

/**
 * Kalendarze wywozu: pliki pobrane ręcznie RAZ, ścieżki w zmiennej, np.
 * `LIVE=1 LIVE_ICS="DE:/tmp/ffm.ics;PL:/tmp/gmina.ics" npx vitest run src/lib/server/live.test.ts -t iCal`
 */
describe.skipIf(!process.env.LIVE || !process.env.LIVE_ICS)('iCal wywozu (pliki lokalne)', () => {
	it('parser + gotowe reguły PL/DE: co pasuje, co pominięte', async () => {
		const { readFileSync } = await import('node:fs');
		const { parseIcal } = await import('./sources/ical');
		const { pickupsFromIcal } = await import('./sources/index');
		const { WASTE_PRESETS, ruleFor } = await import('#lib/logic/waste.js');
		for (const spec of process.env.LIVE_ICS!.split(';')) {
			const [country, file] = spec.split(/:(.*)/s) as ['DE' | 'PL', string];
			const text = readFileSync(file, 'utf8');
			const events = parseIcal(text);
			const titles = new Map<string, string>();
			for (const e of events) titles.set(e.summary, ruleFor(e.summary, WASTE_PRESETS[country])?.bin ?? '— brak —');
			const pickups = pickupsFromIcal(text, WASTE_PRESETS[country]);
			console.log(file, `${events.length} wydarzeń → ${pickups.length} wywozów`, Object.fromEntries(titles), pickups.slice(0, 4));
			expect(pickups.length).toBeGreaterThan(0);
		}
	});
});
