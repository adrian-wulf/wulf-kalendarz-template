import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import { addDays, isoWeekday, localTime } from '#lib/logic/dates.js';
import { TransitError, type Departure, type StopHit } from './types.js';

/**
 * Rozkład GTFS (statyczny) dla jednego przystanku – bez zależności: własny czytnik ZIP
 * (katalog centralny + strumień `inflateRaw`) i czytanie plików CSV linia po linii.
 * `stop_times.txt` dużego miasta ma setki MB po rozpakowaniu, więc nic nie trafia w całości do pamięci.
 *
 * GTFS gives scheduled times only (no delays). Used for Polish cities (ZTM Warszawa, MPK Kraków,
 * ZTM Poznań…), which publish GTFS feeds but no common realtime API.
 */

interface ZipEntry {
	name: string;
	method: number;
	compressedSize: number;
	offset: number;
}

/** Spis plików w archiwum ZIP (bez ZIP64 – feedy GTFS miast mieszczą się w 4 GB). */
export async function zipEntries(path: string): Promise<Map<string, ZipEntry>> {
	const fh = await open(path, 'r');
	try {
		const { size } = await fh.stat();
		const tail = Math.min(size, 65_557);
		const buf = Buffer.alloc(tail);
		await fh.read(buf, 0, tail, size - tail);
		let eocd = -1;
		for (let i = tail - 22; i >= 0; i--)
			if (buf.readUInt32LE(i) === 0x06054b50) {
				eocd = i;
				break;
			}
		if (eocd < 0) throw new TransitError('GTFS: to nie jest plik ZIP');
		const count = buf.readUInt16LE(eocd + 10);
		const cdSize = buf.readUInt32LE(eocd + 12);
		const cdOffset = buf.readUInt32LE(eocd + 16);
		if (cdOffset === 0xffffffff) throw new TransitError('GTFS: ZIP64 nie jest obsługiwany');
		const cd = Buffer.alloc(cdSize);
		await fh.read(cd, 0, cdSize, cdOffset);
		const out = new Map<string, ZipEntry>();
		let p = 0;
		for (let i = 0; i < count; i++) {
			if (cd.readUInt32LE(p) !== 0x02014b50) throw new TransitError('GTFS: uszkodzony ZIP');
			const method = cd.readUInt16LE(p + 10);
			const compressedSize = cd.readUInt32LE(p + 20);
			const nameLen = cd.readUInt16LE(p + 28);
			const extraLen = cd.readUInt16LE(p + 30);
			const commentLen = cd.readUInt16LE(p + 32);
			const offset = cd.readUInt32LE(p + 42);
			const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
			// Feed bywa spakowany z katalogiem („gtfs/stops.txt”) – liczy się nazwa pliku.
			out.set(name.split('/').pop()!, { name, method, compressedSize, offset });
			p += 46 + nameLen + extraLen + commentLen;
		}
		return out;
	} finally {
		await fh.close();
	}
}

async function entryStream(path: string, e: ZipEntry): Promise<Readable> {
	const fh = await open(path, 'r');
	const head = Buffer.alloc(30);
	try {
		await fh.read(head, 0, 30, e.offset);
	} finally {
		await fh.close();
	}
	if (head.readUInt32LE(0) !== 0x04034b50) throw new TransitError('GTFS: uszkodzony ZIP');
	const start = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
	if (e.compressedSize === 0) return Readable.from([]);
	const raw = createReadStream(path, { start, end: start + e.compressedSize - 1 });
	if (e.method === 0) return raw;
	if (e.method !== 8) throw new TransitError(`GTFS: nieobsługiwana kompresja (${e.method})`);
	return raw.pipe(createInflateRaw());
}

/** Jedna linia CSV (RFC 4180, bez pól wieloliniowych – w GTFS ich nie ma). */
export function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (quoted) {
			if (c === '"') {
				if (line[i + 1] === '"') {
					cur += '"';
					i++;
				} else quoted = false;
			} else cur += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			out.push(cur);
			cur = '';
		} else cur += c;
	}
	out.push(cur);
	return out;
}

/**
 * Wiersze pliku z archiwum jako obiekty (tylko potrzebne kolumny). `prefilter` odrzuca linie
 * przed parsowaniem (szybki test tekstu – przy `stop_times.txt` to większość pracy).
 */
async function eachRow(
	path: string,
	entries: Map<string, ZipEntry>,
	file: string,
	cols: readonly string[],
	fn: (row: Record<string, string>) => void | false,
	prefilter?: (line: string) => boolean
): Promise<boolean> {
	const e = entries.get(file);
	if (!e) return false;
	const rl = createInterface({ input: await entryStream(path, e), crlfDelay: Infinity });
	let idx: number[] | null = null;
	try {
		for await (const raw of rl) {
			if (!idx) {
				const header = parseCsvLine(raw.replace(/^﻿/, '').trim());
				idx = cols.map((c) => header.indexOf(c));
				continue;
			}
			if (!raw || (prefilter && !prefilter(raw))) continue;
			const v = parseCsvLine(raw);
			const row: Record<string, string> = {};
			cols.forEach((c, i) => (row[c] = idx![i] >= 0 ? (v[idx![i]] ?? '').trim() : ''));
			if (fn(row) === false) break;
		}
	} finally {
		rl.close();
	}
	return true;
}

const fold = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ł/g, 'l');

/** Przystanki po nazwie (do wyboru w panelu). Stacje nadrzędne (location_type=1) obejmują perony. */
export async function gtfsSearchStops(path: string, query: string, limit = 20): Promise<StopHit[]> {
	const entries = await zipEntries(path);
	const q = fold(query.trim());
	const hits: StopHit[] = [];
	if (!q) return hits;
	await eachRow(path, entries, 'stops.txt', ['stop_id', 'stop_name', 'stop_code', 'location_type', 'platform_code'], (r) => {
		if (!fold(r.stop_name).includes(q) || (r.location_type && !['0', '1'].includes(r.location_type))) return;
		const detail = [r.location_type === '1' ? 'stacja' : '', r.stop_code, r.platform_code].filter(Boolean).join(' · ');
		hits.push({ id: r.stop_id, name: r.stop_name, detail: detail || r.stop_id });
		if (hits.length >= 500) return false;
	});
	// Stacje (location_type=1 – wszystkie perony naraz) przed pojedynczymi peronami; w Warszawie
	// stacja metra stoi w pliku za kilkunastoma peronami autobusowymi o tej samej nazwie.
	const station = (h: StopHit) => (h.detail?.startsWith('stacja') ? 0 : 1);
	return hits.sort((a, b) => station(a) - station(b)).slice(0, limit);
}

const ROUTE_TYPES: Record<string, string> = { '0': 'tram', '1': 'subway', '2': 'regional', '3': 'bus', '4': 'ferry', '11': 'bus', '12': 'regional' };

/** route_type z GTFS (także rozszerzone 100–1700) → nazwa środka transportu jak w HAFAS. */
export function productOf(routeType: string): string {
	const n = Number(routeType);
	if (ROUTE_TYPES[routeType]) return ROUTE_TYPES[routeType];
	if (n >= 100 && n < 200) return 'regional';
	if (n >= 400 && n < 500) return 'subway';
	if (n >= 700 && n < 800) return 'bus';
	if (n >= 900 && n < 1000) return 'tram';
	if (n >= 1000 && n < 1300) return 'ferry';
	return 'bus';
}

/** 'H:MM:SS' / 'HH:MM:SS' (także > 24:00 – kurs po północy) → minuty; null przy złym formacie. */
export function gtfsMinutes(s: string): number | null {
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
	return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Kursy z `frequencies.txt` (np. metro w Warszawie): w `stop_times.txt` są tylko wzorcem z czasami
 * względnymi (zwykle od 00:00:00), a prawdziwe odjazdy to start_time, +headway… do end_time.
 * Wpis wzorca zastępujemy wszystkimi odjazdami: początek kursu + (czas na przystanku − czas na pierwszym).
 */
async function expandFrequencies(path: string, entries: Map<string, ZipEntry>, times: { trip: string; min: number; headsign: string }[]) {
	if (!entries.has('frequencies.txt') || !times.length) return;
	const here = new Set(times.map((x) => x.trip));
	const freq = new Map<string, { start: number; end: number; headway: number }[]>();
	await eachRow(path, entries, 'frequencies.txt', ['trip_id', 'start_time', 'end_time', 'headway_secs'], (r) => {
		if (!here.has(r.trip_id)) return;
		const start = gtfsSeconds(r.start_time);
		const end = gtfsSeconds(r.end_time);
		const headway = Number(r.headway_secs);
		if (start === null || end === null || !(headway > 0)) return;
		freq.set(r.trip_id, [...(freq.get(r.trip_id) ?? []), { start, end, headway }]);
	});
	if (!freq.size) return;

	// Czas pierwszego przystanku każdego kursu-wzorca (drugie przejście, tylko po tych kursach).
	const ids = [...freq.keys()];
	const first = new Map<string, { seq: number; sec: number }>();
	await eachRow(
		path,
		entries,
		'stop_times.txt',
		['trip_id', 'stop_sequence', 'arrival_time', 'departure_time'],
		(r) => {
			if (!freq.has(r.trip_id)) return;
			const seq = Number(r.stop_sequence);
			const sec = gtfsSeconds(r.departure_time || r.arrival_time);
			const cur = first.get(r.trip_id);
			if (sec !== null && (!cur || seq < cur.seq)) first.set(r.trip_id, { seq, sec });
		},
		(line) => ids.some((id) => line.includes(id))
	);

	const out = times.filter((x) => !freq.has(x.trip));
	for (const x of times) {
		const windows = freq.get(x.trip);
		if (!windows) continue;
		const offset = x.min * 60 - Math.floor((first.get(x.trip)?.sec ?? 0) / 60) * 60;
		for (const w of windows) for (let t = w.start; t < w.end; t += w.headway) out.push({ ...x, min: Math.floor((t + offset) / 60) });
	}
	times.splice(0, times.length, ...out);
}

/** 'HH:MM:SS' (także > 24:00) → sekundy; null przy złym formacie. */
export function gtfsSeconds(s: string): number | null {
	const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
	return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0) : null;
}

const ymd = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

export interface GtfsOptions {
	stopId: string;
	now: Date;
	/** ile godzin do przodu (domyślnie 36 – plik czytamy raz na kilka godzin) */
	hours?: number;
	limit?: number;
}

/** Odjazdy z przystanku (i jego peronów, gdy to stacja) z rozkładu GTFS na najbliższe godziny. */
export async function gtfsDepartures(path: string, o: GtfsOptions): Promise<Departure[]> {
	const entries = await zipEntries(path);
	for (const f of ['stops.txt', 'stop_times.txt', 'trips.txt', 'routes.txt'])
		if (!entries.has(f)) throw new TransitError(`GTFS: brak pliku ${f}`);

	let tz: string | undefined;
	await eachRow(path, entries, 'agency.txt', ['agency_timezone'], (r) => {
		tz = r.agency_timezone || undefined;
		return false;
	});
	if (tz) {
		try {
			new Intl.DateTimeFormat('en', { timeZone: tz });
		} catch {
			tz = undefined;
		}
	}

	// Przystanek + perony stacji nadrzędnej.
	const stops = new Set([o.stopId]);
	await eachRow(path, entries, 'stops.txt', ['stop_id', 'parent_station'], (r) => {
		if (r.parent_station === o.stopId) stops.add(r.stop_id);
	});

	const times: { trip: string; min: number; headsign: string }[] = [];
	const ids = [...stops];
	await eachRow(
		path,
		entries,
		'stop_times.txt',
		['trip_id', 'departure_time', 'arrival_time', 'stop_id', 'pickup_type', 'stop_headsign'],
		(r) => {
			if (!stops.has(r.stop_id) || r.pickup_type === '1') return;
			const min = gtfsMinutes(r.departure_time || r.arrival_time);
			if (min !== null) times.push({ trip: r.trip_id, min, headsign: r.stop_headsign });
		},
		(line) => ids.some((id) => line.includes(id))
	);

	await expandFrequencies(path, entries, times);

	const tripIds = new Set(times.map((x) => x.trip));
	const trips = new Map<string, { route: string; service: string; headsign: string }>();
	await eachRow(path, entries, 'trips.txt', ['trip_id', 'route_id', 'service_id', 'trip_headsign'], (r) => {
		if (tripIds.has(r.trip_id)) trips.set(r.trip_id, { route: r.route_id, service: r.service_id, headsign: r.trip_headsign });
	});
	const routeIds = new Set([...trips.values()].map((t) => t.route));
	const routes = new Map<string, { name: string; type: string; color: string }>();
	await eachRow(path, entries, 'routes.txt', ['route_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color'], (r) => {
		if (routeIds.has(r.route_id)) routes.set(r.route_id, { name: r.route_short_name || r.route_long_name, type: r.route_type, color: r.route_color });
	});

	// Dni kursowania: calendar.txt (dni tygodnia + zakres) i wyjątki z calendar_dates.txt.
	const hours = o.hours ?? 36;
	const startDay = addDays(new Date(o.now.getTime()).toISOString().slice(0, 10), -2);
	const days = Array.from({ length: Math.ceil(hours / 24) + 4 }, (_, i) => addDays(startDay, i));
	const services = new Set([...trips.values()].map((t) => t.service));
	const active = new Map<string, Set<string>>(days.map((d) => [d, new Set()]));
	const WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
	await eachRow(path, entries, 'calendar.txt', ['service_id', 'start_date', 'end_date', ...WD], (r) => {
		if (!services.has(r.service_id)) return;
		for (const d of days) if (d >= ymd(r.start_date) && d <= ymd(r.end_date) && r[WD[isoWeekday(d) - 1]] === '1') active.get(d)!.add(r.service_id);
	});
	await eachRow(path, entries, 'calendar_dates.txt', ['service_id', 'date', 'exception_type'], (r) => {
		if (!services.has(r.service_id)) return;
		const set = active.get(ymd(r.date));
		if (!set) return;
		if (r.exception_type === '1') set.add(r.service_id);
		else if (r.exception_type === '2') set.delete(r.service_id);
	});

	const from = o.now.getTime() - 60_000;
	const to = o.now.getTime() + hours * 3_600_000;
	const out: Departure[] = [];
	for (const d of days)
		for (const x of times) {
			const trip = trips.get(x.trip);
			if (!trip || !active.get(d)!.has(trip.service)) continue;
			// Godziny ≥ 24:00 to kursy po północy dnia kursowania.
			const at = localTime(addDays(d, Math.floor(x.min / 1440)), Math.floor((x.min % 1440) / 60), x.min % 60, tz).getTime();
			if (at < from || at > to) continue;
			const route = routes.get(trip.route);
			const iso = new Date(at).toISOString();
			out.push({
				id: `${x.trip}@${iso}`,
				line: route?.name || '?',
				product: productOf(route?.type ?? '3'),
				direction: x.headsign || trip.headsign,
				when: iso,
				plannedWhen: iso,
				delay: null,
				cancelled: false,
				platform: null,
				color: route?.color && /^[0-9a-f]{6}$/i.test(route.color) ? `#${route.color}` : null
			});
		}
	return out.sort((a, b) => a.plannedWhen.localeCompare(b.plannedWhen) || a.line.localeCompare(b.line)).slice(0, o.limit ?? 600);
}
