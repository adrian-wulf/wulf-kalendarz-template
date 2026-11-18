import type { Fetcher } from '../sources/index.js';
import type { Lang } from '#lib/i18n/index.js';
import { addDays, localParts, localTime } from '#lib/logic/dates.js';
import { demoPack, type DemoHaEntity, type DemoPack } from './pack.js';
import { demoLang } from './mode.js';
import { crc32 } from 'node:zlib';
import { HAFAS_URLS } from '#lib/modules/transit/index.js';

/**
 * Atrapy usług zewnętrznych dla trybu demo – zamiast sieci. Odpowiadają tak jak prawdziwe API, więc
 * aplikacja przechodzi zwykłą drogą (źródła, pamięć podręczna, kafelki):
 * - Open-Meteo (pogoda): listopadowa, deterministyczna pogoda na 8 dni,
 * - OpenHolidays (ferie): lista z `pack.ferien`,
 * - HAFAS REST (odjazdy, DE – także pod adresem VBB): kursy z `pack.transit` co kilka minut względem „teraz”,
 * - GTFS (odjazdy, PL): ZIP z rozkładem z `pack.transit` (`DEMO_GTFS_URL`),
 * - Home Assistant REST: stany z `pack.ha`, przełączanie zmienia stan w pamięci.
 * Każdy inny adres dostaje 503 – w demo nic nie wychodzi do sieci (także adresy wpisane w panelu).
 *
 * Fake providers for demo mode. Unknown hosts get 503, so a demo never makes outbound requests.
 */

export const DEMO_HA_URL = 'http://homeassistant.demo.invalid:8123';
export const DEMO_HA_TOKEN = 'demo-token-not-a-secret';
export const DEMO_HAFAS_URL = 'https://transit.demo.invalid';
/** Rozkład GTFS demo (PL) – ZIP składany w pamięci z `pack.transit`, kursy przez frequencies.txt. */
export const DEMO_GTFS_URL = 'https://transit.demo.invalid/gtfs-pl.zip';
/** HAFAS demo odpowiada też pod adresem VBB (DE: dostawca jak w prawdziwej instalacji, bez ostrzeżenia o kraju). */
const HAFAS_ORIGINS = new Set([new URL(DEMO_HAFAS_URL).origin, new URL(HAFAS_URLS.vbb).origin]);

/** Archiwum ZIP bez kompresji (metoda 0) – tyle wystarcza czytnikowi GTFS z `transit/gtfs.ts`. */
export function storedZip(files: Record<string, string>): Buffer {
	const local: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const [name, text] of Object.entries(files)) {
		const data = Buffer.from(text, 'utf8');
		const nameBuf = Buffer.from(name, 'utf8');
		const crc = crc32(data);
		const head = Buffer.alloc(30);
		head.writeUInt32LE(0x04034b50, 0);
		head.writeUInt16LE(20, 4);
		head.writeUInt32LE(crc, 14);
		head.writeUInt32LE(data.length, 18);
		head.writeUInt32LE(data.length, 22);
		head.writeUInt16LE(nameBuf.length, 26);
		const cd = Buffer.alloc(46);
		cd.writeUInt32LE(0x02014b50, 0);
		cd.writeUInt16LE(20, 4);
		cd.writeUInt16LE(20, 6);
		cd.writeUInt32LE(crc, 16);
		cd.writeUInt32LE(data.length, 20);
		cd.writeUInt32LE(data.length, 24);
		cd.writeUInt16LE(nameBuf.length, 28);
		cd.writeUInt32LE(offset, 42);
		local.push(head, nameBuf, data);
		central.push(cd, nameBuf);
		offset += head.length + nameBuf.length + data.length;
	}
	const cdBuf = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(cdBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, cdBuf, end]);
}

/** Feed GTFS z linii paczki: przystanek, linie, kursy co `every` min od 4:00 do północy, cały rok. */
function demoGtfs(): Buffer {
	const p = currentPack();
	const { stop, lines } = p.transit;
	const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : v)).join(',')).join('\n') + '\n';
	const pad = (n: number) => String(n).padStart(2, '0');
	return storedZip({
		'agency.txt': csv([['agency_id', 'agency_name', 'agency_url', 'agency_timezone'], ['demo', 'Demo', 'https://example.invalid', p.timezone]]),
		'stops.txt': csv([['stop_id', 'stop_name', 'parent_station'], [stop.id, stop.name, ''], ...lines.map((l, i) => [`demo-end-${i}`, l.direction, ''])]),
		'routes.txt': csv([['route_id', 'route_short_name', 'route_long_name', 'route_type', 'route_color'], ...lines.map((l, i) => [`R${i}`, l.line, '', l.product === 'tram' ? 0 : 3, l.color.replace('#', '')])]),
		'trips.txt': csv([['route_id', 'service_id', 'trip_id', 'trip_headsign'], ...lines.map((l, i) => [`R${i}`, 'ALL', `T${i}`, l.direction])]),
		'stop_times.txt': csv([
			['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
			...lines.flatMap((_, i) => [
				[`T${i}`, '00:00:00', '00:00:00', stop.id, 1],
				[`T${i}`, '00:15:00', '00:15:00', `demo-end-${i}`, 2]
			])
		]),
		'frequencies.txt': csv([['trip_id', 'start_time', 'end_time', 'headway_secs'], ...lines.map((l, i) => [`T${i}`, `04:${pad(l.offset)}:00`, '24:00:00', l.every * 60])]),
		'calendar.txt': csv([['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'], ['ALL', 1, 1, 1, 1, 1, 1, 1, '20200101', '20351231']])
	});
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let pack: DemoPack | null = null;
let haStates: Map<string, DemoHaEntity> | null = null;
let lang: Lang | null = null;

/** Paczka demo do atrap (ferie, przystanek, encje) – dane niezależne od dnia, liczone raz. */
function currentPack(): DemoPack {
	pack ??= demoPack(lang ?? demoLang(), localParts(new Date()).date);
	return pack;
}

function ha(): Map<string, DemoHaEntity> {
	haStates ??= new Map(currentPack().ha.map((e) => [e.entityId, structuredClone(e)]));
	return haStates;
}

/** Reset demo: stany Home Assistanta wracają do początkowych; `l` – język paczki (domyślnie `DEMO_LANG`). */
export function resetDemoFetch(l: Lang | null = null) {
	pack = null;
	haStates = null;
	lang = l;
}

/** Prosta, powtarzalna „losowość” z liczby (ten sam dzień = ta sama pogoda). */
const noise = (n: number) => {
	const x = Math.sin(n * 12.9898) * 43758.5453;
	return x - Math.floor(x);
};

const WEATHER_CODES = [3, 61, 2, 1, 3, 80, 2, 0];

/** Pogoda: 8 dni od dziś; temperatury jak późną jesienią w Europie Środkowej. */
function weather(now: Date) {
	const today = localParts(now).date;
	const days = Array.from({ length: 8 }, (_, i) => {
		const date = addDays(today, i);
		const seed = Number(date.replaceAll('-', ''));
		const max = Math.round((7 + noise(seed) * 6) * 10) / 10;
		return { date, code: WEATHER_CODES[(seed + i) % WEATHER_CODES.length], max, min: Math.round((max - 4 - noise(seed + 1) * 3) * 10) / 10 };
	});
	const hour = localParts(now).minutes / 60;
	// W ciągu dnia cieplej, nocą chłodniej – między min a max.
	const k = Math.max(0, Math.sin(((hour - 8) / 14) * Math.PI));
	const temp = Math.round((days[0].min + (days[0].max - days[0].min) * k) * 10) / 10;
	return {
		current: { temperature_2m: temp, weather_code: days[0].code },
		daily: {
			time: days.map((d) => d.date),
			weather_code: days.map((d) => d.code),
			temperature_2m_max: days.map((d) => d.max),
			temperature_2m_min: days.map((d) => d.min)
		}
	};
}

function departures(now: Date) {
	const { lines } = currentPack().transit;
	const today = localParts(now).date;
	const base = localTime(today, 0, 0).getTime();
	const out: { tripId: string; when: string; plannedWhen: string; delay: number; platform: string; direction: string; line: { name: string; product: string; color: { fg: string; bg: string } } }[] = [];
	for (const l of lines)
		for (let k = 0; k < 24; k++) {
			// kursy co `every` min od pełnej godziny + offset, od teraz na ok. 2 godziny
			const minutesNow = Math.floor((now.getTime() - base) / 60_000);
			const first = Math.ceil((minutesNow - l.offset) / l.every) * l.every + l.offset;
			const at = first + k * l.every;
			if (at - minutesNow > 120) break;
			const planned = new Date(base + at * 60_000);
			const delay = (at / l.every) % 2 === 0 ? l.delay : 0;
			out.push({
				tripId: `${l.line}-${at}`,
				when: new Date(planned.getTime() + delay * 60_000).toISOString(),
				plannedWhen: planned.toISOString(),
				delay: delay * 60,
				platform: l.platform,
				direction: l.direction,
				line: { name: l.line, product: l.product, color: { fg: '#ffffff', bg: l.color } }
			});
		}
	return { departures: out.sort((a, b) => Date.parse(a.when) - Date.parse(b.when)) };
}

/** Stan encji z lekkim „życiem”: czujniki temperatury zmieniają się powoli w ciągu dnia. */
function haState(e: DemoHaEntity, now: Date) {
	if (e.entityId.startsWith('sensor.') && e.attributes.device_class === 'temperature') {
		const drift = Math.sin(now.getTime() / 3_600_000) * 0.3;
		return { entity_id: e.entityId, state: (Number(e.state) + drift).toFixed(1), attributes: e.attributes };
	}
	return { entity_id: e.entityId, state: e.state, attributes: e.attributes };
}

/** Fetcher demo – ten sam kształt co `fetch`. */
export const demoFetch: Fetcher = async (input, init) => {
	const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
	const now = new Date();
	if (url.host === 'api.open-meteo.com') return json(weather(now));
	if (url.host === 'openholidaysapi.org')
		return json(currentPack().ferien.map((f, i) => ({ id: `demo-${i}`, startDate: f.from, endDate: f.to, name: [{ language: 'XX', text: f.name }] })));
	if (url.href === DEMO_GTFS_URL) return new Response(new Uint8Array(demoGtfs()), { headers: { 'content-type': 'application/zip' } });
	if (HAFAS_ORIGINS.has(url.origin)) {
		const stop = currentPack().transit.stop;
		if (url.pathname === '/locations') {
			const q = (url.searchParams.get('query') ?? '').toLowerCase();
			return json(stop.name.toLowerCase().includes(q) ? [{ type: 'stop', id: stop.id, name: stop.name, products: { tram: true, bus: true } }] : []);
		}
		if (url.pathname === `/stops/${stop.id}/departures`) return json(departures(now));
		return json({ message: 'not found' }, 404);
	}
	if (url.origin === new URL(DEMO_HA_URL).origin) {
		const auth = new Headers(init?.headers).get('authorization');
		if (auth !== `Bearer ${DEMO_HA_TOKEN}`) return json({ message: 'Unauthorized' }, 401);
		if (url.pathname === '/api/states') return json([...ha().values()].map((e) => haState(e, now)));
		const svc = /^\/api\/services\/(\w+)\/toggle$/.exec(url.pathname);
		if (svc && init?.method === 'POST') {
			const id = JSON.parse(String(init.body ?? '{}')).entity_id;
			const e = ha().get(id);
			if (e) e.state = e.state === 'on' ? 'off' : 'on';
			return json(e ? [haState(e, now)] : []);
		}
		return json({ message: 'not found' }, 404);
	}
	// --- 26a: calendar layers --- subskrypcja iCal klubu (kalendarz z RRULE i TZID).
	if (url.href === currentPack().club.url) return new Response(currentPack().club.ics, { headers: { 'content-type': 'text/calendar; charset=utf-8' } });
	return json({ message: 'demo: brak dostępu do sieci / no network in demo mode' }, 503);
};
