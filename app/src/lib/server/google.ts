import { appFetch } from './net.js';
import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { secrets } from './db/schema.js';
import type { CalEvent, Member, Note } from '#lib/types.js';
import { addDays, localZone } from '#lib/logic/dates.js';
import type { Fetcher } from './sources/index.js';
import { t } from '#lib/i18n/index.js';

/**
 * Google Calendar przez REST (bez biblioteki googleapis).
 * Sekrety (klient OAuth, refresh token) leżą w tabeli `secrets` i nie trafiają do przeglądarki.
 */

export const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
export const CALLBACK_PATH = '/admin/google/callback';

/**
 * Adres powrotu z Google. Kolejność: pełny GOOGLE_REDIRECT_URI, potem PUBLIC_ORIGIN,
 * a domyślnie adres, pod którym otwarto panel (np. https://<host>.<tailnet>.ts.net).
 * Ten sam adres trzeba wpisać w Google Cloud jako „Authorized redirect URI”.
 */
export function googleRedirectUri(requestOrigin: string, env: Record<string, string | undefined> = process.env): string {
	if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
	const origin = (env.PUBLIC_ORIGIN || requestOrigin).replace(/\/+$/, '');
	return origin + CALLBACK_PATH;
}
const API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleClient {
	id: string;
	secret: string;
}

/** Które kalendarze konta rodzinnego pełnią jaką rolę. */
export interface GoogleRoles {
	family: string | null; // „Rodzina” – zapisy z kiosku
	notes: string | null; // „Kartki”
	kita: string | null; // „Kita”
	birthdays: string | null; // urodziny (np. kontakty Google)
}

export const NO_ROLES: GoogleRoles = { family: null, notes: null, kita: null, birthdays: null };

function getSecret<T>(db: DB, key: string): T | null {
	const row = db.select().from(secrets).where(eq(secrets.key, key)).get();
	return row ? (JSON.parse(row.value) as T) : null;
}

function setSecret(db: DB, key: string, value: unknown) {
	if (value === null) return void db.delete(secrets).where(eq(secrets.key, key)).run();
	const v = JSON.stringify(value);
	db.insert(secrets).values({ key, value: v }).onConflictDoUpdate({ target: secrets.key, set: { value: v } }).run();
}

export const getClient = (db: DB) => getSecret<GoogleClient>(db, 'google.client');
export const setClient = (db: DB, c: GoogleClient | null) => setSecret(db, 'google.client', c);
export const getRoles = (db: DB) => getSecret<GoogleRoles>(db, 'google.roles') ?? NO_ROLES;
export const setRoles = (db: DB, r: GoogleRoles) => setSecret(db, 'google.roles', r);
export const isConnected = (db: DB) => !!getSecret<string>(db, 'google.refresh') && !!getClient(db);

export function disconnect(db: DB) {
	setSecret(db, 'google.refresh', null);
	accessToken = null;
}

export function authUrl(client: GoogleClient, state: string, redirectUri: string): string {
	const p = new URLSearchParams({
		client_id: client.id,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: SCOPES.join(' '),
		access_type: 'offline',
		prompt: 'consent',
		include_granted_scopes: 'true',
		state
	});
	return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(f: Fetcher, body: Record<string, string>) {
	const r = await f('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body),
		signal: AbortSignal.timeout(15_000)
	});
	const d = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
	if (!r.ok || !d.access_token) {
		if (d.error === 'invalid_grant') throw new GoogleError('reauth', REAUTH_MSG);
		throw new GoogleError('token', d.error_description ?? d.error ?? `HTTP ${r.status}`);
	}
	return d;
}

export class GoogleError extends Error {
	constructor(
		public code: 'reauth' | 'token' | 'api' | 'config',
		message: string
	) {
		super(message);
	}
}

let accessToken: { token: string; expires: number } | null = null;

export const REAUTH_MSG = 'Zaloguj ponownie konto Google w panelu';

export async function exchangeCode(db: DB, code: string, redirectUri: string, f: Fetcher = appFetch) {
	const c = getClient(db);
	if (!c) throw new GoogleError('config', 'Brak klienta OAuth');
	const d = await tokenRequest(f, { code, client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
	if (!d.refresh_token) throw new GoogleError('token', t('google.err.noRefresh'));
	setSecret(db, 'google.refresh', d.refresh_token);
	accessToken = { token: d.access_token!, expires: Date.now() + (d.expires_in ?? 3600) * 1000 };
}

async function token(db: DB, f: Fetcher): Promise<string> {
	if (accessToken && accessToken.expires - 60_000 > Date.now()) return accessToken.token;
	const c = getClient(db);
	const refresh = getSecret<string>(db, 'google.refresh');
	if (!c || !refresh) throw new GoogleError('config', t('google.err.notConnected'));
	const d = await tokenRequest(f, { refresh_token: refresh, client_id: c.id, client_secret: c.secret, grant_type: 'refresh_token' });
	accessToken = { token: d.access_token!, expires: Date.now() + (d.expires_in ?? 3600) * 1000 };
	return accessToken.token;
}

async function api<T>(db: DB, f: Fetcher, path: string, init: RequestInit = {}): Promise<T> {
	const r = await f(API + path, {
		...init,
		headers: { authorization: `Bearer ${await token(db, f)}`, 'content-type': 'application/json', ...init.headers },
		signal: AbortSignal.timeout(15_000)
	});
	if (r.status === 401) {
		accessToken = null;
		throw new GoogleError('reauth', REAUTH_MSG);
	}
	if (!r.ok) throw new GoogleError('api', `Google API: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
	return (r.status === 204 ? undefined : await r.json()) as T;
}

export interface GCalendar {
	id: string;
	summary: string;
	accessRole: string;
	primary?: boolean;
}

export async function listCalendars(db: DB, f: Fetcher = appFetch): Promise<GCalendar[]> {
	const d = await api<{ items: GCalendar[] }>(db, f, '/users/me/calendarList?maxResults=250');
	return d.items.map(({ id, summary, accessRole, primary }) => ({ id, summary, accessRole, primary }));
}

interface GEvent {
	id: string;
	summary?: string;
	description?: string;
	location?: string;
	status?: string;
	start: { date?: string; dateTime?: string };
	end: { date?: string; dateTime?: string };
	creator?: { email?: string };
	extendedProperties?: { private?: Record<string, string> };
}

async function listEvents(db: DB, f: Fetcher, calendarId: string, timeMin: string, timeMax: string): Promise<GEvent[]> {
	const out: GEvent[] = [];
	let pageToken = '';
	do {
		const p = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
		if (pageToken) p.set('pageToken', pageToken);
		const d = await api<{ items: GEvent[]; nextPageToken?: string }>(db, f, `/calendars/${encodeURIComponent(calendarId)}/events?${p}`);
		out.push(...d.items.filter((e) => e.status !== 'cancelled'));
		pageToken = d.nextPageToken ?? '';
	} while (pageToken);
	return out;
}

const MEMBER_KEY = 'kalendarzMemberId';

/** Prefiks „Mama: ” w tytule ułatwia czytanie w telefonie – na kiosku go zdejmujemy. */
function stripPrefix(title: string, member?: Member) {
	return member && title.startsWith(`${member.name}: `) ? title.slice(member.name.length + 2) : title;
}

export function toCalEvent(e: GEvent, calId: string, kind: CalEvent['kind'], memberId: string | null, members: Member[]): CalEvent {
	const allDay = !!e.start.date;
	const m = members.find((x) => x.id === memberId);
	return {
		id: `g:${calId}:${e.id}`,
		title: stripPrefix(e.summary ?? t('google.untitled'), m),
		start: allDay ? e.start.date! : new Date(e.start.dateTime!).toISOString(),
		end: allDay ? e.end.date! : new Date(e.end.dateTime!).toISOString(),
		allDay,
		memberId,
		kind,
		location: e.location,
		description: e.description,
		calendarId: `google:${calId}`
	};
}

export interface GoogleData {
	events: CalEvent[];
	notes: Note[];
}

/** Pobiera wydarzenia wszystkich skonfigurowanych kalendarzy na zakres [today-1, today+days]. */
export async function fetchGoogle(
	db: DB,
	members: (Member & { calendarIds: string[]; emails: string[] })[],
	today: string,
	now: Date,
	f: Fetcher = appFetch,
	days = 40
): Promise<GoogleData> {
	const roles = getRoles(db);
	const timeMin = `${addDays(today, -1)}T00:00:00Z`;
	const timeMax = `${addDays(today, days)}T00:00:00Z`;
	const events: CalEvent[] = [];

	for (const m of members) {
		for (const cal of m.calendarIds) {
			for (const e of await listEvents(db, f, cal, timeMin, timeMax)) events.push(toCalEvent(e, cal, 'event', m.id, members));
		}
	}
	if (roles.family) {
		for (const e of await listEvents(db, f, roles.family, timeMin, timeMax)) {
			const mid = e.extendedProperties?.private?.[MEMBER_KEY] ?? null;
			events.push(toCalEvent(e, roles.family, 'event', members.some((m) => m.id === mid) ? mid : null, members));
		}
	}
	if (roles.kita) {
		for (const e of await listEvents(db, f, roles.kita, timeMin, timeMax)) events.push(toCalEvent(e, roles.kita, 'kita', null, members));
	}
	if (roles.birthdays) {
		for (const e of await listEvents(db, f, roles.birthdays, timeMin, timeMax)) events.push(toCalEvent(e, roles.birthdays, 'birthday', null, members));
	}

	const notes: Note[] = [];
	if (roles.notes) {
		const nowIso = now.toISOString();
		for (const e of await listEvents(db, f, roles.notes, addDays(today, -7) + 'T00:00:00Z', `${addDays(today, 2)}T00:00:00Z`)) {
			const ev = toCalEvent(e, roles.notes, 'event', null, members);
			// Kartka wisi od początku do końca wydarzenia.
			const startIso = ev.allDay ? new Date(ev.start + 'T00:00:00Z').toISOString() : ev.start;
			const endIso = ev.allDay ? new Date(ev.end + 'T00:00:00Z').toISOString() : ev.end;
			if (startIso > nowIso || endIso <= nowIso) continue;
			const byProp = e.extendedProperties?.private?.[MEMBER_KEY];
			// Autor po e-mailu: wpisanym w panelu albo równym identyfikatorowi głównego kalendarza (to adres Gmail).
			const creator = e.creator?.email?.toLowerCase();
			const byEmail = members.find((m) => [...m.emails, ...m.calendarIds].some((x) => x.toLowerCase() === creator))?.id;
			notes.push({ id: ev.id, text: e.summary ?? '', memberId: (byProp && members.some((m) => m.id === byProp) ? byProp : byEmail) ?? null, expiresAt: endIso });
		}
	}
	return { events, notes };
}

/** Wydarzenie z kiosku → kalendarz „Rodzina”. */
export async function insertFamilyEvent(
	db: DB,
	ev: { title: string; memberId: string | null; start: string; end: string; allDay: boolean },
	member: Member | undefined,
	f: Fetcher = appFetch
) {
	const cal = getRoles(db).family;
	if (!cal) throw new GoogleError('config', t('google.err.noFamily'));
	const body = {
		summary: member ? `${member.name}: ${ev.title}` : ev.title,
		start: ev.allDay ? { date: ev.start } : { dateTime: ev.start, timeZone: localZone() },
		end: ev.allDay ? { date: ev.end } : { dateTime: ev.end, timeZone: localZone() },
		extendedProperties: { private: ev.memberId ? { [MEMBER_KEY]: ev.memberId } : {} }
	};
	return api<GEvent>(db, f, `/calendars/${encodeURIComponent(cal)}/events`, { method: 'POST', body: JSON.stringify(body) });
}

/** Kartka z kiosku → kalendarz „Kartki” (od teraz do wygaśnięcia). */
export async function insertNote(db: DB, n: { text: string; memberId: string | null; expiresAt: string }, now: Date, f: Fetcher = appFetch) {
	const cal = getRoles(db).notes;
	if (!cal) throw new GoogleError('config', t('google.err.noNotes'));
	const body = {
		summary: n.text,
		start: { dateTime: now.toISOString(), timeZone: localZone() },
		end: { dateTime: n.expiresAt, timeZone: localZone() },
		extendedProperties: { private: n.memberId ? { [MEMBER_KEY]: n.memberId } : {} }
	};
	return api<GEvent>(db, f, `/calendars/${encodeURIComponent(cal)}/events`, { method: 'POST', body: JSON.stringify(body) });
}

/** Usunięcie wydarzenia po identyfikatorze `g:<kalendarz>:<id>`. */
/** Zmiana kartki (treść, autor, do kiedy) – tylko w kalendarzu „Kartki”. */
export async function updateNote(db: DB, id: string, n: { text: string; memberId: string | null; expiresAt: string }, f: Fetcher = appFetch) {
	const m = id.match(/^g:(.+):([^:]+)$/);
	if (!m || m[1] !== getRoles(db).notes) throw new GoogleError('config', t('google.err.notNote'));
	await api(db, f, `/calendars/${encodeURIComponent(m[1])}/events/${encodeURIComponent(m[2])}`, {
		method: 'PATCH',
		body: JSON.stringify({
			summary: n.text,
			end: { dateTime: n.expiresAt, timeZone: localZone() },
			extendedProperties: { private: { [MEMBER_KEY]: n.memberId ?? '' } }
		})
	});
}

export async function deleteById(db: DB, id: string, f: Fetcher = appFetch) {
	const m = id.match(/^g:(.+):([^:]+)$/);
	if (!m) throw new GoogleError('config', t('google.err.eventId'));
	const roles = getRoles(db);
	// Kiosk może kasować tylko we własnych kalendarzach rodziny – nigdy w prywatnych domowników.
	if (m[1] !== roles.notes && m[1] !== roles.family) throw new GoogleError('config', t('google.err.readOnly'));
	await api(db, f, `/calendars/${encodeURIComponent(m[1])}/events/${encodeURIComponent(m[2])}`, { method: 'DELETE' });
}
