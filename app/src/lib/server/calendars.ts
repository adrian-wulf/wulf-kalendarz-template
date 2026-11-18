import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { calendars, localEvents, members, sourceCache } from './db/schema.js';
import { getRoles, isConnected } from './google.js';
import { getKv, setKv } from './kv.js';
import { InputError } from './store.js';
import { isActive } from '#lib/modules/registry.server.js';
import { DEFAULT_REFRESH, LAYER_PALETTE, REFRESH_CHOICES, type KioskLayers, type LayerChip, type LayerKind } from '#lib/calendars.js';
import type { CalEvent, Member } from '#lib/types.js';
import { t } from '#lib/i18n/index.js';

/**
 * Warstwy kalendarza („Kalendarze”): każde źródło wydarzeń to warstwa z nazwą, kolorem, ikoną,
 * opcjonalnym domownikiem, widocznością na kiosku i telefonie oraz kolejnością.
 *
 * Skąd się biorą (`resolveLayers`):
 * - Google – kalendarze z ról (Rodzina, Kita, Urodziny) i kalendarze domowników z panelu → Google,
 * - kiosk – `local` (wpisy z kiosku i panelu, gdy nie ma Google) i lokalne kalendarze z importu .ics,
 * - subskrypcje iCal (`ical:<uuid>`),
 * - generowane: urodziny domowników, wywóz śmieci, ferie, święta – gdy ich moduł jest włączony.
 * Wiersz w tabeli `calendars` to zmiany użytkownika; brak wiersza = domyślne (widoczne, kolory jak
 * przed warstwami) – dlatego aktualizacja istniejącej instalacji niczego nie ukrywa ani nie przemalowuje.
 *
 * Calendar layers: resolution from configured sources + stored overrides, visibility per surface.
 */

export type Surface = 'kiosk' | 'phone';

export interface Layer {
	id: string;
	kind: LayerKind;
	/** nazwa do pokazania (własna albo domyślna w bieżącym języku) */
	name: string;
	/** własna nazwa ('' = domyślna) */
	customName: string;
	defaultName: string;
	/** null = automatycznie */
	color: string | null;
	icon: string;
	memberId: string | null;
	/** domownik wynika z przypisania w Google (kalendarz domownika) – zmienia się tam */
	memberFromGoogle: boolean;
	showKiosk: boolean;
	showPhone: boolean;
	sortOrder: number;
	/** subskrypcja */
	url: string | null;
	refreshMinutes: number | null;
	/** rola kalendarza Google */
	role: 'family' | 'kita' | 'birthdays' | 'member' | null;
	/** można usunąć (subskrypcje i kalendarze z importu) */
	removable: boolean;
}

export const LOCAL = 'local';
export const GENERATED = ['birthdays', 'waste', 'ferien', 'holidays'] as const;

const DEFAULT_ICON: Partial<Record<LayerKind, string>> = { birthdays: '🎂', waste: '🗑', ferien: '🏖', holidays: '🎉' };

/** Nazwy kalendarzy Google zapamiętane przy odczycie listy (panel) – do nazw domyślnych. */
export const GOOGLE_NAMES = 'googleCalendarNames';

export function rememberGoogleNames(db: DB, list: { id: string; summary: string }[]) {
	setKv(db, GOOGLE_NAMES, Object.fromEntries(list.map((c) => [c.id, c.summary])));
}

type Row = typeof calendars.$inferSelect;
type Candidate = Omit<Layer, 'name' | 'customName' | 'sortOrder'> & { order: number };

const base = (id: string, kind: LayerKind, defaultName: string, order: number, extra: Partial<Candidate> = {}): Candidate => ({
	id,
	kind,
	defaultName,
	color: null,
	icon: DEFAULT_ICON[kind] ?? '',
	memberId: null,
	memberFromGoogle: false,
	showKiosk: true,
	showPhone: true,
	url: null,
	refreshMinutes: null,
	role: null,
	removable: false,
	order,
	...extra
});

/** Warstwy, które istnieją przy obecnej konfiguracji (bez zmian użytkownika). */
function candidates(db: DB, rows: Row[]): Candidate[] {
	const out: Candidate[] = [];
	const list = db.select().from(members).orderBy(asc(members.sortOrder)).all();
	if (isConnected(db)) {
		const names = getKv<Record<string, string>>(db, GOOGLE_NAMES, {});
		const roles = getRoles(db);
		if (roles.family) out.push(base(`google:${roles.family}`, 'google', t('cal.name.family'), 100, { role: 'family' }));
		list.forEach((m, i) =>
			m.calendarIds.forEach((cal, j) => {
				const summary = names[cal];
				// Jeden kalendarz domownika – samo imię; kilka – imię i nazwa kalendarza z Google.
				const name = m.calendarIds.length > 1 && summary && !summary.includes('@') ? `${m.name} · ${summary}` : m.name;
				out.push(base(`google:${cal}`, 'google', name, 200 + i * 10 + j, { role: 'member', memberId: m.id, memberFromGoogle: true }));
			})
		);
		if (roles.kita) out.push(base(`google:${roles.kita}`, 'google', t('cal.name.kita'), 300, { role: 'kita' }));
		if (roles.birthdays) out.push(base(`google:${roles.birthdays}`, 'google', t('cal.name.googleBirthdays'), 310, { role: 'birthdays', icon: '🎂' }));
	}
	out.push(base(LOCAL, 'local', t('cal.name.local'), 400));
	const created = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	created
		.filter((r) => r.kind === 'ical')
		.forEach((r, i) => out.push(base(r.id, 'ical', t('cal.name.subscription'), 500 + i, { url: r.url, refreshMinutes: r.refreshMinutes ?? DEFAULT_REFRESH, removable: true })));
	created.filter((r) => r.kind === 'local' && r.id !== LOCAL).forEach((r, i) => out.push(base(r.id, 'local', t('cal.name.imported'), 600 + i, { removable: true })));
	if (isActive(db, 'birthdays')) out.push(base('birthdays', 'birthdays', t('cal.name.birthdays'), 700));
	if (isActive(db, 'waste')) out.push(base('waste', 'waste', t('cal.name.waste'), 710));
	if (isActive(db, 'holidays')) {
		out.push(base('ferien', 'ferien', t('cal.name.ferien'), 720));
		out.push(base('holidays', 'holidays', t('cal.name.holidays'), 730));
	}
	// Ten sam kalendarz Google w dwóch rolach – zostaje pierwsza.
	return out.filter((c, i) => out.findIndex((x) => x.id === c.id) === i);
}

/** Wszystkie warstwy z ustawieniami użytkownika, w kolejności z panelu. */
export function resolveLayers(db: DB): Layer[] {
	const rows = db.select().from(calendars).all();
	const byId = new Map(rows.map((r) => [r.id, r]));
	const layers = candidates(db, rows).map((c): Layer => {
		const r = byId.get(c.id);
		const { order, ...rest } = c;
		return {
			...rest,
			name: r?.name || c.defaultName,
			customName: r?.name ?? '',
			color: r?.color ?? null,
			icon: r?.icon ?? c.icon,
			memberId: c.memberFromGoogle ? c.memberId : (r?.memberId ?? null),
			showKiosk: r?.showKiosk ?? true,
			showPhone: r?.showPhone ?? true,
			sortOrder: r?.sortOrder ?? order
		};
	});
	return layers.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Warstwa wydarzenia: zapisana w wydarzeniu albo z jego identyfikatora (pamięć podręczna sprzed warstw). */
export function layerIdOf(e: CalEvent): string {
	if (e.calendarId) return e.calendarId;
	const g = e.id.match(/^g:(.+):([^:]+)$/);
	if (g) return `google:${g[1]}`;
	if (e.id.startsWith('birthday:')) return 'birthdays';
	if (e.id.startsWith('waste-') || e.id.startsWith('putout-')) return 'waste';
	if (e.id.startsWith('ferien-')) return 'ferien';
	return LOCAL;
}

// --- widoczność ---

const HIDDEN_TODAY = 'calendarHiddenToday';
const LOCK = 'calendarLock';
const PHONE_HIDDEN = 'calendarPhoneHidden';

/** Kalendarze ukryte na kiosku „do północy” (lista ważna tylko w dniu, w którym ją ustawiono). */
export function hiddenToday(db: DB, today: string): Set<string> {
	const v = getKv<{ date: string; ids: string[] } | null>(db, HIDDEN_TODAY, null);
	return new Set(v?.date === today ? v.ids : []);
}

export function setHiddenToday(db: DB, id: string, hidden: boolean, today: string) {
	if (!resolveLayers(db).some((l) => l.id === id)) throw new InputError(t('cal.err.unknown'));
	const ids = hiddenToday(db, today);
	if (hidden) ids.add(id);
	else ids.delete(id);
	setKv(db, HIDDEN_TODAY, ids.size ? { date: today, ids: [...ids] } : null);
}

/** Pokaż wszystkie ukryte na dziś (przycisk na kiosku). */
export const showAllToday = (db: DB) => setKv(db, HIDDEN_TODAY, null);

export const layersLocked = (db: DB) => getKv<boolean>(db, LOCK, false) === true;
export const setLayersLocked = (db: DB, v: boolean) => setKv(db, LOCK, v ? true : null);

/** Ukryte na telefonie danego domownika (zapis per osoba – każdy ma swój widok). */
export function phoneHidden(db: DB, memberId: string | null): string[] {
	if (!memberId) return [];
	return getKv<Record<string, string[]>>(db, PHONE_HIDDEN, {})[memberId] ?? [];
}

export function setPhoneHidden(db: DB, memberId: string, ids: string[]) {
	if (!db.select().from(members).where(eq(members.id, memberId)).get()) throw new InputError(t('err.member'));
	const known = new Set(resolveLayers(db).map((l) => l.id));
	const all = getKv<Record<string, string[]>>(db, PHONE_HIDDEN, {});
	setKv(db, PHONE_HIDDEN, { ...all, [memberId]: [...new Set(ids.filter((id) => known.has(id)))] });
}

/** Czy warstwa jest widoczna na danym ekranie (panel na stałe + kiosk do północy). */
export function visibleOn(layer: Pick<Layer, 'id' | 'showKiosk' | 'showPhone'>, surface: Surface, hidden: ReadonlySet<string> = new Set()): boolean {
	if (surface === 'phone') return layer.showPhone && !hidden.has(layer.id);
	return layer.showKiosk && !hidden.has(layer.id);
}

/**
 * Wydarzenia po filtrze warstw: ukryte znikają, reszta dostaje kalendarz, jego kolor i ikonę, a bez
 * własnej osoby – domownika kalendarza. Wydarzenie z nieznanej warstwy zostaje (nic nie ginie po cichu).
 */
export function applyLayers(events: CalEvent[], layers: Layer[], surface: Surface, hidden: ReadonlySet<string> = new Set()): CalEvent[] {
	const byId = new Map(layers.map((l) => [l.id, l]));
	const out: CalEvent[] = [];
	for (const e of events) {
		const id = layerIdOf(e);
		const l = byId.get(id);
		if (!l) {
			out.push({ ...e, calendarId: id });
			continue;
		}
		if (!visibleOn(l, surface, hidden)) continue;
		const ev: CalEvent = { ...e, calendarId: id, icon: l.icon };
		if (l.color && e.kind !== 'waste') ev.color = l.color;
		if (!ev.memberId && l.memberId) ev.memberId = l.memberId;
		out.push(ev);
	}
	return out;
}

/** Kolor do legendy: własny, osoby kalendarza albo null (akcent motywu). */
export function swatchOf(l: Layer, list: Pick<Member, 'id' | 'color'>[]): string | null {
	return l.color ?? list.find((m) => m.id === l.memberId)?.color ?? null;
}

export const chipOf = (l: Layer, list: Pick<Member, 'id' | 'color'>[], hidden: ReadonlySet<string>): LayerChip => ({
	id: l.id,
	kind: l.kind,
	name: l.name,
	swatch: swatchOf(l, list),
	icon: l.icon,
	memberId: l.memberId,
	hiddenToday: hidden.has(l.id)
});

/** Kalendarze na kiosku: te, które panel pokazuje na kiosku, z flagą „ukryty do północy”. */
export function kioskLayers(db: DB, layers: Layer[], hidden: ReadonlySet<string>, list: Pick<Member, 'id' | 'color'>[]): KioskLayers {
	return {
		list: layers.filter((l) => l.showKiosk).map((l) => chipOf(l, list, hidden)),
		locked: layersLocked(db),
		hiddenInPanel: layers.filter((l) => !l.showKiosk).length
	};
}

// --- zmiany z panelu ---

const COLOR = /^#[0-9a-f]{6}$/i;
const nowIso = () => new Date().toISOString();

function rowOf(db: DB, id: string): Row | undefined {
	return db.select().from(calendars).where(eq(calendars.id, id)).get();
}

/** Zapis ustawień warstwy (tworzy wiersz zmian, gdy go nie było). */
export function upsertLayer(db: DB, layer: Layer, patch: Partial<Omit<Row, 'id' | 'kind' | 'createdAt'>>) {
	const cur = rowOf(db, layer.id);
	if (cur) db.update(calendars).set(patch).where(eq(calendars.id, layer.id)).run();
	else db.insert(calendars).values({ id: layer.id, kind: layer.kind, createdAt: nowIso(), ...patch }).run();
}

export function findLayer(db: DB, id: string): Layer {
	const l = resolveLayers(db).find((x) => x.id === id);
	if (!l) throw new InputError(t('cal.err.unknown'));
	return l;
}

export function layerName(v: string, required: boolean): string {
	const name = v.trim();
	if (required && !name) throw new InputError(t('err.required', { label: t('cal.field.name') }));
	if (name.length > 60) throw new InputError(t('err.tooLong', { label: t('cal.field.name') }));
	return name;
}

export function layerColor(v: string): string | null {
	if (!v || v === 'auto') return null;
	if (!COLOR.test(v)) throw new InputError(t('err.color'));
	return v.toLowerCase();
}

export function layerIcon(v: string): string {
	const icon = v.trim();
	// Jedno emoji (albo nic) – grafem może mieć kilka znaków (np. ✈️, 👨‍👩‍👧).
	if ([...new Intl.Segmenter().segment(icon)].length > 1 || icon.length > 16) throw new InputError(t('cal.err.icon'));
	return icon;
}

export function layerMember(db: DB, v: string): string | null {
	if (!v) return null;
	if (!db.select().from(members).where(eq(members.id, v)).get()) throw new InputError(t('err.member'));
	return v;
}

export function refreshMinutes(v: string): number {
	const n = Number(v || DEFAULT_REFRESH);
	if (!(REFRESH_CHOICES as readonly number[]).includes(n)) throw new InputError(t('cal.err.refresh'));
	return n;
}

/** Kolejny kolor z palety, którego nie ma jeszcze żaden kalendarz. */
export function nextColor(db: DB): string {
	const used = new Set(resolveLayers(db).map((l) => l.color));
	return LAYER_PALETTE.find((c) => !used.has(c)) ?? LAYER_PALETTE[resolveLayers(db).length % LAYER_PALETTE.length];
}

/** Kolejność dla nowego kalendarza: po wszystkich, gdy kolejność była już zmieniana; inaczej domyślna. */
function nextOrder(db: DB): number | null {
	const explicit = db
		.select()
		.from(calendars)
		.all()
		.map((r) => r.sortOrder)
		.filter((n): n is number => n !== null);
	return explicit.length ? Math.max(...explicit) + 1 : null;
}

/** Przesunięcie w górę / w dół – zapisuje kolejność wszystkich warstw (od tej chwili jawną). */
export function moveLayer(db: DB, id: string, dir: 'up' | 'down') {
	const list = resolveLayers(db);
	const i = list.findIndex((l) => l.id === id);
	const j = i + (dir === 'up' ? -1 : 1);
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	list.forEach((l, k) => upsertLayer(db, l, { sortOrder: k }));
}

/** Nowa subskrypcja (adres już sprawdzony pobraniem). */
export function createSubscription(db: DB, v: { name: string; url: string; color: string | null; icon: string; memberId: string | null; refreshMinutes: number }): string {
	const id = `ical:${randomUUID()}`;
	db.insert(calendars)
		.values({ id, kind: 'ical', name: v.name, url: v.url, color: v.color ?? nextColor(db), icon: v.icon, memberId: v.memberId, refreshMinutes: v.refreshMinutes, sortOrder: nextOrder(db), createdAt: nowIso() })
		.run();
	return id;
}

/** Nowy lokalny kalendarz (np. na import pliku .ics). */
export function createLocalCalendar(db: DB, v: { name: string; color: string | null; icon: string; memberId: string | null }): string {
	const id = `local:${randomUUID()}`;
	db.insert(calendars)
		.values({ id, kind: 'local', name: v.name, color: v.color ?? nextColor(db), icon: v.icon, memberId: v.memberId, sortOrder: nextOrder(db), createdAt: nowIso() })
		.run();
	return id;
}

/** Usunięcie subskrypcji albo kalendarza z importu (razem z jego wydarzeniami). */
export function deleteLayer(db: DB, id: string) {
	const l = findLayer(db, id);
	if (!l.removable) throw new InputError(t('cal.err.notRemovable'));
	db.transaction((tx) => {
		if (l.kind === 'local') tx.delete(localEvents).where(eq(localEvents.calendarId, id)).run();
		tx.delete(sourceCache).where(eq(sourceCache.source, id)).run();
		tx.delete(calendars).where(eq(calendars.id, id)).run();
	});
}

/** Subskrypcje do pętli synchronizacji. */
export function subscriptions(db: DB): { id: string; url: string; refreshMinutes: number }[] {
	return db
		.select()
		.from(calendars)
		.where(eq(calendars.kind, 'ical'))
		.all()
		.filter((r) => !!r.url)
		.map((r) => ({ id: r.id, url: r.url!, refreshMinutes: r.refreshMinutes ?? DEFAULT_REFRESH }));
}

/** Lokalne kalendarze (cel importu): domyślny i z importów. */
export function localCalendars(db: DB): { id: string; name: string }[] {
	return resolveLayers(db)
		.filter((l) => l.kind === 'local')
		.map((l) => ({ id: l.id, name: l.name }));
}

/** Liczba wydarzeń w lokalnych kalendarzach (panel). */
export function localCounts(db: DB, ids: string[]): Record<string, number> {
	if (!ids.length) return {};
	const out: Record<string, number> = {};
	for (const r of db.select({ c: localEvents.calendarId }).from(localEvents).where(inArray(localEvents.calendarId, ids)).all()) out[r.c] = (out[r.c] ?? 0) + 1;
	return out;
}

