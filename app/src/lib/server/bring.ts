import { appFetch } from './net.js';
import { eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { secrets } from './db/schema.js';
import type { ShoppingItem } from '#lib/types.js';
import { iconFor } from '#lib/products.js';
import type { Fetcher } from './sources/index.js';
import { getLang, LOCALES, t, type Lang } from '#lib/i18n/index.js';

/**
 * Bring! przez nieoficjalne API (to samo, którego używa integracja Home Assistant).
 * Produkty z katalogu mają niemieckie klucze (np. „Milch”) – tłumaczymy je katalogiem w języku
 * interfejsu (pl-PL, de-DE, en-GB).
 */

const API = 'https://api.getbring.com/rest';
const API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp';
/** Katalog artykułów Bring! w danym języku (klucz niemiecki → nazwa). */
export const catalogUrl = (lang: Lang = getLang()) => `https://web.getbring.com/locale/articles.${LOCALES[lang]}.json`;

interface BringAuth {
	email: string;
	password: string;
	uuid: string;
	accessToken: string;
	refreshToken: string;
	expires: number;
}

export interface BringConfig {
	listUuid: string;
	listName: string;
}

function getSecret<T>(db: DB, key: string): T | null {
	const row = db.select().from(secrets).where(eq(secrets.key, key)).get();
	return row ? (JSON.parse(row.value) as T) : null;
}

function setSecret(db: DB, key: string, value: unknown) {
	if (value === null) return void db.delete(secrets).where(eq(secrets.key, key)).run();
	const v = JSON.stringify(value);
	db.insert(secrets).values({ key, value: v }).onConflictDoUpdate({ target: secrets.key, set: { value: v } }).run();
}

export const getBringConfig = (db: DB) => getSecret<BringConfig>(db, 'bring.config');
export const setBringConfig = (db: DB, c: BringConfig | null) => setSecret(db, 'bring.config', c);
export const bringEmail = (db: DB) => getSecret<BringAuth>(db, 'bring.auth')?.email ?? null;
export const isBringReady = (db: DB) => !!getSecret<BringAuth>(db, 'bring.auth') && !!getBringConfig(db);

export function bringDisconnect(db: DB) {
	setSecret(db, 'bring.auth', null);
	setBringConfig(db, null);
}

export class BringError extends Error {}

const baseHeaders = { 'X-BRING-API-KEY': API_KEY, 'X-BRING-CLIENT': 'webApp', 'X-BRING-CLIENT-SOURCE': 'webApp', 'X-BRING-COUNTRY': 'DE' };

async function authRequest(f: Fetcher, path: string, body: Record<string, string>) {
	const r = await f(`${API}${path}`, {
		method: 'POST',
		headers: { ...baseHeaders, 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(body),
		signal: AbortSignal.timeout(15_000)
	});
	if (r.status === 401 || r.status === 400) throw new BringError(t('bring.err.login'));
	if (!r.ok) throw new BringError(`Bring!: HTTP ${r.status}`);
	return (await r.json()) as { uuid?: string; access_token: string; refresh_token?: string; expires_in?: number };
}

/** Logowanie e-mailem i hasłem (konto założone przez „Zaloguj przez Google” tu nie zadziała). */
export async function bringLogin(db: DB, email: string, password: string, f: Fetcher = appFetch) {
	const d = await authRequest(f, '/v2/bringauth', { email, password });
	if (!d.uuid) throw new BringError(t('bring.err.uuid'));
	setSecret(db, 'bring.auth', {
		email,
		password,
		uuid: d.uuid,
		accessToken: d.access_token,
		refreshToken: d.refresh_token ?? '',
		expires: Date.now() + (d.expires_in ?? 3600) * 1000
	} satisfies BringAuth);
}

async function auth(db: DB, f: Fetcher): Promise<BringAuth> {
	const a = getSecret<BringAuth>(db, 'bring.auth');
	if (!a) throw new BringError(t('bring.err.notConnected'));
	if (a.expires - 60_000 > Date.now()) return a;
	try {
		const d = await authRequest(f, '/v2/bringauth/token', { grant_type: 'refresh_token', refresh_token: a.refreshToken });
		const next = { ...a, accessToken: d.access_token, refreshToken: d.refresh_token ?? a.refreshToken, expires: Date.now() + (d.expires_in ?? 3600) * 1000 };
		setSecret(db, 'bring.auth', next);
		return next;
	} catch {
		// Odświeżenie nie wyszło – logujemy się ponownie zapisanym hasłem.
		await bringLogin(db, a.email, a.password, f);
		return getSecret<BringAuth>(db, 'bring.auth')!;
	}
}

async function api<T>(db: DB, f: Fetcher, path: string, init: RequestInit = {}): Promise<T> {
	const a = await auth(db, f);
	const r = await f(`${API}${path}`, {
		...init,
		headers: { ...baseHeaders, authorization: `Bearer ${a.accessToken}`, 'X-BRING-USER-UUID': a.uuid, ...init.headers },
		signal: AbortSignal.timeout(15_000)
	});
	if (!r.ok) throw new BringError(`Bring!: HTTP ${r.status}`);
	const text = await r.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

export async function bringLists(db: DB, f: Fetcher = appFetch): Promise<{ listUuid: string; name: string }[]> {
	const a = await auth(db, f);
	const d = await api<{ lists: { listUuid: string; name: string }[] }>(db, f, `/bringusers/${a.uuid}/lists`);
	return d.lists.map(({ listUuid, name }) => ({ listUuid, name }));
}

// Katalog: klucz niemiecki → nazwa w języku interfejsu (i odwrotnie), ładowany raz na dobę dla każdego języka.
interface Catalog {
	key2name: Map<string, string>;
	name2key: Map<string, string>;
	at: number;
}
const catalogs = new Map<Lang, Catalog>();

async function getCatalog(f: Fetcher, lang: Lang = getLang()): Promise<Catalog> {
	const cached = catalogs.get(lang);
	if (cached && Date.now() - cached.at < 86_400_000) return cached;
	try {
		const r = await f(catalogUrl(lang), { signal: AbortSignal.timeout(15_000) });
		const d = (await r.json()) as Record<string, string>;
		const key2name = new Map(Object.entries(d).filter(([, v]) => typeof v === 'string'));
		const name2key = new Map([...key2name].map(([key, name]) => [name.toLowerCase(), key]));
		const c = { key2name, name2key, at: Date.now() };
		catalogs.set(lang, c);
		return c;
	} catch {
		const c = cached ?? { key2name: new Map(), name2key: new Map(), at: 0 };
		catalogs.set(lang, c);
		return c;
	}
}

/** Podpowiedzi z katalogu Bring! w języku interfejsu (gdy jest połączony). */
export async function bringCatalogNames(f: Fetcher = appFetch): Promise<string[]> {
	return [...(await getCatalog(f)).key2name.values()];
}

// API zwraca pozycje raz jako {itemId}, raz jako {name} – i płasko, i w `items`.
interface BringItem {
	uuid?: string;
	itemId?: string;
	name?: string;
	specification?: string;
}

type BringList = { purchase?: BringItem[]; items?: { purchase?: BringItem[] } };

export async function fetchBring(db: DB, f: Fetcher = appFetch): Promise<ShoppingItem[]> {
	const cfg = getBringConfig(db);
	if (!cfg) throw new BringError(t('bring.err.noList'));
	const [d, cat] = await Promise.all([api<BringList>(db, f, `/v2/bringlists/${cfg.listUuid}`), getCatalog(f)]);
	return (d.items?.purchase ?? d.purchase ?? []).flatMap((i) => {
		const key = i.itemId ?? i.name;
		if (!key) return [];
		const name = cat.key2name.get(key) ?? key;
		// id niesie oryginalny klucz Bring!, żeby dało się go potem odhaczyć
		return [{ id: `b:${i.uuid ?? ''}:${key}`, name, spec: i.specification || undefined, icon: iconFor(name) }];
	});
}

async function change(db: DB, f: Fetcher, itemId: string, operation: 'TO_PURCHASE' | 'TO_RECENTLY', uuid?: string) {
	const cfg = getBringConfig(db);
	if (!cfg) throw new BringError(t('bring.err.noList'));
	await api(db, f, `/v2/bringlists/${cfg.listUuid}/items`, {
		method: 'PUT',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ changes: [{ itemId, spec: '', uuid: uuid || undefined, operation }], sender: '' })
	});
}

/** Dodanie produktu: nazwa z katalogu → klucz Bring! (ikona w telefonach), inaczej własna pozycja. */
export async function bringAdd(db: DB, name: string, f: Fetcher = appFetch) {
	const cat = await getCatalog(f);
	await change(db, f, cat.name2key.get(name.toLowerCase()) ?? name, 'TO_PURCHASE');
}

/** Odhaczenie: produkt trafia do „ostatnio kupionych”, jak w aplikacji. */
export async function bringComplete(db: DB, id: string, f: Fetcher = appFetch) {
	const m = id.match(/^b:([^:]*):(.+)$/);
	if (!m) throw new BringError(t('bring.err.itemId'));
	await change(db, f, m[2], 'TO_RECENTLY', m[1]);
}
