import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { CalEvent } from '#lib/types.js';
import { addDays, isValidTimeZone, localParts, localTime, localZone } from '#lib/logic/dates.js';
import { t } from '#lib/i18n/index.js';
import { isDemo } from '../demo/mode.js';
import { demoFetch } from '../demo/fetch.js';
import { parseIcal, type IcalDetails, type IcalEvent } from './ical.js';
import type { Fetcher, Source } from './index.js';

/**
 * Subskrypcje kalendarzy iCal (publiczny link z Google, Outlook.com, iCloud, kalendarz szkoły / klubu).
 *
 * Pobieranie jest bezpieczne wobec SSRF: tylko http(s) (webcal:// → https://), adres musi wskazywać
 * publiczny internet – pętla zwrotna, sieć lokalna, link-local (np. metadane chmury 169.254.169.254),
 * CGNAT/Tailscale i multicast są zablokowane, także po przekierowaniu (każdy skok sprawdzany osobno).
 * Kalendarz w sieci domowej (Nextcloud na NAS-ie) – `ICAL_ALLOW_PRIVATE=1` w `.env`.
 * Limit 5 MB, 15 s, odpowiedź musi być kalendarzem (BEGIN:VCALENDAR).
 *
 * iCal URL subscriptions with an SSRF-safe fetch (public addresses only unless ICAL_ALLOW_PRIVATE=1).
 */

export const MAX_ICAL_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15_000;
/** Ile dni naprzód trzymamy wydarzenia subskrypcji (kiosk pokazuje 5 tygodni, telefon 2). */
export const SUBSCRIPTION_DAYS = 60;

/** Błąd pobrania z czytelnym komunikatem (w panelu pokazany przy formularzu, jak błąd walidacji). */
export class IcalFetchError extends Error {}

/** Adres z pola w panelu → URL (webcal:// i webcals:// jak https://). Zły adres → błąd z podpowiedzią. */
export function normalizeIcalUrl(raw: string): URL {
	const v = raw.trim().replace(/^webcals?:\/\//i, 'https://');
	let url: URL;
	try {
		url = new URL(v);
	} catch {
		throw new IcalFetchError(t('cal.err.url'));
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new IcalFetchError(t('cal.err.url'));
	if (url.username || url.password) throw new IcalFetchError(t('cal.err.url'));
	return url;
}

const v4 = (ip: string) => ip.split('.').map(Number);

/** Czy adres IP jest prywatny / lokalny / zarezerwowany (nie publiczny internet). */
export function isPrivateAddress(ip: string): boolean {
	const kind = isIP(ip);
	if (kind === 4) {
		const [a, b, c] = v4(ip);
		return (
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) || // CGNAT, też Tailscale
			(a === 169 && b === 254) || // link-local, metadane chmury
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 192 && b === 0 && c === 0) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224 // multicast, zarezerwowane, broadcast
		);
	}
	if (kind === 6) {
		const x = ip.toLowerCase();
		const mapped = x.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/);
		if (mapped) return isPrivateAddress(mapped[1]);
		if (x === '::' || x === '::1') return true;
		const first = parseInt(x.split(':')[0] || '0', 16);
		return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00;
	}
	return true;
}

export type Lookup = (host: string) => Promise<string[]>;

const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Adres musi prowadzić do publicznego internetu (wszystkie adresy z DNS). `ICAL_ALLOW_PRIVATE=1` wyłącza
 * sprawdzanie (kalendarz w sieci domowej, testy z lokalnym serwerem).
 */
export async function assertPublicHost(url: URL, resolve: Lookup = dnsLookup, env: Record<string, string | undefined> = process.env) {
	if (env.ICAL_ALLOW_PRIVATE === '1' || env.ICAL_ALLOW_PRIVATE === 'true') return;
	const host = url.hostname.replace(/^\[|\]$/g, '');
	if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new IcalFetchError(t('cal.err.private'));
	let addrs: string[];
	try {
		addrs = isIP(host) ? [host] : await resolve(host);
	} catch {
		throw new IcalFetchError(t('cal.err.dns', { host }));
	}
	if (!addrs.length || addrs.some(isPrivateAddress)) throw new IcalFetchError(t('cal.err.private'));
}

/** Sprawdzenie adresu przed pobraniem: w demo (atrapy, `demoFetch`) nic nie wychodzi do sieci, więc bez DNS. */
const defaultCheck = (f: Fetcher) => (url: URL) => (isDemo() || f === demoFetch ? Promise.resolve() : assertPublicHost(url));

async function readLimited(res: Response, max: number): Promise<string> {
	const len = Number(res.headers.get('content-length') ?? 0);
	if (len > max) throw new IcalFetchError(t('cal.err.tooBig'));
	if (!res.body) return '';
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > max) {
			await reader.cancel().catch(() => {});
			throw new IcalFetchError(t('cal.err.tooBig'));
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Pobiera kalendarz z adresu: przekierowania ręcznie (każdy adres sprawdzony), limit rozmiaru,
 * czytelne błędy dla osoby w panelu (strona zamiast kalendarza, 404, adres w sieci lokalnej…).
 */
export async function fetchIcalText(f: Fetcher, raw: string, check: (u: URL) => Promise<void> = defaultCheck(f)): Promise<string> {
	let url = normalizeIcalUrl(raw);
	for (let hop = 0; ; hop++) {
		await check(url);
		let res: Response;
		try {
			res = await f(url.href, { redirect: 'manual', headers: { accept: 'text/calendar, */*;q=0.5' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (e) {
			const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
			throw new IcalFetchError(timeout ? t('cal.err.timeout', { host: url.host }) : t('cal.err.network', { host: url.host }));
		}
		if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
			if (hop >= MAX_REDIRECTS) throw new IcalFetchError(t('cal.err.redirects'));
			url = normalizeIcalUrl(new URL(res.headers.get('location')!, url).href);
			continue;
		}
		if (res.status === 401 || res.status === 403) throw new IcalFetchError(t('cal.err.private401'));
		if (res.status === 404 || res.status === 410) throw new IcalFetchError(t('cal.err.notFound'));
		if (!res.ok) throw new IcalFetchError(t('cal.err.http', { status: res.status, host: url.host }));
		const text = await readLimited(res, MAX_ICAL_BYTES);
		if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcalFetchError(/<html|<!doctype/i.test(text) ? t('cal.err.html') : t('cal.err.notCalendar'));
		return text;
	}
}

/** Strefy z Outlooka (nazwy Windows) najczęstsze w PL i DE → IANA. */
const WINDOWS_ZONES: Record<string, string> = {
	'W. Europe Standard Time': 'Europe/Berlin',
	'Central European Standard Time': 'Europe/Warsaw',
	'Central Europe Standard Time': 'Europe/Budapest',
	'Romance Standard Time': 'Europe/Paris',
	'GMT Standard Time': 'Europe/London',
	'E. Europe Standard Time': 'Europe/Chisinau',
	'FLE Standard Time': 'Europe/Kiev',
	UTC: 'UTC',
	'Coordinated Universal Time': 'UTC'
};

/** TZID z pliku → strefa IANA (także „/mozilla.org/…/Europe/Berlin” i nazwy z Outlooka); nieznana → null. */
export function ianaZone(tzid: string | null | undefined): string | null {
	if (!tzid) return null;
	const z = tzid.trim().replace(/^"|"$/g, '');
	if (WINDOWS_ZONES[z]) return WINDOWS_ZONES[z];
	if (isValidTimeZone(z) && !z.startsWith('/')) return z;
	const tail = z.split('/').filter(Boolean).slice(-2).join('/');
	return tail && isValidTimeZone(tail) ? tail : null;
}

/** Czas z pliku („…Z”, czas w strefie TZID albo „pływający”) → ISO (UTC). Pływający = strefa regionu. */
export function icalInstant(v: string, tzid: string | null): string {
	if (v.endsWith('Z')) return new Date(v).toISOString();
	const [date, time = '00:00:00'] = v.split('T');
	const [h, m, s] = time.split(':').map(Number);
	return new Date(localTime(date, h, m, ianaZone(tzid) ?? localZone()).getTime() + (s || 0) * 1000).toISOString();
}

/** Wydarzenie z pliku → wydarzenie kalendarza (warstwa `calendarId`). */
export function icalToCalEvent(e: IcalEvent & IcalDetails, calendarId: string): CalEvent {
	const ev: CalEvent = {
		id: `${calendarId}|${e.uid}`,
		title: e.summary,
		start: e.allDay ? e.start : icalInstant(e.start, e.tzid),
		end: e.allDay ? e.end : icalInstant(e.end, e.tzid),
		allDay: e.allDay,
		memberId: null,
		kind: 'event',
		calendarId
	};
	if (e.location) ev.location = e.location;
	if (e.description) ev.description = e.description.slice(0, 500);
	return ev;
}

/** Wydarzenia z tekstu kalendarza w oknie [od, do) – `from`/`to` to daty lokalne. */
export function icalEventsBetween(text: string, calendarId: string, from: string, to: string, warn?: (m: string) => void): CalEvent[] {
	const horizon = addDays(to, 1);
	return parseIcal(text, { details: true, horizon, warn })
		.map((e) => icalToCalEvent(e, calendarId))
		.filter((e) => (e.allDay ? e.end > from && e.start < to : e.end.slice(0, 10) >= from && localParts(new Date(e.start)).date < to));
}

/** Źródło do pętli synchronizacji: jedna subskrypcja (nazwa źródła = id warstwy). */
export function subscriptionSource(sub: { id: string; url: string; refreshMinutes: number }): Source<CalEvent[]> {
	return {
		name: sub.id,
		intervalMs: Math.max(15, sub.refreshMinutes) * 60_000,
		async fetch(f, now) {
			const today = localParts(now).date;
			const text = await fetchIcalText(f, sub.url);
			return icalEventsBetween(text, sub.id, addDays(today, -1), addDays(today, SUBSCRIPTION_DAYS), (m) => console.warn(`[ical] ${sub.id}: ${m}`));
		}
	};
}
