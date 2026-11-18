import type { Fetcher } from '../sources/index.js';
import { TransitError, type Departure, type StopHit } from './types.js';

/**
 * HAFAS przez REST w formacie FPTF (transport.rest: `v6.vbb.transport.rest`, `v6.bvg.transport.rest`,
 * albo własna instancja `db-rest`/`vbb-rest` w Dockerze; publiczne `v6.db.transport.rest` wyłączono w 2026).
 * Publiczne instancje mają limit ok. 100 zapytań na minutę – po 429 czekamy (Retry-After) i nie pytamy.
 */

let blockedUntil = 0;

/** Tylko do testów. */
export const resetRateLimit = () => (blockedUntil = 0);

async function get(f: Fetcher, url: string, now = Date.now()): Promise<unknown> {
	if (now < blockedUntil) throw new TransitError(`HTTP 429 (${Math.ceil((blockedUntil - now) / 1000)} s)`);
	let res: Response;
	try {
		res = await f(url, { headers: { accept: 'application/json', 'user-agent': 'kalendarz-kiosk (+https://github.com/adrian-wulf/wulf-kalendarz-template)' }, signal: AbortSignal.timeout(15_000) });
	} catch (e) {
		throw new TransitError(`${new URL(url).host}: ${e instanceof Error ? e.message : e}`);
	}
	if (res.status === 429) {
		const after = Number(res.headers.get('retry-after'));
		blockedUntil = now + (Number.isFinite(after) && after > 0 ? Math.min(after, 900) : 60) * 1000;
		throw new TransitError('HTTP 429');
	}
	if (!res.ok) throw new TransitError(`HTTP ${res.status} z ${new URL(url).host}`);
	return res.json();
}

const base = (u: string) => u.replace(/\/+$/, '');

interface FptfLocation {
	type?: string;
	id?: string;
	name?: string;
	products?: Record<string, boolean>;
}

export function parseLocations(d: unknown): StopHit[] {
	if (!Array.isArray(d)) throw new TransitError('Nieoczekiwana odpowiedź (locations)');
	return (d as FptfLocation[])
		.filter((l) => (l.type === 'stop' || l.type === 'station') && l.id && l.name)
		.map((l) => ({
			id: l.id!,
			name: l.name!,
			detail: Object.entries(l.products ?? {})
				.filter(([, v]) => v)
				.map(([k]) => k)
				.join(', ')
		}));
}

export async function searchStops(f: Fetcher, apiUrl: string, query: string): Promise<StopHit[]> {
	const q = new URLSearchParams({ query, results: '8', stops: 'true', addresses: 'false', poi: 'false' });
	return parseLocations(await get(f, `${base(apiUrl)}/locations?${q}`));
}

interface FptfDeparture {
	tripId?: string;
	when?: string | null;
	plannedWhen?: string | null;
	delay?: number | null;
	platform?: string | null;
	plannedPlatform?: string | null;
	direction?: string | null;
	cancelled?: boolean;
	line?: { name?: string; product?: string; color?: { bg?: string } };
}

const COLOR = /^#[0-9a-f]{3,8}$/i;

/** Odpowiedź `/stops/:id/departures` (v6: `{ departures: [...] }`, starsze wersje: tablica). */
export function parseDepartures(d: unknown): Departure[] {
	const list = Array.isArray(d) ? d : d && typeof d === 'object' && Array.isArray((d as { departures?: unknown }).departures) ? (d as { departures: unknown[] }).departures : null;
	if (!list) throw new TransitError('Nieoczekiwana odpowiedź (departures)');
	const out: Departure[] = [];
	for (const x of list as FptfDeparture[]) {
		const planned = x.plannedWhen ?? x.when;
		if (!planned || !x.line?.name) continue;
		const bg = x.line.color?.bg;
		out.push({
			id: `${x.tripId ?? x.line.name}@${planned}`,
			line: x.line.name,
			product: x.line.product ?? '',
			direction: x.direction ?? '',
			when: x.cancelled ? null : (x.when ?? planned),
			plannedWhen: planned,
			delay: typeof x.delay === 'number' ? x.delay : null,
			cancelled: !!x.cancelled,
			platform: x.platform ?? x.plannedPlatform ?? null,
			color: bg && COLOR.test(bg) ? bg : null
		});
	}
	return out.sort((a, b) => (a.when ?? a.plannedWhen).localeCompare(b.when ?? b.plannedWhen));
}

export async function hafasDepartures(f: Fetcher, apiUrl: string, stopId: string, results = 10): Promise<Departure[]> {
	const q = new URLSearchParams({ duration: '90', results: String(results), remarks: 'false', linesOfStops: 'false' });
	return parseDepartures(await get(f, `${base(apiUrl)}/stops/${encodeURIComponent(stopId)}/departures?${q}`));
}
