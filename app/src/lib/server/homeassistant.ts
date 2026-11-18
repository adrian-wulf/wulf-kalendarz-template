import { appFetch } from './net.js';
import { asc, eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { haEntities, secrets } from './db/schema.js';
import type { Fetcher, Source } from './sources/index.js';
import { InputError } from './store.js';
import { getSetting, readCache } from './sync.js';
import { moduleConfig } from '#lib/modules/index.js';
import { haSettings } from '#lib/modules/homeassistant/index.js';
import type { HaEntityView, HaKind, HaTileData } from '#lib/modules/p3c.js';
import { locale, t } from '#lib/i18n/index.js';

/**
 * Home Assistant przez REST API. Adres i długoterminowy token leżą w tabeli `secrets`
 * i nigdy nie trafiają do przeglądarki: stan encji pobiera serwer (pętla synchronizacji),
 * przełączanie i obraz z kamery idą przez trasy `/api/homeassistant/...` tej aplikacji.
 * Kiosk może dotknąć tylko encji wybranych w panelu; zamków nie otwiera nigdy.
 */

const AUTH_KEY = 'homeassistant.auth';

export interface HaAuth {
	url: string;
	token: string;
}

export class HaError extends Error {}

export function getHaAuth(db: DB): HaAuth | null {
	const row = db.select().from(secrets).where(eq(secrets.key, AUTH_KEY)).get();
	return row ? (JSON.parse(row.value) as HaAuth) : null;
}

function setHaAuth(db: DB, v: HaAuth | null) {
	if (!v) return void db.delete(secrets).where(eq(secrets.key, AUTH_KEY)).run();
	const value = JSON.stringify(v);
	db.insert(secrets).values({ key: AUTH_KEY, value }).onConflictDoUpdate({ target: secrets.key, set: { value } }).run();
}

export const haConfig = (db: DB) => moduleConfig(haSettings, getSetting(db, 'modules'), 'homeassistant');

/** Co panel może pokazać: adres i końcówka tokenu (sam token nigdy). */
export function haPublic(db: DB): { url: string | null; tokenHint: string | null } {
	const a = getHaAuth(db);
	return { url: a?.url ?? null, tokenHint: a ? `…${a.token.slice(-4)}` : null };
}

/** „http://ha.local:8123/” → „http://ha.local:8123”; tylko http(s), bez ścieżki z danymi logowania. */
export function normalizeUrl(raw: string): string {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		throw new InputError(t('ha.err.url'));
	}
	if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password) throw new InputError(t('ha.err.url'));
	return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

/** Zapis z panelu: puste pole tokenu = zostaw zapisany. */
export function saveHaAuth(db: DB, f: FormData) {
	const url = normalizeUrl(String(f.get('url') ?? ''));
	const token = String(f.get('token') ?? '').trim() || getHaAuth(db)?.token;
	if (!token) throw new InputError(t('ha.err.token'));
	if (token.length > 1000 || /\s/.test(token)) throw new InputError(t('ha.err.token'));
	setHaAuth(db, { url, token });
}

export const haDisconnect = (db: DB) => setHaAuth(db, null);

const ID = /^[a-z_]+\.[a-z0-9_]+$/;
export const isEntityId = (v: unknown): v is string => typeof v === 'string' && ID.test(v) && v.length <= 255;

async function haFetch(f: Fetcher, auth: HaAuth, path: string, init: RequestInit = {}, timeout = 10_000): Promise<Response> {
	let res: Response;
	try {
		res = await f(`${auth.url}${path}`, {
			...init,
			headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${auth.token}` },
			signal: AbortSignal.timeout(timeout),
			redirect: 'error'
		});
	} catch (e) {
		throw new HaError(t('ha.err.unreachable', { error: e instanceof Error ? e.message : String(e) }));
	}
	if (res.status === 401 || res.status === 403) throw new HaError(t('ha.err.auth'));
	if (!res.ok) throw new HaError(`Home Assistant: HTTP ${res.status}`);
	return res;
}

export interface HaState {
	entity_id: string;
	state: string;
	attributes: Record<string, unknown>;
}

/** Wszystkie stany (`GET /api/states`). */
export async function fetchStates(f: Fetcher, auth: HaAuth): Promise<HaState[]> {
	const d = await (await haFetch(f, auth, '/api/states', { headers: { accept: 'application/json' } })).json();
	if (!Array.isArray(d)) throw new HaError('Home Assistant: nieoczekiwana odpowiedź');
	return d as HaState[];
}

/** Domeny, które pokazujemy w panelu do wyboru. */
export const PICKABLE = ['sensor', 'binary_sensor', 'light', 'switch', 'lock', 'camera', 'climate', 'cover', 'input_boolean', 'fan'] as const;

export const domainOf = (id: string) => id.split('.')[0];

export function kindOf(id: string): HaKind {
	const d = domainOf(id);
	if (d === 'input_boolean' || d === 'fan') return 'switch';
	return (['sensor', 'binary_sensor', 'light', 'switch', 'lock', 'camera', 'climate', 'cover'] as const).find((k) => k === d) ?? 'other';
}

/** Przełączalne z kiosku (świadomie bez zamków, bram i alarmów). */
export const canToggle = (id: string) => ['light', 'switch', 'input_boolean', 'fan'].includes(domainOf(id));

const ICONS: Record<HaKind, string> = { sensor: '🌡', binary_sensor: '◉', light: '💡', switch: '🔌', lock: '🔒', camera: '📷', climate: '♨', cover: '🪟', other: '•' };

const num = (s: string) => {
	const n = Number(s);
	return Number.isFinite(n) ? n : null;
};

/** Stan encji do pokazania na kafelku. */
export function viewOf(s: HaState | undefined, entityId: string, label: string, toggleAllowed = true): HaEntityView {
	const kind = kindOf(entityId);
	const attrs = s?.attributes ?? {};
	const name = label || (typeof attrs.friendly_name === 'string' ? attrs.friendly_name : entityId);
	const raw = s?.state ?? 'unavailable';
	const unavailable = raw === 'unavailable' || raw === 'unknown';
	let state = raw;
	let active = false;
	const unit = typeof attrs.unit_of_measurement === 'string' ? attrs.unit_of_measurement : '';
	if (kind === 'sensor') {
		const n = num(raw);
		state = n !== null ? `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(n)}${unit ? ` ${unit}` : ''}` : raw;
	} else if (kind === 'lock') {
		active = raw === 'locked';
		state = t(`ha.lock.${raw === 'locked' ? 'locked' : raw === 'unlocked' ? 'unlocked' : raw === 'jammed' ? 'jammed' : 'other'}`);
	} else if (kind === 'climate') {
		const cur = num(String(attrs.current_temperature ?? ''));
		state = cur !== null ? `${cur} °` : raw;
		active = raw !== 'off';
	} else if (kind === 'cover') {
		active = raw === 'open';
		state = t(raw === 'open' ? 'ha.cover.open' : raw === 'closed' ? 'ha.cover.closed' : 'ha.unknown');
	} else if (kind === 'light' || kind === 'switch' || kind === 'binary_sensor') {
		active = raw === 'on';
		state = t(raw === 'on' ? 'ha.on' : raw === 'off' ? 'ha.off' : 'ha.unknown');
	}
	if (unavailable) state = t('ha.unavailable');
	return { entityId, label: name, kind, state, active, unavailable, toggle: toggleAllowed && canToggle(entityId) && !unavailable, icon: ICONS[kind] };
}

export function selectedEntities(db: DB) {
	return db.select().from(haEntities).orderBy(asc(haEntities.sortOrder), asc(haEntities.entityId)).all();
}

/** Źródło: stany wybranych encji co `refreshSeconds` (tylko gdy jest token i coś wybrano). */
export function haSource(db: DB): Source<HaState[]> | null {
	const auth = getHaAuth(db);
	if (!auth || !selectedEntities(db).length) return null;
	return {
		name: 'homeassistant',
		intervalMs: haConfig(db).refreshSeconds * 1000,
		async fetch(f) {
			const ids = new Set(selectedEntities(db).map((e) => e.entityId));
			// Do bazy tylko wybrane encje i potrzebne atrybuty.
			return (await fetchStates(f, auth))
				.filter((s) => ids.has(s.entity_id))
				.map((s) => ({
					entity_id: s.entity_id,
					state: s.state,
					attributes: Object.fromEntries(
						['friendly_name', 'unit_of_measurement', 'current_temperature', 'device_class'].filter((k) => k in s.attributes).map((k) => [k, s.attributes[k]])
					)
				}));
		}
	};
}

export function haTile(db: DB): { data: HaTileData; status: Record<string, ReturnType<typeof readCache>['status']> } {
	const auth = getHaAuth(db);
	const c = haConfig(db);
	const { data, status } = readCache<HaState[]>(db, 'homeassistant');
	const byId = new Map((data ?? []).map((s) => [s.entity_id, s]));
	const sel = selectedEntities(db);
	return {
		data: {
			configured: !!auth,
			error: auth && sel.length ? (status.error ?? null) : null,
			entities: sel.filter((e) => kindOf(e.entityId) !== 'camera').map((e) => viewOf(byId.get(e.entityId), e.entityId, e.label, c.allowToggle)),
			cameras: sel
				.filter((e) => kindOf(e.entityId) === 'camera')
				.map((e) => ({ entityId: e.entityId, label: e.label || (byId.get(e.entityId)?.attributes.friendly_name as string | undefined) || e.entityId })),
			cameraSeconds: c.cameraSeconds
		},
		status: { homeassistant: status }
	};
}

function selectedOrThrow(db: DB, id: unknown) {
	if (!isEntityId(id)) throw new InputError(t('ha.err.entity'));
	const row = db.select().from(haEntities).where(eq(haEntities.entityId, id)).get();
	if (!row) throw new InputError(t('ha.err.entity'));
	return row;
}

/** Przełączenie z kiosku: tylko wybrana encja, tylko światło/gniazdko, tylko gdy panel pozwala. */
export async function toggleEntity(db: DB, id: unknown, f: Fetcher = appFetch) {
	const row = selectedOrThrow(db, id);
	if (!haConfig(db).allowToggle || !canToggle(row.entityId)) throw new InputError(t('ha.err.noToggle'));
	const auth = getHaAuth(db);
	if (!auth) throw new HaError(t('ha.err.notConfigured'));
	await haFetch(f, auth, `/api/services/${domainOf(row.entityId)}/toggle`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ entity_id: row.entityId })
	});
}

/** Obraz z kamery przez `camera_proxy` HA – tylko kamery wybrane w panelu. */
export async function cameraSnapshot(db: DB, id: unknown, f: Fetcher = appFetch): Promise<{ body: ArrayBuffer; type: string }> {
	const row = selectedOrThrow(db, id);
	if (kindOf(row.entityId) !== 'camera') throw new InputError(t('ha.err.entity'));
	const auth = getHaAuth(db);
	if (!auth) throw new HaError(t('ha.err.notConfigured'));
	const res = await haFetch(f, auth, `/api/camera_proxy/${row.entityId}`, {}, 15_000);
	// Tylko obrazy rastrowe – SVG z cudzego serwera pod naszym adresem mógłby wykonać skrypt.
	const type = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim().toLowerCase();
	if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type)) throw new HaError('Home Assistant: kamera nie zwróciła obrazu');
	const body = await res.arrayBuffer();
	if (body.byteLength > 10 * 1024 * 1024) throw new HaError('Home Assistant: obraz za duży');
	return { body, type };
}

/** Lista encji do wyboru w panelu (z HA na żywo). */
export async function pickableEntities(db: DB, f: Fetcher = appFetch) {
	const auth = getHaAuth(db);
	if (!auth) return [];
	return (await fetchStates(f, auth))
		.filter((s) => (PICKABLE as readonly string[]).includes(domainOf(s.entity_id)))
		.map((s) => ({ entityId: s.entity_id, name: typeof s.attributes.friendly_name === 'string' ? s.attributes.friendly_name : s.entity_id, state: s.state }))
		.sort((a, b) => a.entityId.localeCompare(b.entityId));
}

/** Zapis wyboru z panelu: zaznaczone encje + własne etykiety (kolejność jak na liście). */
export function saveEntities(db: DB, f: FormData) {
	const ids = f.getAll('entity').map(String);
	if (ids.length > 40 || !ids.every(isEntityId)) throw new InputError(t('ha.err.entity'));
	db.transaction((tx) => {
		tx.delete(haEntities).run();
		ids.forEach((entityId, i) => {
			const label = String(f.get(`label:${entityId}`) ?? '').trim().slice(0, 40);
			tx.insert(haEntities).values({ entityId, label, sortOrder: i }).run();
		});
	});
}
