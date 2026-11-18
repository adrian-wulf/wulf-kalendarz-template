import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hafasDepartures, parseDepartures, parseLocations, resetRateLimit, searchStops } from './hafas';
import { gtfsDepartures, gtfsMinutes, gtfsSeconds, gtfsSearchStops, parseCsvLine, productOf, zipEntries } from './gtfs';
import { downloadGtfs, findStops, setStop, transitSource, transitTile, upcoming } from './index';
import { openDb } from '../db/index';
import { setSetting } from '../sync';
import type { Fetcher } from '../sources/index';

const FX = 'src/lib/server/sources/fixtures';
const json = (f: string) => JSON.parse(readFileSync(`${FX}/${f}`, 'utf8'));
const ZIP = `${FX}/gtfs-mini.zip`;

/** Atrapa fetch: zapamiętuje adresy, zwraca podaną odpowiedź (bez sieci). */
function fake(respond: (url: string) => Response) {
	const urls: string[] = [];
	const f = (async (u: string | URL | Request) => {
		urls.push(String(u));
		return respond(String(u));
	}) as Fetcher;
	return { f, urls };
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

afterEach(() => resetRateLimit());

describe('HAFAS REST (transport.rest)', () => {
	it('odjazdy z prawdziwej odpowiedzi VBB: linia, kierunek, opóźnienie, odwołany', () => {
		const deps = parseDepartures(json('hafas-departures.json'));
		expect(deps).toHaveLength(7);
		expect(deps[0]).toMatchObject({ line: 'M4', product: 'tram', direction: 'S Hackescher Markt', delay: 120, color: '#CA1214', cancelled: false });
		const c = deps.find((d) => d.cancelled)!;
		expect(c).toMatchObject({ line: 'U8', when: null, delay: null });
		// starszy format (tablica zamiast { departures })
		expect(parseDepartures(json('hafas-departures.json').departures)).toHaveLength(7);
		expect(() => parseDepartures({ error: 'x' })).toThrow();
	});

	it('wyszukiwanie przystanków i adres zapytania', async () => {
		expect(parseLocations(json('hafas-locations.json'))[0]).toMatchObject({ id: '900100003', name: 'S+U Alexanderplatz Bhf (Berlin)' });
		const { f, urls } = fake(() => ok(json('hafas-locations.json')));
		const hits = await searchStops(f, 'https://v6.vbb.transport.rest/', 'Alex');
		expect(hits.length).toBe(2);
		expect(urls[0]).toBe('https://v6.vbb.transport.rest/locations?query=Alex&results=8&stops=true&addresses=false&poi=false');
	});

	it('limit zapytań: po 429 nie pytamy do końca Retry-After', async () => {
		let n = 0;
		const { f } = fake(() => (n++ === 0 ? new Response('slow down', { status: 429, headers: { 'retry-after': '30' } }) : ok(json('hafas-departures.json'))));
		await expect(hafasDepartures(f, 'https://x.test', '900100003')).rejects.toThrow('429');
		await expect(hafasDepartures(f, 'https://x.test', '900100003')).rejects.toThrow(/429 \(\d+ s\)/);
		expect(n).toBe(1); // drugie wywołanie bez zapytania
		resetRateLimit();
		await expect(hafasDepartures(f, 'https://x.test', '900100003')).resolves.toHaveLength(7);
	});

	it('na ekran: minuty, czas dojścia, odwołane, limit', () => {
		const deps = parseDepartures(json('hafas-departures.json'));
		const now = new Date('2026-11-12T15:34:00Z'); // 16:34 w Berlinie
		const list = upcoming(deps, now, 5);
		expect(list[0]).toMatchObject({ line: 'M4', minutes: 1, delay: 2, time: '16:33' });
		expect(list).toHaveLength(5);
		const walk = upcoming(deps, now, 8, 3);
		expect(walk.every((d) => d.minutes === null || d.minutes >= 3)).toBe(true);
		expect(walk.find((d) => d.cancelled)).toMatchObject({ minutes: null, line: 'U8' });
	});
});

describe('GTFS (rozkład statyczny)', () => {
	it('CSV z cudzysłowami, godziny po północy, rodzaje pojazdów', () => {
		expect(parseCsvLine('a,"b, c","d ""e""",')).toEqual(['a', 'b, c', 'd "e"', '']);
		expect(gtfsMinutes('24:30:00')).toBe(1470);
		expect(gtfsMinutes('7:05:00')).toBe(425);
		expect(gtfsMinutes('x')).toBeNull();
		expect(productOf('0')).toBe('tram');
		expect(productOf('700')).toBe('bus');
		expect(productOf('109')).toBe('regional');
	});

	it('ZIP: spis plików (kompresja deflate i bez kompresji)', async () => {
		const e = await zipEntries(ZIP);
		expect([...e.keys()].sort()).toEqual(['agency.txt', 'calendar.txt', 'calendar_dates.txt', 'frequencies.txt', 'routes.txt', 'stop_times.txt', 'stops.txt', 'trips.txt']);
		expect(e.get('agency.txt')!.method).toBe(0);
		expect(e.get('stop_times.txt')!.method).toBe(8);
		await expect(zipEntries(`${FX}/abfuhr.ics`)).rejects.toThrow('ZIP');
	});

	it('wyszukiwanie przystanku bez polskich znaków', async () => {
		const hits = await gtfsSearchStops(ZIP, 'rondo przyklad');
		expect(hits.map((h) => h.id)).toEqual(['S1', 'S1a', 'S1b']);
		expect(hits[0].detail).toBe('stacja');
	});

	it('odjazdy ze stacji (perony), kalendarz z wyjątkami, kurs po północy, strefa przewoźnika', async () => {
		// czwartek 12.11.2026, 7:00 w Warszawie; 11.11 (środa, święto) kursuje rozkład niedzielny
		const deps = await gtfsDepartures(ZIP, { stopId: 'S1', now: new Date('2026-11-12T06:00:00Z') });
		expect(deps.map((d) => [d.plannedWhen, d.line, d.direction])).toEqual([
			['2026-11-12T07:10:00.000Z', '4', 'Dworzec Wzorcowy'],
			['2026-11-12T07:12:00.000Z', '175', 'Lotnisko'],
			['2026-11-12T07:15:00.000Z', '4', 'Plac Testowy'],
			['2026-11-12T23:30:00.000Z', 'N32', 'Plac Testowy'],
			['2026-11-13T07:10:00.000Z', '4', 'Dworzec Wzorcowy'],
			['2026-11-13T07:12:00.000Z', '175', 'Lotnisko'],
			['2026-11-13T07:15:00.000Z', '4', 'Plac Testowy']
		]);
		expect(deps[0]).toMatchObject({ product: 'tram', color: '#E30613', delay: null });
		// sam peron S1b
		const b = await gtfsDepartures(ZIP, { stopId: 'S1b', now: new Date('2026-11-12T06:00:00Z'), hours: 12 });
		expect(b.map((d) => d.line)).toEqual(['4']);
		// w środę-święto (rozkład niedzielny) jedzie T4s o 9:00
		const holiday = await gtfsDepartures(ZIP, { stopId: 'S1', now: new Date('2026-11-11T07:30:00Z'), hours: 3 });
		expect(holiday.map((d) => [d.plannedWhen, d.line])).toEqual([['2026-11-11T08:00:00.000Z', '4']]);
	});

	it('kursy z frequencies.txt (metro w Warszawie): wzorzec z czasami względnymi → odjazdy co headway', async () => {
		expect(gtfsSeconds('24:12:50')).toBe(87170);
		expect(gtfsSeconds('x')).toBeNull();
		// Wzorzec TM: S3 00:01, S4 00:05 (+4 min); okna 7:00–7:30 co 10 min i 23:50–24:20 co 15 min (czas Warszawy).
		// Bez obsługi frequencies kafelek pokazywał jeden odjazd o 00:05 w nocy.
		const deps = await gtfsDepartures(ZIP, { stopId: 'S4', now: new Date('2026-11-12T05:00:00Z'), hours: 19 });
		expect(deps.map((d) => [d.plannedWhen, d.line, d.direction, d.product])).toEqual([
			['2026-11-12T06:04:00.000Z', 'M1', 'Kabaty', 'subway'],
			['2026-11-12T06:14:00.000Z', 'M1', 'Kabaty', 'subway'],
			['2026-11-12T06:24:00.000Z', 'M1', 'Kabaty', 'subway'],
			['2026-11-12T22:54:00.000Z', 'M1', 'Kabaty', 'subway'],
			['2026-11-12T23:09:00.000Z', 'M1', 'Kabaty', 'subway']
		]);
		expect(new Set(deps.map((d) => d.id)).size).toBe(deps.length);
	});
});

describe('moduł odjazdów na serwerze', () => {
	it('źródło tylko z wybranym przystankiem tego samego dostawcy; dane na kafelek', async () => {
		const db = openDb(':memory:');
		expect(transitSource(db)).toBeNull();
		setStop(db, { provider: 'vbb', id: '900100003', name: 'Alexanderplatz' });
		const src = transitSource(db)!;
		expect(src.intervalMs).toBe(60_000);
		const { f, urls } = fake(() => ok(json('hafas-departures.json')));
		const data = await src.fetch(f, new Date('2026-11-12T15:34:00Z'));
		expect(urls[0]).toMatch(/^https:\/\/v6\.vbb\.transport\.rest\/stops\/900100003\/departures\?/);
		expect(data.departures).toHaveLength(7);
		// inny dostawca w ustawieniach → przystanek nieaktualny
		setSetting(db, 'modules', { transit: { enabled: true, config: { provider: 'bvg' } } });
		expect(transitSource(db)).toBeNull();
		expect(transitTile(db, new Date()).data.stop).toBeNull();
		// GTFS: odjazdy przeliczane co godzinę (lista ma limit 600 – na ruchliwej stacji ok. 12–15 h),
		// plik pobierany nadal co 12 h (ensureGtfs); stary dostawca 'db' (wyłączony) → domyślny
		setSetting(db, 'modules', { transit: { enabled: true, config: { provider: 'gtfs' } } });
		setStop(db, { provider: 'gtfs', id: 'S1', name: 'Rondo' });
		expect(transitSource(db)!.intervalMs).toBe(3_600_000);
		setSetting(db, 'modules', { transit: { enabled: true, config: { provider: 'db' } } });
		expect(transitTile(db, new Date()).data.stop).toBeNull();
	});

	it('w nocy nie pytamy API (zostają ostatnie dane)', async () => {
		const db = openDb(':memory:');
		setStop(db, { provider: 'vbb', id: '900100003', name: 'Alexanderplatz' });
		const { f, urls } = fake(() => ok(json('hafas-departures.json')));
		const { refresh } = await import('../sync');
		await refresh(db, transitSource(db)!, f, new Date('2026-11-12T15:34:00Z'));
		await refresh(db, transitSource(db)!, f, new Date('2026-11-13T01:00:00Z')); // 2:00 – noc
		expect(urls).toHaveLength(1);
		const tile = transitTile(db, new Date('2026-11-12T15:34:00Z')).data;
		expect(tile).toMatchObject({ stop: 'Alexanderplatz', realtime: true });
		expect(tile.departures[0].line).toBe('M4');
	});

	it('GTFS: pobranie pliku (limit rozmiaru) i wyszukiwanie w nim', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'gtfs-'));
		const file = join(dir, 'feed.zip');
		const zip = readFileSync(ZIP);
		const { f } = fake(() => new Response(zip));
		await downloadGtfs(f, 'https://example.test/gtfs.zip', file);
		expect(statSync(file).size).toBe(zip.length);
		await expect(downloadGtfs(f, 'https://example.test/gtfs.zip', join(dir, 'b.zip'), 100)).rejects.toThrow('za duży');
		const db = openDb(':memory:');
		expect(await findStops(db, 'a', f)).toEqual([]); // za krótkie zapytanie
	});
});
