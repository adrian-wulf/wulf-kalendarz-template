import { asc, eq } from 'drizzle-orm';
import type { DB } from './db/index.js';
import { choreCompletions, chores, localEvents, localNotes, localShopping, members, type Recurrence } from './db/schema.js';
import { InputError } from './store.js';
import { getSetting, refreshNow, setSetting, wasteRules } from './sync.js';
import { pickupsFromIcal } from './sources/index.js';
import { deleteById, getClient, getRoles, GoogleError, insertNote, isConnected, NO_ROLES, setClient, setRoles, updateNote, type GoogleRoles } from './google.js';
import { bringLists, bringLogin, setBringConfig } from './bring.js';
import { clashesWithBins, colorDistance } from '#lib/colors.js';
import { isValidTimeZone, localTime } from '#lib/logic/dates.js';
import { binColors, bins, compileMatch, WASTE_PRESETS, type WasteRule } from '#lib/logic/waste.js';
import { isCountry, SUBDIVISIONS } from '#lib/region.js';
import { t } from '#lib/i18n/index.js';
import { profileFields } from './profiles.js';
import { removeByUrl } from './media.js';

/** Operacje panelu administracyjnego (pełna edycja). Wejście: FormData z formularzy. */

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const COLOR = /^#[0-9a-f]{6}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function need(f: FormData, k: string, label: string, max = 120) {
	const v = str(f, k);
	if (!v) throw new InputError(t('err.required', { label }));
	if (v.length > max) throw new InputError(t('err.tooLong', { label }));
	return v;
}

function color(db: DB, f: FormData) {
	const c = str(f, 'color');
	if (!COLOR.test(c)) throw new InputError(t('err.color'));
	if (clashesWithBins(c, binColors(wasteRules(db)))) throw new InputError(t('err.colorBin'));
	return c.toLowerCase();
}

const optMember = (f: FormData) => str(f, 'memberId') || null;

export function listMembers(db: DB) {
	return db.select().from(members).orderBy(asc(members.sortOrder)).all();
}

export function saveMember(db: DB, f: FormData) {
	const id = str(f, 'id');
	const values = {
		name: need(f, 'name', t('field.name'), 30),
		color: color(db, f),
		calendarIds: str(f, 'calendarIds').split(/[\s,]+/).filter(Boolean),
		emails: str(f, 'emails').split(/[\s,]+/).filter(Boolean),
		...profileFields(f)
	};
	if (id) {
		db.update(members).set(values).where(eq(members.id, id)).run();
	} else {
		const taken = listMembers(db).length;
		db.insert(members).values({ id: newMemberId(db, values.name), ...values, sortOrder: taken }).run();
	}
}

/** Identyfikator nowej osoby z imienia (bez znaków diakrytycznych), unikalny w bazie. */
export function newMemberId(db: DB, name: string) {
	const slug =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/\p{M}/gu, '')
			.replace(/[^a-z0-9]+/g, '-') || 'osoba';
	const taken = new Set(listMembers(db).map((m) => m.id));
	let id = slug;
	for (let i = 2; taken.has(id); i++) id = `${slug}-${i}`;
	return id;
}

export function moveMember(db: DB, f: FormData) {
	const list = listMembers(db);
	const i = list.findIndex((m) => m.id === str(f, 'id'));
	const j = i + (str(f, 'dir') === 'up' ? -1 : 1);
	if (i < 0 || j < 0 || j >= list.length) return;
	[list[i], list[j]] = [list[j], list[i]];
	list.forEach((m, k) => db.update(members).set({ sortOrder: k }).where(eq(members.id, m.id)).run());
}

export function deleteMember(db: DB, f: FormData) {
	const id = str(f, 'id');
	removeByUrl(db.select().from(members).where(eq(members.id, id)).get()?.avatar);
	db.delete(members).where(eq(members.id, id)).run();
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function recurrence(f: FormData): Recurrence {
	const type = str(f, 'type');
	if (type === 'once') {
		const date = str(f, 'date');
		if (!DATE.test(date)) throw new InputError(t('err.date'));
		return { type, date };
	}
	if (type === 'daily') return { type };
	if (type === 'weekly') {
		const days = f
			.getAll('days')
			.map(Number)
			.filter((d) => WEEKDAYS.includes(d));
		if (!days.length) throw new InputError(t('err.weekday'));
		return { type, days };
	}
	if (type === 'monthly') {
		const day = Number(str(f, 'monthDay'));
		if (!(day >= 1 && day <= 31)) throw new InputError(t('err.monthDay'));
		return { type, day };
	}
	throw new InputError(t('err.repeat'));
}

export function listChores(db: DB) {
	return db.select().from(chores).where(eq(chores.archived, false)).all();
}

export function saveChore(db: DB, f: FormData, today: string) {
	const id = Number(str(f, 'id'));
	const r = recurrence(f);
	const values = { title: need(f, 'title', 'zadanie', 80), memberId: optMember(f), recurrence: r };
	if (id) db.update(chores).set(values).where(eq(chores.id, id)).run();
	else db.insert(chores).values({ ...values, startDate: r.type === 'once' ? r.date : today }).run();
}

export function deleteChore(db: DB, f: FormData) {
	const id = Number(str(f, 'id'));
	db.delete(choreCompletions).where(eq(choreCompletions.choreId, id)).run();
	db.delete(chores).where(eq(chores.id, id)).run();
}

export function listEvents(db: DB, today: string) {
	return db
		.select()
		.from(localEvents)
		.orderBy(asc(localEvents.start))
		.all()
		.filter((e) => e.end.slice(0, 10) >= today);
}

export function saveEvent(db: DB, f: FormData) {
	const date = str(f, 'date');
	if (!DATE.test(date)) throw new InputError(t('err.date'));
	const time = str(f, 'time');
	let start = date;
	let end = date;
	let allDay = true;
	if (time) {
		if (!TIME.test(time)) throw new InputError(t('err.time'));
		const [h, m] = time.split(':').map(Number);
		const s = localTime(date, h, m);
		const mins = Math.max(15, Number(str(f, 'minutes')) || 60);
		start = s.toISOString();
		end = new Date(s.getTime() + mins * 60_000).toISOString();
		allDay = false;
	} else {
		const d = new Date(date + 'T00:00:00Z');
		d.setUTCDate(d.getUTCDate() + 1);
		end = d.toISOString().slice(0, 10);
	}
	const values = { title: need(f, 'title', t('field.title')), memberId: optMember(f), start, end, allDay };
	const id = str(f, 'id');
	if (id) db.update(localEvents).set(values).where(eq(localEvents.id, id)).run();
	else db.insert(localEvents).values({ id: crypto.randomUUID(), ...values }).run();
}

export function deleteEvent(db: DB, f: FormData) {
	db.delete(localEvents).where(eq(localEvents.id, str(f, 'id'))).run();
}

/** Kartki: z kalendarza Google „Kartki” (gdy podłączony), inaczej lokalne. */
export async function saveNote(db: DB, f: FormData, now = new Date()) {
	const until = str(f, 'until'); // datetime-local w strefie z ustawień regionu
	const m = until.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
	if (!m) throw new InputError(t('err.expiry'));
	const values = {
		text: need(f, 'text', t('field.text'), 200),
		memberId: optMember(f),
		expiresAt: localTime(m[1], Number(m[2]), Number(m[3])).toISOString()
	};
	const id = str(f, 'id');
	await viaGoogle(async () => {
		if (id.startsWith('g:')) await updateNote(db, id, values);
		else if (!id && isConnected(db) && getRoles(db).notes) await insertNote(db, values, now);
		else if (id) return void db.update(localNotes).set(values).where(eq(localNotes.id, id)).run();
		else return void db.insert(localNotes).values({ id: crypto.randomUUID(), ...values }).run();
		await refreshNow(db, 'google');
	});
}

export async function deleteNote(db: DB, f: FormData) {
	const id = str(f, 'id');
	if (!id.startsWith('g:')) return void db.delete(localNotes).where(eq(localNotes.id, id)).run();
	await viaGoogle(async () => {
		await deleteById(db, id);
		await refreshNow(db, 'google');
	});
}

/** Błąd Google pokazujemy w formularzu jak zwykły błąd walidacji. */
async function viaGoogle(fn: () => Promise<void>) {
	try {
		await fn();
	} catch (e) {
		if (e instanceof GoogleError) throw new InputError(e.message);
		throw e;
	}
}

export function listShopping(db: DB) {
	return db.select().from(localShopping).orderBy(asc(localShopping.addedAt)).all();
}

export function deleteShopping(db: DB, f: FormData) {
	db.delete(localShopping).where(eq(localShopping.id, str(f, 'id'))).run();
}

export function saveGoogleClient(db: DB, f: FormData) {
	const id = need(f, 'clientId', 'identyfikator klienta', 200);
	const secret = str(f, 'clientSecret') || getClient(db)?.secret;
	if (!id.endsWith('.apps.googleusercontent.com')) throw new InputError(t('err.googleClientId'));
	if (!secret) throw new InputError(t('err.required', { label: t('field.secret') }));
	setClient(db, { id, secret });
}

/** Przypisanie ról kalendarzom konta rodzinnego: pola `cal:<id>` = family|notes|kita|birthdays|member:<id>|''. */
export function saveGoogleCalendars(db: DB, f: FormData) {
	const roles: GoogleRoles = { ...NO_ROLES };
	const byMember = new Map<string, string[]>();
	for (const [k, v] of f.entries()) {
		if (!k.startsWith('cal:') || typeof v !== 'string' || !v) continue;
		const cal = k.slice(4);
		if (v === 'family' || v === 'notes' || v === 'kita' || v === 'birthdays') {
			if (roles[v]) throw new InputError(t('err.roleOnce'));
			roles[v] = cal;
		} else if (v.startsWith('member:')) {
			const id = v.slice(7);
			byMember.set(id, [...(byMember.get(id) ?? []), cal]);
		}
	}
	setRoles(db, roles);
	for (const m of listMembers(db)) db.update(members).set({ calendarIds: byMember.get(m.id) ?? [] }).where(eq(members.id, m.id)).run();
}

export async function connectBring(db: DB, f: FormData) {
	const email = need(f, 'email', 'e-mail', 120);
	const password = str(f, 'password');
	if (!password) throw new InputError(t('err.required', { label: t('field.password') }));
	try {
		await bringLogin(db, email, password);
	} catch (e) {
		throw new InputError(e instanceof Error ? e.message : t('err.bringLogin'));
	}
}

export async function chooseBringList(db: DB, f: FormData) {
	const listUuid = need(f, 'listUuid', 'lista');
	const list = (await bringLists(db)).find((l) => l.listUuid === listUuid);
	if (!list) throw new InputError('Nie ma takiej listy');
	setBringConfig(db, { listUuid, listName: list.name });
}

const MAX_ICS = 512 * 1024;

/** Wgranie pliku .ics z terminami wywozu (np. eksport Abfuhrkalender dla ulicy). */
export async function uploadWasteIcs(db: DB, f: FormData, now = new Date()) {
	const file = f.get('file');
	if (!(file instanceof File) || !file.size) throw new InputError('Wybierz plik .ics');
	if (file.size > MAX_ICS) throw new InputError(t('err.fileTooBig'));
	const text = await file.text();
	if (!text.includes('BEGIN:VCALENDAR')) throw new InputError('To nie jest plik kalendarza (.ics)');
	if (!pickupsFromIcal(text, wasteRules(db)).length) throw new InputError(t('err.noPickups'));
	setSetting(db, 'wasteIcs', { name: file.name, text, uploadedAt: now.toISOString() });
}

export function removeWasteIcs(db: DB) {
	setSetting(db, 'wasteIcs', null);
}

const BIN_ID = /^[a-z0-9-]{1,30}$/;

/** Domownicy, których kolor jest zbyt podobny do koloru któregoś pojemnika. */
export function binClashes(db: DB, rules: readonly WasteRule[] = wasteRules(db)) {
	return listMembers(db).flatMap((m) => {
		const r = rules.find((x) => colorDistance(m.color, x.color) < 60);
		return r ? [{ member: m.name, bin: r.label }] : [];
	});
}

/**
 * Tabela reguł z panelu: pola `match`, `bin`, `label`, `color` powtórzone dla każdego wiersza.
 * Wiersz bez dopasowania jest pomijany (tak się usuwa regułę), pusty `bin` powstaje z etykiety.
 */
export function saveWasteRules(db: DB, f: FormData) {
	const [match, bin, label, colors] = (['match', 'bin', 'label', 'color'] as const).map((k) => f.getAll(k).map((v) => String(v).trim()));
	const rules: WasteRule[] = [];
	match.forEach((m, i) => {
		if (!m) return;
		const l = label[i] ?? '';
		if (!l) throw new InputError(t('err.rule.label', { rule: m }));
		if (l.length > 40 || m.length > 200) throw new InputError(t('err.rule.long', { rule: m }));
		try {
			compileMatch(m);
		} catch {
			throw new InputError(t('err.rule.regex', { rule: m }));
		}
		const id =
			bin[i] ||
			l
				.toLowerCase()
				.normalize('NFD')
				.replace(/\p{M}/gu, '')
				.replace(/ł/g, 'l')
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-|-$/g, '');
		if (!BIN_ID.test(id)) throw new InputError(t('err.rule.id', { rule: m }));
		const c = (colors[i] ?? '').toLowerCase();
		if (!COLOR.test(c)) throw new InputError(t('err.rule.color', { rule: m }));
		rules.push({ match: m, bin: id, label: l, color: c });
	});
	if (!rules.length) throw new InputError(t('err.rule.none'));
	const clash = binClashes(db, rules)[0];
	if (clash) throw new InputError(t('err.binClash', { bin: clash.bin, member: clash.member }));
	setSetting(db, 'wasteRules', rules);
}

/** Gotowy zestaw reguł PL albo DE (zastępuje obecne reguły). */
export function loadWastePreset(db: DB, f: FormData) {
	const c = str(f, 'preset');
	if (!isCountry(c)) throw new InputError('Nie ma takiego zestawu');
	setSetting(db, 'wasteRules', WASTE_PRESETS[c].map((r) => ({ ...r })));
}

/** Ręczny termin wywozu (gdy gmina nie publikuje kalendarza iCal). */
export function addManualPickup(db: DB, f: FormData) {
	const date = str(f, 'date');
	if (!DATE.test(date)) throw new InputError(t('err.date'));
	const bin = str(f, 'bin');
	if (!bins(wasteRules(db)).some((r) => r.bin === bin)) throw new InputError('Wybierz pojemnik');
	const list = getSetting(db, 'wasteManual').filter((p) => !(p.date === date && p.bin === bin));
	setSetting(db, 'wasteManual', [...list, { date, bin }].sort((a, b) => a.date.localeCompare(b.date)));
}

export function deleteManualPickup(db: DB, f: FormData) {
	const date = str(f, 'date');
	const bin = str(f, 'bin');
	setSetting(db, 'wasteManual', getSetting(db, 'wasteManual').filter((p) => !(p.date === date && p.bin === bin)));
}

/** Region: kraj, land / województwo, strefa czasowa. */
export function saveRegion(db: DB, f: FormData) {
	const country = str(f, 'country');
	if (!isCountry(country)) throw new InputError(t('setup.err.country'));
	const subdivision = str(f, 'subdivision');
	if (!SUBDIVISIONS[country].some((s) => s.code === subdivision))
		throw new InputError(country === 'PL' ? t('setup.err.voivodeship') : t('setup.err.land'));
	const timezone = str(f, 'timezone');
	if (!isValidTimeZone(timezone)) throw new InputError(t('err.timezone'));
	setSetting(db, 'region', { country, subdivision, timezone });
}

export function saveSettings(db: DB, f: FormData) {
	const lat = Number(str(f, 'lat'));
	const lon = Number(str(f, 'lon'));
	if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new InputError(t('err.coords'));
	// Adres kalendarza śmieci jest teraz w sekcji Śmieci (26b) – bez pola w formularzu zostaje bez zmian.
	const wasteUrl = f.has('wasteIcalUrl') ? str(f, 'wasteIcalUrl') : (getSetting(db, 'wasteIcalUrl') ?? '');
	if (wasteUrl && !/^https?:\/\//.test(wasteUrl)) throw new InputError(t('err.wasteUrl'));
	// Nazwa miejscowości (z kreatora) zostaje, dopóki współrzędne się nie zmienią.
	const prev = getSetting(db, 'location');
	setSetting(db, 'location', prev.name && prev.lat === lat && prev.lon === lon ? { lat, lon, name: prev.name } : { lat, lon });
	setSetting(db, 'wasteIcalUrl', wasteUrl || null);
}
