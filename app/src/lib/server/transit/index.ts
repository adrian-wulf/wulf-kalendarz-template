import { appFetch } from '../net.js';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { DB } from '../db/index.js';
import type { Fetcher, Source } from '../sources/index.js';
import { getKv, setKv } from '../kv.js';
import { getSetting, readCache } from '../sync.js';
import { phaseAt } from '#lib/logic/schedule.js';
import { localParts } from '#lib/logic/dates.js';
import { moduleConfig } from '#lib/modules/index.js';
import { HAFAS_URLS, transitSettings } from '#lib/modules/transit/index.js';
import type { TransitDeparture, TransitTileData } from '#lib/modules/p3c.js';
import { hafasDepartures, searchStops } from './hafas.js';
import { gtfsDepartures, gtfsSearchStops } from './gtfs.js';
import { TransitError, type Departure, type StopHit, type TransitData } from './types.js';

/**
 * Odjazdy z jednego przystanku. Dostawcy:
 * - HAFAS REST (transport.rest, Niemcy): na żywo, z opóźnieniami; pytamy co minutę (pamięć 60 s),
 * - GTFS (rozkład statyczny – Polska i wszędzie, gdzie przewoźnik publikuje feed): plik ZIP z adresu
 *   albo wgrany w panelu, pobierany raz na 12 h; odjazdy liczone co godzinę na 36 h do przodu.
 * W nocy (plan dnia z panelu) nie pytamy – ekran i tak jest wygaszony.
 */

export type ProviderId = 'vbb' | 'bvg' | 'custom' | 'gtfs';

export interface TransitStop {
	provider: ProviderId;
	id: string;
	name: string;
}

const STOP_KEY = 'transitStop';
const HAFAS_MS = 60_000;
const GTFS_MS = 12 * 3_600_000;
/**
 * Odjazdy z GTFS liczymy co godzinę (plik pobieramy nadal co 12 h): lista ma limit 600 pozycji,
 * a na ruchliwej stacji (metro w Warszawie co 2–3 min w obie strony) to ok. 12–15 h – przy
 * liczeniu co 12 h kafelek mógł pod koniec zostać pusty. Koszt: kilka sekund CPU na godzinę.
 */
const GTFS_RECALC_MS = 3_600_000;

export const transitConfig = (db: DB) => moduleConfig(transitSettings, getSetting(db, 'modules'), 'transit');

export const getStop = (db: DB) => getKv<TransitStop | null>(db, STOP_KEY, null);
export const setStop = (db: DB, s: TransitStop | null) => setKv(db, STOP_KEY, s);

/** Katalog na pliki GTFS – obok bazy danych. */
export const gtfsDir = () => join(dirname(resolve(process.env.DATABASE_PATH ?? 'data/kalendarz.db')), 'gtfs');
export const gtfsFile = () => join(gtfsDir(), 'feed.zip');

/** Adres API HAFAS dla wybranego dostawcy (własny – z ustawień). */
export function hafasUrl(provider: ProviderId, apiUrl: string): string {
	if (provider === 'custom') {
		if (!apiUrl) throw new TransitError('Brak adresu API');
		return apiUrl;
	}
	const url = HAFAS_URLS[provider as keyof typeof HAFAS_URLS];
	if (!url) throw new TransitError(`Nieznany dostawca: ${provider}`);
	return url;
}

/** Pobranie feedu GTFS do pliku (najpierw do tymczasowego – stary plik działa do końca). Limit 300 MB. */
export async function downloadGtfs(f: Fetcher, url: string, file = gtfsFile(), maxBytes = 300 * 1024 * 1024) {
	await mkdir(dirname(file), { recursive: true });
	const res = await f(url, { signal: AbortSignal.timeout(300_000) });
	if (!res.ok || !res.body) throw new TransitError(`GTFS: HTTP ${res.status} z ${new URL(url).host}`);
	const len = Number(res.headers.get('content-length'));
	if (len > maxBytes) throw new TransitError('GTFS: plik za duży');
	const tmp = `${file}.part`;
	let seen = 0;
	const body = Readable.fromWeb(res.body as never);
	body.on('data', (c: Buffer) => {
		seen += c.length;
		if (seen > maxBytes) body.destroy(new TransitError('GTFS: plik za duży'));
	});
	await pipeline(body, createWriteStream(tmp));
	await rename(tmp, file);
}

/** Zapis pliku wgranego w panelu. */
export async function saveGtfsUpload(data: ArrayBuffer, file = gtfsFile()) {
	const buf = Buffer.from(data);
	if (buf.readUInt32LE(0) !== 0x04034b50) throw new TransitError('GTFS: to nie jest plik ZIP');
	await mkdir(dirname(file), { recursive: true });
	await writeFile(`${file}.part`, buf);
	await rename(`${file}.part`, file);
}

export async function gtfsInfo(file = gtfsFile()): Promise<{ size: number; mtime: string } | null> {
	try {
		const s = await stat(file);
		return { size: s.size, mtime: s.mtime.toISOString() };
	} catch {
		return null;
	}
}

const GTFS_URL_KEY = 'transitGtfsUrl';

/**
 * Plik GTFS z adresu z ustawień: pobiera, gdy go nie ma, gdy adres się zmienił albo gdy jest starszy
 * niż `maxAgeMs`. Bez adresu – plik wgrany w panelu (albo błąd, gdy go nie ma).
 */
export async function ensureGtfs(db: DB, f: Fetcher = appFetch, maxAgeMs = GTFS_MS - 60_000) {
	const { gtfsUrl } = transitConfig(db);
	const info = await gtfsInfo();
	if (!gtfsUrl) {
		if (!info) throw new TransitError('GTFS: najpierw podaj adres albo wgraj plik');
		return;
	}
	const stale = !info || getKv<string | null>(db, GTFS_URL_KEY, null) !== gtfsUrl || Date.now() - Date.parse(info.mtime) > maxAgeMs;
	if (!stale) return;
	await downloadGtfs(f, gtfsUrl);
	setKv(db, GTFS_URL_KEY, gtfsUrl);
}

/** Wyszukiwanie przystanku w panelu – u bieżącego dostawcy. */
export async function findStops(db: DB, query: string, f: Fetcher = appFetch): Promise<StopHit[]> {
	const c = transitConfig(db);
	if (query.trim().length < 2) return [];
	if (c.provider === 'gtfs') {
		await ensureGtfs(db, f);
		return gtfsSearchStops(gtfsFile(), query);
	}
	return searchStops(f, hafasUrl(c.provider as ProviderId, c.apiUrl), query);
}

/** Źródło do pętli synchronizacji – tylko z wybranym przystankiem tego samego dostawcy. */
export function transitSource(db: DB): Source<TransitData> | null {
	const c = transitConfig(db);
	const stop = getStop(db);
	if (!stop || stop.provider !== c.provider) return null;
	const gtfs = c.provider === 'gtfs';
	return {
		name: 'transit',
		intervalMs: gtfs ? GTFS_RECALC_MS : HAFAS_MS,
		async fetch(f, now) {
			const prev = readCache<TransitData>(db, 'transit').data;
			if (!gtfs && phaseAt(now, getSetting(db, 'schedule')) === 'night' && prev?.stopId === stop.id) return prev;
			if (gtfs) {
				await ensureGtfs(db, f);
				return { stopId: stop.id, realtime: false, departures: await gtfsDepartures(gtfsFile(), { stopId: stop.id, now }) };
			}
			return { stopId: stop.id, realtime: true, departures: await hafasDepartures(f, hafasUrl(c.provider as ProviderId, c.apiUrl), stop.id, 12) };
		}
	};
}

const hhmm = (iso: string) => {
	const m = localParts(new Date(iso)).minutes;
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Odjazdy do pokazania w chwili `now`: bez tych, na które nie zdążymy (czas dojścia), maks. `results`. */
export function upcoming(deps: Departure[], now: Date, results: number, walkMinutes = 0): TransitDeparture[] {
	const out: TransitDeparture[] = [];
	for (const d of deps) {
		const at = Date.parse(d.when ?? d.plannedWhen);
		const minutes = Math.floor((at - now.getTime()) / 60_000);
		if (minutes < walkMinutes || (d.cancelled && Date.parse(d.plannedWhen) < now.getTime())) continue;
		out.push({
			id: d.id,
			line: d.line,
			product: d.product,
			direction: d.direction,
			minutes: d.cancelled ? null : minutes,
			time: hhmm(d.plannedWhen),
			delay: d.delay === null ? null : Math.round(d.delay / 60),
			cancelled: d.cancelled,
			platform: d.platform,
			color: d.color
		});
		if (out.length >= results) break;
	}
	return out;
}

export function transitTile(db: DB, now: Date): { data: TransitTileData; status: Record<string, ReturnType<typeof readCache>['status']> } {
	const c = transitConfig(db);
	const stop = getStop(db);
	const { data, status } = readCache<TransitData>(db, 'transit');
	const fresh = data && stop && data.stopId === stop.id ? data : null;
	return {
		data: {
			stop: stop && stop.provider === c.provider ? stop.name : null,
			departures: fresh ? upcoming(fresh.departures, now, c.results, c.walkMinutes) : [],
			realtime: fresh?.realtime ?? c.provider !== 'gtfs',
			error: status.error ?? null,
			fetchedAt: status.fetchedAt
		},
		status: { transit: status }
	};
}
